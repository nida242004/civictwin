/**
 * Pedestrian navigation graph + A* pathfinding.
 *
 * Nodes represent intersections, polyline vertices, subdivision points on
 * long segments, and connector points (building entrances / facility access
 * points). Edges carry walkable length and a cost multiplier (roads cost
 * slightly more for pedestrians than dedicated paths).
 *
 * Road polylines are split at intersections with other roads so crossings
 * become shared nodes — otherwise crossing edges would not connect.
 *
 * The graph is built from the world model and is fully deterministic.
 */

import type { RoadCategory, Vec2, World } from "./types";
import { dist } from "./ids";

export interface NavNode {
  id: number;
  x: number;
  z: number;
  /** true when the node is a building entrance / facility access connector. */
  connector: boolean;
  refId: string | null; // building/facility id for connectors
  edges: NavEdge[];
}

export interface NavEdge {
  to: number;
  length: number;
  /** road segments carry a small pedestrian penalty */
  cost: number;
  roadId: string;
}

export interface NavGraph {
  nodes: NavNode[];
  /** spatial hash for nearest-node queries */
  cellSize: number;
  cells: Map<string, number[]>;
  stats: { nodeCount: number; edgeCount: number; componentCount: number; largestComponent: number; largestSize?: number };
}

const ROAD_PED_COST = 1.15;
const CONNECTOR_MAX_DIST = 30;
const MAX_EDGE_LEN = 26; // subdivide longer edges for realistic paths & dense routing

function key(x: number, z: number, cell: number): string {
  return `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
}

function addNode(g: DraftGraph, x: number, z: number, connector = false, refId: string | null = null): number {
  // dedupe by proximity (0.4m) so shared intersections merge
  if (!connector) {
    for (const n of g.nodes) {
      if (n.connector) continue;
      if (Math.abs(n.x - x) < 0.4 && Math.abs(n.z - z) < 0.4) {
        return n.id;
      }
    }
  }
  const id = g.nodes.length;
  g.nodes.push({ id, x, z, connector, refId, edges: [] });
  return id;
}

function connect(g: DraftGraph, a: number, b: number, roadId: string, cost = 1) {
  if (a === b) return;
  const na = g.nodes[a];
  const nb = g.nodes[b];
  const len = dist(na.x, na.z, nb.x, nb.z);
  if (len < 0.05) return;
  if (!na.edges.some((e) => e.to === b && e.roadId === roadId)) {
    na.edges.push({ to: b, length: len, cost: len * cost, roadId });
  }
  if (!nb.edges.some((e) => e.to === a && e.roadId === roadId)) {
    nb.edges.push({ to: a, length: len, cost: len * cost, roadId });
  }
}

interface DraftGraph {
  nodes: NavNode[];
}

/* ------------------------------------------------------------------ */
/* Segment intersection (for splitting roads at crossings)             */
/* ------------------------------------------------------------------ */

interface Hit {
  t: number;
  x: number;
  z: number;
}

function segIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { ta: number; tb: number; x: number; z: number } | null {
  const d1x = p2.x - p1.x;
  const d1z = p2.z - p1.z;
  const d2x = p4.x - p3.x;
  const d2z = p4.z - p3.z;
  const denom = d1x * d2z - d1z * d2x;
  if (Math.abs(denom) < 1e-9) return null; // parallel / collinear
  const ta = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / denom;
  const tb = ((p3.x - p1.x) * d1z - (p3.z - p1.z) * d1x) / denom;
  if (ta < -1e-6 || ta > 1 + 1e-6 || tb < -1e-6 || tb > 1 + 1e-6) return null;
  return {
    ta: Math.min(1, Math.max(0, ta)),
    tb: Math.min(1, Math.max(0, tb)),
    x: p1.x + d1x * ta,
    z: p1.z + d1z * ta,
  };
}

/** Insert intersection points into each polyline, ordered along each segment. */
function enrichPolylines(lines: Vec2[][]): Vec2[][] {
  const hits = new Map<string, Hit[]>();
  for (let a = 0; a < lines.length; a++) {
    const la = lines[a];
    for (let i = 0; i + 1 < la.length; i++) {
      for (let b = a + 1; b < lines.length; b++) {
        const lb = lines[b];
        for (let j = 0; j + 1 < lb.length; j++) {
          const hit = segIntersect(la[i], la[i + 1], lb[j], lb[j + 1]);
          if (!hit) continue;
          const ka = `${a}:${i}`;
          const kb = `${b}:${j}`;
          if (!hits.has(ka)) hits.set(ka, []);
          if (!hits.has(kb)) hits.set(kb, []);
          hits.get(ka)!.push({ t: hit.ta, x: hit.x, z: hit.z });
          hits.get(kb)!.push({ t: hit.tb, x: hit.x, z: hit.z });
        }
      }
    }
  }
  return lines.map((pts, a) => {
    const out: Vec2[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      out.push(pts[i]);
      const hs = (hits.get(`${a}:${i}`) ?? []).sort((u, v) => u.t - v.t);
      let lastT = -1;
      for (const h of hs) {
        if (h.t - lastT < 1e-4) continue; // dedupe identical hits
        lastT = h.t;
        out.push({ x: h.x, z: h.z });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* Graph construction                                                  */
/* ------------------------------------------------------------------ */

export function buildNavGraph(world: World): NavGraph {
  const g: DraftGraph = { nodes: [] };
  const walkable = world.roads.filter((r) => r.pedestrian && r.points.length >= 2);
  const enriched = enrichPolylines(walkable.map((r) => r.points));

  walkable.forEach((road, idx) => {
    const pts = enriched[idx];
    const cost = road.category === "road" ? ROAD_PED_COST : 1;
    let prev: number | null = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const n = addNode(g, p.x, p.z);
      if (prev !== null) {
        linkWithSubdivision(g, prev, n, road.id, cost);
      }
      prev = n;
    }
  });

  const plain = g as unknown as NavGraph;

  // connector edges: building entrances + facility access points
  const connectPoint = (x: number, z: number, refId: string) => {
    const node = addNode(g, x, z, true, refId);
    const nearest = nearestNodeInternal(g, x, z);
    if (nearest !== null) {
      const nn = g.nodes[nearest];
      const d = dist(nn.x, nn.z, x, z);
      if (d <= CONNECTOR_MAX_DIST && d > 0.05) connect(g, node, nearest, `conn_${refId}`);
    }
  };

  for (const b of world.buildings) {
    const e = entranceOf(b);
    connectPoint(e.x, e.z, b.id);
  }
  for (const f of world.facilities) {
    connectPoint(f.x, f.z, f.id);
  }

  finalizeGraph(plain);
  return plain;
}

/** Connect two nodes, inserting intermediate nodes when the gap is long. */
function linkWithSubdivision(g: DraftGraph, from: number, to: number, roadId: string, cost: number) {
  const a = g.nodes[from];
  const b = g.nodes[to];
  const len = dist(a.x, a.z, b.x, b.z);
  if (len <= MAX_EDGE_LEN) {
    connect(g, from, to, roadId, cost);
    return;
  }
  const steps = Math.ceil(len / MAX_EDGE_LEN);
  let prev = from;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const n = addNode(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    connect(g, prev, n, roadId, cost);
    prev = n;
  }
  connect(g, prev, to, roadId, cost);
}

export function entranceOf(b: { x: number; z: number; width: number; depth: number; entrance?: Vec2 }): Vec2 {
  if (b.entrance) return b.entrance;
  // default: south edge midpoint (z + depth/2)
  return { x: b.x, z: b.z + b.depth / 2 };
}

function nearestNodeInternal(g: DraftGraph, x: number, z: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const n of g.nodes) {
    if (n.connector) continue;
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

function finalizeGraph(g: NavGraph) {
  // spatial hash over non-connector nodes for routing start/end queries
  g.cellSize = 10;
  g.cells = new Map();
  for (const n of g.nodes) {
    const k = key(n.x, n.z, g.cellSize);
    const arr = g.cells.get(k);
    if (arr) arr.push(n.id);
    else g.cells.set(k, [n.id]);
  }

  // connected components (over all nodes incl. connectors)
  const comp = new Array<number>(g.nodes.length).fill(-1);
  let c = 0;
  for (const n of g.nodes) {
    if (comp[n.id] !== -1) continue;
    const stack = [n.id];
    comp[n.id] = c;
    while (stack.length) {
      const cur = g.nodes[stack.pop()!];
      for (const e of cur.edges) {
        if (comp[e.to] === -1) {
          comp[e.to] = c;
          stack.push(e.to);
        }
      }
    }
    c += 1;
  }
  const sizes = new Array<number>(c).fill(0);
  for (const v of comp) sizes[v] += 1;
  let largest = 0;
  for (let i = 0; i < c; i++) if (sizes[i] > sizes[largest]) largest = i;
  g.stats = {
    nodeCount: g.nodes.length,
    edgeCount: g.nodes.reduce((s, n) => s + n.edges.length, 0) / 2,
    componentCount: c,
    largestComponent: largest,
    largestSize: sizes[largest] ?? 0,
  };
}

/** Nearest routable (non-connector) node to a point, searching the spatial hash. */
export function nearestRoutableNode(g: NavGraph, x: number, z: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  const cs = g.cellSize;
  const cx = Math.floor(x / cs);
  const cz = Math.floor(z / cs);
  for (let r = 0; r <= 8; r++) {
    for (let ix = cx - r; ix <= cx + r; ix++) {
      for (let iz = cz - r; iz <= cz + r; iz++) {
        // only scan the ring when r > 0 to avoid rescanning
        if (r > 0 && Math.abs(ix - cx) !== r && Math.abs(iz - cz) !== r) continue;
        const arr = g.cells.get(`${ix},${iz}`);
        if (!arr) continue;
        for (const id of arr) {
          const n = g.nodes[id];
          if (n.connector) continue;
          const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
      }
    }
    if (best !== null && bestD <= (r + 1) * cs * ((r + 1) * cs)) break;
  }
  return best;
}

/** Node id for a world object's connector (entrance / access point). */
export function connectorNodeFor(g: NavGraph, refId: string): number | null {
  for (const n of g.nodes) {
    if (n.connector && n.refId === refId) return n.id;
  }
  return null;
}

/**
 * Resolve a trip endpoint for a building/facility: prefer its own connector
 * (when it actually connects to the network), fall back to a nearby node.
 * Returns null when the object cannot reach the walkable network.
 */
export function resolveEndpoint(g: NavGraph, p: Vec2, refId: string): number | null {
  const conn = connectorNodeFor(g, refId);
  if (conn !== null && g.nodes[conn].edges.length > 0) return conn;
  const n = nearestRoutableNode(g, p.x, p.z);
  if (n === null) return null;
  const node = g.nodes[n];
  const d = dist(node.x, node.z, p.x, p.z);
  return d <= 45 ? n : null;
}

/* ------------------------------------------------------------------ */
/* A* pathfinding                                                      */
/* ------------------------------------------------------------------ */

export interface PathResult {
  /** Ordered node ids from start to goal (inclusive). */
  nodes: number[];
  cost: number;
}

/**
 * A* with an admissible Euclidean heuristic. Safe on disconnected graphs
 * (returns null when the goal is unreachable).
 */
export function findPath(g: NavGraph, start: number, goal: number): PathResult | null {
  if (start === goal) return { nodes: [start], cost: 0 };
  const n = g.nodes.length;
  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  const goalX = g.nodes[goal].x;
  const goalZ = g.nodes[goal].z;
  const h = (i: number) => dist(g.nodes[i].x, g.nodes[i].z, goalX, goalZ);

  // binary min-heap on fScore
  const heap: number[] = [];
  const heapF: number[] = [];
  const push = (node: number, f: number) => {
    heap.push(node);
    heapF.push(f);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const lastNode = heap.pop()!;
    const lastF = heapF.pop()!;
    if (heap.length) {
      heap[0] = lastNode;
      heapF[0] = lastF;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heapF[l] < heapF[m]) m = l;
        if (r < heap.length && heapF[r] < heapF[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        [heapF[m], heapF[i]] = [heapF[i], heapF[m]];
        i = m;
      }
    }
    return top;
  };

  gScore[start] = 0;
  fScore[start] = h(start);
  push(start, fScore[start]);

  while (heap.length) {
    const cur = pop();
    if (cur === goal) {
      const path: number[] = [goal];
      let c = goal;
      while (cameFrom[c] !== -1) {
        c = cameFrom[c];
        path.push(c);
      }
      path.reverse();
      return { nodes: path, cost: gScore[goal] };
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    for (const e of g.nodes[cur].edges) {
      if (closed[e.to]) continue;
      const tentative = gScore[cur] + e.cost;
      if (tentative < gScore[e.to]) {
        gScore[e.to] = tentative;
        cameFrom[e.to] = cur;
        fScore[e.to] = tentative + h(e.to);
        push(e.to, fScore[e.to]);
      }
    }
  }
  return null;
}

/** Expand a node path into positions with cumulative distance. */
export function pathPositions(g: NavGraph, nodePath: number[]): { pts: Vec2[]; length: number } {
  const pts: Vec2[] = [];
  let length = 0;
  let prev: Vec2 | null = null;
  for (const id of nodePath) {
    const n = g.nodes[id];
    const p = { x: n.x, z: n.z };
    if (prev) length += dist(prev.x, prev.z, p.x, p.z);
    pts.push(p);
    prev = p;
  }
  return { pts, length };
}

/** Pedestrian-walkable segments of the world (used for coverage sampling). */
export function walkableSegments(
  world: World
): { a: Vec2; b: Vec2; roadId: string; category: RoadCategory }[] {
  const segs: { a: Vec2; b: Vec2; roadId: string; category: RoadCategory }[] = [];
  for (const r of world.roads) {
    if (!r.pedestrian) continue;
    for (let i = 0; i + 1 < r.points.length; i++) {
      segs.push({ a: r.points[i], b: r.points[i + 1], roadId: r.id, category: r.category });
    }
  }
  return segs;
}

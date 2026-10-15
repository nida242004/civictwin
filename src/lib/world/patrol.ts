/**
 * Patrol-route helpers: snapping to the walkable network, A* legs between
 * waypoints (the same routing the simulation engine uses), route length and
 * an "auto patrol" generator.
 */

import type { PraesidiumProject, Vec2, World } from "./types";
import { buildNavGraph, entranceOf, findPath, nearestRoutableNode, pathPositions, type NavGraph } from "./graph";
import { computeCoverage } from "@/lib/sim/scenarios";

export const SNAP_DIST = 8;

const graphCache = new WeakMap<World, NavGraph>();

/** Navigation graph for a world (cached per world object). */
export function graphFor(world: World): NavGraph {
  let g = graphCache.get(world);
  if (!g) {
    g = buildNavGraph(world);
    graphCache.set(world, g);
  }
  return g;
}

/** Nearest point on any walkable road/path segment within maxDist, else the input point. */
export function snapToWalkable(world: World, p: Vec2, maxDist = SNAP_DIST): Vec2 {
  let best: Vec2 | null = null;
  let bd = maxDist * maxDist;
  for (const r of world.roads) {
    if (!r.pedestrian) continue;
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d <= bd) {
        bd = d;
        best = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
      }
    }
  }
  return best ?? { x: p.x, z: p.z };
}

/** Walking polyline from a to b along the pedestrian graph (straight line when unreachable). */
export function legBetween(g: NavGraph, a: Vec2, b: Vec2): Vec2[] {
  const na = nearestRoutableNode(g, a.x, a.z);
  const nb = nearestRoutableNode(g, b.x, b.z);
  let pts: Vec2[] = [];
  if (na !== null && nb !== null) {
    const res = findPath(g, na, nb);
    if (res) pts = pathPositions(g, res.nodes).pts;
  }
  if (pts.length < 1) return [{ x: a.x, z: a.z }, { x: b.x, z: b.z }];
  const out = [...pts];
  if (Math.hypot(out[0].x - a.x, out[0].z - a.z) > 0.5) out.unshift({ x: a.x, z: a.z });
  const last = out[out.length - 1];
  if (Math.hypot(last.x - b.x, last.z - b.z) > 0.5) out.push({ x: b.x, z: b.z });
  return out;
}

/** Legs of a looping patrol: leg i goes waypoint i -> i+1 (last -> first). */
export function routeLegs(world: World, wps: Vec2[], loop = true): Vec2[][] {
  if (wps.length < 2) return [];
  const g = graphFor(world);
  const n = loop ? wps.length : wps.length - 1;
  const legs: Vec2[][] = [];
  for (let i = 0; i < n; i++) legs.push(legBetween(g, wps[i], wps[(i + 1) % wps.length]));
  return legs;
}

export function polylineLength(pts: Vec2[]): number {
  let l = 0;
  for (let i = 0; i + 1 < pts.length; i++) l += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  return l;
}

export function routeLength(world: World, wps: Vec2[], loop = true): number {
  return routeLegs(world, wps, loop).reduce((s, l) => s + polylineLength(l), 0);
}

const copyPts = (pts: Vec2[]): Vec2[] => pts.map((p) => ({ x: p.x, z: p.z }));
const d2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Append `other` to `base`, joined through the nearest pair of ends (either end
 * of base to either end of other, reversing pieces as needed) so the combined
 * loop has no long jump between the two routes.
 */
export function appendRoutes(base: Vec2[], other: Vec2[]): Vec2[] {
  if (!base.length) return copyPts(other);
  if (!other.length) return copyPts(base);
  const bF = base[0];
  const bL = base[base.length - 1];
  const oF = other[0];
  const oL = other[other.length - 1];
  const opts = [
    { d: d2(bL, oF), r: () => [...base, ...other] },
    { d: d2(bL, oL), r: () => [...base, ...[...other].reverse()] },
    { d: d2(bF, oL), r: () => [...other, ...base] },
    { d: d2(bF, oF), r: () => [...[...other].reverse(), ...base] },
  ];
  opts.sort((a, b) => a.d - b.d);
  const merged = opts[0].r();
  const out: Vec2[] = [];
  for (const p of merged) {
    const last = out[out.length - 1];
    if (last && d2(last, p) < 1.5) continue; // coincident joint stop
    out.push({ x: p.x, z: p.z });
  }
  return out;
}

export const reverseRoute = (wps: Vec2[]): Vec2[] => copyPts([...wps].reverse());

/** Same loop, starting `k` stops later. */
export function rotateRoute(wps: Vec2[], k: number): Vec2[] {
  if (!wps.length) return [];
  const n = wps.length;
  const s = ((k % n) + n) % n;
  return copyPts([...wps.slice(s), ...wps.slice(0, s)]);
}

/** Start offset (in stops) that spreads a second guard half a loop away. */
export const halfLoopOffset = (wps: Vec2[]): number => Math.floor(wps.length / 2);

/**
 * Generate a sensible loop around `center`: stops at dark (unlit) walkable
 * samples and building entrances within `radius`, picked greedily so they are
 * spread out, then ordered by angle to form a loop. Falls back to a ring of
 * walkable samples when nothing dark is nearby.
 */
export function autoPatrol(project: PraesidiumProject, center: Vec2, radius = 120, maxStops = 6): Vec2[] {
  const world = project.world;
  const cand: { p: Vec2; w: number }[] = [];
  try {
    const cov = computeCoverage(world, project.scenario.ambientVisibility, project.scenario.cctvRangeScale);
    cov.samples.forEach((s, i) => {
      const c = cov.perSample[i];
      if (!c.lit && !c.cctv && Math.hypot(s.x - center.x, s.z - center.z) <= radius) cand.push({ p: { x: s.x, z: s.z }, w: 2 });
    });
    if (cand.length < 3) {
      cov.samples.forEach((s, i) => {
        if (!cov.perSample[i].lit && Math.hypot(s.x - center.x, s.z - center.z) <= radius) cand.push({ p: { x: s.x, z: s.z }, w: 1.5 });
      });
    }
  } catch {
    /* coverage is best-effort */
  }
  for (const b of world.buildings) {
    const e = entranceOf(b);
    if (Math.hypot(e.x - center.x, e.z - center.z) <= radius) cand.push({ p: snapToWalkable(world, e, 30), w: 1 });
  }
  if (cand.length < 3) {
    for (const r of world.roads) {
      if (!r.pedestrian) continue;
      for (const q of r.points) if (Math.hypot(q.x - center.x, q.z - center.z) <= radius) cand.push({ p: { x: q.x, z: q.z }, w: 1 });
    }
  }
  if (!cand.length) return [];

  // greedy farthest-point selection (weighted), starting from the candidate nearest the guard
  const chosen: Vec2[] = [];
  let first = cand[0];
  for (const c of cand) if (Math.hypot(c.p.x - center.x, c.p.z - center.z) < Math.hypot(first.p.x - center.x, first.p.z - center.z)) first = c;
  chosen.push(first.p);
  while (chosen.length < maxStops) {
    let best: { p: Vec2; score: number } | null = null;
    for (const c of cand) {
      const dmin = Math.min(...chosen.map((q) => Math.hypot(q.x - c.p.x, q.z - c.p.z)));
      if (dmin < 18) continue;
      const score = dmin * c.w;
      if (!best || score > best.score) best = { p: c.p, score };
    }
    if (!best) break;
    chosen.push(best.p);
  }
  if (chosen.length < 2) return chosen;
  // order by angle around the centroid so the loop does not criss-cross
  const cx = chosen.reduce((s, p) => s + p.x, 0) / chosen.length;
  const cz = chosen.reduce((s, p) => s + p.z, 0) / chosen.length;
  const ordered = chosen
    .map((p) => ({ p, a: Math.atan2(p.z - cz, p.x - cx) }))
    .sort((u, v) => u.a - v.a)
    .map((o) => ({ x: Math.round(o.p.x * 10) / 10, z: Math.round(o.p.z * 10) / 10 }));
  return ordered;
}

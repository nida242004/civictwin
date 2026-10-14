/**
 * Praesidium deterministic simulation engine.
 *
 * Pure TypeScript, no DOM access. Fixed 1-second timestep. All randomness
 * comes from a seeded PRNG consumed in a fixed order, so identical world +
 * scenario + seed + engine version produce identical results.
 *
 * All events are FICTIONAL scenario events used for planning exercises.
 * They do not represent, predict, or infer actual crimes or the behavior
 * of any real person.
 */

import type { Guard, ScenarioConfig, StoredRunEvent, World } from "../world/types";
import { ENGINE_VERSION } from "../world/types";
import {
  buildNavGraph,
  findPath,
  nearestRoutableNode,
  pathPositions,
  resolveEndpoint,
  walkableSegments,
  type NavGraph,
} from "../world/graph";
import { dist } from "../world/ids";
import { makeRng, type Rng } from "./rng";
import { applyOutages, computeCoverage, type CoverageResult } from "./scenarios";

export const AGENT_STATE = { WAITING: 0, WALKING: 1, ARRIVED: 2, CANCELLED: 3 } as const;
export const GUARD_STATE = { PATROLLING: 0, RESPONDING: 1, ON_SCENE: 2, RETURNING: 3, UNAVAILABLE: 4 } as const;

export const EVENT_TYPES = [
  { type: "suspicious_activity", weight: 0.3, severityWeights: [0.6, 0.3, 0.1] },
  { type: "nuisance", weight: 0.22, severityWeights: [0.75, 0.2, 0.05] },
  { type: "vandalism", weight: 0.16, severityWeights: [0.55, 0.35, 0.1] },
  { type: "altercation", weight: 0.16, severityWeights: [0.35, 0.45, 0.2] },
  { type: "medical_assistance", weight: 0.16, severityWeights: [0.5, 0.35, 0.15] },
] as const;

export interface Frame {
  t: number;
  agentPos: Float32Array; // interleaved x,z
  agentState: Uint8Array;
  agentCat: Uint8Array; // 0 = resident, 1 = commuter
  agentStarted: Uint8Array; // 1 once the agent's trip has started
  guardPos: Float32Array;
  guardState: Uint8Array;
}

export interface TripRecord {
  reachable: boolean;
  lengthM: number;
  completed: boolean;
}

export interface SimulationResult {
  engineVersion: string;
  seed: number;
  durationSec: number;
  frames: Frame[];
  events: StoredRunEvent[];
  trips: TripRecord[];
  guardCount: number;
  unreachableDestinations: string[];
}

/* ------------------------------------------------------------------ */
/* Runtime structures                                                  */
/* ------------------------------------------------------------------ */

interface WalkRef {
  segIdx: number;
  segT: number;
}

/** Advance `d` meters along a polyline, mutating the segment reference. */
function advanceAlong(
  path: { x: number; z: number }[],
  ref: WalkRef,
  d: number
): { finished: boolean; x: number; z: number } {
  if (path.length === 0) return { finished: true, x: 0, z: 0 };
  if (path.length === 1) return { finished: true, x: path[0].x, z: path[0].z };
  let i = ref.segIdx;
  let t = ref.segT;
  if (i >= path.length - 1) {
    const last = path[path.length - 1];
    return { finished: true, x: last.x, z: last.z };
  }
  while (d > 0 && i < path.length - 1) {
    const a = path[i];
    const b = path[i + 1];
    const len = dist(a.x, a.z, b.x, b.z);
    const remain = len - t;
    if (d < remain) {
      t += d;
      d = 0;
    } else {
      d -= remain;
      i += 1;
      t = 0;
    }
  }
  if (i >= path.length - 1) {
    ref.segIdx = path.length - 2;
    ref.segT = 0;
    const last = path[path.length - 1];
    return { finished: true, x: last.x, z: last.z };
  }
  ref.segIdx = i;
  ref.segT = t;
  const a = path[i];
  const b = path[i + 1];
  const len = Math.max(dist(a.x, a.z, b.x, b.z), 1e-6);
  const tt = Math.min(t / len, 1);
  return { finished: false, x: a.x + (b.x - a.x) * tt, z: a.z + (b.z - a.z) * tt };
}

function positionOf(path: { x: number; z: number }[], ref: WalkRef): { x: number; z: number } {
  if (!path.length) return { x: 0, z: 0 };
  if (path.length === 1) return { x: path[0].x, z: path[0].z };
  const r = advanceAlong(path, ref, 0);
  return { x: r.x, z: r.z };
}

interface AgentRT {
  category: "resident" | "commuter";
  speed: number;
  spawnAt: number;
  state: number;
  phase: "out" | "back";
  path: { x: number; z: number }[];
  segIdx: number;
  segT: number;
  routeLength: number;
  reachable: boolean;
  tripStarted: boolean;
  returnAt: number; // >= 0 → scheduled return trip; -1 → none/undecided
  retPath: { x: number; z: number }[];
  retLength: number;
  returnTripRecord: number;
  originRef: string;
  destRef: string;
}

interface GuardRT {
  def: Guard;
  speed: number;
  state: number;
  patrolLegs: { x: number; z: number }[][];
  legIdx: number;
  path: { x: number; z: number }[];
  segIdx: number;
  segT: number;
  dwellUntil: number;
  assignedEvent: string | null;
}

interface EventRT {
  sched: EventScheduleItem;
  assignedGuard: number | null;
  arrival: number | null;
  resolved: number | null;
  outcome: "open" | "assigned" | "unreachable";
}

interface EventScheduleItem {
  id: string;
  t: number;
  type: string;
  severity: 1 | 2 | 3;
  x: number;
  z: number;
  node: number;
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

export function runSimulation(world: World, scenario: ScenarioConfig): SimulationResult {
  const rng = makeRng(scenario.seed);
  const graph = buildNavGraph(world);
  const duration = Math.max(60, Math.round(scenario.durationSec));

  const outages = applyOutages(world, scenario.lightingOutageFraction, scenario.seed);
  const effectiveLights = world.streetlights.map((l) => (outages.has(l.id) ? { ...l, on: false } : l));
  const effWorld: World = { ...world, streetlights: effectiveLights };
  const coverage = computeCoverage(effWorld, scenario.ambientVisibility, scenario.cctvRangeScale);

  /* ------- guards ------- */
  const guardDefs = instantiateGuards(world, scenario, rng);
  const guards: GuardRT[] = guardDefs.map((def) => {
    const wps = def.waypoints.length ? def.waypoints : [{ x: 0, z: 0 }];
    const legs: { x: number; z: number }[][] = [];
    for (let i = 0; i < wps.length; i++) {
      const a = wps[i];
      const b = wps[(i + 1) % wps.length];
      const leg = routeBetween(graph, a, b);
      legs.push(leg && leg.length >= 2 ? leg : [{ x: a.x, z: a.z }, { x: b.x, z: b.z }]);
    }
    return {
      def,
      speed: scenario.guardSpeed ?? def.speed,
      state: GUARD_STATE.PATROLLING,
      patrolLegs: legs,
      legIdx: 0,
      path: legs[0] ?? [{ x: wps[0].x, z: wps[0].z }],
      segIdx: 0,
      segT: 0,
      dwellUntil: 0,
      assignedEvent: null,
    };
  });

  /* ------- agents ------- */
  const { agents, firstTripRecords } = spawnAgents(world, scenario, rng, graph, duration);
  const tripRecords: TripRecord[] = firstTripRecords;

  /* ------- event schedule ------- */
  const events = generateEvents(effWorld, scenario, rng, coverage, duration);
  const eventRt = new Map<string, EventRT>();
  for (const e of events) {
    eventRt.set(e.id, { sched: e, assignedGuard: null, arrival: null, resolved: null, outcome: "open" });
  }

  /* ------- frame recording ------- */
  const frames: Frame[] = [];
  const recordFrame = (t: number) => {
    const agentPos = new Float32Array(agents.length * 2);
    const agentState = new Uint8Array(agents.length);
    const agentCat = new Uint8Array(agents.length);
    const agentStarted = new Uint8Array(agents.length);
    agents.forEach((a, i) => {
      const p = positionOf(a.path, a);
      agentPos[i * 2] = p.x;
      agentPos[i * 2 + 1] = p.z;
      agentState[i] = a.state;
      agentCat[i] = a.category === "commuter" ? 1 : 0;
      agentStarted[i] = a.tripStarted ? 1 : 0;
    });
    const guardPos = new Float32Array(guards.length * 2);
    const guardState = new Uint8Array(guards.length);
    guards.forEach((g, i) => {
      const p = positionOf(g.path, g);
      guardPos[i * 2] = p.x;
      guardPos[i * 2 + 1] = p.z;
      guardState[i] = g.state;
    });
    frames.push({ t, agentPos, agentState, agentCat, agentStarted, guardPos, guardState });
  };

  recordFrame(0);

  for (let t = 1; t <= duration; t++) {
    /* --- agent lifecycle --- */
    for (const a of agents) {
      // spawn outbound trip
      if (a.state === AGENT_STATE.WAITING && !a.tripStarted && t >= a.spawnAt) {
        a.tripStarted = true;
        a.state = a.reachable ? AGENT_STATE.WALKING : AGENT_STATE.WAITING;
        if (!a.reachable && t >= a.spawnAt + 45) a.state = AGENT_STATE.CANCELLED;
      }
      if (a.state === AGENT_STATE.WAITING && a.tripStarted && !a.reachable && t >= a.spawnAt + 45) {
        a.state = AGENT_STATE.CANCELLED;
      }
      // wake for scheduled return trip
      if (a.state === AGENT_STATE.ARRIVED && a.returnAt >= 0 && t >= a.returnAt) {
        if (a.retPath.length >= 2) {
          a.path = a.retPath;
          a.segIdx = 0;
          a.segT = 0;
          a.phase = "back";
          a.returnAt = -1;
          a.state = AGENT_STATE.WALKING;
          tripRecords.push({ reachable: true, lengthM: a.retLength, completed: false });
          a.returnTripRecord = tripRecords.length - 1;
        } else {
          a.returnAt = -1;
        }
      }
    }

    /* --- agents walk --- */
    for (let ai = 0; ai < agents.length; ai++) {
      const a = agents[ai];
      if (a.state !== AGENT_STATE.WALKING) continue;
      const res = advanceAlong(a.path, a, a.speed);
      if (res.finished) {
        if (a.phase === "out") {
          tripRecords[ai].completed = true;
          // decide on a return trip home
          const dwell = rng.range(90, 300);
          const est = a.retLength / a.speed + 30;
          if (a.retPath.length >= 2 && t + dwell + est < duration - 10) {
            a.returnAt = t + dwell;
          }
          a.state = AGENT_STATE.ARRIVED;
        } else {
          tripRecords[a.returnTripRecord].completed = true;
          a.state = AGENT_STATE.ARRIVED;
        }
      }
    }

    /* --- guards --- */
    for (const g of guards) stepGuard(g, t, eventRt, graph);

    /* --- event assignment --- */
    for (const [, rt] of eventRt) {
      if (rt.outcome !== "open") continue;
      if (rt.sched.t > t) continue;
      tryAssignEvent(rt, guards, graph);
    }

    recordFrame(t);
  }

  /* ---------------- finalize event records ---------------- */
  const storedEvents: StoredRunEvent[] = events.map((e) => {
    const rt = eventRt.get(e.id)!;
    let outcome: string;
    let note: string;
    if (rt.resolved !== null) {
      outcome = "resolved";
      note = `Guard ${rt.assignedGuard !== null ? guards[rt.assignedGuard].def.name : "—"} arrived at ${s(rt.arrival)}; resolved at ${s(rt.resolved)}.`;
    } else if (rt.outcome === "unreachable") {
      outcome = "unreachable";
      note = "Event location is unreachable on the pedestrian graph — no response time is claimed.";
    } else if (rt.assignedGuard !== null && rt.arrival !== null) {
      outcome = "open_at_end";
      note = "Guard arrived on scene, but the event remained open when the simulated night ended.";
    } else if (rt.assignedGuard !== null) {
      outcome = "open_at_end";
      note = "Guard was still en route when the simulated night ended.";
    } else {
      outcome = "no_guard";
      note = "No guard was available on the modeled network at event time.";
    }
    return {
      id: e.id,
      tSec: Math.round(e.t),
      type: e.type,
      severity: e.severity,
      x: e.x,
      z: e.z,
      assignedGuardId: rt.assignedGuard !== null ? guards[rt.assignedGuard].def.id : null,
      guardArrivalSec: rt.arrival !== null ? Math.round(rt.arrival) : null,
      resolvedSec: rt.resolved !== null ? Math.round(rt.resolved) : null,
      outcome,
      note,
    };
  });

  const unreachableDestinations = Array.from(
    new Set(agents.filter((a) => !a.reachable).map((a) => a.destRef))
  );

  return {
    engineVersion: ENGINE_VERSION,
    seed: scenario.seed,
    durationSec: duration,
    frames,
    events: storedEvents,
    trips: tripRecords,
    guardCount: guards.length,
    unreachableDestinations,
  };
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

function s(v: number | null): string {
  return v === null ? "—" : String(Math.round(v));
}

function routeBetween(
  graph: NavGraph,
  a: { x: number; z: number },
  b: { x: number; z: number }
): { x: number; z: number }[] | null {
  const na = nearestRoutableNode(graph, a.x, a.z);
  const nb = nearestRoutableNode(graph, b.x, b.z);
  if (na === null || nb === null) return null;
  const res = findPath(graph, na, nb);
  if (!res) return null;
  return pathPositions(graph, res.nodes).pts;
}

function instantiateGuards(world: World, scenario: ScenarioConfig, rng: Rng): Guard[] {
  const active = world.guards.filter((g) => g.active && g.waypoints.length > 0);
  if (scenario.guardCount === null) {
    return active.map((g, i) => ({ ...g, name: g.name || `Guard ${i + 1}` }));
  }
  const n = Math.max(0, Math.round(scenario.guardCount));
  const out: Guard[] = [];
  for (let i = 0; i < n; i++) {
    if (active.length > 0) {
      const base = active[i % active.length];
      out.push({
        id: `${base.id}_s${i}`,
        name: `${base.name || "Guard"} ${i + 1}`,
        speed: base.speed,
        waypoints: base.waypoints.map((w) => ({ ...w })),
        active: true,
      });
    } else {
      const fs = world.facilities;
      const wps: { x: number; z: number }[] = [];
      if (fs.length) {
        for (let k = 0; k < Math.min(fs.length, 3); k++) {
          const f = fs[rng.int(0, fs.length - 1)];
          wps.push({ x: f.x, z: f.z });
        }
      } else {
        wps.push({ x: 0, z: 0 });
      }
      out.push({ id: `guard_synth_${i}`, name: `Patrol ${i + 1}`, speed: 1.15, waypoints: wps, active: true });
    }
  }
  return out;
}

function spawnAgents(
  world: World,
  scenario: ScenarioConfig,
  rng: Rng,
  graph: NavGraph,
  duration: number
): { agents: AgentRT[]; firstTripRecords: TripRecord[] } {
  const agents: AgentRT[] = [];
  const firstTripRecords: TripRecord[] = [];
  const homes = world.buildings.filter((b) => b.category === "residential" || b.category === "mixed");
  const overnight = homes.length ? homes : world.buildings;
  const destBuildings = world.buildings.filter(
    (b) => b.category === "commercial" || b.category === "community"
  );
  const facilities = world.facilities;
  const busStops = facilities.filter((f) => f.type === "bus_stop");

  const occWeights = overnight.map((b) => Math.max(1, b.occupancy));
  const totalOcc = occWeights.reduce((a, b) => a + b, 0);

  const pickOrigin = (): { p: { x: number; z: number }; ref: string } => {
    if (!overnight.length) return { p: { x: 0, z: 0 }, ref: "none" };
    let r = rng.next() * totalOcc;
    for (let i = 0; i < overnight.length; i++) {
      r -= occWeights[i];
      if (r <= 0) return { p: entranceOfLocal(overnight[i]), ref: overnight[i].id };
    }
    const b = overnight[overnight.length - 1];
    return { p: entranceOfLocal(b), ref: b.id };
  };

  const pickFacility = () => {
    const f = facilities[rng.int(0, facilities.length - 1)];
    return { p: { x: f.x, z: f.z }, ref: f.id };
  };
  const pickBusStop = () => {
    const f = busStops[rng.int(0, busStops.length - 1)];
    return { p: { x: f.x, z: f.z }, ref: f.id };
  };
  const pickDestBuilding = () => {
    const b = destBuildings[rng.int(0, destBuildings.length - 1)];
    return { p: entranceOfLocal(b), ref: b.id };
  };
  const pickHome = () => {
    const b = overnight[rng.int(0, overnight.length - 1)];
    return { p: entranceOfLocal(b), ref: b.id };
  };

  const pickDestination = (commuter: boolean): { p: { x: number; z: number }; ref: string } => {
    if (commuter && busStops.length > 0 && rng.next() < 0.6) return pickBusStop();
    const roll = rng.next();
    if (facilities.length && roll < 0.45) return pickFacility();
    if (destBuildings.length && roll < 0.8) return pickDestBuilding();
    if (overnight.length) return pickHome();
    return { p: { x: 0, z: 0 }, ref: "none" };
  };

  for (let i = 0; i < scenario.population; i++) {
    const commuter = rng.next() > scenario.residentRatio;
    const origin =
      commuter && busStops.length > 0 && rng.next() < 0.5 ? pickBusStop() : pickOrigin();
    const dest = pickDestination(commuter);

    const startNode = resolveEndpoint(graph, origin.p, origin.ref);
    const endNode = resolveEndpoint(graph, dest.p, dest.ref);
    let path: { x: number; z: number }[] = [];
    let retPath: { x: number; z: number }[] = [];
    let reachable = false;
    let length = 0;
    let retLength = 0;
    if (startNode !== null && endNode !== null) {
      const res = findPath(graph, startNode, endNode);
      if (res) {
        const pp = pathPositions(graph, res.nodes);
        path = pp.pts;
        length = pp.length;
        reachable = pp.pts.length >= 2 && length > 0.5;
        if (reachable) {
          const back = findPath(graph, endNode, startNode);
          if (back) {
            const bp = pathPositions(graph, back.nodes);
            retPath = bp.pts;
            retLength = bp.length;
          }
        }
      }
    }

    agents.push({
      category: commuter ? "commuter" : "resident",
      speed: scenario.pedestrianSpeed * rng.range(0.85, 1.15),
      spawnAt: Math.floor(rng.range(0, duration * 0.8)),
      state: AGENT_STATE.WAITING,
      phase: "out",
      path,
      segIdx: 0,
      segT: 0,
      routeLength: length,
      reachable,
      tripStarted: false,
      returnAt: -1,
      retPath,
      retLength,
      returnTripRecord: -1,
      originRef: origin.ref,
      destRef: dest.ref,
    });
    firstTripRecords.push({ reachable, lengthM: length, completed: false });
  }
  return { agents, firstTripRecords };
}

function entranceOfLocal(b: {
  x: number;
  z: number;
  width: number;
  depth: number;
  entrance?: { x: number; z: number };
}): { x: number; z: number } {
  if (b.entrance) return b.entrance;
  return { x: b.x, z: b.z + b.depth / 2 };
}

function generateEvents(
  world: World,
  scenario: ScenarioConfig,
  rng: Rng,
  coverage: CoverageResult,
  duration: number
): EventScheduleItem[] {
  const events: EventScheduleItem[] = [];
  const rate = Math.max(0, scenario.eventsPerHour) / 3600;
  if (rate <= 0) return events;

  const segs = walkableSegments(world).filter((sg) => dist(sg.a.x, sg.a.z, sg.b.x, sg.b.z) > 0.5);
  if (!segs.length) return events;

  const segLit = new Map<string, number>();
  for (const [roadId, frac] of coverage.perRoadLit) segLit.set(roadId, frac);
  const weights = segs.map((sg) => {
    const lit = segLit.get(sg.roadId) ?? 1;
    return 1 + 2.2 * (1 - lit);
  });

  let t = rng.exponential(rate);
  let n = 0;
  while (t < duration && events.length < 200) {
    const si = rng.weighted(weights);
    const sg = segs[si];
    const tt = rng.next();
    const x = sg.a.x + (sg.b.x - sg.a.x) * tt;
    const z = sg.a.z + (sg.b.z - sg.a.z) * tt;

    const ti = rng.weighted(EVENT_TYPES.map((e) => e.weight as number));
    const def = EVENT_TYPES[ti];
    const sev = rng.weighted(def.severityWeights as unknown as number[]);

    events.push({
      id: `evt_${n.toString(36)}_${Math.round(t)}`,
      t,
      type: def.type,
      severity: (sev + 1) as 1 | 2 | 3,
      x,
      z,
      node: -1,
    });
    n += 1;
    t += rng.exponential(rate);
  }
  return events;
}

function tryAssignEvent(rt: EventRT, guards: GuardRT[], graph: NavGraph) {
  const e = rt.sched;
  if (e.node < 0) {
    e.node = nearestRoutableNode(graph, e.x, e.z) ?? -1;
  }
  if (e.node < 0) {
    rt.outcome = "unreachable";
    return;
  }
  const cand = guards
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => g.state === GUARD_STATE.PATROLLING || g.state === GUARD_STATE.RETURNING)
    .sort(
      (a, b) =>
        dist(a.g.path[0]?.x ?? 0, a.g.path[0]?.z ?? 0, e.x, e.z) -
        dist(b.g.path[0]?.x ?? 0, b.g.path[0]?.z ?? 0, e.x, e.z)
    );
  if (!cand.length) return; // stays open; retried each step
  for (const { g, i } of cand) {
    const pos = positionOf(g.path, g);
    const from = nearestRoutableNode(graph, pos.x, pos.z);
    if (from === null) continue;
    const res = findPath(graph, from, e.node);
    if (!res) continue;
    const pts = pathPositions(graph, res.nodes).pts;
    if (pts.length < 2) continue;
    g.path = pts;
    g.segIdx = 0;
    g.segT = 0;
    g.state = GUARD_STATE.RESPONDING;
    g.assignedEvent = e.id;
    rt.assignedGuard = i;
    rt.outcome = "assigned";
    return;
  }
  rt.outcome = "unreachable";
}

function stepGuard(g: GuardRT, t: number, eventRt: Map<string, EventRT>, graph: NavGraph) {
  if (g.state === GUARD_STATE.UNAVAILABLE) return;

  if (g.state === GUARD_STATE.RESPONDING) {
    const res = advanceAlong(g.path, g, g.speed);
    if (res.finished) {
      g.state = GUARD_STATE.ON_SCENE;
      const rt = g.assignedEvent ? eventRt.get(g.assignedEvent) : null;
      const dwell = 60 + (rt?.sched.severity ?? 1) * 45;
      g.dwellUntil = t + dwell;
      if (rt && rt.arrival === null) rt.arrival = t;
    }
    return;
  }

  if (g.state === GUARD_STATE.ON_SCENE) {
    if (t >= g.dwellUntil) {
      const rt = g.assignedEvent ? eventRt.get(g.assignedEvent) : null;
      if (rt && rt.resolved === null) rt.resolved = t;
      g.assignedEvent = null;
      // route back to the patrol leg we left
      const wp = g.patrolLegs[g.legIdx]?.[0];
      const pos = positionOf(g.path, g);
      if (wp) {
        const from = nearestRoutableNode(graph, pos.x, pos.z);
        const to = nearestRoutableNode(graph, wp.x, wp.z);
        if (from !== null && to !== null) {
          const res = findPath(graph, from, to);
          if (res) {
            const pts = pathPositions(graph, res.nodes).pts;
            if (pts.length >= 2) {
              g.path = pts;
              g.segIdx = 0;
              g.segT = 0;
              g.state = GUARD_STATE.RETURNING;
              return;
            }
          }
        }
      }
      g.path = wp ? [pos, wp] : [pos];
      g.segIdx = 0;
      g.segT = 0;
      g.state = g.path.length >= 2 ? GUARD_STATE.RETURNING : GUARD_STATE.PATROLLING;
    }
    return;
  }

  // PATROLLING / RETURNING
  const res = advanceAlong(g.path, g, g.speed);
  if (res.finished) {
    if (g.state === GUARD_STATE.RETURNING) {
      g.state = GUARD_STATE.PATROLLING;
      g.path = g.patrolLegs[g.legIdx] ?? [res];
      g.segIdx = 0;
      g.segT = 0;
      return;
    }
    g.legIdx = (g.legIdx + 1) % Math.max(g.patrolLegs.length, 1);
    g.path = g.patrolLegs[g.legIdx] ?? [res];
    g.segIdx = 0;
    g.segT = 0;
  }
}

/**
 * Incident director — synthetic perpetrator agents, victims, detection and
 * guard fatigue layered on top of the deterministic engine ("game mode").
 *
 * Perpetrators are FICTIONAL scenario actors used to stress-test a security
 * configuration. They are never derived from, or matched to, real people.
 *
 * Determinism: all randomness comes from a dedicated seeded stream
 * (derived from scenario.seed) consumed in a fixed order; iteration order of
 * perps, guards, agents and incidents is always by index.
 */

import type { CctvCamera, ScenarioConfig, StoredRunEvent, Streetlight, World } from "../world/types";
import type { AgentRT, EventRT, GuardRT } from "./engine";
import { findPath, nearestRoutableNode, pathPositions, type NavGraph } from "../world/graph";
import { dist, clamp } from "../world/ids";
import { makeRng, type Rng } from "./rng";
import { cctvCovers, illuminationAt, LIGHT_THRESHOLD, type CoverageResult } from "./scenarios";
import { advanceAlong, positionOf, type Pt } from "./walk";
import {
  DEFAULT_INCIDENT_MIX,
  GUARD_CONDITION,
  PERP_KIND_LABEL,
  PERP_KINDS,
  PERP_STATE,
  VICTIM_STATE,
  type ActorRef,
  type BeatKind,
  type DetectionSource,
  type DramaFrame,
  type IncidentBeat,
  type IncidentRecord,
  type PerpKind,
} from "./incidents";
import {
  GUARD_ACTIONS,
  PERP_ACTIONS,
  VICTIM_ACTIONS,
  describeKey,
  guardDistOf,
  guardKey,
  guardNearOf,
  lightingOf,
  perpKey,
  victimKey,
  type PolicyDecision,
  type VictimAction,
} from "./policy";

// Mirrors of engine constants (kept local to avoid a runtime import cycle).
const A_WALKING = 1;
const A_ARRIVED = 2;
const G_PATROLLING = 0;
const G_RESPONDING = 1;
const G_ON_SCENE = 2;
const G_RETURNING = 3;

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

const PERSON_KINDS: PerpKind[] = ["mugger", "harasser", "chain_snatcher"];
const ATTACK_SEC: Record<PerpKind, number> = { mugger: 25, harasser: 35, chain_snatcher: 8, burglar: 70, vandal: 18 };
const SEVERITY: Record<PerpKind, 1 | 2 | 3> = { mugger: 3, harasser: 2, chain_snatcher: 3, burglar: 2, vandal: 1 };
const SCREAM_P: Record<PerpKind, number> = { mugger: 0.55, harasser: 0.85, chain_snatcher: 0.95, burglar: 0, vandal: 0 };
const SILENT_RESIDENT_P: Record<PerpKind, number> = { mugger: 0.3, harasser: 0.35, chain_snatcher: 0.2, burglar: 0.55, vandal: 0.35 };
const WALK_SPEED = 1.3;
const STALK_SPEED = 2.0;
const POUNCE_SPEED = 2.6;
const FLEE_SPEED = 2.4;
const BLEND_SPEED = 1.4;
const VICTIM_RUN = 2.2;
const CATCH_RADIUS = 6;
const GUARD_SIGHT_M = 30;
const EARSHOT_M = 90;
const RESIDENT_EARSHOT_M = 55;
const CCTV_DETECT_SCORE = 1.5;

export function effectivePerpCount(s: ScenarioConfig): number {
  if (s.eventsPerHour <= 0) return 0;
  return clamp(Math.round(s.perpCount ?? 0), 0, 20);
}

export function dramaEnabled(s: ScenarioConfig): boolean {
  return effectivePerpCount(s) > 0 || (s.guardFatigue ?? 0) > 0;
}

/* ------------------------------------------------------------------ */
/* Runtime types                                                       */
/* ------------------------------------------------------------------ */

export interface DramaCtx {
  world: World; // effective world (outages applied)
  scenario: ScenarioConfig;
  graph: NavGraph;
  coverage: CoverageResult;
  duration: number;
  agents: AgentRT[];
  guards: GuardRT[];
  eventRt: Map<string, EventRT>;
}

interface Exit extends Pt {
  name: string;
}

interface Target {
  type: "building" | "light" | "camera";
  idx: number;
  id: string;
  x: number;
  z: number;
  name: string;
}

interface IncRT {
  rec: IncidentRecord;
  rt: EventRT | null;
  screamAt: number;
  screamed: boolean;
  residentAt: number;
  residentName: string;
  residentDone: boolean;
  camAcc: number[];
  dispatchedBeat: boolean;
  arrivedBeat: boolean;
  targetCam: number;
  /** Jev-policy reaction of the victim (null = heuristic). */
  victimAction: VictimAction | null;
}

interface PerpRT {
  kind: PerpKind;
  kindIdx: number;
  state: number;
  x: number;
  z: number;
  spawnAt: number;
  spawn: Exit;
  path: Pt[];
  segIdx: number;
  segT: number;
  moving: boolean;
  lurkSince: number;
  victim: number;
  stalkSince: number;
  pounce: boolean;
  repathAt: number;
  target: Target | null;
  attackEnd: number;
  fleeStart: number;
  inc: IncRT | null;
  exit: Exit | null;
  openerVictim: number; // >= 0 while this perp is the scripted "opener"
  cooldownUntil: number;
  /** the opener is bold: not spooked by passing patrols */
  bold: boolean;
  /** next time a Jev-policy stalking decision is due */
  decideAt: number;
}

/* ------------------------------------------------------------------ */
/* Director                                                            */
/* ------------------------------------------------------------------ */

export class DramaDirector {
  private ctx: DramaCtx;
  private rng: Rng;
  private perps: PerpRT[] = [];
  private incidents: IncRT[] = [];
  private beats: IncidentBeat[] = [];
  private agentDrama: Uint8Array;
  private exits: Exit[] = [];
  private lights: Streetlight[];
  private cams: CctvCamera[];
  private smashedCams = new Set<number>();
  private vis: number;
  private threshold: number;
  private rangeScale: number;
  private drowsyAt: number[] = [];
  private asleepAt: number[] = [];
  private asleepSec = 0;
  private fatigue: number;
  private roadNames = new Map<string, string>();
  private footfall = new Map<string, number>();
  private footMax = 1;
  private ap: Pt[] = [];
  private gp: Pt[] = [];
  private incCounter = 0;
  private policy: Record<string, Record<string, number>> | null;
  private decisions: PolicyDecision[] = [];

  constructor(ctx: DramaCtx) {
    this.ctx = ctx;
    const sc = ctx.scenario;
    this.policy = sc.jevPolicy?.table && Object.keys(sc.jevPolicy.table).length ? sc.jevPolicy.table : null;
    this.rng =makeRng(((sc.seed | 0) ^ 0x5eed_d7a3) | 0);
    this.agentDrama = new Uint8Array(ctx.agents.length);
    this.lights = ctx.world.streetlights.slice();
    this.cams = ctx.world.cameras;
    this.vis = clamp(sc.ambientVisibility, 0.2, 1);
    this.threshold = LIGHT_THRESHOLD / Math.max(0.35, sc.ambientVisibility);
    this.rangeScale = sc.cctvRangeScale;
    this.fatigue = clamp(sc.guardFatigue ?? 0, 0, 1);
    for (const r of ctx.world.roads) if (r.name) this.roadNames.set(r.id, r.name);

    this.buildExits();
    this.buildFootfall();
    this.scheduleFatigue();
    this.spawnPerps();
  }

  /* ------------------------------ setup ------------------------------ */

  private buildExits() {
    const { world, graph } = this.ctx;
    const gates = world.site?.gates ?? [];
    const out: Exit[] = [];
    for (const g of gates) {
      if (nearestRoutableNode(graph, g.x, g.z) === null) continue;
      out.push({ x: g.x, z: g.z, name: g.name || `${g.kind} gate` });
    }
    if (!out.length) {
      const hw = world.bounds.width / 2;
      const hd = world.bounds.depth / 2;
      for (const n of graph.nodes) {
        if (n.connector) continue;
        if (Math.abs(n.x) < hw - 15 && Math.abs(n.z) < hd - 15) continue;
        if (nearestRoutableNode(graph, n.x, n.z) !== n.id) continue;
        if (out.some((e) => dist(e.x, e.z, n.x, n.z) < 25)) continue;
        out.push({ x: n.x, z: n.z, name: `the ${this.placeName(n.x, n.z)} exit` });
      }
    }
    if (!out.length) {
      const cand = graph.nodes
        .filter((n) => nearestRoutableNode(graph, n.x, n.z) === n.id)
        .sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z) || a.id - b.id)
        .slice(0, 4);
      for (const n of cand) out.push({ x: n.x, z: n.z, name: `the ${this.placeName(n.x, n.z)} exit` });
    }
    this.exits = out;
  }

  private cellKey(x: number, z: number) {
    return `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
  }

  private buildFootfall() {
    for (const a of this.ctx.agents) {
      for (const p of a.path) this.footfall.set(this.cellKey(p.x, p.z), (this.footfall.get(this.cellKey(p.x, p.z)) ?? 0) + 1);
      for (const p of a.retPath) this.footfall.set(this.cellKey(p.x, p.z), (this.footfall.get(this.cellKey(p.x, p.z)) ?? 0) + 1);
    }
    for (const v of this.footfall.values()) this.footMax = Math.max(this.footMax, v);
  }

  private scheduleFatigue() {
    const { guards, duration } = this.ctx;
    const f = this.fatigue;
    for (let i = 0; i < guards.length; i++) {
      const r1 = this.rng.next();
      const r2 = this.rng.next();
      const r3 = this.rng.next();
      if (f > 0 && r1 < f) {
        const at = Math.round(duration * clamp(0.6 - 0.45 * f + 0.3 * (r2 - 0.5), 0.12, 0.9));
        this.drowsyAt.push(Math.max(60, at));
        this.asleepAt.push(Math.max(60, at) + 60 + Math.round(r3 * 120));
      } else {
        this.drowsyAt.push(0);
        this.asleepAt.push(0);
      }
    }
  }

  private pickKind(personOnly: boolean): PerpKind {
    const mix = this.ctx.scenario.incidentMix ?? DEFAULT_INCIDENT_MIX;
    const kinds = personOnly ? PERSON_KINDS : PERP_KINDS;
    const w = kinds.map((k) => Math.max(0, mix[k] ?? 0));
    if (w.every((v) => v <= 0)) return personOnly ? "mugger" : PERP_KINDS[this.rng.int(0, PERP_KINDS.length - 1)];
    return kinds[this.rng.weighted(w)];
  }

  private spawnPerps() {
    const n = effectivePerpCount(this.ctx.scenario);
    if (n <= 0 || !this.exits.length) return;
    const { agents, duration } = this.ctx;

    // the "opener": stalks the earliest walker so something happens in the first minutes
    let openerVictim = -1;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.reachable || a.routeLength < 90 || a.spawnAt > 150) continue;
      if (openerVictim < 0 || a.spawnAt < agents[openerVictim].spawnAt) openerVictim = i;
    }

    const others = openerVictim >= 0 ? n - 1 : n;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const opener = i === 0 && openerVictim >= 0;
      const kind = this.pickKind(opener);
      let spawnAt: number;
      let spawn: Exit;
      if (opener) {
        const v = agents[openerVictim];
        spawnAt = Math.max(3, v.spawnAt - 20);
        const mid = pointAlong(v.path, v.routeLength * 0.45);
        spawn = this.nearestExit(mid.x, mid.z);
      } else {
        spawnAt =
          Math.round(duration * (0.06 + 0.82 * (others > 0 ? k / others : 0))) +
          this.rng.int(0, Math.round(duration * 0.06));
        spawn = this.exits[this.rng.int(0, this.exits.length - 1)];
        k += 1;
      }
      this.perps.push({
        kind,
        kindIdx: PERP_KINDS.indexOf(kind),
        state: PERP_STATE.INACTIVE,
        x: spawn.x,
        z: spawn.z,
        spawnAt: Math.min(spawnAt, duration - 30),
        spawn,
        path: [],
        segIdx: 0,
        segT: 0,
        moving: false,
        lurkSince: 0,
        victim: -1,
        stalkSince: 0,
        pounce: false,
        repathAt: 0,
        target: null,
        attackEnd: 0,
        fleeStart: 0,
        inc: null,
        exit: null,
        openerVictim: opener ? openerVictim : -1,
        cooldownUntil: 0,
        bold: opener,
        decideAt: 0,
      });
    }
  }

  /* ----------------------------- helpers ----------------------------- */

  private placeName(x: number, z: number): string {
    const { coverage } = this.ctx;
    let best = Infinity;
    let id: string | null = null;
    for (const s of coverage.samples) {
      const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
      if (d < best) {
        best = d;
        id = s.roadId;
      }
    }
    return (id && this.roadNames.get(id)) || "the lane";
  }

  private nearestExit(x: number, z: number): Exit {
    let best = this.exits[0];
    let bd = Infinity;
    for (const e of this.exits) {
      const d = dist(e.x, e.z, x, z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private route(fx: number, fz: number, tx: number, tz: number): Pt[] {
    const g = this.ctx.graph;
    // short hops: go straight (avoids doubling back to a node behind us on every re-path)
    if (dist(fx, fz, tx, tz) < 25) return [{ x: fx, z: fz }, { x: tx, z: tz }, { x: tx, z: tz }];
    const na = nearestRoutableNode(g, fx, fz);
    const nb = nearestRoutableNode(g, tx, tz);
    const pts: Pt[] = [{ x: fx, z: fz }];
    if (na !== null && nb !== null) {
      const res = findPath(g, na, nb);
      if (res) {
        const np = pathPositions(g, res.nodes).pts.map((p) => ({ x: p.x, z: p.z }));
        // trim a first/last node that lies "behind" us / beyond the target
        if (np.length >= 2 && dist(fx, fz, np[1].x, np[1].z) < dist(np[0].x, np[0].z, np[1].x, np[1].z)) np.shift();
        const L = np.length;
        if (L >= 2 && dist(tx, tz, np[L - 2].x, np[L - 2].z) < dist(np[L - 1].x, np[L - 1].z, np[L - 2].x, np[L - 2].z)) np.pop();
        for (const p of np) pts.push(p);
      }
    }
    pts.push({ x: tx, z: tz });
    pts.push({ x: tx, z: tz }); // duplicate end → positionOf() lands exactly on target
    return pts;
  }

  private setPath(p: PerpRT, tx: number, tz: number) {
    p.path = this.route(p.x, p.z, tx, tz);
    p.segIdx = 0;
    p.segT = 0;
    p.moving = true;
  }

  /** Advance perp along its path; returns true when finished. */
  private move(p: PerpRT, speed: number): boolean {
    if (!p.path.length) return true;
    const r = advanceAlong(p.path, p, speed);
    p.x = r.x;
    p.z = r.z;
    if (r.finished) p.moving = false;
    return r.finished;
  }

  private lightF(x: number, z: number): number {
    return Math.min(1, illuminationAt(x, z, this.lights, this.vis) / this.threshold);
  }

  private camCovering(x: number, z: number, exclude = -1): number {
    for (let j = 0; j < this.cams.length; j++) {
      if (j === exclude || this.smashedCams.has(j)) continue;
      if (cctvCovers(this.cams[j], x, z, this.rangeScale)) return j;
    }
    return -1;
  }

  private awake(gi: number) {
    return this.ctx.guards[gi].cond !== GUARD_CONDITION.ASLEEP;
  }

  private freeGuard(g: GuardRT) {
    return g.state === G_PATROLLING || g.state === G_RETURNING;
  }

  private beat(
    t: number,
    kind: BeatKind,
    actor: ActorRef,
    x: number,
    z: number,
    line: string,
    severity: 1 | 2 | 3,
    eventId: string | null = null,
    target?: ActorRef
  ) {
    const b: IncidentBeat = { tSec: t, kind, eventId, actor, x, z, line, severity };
    if (target) b.target = target;
    this.beats.push(b);
  }

  private perpRef(i: number): ActorRef {
    return { kind: "perp", idx: i, id: `perp_${i}` };
  }
  private guardRef(i: number): ActorRef {
    return { kind: "guard", idx: i, id: this.ctx.guards[i].def.id };
  }
  private agentRef(i: number): ActorRef {
    return { kind: "agent", idx: i };
  }
  private gname(i: number) {
    return this.ctx.guards[i].def.name || `Guard ${i + 1}`;
  }

  /* ------------------------------ step ------------------------------- */

  step(t: number) {
    const { agents, guards } = this.ctx;
    this.ap.length = agents.length;
    for (let i = 0; i < agents.length; i++) this.ap[i] = positionOf(agents[i].path, agents[i]);
    this.gp.length = guards.length;
    for (let i = 0; i < guards.length; i++) this.gp[i] = positionOf(guards[i].path, guards[i]);

    this.stepFatigue(t);
    for (let i = 0; i < this.perps.length; i++) this.stepPerp(i, t);
    this.stepVictims();
    this.stepIncidents(t);
    this.stepChaseAndCatch(t);
  }

  private wake(gi: number, t: number, reason: "radio" | "scream") {
    const g = this.ctx.guards[gi];
    g.cond = GUARD_CONDITION.ALERT;
    g.wakeAt = 0;
    if (this.fatigue > 0.5) {
      this.drowsyAt[gi] = t + 600;
      this.asleepAt[gi] = t + 720;
    } else {
      this.drowsyAt[gi] = 0;
      this.asleepAt[gi] = 0;
    }
    const p = this.gp[gi];
    const line =
      reason === "scream"
        ? `${this.gname(gi)} jolts awake — was that a scream?`
        : `${this.gname(gi)} wakes up to a crackling radio — "Sorry, sorry, on my way!"`;
    this.beat(t, "guard_wakes", this.guardRef(gi), p.x, p.z, line, 2, g.assignedEvent);
  }

  private stepFatigue(t: number) {
    const { guards } = this.ctx;
    for (let gi = 0; gi < guards.length; gi++) {
      const g = guards[gi];
      if (g.cond === GUARD_CONDITION.ASLEEP) {
        this.asleepSec += 1;
        if (g.wakeAt > 0 && t >= g.wakeAt) this.wake(gi, t, "radio");
        continue;
      }
      if (!this.drowsyAt[gi]) continue;
      if (g.cond === GUARD_CONDITION.ALERT && t >= this.drowsyAt[gi] && this.freeGuard(g)) {
        g.cond = GUARD_CONDITION.DROWSY;
        const p = this.gp[gi];
        this.beat(t, "guard_drowsy", this.guardRef(gi), p.x, p.z, `${this.gname(gi)} is yawning — eyes getting heavy`, 1);
      } else if (g.cond === GUARD_CONDITION.DROWSY && t >= this.asleepAt[gi] && this.freeGuard(g)) {
        const p = this.gp[gi];
        if (this.policy) {
          const key = guardKey(lightingOf(this.lightF(p.x, p.z)), this.camCovering(p.x, p.z) >= 0, t > this.ctx.duration / 2);
          if (this.decide(key, GUARD_ACTIONS, this.guardRef(gi), p.x, p.z, t) === "stay_alert") {
            g.cond = GUARD_CONDITION.ALERT;
            this.drowsyAt[gi] = t + 240;
            this.asleepAt[gi] = t + 360;
            this.beat(t, "guard_wakes", this.guardRef(gi), p.x, p.z, `${this.gname(gi)} shakes off the fatigue — staying alert`, 1);
            continue;
          }
        }
        g.cond = GUARD_CONDITION.ASLEEP;
        this.beat(
          t,
          "guard_asleep",
          this.guardRef(gi),
          p.x,
          p.z,
          `${this.gname(gi)} dozed off near ${this.placeName(p.x, p.z)}`,
          2
        );
      }
    }
  }

  /* ---------------------------- perps ---------------------------- */

  private chooseLurk(p: PerpRT) {
    const { coverage } = this.ctx;
    const n = coverage.samples.length;
    if (!n) return;
    let best = -1;
    let bs = -Infinity;
    for (let k = 0; k < 30; k++) {
      const si = this.rng.int(0, n - 1);
      const s = coverage.samples[si];
      const lf = this.lightF(s.x, s.z);
      const cov = this.camCovering(s.x, s.z) >= 0;
      const foot = (this.footfall.get(this.cellKey(s.x, s.z)) ?? 0) / this.footMax;
      const sc = 1.5 * (1 - lf) + (cov ? 0 : 1) + 1.2 * foot + this.rng.next() * 0.3;
      if (sc > bs) {
        bs = sc;
        best = si;
      }
    }
    const s = coverage.samples[best];
    this.setPath(p, s.x, s.z);
  }

  private chooseTarget(p: PerpRT): Target | null {
    const { world } = this.ctx;
    let best: Target | null = null;
    let bs = -Infinity;
    if (p.kind === "burglar") {
      world.buildings.forEach((b, i) => {
        if (b.category !== "residential" && b.category !== "mixed" && b.category !== "commercial") return;
        const e = b.entrance ?? { x: b.x, z: b.z + b.depth / 2 };
        const sc =
          1.5 * (1 - this.lightF(e.x, e.z)) + (this.camCovering(e.x, e.z) >= 0 ? 0 : 1) + this.rng.next() * 0.6;
        if (sc > bs) {
          bs = sc;
          best = { type: "building", idx: i, id: b.id, x: e.x, z: e.z, name: b.name || "a flat" };
        }
      });
    } else {
      this.cams.forEach((c, i) => {
        if (!c.active || this.smashedCams.has(i)) return;
        const sc = 1.4 + this.rng.next();
        if (sc > bs) {
          bs = sc;
          best = { type: "camera", idx: i, id: c.id, x: c.x, z: c.z, name: `camera ${i + 1}` };
        }
      });
      this.lights.forEach((l, i) => {
        if (!l.on || l.maintenance === "faulty") return;
        const sc = (this.camCovering(l.x, l.z) >= 0 ? 0 : 0.6) + this.rng.next();
        if (sc > bs) {
          bs = sc;
          best = { type: "light", idx: i, id: l.id, x: l.x, z: l.z, name: "a streetlight" };
        }
      });
    }
    return best;
  }

  private releaseVictim(p: PerpRT) {
    if (p.victim >= 0 && this.agentDrama[p.victim] === VICTIM_STATE.TARGETED) {
      this.agentDrama[p.victim] = VICTIM_STATE.NORMAL;
    }
    p.victim = -1;
    p.pounce = false;
  }

  private nearestAwakeGuard(x: number, z: number, maxD: number): number {
    let best = -1;
    let bd = maxD;
    for (let gi = 0; gi < this.ctx.guards.length; gi++) {
      if (!this.awake(gi)) continue;
      const d = dist(this.gp[gi].x, this.gp[gi].z, x, z);
      if (d < bd) {
        bd = d;
        best = gi;
      }
    }
    return best;
  }

  /* ------------------------- Jev policy ------------------------- */

  /**
   * Sample an action for `key` from the policy table using the SEEDED rng.
   * Returns null (and consumes no randomness) when there is no table entry,
   * so callers fall back to the heuristics.
   */
  private decide(key: string, actions: readonly string[], actor: PolicyDecision["actor"], x: number, z: number, t: number): string | null {
    const probs = this.policy?.[key];
    if (!probs) return null;
    const w = actions.map((a) => Math.max(0, Number(probs[a]) || 0));
    if (w.every((v) => v <= 0)) return null;
    const action = actions[this.rng.weighted(w)];
    const dist: Record<string, number> = {};
    actions.forEach((a, k) => (dist[a] = w[k]));
    this.decisions.push({ tSec: t, actor, x, z, key, situation: describeKey(key), action, probs: dist });
    return action;
  }

  /** Nearest non-sleeping guard: distance + whether that guard is drowsy. */
  private nearestGuardState(x: number, z: number): { d: number; drowsy: boolean } {
    let d = Infinity;
    let drowsy = false;
    for (let gi = 0; gi < this.ctx.guards.length; gi++) {
      if (!this.awake(gi)) continue;
      const dd = dist(this.gp[gi].x, this.gp[gi].z, x, z);
      if (dd < d) {
        d = dd;
        drowsy = this.ctx.guards[gi].cond === GUARD_CONDITION.DROWSY;
      }
    }
    return { d, drowsy };
  }

  private isAlone(ai: number): boolean {
    const { agents } = this.ctx;
    const q = this.ap[ai];
    for (let bi = 0; bi < agents.length; bi++) {
      if (bi === ai || agents[bi].state !== A_WALKING) continue;
      if (dist(this.ap[bi].x, this.ap[bi].z, q.x, q.z) < 15) return false;
    }
    return true;
  }

  /**
   * Policy-driven stalking decision. Returns "none" when the table has no
   * entry (use heuristics), "wait" to keep stalking this step, "exit" when the
   * perp left the STALKING state.
   */
  private policyStalk(i: number, t: number, stalked: number): "none" | "wait" | "exit" {
    const p = this.perps[i];
    const v = p.victim;
    const vp = this.ap[v];
    const g = this.nearestGuardState(vp.x, vp.z);
    const key = perpKey(
      p.kind,
      lightingOf(this.lightF(vp.x, vp.z)),
      this.camCovering(vp.x, vp.z) >= 0,
      guardNearOf(g.d, g.drowsy),
      this.isAlone(v)
    );
    if (!this.policy?.[key]) return "none";
    if (stalked > 90) {
      p.pounce = true; // patience runs out
      return "wait";
    }
    if (stalked < 6 || t < p.decideAt) return "wait";
    p.decideAt = t + 6;
    const action = this.decide(key, PERP_ACTIONS, this.perpRef(i), p.x, p.z, t);
    if (action === "attack_now") p.pounce = true;
    else if (action === "hide") {
      this.releaseVictim(p);
      p.cooldownUntil = t + 45;
      p.state = PERP_STATE.LURKING;
      p.lurkSince = t;
      this.beat(t, "perp_flee", this.perpRef(i), p.x, p.z, "Too risky here — he drops back into the shadows to wait", 1);
      this.chooseLurk(p);
      return "exit";
    } else if (action === "abort") {
      this.releaseVictim(p);
      p.exit = this.nearestExit(p.x, p.z);
      p.state = PERP_STATE.FLEEING;
      p.fleeStart = t - 15; // walk off casually
      this.setPath(p, p.exit.x, p.exit.z);
      this.beat(t, "perp_flee", this.perpRef(i), p.x, p.z, "He gives up and walks off toward the exit", 1);
      return "exit";
    }
    return "wait";
  }

  private stepPerp(i: number, t: number) {
    const p = this.perps[i];
    const { agents } = this.ctx;
    const person = PERSON_KINDS.includes(p.kind);
    switch (p.state) {
      case PERP_STATE.INACTIVE: {
        if (t < p.spawnAt) return;
        p.state = PERP_STATE.LURKING;
        p.lurkSince = t;
        const place = p.spawn.name.startsWith("the ") ? p.spawn.name : p.spawn.name;
        this.beat(t, "perp_spawn", this.perpRef(i), p.x, p.z, `A hooded figure slips in through ${place}`, 1);
        if (p.openerVictim >= 0) {
          const v = agents[p.openerVictim];
          const pt = pointAlong(v.path, v.routeLength * 0.45);
          this.setPath(p, pt.x, pt.z);
        } else if (person) {
          this.chooseLurk(p);
        } else {
          p.target = this.chooseTarget(p);
          if (p.target) this.setPath(p, p.target.x, p.target.z);
        }
        return;
      }
      case PERP_STATE.LURKING: {
        if (p.moving) {
          if (this.move(p, p.openerVictim >= 0 ? STALK_SPEED : WALK_SPEED)) p.lurkSince = t;
        }
        if (person) {
          if (t % 2 === 0 && t >= p.cooldownUntil) {
            const v = this.findVictim(p, t);
            if (v >= 0) {
              p.state = PERP_STATE.STALKING;
              p.victim = v;
              p.stalkSince = t;
              p.repathAt = t;
              p.openerVictim = -1;
              this.agentDrama[v] = VICTIM_STATE.TARGETED;
              this.beat(
                t,
                "stalk_start",
                this.perpRef(i),
                p.x,
                p.z,
                `Someone is quietly following a lone walker on ${this.placeName(p.x, p.z)}…`,
                2,
                null,
                this.agentRef(v)
              );
              return;
            }
          }
          if (!p.moving) {
            if (p.openerVictim >= 0) {
              const v = agents[p.openerVictim];
              if (v.state === A_ARRIVED || (v.tripStarted && v.state !== A_WALKING)) p.openerVictim = -1;
            } else if (t - p.lurkSince > 180) {
              this.chooseLurk(p);
            }
          }
        } else if (!p.moving) {
          if (!p.target) return;
          const waited = t - p.lurkSince;
          const guardNear = this.nearestAwakeGuard(p.x, p.z, 35) >= 0;
          let walkerNear = false;
          for (let a = 0; a < agents.length; a++) {
            if (agents[a].state === A_WALKING && dist(this.ap[a].x, this.ap[a].z, p.x, p.z) < 20) {
              walkerNear = true;
              break;
            }
          }
          if (!guardNear && (!walkerNear || waited > 120)) this.startAttack(i, t);
        }
        return;
      }
      case PERP_STATE.STALKING: {
        const v = p.victim;
        const a = agents[v];
        if (!a || a.state !== A_WALKING || a.dramaLock) {
          this.releaseVictim(p);
          p.cooldownUntil = t + 20;
          p.state = PERP_STATE.LURKING;
          p.lurkSince = t;
          this.chooseLurk(p);
          return;
        }
        if (!p.bold && this.nearestAwakeGuard(p.x, p.z, 10) >= 0) {
          this.releaseVictim(p);
          p.cooldownUntil = t + 60;
          p.state = PERP_STATE.LURKING;
          p.lurkSince = t;
          this.beat(t, "perp_flee", this.perpRef(i), p.x, p.z, "Spooked by a patrol — he melts back into the dark", 1);
          this.chooseLurk(p);
          return;
        }
        const vp = this.ap[v];
        const stalked = t - p.stalkSince;
        let byPolicy = false;
        if (!p.pounce && this.policy && !p.bold) {
          const r = this.policyStalk(i, t, stalked);
          if (r === "exit") return;
          byPolicy = r === "wait";
        }
        if (!p.pounce && !byPolicy) {
          const bad = this.lightF(vp.x, vp.z) < 0.7 || this.camCovering(vp.x, vp.z) < 0;
          if ((stalked > 8 && bad) || stalked > 45) p.pounce = true;
        }
        if (t >= p.repathAt || !p.moving) {
          this.setPath(p, vp.x, vp.z);
          p.repathAt = t + 3;
        }
        const d0 = dist(p.x, p.z, vp.x, vp.z);
        const speed = p.pounce ? POUNCE_SPEED : d0 > 12 ? STALK_SPEED : a.speed * 0.95;
        this.move(p, speed);
        if (p.pounce && dist(p.x, p.z, vp.x, vp.z) < 3.2) this.startAttack(i, t);
        return;
      }
      case PERP_STATE.ATTACKING: {
        if (t >= p.attackEnd) this.startFlee(i, t);
        return;
      }
      case PERP_STATE.FLEEING: {
        // sprint away, then slow to a casual walk to blend in
        if (this.move(p, t - p.fleeStart < 15 ? FLEE_SPEED : BLEND_SPEED)) {
          p.state = PERP_STATE.ESCAPED;
          if (p.inc) p.inc.rec.perpOutcome = "escaped";
          this.beat(
            t,
            "perp_escaped",
            this.perpRef(i),
            p.x,
            p.z,
            p.inc
              ? `The ${PERP_KIND_LABEL[p.kind]} got away through ${p.exit?.name ?? "the dark"}`
              : `The ${PERP_KIND_LABEL[p.kind]} left through ${p.exit?.name ?? "the dark"}`,
            p.inc ? 3 : 1,
            p.inc?.rec.eventId ?? null
          );
        }
        return;
      }
      default:
        return;
    }
  }

  private findVictim(p: PerpRT, t: number): number {
    const { agents } = this.ctx;
    if (p.openerVictim >= 0) {
      const v = p.openerVictim;
      const a = agents[v];
      if (a.state === A_WALKING && !a.dramaLock && this.agentDrama[v] === VICTIM_STATE.NORMAL) {
        if (dist(this.ap[v].x, this.ap[v].z, p.x, p.z) < 80) return v;
      }
      return -1;
    }
    let best = -1;
    let bs = 1.0;
    const impatience = Math.min(0.8, (t - p.lurkSince) / 300);
    for (let ai = 0; ai < agents.length; ai++) {
      const a = agents[ai];
      if (a.state !== A_WALKING || a.dramaLock || this.agentDrama[ai] !== VICTIM_STATE.NORMAL) continue;
      const q = this.ap[ai];
      const d = dist(q.x, q.z, p.x, p.z);
      if (d > 50) continue;
      if (this.nearestAwakeGuard(q.x, q.z, 35) >= 0) continue;
      let lonely = true;
      for (let bi = 0; bi < agents.length; bi++) {
        if (bi === ai || agents[bi].state !== A_WALKING) continue;
        if (dist(this.ap[bi].x, this.ap[bi].z, q.x, q.z) < 15) {
          lonely = false;
          break;
        }
      }
      const lf = this.lightF(q.x, q.z);
      const cov = this.camCovering(q.x, q.z) >= 0;
      const sc = 1.2 * (1 - lf) + (cov ? 0 : 0.5) + (lonely ? 0.5 : -0.4) - d / 100 + impatience;
      if (sc > bs) {
        bs = sc;
        best = ai;
      }
    }
    return best;
  }

  private startAttack(i: number, t: number) {
    const p = this.perps[i];
    const { agents, world } = this.ctx;
    let x = p.x;
    let z = p.z;
    let targetId: string | null = null;
    let victimIdx: number | null = null;
    if (p.victim >= 0) {
      const vp = this.ap[p.victim];
      x = vp.x;
      z = vp.z;
      victimIdx = p.victim;
      const a = agents[p.victim];
      a.dramaLock = true;
      this.agentDrama[p.victim] = VICTIM_STATE.VICTIM;
      p.x = x + 0.9;
      p.z = z;
    } else if (p.target) {
      x = p.target.x;
      z = p.target.z;
      targetId = p.target.id;
    }
    const targetCam = p.target?.type === "camera" ? p.target.idx : -1;
    const blindSpot = this.camCovering(x, z, targetCam) < 0;
    const id = `inc_${(this.incCounter++).toString(36)}_${t}`;
    const rec: IncidentRecord = {
      eventId: id,
      perpIdx: i,
      kind: p.kind,
      tStart: t,
      x,
      z,
      severity: SEVERITY[p.kind],
      victimIdx,
      targetId,
      blindSpot,
      detectedSec: null,
      detectedBy: null,
      dispatchedSec: null,
      guardArrivalSec: null,
      perpOutcome: "at_large",
      caughtSec: null,
    };
    const inc: IncRT = {
      rec,
      rt: null,
      screamAt: 0,
      screamed: false,
      residentAt: 0,
      residentName: "",
      residentDone: false,
      camAcc: this.cams.map(() => 0),
      dispatchedBeat: false,
      arrivedBeat: false,
      targetCam,
      victimAction: null,
    };
    // who might hear it
    let victimAction: VictimAction | null = null;
    if (victimIdx !== null && this.policy) {
      const g = this.nearestGuardState(x, z);
      victimAction = this.decide(
        victimKey(p.kind, lightingOf(this.lightF(x, z)), guardDistOf(g.d)),
        VICTIM_ACTIONS,
        this.agentRef(victimIdx),
        x,
        z,
        t
      ) as VictimAction | null;
    }
    inc.victimAction = victimAction;
    const screams = victimAction ?victimAction === "scream" : victimIdx !== null && this.rng.next() < SCREAM_P[p.kind];
    if (screams) inc.screamAt = t + (p.kind === "chain_snatcher" ? 1 : 3);
    let nearB = -1;
    let nd = RESIDENT_EARSHOT_M;
    world.buildings.forEach((b, bi) => {
      if (b.category !== "residential" && b.category !== "mixed") return;
      const e = b.entrance ?? { x: b.x, z: b.z };
      const d = dist(e.x, e.z, x, z);
      if (d < nd && (!targetId || b.id !== targetId)) {
        nd = d;
        nearB = bi;
      }
    });
    const rr = this.rng.next();
    const rdelay = this.rng.int(15, 60);
    if (nearB >= 0) {
      const pr = screams ? 0.75 : SILENT_RESIDENT_P[p.kind];
      if (rr < pr) {
        inc.residentAt = (screams ? inc.screamAt : t + 20) + rdelay;
        inc.residentName = world.buildings[nearB].name || "a nearby flat";
      }
    }
    p.inc = inc;
    p.state = PERP_STATE.ATTACKING;
    p.attackEnd = t + ATTACK_SEC[p.kind];
    p.moving = false;
    this.incidents.push(inc);

    const variant = this.incCounter % 2;
    let line: string;
    switch (p.kind) {
      case "mugger":
        line = variant ? "Hand over your phone — now!" : "Wallet. Quick. Don't make a sound.";
        break;
      case "harasser":
        line = variant ? "Hey! Where are you going so late? Talk to me!" : "Why are you walking alone, huh? Come here.";
        break;
      case "chain_snatcher":
        line = variant ? "Chain snatched — he yanked it and ran!" : "Got the chain — go, go, go!";
        break;
      case "burglar":
        line = `Back door of ${p.target?.name ?? "a flat"} is forced open… nobody's watching.`;
        break;
      case "vandal":
        line = p.target?.type === "camera" ? "Smash! Somebody is taking out a CCTV camera." : "Lights out — someone is smashing a streetlight.";
        break;
    }
    this.beat(t, "attack_start", this.perpRef(i), x, z, line, SEVERITY[p.kind] === 1 ? 2 : 3, id, victimIdx !== null ? this.agentRef(victimIdx) : undefined);
    if (blindSpot) {
      this.beat(t, "cctv_missed", this.perpRef(i), x, z, "Incident in a blind spot — no camera saw it", 2, id);
    }
  }

  private startFlee(i: number, t: number) {
    const p = this.perps[i];
    const { guards, agents } = this.ctx;
    // vandal damage lands at the end of the attack
    if (p.kind === "vandal" && p.target && p.state === PERP_STATE.ATTACKING && t >= p.attackEnd) {
      if (p.target.type === "camera") this.smashedCams.add(p.target.idx);
      else this.lights = this.lights.filter((l) => l.id !== p.target!.id);
    }
    // choose exit: shortest, but avoid exits with an awake guard nearby
    let best: Exit | null = null;
    let bs = Infinity;
    for (const e of this.exits) {
      let sc = dist(e.x, e.z, p.x, p.z);
      for (let gi = 0; gi < guards.length; gi++) {
        if (!this.awake(gi)) continue;
        if (dist(this.gp[gi].x, this.gp[gi].z, e.x, e.z) < 50) sc += 200;
        if (dist(this.gp[gi].x, this.gp[gi].z, (e.x + p.x) / 2, (e.z + p.z) / 2) < 30) sc += 80;
      }
      if (sc < bs) {
        bs = sc;
        best = e;
      }
    }
    p.exit = best;
    p.state = PERP_STATE.FLEEING;
    p.fleeStart = t;
    if (best) this.setPath(p, best.x, best.z);
    else p.path = [];
    this.beat(
      t,
      "perp_flee",
      this.perpRef(i),
      p.x,
      p.z,
      `He's running toward ${best ? best.name : "the dark"}!`,
      2,
      p.inc?.rec.eventId ?? null
    );
    // victim runs for safety
    const v = p.victim;
    if (v >= 0 && agents[v].dramaLock) {
      const q = this.ap[v];
      const va = p.inc?.victimAction ?? null;
      const gi =
        va === "flee_to_building" ? -1 : this.nearestAwakeGuard(q.x, q.z, va === "flee_to_guard" ? 150 : 60);
      let tx: number;
      let tz: number;
      if (gi >= 0) {
        tx = this.gp[gi].x;
        tz = this.gp[gi].z;
      } else {
        let bd = Infinity;
        tx = q.x;
        tz = q.z;
        for (const b of this.ctx.world.buildings) {
          const e = b.entrance ?? { x: b.x, z: b.z };
          const d = dist(e.x, e.z, q.x, q.z);
          if (d < bd) {
            bd = d;
            tx = e.x;
            tz = e.z;
          }
        }
      }
      const a = agents[v];
      a.path = this.route(q.x, q.z, tx, tz);
      a.segIdx = 0;
      a.segT = 0;
      this.agentDrama[v] = VICTIM_STATE.FLEEING;
    }
    p.victim = -1;
  }

  private stepVictims() {
    const { agents } = this.ctx;
    for (let ai = 0; ai < agents.length; ai++) {
      if (this.agentDrama[ai] !== VICTIM_STATE.FLEEING) continue;
      const a = agents[ai];
      const r = advanceAlong(a.path, a, VICTIM_RUN);
      if (r.finished) {
        a.state = A_ARRIVED;
        a.returnAt = -1;
        a.dramaLock = false;
        this.agentDrama[ai] = VICTIM_STATE.NORMAL;
      }
    }
  }

  /* --------------------------- detection --------------------------- */

  private detect(inc: IncRT, t: number, src: DetectionSource, guardIdx = -1) {
    if (inc.rec.detectedSec !== null) return;
    inc.rec.detectedSec = t;
    inc.rec.detectedBy = src;
    const p = this.perps[inc.rec.perpIdx];
    const rt: EventRT = {
      sched: {
        id: inc.rec.eventId,
        t: inc.rec.tStart,
        type: inc.rec.kind,
        severity: inc.rec.severity,
        x: inc.rec.x,
        z: inc.rec.z,
        node: -1,
      },
      assignedGuard: null,
      arrival: null,
      resolved: null,
      outcome: "open",
      drama: true,
    };
    inc.rt = rt;
    this.ctx.eventRt.set(rt.sched.id, rt);
    if (guardIdx >= 0) {
      const g = this.ctx.guards[guardIdx];
      if (this.freeGuard(g) && this.awake(guardIdx)) {
        const gp = this.gp[guardIdx];
        g.path = this.route(gp.x, gp.z, p.x, p.z);
        g.segIdx = 0;
        g.segT = 0;
        g.state = G_RESPONDING;
        g.assignedEvent = rt.sched.id;
        g.sprint = true;
        g.chaseAt = t;
        rt.assignedGuard = guardIdx;
        rt.outcome = "assigned";
      }
    }
  }

  private stepIncidents(t: number) {
    const { guards } = this.ctx;
    for (const inc of this.incidents) {
      const p = this.perps[inc.rec.perpIdx];
      const id = inc.rec.eventId;
      const active = p.state === PERP_STATE.ATTACKING;
      const lf = active || p.state === PERP_STATE.FLEEING ? this.lightF(p.x, p.z) : 0;

      // CCTV: accumulate evidence while the attack is on camera
      if (active && inc.rec.detectedSec === null) {
        for (let j = 0; j < this.cams.length; j++) {
          if (j === inc.targetCam || this.smashedCams.has(j)) continue;
          if (!cctvCovers(this.cams[j], p.x, p.z, this.rangeScale)) continue;
          inc.camAcc[j] += this.vis * (0.3 + 0.7 * lf);
          if (inc.camAcc[j] >= CCTV_DETECT_SCORE) {
            this.detect(inc, t, "cctv");
            this.beat(
              t,
              "cctv_detect",
              { kind: "camera", idx: j, id: this.cams[j].id },
              inc.rec.x,
              inc.rec.z,
              `Camera ${j + 1} caught it — ${PERP_KIND_LABEL[p.kind]} on ${this.placeName(inc.rec.x, inc.rec.z)}!`,
              3,
              id,
              this.perpRef(inc.rec.perpIdx)
            );
            break;
          }
        }
      }

      // guard line of sight
      if (active || (p.state === PERP_STATE.FLEEING && t - p.fleeStart < 15)) {
        for (let gi = 0; gi < guards.length; gi++) {
          const g = guards[gi];
          if (g.cond === GUARD_CONDITION.ASLEEP) continue;
          const range = GUARD_SIGHT_M * this.vis * (0.5 + 0.5 * lf) * (g.cond === GUARD_CONDITION.DROWSY ? 0.45 : 1);
          if (dist(this.gp[gi].x, this.gp[gi].z, p.x, p.z) > range) continue;
          const first = inc.rec.detectedSec === null;
          if (first) {
            this.detect(inc, t, "guard", gi);
            this.beat(
              t,
              "guard_spots",
              this.guardRef(gi),
              this.gp[gi].x,
              this.gp[gi].z,
              `${this.gname(gi)}: "Hey! You there — stop right now!"`,
              3,
              id,
              this.perpRef(inc.rec.perpIdx)
            );
          }
          if (active) this.startFlee(inc.rec.perpIdx, t);
          break;
        }
      }

      // victim scream
      if (inc.screamAt > 0 && !inc.screamed && t >= inc.screamAt && inc.rec.victimIdx !== null) {
        inc.screamed = true;
        const v = inc.rec.victimIdx;
        const line =
          p.kind === "chain_snatcher" ? "Thief! He took my chain! Stop him!" : p.kind === "harasser" ? "Leave me alone! Somebody help!" : "Help! Someone help me!";
        this.beat(t, "victim_scream", this.agentRef(v), this.ap[v].x, this.ap[v].z, line, 3, id);
        let heard = -1;
        let hd = EARSHOT_M;
        for (let gi = 0; gi < guards.length; gi++) {
          const d = dist(this.gp[gi].x, this.gp[gi].z, inc.rec.x, inc.rec.z);
          if (d > EARSHOT_M) continue;
          if (guards[gi].cond === GUARD_CONDITION.ASLEEP) this.wake(gi, t, "scream");
          if (guards[gi].cond !== GUARD_CONDITION.ASLEEP && d < hd) {
            hd = d;
            heard = gi;
          }
        }
        if (heard >= 0) this.detect(inc, t, "scream", heard);
      }

      // resident calls it in
      if (inc.residentAt > 0 && !inc.residentDone && t >= inc.residentAt) {
        inc.residentDone = true;
        if (inc.rec.detectedSec === null && p.state !== PERP_STATE.CAUGHT) {
          this.detect(inc, t, "resident");
          this.beat(
            t,
            "resident_alert",
            { kind: "agent", idx: -1, id: inc.residentName },
            inc.rec.x,
            inc.rec.z,
            `A resident of ${inc.residentName} calls the gate: "Something's wrong outside — send someone!"`,
            2,
            id
          );
        }
      }
    }
  }

  private stepChaseAndCatch(t: number) {
    const { guards, agents } = this.ctx;
    for (const inc of this.incidents) {
      const pi = inc.rec.perpIdx;
      const p = this.perps[pi];
      if (p.state !== PERP_STATE.ATTACKING && p.state !== PERP_STATE.FLEEING) continue;
      const id = inc.rec.eventId;

      // chase: the responding guard keeps re-routing toward the perp (or intercepts at the exit)
      const rt = inc.rt;
      if (rt && rt.assignedGuard !== null) {
        const gi = rt.assignedGuard;
        const g = guards[gi];
        if (g.assignedEvent === id && g.state === G_RESPONDING && g.cond !== GUARD_CONDITION.ASLEEP && t - g.chaseAt >= 4) {
          const gp = this.gp[gi];
          const d = dist(gp.x, gp.z, p.x, p.z);
          // intercept at the exit when the guard can get there first, else chase
          const ex = p.exit ?? this.nearestExit(p.x, p.z);
          const intercept =
            ex && d > 25 && dist(gp.x, gp.z, ex.x, ex.z) < dist(p.x, p.z, ex.x, ex.z) * 1.15;
          const tgt = intercept ? ex : { x: p.x, z: p.z };
          g.path = this.route(gp.x, gp.z, tgt.x, tgt.z);
          g.segIdx = 0;
          g.segT = 0;
          g.chaseAt = t;
        }
      }

      // catch
      for (let gi = 0; gi < guards.length; gi++) {
        const g = guards[gi];
        if (g.cond === GUARD_CONDITION.ASLEEP) continue;
        if (!(this.freeGuard(g) || g.assignedEvent === id)) continue;
        if (dist(this.gp[gi].x, this.gp[gi].z, p.x, p.z) > CATCH_RADIUS) continue;
        // caught!
        if (inc.rec.detectedSec === null) this.detect(inc, t, "guard");
        const r = inc.rt!;
        if (r.assignedGuard !== null && r.assignedGuard !== gi) {
          const o = guards[r.assignedGuard];
          if (o.assignedEvent === id) {
            o.assignedEvent = null;
            o.sprint = false;
            o.state = G_ON_SCENE;
            o.dwellUntil = t;
          }
        }
        r.assignedGuard = gi;
        r.outcome = "assigned";
        if (r.arrival === null) r.arrival = t;
        g.assignedEvent = id;
        g.state = G_ON_SCENE;
        g.dwellUntil = t + 90;
        g.sprint = false;
        p.state = PERP_STATE.CAUGHT;
        inc.rec.perpOutcome = "caught";
        inc.rec.caughtSec = t;
        if (p.victim >= 0) {
          const v = p.victim;
          agents[v].dramaLock = false;
          this.agentDrama[v] = VICTIM_STATE.NORMAL;
          p.victim = -1;
        }
        this.beat(
          t,
          "perp_caught",
          this.guardRef(gi),
          p.x,
          p.z,
          `Got him! ${this.gname(gi)} caught the ${PERP_KIND_LABEL[p.kind]}.`,
          3,
          id,
          this.perpRef(pi)
        );
        break;
      }
    }
  }

  /** After engine assignment: dispatch / arrival beats. */
  post(t: number) {
    const { guards } = this.ctx;
    for (const inc of this.incidents) {
      const rt = inc.rt;
      if (!rt) continue;
      if (rt.assignedGuard !== null && !inc.dispatchedBeat) {
        inc.dispatchedBeat = true;
        inc.rec.dispatchedSec = t;
        const gi = rt.assignedGuard;
        const asleep = guards[gi].cond === GUARD_CONDITION.ASLEEP;
        const place = this.placeName(inc.rec.x, inc.rec.z);
        this.beat(
          t,
          "guard_dispatched",
          this.guardRef(gi),
          this.gp[gi]?.x ?? inc.rec.x,
          this.gp[gi]?.z ?? inc.rec.z,
          asleep
            ? `Control room: "${this.gname(gi)}, respond to ${place}!" … no answer — he's asleep.`
            : `Control room: "${this.gname(gi)}, ${PERP_KIND_LABEL[inc.rec.kind]} on ${place} — go now!"`,
          2,
          inc.rec.eventId
        );
      }
      if (rt.arrival !== null && !inc.arrivedBeat) {
        inc.arrivedBeat = true;
        inc.rec.guardArrivalSec = rt.arrival;
        const gi = rt.assignedGuard ?? 0;
        if (inc.rec.caughtSec !== rt.arrival) {
          const p = positionOf(guards[gi].path, guards[gi]);
          this.beat(t, "guard_arrived", this.guardRef(gi), p.x, p.z, `${this.gname(gi)} is on scene at ${this.placeName(inc.rec.x, inc.rec.z)}`, 1, inc.rec.eventId);
        }
      }
    }
  }

  /* ----------------------------- output ----------------------------- */

  frame(): DramaFrame {
    const n = this.perps.length;
    const perpPos = new Float32Array(n * 2);
    const perpState = new Uint8Array(n);
    const perpKind = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const p = this.perps[i];
      perpPos[i * 2] = p.x;
      perpPos[i * 2 + 1] = p.z;
      perpState[i] = p.state;
      perpKind[i] = p.kindIdx;
    }
    const guardCondition = new Uint8Array(this.ctx.guards.length);
    for (let i = 0; i < this.ctx.guards.length; i++) guardCondition[i] = this.ctx.guards[i].cond;
    return { perpPos, perpState, perpKind, agentDrama: this.agentDrama.slice(), guardCondition };
  }

  finalize(): {
    events: StoredRunEvent[];
    incidents: IncidentRecord[];
    beats: IncidentBeat[];
    guardAsleepSec: number;
    decisions: PolicyDecision[];
  } {
    const { guards } = this.ctx;
    const events: StoredRunEvent[] = this.incidents.map((inc) => {
      const r = inc.rec;
      const rt = inc.rt;
      if (rt && rt.arrival !== null) r.guardArrivalSec = rt.arrival;
      let outcome: string;
      // A guard reaching the scene after the perpetrator got away is not a resolution.
      // If a camera covered the incident, the footage gives police a lead, so the case stays traceable.
      if (!guards.length && r.perpOutcome !== "caught") outcome = "no_guard";
      else if (r.perpOutcome === "escaped") outcome = r.blindSpot ? "perp_escaped" : "escaped_on_cctv";
      else if (rt && rt.resolved !== null) outcome = "resolved";
      else if (rt && rt.outcome === "unreachable") outcome = "unreachable";
      else if (rt && rt.assignedGuard !== null) outcome = "open_at_end";
      else if (!guards.length || r.detectedSec !== null) outcome = "no_guard";
      else outcome = "open_at_end";
      const parts: string[] = [`Synthetic ${PERP_KIND_LABEL[r.kind]} incident`];
      parts.push(r.blindSpot ? "in a CCTV blind spot" : "within camera coverage");
      if (r.detectedSec !== null) parts.push(`detected by ${r.detectedBy} after ${r.detectedSec - r.tStart} s`);
      else parts.push("never detected");
      if (rt && rt.assignedGuard !== null) {
        parts.push(`${this.gname(rt.assignedGuard)} ${rt.arrival !== null ? `on scene at ${rt.arrival} s` : "still en route at end"}`);
      }
      parts.push(r.perpOutcome === "caught" ? "perpetrator caught" : r.perpOutcome === "escaped" ? "perpetrator escaped" : "perpetrator still at large");
      return {
        id: r.eventId,
        tSec: r.tStart,
        type: r.kind,
        severity: r.severity,
        x: r.x,
        z: r.z,
        assignedGuardId: rt && rt.assignedGuard !== null ? guards[rt.assignedGuard].def.id : null,
        guardArrivalSec: rt && rt.arrival !== null ? Math.round(rt.arrival) : null,
        resolvedSec: rt && rt.resolved !== null ? Math.round(rt.resolved) : null,
        outcome,
        note: parts.join(" · ") + ".",
      };
    });
    // stable sort by time (beats are pushed in time order already; keep insertion order for ties)
    const beats = this.beats.map((b, i) => ({ b, i })).sort((a, b) => a.b.tSec - b.b.tSec || a.i - b.i).map((x) => x.b);
    return { events, incidents: this.incidents.map((i) => i.rec), beats, guardAsleepSec: this.asleepSec, decisions: this.decisions };
  }
}

function pointAlong(path: Pt[], d: number): Pt {
  if (!path.length) return { x: 0, z: 0 };
  const ref = { segIdx: 0, segT: 0 };
  const r = advanceAlong(path, ref, Math.max(0, d));
  return { x: r.x, z: r.z };
}

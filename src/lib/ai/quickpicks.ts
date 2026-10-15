/**
 * "Jev quick picks" — instant planner, stage 1 + stage 2.
 *
 * Stage 1 (code): generate concrete candidate interventions from the baseline
 *   run (camera on each blind-spot incident / uncovered lane, light on each
 *   poorly lit lane, patrol re-route through hotspots, one extra guard), each
 *   with a cost from COST_ASSUMPTIONS and measured evidence.
 * Stage 1b (Jev, server): one batched request scores every candidate
 *   (Score: expected safety impact; Noul: "is this redundant / watching a wall?").
 * Stage 2 (simulation): verify the top picks with a same-seed single-change
 *   run of the BASELINE (risk reduced per ₹), like the compare.ts ablation.
 *
 * Pure: shared by the browser (generation + verification) and the server route.
 */

import type { PraesidiumProject, StoredRun, StoredRunEvent, World } from "../world/types";
import { COST_ASSUMPTIONS } from "../world/types";
import { computeCoverage, cctvCovers, type CoverageResult } from "../sim/scenarios";
import { EVENT_TYPE_LABEL } from "../sim/labels";
import { applyProposal, type Proposal, type ProposalOp } from "./schema";
import { deepClone } from "../world/ids";
import { runSimulation } from "../sim/engine";
import { riskIndex } from "../sim/compare";

export type CandidateKind = "camera" | "light" | "patrol" | "guard";

export interface CandidateEvidence {
  /** baseline incidents within 30 m */
  incidentsNear: number;
  blindSpotIncidentsNear: number;
  severityNear: number;
  escapedNear: number;
  /** median guard response (s) to incidents near this spot, null if none responded */
  responseSecNear: number | null;
  /** 0..1 fraction of the modeled walkway samples in view that are lit / on CCTV */
  litFraction: number;
  cctvFraction: number;
  /** cameras: walkway samples inside the new camera's view; lights: walkway samples in its radius */
  walkwaySamplesInView: number;
  /** cameras: how many of those samples an existing camera already covers (0..1) */
  overlapWithExisting: number;
  /** lights: existing working lights within the radius */
  existingLightsNear: number;
  note: string;
}

export interface Candidate {
  id: string;
  kind: CandidateKind;
  label: string;
  costInr: number;
  x: number;
  z: number;
  evidence: CandidateEvidence;
  ops: ProposalOp[];
  /** Baseline incident type this candidate targets (perp kind), when it targets one. */
  incidentType?: string;
}

export interface CandidateScore {
  /** 0..1 expected safety impact (Jev Score normalised) */
  impact: number;
  /** 0..1 probability the change is redundant / watches an empty wall (Jev Noul) */
  redundant: number;
  /** combined rank value */
  rank: number;
}

export interface VerifiedPick {
  id: string;
  riskBefore: number;
  riskAfter: number;
  riskReduced: number;
  /** risk-index points reduced per ₹1 lakh (null when free) */
  riskPerLakh: number | null;
  incidentsDelta: number;
  caughtDelta: number;
}

const isIncident = (e: StoredRunEvent) => e.type in EVENT_TYPE_LABEL;
const d2 = (ax: number, az: number, bx: number, bz: number) => (ax - bx) ** 2 + (az - bz) ** 2;
const r0 = (v: number) => Math.round(v);

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function evidenceAt(
  x: number,
  z: number,
  radius: number,
  incidents: StoredRunEvent[],
  cov: CoverageResult,
  inView: (sx: number, sz: number) => boolean
): Omit<CandidateEvidence, "overlapWithExisting" | "existingLightsNear" | "note"> {
  const near = incidents.filter((e) => d2(e.x, e.z, x, z) < 30 * 30);
  let n = 0;
  let lit = 0;
  let cc = 0;
  cov.samples.forEach((s, i) => {
    if (d2(s.x, s.z, x, z) > radius * radius || !inView(s.x, s.z)) return;
    n++;
    if (cov.perSample[i].lit) lit++;
    if (cov.perSample[i].cctv) cc++;
  });
  return {
    incidentsNear: near.length,
    blindSpotIncidentsNear: near.filter((e) => e.outcome === "perp_escaped" || /blind spot/.test(e.note)).length,
    severityNear: near.reduce((s, e) => s + e.severity, 0),
    escapedNear: near.filter((e) => e.outcome === "perp_escaped" || e.outcome === "escaped_on_cctv").length,
    responseSecNear: median(near.filter((e) => e.guardArrivalSec !== null).map((e) => e.guardArrivalSec! - e.tSec)),
    litFraction: n ? Math.round((lit / n) * 100) / 100 : 0,
    cctvFraction: n ? Math.round((cc / n) * 100) / 100 : 0,
    walkwaySamplesInView: n,
  };
}

/** Nearest walkway sample to a point (cameras / lights sit next to paths). */
function nearestSample(cov: CoverageResult, x: number, z: number, minD = 0) {
  let best = cov.samples[0];
  let bd = Infinity;
  for (const s of cov.samples) {
    const d = d2(s.x, s.z, x, z);
    if (d < minD * minD) continue;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function cameraCandidate(id: string, label: string, cx: number, cz: number, tx: number, tz: number, world: World, cov: CoverageResult, incidents: StoredRunEvent[], rangeScale: number, why: string): Candidate {
  const orientationDeg = Math.round((Math.atan2(tz - cz, tx - cx) * 180) / Math.PI);
  const cam = { id: "tmp", x: cx, z: cz, height: 6.5, range: 28, fovDeg: 80, orientationDeg, active: true };
  const ev = evidenceAt(cx, cz, 28 * rangeScale, incidents, cov, (sx, sz) => cctvCovers(cam, sx, sz, rangeScale));
  return {
    id,
    kind: "camera",
    label,
    costInr: COST_ASSUMPTIONS.cameraInstallInr,
    x: cx,
    z: cz,
    evidence: { ...ev, overlapWithExisting: ev.cctvFraction, existingLightsNear: 0, note: why },
    ops: [{ op: "add_camera", x: r0(cx), z: r0(cz), range: 28, fovDeg: 80, orientationDeg }],
  };
}

/** Stage 1: code-generated candidates with cost + baseline evidence. */
export function generateCandidates(project: PraesidiumProject, baseline: StoredRun, max = 14): Candidate[] {
  const world = baseline.world;
  const sc = baseline.scenario;
  const cov = computeCoverage(world, sc.ambientVisibility, sc.cctvRangeScale);
  if (!cov.samples.length) return [];
  const incidents = baseline.events.filter(isIncident);
  const out: Candidate[] = [];
  const taken: { x: number; z: number; kind: CandidateKind }[] = [];
  const free = (x: number, z: number, kind: CandidateKind, gap = 25) => !taken.some((t) => t.kind === kind && d2(t.x, t.z, x, z) < gap * gap);

  // 1) camera on each blind-spot / escaped incident location
  const bad = incidents
    .filter((e) => e.outcome === "perp_escaped" || /blind spot/.test(e.note))
    .sort((a, b) => b.severity - a.severity || a.tSec - b.tSec);
  for (const e of bad) {
    if (out.filter((c) => c.kind === "camera").length >= 4) break;
    if (!free(e.x, e.z, "camera")) continue;
    const s = nearestSample(cov, e.x, e.z, 10);
    taken.push({ x: e.x, z: e.z, kind: "camera" });
    out.push({
      ...cameraCandidate(`cam_inc_${out.length}`, `CCTV on blind-spot ${EVENT_TYPE_LABEL[e.type] ?? e.type} spot (${r0(e.x)}, ${r0(e.z)})`, s.x, s.z, e.x, e.z, world, cov, incidents, sc.cctvRangeScale, `aimed at a baseline ${e.type} incident (${e.outcome})`),
      incidentType: e.type,
    });
  }

  // 2) camera on the least-covered lanes
  const roads = world.roads.filter((r) => r.pedestrian !== false);
  const byCctv = roads
    .map((r) => ({ r, c: cov.perRoadCctv.get(r.id) ?? 0, samples: cov.samples.filter((s) => s.roadId === r.id) }))
    .filter((o) => o.samples.length >= 6 && o.c < 0.25)
    .sort((a, b) => b.samples.length - a.samples.length);
  for (const o of byCctv.slice(0, 6)) {
    if (out.filter((c) => c.kind === "camera").length >= 6) break;
    const m = o.samples[Math.floor(o.samples.length / 2)];
    const ahead = o.samples[Math.min(o.samples.length - 1, Math.floor(o.samples.length / 2) + 4)];
    if (!free(m.x, m.z, "camera")) continue;
    taken.push({ x: m.x, z: m.z, kind: "camera" });
    out.push(cameraCandidate(`cam_lane_${out.length}`, `CCTV covering ${o.r.name ?? "uncovered lane"} (${Math.round(o.c * 100)}% covered today)`, m.x, m.z, ahead.x, ahead.z, world, cov, incidents, sc.cctvRangeScale, "uncovered walkway segment"));
  }

  // 3) streetlight at the darkest point of each poorly lit lane (+ dark incident spots)
  const lightSpots: { x: number; z: number; why: string; name: string }[] = [];
  for (const r of roads) {
    const lit = cov.perRoadLit.get(r.id) ?? 1;
    if (lit >= 0.6) continue;
    let bi = -1;
    let bl = Infinity;
    cov.samples.forEach((s, i) => {
      if (s.roadId === r.id && cov.perSample[i].light < bl) {
        bl = cov.perSample[i].light;
        bi = i;
      }
    });
    if (bi >= 0) lightSpots.push({ x: cov.samples[bi].x, z: cov.samples[bi].z, why: `lane only ${Math.round(lit * 100)}% lit`, name: r.name ?? "dark lane" });
  }
  for (const e of incidents) lightSpots.push({ ...nearestSample(cov, e.x, e.z), why: `baseline ${e.type} incident spot`, name: `${EVENT_TYPE_LABEL[e.type] ?? e.type} spot` });
  for (const p of lightSpots) {
    if (out.filter((c) => c.kind === "light").length >= 5) break;
    if (!free(p.x, p.z, "light", 30)) continue;
    taken.push({ x: p.x, z: p.z, kind: "light" });
    const ev = evidenceAt(p.x, p.z, 18, incidents, cov, () => true);
    const existing = world.streetlights.filter((l) => l.on && l.maintenance !== "faulty" && d2(l.x, l.z, p.x, p.z) < 18 * 18).length;
    out.push({
      id: `light_${out.length}`,
      kind: "light",
      label: `Streetlight on ${p.name} (${r0(p.x)}, ${r0(p.z)})`,
      costInr: COST_ASSUMPTIONS.streetlightInstallInr,
      x: p.x,
      z: p.z,
      evidence: { ...ev, overlapWithExisting: 0, existingLightsNear: existing, note: p.why },
      ops: [{ op: "add_streetlight", x: r0(p.x), z: r0(p.z), brightness: 0.9, radius: 18 }],
    });
  }

  // 4) re-route the first guard through incident hotspots
  const g = world.guards.find((x) => x.active) ?? world.guards[0];
  if (g && incidents.length >= 2) {
    const hot: { x: number; z: number }[] = [];
    for (const e of incidents.slice().sort((a, b) => b.severity - a.severity)) {
      if (hot.length >= 6) break;
      if (hot.some((h) => d2(h.x, h.z, e.x, e.z) < 35 * 35)) continue;
      const s = nearestSample(cov, e.x, e.z);
      hot.push({ x: r0(s.x), z: r0(s.z) });
    }
    if (hot.length >= 2) {
      // nearest-neighbour order starting at the guard's first waypoint
      const start = g.waypoints[0] ?? hot[0];
      const order: { x: number; z: number }[] = [];
      const rest = hot.slice();
      let cur = start;
      while (rest.length) {
        rest.sort((a, b) => d2(a.x, a.z, cur.x, cur.z) - d2(b.x, b.z, cur.x, cur.z));
        cur = rest.shift()!;
        order.push(cur);
      }
      const cx = order.reduce((s, p) => s + p.x, 0) / order.length;
      const cz = order.reduce((s, p) => s + p.z, 0) / order.length;
      const sevAll = incidents.reduce((s, e) => s + e.severity, 0);
      out.push({
        id: "patrol_hot",
        kind: "patrol",
        label: `Re-route ${g.name || "guard"} through ${order.length} incident hotspots`,
        costInr: COST_ASSUMPTIONS.patrolWaypointEditInr,
        x: cx,
        z: cz,
        evidence: {
          incidentsNear: incidents.length,
          blindSpotIncidentsNear: bad.length,
          severityNear: sevAll,
          escapedNear: incidents.filter((e) => e.outcome === "perp_escaped" || e.outcome === "escaped_on_cctv").length,
          responseSecNear: median(incidents.filter((e) => e.guardArrivalSec !== null).map((e) => e.guardArrivalSec! - e.tSec)),
          litFraction: 0,
          cctvFraction: 0,
          walkwaySamplesInView: 0,
          overlapWithExisting: 0,
          existingLightsNear: 0,
          note: `current patrol has ${g.waypoints.length} waypoints; guards on duty ${world.guards.filter((x) => x.active).length}`,
        },
        ops: [{ op: "set_patrol", guardId: g.id, waypoints: order.slice(0, 8) }],
      });
    }
  }

  // 5) one extra guard
  const onDuty = sc.guardCount ?? world.guards.filter((x) => x.active).length;
  if (onDuty < 20) {
    out.push({
      id: "guard_plus1",
      kind: "guard",
      label: `Add one night guard (${onDuty} → ${onDuty + 1})`,
      costInr: COST_ASSUMPTIONS.guardNightInr,
      x: 0,
      z: 0,
      evidence: {
        incidentsNear: incidents.length,
        blindSpotIncidentsNear: bad.length,
        severityNear: incidents.reduce((s, e) => s + e.severity, 0),
        escapedNear: incidents.filter((e) => e.outcome === "perp_escaped" || e.outcome === "escaped_on_cctv").length,
        responseSecNear: median(incidents.filter((e) => e.guardArrivalSec !== null).map((e) => e.guardArrivalSec! - e.tSec)),
        litFraction: 0,
        cctvFraction: 0,
        walkwaySamplesInView: 0,
        overlapWithExisting: 0,
        existingLightsNear: 0,
        note: `${onDuty} guards on duty; ${baseline.metrics.guardAsleepMin ?? 0} guard-minutes asleep; ${incidents.filter((e) => e.outcome === "no_guard").length} incidents had no guard`,
      },
      ops: [{ op: "set_scenario", patch: { guardCount: onDuty + 1 } }],
    });
  }
  void project;
  return out.slice(0, max);
}

/** Compact, self-contained text for one candidate (used in Jev instructions). */
export function candidateBrief(c: Candidate): string {
  const e = c.evidence;
  const parts = [
    `${c.label}; cost ₹${c.costInr.toLocaleString("en-IN")}`,
    `baseline incidents within 30 m: ${e.incidentsNear} (blind-spot ${e.blindSpotIncidentsNear}, escaped ${e.escapedNear}, severity sum ${e.severityNear})`,
    e.responseSecNear !== null ? `median guard response nearby ${e.responseSecNear} s` : "no guard reached incidents nearby",
  ];
  if (c.kind === "camera") parts.push(`walkway points in view ${e.walkwaySamplesInView}, already on CCTV ${Math.round(e.overlapWithExisting * 100)}%, lit ${Math.round(e.litFraction * 100)}%`);
  if (c.kind === "light") parts.push(`walkway points in radius ${e.walkwaySamplesInView}, already lit ${Math.round(e.litFraction * 100)}%, working lights within 18 m: ${e.existingLightsNear}`);
  parts.push(e.note);
  return parts.join("; ");
}

/** Fallback scoring when Jev is unavailable (clearly labeled in the UI). */
export function heuristicScore(c: Candidate): CandidateScore {
  const e = c.evidence;
  let impact = Math.min(1, 0.12 * e.severityNear + 0.18 * e.blindSpotIncidentsNear);
  let redundant = 0;
  if (c.kind === "camera") redundant = e.walkwaySamplesInView < 3 ? 0.9 : e.overlapWithExisting;
  if (c.kind === "light") redundant = Math.min(1, e.litFraction + 0.25 * e.existingLightsNear);
  if (c.kind === "guard" || c.kind === "patrol") impact = Math.min(1, impact * 0.5);
  return { impact, redundant, rank: impact * (1 - 0.6 * redundant) };
}

export function rankValue(impact: number, redundant: number): number {
  return Math.round(impact * (1 - 0.6 * redundant) * 1000) / 1000;
}

/** Stage 2: same-seed single-change run of the BASELINE for one candidate. */
export function verifyCandidate(baseline: StoredRun, c: Candidate): VerifiedPick {
  const draft = {
    world: deepClone(baseline.world),
    scenario: deepClone(baseline.scenario),
  } as PraesidiumProject;
  const proposal: Proposal = { title: c.label, rationale: "quick pick verification", ops: c.ops, expectedEffects: [], limitations: [] };
  applyProposal(draft, proposal);
  const sim = runSimulation(draft.world, { ...draft.scenario, seed: baseline.seed });
  const before = riskIndex(baseline.events);
  const after = riskIndex(sim.events);
  const reduced = Math.round((before - after) * 10) / 10;
  const caught = (evs: StoredRunEvent[]) => evs.filter((e) => isIncident(e) && e.outcome === "resolved").length;
  return {
    id: c.id,
    riskBefore: before,
    riskAfter: after,
    riskReduced: reduced,
    riskPerLakh: c.costInr > 0 ? Math.round((reduced / (c.costInr / 100000)) * 100) / 100 : null,
    incidentsDelta: sim.events.filter(isIncident).length - baseline.events.filter(isIncident).length,
    caughtDelta: caught(sim.events) - caught(baseline.events),
  };
}

export function candidateProposal(c: Candidate): Proposal {
  return {
    title: c.label,
    rationale: `Jev quick pick: ${c.evidence.note}.`,
    ops: c.ops,
    expectedEffects: [],
    limitations: ["Quick pick — judged by TypeSafe Jev and verified with a same-seed simulation; not a prediction of real crime."],
  };
}

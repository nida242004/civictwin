/**
 * Metrics derived from simulation results + world geometry.
 * Never hardcoded — every number below is computed from the run.
 */

import type { RunMetrics, ScenarioConfig, StoredRunEvent, World } from "../world/types";
import { COST_ASSUMPTIONS } from "../world/types";
import { computeCoverage, applyOutages } from "./scenarios";
import type { SimulationResult } from "./engine";

export function computeMetrics(
  world: World,
  scenario: ScenarioConfig,
  sim: SimulationResult,
  opts: { label: "baseline" | "intervention"; baseWorld?: World }
): RunMetrics {
  const outages = applyOutages(world, scenario.lightingOutageFraction, scenario.seed);
  const effectiveLights = world.streetlights.map((l) => (outages.has(l.id) ? { ...l, on: false } : l));
  const coverage = computeCoverage(
    { ...world, streetlights: effectiveLights },
    scenario.ambientVisibility,
    scenario.cctvRangeScale
  );

  // reachability + completion from trip records
  const trips = sim.trips;
  const reachable = trips.filter((t) => t.reachable);
  const completed = reachable.filter((t) => t.completed);
  const avgLen = reachable.length ? reachable.reduce((s, t) => s + t.lengthM, 0) / reachable.length : 0;

  // poorly lit segments: road-level fraction < 0.5
  let poorlyLit = 0;
  let segmentsTotal = 0;
  for (const road of world.roads) {
    if (!road.pedestrian) continue;
    segmentsTotal += 1;
    const frac = coverage.perRoadLit.get(road.id) ?? 0;
    if (frac < 0.5) poorlyLit += 1;
  }

  // guard response stats
  const events = sim.events;
  const assigned = events.filter((e) => e.assignedGuardId !== null);
  const reached = events.filter((e) => e.guardArrivalSec !== null);
  const responseTimes = reached
    .map((e) => e.guardArrivalSec! - e.tSec)
    .filter((v) => v >= 0)
    .sort((a, b) => a - b);
  const avgResp = responseTimes.length
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : null;
  const medianResp = responseTimes.length
    ? responseTimes.length % 2 === 1
      ? responseTimes[(responseTimes.length - 1) / 2]
      : (responseTimes[responseTimes.length / 2 - 1] + responseTimes[responseTimes.length / 2]) / 2
    : null;

  const eventsByType: Record<string, number> = {};
  for (const e of events) eventsByType[e.type] = (eventsByType[e.type] ?? 0) + 1;

  const resolved = events.filter((e) => e.outcome === "resolved");

  // patrol coverage: % of walkable path length within 40m of any patrol waypoint polyline
  const patrolPoints: { x: number; z: number }[] = [];
  for (const g of world.guards) {
    if (!g.active) continue;
    for (const w of g.waypoints) patrolPoints.push(w);
  }
  let patrolCoveragePct: number | null = null;
  if (patrolPoints.length > 0 && coverage.samples.length > 0) {
    let within = 0;
    for (const smp of coverage.samples) {
      let best = Infinity;
      for (const p of patrolPoints) {
        const d = Math.hypot(p.x - smp.x, p.z - smp.z);
        if (d < best) best = d;
      }
      if (best <= 40) within += 1;
    }
    patrolCoveragePct = (within / coverage.samples.length) * 100;
  }

  // intervention cost vs baseWorld (only when baseWorld provided)
  let interventionCostInr: number | null = null;
  if (opts.baseWorld) {
    const base = opts.baseWorld;
    const newLights = world.streetlights.filter((l) => !base.streetlights.some((b) => b.id === l.id)).length;
    const newCams = world.cameras.filter((c) => !base.cameras.some((b) => b.id === c.id)).length;
    const baseGuards = base.guards.filter((g) => g.active).length;
    const newGuards = Math.max(0, world.guards.filter((g) => g.active).length - baseGuards);
    const movedOrEditedLights = world.streetlights.filter((l) => {
      const b = base.streetlights.find((x) => x.id === l.id);
      return b && (b.x !== l.x || b.z !== l.z || b.on !== l.on || b.brightness !== l.brightness);
    }).length;
    interventionCostInr =
      newLights * COST_ASSUMPTIONS.streetlightInstallInr +
      newCams * COST_ASSUMPTIONS.cameraInstallInr +
      newGuards * COST_ASSUMPTIONS.guardNightInr +
      movedOrEditedLights * Math.round(COST_ASSUMPTIONS.streetlightInstallInr * 0.1);
  }

  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

  return {
    tripsTotal: trips.length,
    tripsReachablePct: pct(reachable.length, trips.length),
    unreachableTrips: trips.length - reachable.length,
    avgRouteLengthM: round1(avgLen),
    routeCompletionPct: pct(completed.length, reachable.length),
    pathLenTotalM: round1(coverage.totalLenM),
    pathLenLitPct: round1(pct(coverage.litLenM, coverage.totalLenM)),
    poorlyLitSegments: poorlyLit,
    segmentsTotal,
    lightingOutages: effectiveLights.filter((l) => !l.on).length,
    cctvCoveragePct: round1(pct(coverage.cctvLenM, coverage.totalLenM)),
    uncoveredSegments: Array.from(coverage.perRoadCctv.values()).filter((v) => v < 0.05).length,
    eventsTotal: events.length,
    eventsWithGuardPct: round1(pct(assigned.length, events.length)),
    eventsReachedPct: round1(pct(reached.length, events.length)),
    avgResponseSec: avgResp !== null ? Math.round(avgResp) : null,
    medianResponseSec: medianResp !== null ? Math.round(medianResp) : null,
    unresolvedEvents: events.filter((e) => e.outcome !== "resolved").length,
    unreachableEvents: events.filter((e) => e.outcome === "unreachable").length,
    patrolCoveragePct: patrolCoveragePct !== null ? round1(patrolCoveragePct) : null,
    resolutionRatePct: round1(pct(resolved.length, events.length)),
    eventsByType,
    interventionCostInr,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

export interface MetricDiff {
  key: keyof RunMetrics;
  label: string;
  baseline: string;
  intervention: string;
  delta: string;
  betterWhenLower: boolean;
  kind?: string;
}

export function fmtMetric(key: keyof RunMetrics, v: number | null | undefined, kind?: string): string {
  if (v === null || v === undefined) return "—";
  const k = String(key);
  if (k.endsWith("Pct") || kind === "pct") return `${v.toFixed(1)}%`;
  if (k.endsWith("Sec") || kind === "time") return `${Math.round(v)} s`;
  if (k.endsWith("Inr") || kind === "currency") return `₹${Math.round(v).toLocaleString("en-IN")}`;
  if (k.endsWith("M") && !k.endsWith("Pct")) return `${v.toFixed(0)} m`;
  if (k.endsWith("Segments") || k.includes("outage") || k.includes("Outage")) return String(Math.round(v));
  return String(Math.round(v * 10) / 10);
}

export function compareRuns(baseline: RunMetrics, intervention: RunMetrics): MetricDiff[] {
  const rows: { key: keyof RunMetrics; label: string; betterWhenLower: boolean; kind?: string }[] = [
    { key: "pathLenLitPct", label: "Modeled lit path coverage", betterWhenLower: false, kind: "pct" },
    { key: "cctvCoveragePct", label: "Modeled CCTV coverage", betterWhenLower: false, kind: "pct" },
    { key: "poorlyLitSegments", label: "Poorly lit path segments", betterWhenLower: true },
    { key: "avgResponseSec", label: "Estimated avg. guard response", betterWhenLower: true, kind: "time" },
    { key: "medianResponseSec", label: "Estimated median guard response", betterWhenLower: true, kind: "time" },
    { key: "eventsReachedPct", label: "Events reached by a guard", betterWhenLower: false, kind: "pct" },
    { key: "resolutionRatePct", label: "Resolution rate (simulated)", betterWhenLower: false, kind: "pct" },
    { key: "unresolvedEvents", label: "Unresolved simulated events", betterWhenLower: true },
    { key: "tripsReachablePct", label: "Trips with reachable destinations", betterWhenLower: false, kind: "pct" },
    { key: "routeCompletionPct", label: "Route completion rate", betterWhenLower: false, kind: "pct" },
    { key: "patrolCoveragePct", label: "Patrol coverage (40 m of waypoints)", betterWhenLower: false, kind: "pct" },
    { key: "avgRouteLengthM", label: "Average route length", betterWhenLower: true, kind: "number" },
  ];
  return rows
    .map((r) => {
      const b = baseline[r.key] as number | null;
      const i = intervention[r.key] as number | null;
      const bs = fmtMetric(r.key, b, r.kind);
      const is = fmtMetric(r.key, i, r.kind);
      let delta = "—";
      if (b !== null && i !== null) {
        const d = i - b;
        const kind = r.kind ?? "number";
        if (Math.abs(d) < 0.05) delta = "no change";
        else if (kind === "pct") delta = `${d >= 0 ? "+" : ""}${d.toFixed(1)} pp`;
        else if (kind === "time") delta = `${d >= 0 ? "+" : ""}${Math.round(d)} s`;
        else if (kind === "currency") delta = `${d >= 0 ? "+" : "−"}₹${Math.abs(Math.round(d)).toLocaleString("en-IN")}`;
        else delta = `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d * 10) / 10)}`;
      }
      return { key: r.key, label: r.label, baseline: bs, intervention: is, delta, betterWhenLower: r.betterWhenLower, kind: r.kind };
    })
    .filter((r) => r.baseline !== "—" || r.intervention !== "—");
}

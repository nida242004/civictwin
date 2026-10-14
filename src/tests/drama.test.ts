import { describe, it, expect } from "vitest";
import { runSimulation, RADIO_WAKE_DELAY_SEC } from "@/lib/sim/engine";
import { computeMetrics, compareRuns } from "@/lib/sim/metrics";
import { scenarioTemplates } from "@/lib/sim/scenarios";
import { PERP_STATE, PERP_KINDS, GUARD_CONDITION } from "@/lib/sim/incidents";
import { buildDemoWorld } from "@/lib/world/demo";
import { defaultScenario, type ScenarioConfig } from "@/lib/world/types";

function hr(patch: Partial<ScenarioConfig> = {}): ScenarioConfig {
  return { ...defaultScenario("high_risk_night"), ...patch };
}

describe("incident drama (synthetic perpetrators)", () => {
  it("is deterministic: identical beats, incidents and drama frames", () => {
    const world = buildDemoWorld();
    const sc = hr({ durationSec: 900 });
    const a = runSimulation(world, sc);
    const b = runSimulation(world, sc);
    expect(a.beats.length).toBeGreaterThan(0);
    expect(JSON.stringify(a.beats)).toBe(JSON.stringify(b.beats));
    expect(JSON.stringify(a.incidents)).toBe(JSON.stringify(b.incidents));
    for (const t of [0, 100, 333, 899]) {
      expect(Array.from(a.frames[t].perpPos!)).toEqual(Array.from(b.frames[t].perpPos!));
      expect(Array.from(a.frames[t].perpState!)).toEqual(Array.from(b.frames[t].perpState!));
      expect(Array.from(a.frames[t].agentDrama!)).toEqual(Array.from(b.frames[t].agentDrama!));
      expect(Array.from(a.frames[t].guardCondition!)).toEqual(Array.from(b.frames[t].guardCondition!));
    }
  });

  it("emits frame arrays with stable lengths and valid enums", () => {
    const world = buildDemoWorld();
    const sc = hr({ durationSec: 600 });
    const r = runSimulation(world, sc);
    const n = r.frames[0].perpState!.length;
    expect(n).toBe(sc.perpCount);
    for (const f of r.frames) {
      expect(f.perpPos!.length).toBe(n * 2);
      expect(f.perpKind!.length).toBe(n);
      expect(f.agentDrama!.length).toBe(f.agentState.length);
      expect(f.guardCondition!.length).toBe(f.guardState.length);
      for (const s of f.perpState!) expect(Object.values(PERP_STATE)).toContain(s);
      for (const k of f.perpKind!) expect(k).toBeLessThan(PERP_KINDS.length);
      for (const c of f.guardCondition!) expect(Object.values(GUARD_CONDITION)).toContain(c);
    }
  });

  it("produces a visible incident within the first 3 minutes of the default demo run", () => {
    const r = runSimulation(buildDemoWorld(), defaultScenario("typical_night"));
    const first = r.beats.find((b) => b.kind === "attack_start");
    expect(first).toBeDefined();
    expect(first!.tSec).toBeLessThanOrEqual(180);
    // every incident has a stored event typed by perp kind
    for (const inc of r.incidents) {
      const ev = r.events.find((e) => e.id === inc.eventId);
      expect(ev?.type).toBe(inc.kind);
    }
  });

  it("an attack in a CCTV blind spot is never detected by CCTV", () => {
    const world = buildDemoWorld();
    world.cameras = [];
    const r = runSimulation(world, hr());
    expect(r.incidents.length).toBeGreaterThan(0);
    for (const inc of r.incidents) {
      expect(inc.blindSpot).toBe(true);
      expect(inc.detectedBy).not.toBe("cctv");
    }
    expect(r.beats.some((b) => b.kind === "cctv_detect")).toBe(false);
    expect(r.beats.filter((b) => b.kind === "cctv_missed").length).toBe(r.incidents.length);
  });

  it("a camera covering the spot detects the attack", () => {
    const world = buildDemoWorld();
    // one omnidirectional camera that sees the entire neighbourhood
    world.cameras = [{ id: "cam_all", x: 0, z: 0, height: 30, range: 600, fovDeg: 360, orientationDeg: 0, active: true }];
    const sc = hr({ incidentMix: { mugger: 1, harasser: 1, burglar: 1 } });
    const r = runSimulation(world, sc);
    expect(r.incidents.length).toBeGreaterThan(0);
    for (const inc of r.incidents) {
      expect(inc.blindSpot).toBe(false);
      expect(inc.detectedSec).not.toBeNull();
    }
    expect(r.incidents.some((i) => i.detectedBy === "cctv")).toBe(true);
    expect(r.beats.some((b) => b.kind === "cctv_detect")).toBe(true);
    expect(r.beats.some((b) => b.kind === "cctv_missed")).toBe(false);
  });

  it("sleeping guards respond slower", () => {
    const world = buildDemoWorld();
    let alert = 0;
    let tired = 0;
    let radioChecks = 0;
    for (const seed of [1, 2, 3, 4]) {
      for (const fatigue of [0, 1]) {
        const r = runSimulation(world, hr({ seed, guardFatigue: fatigue, eventsPerHour: 0.001, durationSec: 2400 }));
        const resp = r.incidents
          .filter((i) => i.detectedSec !== null && i.guardArrivalSec !== null)
          .map((i) => i.guardArrivalSec! - i.detectedSec!);
        const mean = resp.reduce((a, b) => a + b, 0) / Math.max(1, resp.length);
        if (fatigue === 0) {
          alert += mean;
          expect(r.guardAsleepSec).toBe(0);
        } else {
          tired += mean;
          expect(r.guardAsleepSec).toBeGreaterThan(0);
          expect(r.beats.some((b) => b.kind === "guard_asleep")).toBe(true);
        }
        // a guard radioed while asleep can never arrive before the wake delay
        for (const b of r.beats.filter((x) => x.kind === "guard_dispatched" && x.line.includes("asleep"))) {
          const inc = r.incidents.find((i) => i.eventId === b.eventId)!;
          if (inc.guardArrivalSec !== null && inc.perpOutcome !== "caught") {
            expect(inc.guardArrivalSec - b.tSec).toBeGreaterThanOrEqual(RADIO_WAKE_DELAY_SEC);
            radioChecks++;
          }
        }
      }
    }
    expect(tired).toBeGreaterThan(alert);
    void radioChecks;
  });

  it("adds drama metrics and shows them in compareRuns", () => {
    const world = buildDemoWorld();
    const sc = hr();
    const r = runSimulation(world, sc);
    const m = computeMetrics(world, sc, r, { label: "baseline" });
    expect(m.dramaIncidents).toBe(r.incidents.length);
    expect(m.incidentsDetectedPct).toBeGreaterThanOrEqual(0);
    expect(m.blindSpotIncidents).toBeLessThanOrEqual(m.dramaIncidents!);
    const rows = compareRuns(m, m).map((x) => x.key);
    expect(rows).toContain("incidentsDetectedPct");
    expect(rows).toContain("perpsCaughtPct");
  });

  it("legacy scenarios without drama fields behave as before (no perps)", () => {
    const world = buildDemoWorld();
    const sc = { ...defaultScenario("typical_night"), durationSec: 300 };
    delete sc.perpCount;
    delete sc.guardFatigue;
    const r = runSimulation(world, sc);
    expect(r.beats).toEqual([]);
    expect(r.incidents).toEqual([]);
    expect(r.frames[0].perpPos).toBeUndefined();
    const m = computeMetrics(world, sc, r, { label: "baseline" });
    expect(m.dramaIncidents).toBeUndefined();
  });

  it("ships a High-Risk Night template", () => {
    const ids = scenarioTemplates().map((s) => s.id);
    expect(ids).toEqual(["typical_night", "low_visibility_night", "high_risk_night"]);
  });
});

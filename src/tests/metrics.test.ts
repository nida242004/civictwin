import { describe, it, expect } from "vitest";
import { runSimulation } from "@/lib/sim/engine";
import { computeMetrics, compareRuns, fmtMetric } from "@/lib/sim/metrics";
import { buildDemoWorld } from "@/lib/world/demo";
import { defaultScenario, type ScenarioConfig } from "@/lib/world/types";

function scenario(patch: Partial<ScenarioConfig> = {}): ScenarioConfig {
  return { ...defaultScenario("typical_night"), durationSec: 300, population: 12, eventsPerHour: 60, ...patch };
}

describe("metrics computation", () => {
  it("derives all metrics from the run (nothing hardcoded)", () => {
    const world = buildDemoWorld();
    const sc = scenario();
    const sim = runSimulation(world, sc);
    const m = computeMetrics(world, sc, sim, { label: "baseline" });

    expect(m.eventsTotal).toBe(sim.events.length);
    const resolved = sim.events.filter((e) => e.outcome === "resolved").length;
    expect(m.resolutionRatePct).toBeCloseTo(sim.events.length ? (resolved / sim.events.length) * 100 : 0, 5);
    expect(m.tripsTotal).toBe(sim.trips.length);

    // response times only from reached events
    const reached = sim.events.filter((e) => e.guardArrivalSec !== null);
    if (reached.length) {
      const times = reached.map((e) => e.guardArrivalSec! - e.tSec).sort((a, b) => a - b);
      expect(m.avgResponseSec).toBe(Math.round(times.reduce((a, b) => a + b, 0) / times.length));
    }
  });

  it("handles zero-event and zero-guard cases without NaN or Infinity", () => {
    const world = buildDemoWorld();
    const sc = scenario({ eventsPerHour: 0, guardCount: 0, population: 6 });
    const sim = runSimulation(world, sc);
    const m = computeMetrics(world, sc, sim, { label: "baseline" });
    expect(m.avgResponseSec).toBeNull();
    expect(m.medianResponseSec).toBeNull();
    expect(Number.isFinite(m.resolutionRatePct)).toBe(true);
    expect(Number.isFinite(m.pathLenLitPct)).toBe(true);
    expect(Number.isFinite(m.cctvCoveragePct)).toBe(true);
  });

  it("computes intervention cost against a base world", () => {
    const world = buildDemoWorld();
    const sc = scenario({ population: 6, eventsPerHour: 0 });
    const sim = runSimulation(world, sc);
    const base = structuredClone(world);
    world.streetlights.push({ id: "sl_new", x: 0, z: 0, height: 8, brightness: 0.9, radius: 18, on: true, maintenance: "ok" });
    world.cameras.push({ id: "cam_new", x: 5, z: 5, height: 6, range: 30, fovDeg: 80, orientationDeg: 0, active: true });
    const m = computeMetrics(world, sc, sim, { label: "intervention", baseWorld: base });
    expect(m.interventionCostInr).toBe(14000 + 26000);
  });
});

describe("baseline / intervention comparison", () => {
  it("shows percentage-point deltas for pct metrics", () => {
    const base = structuredClone(defaultScenario("typical_night"));
    void base;
    const mBase = computeMetrics(
      buildDemoWorld(),
      scenario({ population: 6, eventsPerHour: 0 }),
      runSimulation(buildDemoWorld(), scenario({ population: 6, eventsPerHour: 0 })),
      { label: "baseline" }
    );
    const world2 = buildDemoWorld();
    world2.streetlights.push(
      { id: "sl_x1", x: -60, z: 40, height: 8, brightness: 1, radius: 25, on: true, maintenance: "ok" },
      { id: "sl_x2", x: 20, z: 40, height: 8, brightness: 1, radius: 25, on: true, maintenance: "ok" },
      { id: "sl_x3", x: 130, z: 110, height: 8, brightness: 1, radius: 25, on: true, maintenance: "ok" }
    );
    const mInt = computeMetrics(
      world2,
      scenario({ population: 6, eventsPerHour: 0 }),
      runSimulation(world2, scenario({ population: 6, eventsPerHour: 0 })),
      { label: "intervention", baseWorld: buildDemoWorld() }
    );
    const rows = compareRuns(mBase, mInt);
    const lit = rows.find((r) => r.key === "pathLenLitPct")!;
    expect(lit).toBeDefined();
    if (mInt.pathLenLitPct !== mBase.pathLenLitPct) {
      expect(lit.delta).not.toBe("no change");
    }
    // zero denominators never produce NaN-ish strings
    rows.forEach((r) => {
      expect(r.baseline).not.toMatch(/NaN|Infinity/);
      expect(r.intervention).not.toMatch(/NaN|Infinity/);
    });
  });
});

describe("metric formatting", () => {
  it("formats pct, time, currency and handles nulls", () => {
    expect(fmtMetric("pathLenLitPct", 55.25)).toBe("55.3%");
    expect(fmtMetric("avgResponseSec", 123.6)).toBe("124 s");
    expect(fmtMetric("interventionCostInr", 40000)).toBe("₹40,000");
    expect(fmtMetric("avgResponseSec", null)).toBe("—");
  });
});

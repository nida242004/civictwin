import { describe, it, expect } from "vitest";
import { makeDemoProject } from "@/lib/world/demo";
import { executeRun } from "@/lib/sim/runner";
import { deepClone } from "@/lib/world/ids";
import { ablateSync, detectChanges, headlineDiff, riskIndex } from "@/lib/sim/compare";
import { COST_ASSUMPTIONS } from "@/lib/world/types";

describe("baseline vs intervention analysis", () => {
  const p = makeDemoProject();
  const base = executeRun(p.world, p.scenario, "baseline").stored;
  const w2 = deepClone(p.world);
  w2.cameras.push({ id: "cam_t1", x: 10, z: 10, height: 6.5, range: 30, fovDeg: 90, orientationDeg: 0, active: true });
  w2.streetlights.push({ id: "sl_t1", x: -20, z: 15, height: 8, brightness: 0.9, radius: 18, on: true, maintenance: "ok" });
  const int = executeRun(w2, { ...p.scenario, seed: base.seed }, "intervention", p.world).stored;

  it("detects each physical change with its cost", () => {
    const ch = detectChanges(base, int);
    expect(ch.map((c) => c.id).sort()).toEqual(["add-cam_t1", "add-sl_t1"]);
    expect(ch.find((c) => c.id === "add-cam_t1")!.costInr).toBe(COST_ASSUMPTIONS.cameraInstallInr);
  });

  it("ablation re-runs one change at a time and is deterministic", () => {
    const a = ablateSync(base, int);
    expect(a.rows).toHaveLength(2);
    expect(a.baselineRisk).toBe(riskIndex(base.events));
    expect(a.combined.costInr).toBe(COST_ASSUMPTIONS.cameraInstallInr + COST_ASSUMPTIONS.streetlightInstallInr);
    for (const r of a.rows) if (r.costInr > 0 && r.riskPerLakh !== null) expect(r.riskPerLakh).toBeCloseTo(r.riskReduced / (r.costInr / 1e5), 1);
  });

  it("produces a headline (or null) without throwing", () => {
    const h = headlineDiff(base, int);
    if (h) expect(h.text).toMatch(/at \d\d:\d\d/);
  });
});

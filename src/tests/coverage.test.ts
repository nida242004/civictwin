import { describe, it, expect } from "vitest";
import { computeCoverage, applyOutages, scenarioTemplates } from "@/lib/sim/scenarios";
import { buildDemoWorld } from "@/lib/world/demo";
import type { World } from "@/lib/world/types";

function tinyWorld(): World {
  return {
    bounds: { width: 100, depth: 100 },
    roads: [
      {
        id: "rd_1",
        points: [
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ],
        width: 4,
        category: "road",
        pedestrian: true,
      },
    ],
    buildings: [],
    facilities: [],
    streetlights: [
      { id: "sl_1", x: 25, z: 0, height: 8, brightness: 1, radius: 20, on: true, maintenance: "ok" },
    ],
    cameras: [
      { id: "cam_1", x: 50, z: 10, height: 6, range: 30, fovDeg: 60, orientationDeg: 270, active: true },
    ],
    guards: [],
  };
}

describe("modeled lighting coverage", () => {
  it("is high near an active lamp and zero far from it", () => {
    const cov = computeCoverage(tinyWorld(), 1, 1);
    const near = cov.samples.find((s) => Math.abs(s.x - 25) < 3 && Math.abs(s.z) < 0.1);
    const far = cov.samples.find((s) => Math.abs(s.x - 90) < 3 && Math.abs(s.z) < 0.1);
    expect(near).toBeDefined();
    expect(far).toBeDefined();
    const nearCov = cov.perSample[cov.samples.indexOf(near!)];
    const farCov = cov.perSample[cov.samples.indexOf(far!)];
    expect(nearCov.light).toBeGreaterThan(0.5);
    expect(nearCov.lit).toBe(true);
    expect(farCov.light).toBe(0);
    expect(farCov.lit).toBe(false);
  });

  it("excludes off and faulty lamps", () => {
    const w = tinyWorld();
    w.streetlights[0].on = false;
    const off = computeCoverage(w, 1, 1);
    expect(off.litLenM).toBe(0);

    const w2 = tinyWorld();
    w2.streetlights[0].maintenance = "faulty";
    const faulty = computeCoverage(w2, 1, 1);
    expect(faulty.litLenM).toBe(0);
  });

  it("low ambient visibility reduces lit fraction", () => {
    const clear = computeCoverage(tinyWorld(), 1, 1);
    const hazy = computeCoverage(tinyWorld(), 0.5, 1);
    expect(hazy.litLenM).toBeLessThanOrEqual(clear.litLenM);
  });
});

describe("modeled CCTV coverage", () => {
  it("covers points within range and FOV cone", () => {
    const cov = computeCoverage(tinyWorld(), 1, 1);
    // camera at (50,10) facing 270° (north, -z), fov 60°, range 30 → point (50, 0) is covered
    const idx = cov.samples.findIndex((s) => Math.abs(s.x - 50) < 3 && Math.abs(s.z) < 0.1);
    expect(cov.perSample[idx].cctv).toBe(true);
  });

  it("does not cover points outside the FOV", () => {
    const w = tinyWorld();
    w.cameras[0].orientationDeg = 0; // facing east
    const cov = computeCoverage(w, 1, 1);
    const idx = cov.samples.findIndex((s) => Math.abs(s.x - 50) < 3 && Math.abs(s.z) < 0.1);
    // (50,0) relative to camera (50,10) is due north — outside an east-facing 60° cone
    expect(cov.perSample[idx].cctv).toBe(false);
  });

  it("ignores inactive cameras", () => {
    const w = tinyWorld();
    w.cameras[0].active = false;
    const cov = computeCoverage(w, 1, 1);
    expect(cov.cctvLenM).toBe(0);
  });
});

describe("scenario outages", () => {
  it("is deterministic per lamp id and stable when lamps are added", () => {
    const world = buildDemoWorld();
    const a = applyOutages(world, 0.25, 123);
    const b = applyOutages(world, 0.25, 123);
    expect(Array.from(a)).toEqual(Array.from(b));
    // adding a lamp must NOT change which existing lamps are out
    const world2 = buildDemoWorld();
    world2.streetlights.push({ id: "sl_extra", x: 0, z: 0, height: 8, brightness: 1, radius: 18, on: true, maintenance: "ok" });
    const c = applyOutages(world2, 0.25, 123);
    for (const id of a) expect(c.has(id)).toBe(true);
  });

  it("selects roughly the modeled fraction", () => {
    const world = buildDemoWorld();
    const a = applyOutages(world, 0.25, 123);
    const expected = world.streetlights.length * 0.25;
    expect(a.size).toBeGreaterThan(expected * 0.4);
    expect(a.size).toBeLessThan(expected * 1.6);
  });

  it("returns empty set for zero fraction", () => {
    const world = buildDemoWorld();
    expect(applyOutages(world, 0, 1).size).toBe(0);
  });
});

describe("scenario templates", () => {
  it("low-visibility night has worse visibility and more outages", () => {
    const [typ, low] = scenarioTemplates();
    expect(low.ambientVisibility).toBeLessThan(typ.ambientVisibility);
    expect(low.lightingOutageFraction).toBeGreaterThan(typ.lightingOutageFraction);
  });
});

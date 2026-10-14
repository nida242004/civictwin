import { describe, it, expect } from "vitest";
import { parseProject, exportProjectJson } from "@/lib/world/serialize";
import { makeDemoProject } from "@/lib/world/demo";
import { makeBlankProject } from "@/lib/world/blank";
import type { PraesidiumProject } from "@/lib/world/types";

describe("project serialization", () => {
  it("round-trips a demo project through export → parse", () => {
    const project = makeDemoProject() as PraesidiumProject;
    const json = exportProjectJson(project);
    const parsed = parseProject(JSON.parse(json));
    expect(parsed.ok).toBe(true);
    const p = parsed.project!;
    expect(p.name).toBe(project.name);
    expect(p.world.roads.length).toBe(project.world.roads.length);
    expect(p.world.buildings.length).toBe(project.world.buildings.length);
    expect(p.world.streetlights.length).toBe(project.world.streetlights.length);
    expect(p.world.cameras.length).toBe(project.world.cameras.length);
    expect(p.world.guards.length).toBe(project.world.guards.length);
    expect(p.scenario.seed).toBe(project.scenario.seed);
    expect(p.scenario.population).toBe(project.scenario.population);
  });

  it("rejects non-object input", () => {
    expect(parseProject("hello").ok).toBe(false);
    expect(parseProject(null).ok).toBe(false);
    expect(parseProject(42).ok).toBe(false);
  });

  it("rejects unsupported (newer) schema versions", () => {
    const project = makeDemoProject();
    const raw = JSON.parse(exportProjectJson(project));
    raw.schemaVersion = 99;
    const res = parseProject(raw);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unsupported schema version 99/);
  });

  it("rejects missing world", () => {
    const res = parseProject({ schemaVersion: 1, name: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/world/i);
  });

  it("fills missing optional fields with safe defaults", () => {
    const res = parseProject({
      schemaVersion: 1,
      world: {
        roads: [{ points: [{ x: 0, z: 0 }, { x: 10, z: 0 }] }], // no id, no width
        buildings: [{ x: 5, z: 5 }],
        facilities: [],
        streetlights: [],
        cameras: [],
        guards: [],
      },
    });
    expect(res.ok).toBe(true);
    const p = res.project!;
    expect(p.world.roads[0].id).toBeTruthy();
    expect(p.world.roads[0].width).toBe(4);
    expect(p.world.buildings[0].height).toBeGreaterThan(0);
    expect(p.scenario.durationSec).toBeGreaterThan(0);
  });

  it("repairs malformed entries instead of crashing", () => {
    const res = parseProject({
      schemaVersion: 1,
      world: {
        roads: [null, "junk", { points: "bad" }, { points: [{ x: 0, z: 0 }, { x: 1, z: 1 }] }],
        buildings: [{ x: "bad" }, { x: 0, z: 0, width: 5, depth: 5 }],
        facilities: [],
        streetlights: [],
        cameras: [],
        guards: [],
      },
    });
    expect(res.ok).toBe(true);
    expect(res.project!.world.roads.length).toBe(1); // entries without valid polylines are dropped
    expect(res.project!.world.buildings.length).toBe(2); // entries are repaired with safe defaults
  });

  it("rejects invalid JSON strings at the caller level", () => {
    expect(() => JSON.parse("{not json")).toThrow();
  });

  it("clamps scenario values into safe ranges", () => {
    const res = parseProject({
      schemaVersion: 1,
      world: makeBlankProject().world,
      scenario: { durationSec: 999999, population: 99999, ambientVisibility: -5, seed: -123 },
    });
    expect(res.ok).toBe(true);
    const s = res.project!.scenario;
    expect(s.durationSec).toBeLessThanOrEqual(7200);
    expect(s.population).toBeLessThanOrEqual(200);
    expect(s.ambientVisibility).toBeGreaterThanOrEqual(0.2);
    expect(s.seed).toBeGreaterThanOrEqual(0);
  });
});

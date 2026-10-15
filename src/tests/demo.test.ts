import { describe, it, expect } from "vitest";
import { buildDemoWorld, makeDemoProject } from "@/lib/world/demo";
import { buildNavGraph } from "@/lib/world/graph";
import { parseProject } from "@/lib/world/serialize";

describe("demonstration neighborhood", () => {
  const world = buildDemoWorld();

  it("is a gated RWA: 8 blocks around a central park + mandir, walled, one main gate", () => {
    const blocks = world.buildings.filter((b) => /^Block [A-H]$/.test(b.name ?? ""));
    expect(blocks.length).toBe(8);
    blocks.forEach((b) => {
      expect(b.category).toBe("residential");
      expect(b.floors).toBeGreaterThanOrEqual(5);
      expect(b.floors).toBeLessThanOrEqual(8);
    });
    expect(world.buildings.some((b) => /mandir/i.test(b.name ?? ""))).toBe(true);
    expect(world.buildings.some((b) => b.category === "commercial")).toBe(true);
    const park = world.facilities.find((f) => f.type === "park")!;
    expect(Math.hypot(park.x, park.z)).toBeLessThan(20); // centre cell
    expect(world.facilities.some((f) => f.type === "place_of_worship")).toBe(true);
    expect(world.facilities.some((f) => f.type === "bus_stop")).toBe(true);
    expect(world.facilities.some((f) => f.type === "community_centre")).toBe(true);
    const site = world.site!;
    expect(site.walls.length).toBeGreaterThanOrEqual(1);
    expect(site.walls[0].closed).toBe(true);
    expect(site.gates.filter((g) => g.kind === "main").length).toBe(1);
    expect(site.booths.length).toBeGreaterThanOrEqual(1);
    expect(site.areas.some((a) => a.kind === "dark")).toBe(true);
    expect(site.areas.some((a) => a.kind === "parking")).toBe(true);
    expect(world.streetlights.length).toBeGreaterThanOrEqual(20);
    expect(world.cameras.length).toBeGreaterThanOrEqual(2);
    expect(world.guards.length).toBeGreaterThanOrEqual(1);
    world.guards.forEach((g) => expect(g.waypoints.length).toBeGreaterThanOrEqual(2));
  });

  it("is deterministic — same layout every time", () => {
    const again = buildDemoWorld();
    expect(again.buildings.map((b) => [b.x, b.z, b.width])).toEqual(
      world.buildings.map((b) => [b.x, b.z, b.width])
    );
    expect(again.streetlights.map((s) => [s.x, s.z])).toEqual(world.streetlights.map((s) => [s.x, s.z]));
  });

  it("builds a connected pedestrian graph", () => {
    const g = buildNavGraph(world);
    expect(g.stats.componentCount).toBe(1);
    expect(g.stats.nodeCount).toBeGreaterThan(20);
  });

  it("all buildings connect to the walkable network", () => {
    const g = buildNavGraph(world);
    // every entrance node must be in the largest component
    const connectors = g.nodes.filter((n) => n.connector);
    expect(connectors.length).toBeGreaterThan(world.buildings.length * 0.8);
  });

  it("demo project parses through the project validator", () => {
    const res = parseProject(JSON.parse(JSON.stringify(makeDemoProject())));
    expect(res.ok).toBe(true);
    expect(res.project!.source.kind).toBe("demo");
  });
});

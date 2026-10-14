import { describe, it, expect } from "vitest";
import { buildNavGraph, findPath, nearestRoutableNode, pathPositions } from "@/lib/world/graph";
import type { World } from "@/lib/world/types";

function worldWith(points: { x: number; z: number }[][]): World {
  return {
    bounds: { width: 200, depth: 200 },
    roads: points.map((pts, i) => ({
      id: `rd_${i}`,
      points: pts,
      width: 4,
      category: "road" as const,
      pedestrian: true,
    })),
    buildings: [],
    facilities: [],
    streetlights: [],
    cameras: [],
    guards: [],
  };
}

describe("navigation graph & A*", () => {
  it("finds a path on a connected graph", () => {
    const g = buildNavGraph(
      worldWith([
        [
          { x: 0, z: 0 },
          { x: 50, z: 0 },
          { x: 50, z: 50 },
        ],
        [
          { x: 0, z: 50 },
          { x: 50, z: 50 },
        ],
      ])
    );
    const a = nearestRoutableNode(g, 0, 0);
    const b = nearestRoutableNode(g, 0, 50);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const res = findPath(g, a!, b!);
    expect(res).not.toBeNull();
    expect(res!.nodes[0]).toBe(a);
    expect(res!.nodes[res!.nodes.length - 1]).toBe(b);
    const pp = pathPositions(g, res!.nodes);
    expect(pp.length).toBeGreaterThan(90); // ~50 + 50 via corner
  });

  it("returns null for unreachable destinations (disconnected components)", () => {
    const g = buildNavGraph(
      worldWith([
        [
          { x: 0, z: 0 },
          { x: 40, z: 0 },
        ],
        [
          { x: 100, z: 100 },
          { x: 140, z: 100 },
        ],
      ])
    );
    const a = nearestRoutableNode(g, 0, 0)!;
    const b = nearestRoutableNode(g, 100, 100)!;
    const res = findPath(g, a, b);
    expect(res).toBeNull();
  });

  it("handles start == goal", () => {
    const g = buildNavGraph(worldWith([[{ x: 0, z: 0 }, { x: 10, z: 0 }]]));
    const a = nearestRoutableNode(g, 0, 0)!;
    const res = findPath(g, a, a);
    expect(res).not.toBeNull();
    expect(res!.nodes).toEqual([a]);
    expect(res!.cost).toBe(0);
  });

  it("prefers shorter routes with equal endpoints", () => {
    // two routes: direct diagonal-ish along one road vs L-shaped detour
    const g = buildNavGraph(
      worldWith([
        [
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ],
        [
          { x: 50, z: 0 },
          { x: 50, z: 60 },
          { x: 100, z: 60 },
          { x: 100, z: 0 },
        ],
      ])
    );
    const a = nearestRoutableNode(g, 0, 0)!;
    const b = nearestRoutableNode(g, 100, 0)!;
    const res = findPath(g, a, b);
    expect(res).not.toBeNull();
    // direct edge (100m) is cheaper than going around (50+60+50+... )
    expect(res!.cost).toBeLessThan(160);
  });

  it("reports component stats for disconnected graphs safely", () => {
    const g = buildNavGraph(
      worldWith([
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
        ],
        [
          { x: 50, z: 50 },
          { x: 60, z: 50 },
        ],
      ])
    );
    expect(g.stats.componentCount).toBe(2);
  });
});

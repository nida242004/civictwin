import { describe, expect, it } from "vitest";
import {
  clipPolyline,
  clipWorldToPolygon,
  isAxisAligned,
  pointInPolygon,
  rectCorners,
  rectFromBbox,
  ringAreaM2,
  ringToLocal,
  ringToUV,
  selectionBbox,
  type Bbox,
} from "@/lib/geo/selection";
import { buildVisionPrompt } from "@/lib/geo/visionLayout";
import type { World } from "@/lib/world/types";

const BB: Bbox = [12.97, 12.973, 77.59, 77.593];

describe("selection geometry", () => {
  it("round-trips an axis-aligned rect through its bbox", () => {
    const r = rectFromBbox(BB);
    expect(isAxisAligned(r)).toBe(true);
    const b = selectionBbox(r);
    b.forEach((v, i) => expect(v).toBeCloseTo(BB[i], 7));
    expect(ringAreaM2(rectCorners(r))).toBeCloseTo(r.widthM * r.depthM, -1);
  });

  it("a rotated rect keeps its area and grows its bounding bbox", () => {
    const r = { ...rectFromBbox(BB), rotationDeg: 30 };
    expect(isAxisAligned(r)).toBe(false);
    expect(ringAreaM2(rectCorners(r))).toBeCloseTo(r.widthM * r.depthM, -1);
    const b = selectionBbox(r);
    expect(b[1] - b[0]).toBeGreaterThan(BB[1] - BB[0]);
    expect(b[3] - b[2]).toBeGreaterThan(BB[3] - BB[2]);
  });

  it("a 90° rotation swaps width and depth", () => {
    const r = { kind: "rect" as const, lat: 12.97, lng: 77.59, widthM: 300, depthM: 100, rotationDeg: 90 };
    const b = selectionBbox(r);
    const lat0 = 12.97;
    const w = (b[3] - b[2]) * 111320 * Math.cos((lat0 * Math.PI) / 180);
    const d = (b[1] - b[0]) * 111320;
    expect(w).toBeCloseTo(100, 0);
    expect(d).toBeCloseTo(300, 0);
  });

  it("maps the ring into the image grid (NW = 0,0; SE = 1000,1000)", () => {
    const uv = ringToUV(rectCorners(rectFromBbox(BB)), BB);
    expect(uv[0]).toEqual([0, 0]);
    expect(uv[2]).toEqual([1000, 1000]);
    const loc = ringToLocal(rectCorners(rectFromBbox(BB)), BB, 200, 100);
    expect(loc[0]).toEqual({ x: -100, z: -50 });
  });
});

describe("clipping", () => {
  const diamond = [
    { x: 0, z: -50 },
    { x: 50, z: 0 },
    { x: 0, z: 50 },
    { x: -50, z: 0 },
  ];

  it("point in polygon", () => {
    expect(pointInPolygon({ x: 0, z: 0 }, diamond)).toBe(true);
    expect(pointInPolygon({ x: 40, z: 40 }, diamond)).toBe(false);
  });

  it("clips a polyline at the polygon edge", () => {
    const runs = clipPolyline(
      [
        { x: -100, z: 0 },
        { x: 100, z: 0 },
      ],
      diamond
    );
    expect(runs).toHaveLength(1);
    expect(runs[0][0].x).toBeCloseTo(-50, 5);
    expect(runs[0][runs[0].length - 1].x).toBeCloseTo(50, 5);
  });

  it("drops outside features and keeps inside ones", () => {
    const world: World = {
      bounds: { width: 200, depth: 200 },
      roads: [{ id: "r1", points: [{ x: -100, z: 0 }, { x: 100, z: 0 }], width: 5, category: "road", pedestrian: true }],
      buildings: [
        { id: "in", x: 0, z: 10, width: 10, depth: 10, rotation: 0, height: 9, floors: 3, category: "residential", occupancy: 10 },
        { id: "out", x: 45, z: 45, width: 10, depth: 10, rotation: 0, height: 9, floors: 3, category: "residential", occupancy: 10 },
      ],
      facilities: [],
      streetlights: [],
      cameras: [],
      guards: [],
      site: { walls: [], gates: [{ id: "g", kind: "main", x: 0, z: -52 }], areas: [], booths: [] },
    };
    const { world: w, removed } = clipWorldToPolygon(world, diamond);
    expect(w.buildings.map((b) => b.id)).toEqual(["in"]);
    expect(w.roads).toHaveLength(1);
    expect(w.site?.gates).toHaveLength(1); // on the edge, within margin
    expect(removed).toBe(1);
  });
});

describe("vision prompt", () => {
  it("mentions the street map and the selection outline when given", () => {
    const p = buildVisionPrompt({ widthM: 300, depthM: 200, hasStreetMap: true, selection: [[0, 0], [1000, 0], [500, 1000]] });
    expect(p).toContain("IMAGE 2 = street map");
    expect(p).toContain("SELECTION");
    expect(p).toContain("500,1000");
  });
  it("stays single-image without extras", () => {
    const p = buildVisionPrompt({ widthM: 300, depthM: 200 });
    expect(p).not.toContain("IMAGE 2");
    expect(p).not.toContain("SELECTION");
  });
});

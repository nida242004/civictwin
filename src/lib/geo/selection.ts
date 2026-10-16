/**
 * Map-picker selection geometry (pure, unit-tested).
 *
 * A selection is either a (possibly rotated) rectangle or a free polygon in
 * lat/lng. Imagery is always captured for the selection's north-up bounding
 * bbox; the selection ring is then expressed in that image's normalized grid
 * (u,v ∈ 0..1000, u → east, v → south) for Gemini, and in local meters
 * (x east, z south, origin = bbox center) to clip imported features.
 */

import type { Building, Facility, Road, SiteLayers, Vec2, World } from "../world/types";

export type Bbox = [number, number, number, number]; // south, north, west, east
export type LatLng = [number, number]; // lat, lng

export type Selection =
  | { kind: "rect"; lat: number; lng: number; widthM: number; depthM: number; rotationDeg: number }
  | { kind: "polygon"; ring: LatLng[] };

const M_PER_DEG = 111320;
const rad = (d: number) => (d * Math.PI) / 180;

export function mPerDegLng(lat: number) {
  return M_PER_DEG * Math.cos(rad(lat));
}

/** East/north meters of p relative to origin (equirectangular, fine at society scale). */
export function toEN(p: LatLng, o: LatLng): { e: number; n: number } {
  return { e: (p[1] - o[1]) * mPerDegLng(o[0]), n: (p[0] - o[0]) * M_PER_DEG };
}
export function fromEN(e: number, n: number, o: LatLng): LatLng {
  return [o[0] + n / M_PER_DEG, o[1] + e / mPerDegLng(o[0])];
}

/** Corners of a rotated rect, clockwise from the north-west corner (at rotation 0). Rotation is clockwise. */
export function rectCorners(r: Extract<Selection, { kind: "rect" }>): LatLng[] {
  const hw = r.widthM / 2;
  const hd = r.depthM / 2;
  const t = rad(r.rotationDeg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  // local (east, north) before rotation; clockwise rotation on the map: e' = e·c + n·s, n' = −e·s + n·c
  return ([
    [-hw, hd],
    [hw, hd],
    [hw, -hd],
    [-hw, -hd],
  ] as const).map(([e, n]) => fromEN(e * c + n * s, -e * s + n * c, [r.lat, r.lng]));
}

export function selectionRing(sel: Selection): LatLng[] {
  return sel.kind === "rect" ? rectCorners(sel) : sel.ring;
}

export function ringBbox(ring: LatLng[]): Bbox {
  let s = Infinity;
  let n = -Infinity;
  let w = Infinity;
  let e = -Infinity;
  for (const [la, lo] of ring) {
    s = Math.min(s, la);
    n = Math.max(n, la);
    w = Math.min(w, lo);
    e = Math.max(e, lo);
  }
  return [s, n, w, e];
}

export function selectionBbox(sel: Selection): Bbox {
  return ringBbox(selectionRing(sel));
}

/** Axis-aligned rect selection covering a bbox. */
export function rectFromBbox(b: Bbox): Extract<Selection, { kind: "rect" }> {
  const lat = (b[0] + b[1]) / 2;
  return {
    kind: "rect",
    lat,
    lng: (b[2] + b[3]) / 2,
    widthM: (b[3] - b[2]) * mPerDegLng(lat),
    depthM: (b[1] - b[0]) * M_PER_DEG,
    rotationDeg: 0,
  };
}

/** True for an unrotated rectangle (no clipping needed). */
export function isAxisAligned(sel: Selection): boolean {
  if (sel.kind !== "rect") return false;
  const r = ((sel.rotationDeg % 90) + 90) % 90;
  return r < 0.5 || r > 89.5;
}

/** Polygon area in m² (shoelace). */
export function ringAreaM2(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  const o = ring[0];
  const pts = ring.map((p) => toEN(p, o));
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.e * q.n - q.e * p.n;
  }
  return Math.abs(a) / 2;
}

/** Ring → normalized image grid (u,v ∈ 0..1000) of the bbox image. */
export function ringToUV(ring: LatLng[], b: Bbox): [number, number][] {
  return ring.map(([la, lo]) => [Math.round(((lo - b[2]) / (b[3] - b[2])) * 1000), Math.round(((b[1] - la) / (b[1] - b[0])) * 1000)]);
}

/** Ring → local meters (x east, z south) of a world whose bounds are W×D centered on the bbox. */
export function ringToLocal(ring: LatLng[], b: Bbox, W: number, D: number): Vec2[] {
  return ringToUV(ring, b).map(([u, v]) => ({ x: (u / 1000 - 0.5) * W, z: (v / 1000 - 0.5) * D }));
}

/* ------------------------------ clipping ------------------------------ */

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Inside the polygon, or within `margin` meters of its edge. */
export function nearOrInside(p: Vec2, poly: Vec2[], margin: number): boolean {
  if (pointInPolygon(p, poly)) return true;
  if (margin <= 0) return false;
  for (let i = 0; i < poly.length; i++) if (distToSeg(p, poly[i], poly[(i + 1) % poly.length]) <= margin) return true;
  return false;
}

/** Segment a→b intersection params (0..1) with every polygon edge. */
function crossings(a: Vec2, b: Vec2, poly: Vec2[]): number[] {
  const out: number[] = [];
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i];
    const d = poly[(i + 1) % poly.length];
    const sx = d.x - c.x;
    const sz = d.z - c.z;
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den;
    const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
    if (t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1) out.push(t);
  }
  return out.sort((x, y) => x - y);
}

/** Clip a polyline to a polygon; returns the inside runs (each ≥ 2 points). */
export function clipPolyline(points: Vec2[], poly: Vec2[]): Vec2[][] {
  const runs: Vec2[][] = [];
  let cur: Vec2[] = [];
  const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const ts = [0, ...crossings(a, b, poly), 1];
    for (let k = 1; k < ts.length; k++) {
      const p0 = lerp(a, b, ts[k - 1]);
      const p1 = lerp(a, b, ts[k]);
      const inside = pointInPolygon(lerp(a, b, (ts[k - 1] + ts[k]) / 2), poly);
      if (inside) {
        if (!cur.length) cur.push(p0);
        cur.push(p1);
      } else if (cur.length) {
        if (cur.length >= 2) runs.push(cur);
        cur = [];
      }
    }
  }
  if (cur.length >= 2) runs.push(cur);
  // drop degenerate slivers
  return runs.filter((r) => r.reduce((s, p, i) => (i ? s + Math.hypot(p.x - r[i - 1].x, p.z - r[i - 1].z) : 0), 0) > 1.5);
}

/**
 * Keep only what lies inside the selection polygon (local meters). Buildings,
 * facilities and site markers are kept when their center is inside (gates and
 * booths get a small margin since they sit on the boundary); roads are clipped
 * at the polygon edge. Returns the clipped world and how many items were dropped.
 */
export function clipWorldToPolygon(world: World, poly: Vec2[], margin = 6): { world: World; removed: number } {
  if (poly.length < 3) return { world, removed: 0 };
  let removed = 0;
  const keep = <T extends { x: number; z: number }>(list: T[], m = 0) =>
    list.filter((it) => {
      const ok = nearOrInside(it, poly, m);
      if (!ok) removed += 1;
      return ok;
    });
  const buildings = keep<Building>(world.buildings);
  const facilities = keep<Facility>(world.facilities, margin);
  const roads: Road[] = [];
  for (const r of world.roads) {
    const runs = clipPolyline(r.points, poly);
    if (!runs.length) {
      removed += 1;
      continue;
    }
    runs.forEach((pts, i) => roads.push(i === 0 ? { ...r, points: pts } : { ...r, id: `${r.id}_c${i}`, points: pts }));
  }
  let site: SiteLayers | undefined = world.site;
  if (site) {
    site = {
      ...site,
      gates: keep(site.gates, margin * 2),
      booths: keep(site.booths, margin * 2),
      areas: keep(site.areas, margin),
      walls: site.walls.filter((w) => {
        const ok = w.points.some((p) => nearOrInside(p, poly, margin * 2));
        if (!ok) removed += 1;
        return ok;
      }),
    };
  }
  return {
    world: {
      ...world,
      buildings,
      facilities,
      roads,
      streetlights: keep(world.streetlights),
      cameras: keep(world.cameras),
      ...(site ? { site } : {}),
    },
    removed,
  };
}

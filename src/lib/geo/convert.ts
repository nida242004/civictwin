/**
 * Convert an OsmFeatureBundle into Praesidium's local world model.
 *
 * Local projection: equirectangular around the bbox center
 *   x = (lon − lon0) · cos(lat0) · 111320
 *   z = −(lat − lat0) · 111320   (z grows southward, matching three.js)
 *
 * Building footprints are simplified to their axis-aligned bounding
 * rectangle (documented inference — heights may also be inferred).
 */

import type { Building, Facility, Road, World } from "../world/types";
import type { OsmFeatureBundle } from "./osm";
import { seededId } from "../world/ids";

export function convertOsmToWorld(
  bundle: OsmFeatureBundle,
  /** Fix the local origin (and optionally the bounds) instead of fitting to the features — used by the satellite import so the world matches the image. */
  opts?: { origin?: { lat: number; lon: number }; bounds?: { width: number; depth: number } }
): { world: World; stats: Record<string, number>; notes: string[] } {
  const allLats: number[] = [];
  const allLons: number[] = [];
  for (const r of bundle.roads) for (const [la, lo] of r.points) { allLats.push(la); allLons.push(lo); }
  for (const b of bundle.buildings) for (const [la, lo] of b.polygon) { allLats.push(la); allLons.push(lo); }
  if (!allLats.length && !opts?.origin) {
    return {
      world: emptyWorld(),
      stats: { roads: 0, buildings: 0, facilities: 0 },
      notes: ["The provider returned no usable geometry for this area."],
    };
  }
  const lat0 = opts?.origin ? opts.origin.lat : (Math.min(...allLats) + Math.max(...allLats)) / 2;
  const lon0 = opts?.origin ? opts.origin.lon : (Math.min(...allLons) + Math.max(...allLons)) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;

  const proj = (la: number, lo: number): { x: number; z: number } => ({
    x: (lo - lon0) * kx,
    z: -(la - lat0) * 111320,
  });

  const roads: Road[] = [];
  let rn = 0;
  for (const r of bundle.roads) {
    const pts = r.points.map(([la, lo]) => proj(la, lo));
    if (pts.length < 2) continue;
    roads.push({
      id: `rd_${r.id}`,
      name: r.name,
      points: pts,
      width: r.width,
      category: r.path ? "path" : "road",
      pedestrian: true,
    });
    rn += 1;
  }

  const buildings: Building[] = [];
  let bn = 0;
  let inferredHeights = 0;
  for (const b of bundle.buildings) {
    const pts = b.polygon.map(([la, lo]) => proj(la, lo));
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    const w = x1 - x0;
    const d = z1 - z0;
    if (w < 2 || d < 2) continue;
    let height: number;
    let floors: number;
    let inferred = false;
    if (b.height && b.height > 2) {
      height = b.height;
      floors = Math.max(1, Math.round(b.height / 3));
    } else if (b.levels && b.levels > 0) {
      floors = Math.round(b.levels);
      height = floors * 3;
    } else {
      floors = 3;
      height = 9;
      inferred = true;
      inferredHeights += 1;
    }
    buildings.push({
      id: `bd_${b.id}`,
      name: b.name,
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      width: w,
      depth: d,
      rotation: 0,
      height,
      floors,
      category: "residential",
      occupancy: Math.max(2, Math.round((w * d) / 55) * 2),
      inferred,
    });
    bn += 1;
  }

  const facilities: Facility[] = [];
  let fn = 0;
  for (const p of bundle.parks) {
    const pts = p.polygon.map(([la, lo]) => proj(la, lo));
    const xs = pts.map((q) => q.x);
    const zs = pts.map((q) => q.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const rad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2;
    if (rad < 4) continue;
    facilities.push({
      id: `fc_${p.id}`,
      name: p.name ?? "Park",
      type: "park",
      x: cx,
      z: cz,
      radius: Math.min(rad, 90),
      inferred: true,
    });
    fn += 1;
  }
  for (const f of bundle.facilities) {
    const p = proj(f.lat, f.lon);
    facilities.push({
      id: `fc_${f.id}`,
      name: f.name ?? f.type.replace(/_/g, " "),
      type: f.type as Facility["type"],
      x: p.x,
      z: p.z,
      inferred: true,
    });
    fn += 1;
  }

  const xsAll: number[] = [];
  const zsAll: number[] = [];
  for (const r of roads) for (const p of r.points) { xsAll.push(p.x); zsAll.push(p.z); }
  for (const b of buildings) { xsAll.push(b.x - b.width / 2, b.x + b.width / 2); zsAll.push(b.z - b.depth / 2, b.z + b.depth / 2); }
  const pad = 25;
  const width = Math.min(4000, (xsAll.length ? Math.max(...xsAll) - Math.min(...xsAll) : 400) + pad * 2);
  const depth = Math.min(4000, (zsAll.length ? Math.max(...zsAll) - Math.min(...zsAll) : 320) + pad * 2);

  const world: World = {
    bounds: opts?.bounds ?? { width: Math.max(200, width), depth: Math.max(200, depth) },
    roads,
    buildings,
    facilities,
    streetlights: [],
    cameras: [],
    guards: [],
  };

  const notes: string[] = [];
  if (inferredHeights > 0) {
    notes.push(`${inferredHeights} buildings had no height data — a default of 3 floors was inferred and is marked as inferred in the editor.`);
  }
  notes.push("Building footprints are simplified to bounding rectangles of their mapped outlines.");
  notes.push("No safety infrastructure is created automatically — add streetlights, cameras, and patrols yourself or via the planning assistant.");

  return {
    world,
    stats: { roads: rn, buildings: bn, facilities: fn },
    notes,
  };
}

function emptyWorld(): World {
  return {
    bounds: { width: 320, depth: 240 },
    roads: [],
    buildings: [],
    facilities: [],
    streetlights: [],
    cameras: [],
    guards: [],
  };
}

export { seededId };

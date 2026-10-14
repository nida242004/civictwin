/**
 * Gemini vision layout: schema, prompt building and OSM merge for the
 * "satellite → 3D twin" import. Pure functions (no network) so they can be
 * unit-tested; the route in /api/ai/vision-layout does the Gemini call.
 *
 * Coordinate exchange with the model uses a normalized image grid u,v ∈ [0,1000]
 * (u → east, v → south, origin top-left = north-west corner of the bbox). Local
 * meters: x = (u/1000 − 0.5)·W, z = (v/1000 − 0.5)·D for world bounds W×D.
 */

import { z } from "zod";
import type { Building, BuildingCategory, Facility, Road, SiteLayers, Vec2, World } from "../world/types";

const num = z.coerce.number().refine(Number.isFinite);
const uv = z.tuple([num, num]);
const box = z.object({ u: num, v: num, widthM: num.optional(), depthM: num.optional(), rotationDeg: num.optional() });

export const VisionLayoutSchema = z.object({
  societyType: z.string().max(60).catch("other"),
  description: z.string().max(800).catch(""),
  boundary: z.array(uv).max(80).catch([]),
  gates: z
    .array(z.object({ u: num, v: num, kind: z.enum(["main", "service", "pedestrian"]).catch("main"), name: z.string().max(60).optional().catch(undefined) }))
    .max(12)
    .catch([]),
  buildings: z
    .array(
      box.extend({
        floors: num.optional(),
        category: z.enum(["residential", "commercial", "community", "mixed", "other"]).catch("residential"),
        name: z.string().max(60).optional().catch(undefined),
      })
    )
    .max(200)
    .catch([]),
  roads: z.array(z.object({ points: z.array(uv).min(2).max(40), kind: z.enum(["road", "path"]).catch("road") })).max(60).catch([]),
  openAreas: z.array(box.extend({ name: z.string().max(60).optional().catch(undefined) })).max(30).catch([]),
  parking: z.array(box).max(30).catch([]),
  guardBooths: z.array(z.object({ u: num, v: num, note: z.string().max(140).optional().catch(undefined) })).max(12).catch([]),
  darkZones: z.array(box.extend({ reason: z.string().max(160).optional().catch(undefined) })).max(20).catch([]),
});

export type VisionLayout = z.infer<typeof VisionLayoutSchema>;

export const VISION_SYSTEM = `You are an urban-planning vision analyst helping a Resident Welfare Association (RWA) build a security digital twin of their residential society from a top-down satellite image. Be precise about positions. Only report features you can actually see. Never identify individuals. Output JSON only.`;

export function buildVisionPrompt(args: { widthM: number; depthM: number; placeName?: string; world?: World | null }): string {
  const { widthM: W, depthM: D } = args;
  const toU = (x: number) => Math.round((x / W + 0.5) * 1000);
  const toV = (zz: number) => Math.round((zz / D + 0.5) * 1000);
  const w = args.world;
  const osmB = (w?.buildings ?? []).slice(0, 120).map((b) => `[${toU(b.x)},${toV(b.z)} ${Math.round(b.width)}x${Math.round(b.depth)}m${b.floors ? ` ${b.floors}fl` : ""}]`);
  const osmR = (w?.roads ?? []).slice(0, 60).map((r) => `${r.category}${r.name ? ` "${r.name}"` : ""}: ${r.points.filter((_, i, a) => i === 0 || i === a.length - 1 || i % 3 === 0).map((p) => `${toU(p.x)},${toV(p.z)}`).join(" ")}`);
  const osmP = (w?.facilities ?? []).filter((f) => f.type === "park").slice(0, 20).map((f) => `${f.name ?? "park"} @${toU(f.x)},${toV(f.z)}`);
  return `Satellite image (north up) of ${args.placeName ? `"${args.placeName}"` : "a residential area in India"}. It covers ${Math.round(W)} m (east-west) × ${Math.round(D)} m (north-south), ≈${(W / 1000).toFixed(3)} m per grid unit horizontally.

COORDINATES: use a normalized grid u,v in 0..1000 — u = left→right (west→east), v = top→bottom (north→south). Sizes (widthM, depthM) are in METERS; rotationDeg is the clockwise rotation of the footprint's long axis from east.

ALREADY MAPPED in OpenStreetMap (do NOT repeat these; add only what OSM is missing):
Buildings (${w?.buildings.length ?? 0}): ${osmB.join(" ") || "none"}
Roads (${w?.roads.length ?? 0}):
${osmR.join("\n") || "none"}
Parks: ${osmP.join("; ") || "none"}

TASK — analyse the society / gated community that occupies most of the image and return JSON:
{
 "societyType": one of "gated_highrise" | "gated_lowrise" | "plotted_colony" | "villa_enclave" | "mixed_street" | "commercial" | "other",
 "description": 2-3 sentences: layout, density, approximate tower/house count, how it is entered, notable security-relevant traits (perimeter, open edges, vegetation),
 "boundary": [[u,v],...] polyline of the compound wall / society perimeter (clockwise, 4-40 points; [] if not a walled compound),
 "gates": [{"u","v","kind":"main"|"service"|"pedestrian","name"?}] — entry points on the boundary where internal roads meet outside roads,
 "buildings": [{"u","v","widthM","depthM","rotationDeg","floors","category"}] — buildings visible but NOT in the OSM list above (estimate floors from shadow length/roof type: towers 10-30, apartments 4-8, houses 1-3),
 "roads": [{"points":[[u,v],...],"kind":"road"|"path"}] — internal roads/driveways/footpaths missing from OSM,
 "openAreas": [{"u","v","widthM","depthM","name"?}] — parks, lawns, playgrounds, clubhouse grounds,
 "parking": [{"u","v","widthM","depthM","rotationDeg"}] — surface parking lots,
 "guardBooths": [{"u","v","note"}] — likely or recommended guard booth spots (usually beside gates),
 "darkZones": [{"u","v","widthM","depthM","reason"}] — likely dark or secluded zones at night (behind towers, along back walls, dense tree cover, service lanes, empty plots).
Keep lists concise (max ~40 buildings). Return JSON only.`;
}

export interface MergeResult {
  world: World;
  added: { buildings: number; roads: number; parks: number; walls: number; gates: number; areas: number; booths: number };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

function overlapsBuilding(c: { x: number; z: number; width: number; depth: number }, list: Building[]) {
  return list.some((b) => {
    const ox = Math.min(c.x + c.width / 2, b.x + b.width / 2) - Math.max(c.x - c.width / 2, b.x - b.width / 2);
    const oz = Math.min(c.z + c.depth / 2, b.z + b.depth / 2) - Math.max(c.z - c.depth / 2, b.z - b.depth / 2);
    if (ox <= 0 || oz <= 0) return false;
    return (ox * oz) / Math.min(c.width * c.depth, b.width * b.depth) > 0.25;
  });
}

/** Merge a validated Gemini layout into an (OSM) world. OSM geometry wins; Gemini fills gaps. */
export function mergeVisionLayout(base: World, layout: VisionLayout): MergeResult {
  const W = base.bounds.width;
  const D = base.bounds.depth;
  const hx = W / 2 - 1;
  const hz = D / 2 - 1;
  const pt = (u: number, v: number): Vec2 => ({ x: clamp((u / 1000 - 0.5) * W, -hx, hx), z: clamp((v / 1000 - 0.5) * D, -hz, hz) });
  const size = (m: number | undefined, def: number, max: number) => clamp(Number.isFinite(m) && m! > 0 ? m! : def, 2, max);
  // model gives clockwise-from-east (screen); world rotation is three.js Y (counter-clockwise from above)
  const rot = (deg: number | undefined) => (-(Number.isFinite(deg) ? deg! : 0) * Math.PI) / 180;

  const world: World = {
    ...base,
    roads: [...base.roads],
    buildings: [...base.buildings],
    facilities: [...base.facilities],
    site: base.site ? { ...base.site } : { walls: [], gates: [], areas: [], booths: [] },
  };
  const site = world.site as SiteLayers;
  const added = { buildings: 0, roads: 0, parks: 0, walls: 0, gates: 0, areas: 0, booths: 0 };

  layout.buildings.forEach((b, i) => {
    const c = pt(b.u, b.v);
    const width = size(b.widthM, 14, 120);
    const depth = size(b.depthM, 14, 120);
    if (overlapsBuilding({ ...c, width, depth }, world.buildings)) return;
    const floors = Math.round(clamp(b.floors ?? 3, 1, 45));
    world.buildings.push({
      id: `bd_ai_${i}`,
      name: b.name,
      x: c.x,
      z: c.z,
      width,
      depth,
      rotation: rot(b.rotationDeg),
      height: floors * 3,
      floors,
      category: b.category as BuildingCategory,
      occupancy: Math.max(2, Math.round(((width * depth) / 55) * Math.min(floors, 20) * 0.6) * 2),
      inferred: true,
    });
    added.buildings += 1;
  });

  layout.roads.forEach((r, i) => {
    const points = r.points.map(([u, v]) => pt(u, v));
    const mid = points[Math.floor(points.length / 2)];
    const covered = base.roads.some((o) => o.points.some((p, k) => k > 0 && distToSeg(mid, o.points[k - 1], p) < 6));
    if (covered) return;
    world.roads.push({ id: `rd_ai_${i}`, points, width: r.kind === "path" ? 2 : 5, category: r.kind, pedestrian: true, inferred: true } satisfies Road);
    added.roads += 1;
  });

  layout.openAreas.forEach((a, i) => {
    const c = pt(a.u, a.v);
    if (base.facilities.some((f) => f.type === "park" && Math.hypot(f.x - c.x, f.z - c.z) < 20)) return;
    const radius = clamp(Math.max(a.widthM ?? 20, a.depthM ?? 20) / 2, 5, 90);
    world.facilities.push({ id: `fc_ai_${i}`, name: a.name ?? "Open area", type: "park", x: c.x, z: c.z, radius, inferred: true } satisfies Facility);
    added.parks += 1;
  });

  if (layout.boundary.length >= 3) {
    site.walls = [...site.walls, { id: "wl_ai_boundary", points: layout.boundary.map(([u, v]) => pt(u, v)), closed: true, height: 2.4, inferred: true }];
    added.walls += 1;
  }
  site.gates = [
    ...site.gates,
    ...layout.gates.map((g, i) => ({ id: `gt_ai_${i}`, name: g.name ?? (g.kind === "main" ? "Main gate" : g.kind === "service" ? "Service gate" : "Pedestrian gate"), kind: g.kind, ...pt(g.u, g.v), inferred: true })),
  ];
  added.gates = layout.gates.length;
  const areas = [
    ...layout.parking.map((a, i) => ({ id: `ar_ai_p${i}`, kind: "parking" as const, name: "Parking", ...pt(a.u, a.v), width: size(a.widthM, 20, 150), depth: size(a.depthM, 12, 150), rotation: rot(a.rotationDeg), inferred: true })),
    ...layout.darkZones.map((a, i) => ({ id: `ar_ai_d${i}`, kind: "dark" as const, name: "Likely dark zone", note: a.reason, ...pt(a.u, a.v), width: size(a.widthM, 25, 150), depth: size(a.depthM, 25, 150), rotation: rot(a.rotationDeg), inferred: true })),
  ];
  site.areas = [...site.areas, ...areas];
  added.areas = areas.length;
  site.booths = [...site.booths, ...layout.guardBooths.map((b, i) => ({ id: `bt_ai_${i}`, note: b.note, ...pt(b.u, b.v), inferred: true }))];
  added.booths = layout.guardBooths.length;

  return { world, added };
}

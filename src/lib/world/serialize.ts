/**
 * Project serialization: versioned schema validation, export/import,
 * and safe migration. Invalid files never crash the app — they are
 * rejected with a human-readable reason.
 */

import type { PraesidiumProject, ProjectGeo, SiteLayers, World } from "./types";
import { WORLD_SCHEMA_VERSION } from "./types";
import { defaultScenario } from "./types";

export interface ParseResult {
  ok: boolean;
  project?: PraesidiumProject;
  error?: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Validate + normalize an arbitrary parsed JSON value into a project. */
export function parseProject(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, error: "File is not a JSON object." };

  const schemaVersion = num(raw.schemaVersion, -1);
  if (schemaVersion < 0) return { ok: false, error: "Missing schemaVersion." };
  if (schemaVersion > WORLD_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schema version ${schemaVersion} (this build supports up to ${WORLD_SCHEMA_VERSION}). The file was created by a newer version of Praesidium.`,
    };
  }
  if (!isObj(raw.world)) return { ok: false, error: "Missing world data." };

  const w = raw.world as Record<string, unknown>;
  const world: World = {
    bounds: {
      width: num(isObj(w.bounds) ? (w.bounds as Record<string, unknown>).width : 320, 320),
      depth: num(isObj(w.bounds) ? (w.bounds as Record<string, unknown>).depth : 240, 240),
    },
    roads: [],
    buildings: [],
    facilities: [],
    streetlights: [],
    cameras: [],
    guards: [],
  };

  try {
    for (const r of Array.isArray(w.roads) ? w.roads : []) {
      if (!isObj(r)) continue;
      const points = (Array.isArray(r.points) ? r.points : [])
        .filter(isObj)
        .map((p) => ({ x: num(p.x), z: num(p.z) }));
      if (points.length < 2) continue;
      world.roads.push({
        id: str(r.id) || `rd_${world.roads.length}`,
        name: str(r.name) || undefined,
        points,
        width: num(r.width, 4),
        category: r.category === "path" ? "path" : "road",
        pedestrian: bool(r.pedestrian, true),
        inferred: bool(r.inferred, false),
      });
    }
    for (const b of Array.isArray(w.buildings) ? w.buildings : []) {
      if (!isObj(b)) continue;
      world.buildings.push({
        id: str(b.id) || `bd_${world.buildings.length}`,
        name: str(b.name) || undefined,
        x: num(b.x),
        z: num(b.z),
        width: Math.max(1, num(b.width, 8)),
        depth: Math.max(1, num(b.depth, 8)),
        rotation: num(b.rotation, 0),
        height: Math.max(2, num(b.height, 6)),
        floors: Math.max(1, num(b.floors, 2)),
        category: (["residential", "commercial", "community", "mixed", "other"] as const).includes(
          b.category as never
        )
          ? (b.category as World["buildings"][number]["category"])
          : "other",
        occupancy: Math.max(0, num(b.occupancy, 4)),
        entrance: isObj(b.entrance)
          ? { x: num((b.entrance as Record<string, unknown>).x), z: num((b.entrance as Record<string, unknown>).z) }
          : undefined,
        inferred: bool(b.inferred, false),
      });
    }
    for (const f of Array.isArray(w.facilities) ? w.facilities : []) {
      if (!isObj(f)) continue;
      world.facilities.push({
        id: str(f.id) || `fc_${world.facilities.length}`,
        name: str(f.name) || undefined,
        type: (["bus_stop", "park", "community_centre", "market", "school", "clinic", "atm", "place_of_worship", "other"] as const).includes(
          f.type as never
        )
          ? (f.type as World["facilities"][number]["type"])
          : "other",
        x: num(f.x),
        z: num(f.z),
        radius: num(f.radius, 0) || undefined,
        inferred: bool(f.inferred, false),
      });
    }
    for (const l of Array.isArray(w.streetlights) ? w.streetlights : []) {
      if (!isObj(l)) continue;
      world.streetlights.push({
        id: str(l.id) || `sl_${world.streetlights.length}`,
        x: num(l.x),
        z: num(l.z),
        height: Math.max(3, num(l.height, 8)),
        brightness: Math.min(1, Math.max(0.05, num(l.brightness, 0.85))),
        radius: Math.max(4, num(l.radius, 18)),
        on: bool(l.on, true),
        maintenance: l.maintenance === "faulty" ? "faulty" : "ok",
      });
    }
    for (const c of Array.isArray(w.cameras) ? w.cameras : []) {
      if (!isObj(c)) continue;
      world.cameras.push({
        id: str(c.id) || `cam_${world.cameras.length}`,
        x: num(c.x),
        z: num(c.z),
        height: Math.max(2, num(c.height, 6)),
        range: Math.max(3, num(c.range, 28)),
        fovDeg: Math.min(360, Math.max(10, num(c.fovDeg, 80))),
        orientationDeg: num(c.orientationDeg, 0),
        active: bool(c.active, true),
      });
    }
    for (const g of Array.isArray(w.guards) ? w.guards : []) {
      if (!isObj(g)) continue;
      const waypoints = (Array.isArray(g.waypoints) ? g.waypoints : [])
        .filter(isObj)
        .map((p) => ({ x: num(p.x), z: num(p.z) }));
      world.guards.push({
        id: str(g.id) || `gd_${world.guards.length}`,
        name: str(g.name) || "Guard",
        speed: Math.max(0.2, num(g.speed, 1.1)),
        waypoints,
        active: bool(g.active, true),
      });
    }
    if (isObj(w.site)) world.site = parseSite(w.site);
  } catch {
    return { ok: false, error: "World data is malformed and could not be read." };
  }

  const scenario = isObj(raw.scenario)
    ? normalizeScenario(raw.scenario)
    : defaultScenario("typical_night");

  const now = new Date().toISOString();
  const project: PraesidiumProject = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    projectId: str(raw.projectId) || `prj_${Date.now().toString(36)}`,
    name: str(raw.name) || "Imported Project",
    description: str(raw.description),
    createdAt: str(raw.createdAt) || now,
    modifiedAt: str(raw.modifiedAt) || now,
    source:
      isObj(raw.source) && raw.source.kind === "osm"
        ? { kind: "osm", attribution: str((raw.source as Record<string, unknown>).attribution) || "© OpenStreetMap contributors", importedAt: str((raw.source as Record<string, unknown>).importedAt) || undefined, geo: parseGeo((raw.source as Record<string, unknown>).geo) }
        : isObj(raw.source) && raw.source.kind === "demo"
          ? { kind: "demo" }
          : { kind: "blank" },
    world,
    scenario,
    baselineRun: null,
    interventionRun: null,
  };
  return { ok: true, project };
}

function parseGeo(g: unknown): ProjectGeo | undefined {
  if (!isObj(g) || !Array.isArray(g.bbox) || g.bbox.length !== 4) return undefined;
  const bbox = g.bbox.map((v) => num(v, NaN));
  if (!bbox.every(Number.isFinite)) return undefined;
  return {
    lat: num(g.lat, (bbox[0] + bbox[1]) / 2),
    lng: num(g.lng, (bbox[2] + bbox[3]) / 2),
    bbox: bbox as [number, number, number, number],
    placeName: str(g.placeName) || undefined,
    societyType: str(g.societyType) || undefined,
    summary: str(g.summary) || undefined,
    satelliteImage: str(g.satelliteImage) || undefined,
  };
}

function parseSite(s: Record<string, unknown>): SiteLayers {
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);
  const pts = (v: unknown) => arr(v).map((p) => ({ x: num(p.x), z: num(p.z) }));
  return {
    walls: arr(s.walls)
      .map((x, i) => ({ id: str(x.id) || `wl_${i}`, points: pts(x.points), closed: bool(x.closed, false), height: num(x.height, 2.4), inferred: bool(x.inferred, false) }))
      .filter((x) => x.points.length >= 2),
    gates: arr(s.gates).map((x, i) => ({
      id: str(x.id) || `gt_${i}`,
      name: str(x.name) || undefined,
      kind: x.kind === "service" || x.kind === "pedestrian" ? x.kind : "main",
      x: num(x.x),
      z: num(x.z),
      inferred: bool(x.inferred, false),
    })),
    areas: arr(s.areas).map((x, i) => ({
      id: str(x.id) || `ar_${i}`,
      kind: x.kind === "parking" || x.kind === "dark" ? x.kind : "open",
      name: str(x.name) || undefined,
      x: num(x.x),
      z: num(x.z),
      width: num(x.width, 10),
      depth: num(x.depth, 10),
      rotation: num(x.rotation),
      note: str(x.note) || undefined,
      inferred: bool(x.inferred, false),
    })),
    booths: arr(s.booths).map((x, i) => ({ id: str(x.id) || `bt_${i}`, x: num(x.x), z: num(x.z), note: str(x.note) || undefined, inferred: bool(x.inferred, false) })),
  };
}

function normalizeScenario(s: Record<string, unknown>) {
  const base = defaultScenario(
    s.id === "low_visibility_night" || s.id === "high_risk_night" ? s.id : "typical_night"
  );
  return {
    ...base,
    id: (s.id as never) ?? base.id,
    name: str(s.name) || base.name,
    description: str(s.description) || base.description,
    startTime: str(s.startTime) || base.startTime,
    durationSec: Math.min(7200, Math.max(120, num(s.durationSec, base.durationSec))),
    population: Math.min(200, Math.max(0, num(s.population, base.population))),
    residentRatio: Math.min(1, Math.max(0, num(s.residentRatio, base.residentRatio))),
    pedestrianSpeed: Math.min(3, Math.max(0.3, num(s.pedestrianSpeed, base.pedestrianSpeed))),
    guardCount: s.guardCount === null ? null : Math.max(0, num(s.guardCount, 0)) || null,
    guardSpeed: Math.min(3, Math.max(0.3, num(s.guardSpeed, base.guardSpeed))),
    eventsPerHour: Math.min(120, Math.max(0, num(s.eventsPerHour, base.eventsPerHour))),
    lightingOutageFraction: Math.min(1, Math.max(0, num(s.lightingOutageFraction, base.lightingOutageFraction))),
    ambientVisibility: Math.min(1, Math.max(0.2, num(s.ambientVisibility, base.ambientVisibility))),
    cctvRangeScale: Math.min(3, Math.max(0.2, num(s.cctvRangeScale, base.cctvRangeScale))),
    seed: Math.abs(num(s.seed, base.seed)) || base.seed,
    perpCount: Math.min(20, Math.max(0, Math.round(num(s.perpCount, base.perpCount ?? 0)))),
    guardFatigue: Math.min(1, Math.max(0, num(s.guardFatigue, base.guardFatigue ?? 0))),
    ...(isObj(s.incidentMix) ? { incidentMix: s.incidentMix as Record<string, number> } : {}),
  };
}

/** Serialize a project for export (runs are preserved; frames never are). */
export function exportProjectJson(project: PraesidiumProject): string {
  return JSON.stringify(
    {
      ...project,
      exportedBy: "Praesidium",
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Server-side OSM helpers (Nominatim geocoding + Overpass feature fetch).
 *
 * Providers are configurable via env and are treated as best-effort
 * public services: timeouts, size caps, and clear errors are mandatory.
 * The MVP never depends on these being available.
 */

const NOMINATIM_URL = process.env.OSM_NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const OVERPASS_MIRRORS = [
  process.env.OSM_OVERPASS_URL || "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const FETCH_TIMEOUT_MS = Number(process.env.OSM_TIMEOUT_MS || 15000);

export const MAX_IMPORT_SPAN_M = 2200;
export const MAX_ROADS = 260;
export const MAX_BUILDINGS = 320;
export const MAX_FACILITIES = 90;

export interface GeoSearchResult {
  displayName: string;
  lat: number;
  lon: number;
  boundingbox: [number, number, number, number]; // [s, n, w, e]
}

export async function geocode(q: string): Promise<GeoSearchResult[]> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  const res = await fetch(url, {
    headers: { "User-Agent": "Praesidium/1.0 (neighborhood safety planning demo)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Geocoder returned HTTP ${res.status}`);
  const data = (await res.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
    boundingbox?: string[];
  }>;
  return data
    .filter((d) => d.lat && d.lon)
    .map((d) => ({
      displayName: d.display_name ?? "Unknown place",
      lat: parseFloat(d.lat!),
      lon: parseFloat(d.lon!),
      boundingbox: [
        parseFloat(d.boundingbox?.[0] ?? d.lat!),
        parseFloat(d.boundingbox?.[1] ?? d.lat!),
        parseFloat(d.boundingbox?.[2] ?? d.lon!),
        parseFloat(d.boundingbox?.[3] ?? d.lon!),
      ],
    }));
}

export interface OsmFeatureBundle {
  roads: Array<{ id: string; name?: string; points: [number, number][]; width: number; path: boolean }>;
  buildings: Array<{ id: string; name?: string; polygon: [number, number][]; height?: number; levels?: number }>;
  parks: Array<{ id: string; name?: string; polygon: [number, number][] }>;
  facilities: Array<{ id: string; name?: string; type: string; lat: number; lon: number }>;
  attribution: string;
  fetchedAt: string;
}

interface OverpassEl {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  lat?: number;
  lon?: number;
}

const UA = "Praesidium/1.0 (neighborhood safety planning demo; contact: sapandeep@thevectorlabs.in)";
const OSM_API_URL = process.env.OSM_API_URL || "https://api.openstreetmap.org/api/0.6/map";
const TOTAL_BUDGET_MS = Number(process.env.OSM_BUDGET_MS || 40000);
const PER_TRY_MS = Math.min(FETCH_TIMEOUT_MS, 14000);
const CACHE_TTL_MS = 10 * 60 * 1000;
/** OSM API caps the request area; stay well under its 0.25 sq-degree limit. */
const OSM_API_MAX_AREA_DEG2 = 0.02;
const HIGHWAY_RE = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian|footway|path|cycleway|track|steps)$/;
const AMENITY_RE = /^(community_centre|clinic|marketplace|place_of_worship|school|atm)$/;
const LEISURE_RE = /^(park|garden|playground)$/;

let overpassDownUntil = 0;
const bundleCache =new Map<string, { at: number; bundle: OsmFeatureBundle }>();

export class OsmImportError extends Error {
  constructor(message: string, public readonly kind: "timeout" | "rate_limited" | "unavailable" = "unavailable") {
    super(message);
  }
}

/** Validate/normalize a bbox. Returns an error string or null. Pure — unit tested. */
export function validateBbox(s: number, n: number, w: number, e: number): string | null {
  if (![s, n, w, e].every((v) => Number.isFinite(v))) return "Missing or invalid bounding box.";
  if (s < -90 || n > 90 || w < -180 || e > 180) return "Bounding box coordinates are out of range.";
  if (!(n > s && e > w)) return "Bounding box is empty or inverted.";
  const spanLat = (n - s) * 111320;
  const spanLon = (e - w) * 111320 * Math.cos(((s + n) / 2) * (Math.PI / 180));
  if (spanLat > MAX_IMPORT_SPAN_M || spanLon > MAX_IMPORT_SPAN_M) {
    return `Selected area is too large (max ~${Math.round(MAX_IMPORT_SPAN_M / 1000)} km per side). Pick a smaller neighborhood.`;
  }
  return null;
}

function cacheKey(s: number, n: number, w: number, e: number) {
  const r = (v: number) => v.toFixed(4);
  return `${r(s)},${r(w)},${r(n)},${r(e)}`;
}

/** Parse an OSM API 0.6 /map XML document into Overpass-style elements (with way geometry). Pure. */
export function parseOsmXml(xml: string): OverpassEl[] {
  const nodes = new Map<string, { lat: number; lon: number }>();
  const nodeEls: OverpassEl[] = [];
  const wayEls: OverpassEl[] = [];
  const attr = (s: string, k: string) => new RegExp(`\\b${k}="([^"]*)"`).exec(s)?.[1];
  const unesc = (v: string) =>
    v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const tagsOf = (body: string) => {
    const tags: Record<string, string> = {};
    for (const m of body.matchAll(/<tag\s+([^>]*?)\/?>/g)) {
      const k = attr(m[1], "k");
      const v = attr(m[1], "v");
      if (k !== undefined && v !== undefined) tags[unesc(k)] = unesc(v);
    }
    return tags;
  };
  // <node .../> or <node ...> ... </node>
  for (const m of xml.matchAll(/<node\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const id = attr(m[1], "id");
    const lat = parseFloat(attr(m[1], "lat") ?? "");
    const lon = parseFloat(attr(m[1], "lon") ?? "");
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    nodes.set(id, { lat, lon });
    if (m[2]) {
      const tags = tagsOf(m[2]);
      if (Object.keys(tags).length) nodeEls.push({ type: "node", id: Number(id), lat, lon, tags });
    }
  }
  for (const m of xml.matchAll(/<way\s+([^>]*?)>([\s\S]*?)<\/way>/g)) {
    const id = attr(m[1], "id");
    if (!id) continue;
    const tags = tagsOf(m[2]);
    const isHighway = !!tags.highway && HIGHWAY_RE.test(tags.highway);
    const isBuilding = !!tags.building;
    const isLeisure = !!tags.leisure && LEISURE_RE.test(tags.leisure);
    if (!isHighway && !isBuilding && !isLeisure) continue;
    const geometry: Array<{ lat: number; lon: number }> = [];
    for (const nd of m[2].matchAll(/<nd\s+ref="(\d+)"/g)) {
      const p = nodes.get(nd[1]);
      if (p) geometry.push(p);
    }
    if (geometry.length >= 2) wayEls.push({ type: "way", id: Number(id), tags, geometry });
  }
  const keepNode = (el: OverpassEl) =>
    el.tags?.highway === "bus_stop" || (!!el.tags?.amenity && AMENITY_RE.test(el.tags.amenity));
  return [...wayEls, ...nodeEls.filter(keepNode)];
}

function classifyHttpError(status: number, bodyText: string): OsmImportError {
  if (status === 429 || /rate_limited|too many requests/i.test(bodyText)) {
    return new OsmImportError("The map data provider is rate-limiting requests. Try again in a minute.", "rate_limited");
  }
  if (status === 504 || status === 502 || status === 503 || /timeout|too busy|runtime error/i.test(bodyText)) {
    return new OsmImportError(`Map data provider is busy (HTTP ${status}).`, "timeout");
  }
  return new OsmImportError(`Map data provider returned HTTP ${status}`);
}

async function tryOverpass(mirror: string, query: string, ms: number): Promise<OverpassEl[]> {
  const res = await fetch(mirror, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": UA,
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(ms),
  });
  const text = await res.text();
  if (!res.ok) throw classifyHttpError(res.status, text.slice(0, 400));
  // Overpass sometimes answers 200 with an HTML/XML error page or a JSON "remark" runtime error.
  if (!text.trimStart().startsWith("{")) throw classifyHttpError(504, text.slice(0, 400));
  const data = JSON.parse(text) as { elements?: OverpassEl[]; remark?: string };
  if (data.remark && /error|timed out|out of memory/i.test(data.remark) && !(data.elements?.length)) {
    throw new OsmImportError(`Map data provider reported: ${data.remark.slice(0, 120)}`, "timeout");
  }
  return data.elements ?? [];
}

async function tryOsmApi(s: number, n: number, w: number, e: number, ms: number): Promise<OverpassEl[]> {
  const url = `${OSM_API_URL}?bbox=${w.toFixed(6)},${s.toFixed(6)},${e.toFixed(6)},${n.toFixed(6)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/xml" },
    signal: AbortSignal.timeout(ms),
  });
  const text = await res.text();
  if (!res.ok) throw classifyHttpError(res.status, text.slice(0, 400));
  return parseOsmXml(text);
}

export async function fetchOsmFeatures(s: number, n: number, w: number, e: number): Promise<OsmFeatureBundle> {
  const bad = validateBbox(s, n, w, e);
  if (bad) throw new OsmImportError(bad);

  const key = cacheKey(s, n, w, e);
  const hit = bundleCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.bundle;

  const bbox = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
  const query = `[out:json][timeout:25][maxsize:67108864];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian|footway|path|cycleway|track|steps)$"](${bbox});
  way["building"](${bbox});
  way["leisure"~"^(park|garden|playground)$"](${bbox});
  node["highway"="bus_stop"](${bbox});
  node["amenity"~"^(community_centre|clinic|marketplace|place_of_worship|school|atm)$"](${bbox});
);
out body geom;`;

  const started = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - started);
  const mirrors = Array.from(new Set(OVERPASS_MIRRORS));
  const area = (n - s) * (e - w);
  const canUseApi = area <= OSM_API_MAX_AREA_DEG2;

  type Attempt = { label: string; run: (ms: number) => Promise<OverpassEl[]> };
  const attempts: Attempt[] = mirrors.map((m) => ({ label: m, run: (ms) => tryOverpass(m, query, ms) }));
  if (canUseApi) {
    const apiAttempt: Attempt = { label: OSM_API_URL, run: (ms) => tryOsmApi(s, n, w, e, ms) };
    // If every Overpass mirror failed very recently, go straight to the official API first.
    if (Date.now() < overpassDownUntil) attempts.unshift(apiAttempt);
    else attempts.push(apiAttempt);
  }

  let els: OverpassEl[] | null = null;
  const errors: OsmImportError[] = [];
  for (const a of attempts) {
    const left = remaining();
    if (left < 2500) break;
    try {
      els = await a.run(Math.min(PER_TRY_MS, left));
      if (a.label === OSM_API_URL && errors.length >= mirrors.length) overpassDownUntil = Date.now() + 2 * 60 * 1000;
      else if (a.label !== OSM_API_URL) overpassDownUntil = 0;
      break;
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      errors.push(
        err instanceof OsmImportError
          ? err
          : new OsmImportError(err instanceof Error ? err.message : String(err), isTimeout ? "timeout" : "unavailable")
      );
      console.warn(`[osm] ${a.label} failed after ${Date.now() - started}ms: ${errors[errors.length - 1].message}`);
    }
  }
  if (els === null) {
    const kind = errors.every((x) => x.kind === "rate_limited")
      ? "rate_limited"
      : errors.some((x) => x.kind === "timeout")
      ? "timeout"
      : "unavailable";
    throw new OsmImportError(
      kind === "rate_limited"
        ? "The map data provider is rate-limiting requests. Try again in a minute."
        : kind === "timeout"
        ? "The map data service timed out. Public OSM endpoints can be slow — try again, or continue with the demo neighborhood."
        : `Map data providers are unavailable${errors.length ? ` (${errors[errors.length - 1].message})` : ""}.`,
      kind
    );
  }

  const bundle: OsmFeatureBundle = {
    roads: [],
    buildings: [],
    parks: [],
    facilities: [],
    attribution: "© OpenStreetMap contributors",
    fetchedAt: new Date().toISOString(),
  };

  for (const el of els) {
    const tags = el.tags ?? {};
    if (el.type === "way" && el.geometry && el.geometry.length >= 2) {
      const pts = el.geometry.map((g) => [g.lat, g.lon] as [number, number]);
      if (tags.highway) {
        if (bundle.roads.length >= MAX_ROADS) continue;
        bundle.roads.push({
          id: `osm_way_${el.id}`,
          name: tags.name,
          points: pts,
          width: roadWidth(tags.highway, tags.lanes),
          path: ["footway", "path", "pedestrian", "steps", "cycleway", "track"].includes(tags.highway),
        });
      } else if (tags.building) {
        if (bundle.buildings.length >= MAX_BUILDINGS) continue;
        bundle.buildings.push({
          id: `osm_bld_${el.id}`,
          name: tags.name,
          polygon: pts,
          height: tags.height ? parseFloat(tags.height) || undefined : undefined,
          levels: tags["building:levels"] ? parseFloat(tags["building:levels"]) || undefined : undefined,
        });
      } else if (tags.leisure) {
        if (bundle.parks.length >= MAX_FACILITIES) continue;
        bundle.parks.push({ id: `osm_park_${el.id}`, name: tags.name, polygon: pts });
      }
    } else if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      if (bundle.facilities.length >= MAX_FACILITIES) continue;
      if (tags.highway === "bus_stop") {
        bundle.facilities.push({ id: `osm_node_${el.id}`, name: tags.name, type: "bus_stop", lat: el.lat, lon: el.lon });
      } else if (tags.amenity) {
        const map: Record<string, string> = {
          community_centre: "community_centre",
          clinic: "clinic",
          marketplace: "market",
          place_of_worship: "place_of_worship",
          school: "school",
          atm: "atm",
        };
        const t = map[tags.amenity];
        if (t) bundle.facilities.push({ id: `osm_node_${el.id}`, name: tags.name, type: t, lat: el.lat, lon: el.lon });
      }
    }
  }
  bundleCache.set(key, { at: Date.now(), bundle });
  if (bundleCache.size > 20) bundleCache.delete(bundleCache.keys().next().value as string);
  return bundle;
}

function roadWidth(highway: string, lanes?: string): number {
  const n = lanes ? parseInt(lanes, 10) || 0 : 0;
  if (n > 0) return Math.min(14, 3 + n * 1.6);
  switch (highway) {
    case "motorway":
    case "trunk":
      return 12;
    case "primary":
      return 10;
    case "secondary":
      return 8.5;
    case "tertiary":
      return 7.5;
    case "residential":
      return 6.5;
    case "service":
    case "living_street":
      return 4.5;
    case "pedestrian":
      return 4;
    default:
      return 2.2; // footway/path
  }
}

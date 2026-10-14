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
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
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

export async function fetchOsmFeatures(s: number, n: number, w: number, e: number): Promise<OsmFeatureBundle> {
  const bbox = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:25];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian|footway|path|cycleway|track|steps)$"](${bbox});
  way["building"](${bbox});
  way["leisure"~"^(park|garden|playground)$"](${bbox});
  node["highway"="bus_stop"](${bbox});
  node["amenity"~"^(community_centre|clinic|marketplace|place_of_worship|school|atm)$"](${bbox});
);
out body geom;`;

  let lastError: Error | null = null;
  let els: OverpassEl[] = [];

  const uniqueMirrors = Array.from(new Set(OVERPASS_MIRRORS));
  for (const mirror of uniqueMirrors) {
    try {
      const res = await fetch(mirror, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Praesidium/1.0 (neighborhood safety planning demo)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (res.status === 429) {
          lastError = new Error("The map data provider is rate-limiting requests. Try again in a minute.");
          continue;
        }
        lastError = new Error(`Map data provider returned HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as { elements?: OverpassEl[] };
      els = data.elements ?? [];
      lastError = null;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (lastError && els.length === 0) {
    throw lastError;
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

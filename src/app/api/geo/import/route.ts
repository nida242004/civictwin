import { NextRequest, NextResponse } from "next/server";
import { fetchOsmFeatures, validateBbox } from "@/lib/geo/osm";
import { convertOsmToWorld } from "@/lib/geo/convert";
import { friendlyUpstreamError, rateLimit, readJson } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/geo/import — fetch OSM features for a bounding box and convert
 * them into the internal world model. Bounded by max area + feature caps.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "geo/import", 12);
  if (limited) return limited;
  const parsed = await readJson<{ south?: unknown; north?: unknown; west?: unknown; east?: unknown; name?: unknown; fixToBbox?: unknown }>(req, 4096);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;

  const s = Number(body.south);
  const n = Number(body.north);
  const w = Number(body.west);
  const e = Number(body.east);
  const bad = validateBbox(s, n, w, e);
  if (bad) return NextResponse.json({ ok: false, error: bad }, { status: 400 });
  const spanLat = (n - s) * 111320;
  const spanLon = (e - w) * 111320 * Math.cos(((s + n) / 2) * (Math.PI / 180));

  try {
    const bundle = await fetchOsmFeatures(s, n, w, e);
    // fixToBbox: origin = bbox center and bounds = bbox span (aligns with /api/geo/satellite imagery)
    const fix = body.fixToBbox === true;
    const { world, stats, notes } = convertOsmToWorld(
      bundle,
      fix ? { origin: { lat: (s + n) / 2, lon: (w + e) / 2 }, bounds: { width: spanLon, depth: spanLat } } : undefined
    );
    if (!fix && stats.roads === 0 && stats.buildings === 0) {
      return NextResponse.json(
        { ok: false, error: "No mapped roads or buildings were found in this area. Try a different place or use the demo neighborhood." },
        { status: 422 }
      );
    }
    return NextResponse.json({
      ok: true,
      data: {
        world,
        stats,
        notes,
        attribution: bundle.attribution,
        fetchedAt: bundle.fetchedAt,
        suggestedName: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : "Imported Neighborhood",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[geo/import] failed:", msg.slice(0, 300));
    const f = friendlyUpstreamError(err, "OpenStreetMap");
    return NextResponse.json({ ok: false, error: f.message, rateLimited: f.rateLimited }, { status: f.status });
  }
}

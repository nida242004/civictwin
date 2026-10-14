import { NextRequest, NextResponse } from "next/server";
import { fetchOsmFeatures, MAX_IMPORT_SPAN_M } from "@/lib/geo/osm";
import { convertOsmToWorld } from "@/lib/geo/convert";

export const dynamic = "force-dynamic";

/**
 * POST /api/geo/import — fetch OSM features for a bounding box and convert
 * them into the internal world model. Bounded by max area + feature caps.
 */
export async function POST(req: NextRequest) {
  let body: { south?: unknown; north?: unknown; west?: unknown; east?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const s = Number(body.south);
  const n = Number(body.north);
  const w = Number(body.west);
  const e = Number(body.east);
  if (![s, n, w, e].every((v) => Number.isFinite(v))) {
    return NextResponse.json({ ok: false, error: "Missing or invalid bounding box." }, { status: 400 });
  }
  if (!(n > s && e > w)) {
    return NextResponse.json({ ok: false, error: "Bounding box is empty or inverted." }, { status: 400 });
  }

  const spanLat = (n - s) * 111320;
  const spanLon = (e - w) * 111320 * Math.cos(((s + n) / 2) * (Math.PI / 180));
  if (spanLat > MAX_IMPORT_SPAN_M || spanLon > MAX_IMPORT_SPAN_M) {
    return NextResponse.json(
      { ok: false, error: `Selected area is too large (max ~${Math.round(MAX_IMPORT_SPAN_M / 1000)} km per side). Pick a smaller neighborhood.` },
      { status: 400 }
    );
  }

  try {
    const bundle = await fetchOsmFeatures(s, n, w, e);
    const { world, stats, notes } = convertOsmToWorld(bundle);
    if (stats.roads === 0 && stats.buildings === 0) {
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
    const timeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
    return NextResponse.json(
      {
        ok: false,
        error: timeout
          ? "The map data service timed out. Public OSM endpoints can be slow or rate-limited — try again, or continue with the demo neighborhood."
          : `Map data import failed: ${msg}`,
      },
      { status: 502 }
    );
  }
}

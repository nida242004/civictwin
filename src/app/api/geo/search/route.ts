import { NextRequest, NextResponse } from "next/server";
import { geocode } from "@/lib/geo/osm";

export const dynamic = "force-dynamic";

/**
 * POST /api/geo/search — geographic place search via a configurable
 * OSM-compatible geocoder (Nominatim by default).
 */
export async function POST(req: NextRequest) {
  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const q = typeof body.query === "string" ? body.query.trim() : "";
  if (!q) return NextResponse.json({ ok: false, error: "Provide a place name to search." }, { status: 400 });
  if (q.length > 200) return NextResponse.json({ ok: false, error: "Query is too long." }, { status: 400 });

  try {
    const results = await geocode(q);
    return NextResponse.json({
      ok: true,
      data: {
        results,
        attribution: "© OpenStreetMap contributors",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const timeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
    return NextResponse.json(
      {
        ok: false,
        error: timeout
          ? "The location search service timed out. It may be unreachable from this network — you can still use the demo neighborhood or build from scratch."
          : `Location search failed: ${msg}`,
      },
      { status: 502 }
    );
  }
}

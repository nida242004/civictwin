import { NextRequest, NextResponse } from "next/server";
import { bboxMeters, captureSatellite } from "@/lib/geo/satellite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SPAN_M = 1500;

/**
 * POST /api/geo/satellite — { south, north, west, east }
 * → { ok, data: { image: "data:image/jpeg;base64,…", width, height, zoom, provider, attribution, meters: { width, depth } } }
 * The image covers exactly the bbox (north-up).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const [s, n, w, e] = [body.south, body.north, body.west, body.east].map(Number);
  if (![s, n, w, e].every(Number.isFinite) || !(n > s && e > w)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid bounding box." }, { status: 400 });
  }
  const m = bboxMeters(s, n, w, e);
  if (m.width > MAX_SPAN_M || m.depth > MAX_SPAN_M) {
    return NextResponse.json({ ok: false, error: `Area too large for satellite capture (max ~${MAX_SPAN_M} m per side).` }, { status: 400 });
  }
  try {
    const cap = await captureSatellite(s, n, w, e);
    return NextResponse.json({
      ok: true,
      data: {
        image: `data:image/jpeg;base64,${cap.jpeg.toString("base64")}`,
        width: cap.width,
        height: cap.height,
        zoom: cap.zoom,
        provider: cap.provider,
        attribution: cap.attribution,
        meters: m,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Satellite capture failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }
}

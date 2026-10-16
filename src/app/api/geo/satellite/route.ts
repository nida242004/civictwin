import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bboxMeters, captureSatellite, captureStreetMap } from "@/lib/geo/satellite";
import { rateLimit, readJson, withTimeout } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SPAN_M = 1500;

const Body = z.object({
  south: z.coerce.number().min(-85).max(85),
  north: z.coerce.number().min(-85).max(85),
  west: z.coerce.number().min(-180).max(180),
  east: z.coerce.number().min(-180).max(180),
  /** Also render a street map of the same bbox (for Gemini's road/gate naming). */
  street: z.boolean().optional(),
});

/**
 * POST /api/geo/satellite — { south, north, west, east, street? }
 * → { ok, data: { image: "data:image/jpeg;base64,…", width, height, zoom, provider, attribution, meters,
 *                 streetImage?: "data:image/jpeg;base64,…", streetAttribution? } }
 * Both images cover exactly the bbox (north-up) at the same pixel size. The
 * street map is best-effort: if it fails, only the satellite image is returned.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "geo/satellite", 20);
  if (limited) return limited;
  const body = await readJson(req, 4096, Body);
  if (!body.ok) return body.res;
  const { south: s, north: n, west: w, east: e } = body.data;
  if (!(n > s && e > w)) return NextResponse.json({ ok: false, error: "Missing or invalid bounding box." }, { status: 400 });
  const m = bboxMeters(s, n, w, e);
  if (m.width > MAX_SPAN_M || m.depth > MAX_SPAN_M) {
    return NextResponse.json({ ok: false, error: `Area too large for satellite capture (max ~${MAX_SPAN_M} m per side).` }, { status: 400 });
  }
  try {
    const cap = await withTimeout(captureSatellite(s, n, w, e), 40000, "satellite capture");
    let street: Awaited<ReturnType<typeof captureStreetMap>> | null = null;
    if (body.data.street) {
      street = await withTimeout(captureStreetMap(s, n, w, e, cap.width, cap.height), 15000, "street map").catch(() => null);
    }
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
        ...(street ? { streetImage: `data:image/jpeg;base64,${street.jpeg.toString("base64")}`, streetAttribution: street.attribution } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.warn("[geo/satellite] capture failed:", msg.slice(0, 200));
    return NextResponse.json(
      { ok: false, error: /timeout/i.test(msg) ? "Satellite imagery took too long to load. Please try again." : "Satellite imagery is unavailable right now." },
      { status: 502 }
    );
  }
}

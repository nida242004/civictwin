import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callGeminiJson, geminiConfigured, type GeminiPart } from "@/lib/ai/gemini";
import { buildVisionPrompt, mergeVisionLayout, VISION_SYSTEM, VisionLayoutSchema } from "@/lib/geo/visionLayout";
import { parseProject } from "@/lib/world/serialize";
import { downscaleJpeg } from "@/lib/geo/satellite";
import { friendlyUpstreamError, rateLimit, readJson, withTimeout } from "@/lib/api/http";
import type { World } from "@/lib/world/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;

const DATA_URL = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_B64 = 4_000_000;

const Body = z.object({
  image: z.string().max(MAX_IMAGE_B64 + 64).regex(DATA_URL, "expected a JPEG/PNG data URL"),
  streetImage: z.string().max(MAX_IMAGE_B64 + 64).regex(DATA_URL).nullish(),
  bounds: z.object({ width: z.coerce.number().gt(20).lt(3000), depth: z.coerce.number().gt(20).lt(3000) }),
  world: z.unknown().optional(),
  placeName: z.string().max(400).optional(),
  /** Selection outline in the image's u,v grid (0..1000). */
  polygon: z
    .array(z.tuple([z.coerce.number().min(-50).max(1050), z.coerce.number().min(-50).max(1050)]))
    .min(3)
    .max(60)
    .nullish(),
});

/**
 * POST /api/ai/vision-layout
 * body: { image: satellite data URL, streetImage?: street-map data URL (same bbox/size), bounds: { width, depth } (m),
 *         world?: World (OSM, bbox-centered), placeName?, polygon?: [u,v][] }
 * → { ok, data: { world (merged), added, societyType, description, model, usedStreetMap } }
 */
export async function POST(req: NextRequest) {
  if (!geminiConfigured()) return NextResponse.json({ ok: false, error: "Gemini is not configured on this server." }, { status: 503 });
  const limited = rateLimit(req, "ai/vision-layout", 6);
  if (limited) return limited;
  const parsedBody = await readJson(req, 12_000_000, Body);
  if (!parsedBody.ok) return parsedBody.res;
  const body = parsedBody.data;
  const sat = DATA_URL.exec(body.image)!;
  const street = body.streetImage ? DATA_URL.exec(body.streetImage) : null;
  const W = body.bounds.width;
  const D = body.bounds.depth;

  // normalize the incoming OSM world through the project validator (never trust client JSON)
  let base: World = { bounds: { width: W, depth: D }, roads: [], buildings: [], facilities: [], streetlights: [], cameras: [], guards: [] };
  if (body.world) {
    const parsed = parseProject({ schemaVersion: 1, world: body.world });
    if (parsed.ok && parsed.project) base = { ...parsed.project.world, bounds: { width: W, depth: D } };
  }
  const placeName = body.placeName?.slice(0, 120);
  const polygon = body.polygon ? body.polygon.map(([u, v]) => [Math.round(u), Math.round(v)] as [number, number]) : null;

  try {
    // smaller images + low thinking keep this call ~10-25 s; overall deadline stays under the platform limit
    const small = (await downscaleJpeg(Buffer.from(sat[2], "base64"), 768)).toString("base64");
    const streetSmall = street ? await downscaleJpeg(Buffer.from(street[2], "base64"), 768).then((b) => b.toString("base64")).catch(() => null) : null;
    const prompt = buildVisionPrompt({ widthM: W, depthM: D, placeName, world: base, hasStreetMap: !!streetSmall, selection: polygon });
    const parts: GeminiPart[] = [{ text: "IMAGE 1 (satellite):" }, { inlineData: { mimeType: "image/jpeg", data: small } }];
    if (streetSmall) parts.push({ text: "IMAGE 2 (street map, same area):" }, { inlineData: { mimeType: "image/jpeg", data: streetSmall } });
    parts.push({ text: prompt });
    const attempt = (models: string[], thinkingLevel?: "low") =>
      callGeminiJson<unknown>({
        system: VISION_SYSTEM,
        parts,
        json: true,
        temperature: 0.2,
        maxOutputTokens: 8192,
        timeoutMs: 30000,
        models,
        thinkingLevel,
      });
    const { data, model } = await withTimeout(
      (async () => {
        // newest vision model first; each attempt already rotates across all keys
        try {
          return await attempt(["gemini-3.8-flash"], "low");
        } catch {
          try {
            return await attempt(["gemini-3.5-flash"], "low");
          } catch {
            return await attempt(["gemini-3-flash-preview", "gemini-3.1-flash-lite"]);
          }
        }
      })(),
      150000,
      "analysis deadline"
    );
    const layout = VisionLayoutSchema.parse(data ?? {});
    const { world, added } = mergeVisionLayout(base, layout);
    return NextResponse.json({
      ok: true,
      data: { world, added, societyType: layout.societyType, description: layout.description, model, usedStreetMap: !!streetSmall },
    });
  } catch (err) {
    const f = friendlyUpstreamError(err, "Gemini");
    console.warn("[ai/vision-layout] failed:", err instanceof Error ? err.message.slice(0, 200) : err);
    return NextResponse.json({ ok: false, error: f.message, rateLimited: f.rateLimited }, { status: f.status });
  }
}

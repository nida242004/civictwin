import { NextRequest, NextResponse } from "next/server";
import { callGeminiJson, geminiConfigured } from "@/lib/ai/gemini";
import { buildVisionPrompt, mergeVisionLayout, VISION_SYSTEM, VisionLayoutSchema } from "@/lib/geo/visionLayout";
import { parseProject } from "@/lib/world/serialize";
import { downscaleJpeg } from "@/lib/geo/satellite";
import type { World } from "@/lib/world/types";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

/**
 * POST /api/ai/vision-layout
 * body: { image: "data:image/jpeg;base64,…", bounds: { width, depth } (meters), world?: World (OSM, bbox-centered), placeName? }
 * â†’ { ok, data: { world (merged), added, societyType, description, model } }
 */
export async function POST(req: NextRequest) {
  if (!geminiConfigured()) return NextResponse.json({ ok: false, error: "Gemini is not configured on this server." }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(typeof body.image === "string" ? body.image : "");
  if (!m || m[2].length > 4_000_000) return NextResponse.json({ ok: false, error: "Missing or oversized satellite image." }, { status: 400 });
  const bounds = body.bounds as { width?: unknown; depth?: unknown } | undefined;
  const W = Number(bounds?.width);
  const D = Number(bounds?.depth);
  if (!(W > 20 && D > 20 && W < 3000 && D < 3000)) return NextResponse.json({ ok: false, error: "Invalid bounds." }, { status: 400 });

  // normalize the incoming OSM world through the project validator (never trust client JSON)
  let base: World = { bounds: { width: W, depth: D }, roads: [], buildings: [], facilities: [], streetlights: [], cameras: [], guards: [] };
  if (body.world) {
    const parsed = parseProject({ schemaVersion: 1, world: body.world });
    if (parsed.ok && parsed.project) base = { ...parsed.project.world, bounds: { width: W, depth: D } };
  }
  const placeName = typeof body.placeName === "string" ? body.placeName.slice(0, 120) : undefined;

  try {
    // smaller image + low thinking keeps this call ~10-25 s; overall deadline stays under the platform limit
    const small = (await downscaleJpeg(Buffer.from(m[2], "base64"), 768)).toString("base64");
    const prompt = buildVisionPrompt({ widthM: W, depthM: D, placeName, world: base });
    const attempt = (models: string[], thinkingLevel?: "low") =>
      callGeminiJson<unknown>({
        system: VISION_SYSTEM,
        parts: [{ inlineData: { mimeType: "image/jpeg", data: small } }, { text: prompt }],
        json: true,
        temperature: 0.2,
        maxOutputTokens: 8192,
        timeoutMs: 30000,
        models,
        thinkingLevel,
      });
    const deadline = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("analysis deadline exceeded")), 150000));
    const { data, model } = await Promise.race([
      deadline,
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
    ]);
    const layout = VisionLayoutSchema.parse(data ?? {});
    const { world, added } = mergeVisionLayout(base, layout);
    return NextResponse.json({ ok: true, data: { world, added, societyType: layout.societyType, description: layout.description, model } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Gemini layout analysis failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}` },
      { status: 502 }
    );
  }
}

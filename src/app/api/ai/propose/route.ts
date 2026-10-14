import { NextRequest, NextResponse } from "next/server";
import { validateProposal, type Proposal } from "@/lib/ai/schema";
import { deterministicRecommendation } from "@/lib/ai/recommend";
import type { PraesidiumProject, StoredRun } from "@/lib/world/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/propose
 *
 * Generates a structured intervention proposal for the planning assistant.
 * Provider order: Gemini (if GEMINI_API_KEY is configured) → z-ai SDK →
 * deterministic rule-based recommendations. Model output is ALWAYS
 * validated against an explicit allowlist before being returned; nothing
 * is applied without explicit user approval in the UI.
 */
export async function POST(req: NextRequest) {
  let body: { project?: unknown; baselineRun?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const project = body.project as PraesidiumProject | undefined;
  if (!project || !project.world || !project.scenario) {
    return NextResponse.json({ ok: false, error: "Missing project data." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.slice(0, 600) : "";
  const baselineRun = (body.baselineRun as StoredRun | null) ?? null;

  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const raw = await callGemini(geminiKey, project, baselineRun, message);
      const result = validateProposal(raw, project);
      if (result.ok) {
        return NextResponse.json({
          ok: true,
          data: { provider: "gemini", proposal: result.proposal, estimatedCostInr: result.estimatedCostInr, basis: [] },
        });
      }
      return NextResponse.json({
        ok: false,
        error: `The AI proposal failed validation and was rejected: ${result.errors.join(" ")}`,
        data: { provider: "gemini", rejected: true },
      });
    } catch (err) {
      // fall through to next provider, noting the failure
      const msg = err instanceof Error ? err.message : "unknown error";
      if (process.env.AI_STRICT === "1") {
        return NextResponse.json({ ok: false, error: `Gemini request failed: ${msg}` }, { status: 502 });
      }
    }
  }

  // z-ai SDK provider
  try {
    const raw = await callZai(project, baselineRun, message);
    const result = validateProposal(raw, project);
    if (result.ok) {
      return NextResponse.json({
        ok: true,
        data: { provider: "z-ai", proposal: result.proposal, estimatedCostInr: result.estimatedCostInr, basis: [] },
      });
    }
    return NextResponse.json({
      ok: false,
      error: `The AI proposal failed validation and was rejected: ${result.errors.join(" ")}`,
      data: { provider: "z-ai", rejected: true },
    });
  } catch {
    // fall through to deterministic recommendations
  }

  // Deterministic fallback — clearly labeled as rule-based
  const rec = deterministicRecommendation(project, baselineRun);
  return NextResponse.json({
    ok: true,
    data: { provider: "rules", proposal: rec.proposal, estimatedCostInr: 0, basis: rec.basis },
  });
}

/* ------------------------------------------------------------------ */

function buildPrompt(project: PraesidiumProject, baselineRun: StoredRun | null, message: string): string {
  const { world, scenario } = project;
  const lights = world.streetlights.length;
  const cams = world.cameras.length;
  const guards = world.guards.map((g) => ({ id: g.id, name: g.name, waypoints: g.waypoints.length }));

  const darkSegments = world.roads
    .filter((r) => r.pedestrian)
    .slice(0, 40)
    .map((r) => ({
      id: r.id,
      name: r.name ?? r.id,
      mid: r.points[Math.floor(r.points.length / 2)],
    }))
    .slice(0, 25);

  const summary = {
    neighborhood: { name: project.name, bounds: world.bounds },
    counts: {
      roads: world.roads.length,
      buildings: world.buildings.length,
      facilities: world.facilities.length,
      streetlights: lights,
      cameras: cams,
      guards: guards.length,
    },
    facilities: world.facilities.slice(0, 12).map((f) => ({ type: f.type, name: f.name, x: Math.round(f.x), z: Math.round(f.z) })),
    guards,
    sampleRoadMidpoints: darkSegments,
    scenario: {
      id: scenario.id,
      durationSec: scenario.durationSec,
      population: scenario.population,
      eventsPerHour: scenario.eventsPerHour,
      lightingOutageFraction: scenario.lightingOutageFraction,
      ambientVisibility: scenario.ambientVisibility,
    },
    baseline: baselineRun
      ? {
          metrics: baselineRun.metrics,
          unresolvedEvents: baselineRun.events
            .filter((e) => e.outcome !== "resolved")
            .slice(0, 10)
            .map((e) => ({ x: Math.round(e.x), z: Math.round(e.z), type: e.type, outcome: e.outcome })),
        }
      : null,
  };

  return `You are the Praesidium planning assistant for neighborhood safety planning exercises.
All data is a FICTIONAL simulation. Never imply predictions of real crime or make claims about real individuals.

Project summary (compact, trusted — computed by the application):
${JSON.stringify(summary)}

User planning request: "${message || "Suggest improvements to poorly illuminated pedestrian paths and response coverage."}"

Respond with ONLY a JSON object (no markdown fences, no commentary) shaped exactly like:
{
  "title": string,             // short proposal title
  "rationale": string,         // 2-4 sentences, plain language
  "ops": [                     // 1-12 operations from this allowlist ONLY:
    {"op":"add_streetlight","x":number,"z":number,"brightness":number,"radius":number}, // brightness is float 0.1 to 1.0 (default 1.0), radius is meters (10 to 30)
    {"op":"move_streetlight","id":string,"x":number,"z":number},
    {"op":"edit_streetlight","id":string,"on":boolean,"brightness":number,"radius":number},
    {"op":"add_camera","x":number,"z":number,"range":number,"fovDeg":number,"orientationDeg":number},
    {"op":"move_camera","id":string,"x":number,"z":number},
    {"op":"edit_camera","id":string,"active":boolean,"range":number,"fovDeg":number,"orientationDeg":number},
    {"op":"set_patrol","guardId":string,"waypoints":[{"x":number,"z":number}]},
    {"op":"set_scenario","patch":{"eventsPerHour":number,"guardCount":number|null,"lightingOutageFraction":number,"ambientVisibility":number}}
  ],
  "expectedEffects": string[],  // short bullets
  "limitations": string[],      // short bullets
  "costNotes": string           // optional
}

Rules:
- Coordinates are local meters, x east / z south, within bounds ±${Math.round(world.bounds.width / 2)} , ±${Math.round(world.bounds.depth / 2)}.
- brightness MUST be a decimal float between 0.1 and 1.0 (e.g. 1.0 or 0.8), NOT a percentage like 80 or 100.
- Only reference streetlight/camera/guard IDs that appear in the summary. sampleRoadMidpoints are safe positions on the walkable network.
- Prefer placing new streetlights ON or NEAR walkable paths (use sampleRoadMidpoints or facility positions as anchors).
- Never claim crime prevention; speak in "modeled coverage" and "estimated response" terms.`;
}

async function callGemini(
  apiKey: string,
  project: PraesidiumProject,
  baselineRun: StoredRun | null,
  message: string
): Promise<unknown> {
  const preferredModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const candidateModels = Array.from(
    new Set([preferredModel, "gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"])
  );

  let lastError: Error | null = null;
  const promptText = buildPrompt(project, baselineRun, message);

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.3, responseMimeType: "application/json", maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[Gemini Proxy] ${model} returned HTTP ${res.status}: ${errText.slice(0, 100)}. Trying fallback candidate...`);
        lastError = new Error(`Gemini HTTP ${res.status} on ${model}`);
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      console.log(`[Gemini Proxy] Successfully generated proposal via ${model}`);
      return parseJsonLoose(text);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Gemini Proxy] Request error on ${model}:`, lastError.message);
    }
  }

  throw lastError || new Error("All Gemini candidate models failed.");
}

async function callZai(
  project: PraesidiumProject,
  baselineRun: StoredRun | null,
  message: string
): Promise<unknown> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content:
          "You are the Praesidium planning assistant. You output ONLY valid JSON matching the requested schema, with no markdown fences or commentary.",
      },
      { role: "user", content: buildPrompt(project, baselineRun, message) },
    ],
    thinking: { type: "disabled" },
  });
  const text = completion.choices[0]?.message?.content ?? "";
  return parseJsonLoose(text);
}

function parseJsonLoose(text: string): unknown {
  if (!text || !text.trim()) throw new Error("Empty model response.");

  // 1. Check for markdown code fences ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch ? fenceMatch[1] : text).trim();

  // 2. Direct parse attempt
  try {
    return JSON.parse(candidate);
  } catch {
    // 3. Extract outermost { ... }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = candidate.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        // Strip trailing commas before closing braces/brackets
        const cleaned = slice.replace(/,\s*([\]}])/g, "$1");
        return JSON.parse(cleaned);
      }
    }
    throw new Error("Model response did not contain valid JSON.");
  }
}

export type { Proposal };

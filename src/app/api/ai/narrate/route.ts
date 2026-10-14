import { NextRequest, NextResponse } from "next/server";
import { callGemini, geminiConfigured, parseJsonLoose } from "@/lib/ai/gemini";
import type { IncidentBeat } from "@/lib/sim/incidents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You write short in-simulation narration for Praesidium, a residential security PLANNING simulator.
All actors are SYNTHETIC scenario characters. Never name real people, never reference any community, religion, caste, nationality or demographic. Perpetrators are anonymous ("a snatcher", "an intruder").
Keep lines vivid, realistic, under 14 words, no gore. Output JSON only.`;

interface Body {
  beats?: IncidentBeat[];
  context?: { placeName?: string; summary?: string; peakHours?: string };
  lang?: "en" | "hinglish";
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const beats = (Array.isArray(body.beats) ? body.beats : []).slice(0, 40);
  if (!beats.length) return NextResponse.json({ ok: false, error: "No beats." }, { status: 400 });
  const lang = body.lang === "hinglish" ? "hinglish" : "en";

  const fallback = {
    lines: Object.fromEntries(beats.map((b, i) => [String(i), b.line])) as Record<string, string>,
    debriefs: {} as Record<string, string>,
  };
  const original = (): NextResponse =>
    NextResponse.json({ ok: true, data: { ...toOut(beats, fallback.lines, fallback.debriefs), provider: "rules" } });

  if (!geminiConfigured()) return original();

  const compact = beats.map((b, i) => ({
    i,
    t: Math.round(b.tSec),
    kind: b.kind,
    eventId: b.eventId,
    sev: b.severity,
    line: b.line,
  }));
  const eventIds = Array.from(new Set(beats.map((b) => b.eventId).filter(Boolean))) as string[];

  const prompt = `Locality: ${String(body.context?.placeName ?? "an Indian residential colony").slice(0, 100)}
Local context: ${String(body.context?.summary ?? "n/a").slice(0, 500)}
Peak risk hours: ${String(body.context?.peakHours ?? "n/a").slice(0, 100)}
Language: ${lang === "hinglish" ? "Hinglish (Hindi written in Latin script mixed with English, natural Indian street speech)" : "plain English"}

Beats (JSON): ${JSON.stringify(compact)}

Rewrite each beat's "line" as a short, vivid spoken/caption line fitting its kind (victim_scream = scared exclamation; attack_start = tense narration; guard_* = authoritative; cctv_missed = narrator noting the blind spot). Keep the same meaning.
Also, for each eventId in ${JSON.stringify(eventIds)}, write a 2-3 sentence "debrief" explaining what went wrong (blind spot, sleeping/drowsy guard, slow response, dark stretch) based on the beat kinds and timing, and which single intervention would help most (e.g. add streetlight, add camera covering the spot, adjust patrol, rotate guard shift).

Return JSON: {"lines": {"<i>": "line"}, "debriefs": {"<eventId>": "debrief"}}`;

  try {
    const r = await callGemini({ prompt, system: SYSTEM, json: true, temperature: 0.8, maxOutputTokens: 4096, timeoutMs: 40000 });
    const parsed = parseJsonLoose<{ lines?: Record<string, unknown>; debriefs?: Record<string, unknown> }>(r.text);
    const lines: Record<string, string> = { ...fallback.lines };
    for (const [k, v] of Object.entries(parsed.lines ?? {})) {
      if (k in lines && typeof v === "string" && v.trim()) lines[k] = v.trim().slice(0, 140);
    }
    const debriefs: Record<string, string> = {};
    for (const id of eventIds) {
      const v = parsed.debriefs?.[id];
      if (typeof v === "string" && v.trim()) debriefs[id] = v.trim().slice(0, 600);
    }
    return NextResponse.json({ ok: true, data: { ...toOut(beats, lines, debriefs), provider: "gemini", model: r.model } });
  } catch {
    return original();
  }
}

function toOut(beats: IncidentBeat[], lines: Record<string, string>, debriefs: Record<string, string>) {
  return {
    /** Same order as input beats. */
    lines: beats.map((b, i) => lines[String(i)] ?? b.line),
    /** eventId -> debrief */
    debriefs,
  };
}

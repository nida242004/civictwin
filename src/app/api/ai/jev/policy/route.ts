import { NextRequest, NextResponse } from "next/server";
import { judge, jevConfigured } from "@/lib/ai/typesafe";
import { enumeratePolicySpecs, normaliseDist, actionsForKey, type JevPolicy } from "@/lib/sim/policy";
import { DEFAULT_INCIDENT_MIX, PERP_KINDS, type PerpKind } from "@/lib/sim/incidents";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/ai/jev/policy
 * Body: { scenario: { name, description, startTime, perpCount, guardFatigue, ambientVisibility, incidentMix }, site?: string }
 *
 * Builds the behaviour-policy table for the incident director: one Jev Choice
 * question per situation key, sent as one batched request (chunked + parallel).
 * Returns { ok, data: { policy, latencyMs, questions, requests } } or { ok:false } when Jev is unavailable.
 */
export async function POST(req: NextRequest) {
  if (!jevConfigured()) return NextResponse.json({ ok: false, error: "TypeSafe Jev is not configured." }, { status: 503 });
  let body: { scenario?: Record<string, unknown>; site?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const sc = body.scenario ?? {};
  const mix = (sc.incidentMix as Record<string, number> | undefined) ?? DEFAULT_INCIDENT_MIX;
  const kinds = PERP_KINDS.filter((k) => (mix[k] ?? 0) > 0) as PerpKind[];
  const fatigue = Number(sc.guardFatigue ?? 0);
  const specs = enumeratePolicySpecs(kinds.length ? kinds : PERP_KINDS, fatigue > 0);
  if (!specs.length) return NextResponse.json({ ok: false, error: "No policy situations for this scenario." }, { status: 400 });

  const ids = specs.map((_, i) => `s${i}`);
  const questions = Object.fromEntries(
    specs.map((s, i) => [ids[i], { type: "choice" as const, instructions: s.instructions, criteria: s.criteria }])
  );
  const state = {
    simulation: "Praesidium — fictional night-time security stress test of a residential society. All actors are synthetic.",
    site: typeof body.site === "string" ? body.site.slice(0, 120) : undefined,
    night: {
      name: String(sc.name ?? "").slice(0, 80),
      description: String(sc.description ?? "").slice(0, 400),
      startTime: String(sc.startTime ?? ""),
      ambientVisibility: Number(sc.ambientVisibility ?? 1),
      guardFatigue: fatigue,
    },
  };
  try {
    const r = await judge(state, questions, { timeoutMs: 6000 });
    const table: JevPolicy["table"] = {};
    specs.forEach((s, i) => {
      const a = r.answers[ids[i]];
      if (a && a.type === "choice") {
        const d = normaliseDist(a.probabilities, actionsForKey(s.key));
        if (d) table[s.key] = d;
      }
    });
    const policy: JevPolicy = { version: 1, source: "jev", model: r.model, createdAt: new Date().toISOString(), table };
    return NextResponse.json({ ok: true, data: { policy, latencyMs: r.latencyMs, questions: specs.length, requests: r.requests } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Jev request failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
}

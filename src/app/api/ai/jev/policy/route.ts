import { NextRequest, NextResponse } from "next/server";
import { judge, jevConfigured } from "@/lib/ai/typesafe";
import { enumeratePolicySpecs, normaliseDist, actionsForKey, type JevPolicy } from "@/lib/sim/policy";
import type { CompactIntel } from "@/lib/ai/context";
import { DEFAULT_INCIDENT_MIX, PERP_KINDS, type PerpKind } from "@/lib/sim/incidents";
import { friendlyUpstreamError, rateLimit, readJson } from "@/lib/api/http";

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
  const limited = rateLimit(req, "ai/jev/policy", 30);
  if (limited) return limited;
  const parsed = await readJson<{ scenario?: Record<string, unknown>; site?: unknown; local?: CompactIntel | null; intelHash?: string }>(req, 64_000);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
  const sc = body.scenario && typeof body.scenario === "object" ? body.scenario : {};
  const mix = (sc.incidentMix as Record<string, number> | undefined) ?? DEFAULT_INCIDENT_MIX;
  const kinds = PERP_KINDS.filter((k) => (mix[k] ?? 0) > 0) as PerpKind[];
  const fatigue = Number(sc.guardFatigue ?? 0);
  const specs = enumeratePolicySpecs(kinds.length ? kinds : PERP_KINDS, fatigue > 0);
  if (!specs.length) return NextResponse.json({ ok: false, error: "No policy situations for this scenario." }, { status: 400 });

  const l = body.local && typeof body.local === "object" && body.local.incidentMix ? body.local : null;
  const local = l
    ? {
        place: String(l.place ?? "").slice(0, 80),
        grounded: Boolean(l.grounded),
        incidentMix: l.incidentMix,
        peakHours: String(l.peakHours ?? "").slice(0, 80),
        riskFactors: (l.riskFactors ?? []).slice(0, 4).map((f) => String(f).slice(0, 100)),
      }
    : null;
  const localNote = local
    ? ` Area-level local pattern (see \`local\` in the state): most common incident types ${Object.entries(local.incidentMix)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${k.replace("_", " ")} ${Math.round(v * 100)}%`)
        .join(", ")}; peak hours ${local.peakHours || "n/a"}. Let that shape how likely the offender is to act and how pedestrians react.`
    : "";
  const ids = specs.map((_, i) => `s${i}`);
  const questions = Object.fromEntries(
    specs.map((s, i) => [
      ids[i],
      { type: "choice" as const, instructions: s.key.startsWith("guard|") ? s.instructions : s.instructions + localNote, criteria: s.criteria },
    ])
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
    local,
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
    const policy: JevPolicy = { version: 1, source: "jev", model: r.model, createdAt: new Date().toISOString(), table, ...(local && body.intelHash ? { intelHash: String(body.intelHash).slice(0, 20) } : {}) };
    return NextResponse.json({ ok: true, data: { policy, latencyMs: r.latencyMs, questions: specs.length, requests: r.requests } });
  } catch (e) {
    console.warn("[ai/jev/policy] failed:", e instanceof Error ? e.message.slice(0, 200) : e);
    const f = friendlyUpstreamError(e, "TypeSafe Jev");
    return NextResponse.json({ ok: false, error: f.message, rateLimited: f.rateLimited }, { status: f.status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { judge, jevConfigured, type JevQuestion } from "@/lib/ai/typesafe";
import type { CompactIntel } from "@/lib/ai/context";
import { candidateBrief, rankValue, type Candidate, type CandidateScore } from "@/lib/ai/quickpicks";
import { friendlyUpstreamError, rateLimit, readJson } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const IMPACT_LEVELS = [
  "No measurable safety benefit for this simulated night",
  "Small benefit: helps at most one minor incident",
  "Moderate benefit: likely improves detection or response for some incidents",
  "Large benefit: directly addresses repeated or severe blind-spot incidents",
  "Very large benefit: removes the main weakness behind most severe incidents",
];

/**
 * POST /api/ai/jev/quickpicks
 * Body: { candidates: Candidate[], context?: { site, night, metrics } }
 * One batched Jev request: per candidate a Score (expected safety impact) and
 * a Noul (redundant / watching an empty wall). Returns { scores: {id: CandidateScore}, latencyMs, model }.
 */
export async function POST(req: NextRequest) {
  if (!jevConfigured()) return NextResponse.json({ ok: false, error: "TypeSafe Jev is not configured." }, { status: 503 });
  const limited = rateLimit(req, "ai/jev/quickpicks", 30);
  if (limited) return limited;
  const parsed = await readJson<{ candidates?: Candidate[]; context?: unknown; local?: CompactIntel | null }>(req, 256_000);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
  const cands = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 30);
  if (!cands.length) return NextResponse.json({ ok: false, error: "No candidates." }, { status: 400 });

  const l = body.local && typeof body.local === "object" && body.local.incidentMix ? body.local : null;
  const local = l
    ? {
        place: String(l.place ?? "").slice(0, 80),
        grounded: Boolean(l.grounded),
        riskFactors: (l.riskFactors ?? []).slice(0, 4).map((f) => String(f).slice(0, 100)),
        incidentMix: l.incidentMix,
        peakHours: String(l.peakHours ?? "").slice(0, 80),
      }
    : null;
  const localQ = local ? ` Given the \`local\` context in the state (locally common incident types and risk factors), how much would this change reduce the locally common incident types?` : "";
  const localR = local ? ` Also consider the \`local\` context: it is redundant only if it does not address any locally common risk factor.` : "";

  const questions: Record<string, JevQuestion> = {};
  cands.forEach((c, i) => {
    const brief = candidateBrief(c);
    questions[`i${i}`] = {
      type: "score",
      instructions: `Fictional security-planning simulation of a residential society at night. Candidate intervention: ${brief}. How much would this single change improve safety outcomes (detection, response, deterrence) for the simulated incidents?${localQ}`,
      criteria: IMPACT_LEVELS,
    };
    questions[`r${i}`] = {
      type: "noul",
      instructions:
        (c.kind === "camera"
          ? `Candidate CCTV camera: ${brief}. This camera would mostly watch an empty wall, an area with no walkway, or a spot already covered by other cameras.`
          : c.kind === "light"
            ? `Candidate streetlight: ${brief}. This streetlight is redundant because the spot is already well lit or has working lights nearby.`
            : `Candidate change: ${brief}. This change is redundant because guards already reach these incidents quickly.`) + localR,
    };
  });

  try {
    const r = await judge({ context: body.context ?? null, local }, questions, { timeoutMs: 5000 });
    const scores: Record<string, CandidateScore> = {};
    cands.forEach((c, i) => {
      const s = r.answers[`i${i}`];
      const n = r.answers[`r${i}`];
      const impact = s && s.type === "score" ? Math.max(0, Math.min(1, s.score / (IMPACT_LEVELS.length - 1))) : 0;
      const redundant = n && n.type === "noul" ? Math.max(0, Math.min(1, Number(n.noul))) : 0;
      scores[c.id] = { impact: Math.round(impact * 100) / 100, redundant: Math.round(redundant * 100) / 100, rank: rankValue(impact, redundant) };
    });
    return NextResponse.json({ ok: true, data: { scores, latencyMs: r.latencyMs, model: r.model, questions: Object.keys(questions).length } });
  } catch (e) {
    console.warn("[ai/jev/quickpicks] failed:", e instanceof Error ? e.message.slice(0, 200) : e);
    const f = friendlyUpstreamError(e, "TypeSafe Jev");
    return NextResponse.json({ ok: false, error: f.message, rateLimited: f.rateLimited }, { status: f.status });
  }
}

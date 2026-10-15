import { NextRequest, NextResponse } from "next/server";
import { judge, jevConfigured, type JevQuestion } from "@/lib/ai/typesafe";
import { candidateBrief, rankValue, type Candidate, type CandidateScore } from "@/lib/ai/quickpicks";

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
  let body: { candidates?: Candidate[]; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const cands = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 30);
  if (!cands.length) return NextResponse.json({ ok: false, error: "No candidates." }, { status: 400 });

  const questions: Record<string, JevQuestion> = {};
  cands.forEach((c, i) => {
    const brief = candidateBrief(c);
    questions[`i${i}`] = {
      type: "score",
      instructions: `Fictional security-planning simulation of a residential society at night. Candidate intervention: ${brief}. How much would this single change improve safety outcomes (detection, response, deterrence) for the simulated incidents?`,
      criteria: IMPACT_LEVELS,
    };
    questions[`r${i}`] = {
      type: "noul",
      instructions:
        c.kind === "camera"
          ? `Candidate CCTV camera: ${brief}. This camera would mostly watch an empty wall, an area with no walkway, or a spot already covered by other cameras.`
          : c.kind === "light"
            ? `Candidate streetlight: ${brief}. This streetlight is redundant because the spot is already well lit or has working lights nearby.`
            : `Candidate change: ${brief}. This change is redundant because guards already reach these incidents quickly.`,
    };
  });

  try {
    const r = await judge({ context: body.context ?? null }, questions, { timeoutMs: 5000 });
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
    return NextResponse.json({ ok: false, error: `Jev request failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
}

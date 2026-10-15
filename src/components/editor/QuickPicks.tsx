"use client";

/**
 * "Jev quick picks" — instant planner inside the assistant panel.
 *   1. code generates candidate interventions from the baseline run (ms)
 *   2. TypeSafe Jev scores them all in ONE batched request (~0.4 s)
 *   3. the top 3 are verified with a same-seed single-change simulation
 *   4. Gemini can then write the explanation (existing planner flow)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/store/editor";
import { applyAiProposal } from "@/lib/run-actions";
import {
  candidateProposal,
  generateCandidates,
  heuristicScore,
  verifyCandidate,
  type Candidate,
  type CandidateScore,
  type VerifiedPick,
} from "@/lib/ai/quickpicks";
import { fmtInr } from "@/lib/sim/compare";
import { cn } from "@/lib/utils";

type Row = Candidate & { score: CandidateScore };

const KIND_ICON: Record<string, string> = { camera: "📹", light: "💡", patrol: "🧭", guard: "👮" };

export default function QuickPicks({ onExplain }: { onExplain: (message: string) => void }) {
  const project = useEditor((s) => s.project);
  const baseline = project?.baselineRun ?? null;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<"jev" | "heuristic" | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<Record<string, VerifiedPick | "running">>({});
  const [applied, setApplied] = useState<string | null>(null);

  const run = async () => {
    if (!project || !baseline) return;
    setBusy(true);
    setRows(null);
    setVerified({});
    setApplied(null);
    const t0 = performance.now();
    const cands = generateCandidates(project, baseline);
    let scores: Record<string, CandidateScore> | null = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch("/api/ai/jev/quickpicks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          candidates: cands,
          context: {
            site: project.name,
            night: { name: baseline.scenario.name, startTime: baseline.scenario.startTime, ambientVisibility: baseline.scenario.ambientVisibility },
            metrics: {
              incidents: baseline.metrics.dramaIncidents,
              blindSpotIncidents: baseline.metrics.blindSpotIncidents,
              perpsCaughtPct: baseline.metrics.perpsCaughtPct,
              medianResponseSec: baseline.metrics.dramaMedianResponseSec,
              cctvCoveragePct: baseline.metrics.cctvCoveragePct,
              pathLenLitPct: baseline.metrics.pathLenLitPct,
            },
          },
        }),
      }).finally(() => clearTimeout(timer));
      const json = await res.json();
      if (json.ok) scores = json.data.scores;
    } catch {
      /* fall back below */
    }
    const src = scores ? "jev" : "heuristic";
    const ranked = cands
      .map((c) => ({ ...c, score: scores?.[c.id] ?? heuristicScore(c) }))
      .sort((a, b) => b.score.rank - a.score.rank || a.costInr - b.costInr);
    setRows(ranked);
    setSource(src);
    setMs(Math.round(performance.now() - t0));
    setBusy(false);

    // stage 2: measured effect of the top 3 (same seed, one change at a time)
    for (const c of ranked.slice(0, 3)) {
      setVerified((v) => ({ ...v, [c.id]: "running" }));
      await new Promise((r) => setTimeout(r, 20));
      const v = verifyCandidate(baseline, c);
      setVerified((cur) => ({ ...cur, [c.id]: v }));
    }
  };

  const explain = () => {
    if (!rows) return;
    const lines = rows.slice(0, 3).map((r, i) => {
      const v = verified[r.id];
      const m = v && v !== "running" ? `simulated risk ${v.riskBefore} → ${v.riskAfter}${v.riskPerLakh !== null ? ` (${v.riskPerLakh} per ₹1 lakh)` : ""}` : "not yet simulated";
      return `${i + 1}. ${r.label} — cost ${fmtInr(r.costInr)}, Jev impact ${Math.round(r.score.impact * 100)}%, redundancy ${Math.round(r.score.redundant * 100)}%, ${m}`;
    });
    onExplain(
      `Explain these quick-pick interventions and recommend the best value one. Jev gave the fast judgment and the simulation measured the effect (same seed, one change at a time):\n${lines.join("\n")}`
    );
  };

  if (!project) return null;
  return (
    <div className="rounded-lg border border-[#ddd0f7] bg-[#faf7ff] p-3" data-testid="jev-quickpicks">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-[#3b1d78]">⚡ Jev quick picks</div>
          <div className="text-[10px] text-[#6b5a8e]">Instant ranked options from your baseline run</div>
        </div>
        <Button
          size="sm"
          className="h-7 bg-[#5b21b6] text-xs text-white hover:bg-[#4c1d95]"
          disabled={!baseline || busy}
          onClick={run}
          title={baseline ? "Generate + score candidate interventions" : "Run a baseline simulation first"}
        >
          {busy ? "Judging…" : rows ? "Refresh" : "Quick picks"}
        </Button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 text-[9.5px]">
        <span className="rounded bg-[#ede4ff] px-1.5 py-0.5 text-[#5b21b6]">Jev = fast judgment</span>
        <span className="rounded bg-[#e6f2ec] px-1.5 py-0.5 text-[#2e7d5b]">Simulation = measured effect</span>
        <span className="rounded bg-[#e7eef8] px-1.5 py-0.5 text-[#2e5b7d]">Gemini = explanation</span>
      </div>
      {!baseline && <div className="mt-2 text-[10.5px] text-[#8a8272]">Run a baseline simulation to get quick picks.</div>}
      {rows && (
        <>
          <div className="mt-2 text-[10px] text-[#6b5a8e]">
            {rows.length} candidates · {source === "jev" ? "scored by TypeSafe Jev" : "Jev unavailable — rule-based scores"} in {ms} ms
          </div>
          <ol className="mt-1.5 space-y-1.5">
            {rows.slice(0, 8).map((r, i) => {
              const v = verified[r.id];
              return (
                <li key={r.id} className={cn("rounded-md border bg-white px-2 py-1.5 text-[11px]", i < 3 ? "border-[#cdb8f5]" : "border-[#eee9df]")}>
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 shrink-0 font-mono text-[#8a8272]">{i + 1}</span>
                    <span className="shrink-0">{KIND_ICON[r.kind]}</span>
                    <span className="flex-1 font-medium text-[#1d2430]">{r.label}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 px-2 text-[10px]"
                      onClick={() => {
                        applyAiProposal(candidateProposal(r));
                        setApplied(r.id);
                      }}
                      disabled={applied === r.id}
                    >
                      {applied === r.id ? "✓ Applied" : "Apply"}
                    </Button>
                  </div>
                  <div className="ml-10 mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-[#5c6470]">
                    <span>{r.costInr > 0 ? fmtInr(r.costInr) : "free"}</span>
                    <span className="text-[#5b21b6]">impact {Math.round(r.score.impact * 100)}%</span>
                    {r.score.redundant >= 0.5 && <span className="text-[#b45309]">likely redundant {Math.round(r.score.redundant * 100)}%</span>}
                    <span className="text-[#8a8272]">{r.evidence.incidentsNear} incidents near</span>
                  </div>
                  {v && (
                    <div className="ml-10 mt-0.5 text-[10px]">
                      {v === "running" ? (
                        <span className="text-[#8a8272]">Simulating same night…</span>
                      ) : (
                        <span className={v.riskReduced > 0 ? "text-[#2e7d5b]" : "text-[#8a8272]"}>
                          Simulation: risk {v.riskBefore} → {v.riskAfter}
                          {v.riskPerLakh !== null ? ` · ${v.riskPerLakh} per ₹1 lakh` : v.riskReduced > 0 ? " · free" : ""}
                          {v.caughtDelta ? ` · caught ${v.caughtDelta > 0 ? "+" : ""}${v.caughtDelta}` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <Button size="sm" variant="outline" className="mt-2 h-7 w-full text-[11px]" onClick={explain}>
            ✦ Ask Gemini to explain the top picks
          </Button>
        </>
      )}
    </div>
  );
}

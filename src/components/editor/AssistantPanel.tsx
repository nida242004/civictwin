"use client";

/**
 * Planning assistant panel: sends a compact project summary to the backend,
 * shows the validated proposal preview, and applies it ONLY on explicit
 * approval. Falls back to deterministic recommendations when no AI provider
 * is available — and labels that honestly.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/store/editor";
import { applyAiProposal, runIntervention } from "@/lib/run-actions";
import { describeOps, type Proposal } from "@/lib/ai/schema";
import { cn } from "@/lib/utils";
import { useIntel } from "@/lib/ai/intelStore";
import QuickPicks from "./QuickPicks";

interface ProposeResponse {
  ok: boolean;
  error?: string;
  data?: {
    provider: "gemini" | "z-ai" | "rules";
    proposal: Proposal;
    estimatedCostInr: number;
    basis: string[];
  };
}

const SUGGESTIONS = [
  "Suggest improvements to poorly illuminated pedestrian paths.",
  "Add streetlights around the bus stop and compare the result.",
  "Change the guard patrol to cover the park entrance.",
  "Suggest three intervention options with different costs.",
  "Explain why some simulated events had long response times.",
];

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini (configured via server key)",
  "z-ai": "Z.ai assistant model",
  rules: "Rule-based analyzer (no AI key configured)",
};

export default function AssistantPanel() {
  const open = useEditor((s) => s.assistantOpen);
  const setOpen = useEditor((s) => s.setAssistantOpen);
  const project = useEditor((s) => s.project);
  const baselineRun = useEditor((s) => s.project?.baselineRun);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposeResponse["data"] | null>(null);
  const [applied, setApplied] = useState(false);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => {
        const f = h?.features;
        if (f) setProviderStatus(f.aiProvider);
      })
      .catch(() => setProviderStatus(null));
  }, [open]);

  if (!project) return null;

  const request = async (msg: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setApplied(false);
    try {
      const res = await fetch("/api/ai/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: {
            name: project.name,
            world: project.world,
            scenario: project.scenario,
          },
          baselineRun: baselineRun
            ? { metrics: baselineRun.metrics, events: baselineRun.events }
            : null,
          message: msg,
          localIntel: useIntel.getState().intel,
        }),
      });
      const json = (await res.json()) as ProposeResponse;
      if (!json.ok) {
        setError(json.error ?? "The assistant request failed.");
        return;
      }
      setResult(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant request failed.");
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!result) return;
    applyAiProposal(result.proposal);
    setApplied(true);
  };

  const applyAndRun = async () => {
    if (!result) return;
    setRunError(null);
    if (!applied) applyAiProposal(result.proposal);
    setApplied(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      await runIntervention();
      setOpen(false);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Intervention run failed.");
    }
  };

  return (
    <>
      {/* overlay */}
      {open && <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[400px] max-w-[92vw] flex-col border-l border-[#e3ded4] bg-white shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Planning assistant"
      >
        <div className="flex items-center justify-between border-b border-[#e3ded4] px-4 py-3">
          <div>
            <div className="text-sm font-bold text-[#1d2430]">✦ Planning assistant</div>
            <div className="text-[10px] text-[#8a8272]">
              Proposes interventions — never applies them without your approval
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="rounded p-1 text-[#8a8272] hover:bg-[#f1ede4]" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {/* provider status */}
          <div className="rounded-md border border-[#e3ded4] bg-[#faf8f4] px-3 py-2 text-[11px]">
            <span className="font-medium text-[#1d2430]">Provider: </span>
            {providerStatus === null ? (
              <span className="text-[#8a8272]">checking…</span>
            ) : providerStatus === "gemini" ? (
              <span className="text-[#2e7d5b]">{PROVIDER_LABEL.gemini}</span>
            ) : providerStatus === "none" ? (
              <span className="text-[#7a5d1e]">{PROVIDER_LABEL.rules}</span>
            ) : (
              <span className="text-[#2e7d5b]">{PROVIDER_LABEL[providerStatus] ?? providerStatus}</span>
            )}
            {providerStatus === "none" && (
              <div className="mt-1 text-[10px] leading-snug text-[#8a8272]">
                Set GEMINI_API_KEY in the backend environment to enable the Gemini planner. Without
                it, the assistant uses deterministic rule-based recommendations computed from your
                actual metrics.
              </div>
            )}
          </div>

          <QuickPicks
            onExplain={(m) => {
              setMessage(m.slice(0, 600));
              request(m);
            }}
          />

          {/* input */}
          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 600))}
              placeholder="Describe what you want to improve…"
              rows={2}
              className="w-full resize-none rounded-md border border-[#dcd6c8] bg-white px-2.5 py-2 text-xs focus:border-[#2e7d5b] focus:outline-none"
            />
            <div className="mt-1.5 flex gap-1.5">
              <Button
                size="sm"
                className="h-7 bg-[#1d2430] text-xs text-white hover:bg-[#2c3642]"
                disabled={loading}
                onClick={() => request(message)}
              >
                {loading ? "Thinking…" : "Get proposal"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={loading} onClick={() => request("")}>
                Analyze my project
              </Button>
            </div>
          </div>

          {/* suggestions */}
          {!result && !loading && !error && (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Try asking</div>
              <div className="space-y-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setMessage(s);
                      request(s);
                    }}
                    className="w-full rounded-md border border-[#eee9df] bg-[#faf8f4] px-2.5 py-1.5 text-left text-[11px] text-[#5c6470] hover:border-[#2e7d5b]"
                  >
                    “{s}”
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 rounded-md border border-[#e3ded4] bg-[#faf8f4] p-3 text-xs text-[#5c6470]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#2e7d5b]" />
              Preparing project summary and requesting a validated proposal…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-[#e6c1c1] bg-[#fdf1f1] px-3 py-2 text-xs text-[#a33]">
              {error}
              <button onClick={() => request(message)} className="ml-2 underline">
                retry
              </button>
            </div>
          )}

          {/* basis (deterministic provider) */}
          {result?.basis && result.basis.length > 0 && (
            <div className="rounded-md border border-[#e6d9b8] bg-[#fdf9ef] px-3 py-2 text-[11px] text-[#7a5d1e]">
              <div className="font-semibold">Why these changes (computed, not generated):</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {result.basis.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* proposal preview */}
          {result && (
            <div className="rounded-lg border border-[#e3ded4] bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-bold text-[#1d2430]">{result.proposal.title}</div>
                <span className="shrink-0 rounded bg-[#eef4f0] px-1.5 py-0.5 text-[9px] font-medium text-[#2e7d5b]">
                  {PROVIDER_LABEL[result.provider] ?? result.provider}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[#5c6470]">{result.proposal.rationale}</p>

              <div className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">
                Proposed operations ({result.proposal.ops.length})
              </div>
              <ol className="mt-1 space-y-0.5 text-[11px] text-[#1d2430]">
                {describeOps(result.proposal).map((line, i) => (
                  <li key={i} className="rounded bg-[#faf8f4] px-2 py-1">
                    {line}
                  </li>
                ))}
              </ol>

              {result.proposal.expectedEffects.length > 0 && (
                <>
                  <div className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Expected effects</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[#5c6470]">
                    {result.proposal.expectedEffects.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </>
              )}
              {result.proposal.limitations.length > 0 && (
                <>
                  <div className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Limitations</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[#8a8272]">
                    {result.proposal.limitations.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </>
              )}
              {result.proposal.costNotes && (
                <p className="mt-2 rounded bg-[#faf8f4] px-2 py-1 text-[10px] text-[#5c6470]">{result.proposal.costNotes}</p>
              )}
              {result.estimatedCostInr > 0 && (
                <p className="mt-1.5 text-[11px] text-[#5c6470]">
                  Estimated cost from standard assumptions: <b>INR {result.estimatedCostInr.toLocaleString("en-IN")}</b> (verified locally, not by the model).
                </p>
              )}

              <div className="mt-3 flex gap-2">
                {!applied ? (
                  <>
                    <Button
                      size="sm"
                      className="h-7 bg-[#2e7d5b] text-xs text-white hover:bg-[#276c4f]"
                      onClick={applyAndRun}
                      disabled={!baselineRun}
                      title={baselineRun ? "Apply the changes and run the intervention with the baseline seed" : "Run a baseline simulation first"}
                    >
                      Apply &amp; run intervention
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={apply}>
                      Apply only
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setResult(null)}>
                      Reject
                    </Button>
                  </>
                ) : (
                  <div className="w-full space-y-2 rounded-md bg-[#eef4f0] px-3 py-2 text-[11px] font-medium text-[#2e7d5b]">
                    <div>✓ Applied to the intervention scenario.</div>
                    {baselineRun && (
                      <Button size="sm" className="h-7 bg-[#2e7d5b] text-xs text-white hover:bg-[#276c4f]" onClick={applyAndRun}>
                        Run intervention now (same seed)
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {runError && <div className="mt-2 rounded bg-[#fdf1f1] px-2 py-1 text-[11px] text-[#a33]">{runError}</div>}
            </div>
          )}

          <p className="text-[10px] leading-snug text-[#8a8272]">
            The assistant never runs the simulation or edits the world directly. Proposals are
            validated against a strict operation allowlist and world bounds; invalid operations are
            rejected before you ever see them.
          </p>
        </div>
      </aside>
    </>
  );
}

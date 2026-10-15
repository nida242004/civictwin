/// <reference lib="webworker" />
/**
 * Web Worker for the same-seed single-change re-runs (quick-pick verification and
 * the Compare dialog's ablation table). Streams one result per message.
 */

import type { StoredRun } from "../world/types";
import { ablateOne, ablationCount, type CostEffectRow } from "./compare";
import { verifyCandidate, type Candidate, type VerifiedPick } from "../ai/quickpicks";

export type WorkerRequest =
  | { job: number; kind: "verify"; baseline: StoredRun; candidates: Candidate[] }
  | { job: number; kind: "ablate"; baseline: StoredRun; intervention: StoredRun };

export type WorkerResponse =
  | { job: number; kind: "start"; id: string }
  | { job: number; kind: "verify"; id: string; result: VerifiedPick }
  | { job: number; kind: "ablate"; index: number; total: number; row: CostEffectRow | null }
  | { job: number; kind: "done" }
  | { job: number; kind: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.kind === "verify") {
      for (const c of msg.candidates) {
        ctx.postMessage({ job: msg.job, kind: "start", id: c.id } satisfies WorkerResponse);
        ctx.postMessage({ job: msg.job, kind: "verify", id: c.id, result: verifyCandidate(msg.baseline, c) } satisfies WorkerResponse);
      }
    } else {
      const total = ablationCount(msg.baseline, msg.intervention);
      for (let i = 0; i < total; i++) {
        ctx.postMessage({ job: msg.job, kind: "ablate", index: i, total, row: ablateOne(msg.baseline, msg.intervention, i) } satisfies WorkerResponse);
      }
    }
    ctx.postMessage({ job: msg.job, kind: "done" } satisfies WorkerResponse);
  } catch (e) {
    ctx.postMessage({ job: msg.job, kind: "error", message: e instanceof Error ? e.message : String(e) } satisfies WorkerResponse);
  }
};

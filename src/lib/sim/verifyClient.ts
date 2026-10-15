/**
 * Off-main-thread same-seed re-runs. Uses a module Web Worker and streams each
 * result as it finishes; falls back to chunked main-thread execution (yielding
 * with setTimeout between runs) if workers are unavailable or fail.
 */

import type { StoredRun } from "../world/types";
import { ablateOne, ablationCount, assembleAblation, getCachedAblation, type AblationResult, type CostEffectRow } from "./compare";
import { verifyCandidate, type Candidate, type VerifiedPick } from "../ai/quickpicks";
import type { WorkerRequest, WorkerResponse } from "./verify.worker";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
let jobSeq = 0;

/** Run one worker job; resolves true when the worker finished, false if it failed/unavailable. */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

function runInWorker(req: DistributiveOmit<WorkerRequest, "job">, onMsg: (m: WorkerResponse) => void, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let w: Worker;
    try {
      if (typeof Worker === "undefined") return resolve(false);
      w = new Worker(new URL("./verify.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return resolve(false);
    }
    const job = ++jobSeq;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      w.terminate();
      resolve(ok);
    };
    const onAbort = () => finish(true);
    signal?.addEventListener("abort", onAbort);
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.job !== job) return;
      if (m.kind === "done") return finish(true);
      if (m.kind === "error") return finish(false);
      onMsg(m);
    };
    w.onerror = () => finish(false);
    w.postMessage({ ...req, job } as WorkerRequest);
  });
}

/** Verify candidates one at a time, reporting start/finish of each. */
export async function verifyCandidatesStreaming(
  baseline: StoredRun,
  candidates: Candidate[],
  cb: { onStart: (id: string) => void; onResult: (id: string, v: VerifiedPick) => void; signal?: AbortSignal }
): Promise<void> {
  const done = new Set<string>();
  const ok = await runInWorker(
    { kind: "verify", baseline, candidates },
    (m) => {
      if (m.kind === "start") cb.onStart(m.id);
      else if (m.kind === "verify") {
        done.add(m.id);
        cb.onResult(m.id, m.result);
      }
    },
    cb.signal
  );
  if (ok) return;
  for (const c of candidates) {
    if (done.has(c.id)) continue;
    if (cb.signal?.aborted) return;
    cb.onStart(c.id);
    await tick();
    cb.onResult(c.id, verifyCandidate(baseline, c));
  }
}

/** Per-change ablation with progress; worker first, chunked main thread as fallback. */
export async function ablateStreaming(
  baseline: StoredRun,
  intervention: StoredRun,
  cb?: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal }
): Promise<AblationResult | null> {
  const hit = getCachedAblation(intervention.id);
  if (hit) return hit;
  const rows = new Map<number, CostEffectRow>();
  let total = 0;
  const ok = await runInWorker(
    { kind: "ablate", baseline, intervention },
    (m) => {
      if (m.kind !== "ablate") return;
      total = m.total;
      if (m.row) rows.set(m.index, m.row);
      cb?.onProgress?.(rows.size, m.total);
    },
    cb?.signal
  );
  if (cb?.signal?.aborted) return null;
  if (!ok) {
    total = ablationCount(baseline, intervention);
    cb?.onProgress?.(rows.size, total);
    for (let i = 0; i < total; i++) {
      if (rows.has(i)) continue;
      await tick();
      if (cb?.signal?.aborted) return null;
      const row = ablateOne(baseline, intervention, i);
      if (row) rows.set(i, row);
      cb?.onProgress?.(rows.size, total);
    }
  }
  await tick();
  return assembleAblation(baseline, intervention, [...rows.values()]);
}

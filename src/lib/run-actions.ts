"use client";

/**
 * Client-side run orchestration: baseline & intervention execution,
 * report data preparation. Runs are pure computations over project state.
 */

import { useEditor, playbackClock } from "@/lib/store/editor";
import { executeRun, replayStoredRun } from "@/lib/sim/runner";
import { compareRuns } from "@/lib/sim/metrics";
import { ablateSync, headlineDiff, type AblationResult, type Headline } from "@/lib/sim/compare";
import { deepClone } from "@/lib/world/ids";
import type { PraesidiumProject, StoredRun } from "@/lib/world/types";
import { applyProposal, type Proposal } from "@/lib/ai/schema";
import { makeId } from "@/lib/world/ids";

/**
 * Run the baseline: computes and stores an immutable snapshot run
 * (scenario + world + seed + engine version + metrics + events).
 */
export async function runBaseline(): Promise<void> {
  const s = useEditor.getState();
  const project = s.project;
  if (!project) return;
  if (project.world.roads.length === 0) {
    throw new Error("The neighborhood has no walkable roads or paths yet. Draw at least one path first.");
  }
  const { stored, active } = executeRun(project.world, project.scenario, "baseline");
  useEditor.setState((st) => ({
    project: st.project
      ? { ...st.project, baselineRun: stored, interventionRun: null, modifiedAt: new Date().toISOString() }
      : st.project,
    dirty: true,
    activeRun: active,
    runKind: "baseline",
    playing: true,
    displayT: 0,
    resultsOpen: true,
  }));
  playbackClock.t = 0;
  void useEditor.getState().save();
}

/**
 * Run the intervention with the CURRENT world + scenario but the SAME seed
 * as the baseline (unless the user deliberately changed it). The stored
 * baseline is never silently rewritten.
 */
export async function runIntervention(): Promise<void> {
  const s = useEditor.getState();
  const project = s.project;
  if (!project) return;
  if (!project.baselineRun) {
    throw new Error("Run a baseline simulation first — the comparison needs a preserved baseline.");
  }
  if (project.world.roads.length === 0) {
    throw new Error("The neighborhood has no walkable roads or paths yet.");
  }
  const scenario = { ...project.scenario, seed: project.baselineRun.seed };
  const { stored, active } = executeRun(project.world, scenario, "intervention", project.baselineRun.world);
  useEditor.setState((st) => ({
    project: st.project ? { ...st.project, interventionRun: stored, modifiedAt: new Date().toISOString() } : st.project,
    dirty: true,
    activeRun: active,
    runKind: "intervention",
    playing: true,
    displayT: 0,
    resultsOpen: false,
    compareOpen: true,
  }));
  playbackClock.t = 0;
  void useEditor.getState().save();
}

/** Restore playback frames for a stored run (deterministic replay). */
export function loadStoredRun(label: "baseline" | "intervention"): void {
  const s = useEditor.getState();
  const project = s.project;
  if (!project) return;
  const stored = label === "baseline" ? project.baselineRun : project.interventionRun;
  if (!stored) return;
  const active = replayStoredRun(stored);
  playbackClock.t = 0;
  useEditor.setState((st) => ({
    activeRun: active,
    runKind: label,
    playing: true,
    displayT: 0,
    resultsOpen: false,
    compareOpen: false,
    speed: Math.max(st.speed, 2),
    project: st.project
      ? {
          ...st.project,
          world: deepClone(stored.world),
          scenario: deepClone(stored.scenario),
        }
      : st.project,
  }));
}

/* ------------------------------------------------------------------ */
/* Report data                                                         */
/* ------------------------------------------------------------------ */

export interface ReportData {
  project: PraesidiumProject;
  baseline: StoredRun;
  intervention: StoredRun | null;
  comparison: ReturnType<typeof compareRuns>;
  ablation: AblationResult | null;
  headline: Headline | null;
  generatedAt: string;
}

export function prepareReportData(): ReportData | null {
  const { project } = useEditor.getState();
  if (!project?.baselineRun) return null;
  const baseline = project.baselineRun;
  const intervention = project.interventionRun;
  return {
    project: deepClone(project),
    baseline,
    intervention,
    comparison: intervention ? compareRuns(baseline.metrics, intervention.metrics) : [],
    ablation: intervention ? ablateSync(baseline, intervention) : null,
    headline: intervention ? headlineDiff(baseline, intervention) : null,
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* AI proposal application                                             */
/* ------------------------------------------------------------------ */

/** Apply a validated AI proposal as the intervention scenario. */
export function applyAiProposal(proposal: Proposal): void {
  const { project } = useEditor.getState();
  if (!project) return;
  const draft = deepClone(project);
  applyProposal(draft, proposal);
  draft.modifiedAt = new Date().toISOString();
  useEditor.setState((st) => ({
    project: draft,
    dirty: true,
    history: st.project
      ? { past: [...st.history.past, st.project].slice(-50), future: [] }
      : st.history,
  }));
  useEditor.getState().markSaved();
}

export function newRunId(): string {
  return makeId("run");
}

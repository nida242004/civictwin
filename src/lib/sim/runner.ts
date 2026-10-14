/**
 * Run orchestration: full deterministic run + playback helpers.
 *
 * The engine precomputes every frame of the run (1 frame per simulated
 * second), so timeline scrubbing restores exact simulated state — no fake
 * scrubbing. Determinism means a run can always be replayed from its seed.
 */

import type { PraesidiumProject, RunMetrics, ScenarioConfig, StoredRun, World } from "../world/types";
import { ENGINE_VERSION } from "../world/types";
import { runSimulation, type Frame, type SimulationResult } from "./engine";
import { computeMetrics } from "./metrics";
import { deepClone, makeId } from "../world/ids";
import type { ID } from "../world/types";

export interface ActiveRun {
  id: ID;
  label: "baseline" | "intervention";
  result: SimulationResult;
  frames: Frame[];
  durationSec: number;
}

/**
 * Execute a full simulation synchronously and package it as a StoredRun
 * (frames excluded — they live in memory for playback; a StoredRun can be
 * replayed deterministically from seed + scenario + world).
 */
export function executeRun(
  world: World,
  scenario: ScenarioConfig,
  label: "baseline" | "intervention",
  baseWorld?: World
): { stored: StoredRun; active: ActiveRun } {
  const result = runSimulation(world, scenario);
  const metrics: RunMetrics = computeMetrics(world, scenario, result, { label, baseWorld });
  const stored: StoredRun = {
    id: makeId("run"),
    label,
    createdAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    seed: scenario.seed,
    scenario: deepClone(scenario),
    world: deepClone(world),
    events: result.events,
    metrics,
    ...(result.beats.length ? { beats: result.beats } : {}),
  };
  return {
    stored,
    active: {
      id: stored.id,
      label,
      result,
      frames: result.frames,
      durationSec: result.durationSec,
    },
  };
}

/** Deterministically replay a stored run to recover frames for playback. */
export function replayStoredRun(stored: StoredRun): ActiveRun {
  const result = runSimulation(stored.world, stored.scenario);
  return {
    id: stored.id,
    label: stored.label,
    result,
    frames: result.frames,
    durationSec: result.durationSec,
  };
}

/** Runs the current scenario on a cloned world without touching stored runs. */
export function previewRun(project: PraesidiumProject): ActiveRun {
  return executeRun(project.world, project.scenario, "baseline").active;
}

export function clockLabel(simSec: number, startTime: string): string {
  const [h, m] = startTime.split(":").map((v) => parseInt(v, 10) || 0);
  const total = h * 3600 + m * 60 + Math.floor(simSec);
  const hh = Math.floor(total / 3600) % 24;
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

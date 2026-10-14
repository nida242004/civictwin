"use client";

/**
 * Scene source: lets the 3D playback layers (characters, bubbles, drama FX,
 * event markers) render a specific run + clock instead of the editor's
 * global activeRun / playbackClock. Without a provider everything falls back
 * to the global editor store, so the main canvas is unchanged.
 *
 * Used by the "Same night, one change" split replay in the Compare view.
 */

import { createContext, useContext } from "react";
import type { ActiveRun } from "@/lib/sim/runner";
import type { CctvCamera } from "@/lib/world/types";
import { useEditor, playbackClock } from "@/lib/store/editor";
import { useDrama, type DramaStore } from "@/lib/store/drama";

export interface SceneSource {
  run: ActiveRun | null;
  clock: { t: number };
  cameras: CctvCamera[];
  drama: DramaStore;
  isPlaying: () => boolean;
  speed: () => number;
}

const Ctx = createContext<SceneSource | null>(null);
export const SceneSourceProvider = Ctx.Provider;

const NO_CAMS: CctvCamera[] = [];

export function useSceneRun(): ActiveRun | null {
  const c = useContext(Ctx);
  const g = useEditor((s) => s.activeRun);
  return c ? c.run : g;
}

export function useSceneClock(): { t: number } {
  return useContext(Ctx)?.clock ?? playbackClock;
}

export function useSceneDrama(): DramaStore {
  return useContext(Ctx)?.drama ?? useDrama;
}

export function useScenePlay(): { isPlaying: () => boolean; speed: () => number } {
  const c = useContext(Ctx);
  return c ?? GLOBAL_PLAY;
}
const GLOBAL_PLAY = {
  isPlaying: () => useEditor.getState().playing,
  speed: () => useEditor.getState().speed,
};

export function useSceneCameras(): CctvCamera[] {
  const c = useContext(Ctx);
  const g = useEditor((s) => s.project?.world.cameras) ?? NO_CAMS;
  return c ? c.cameras : g;
}

/** True for the main editor canvas (no SceneSource provider). */
export function useIsMainScene(): boolean {
  return useContext(Ctx) === null;
}

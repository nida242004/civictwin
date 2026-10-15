"use client";

/**
 * Fetches Gemini-rewritten incident lines (/api/ai/narrate) for the loaded
 * run and feeds them to the bubble/caption system via setLineOverrides().
 * On any failure the deterministic engine lines stay in place.
 */

import { useEffect } from "react";
import { create } from "zustand";
import type { IncidentBeat } from "@/lib/sim/incidents";
import { useEditor } from "@/lib/store/editor";
import { useIntel } from "@/lib/ai/intelStore";
import { clearLineOverrides, setLineOverrides } from "./captions";
import { narrationKey, pickBeats } from "./hash";

export type NarrationLang = "en" | "hinglish";
const LANG_KEY = "praesidium.captions.lang";

interface NarrationState {
  lang: NarrationLang;
  status: "idle" | "loading" | "gemini" | "rules" | "error";
  /** eventId -> short AI debrief (what went wrong, best single fix). */
  debriefs: Record<string, string>;
  setLang: (l: NarrationLang) => void;
}

function initialLang(): NarrationLang {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(LANG_KEY) === "hinglish" ? "hinglish" : "en";
  } catch {
    return "en";
  }
}

export const useNarration = create<NarrationState>((set) => ({
  lang: initialLang(),
  status: "idle",
  debriefs: {},
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
    set({ lang });
  },
}));

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __praesidiumNarration?: unknown }).__praesidiumNarration = useNarration; // debug hook

const cache = new Map<string, { lines: string[]; beats: IncidentBeat[]; debriefs: Record<string, string>; provider: string }>();
let seq = 0;

interface BakedNarration {
  lines: string[];
  debriefs?: Record<string, string>;
}
let bakedP: Promise<Record<string, BakedNarration>> | null = null;
function loadBakedNarration(): Promise<Record<string, BakedNarration>> {
  bakedP ??= fetch("/captions/narration.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, BakedNarration>>) : {}))
    .catch(() => ({}));
  return bakedP;
}

export async function narrateBeats(runId: string, allBeats: IncidentBeat[]): Promise<void> {
  const { lang } = useNarration.getState();
  const my = ++seq;
  clearLineOverrides();
  if (!allBeats.length) {
    useNarration.setState({ status: "idle", debriefs: {} });
    return;
  }
  const key = `${runId}|${lang}`;
  const hit = cache.get(key);
  if (hit) {
    setLineOverrides(hit.beats, hit.lines);
    useNarration.setState({ status: hit.provider === "gemini" ? "gemini" : "rules", debriefs: hit.debriefs });
    return;
  }
  const beats = pickBeats(allBeats);
  // Baked narration for the deterministic demo nights: instant, no network.
  const baked = (await loadBakedNarration())[narrationKey(lang, beats)];
  if (my !== seq) return;
  if (baked && baked.lines.length === beats.length) {
    cache.set(key, { lines: baked.lines, beats, debriefs: baked.debriefs ?? {}, provider: "gemini" });
    setLineOverrides(beats, baked.lines);
    useNarration.setState({ status: "gemini", debriefs: baked.debriefs ?? {} });
    return;
  }
  useNarration.setState({ status: "loading" });
  const project = useEditor.getState().project;
  const intel = useIntel.getState().intel;
  try {
    const res = await fetch("/api/ai/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        beats,
        lang,
        context: {
          placeName: intel?.placeName ?? project?.source.geo?.placeName ?? project?.name,
          summary: intel?.summary ?? project?.source.geo?.summary,
          peakHours: intel?.peakHours,
          riskFactors: intel?.riskFactors?.slice(0, 4).map((r) => r.factor),
          incidentMix: intel?.incidentMix,
        },
      }),
    });
    const json = await res.json();
    if (my !== seq) return; // a newer run superseded this request
    if (!json?.ok || !Array.isArray(json.data?.lines)) throw new Error("narrate failed");
    const lines = (json.data.lines as unknown[]).map((l, i) => (typeof l === "string" && l.trim() ? l : beats[i].line));
    const entry = { lines, beats, debriefs: (json.data.debriefs ?? {}) as Record<string, string>, provider: String(json.data.provider) };
    if (entry.provider === "gemini") cache.set(key, entry);
    setLineOverrides(beats, lines);
    useNarration.setState({ status: entry.provider === "gemini" ? "gemini" : "rules", debriefs: entry.debriefs });
  } catch {
    if (my !== seq) return;
    useNarration.setState({ status: "error", debriefs: {} }); // deterministic lines remain
  }
}

/** Mount once: re-narrates whenever the loaded run or the language changes. */
export function useNarrationDriver() {
  const activeRun = useEditor((s) => s.activeRun);
  const lang = useNarration((s) => s.lang);
  useEffect(() => {
    if (!activeRun) return;
    void narrateBeats(activeRun.id, activeRun.result.beats ?? []);
  }, [activeRun, lang]);
}

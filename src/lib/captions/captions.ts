/**
 * Text-only caption overrides for incident beats (e.g. Gemini-rewritten lines
 * from /api/ai/narrate), keyed by beatKey(). Used by the comic speech bubbles.
 */

import type { IncidentBeat } from "@/lib/sim/incidents";

const overrides = new Map<string, string>();

export const beatKey = (b: Pick<IncidentBeat, "tSec" | "kind" | "eventId">) => `${Math.round(b.tSec * 10)}|${b.kind}|${b.eventId ?? ""}`;

/** Caption for a beat: narrate-rewritten line if present, else the engine default. */
export function getBeatLine(b: Pick<IncidentBeat, "tSec" | "kind" | "eventId" | "line">): string {
  return overrides.get(beatKey(b)) ?? b.line ?? "";
}

export function clearLineOverrides() {
  overrides.clear();
}

export function setLineOverrides(beats: IncidentBeat[], lines: string[]) {
  beats.forEach((b, i) => {
    if (lines[i]) overrides.set(beatKey(b), lines[i]);
  });
}

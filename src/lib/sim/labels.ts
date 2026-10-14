/** Friendly, plain-language labels for event outcomes and types (UI, PDF, prompts). */

export const OUTCOME_LABEL: Record<string, string> = {
  resolved: "Caught / resolved",
  open_at_end: "Still open at end of night",
  unreachable: "Guard could not reach",
  no_guard: "No guard responded",
  perp_escaped: "Escaped in a blind spot",
  escaped_on_cctv: "Escaped, but on CCTV (traceable)",
};

export function outcomeLabel(o: string): string {
  return OUTCOME_LABEL[o] ?? o.replace(/_/g, " ");
}

/** Short lower-case form for inline sentences ("escaped in blind spot → caught on CCTV"). */
export const OUTCOME_SHORT: Record<string, string> = {
  resolved: "caught",
  open_at_end: "still open",
  unreachable: "unreachable",
  no_guard: "no response",
  perp_escaped: "escaped in blind spot",
  escaped_on_cctv: "caught on CCTV (traceable)",
};
export const outcomeShort = (o: string) => OUTCOME_SHORT[o] ?? o.replace(/_/g, " ");

/** 0 = worst … 3 = best, used to rank improvements. */
export function outcomeRank(o: string): number {
  if (o === "resolved") return 3;
  if (o === "escaped_on_cctv") return 2;
  if (o === "perp_escaped") return 0;
  return 1;
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  mugger: "Mugging",
  harasser: "Harassment",
  burglar: "Break-in attempt",
  vandal: "Vandalism",
  chain_snatcher: "Chain snatching",
};

export function eventTypeLabel(t: string): string {
  if (EVENT_TYPE_LABEL[t]) return EVENT_TYPE_LABEL[t];
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Outcome description used in AI prompts. */
export const OUTCOME_GLOSSARY =
  "Outcomes: resolved = perpetrator caught / incident resolved; perp_escaped = got away inside a CCTV blind spot (untraceable — worst case); escaped_on_cctv = got away but recorded on camera (traceable lead for police); no_guard = no guard responded; unreachable = guard could not reach the spot; open_at_end = still in progress when the night ended.";

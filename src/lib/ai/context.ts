/** Shared types for the Local Safety Intel feature (safe for client + server). */

export type IncidentMix = {
  mugger: number;
  harasser: number;
  burglar: number;
  vandal: number;
  chain_snatcher: number;
};

export interface LocalIntel {
  summary: string;
  riskFactors: { factor: string; evidence: string; sourceIdx: number | null }[];
  incidentMix: IncidentMix;
  peakHours: string;
  suggestedScenario: {
    eventsPerHour: number;
    perpCount: number;
    guardFatigue: number;
    lightingOutageFraction: number;
    ambientVisibility: number;
  };
  helplines: { name: string; number: string }[];
  sources: { title: string; uri: string }[];
  placeName: string;
  generatedAt: string;
  model: string;
  grounded: boolean;
  cached?: boolean;
}

/** Compact, area-level slice of Local Intel shared with every AI decision (Gemini, Jev). */
export interface CompactIntel {
  place: string;
  grounded: boolean;
  summary: string;
  riskFactors: string[];
  incidentMix: IncidentMix;
  peakHours: string;
}

export function compactIntel(i: LocalIntel | null | undefined): CompactIntel | null {
  if (!i || typeof i.summary !== "string") return null;
  return {
    place: i.placeName,
    grounded: Boolean(i.grounded),
    summary: i.summary.slice(0, 350),
    riskFactors: (i.riskFactors ?? []).slice(0, 4).map((r) => r.factor.slice(0, 100)).filter(Boolean),
    incidentMix: i.incidentMix,
    peakHours: (i.peakHours ?? "").slice(0, 80),
  };
}

/** Stable short hash of the parts of intel that influence behaviour/ranking. */
export function intelHash(c: CompactIntel | null | undefined): string {
  if (!c) return "";
  const s = JSON.stringify([c.incidentMix, c.peakHours, c.riskFactors, c.grounded]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const MIX_LABEL: Record<string, string> = {
  mugger: "mugging",
  harasser: "street harassment",
  burglar: "burglary",
  vandal: "vandalism",
  chain_snatcher: "chain snatching",
};
const MIX_AFFINITY: Record<string, string[]> = {
  chain_snatcher: ["light", "camera", "patrol"],
  mugger: ["light", "patrol", "guard"],
  harasser: ["light", "camera", "patrol"],
  burglar: ["camera", "guard"],
  vandal: ["camera"],
};
const KIND_WORDS: Record<string, RegExp> = {
  light: /dark|unlit|poorly lit|light|lit\b|dim/i,
  camera: /cctv|camera|blind|surveil|unmonitor|exit|gate/i,
  patrol: /patrol|beat|late|night|police|response|isolated|deserted/i,
  guard: /guard|security|staff|patrol|unattended|night/i,
};

/** Code-side match: which local factor / incident type does this candidate address? (null = no obvious match) */
export function localTagFor(kind: string, c: CompactIntel | null | undefined, incidentType?: string): string | null {
  if (!c) return null;
  // A candidate aimed at a specific incident is tagged with that incident's local share first.
  const own = incidentType ? c.incidentMix[incidentType as keyof typeof c.incidentMix] : undefined;
  if (incidentType && typeof own === "number" && own > 0) {
    return `${MIX_LABEL[incidentType] ?? incidentType} (${Math.round(own * 100)}% of local mix)`;
  }
  const re = KIND_WORDS[kind];
  const f = re ? c.riskFactors.find((x) => re.test(x)) : undefined;
  if (f) return f;
  const top = Object.entries(c.incidentMix)
    .filter(([k, v]) => v >= 0.2 && (MIX_AFFINITY[k] ?? []).includes(kind))
    .sort((a, b) => b[1] - a[1])[0];
  return top ? `${MIX_LABEL[top[0]] ?? top[0]} (${Math.round(top[1] * 100)}% of local mix)` : null;
}

/** One line of context for Jev/Gemini prompt text. */
export function localLine(c: CompactIntel): string {
  const mix = Object.entries(c.incidentMix)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${MIX_LABEL[k] ?? k} ${Math.round(v * 100)}%`)
    .join(", ");
  return `Local pattern for ${c.place || "this area"}: most common incidents ${mix}; peak hours ${c.peakHours || "n/a"}; risk factors: ${c.riskFactors.join("; ") || "n/a"}.`;
}


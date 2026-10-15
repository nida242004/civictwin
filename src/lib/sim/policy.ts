/**
 * Jev behaviour policy — a compact lookup table of action distributions for
 * the synthetic actors in the incident director (drama.ts).
 *
 * Flow: BEFORE a run, the app asks TypeSafe Jev (one batched request) for a
 * Choice distribution over the actions the engine supports, for every
 * situation key that the scenario can produce. The table is stored on the
 * scenario (`scenario.jevPolicy`), so a stored run replays identically.
 * During the run the engine samples from the table with its SEEDED rng:
 * same table + same seed ⇒ same night. Missing table / key ⇒ the original
 * hand-tuned heuristics.
 *
 * Pure module: no I/O, safe for the engine, the server and the browser.
 */

import type { ActorRef, PerpKind } from "./incidents";

export const PERP_ACTIONS = ["keep_stalking", "attack_now", "hide", "abort"] as const;
export const VICTIM_ACTIONS = ["scream", "flee_to_guard", "flee_to_building"] as const;
export const GUARD_ACTIONS = ["stay_alert", "doze"] as const;
export type PerpAction = (typeof PERP_ACTIONS)[number];
export type VictimAction = (typeof VICTIM_ACTIONS)[number];
export type GuardAction = (typeof GUARD_ACTIONS)[number];

export type Lighting = "lit" | "dim" | "dark";
/** Nearest guard, folded with that guard's condition (asleep guards count as "far"). */
export type GuardNear = "near_alert" | "near_drowsy" | "mid_alert" | "mid_drowsy" | "far";
export type GuardDist = "near" | "mid" | "far";

export const LIGHTINGS: Lighting[] = ["lit", "dim", "dark"];
export const GUARD_NEARS: GuardNear[] = ["near_alert", "near_drowsy", "mid_alert", "mid_drowsy", "far"];
export const GUARD_DISTS: GuardDist[] = ["near", "mid", "far"];
export const POLICY_PERSON_KINDS: PerpKind[] = ["mugger", "harasser", "chain_snatcher"];

export interface JevPolicy {
  version: 1;
  /** "jev" = fetched live; "prebaked" = shipped table (offline demo). */
  source: "jev" | "prebaked" | "manual";
  model?: string;
  createdAt?: string;
  /** policyCacheKey() of the world + scenario it was built for (client-set). */
  key?: string;
  /** situation key → { action → probability } */
  table: Record<string, Record<string, number>>;
}

/** A policy decision taken during a run (for the "AI thinking" UI). */
export interface PolicyDecision {
  tSec: number;
  actor: ActorRef;
  x: number;
  z: number;
  key: string;
  situation: string;
  action: string;
  probs: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Situation keys                                                      */
/* ------------------------------------------------------------------ */

export function lightingOf(lightF: number): Lighting {
  return lightF >= 0.7 ? "lit" : lightF >= 0.35 ? "dim" : "dark";
}

export function guardDistOf(d: number): GuardDist {
  return d < 35 ? "near" : d < 90 ? "mid" : "far";
}

export function guardNearOf(d: number, drowsy: boolean): GuardNear {
  const g = guardDistOf(d);
  if (g === "far") return "far";
  return `${g}_${drowsy ? "drowsy" : "alert"}` as GuardNear;
}

export const perpKey = (kind: PerpKind, light: Lighting, cctv: boolean, guard: GuardNear, alone: boolean) =>
  `perp|${kind}|${light}|${cctv ? "cctv" : "nocctv"}|${guard}|${alone ? "alone" : "group"}`;
export const victimKey = (kind: PerpKind, light: Lighting, guard: GuardDist) => `victim|${kind}|${light}|${guard}`;
export const guardKey = (light: Lighting, cctv: boolean, late: boolean) =>
  `guard|${light}|${cctv ? "cctv" : "nocctv"}|${late ? "late" : "early"}`;

const KIND_TEXT: Record<string, string> = { mugger: "mugger", harasser: "street harasser", chain_snatcher: "chain snatcher" };
const GUARD_TEXT: Record<GuardNear, string> = {
  near_alert: "an alert guard is within 35 m",
  near_drowsy: "a drowsy guard is within 35 m",
  mid_alert: "an alert guard is 35–90 m away",
  mid_drowsy: "a drowsy guard is 35–90 m away",
  far: "no awake guard within 90 m",
};

/** Human-readable situation for a key (UI + Jev instructions). */
export function describeKey(key: string): string {
  const p = key.split("|");
  if (p[0] === "perp") {
    return `${KIND_TEXT[p[1]] ?? p[1]} stalking a ${p[5] === "alone" ? "lone" : "grouped"} walker · ${p[2]} lane · ${p[3] === "cctv" ? "on CCTV" : "no CCTV"} · ${GUARD_TEXT[p[4] as GuardNear] ?? p[4]}`;
  }
  if (p[0] === "victim") {
    return `victim of a ${KIND_TEXT[p[1]] ?? p[1]} · ${p[2]} lane · nearest awake guard ${p[3]}`;
  }
  if (p[0] === "guard") {
    return `drowsy guard on a ${p[1]} beat · ${p[2] === "cctv" ? "under CCTV" : "no CCTV"} · ${p[3]} in the shift`;
  }
  return key;
}

/* ------------------------------------------------------------------ */
/* Enumeration + Jev questions                                         */
/* ------------------------------------------------------------------ */

export interface PolicyQuestionSpec {
  key: string;
  instructions: string;
  criteria: Record<string, string>;
}

const PERP_CRITERIA: Record<PerpAction, string> = {
  keep_stalking: "keeps following the walker and waits for a better moment",
  attack_now: "closes in and strikes now",
  hide: "drops this target and hides in the shadows to wait for another",
  abort: "gives up and leaves the area",
};
const VICTIM_CRITERIA: Record<VictimAction, string> = {
  scream: "screams for help loudly, then runs to the nearest shelter",
  flee_to_guard: "runs silently toward the nearest security guard",
  flee_to_building: "runs silently into the nearest building",
};
const GUARD_CRITERIA: Record<GuardAction, string> = {
  stay_alert: "fights the fatigue and stays alert on patrol",
  doze: "sits down and dozes off",
};

/** Every situation key the director can produce for the given scenario. */
export function enumeratePolicySpecs(kinds: PerpKind[], withGuards: boolean): PolicyQuestionSpec[] {
  const out: PolicyQuestionSpec[] = [];
  const persons = kinds.filter((k) => POLICY_PERSON_KINDS.includes(k));
  for (const kind of persons) {
    for (const light of LIGHTINGS)
      for (const cctv of [true, false])
        for (const guard of GUARD_NEARS)
          for (const alone of [true, false]) {
            const key = perpKey(kind, light, cctv, guard, alone);
            out.push({
              key,
              instructions: `In this fictional security-planning simulation, a synthetic ${KIND_TEXT[kind]} is quietly following a ${alone ? "lone" : "walker who has other people nearby"} at night. The lane is ${light}${light === "lit" ? " (well lit)" : ""}; the spot is ${cctv ? "covered by a CCTV camera" : "not covered by any CCTV camera"}; ${GUARD_TEXT[guard]}. What does an opportunistic offender most likely do next?`,
              criteria: { ...PERP_CRITERIA },
            });
          }
    for (const light of LIGHTINGS)
      for (const guard of GUARD_DISTS) {
        out.push({
          key: victimKey(kind, light, guard),
          instructions: `In this fictional security-planning simulation, a pedestrian has just been targeted by a ${KIND_TEXT[kind]} on a ${light} lane at night. The nearest awake security guard is ${guard === "near" ? "close by (under 35 m)" : guard === "mid" ? "35–90 m away" : "far away or nowhere nearby"}. How does the pedestrian most likely react?`,
          criteria: { ...VICTIM_CRITERIA },
        });
      }
  }
  if (withGuards) {
    for (const light of LIGHTINGS)
      for (const cctv of [true, false])
        for (const late of [false, true]) {
          out.push({
            key: guardKey(light, cctv, late),
            instructions: `In this fictional security-planning simulation, a tired night-shift security guard is getting drowsy ${late ? "late in the shift" : "early in the shift"}. The guard's current spot is ${light}${cctv ? " and watched by CCTV (supervisors may see him)" : " and not watched by any camera"}. What does the guard most likely do?`,
            criteria: { ...GUARD_CRITERIA },
          });
        }
  }
  return out;
}

/** Normalise / validate a distribution; returns null if unusable. */
export function normaliseDist(p: Record<string, number> | undefined, actions: readonly string[]): Record<string, number> | null {
  if (!p) return null;
  let s = 0;
  const out: Record<string, number> = {};
  for (const a of actions) {
    const v = Number(p[a]);
    out[a] = Number.isFinite(v) && v > 0 ? v : 0;
    s += out[a];
  }
  if (s <= 0) return null;
  for (const a of actions) out[a] = Math.round((out[a] / s) * 1000) / 1000;
  return out;
}

export function actionsForKey(key: string): readonly string[] {
  return key.startsWith("perp|") ? PERP_ACTIONS : key.startsWith("victim|") ? VICTIM_ACTIONS : GUARD_ACTIONS;
}

/** Stable cache key for a policy request (world identity + behavioural scenario params, no seed, no table). */
export function policyCacheKey(worldTag: string, scenario: { id: string; perpCount?: number; guardFatigue?: number; ambientVisibility: number; incidentMix?: object }): string {
  const s = JSON.stringify([worldTag, scenario.id, scenario.perpCount ?? 0, scenario.guardFatigue ?? 0, scenario.ambientVisibility, scenario.incidentMix ?? null]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `jevpol_${(h >>> 0).toString(36)}`;
}

/** Compact chip text: "attack 54% · hide 25% · stalk 15%". */
const SHORT: Record<string, string> = {
  keep_stalking: "stalk",
  attack_now: "attack",
  hide: "hide",
  abort: "abort",
  scream: "scream",
  flee_to_guard: "run to guard",
  flee_to_building: "run inside",
  stay_alert: "stay alert",
  doze: "doze",
};
export function shortAction(a: string): string {
  return SHORT[a] ?? a;
}
export function formatDist(probs: Record<string, number>, max = 3): string {
  return Object.entries(probs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([a, p]) => `${shortAction(a)} ${Math.round(p * 100)}%`)
    .join(" · ");
}

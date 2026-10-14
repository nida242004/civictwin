/**
 * "Incident drama" contract shared by the simulation engine (producer) and
 * the 3D layer / voice system (consumers).
 *
 * Perpetrators are SYNTHETIC scenario actors — hypothetical threats used to
 * stress-test a security configuration. They are never derived from, or
 * matched to, real people or demographics.
 */

/** Perpetrator archetypes (scenario-driven, not profiles). */
export type PerpKind = "mugger" | "harasser" | "burglar" | "vandal" | "chain_snatcher";

export const PERP_STATE = {
  INACTIVE: 0, // not yet spawned
  LURKING: 1, // waiting in a dark/uncovered spot
  STALKING: 2, // following a chosen victim at distance
  ATTACKING: 3, // incident in progress (mugging, harassment, break-in…)
  FLEEING: 4, // escaping after incident or after being spotted
  CAUGHT: 5, // intercepted by a guard
  ESCAPED: 6, // left the map
} as const;

/** Extra per-agent states for pedestrians (in addition to AGENT_STATE). */
export const VICTIM_STATE = {
  NORMAL: 0,
  TARGETED: 1, // being stalked (unaware)
  VICTIM: 2, // under attack
  FLEEING: 3, // running away / calling for help
} as const;

/** Guard condition layered on top of GUARD_STATE. */
export const GUARD_CONDITION = {
  ALERT: 0,
  DROWSY: 1,
  ASLEEP: 2, // night-shift fatigue scenario
} as const;

export type BeatKind =
  | "perp_spawn"
  | "stalk_start"
  | "attack_start" // e.g. "you are getting mugged"
  | "victim_scream"
  | "cctv_detect" // a camera saw the incident
  | "cctv_missed" // incident in a blind spot
  | "guard_asleep"
  | "guard_wakes"
  | "guard_dispatched"
  | "guard_arrived"
  | "perp_flee"
  | "perp_caught"
  | "perp_escaped"
  | "resident_alert" // neighbour heard / called
  | "guard_spots" // a guard saw the incident with their own eyes
  | "guard_drowsy"; // guard is nodding off (precedes guard_asleep)

export interface ActorRef {
  kind: "perp" | "agent" | "guard" | "camera";
  /** Index into the frame arrays (perp/agent/guard) or camera id. */
  idx: number;
  id?: string;
}

/** A discrete narrative moment — drives speech bubbles, voice lines, toasts, camera focus. */
export interface IncidentBeat {
  tSec: number;
  kind: BeatKind;
  /** Links to StoredRunEvent.id when the beat belongs to an incident. */
  eventId: string | null;
  actor: ActorRef;
  target?: ActorRef;
  x: number;
  z: number;
  /** Default (deterministic, template) spoken/caption line; LLM may rewrite. */
  line: string;
  /** 1 info · 2 warning · 3 critical */
  severity: 1 | 2 | 3;
}

/** Per-frame perpetrator + drama data (attached to Frame as optional fields). */
export interface DramaFrame {
  perpPos: Float32Array; // interleaved x,z
  perpState: Uint8Array; // PERP_STATE
  perpKind: Uint8Array; // index into PERP_KINDS
  agentDrama: Uint8Array; // VICTIM_STATE per pedestrian agent
  guardCondition: Uint8Array; // GUARD_CONDITION per guard
}

export const PERP_KINDS: PerpKind[] = ["mugger", "harasser", "burglar", "vandal", "chain_snatcher"];


/* ------------------------------------------------------------------ */
/* Engine-side extensions (added by the simulation engine)             */
/* ------------------------------------------------------------------ */

/** Relative weights of perpetrator archetypes (missing kinds = 0). */
export type IncidentMix = Partial<Record<PerpKind, number>>;

export const DEFAULT_INCIDENT_MIX: Record<PerpKind, number> = {
  mugger: 0.3,
  chain_snatcher: 0.22,
  harasser: 0.2,
  burglar: 0.15,
  vandal: 0.13,
};

export type DetectionSource = "cctv" | "guard" | "scream" | "resident";

/** Per-incident outcome record (one per perpetrator attack that started). */
export interface IncidentRecord {
  /** Same id as the StoredRunEvent / IncidentBeat.eventId. */
  eventId: string;
  perpIdx: number;
  kind: PerpKind;
  /** Attack start (simulated seconds). */
  tStart: number;
  x: number;
  z: number;
  severity: 1 | 2 | 3;
  /** Pedestrian agent index (mugger/harasser/chain_snatcher), else null. */
  victimIdx: number | null;
  /** Building id (burglar) / streetlight or camera id (vandal). */
  targetId: string | null;
  /** No active camera covered the attack location. */
  blindSpot: boolean;
  detectedSec: number | null;
  detectedBy: DetectionSource | null;
  dispatchedSec: number | null;
  guardArrivalSec: number | null;
  perpOutcome: "caught" | "escaped" | "at_large";
  caughtSec: number | null;
}

export const PERP_KIND_LABEL: Record<PerpKind, string> = {
  mugger: "mugger",
  harasser: "harasser",
  burglar: "burglar",
  vandal: "vandal",
  chain_snatcher: "chain snatcher",
};

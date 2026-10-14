/**
 * Praesidium world domain model — schema v1.
 *
 * All coordinates are in METERS in a local, right-handed Cartesian space
 * (x = east, z = south, y = up in three.js). The origin (0,0) is the center
 * of the world bounds. Simulation is fully independent of screen pixels.
 */

import type { IncidentBeat, IncidentMix } from "../sim/incidents";

export const WORLD_SCHEMA_VERSION = 1;
export const ENGINE_VERSION = "1.0.0";

export type ID = string;

/* ------------------------------------------------------------------ */
/* Geometry primitives                                                 */
/* ------------------------------------------------------------------ */

export interface Vec2 {
  x: number;
  z: number;
}

/* ------------------------------------------------------------------ */
/* World objects                                                       */
/* ------------------------------------------------------------------ */

export type RoadCategory = "road" | "path";

export interface Road {
  id: ID;
  name?: string;
  /** Ordered polyline of centerline points in local meters. */
  points: Vec2[];
  /** Width in meters. */
  width: number;
  category: RoadCategory;
  /** Whether pedestrians may traverse this segment (default true). */
  pedestrian: boolean;
  /** True when derived from import and not user-verified. */
  inferred?: boolean;
}

export type BuildingCategory =
  | "residential"
  | "commercial"
  | "community"
  | "mixed"
  | "other";

export interface Building {
  id: ID;
  name?: string;
  /** Center of the footprint. */
  x: number;
  z: number;
  /** Footprint size in meters (before rotation). */
  width: number;
  depth: number;
  /** Rotation around Y axis, radians. */
  rotation: number;
  /** Building height in meters. */
  height: number;
  floors: number;
  category: BuildingCategory;
  /** Estimated overnight occupants (synthetic, for simulation only). */
  occupancy: number;
  /** Entrance point; defaults to footprint edge facing nearest road. */
  entrance?: Vec2;
  inferred?: boolean;
}

export type FacilityType =
  | "bus_stop"
  | "park"
  | "community_centre"
  | "market"
  | "school"
  | "clinic"
  | "atm"
  | "place_of_worship"
  | "other";

export interface Facility {
  id: ID;
  name?: string;
  type: FacilityType;
  x: number;
  z: number;
  /** Radius in meters for area features like parks (visual + sampling). */
  radius?: number;
  inferred?: boolean;
}

export interface Streetlight {
  id: ID;
  x: number;
  z: number;
  /** Pole height in meters. */
  height: number;
  /** Modeled brightness 0..1 (relative luminous output). */
  brightness: number;
  /** Modeled illumination radius in meters. */
  radius: number;
  on: boolean;
  maintenance: "ok" | "faulty";
}

export interface CctvCamera {
  id: ID;
  x: number;
  z: number;
  height: number;
  /** Modeled effective range in meters. */
  range: number;
  /** Horizontal field of view, degrees. */
  fovDeg: number;
  /** Orientation, degrees, 0 = +x (east), clockwise (screen-consistent). */
  orientationDeg: number;
  active: boolean;
}

export interface Guard {
  id: ID;
  name: string;
  speed: number; // m/s while patrolling/responding
  waypoints: Vec2[];
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* World + project                                                     */
/* ------------------------------------------------------------------ */

export type WorldSourceKind = "demo" | "blank" | "osm";

export interface World {
  bounds: { width: number; depth: number };
  roads: Road[];
  buildings: Building[];
  facilities: Facility[];
  streetlights: Streetlight[];
  cameras: CctvCamera[];
  guards: Guard[];
  /** Optional site layers (compound walls, gates, etc.), usually AI-inferred from satellite imagery. */
  site?: SiteLayers;
}

export interface SiteWall {
  id: ID;
  points: Vec2[];
  /** Closed loop (boundary wall). */
  closed?: boolean;
  height: number;
  inferred?: boolean;
}

export type GateKind = "main" | "service" | "pedestrian";

export interface SiteGate {
  id: ID;
  name?: string;
  kind: GateKind;
  x: number;
  z: number;
  inferred?: boolean;
}

export interface SiteArea {
  id: ID;
  kind: "parking" | "open" | "dark";
  name?: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  note?: string;
  inferred?: boolean;
}

export interface SiteBooth {
  id: ID;
  x: number;
  z: number;
  note?: string;
  inferred?: boolean;
}

export interface SiteLayers {
  walls: SiteWall[];
  gates: SiteGate[];
  areas: SiteArea[];
  booths: SiteBooth[];
}

export type ScenarioId = "typical_night" | "low_visibility_night" | "high_risk_night" | "custom";

export interface ScenarioConfig {
  id: ScenarioId;
  name: string;
  description: string;
  /** Wall-clock label, e.g. "22:00" (display only). */
  startTime: string;
  /** Simulated seconds. */
  durationSec: number;
  /** Number of synthetic pedestrian agents. */
  population: number;
  /** Fraction of agents that are residents (rest are night commuters). */
  residentRatio: number;
  /** Base pedestrian walking speed, m/s. */
  pedestrianSpeed: number;
  /** null = use guards defined in the world. */
  guardCount: number | null;
  /** Guard walking speed override, m/s. */
  guardSpeed: number;
  /** Expected simulated events per simulated hour. */
  eventsPerHour: number;
  /** Fraction of streetlights modeled as unavailable this night (0..1). */
  lightingOutageFraction: number;
  /** Ambient visibility multiplier 0..1 (fog/haze assumption). */
  ambientVisibility: number;
  /** Scenario-configured multiplier on camera effective range. */
  cctvRangeScale: number;
  /** Deterministic seed. */
  seed: number;
  /**
   * Number of synthetic perpetrator actors ("game mode"). Absent = 0, so
   * projects saved before this field existed replay exactly as before.
   * Ignored (treated as 0) when eventsPerHour is 0.
   */
  perpCount?: number;
  /** Night-shift guard fatigue 0..1 (chance + earliness of dozing off). Absent = 0. */
  guardFatigue?: number;
  /** Relative weights of perpetrator archetypes. Absent = DEFAULT_INCIDENT_MIX. */
  incidentMix?: IncidentMix;
}

export interface StoredRunEvent {
  id: ID;
  tSec: number;
  type: string;
  severity: 1 | 2 | 3;
  x: number;
  z: number;
  assignedGuardId: ID | null;
  guardArrivalSec: number | null;
  resolvedSec: number | null;
  /** 'resolved' | 'open_at_end' | 'unreachable' | 'no_guard' | 'perp_escaped' | 'escaped_on_cctv' (got away but recorded — traceable) */
  outcome: string;
  note: string;
}

export interface RunMetrics {
  // reachability
  tripsTotal: number;
  tripsReachablePct: number;
  unreachableTrips: number;
  avgRouteLengthM: number;
  routeCompletionPct: number;
  // lighting
  pathLenTotalM: number;
  pathLenLitPct: number;
  poorlyLitSegments: number;
  segmentsTotal: number;
  lightingOutages: number;
  // cctv
  cctvCoveragePct: number;
  uncoveredSegments: number;
  // guards
  eventsTotal: number;
  eventsWithGuardPct: number;
  eventsReachedPct: number;
  avgResponseSec: number | null;
  medianResponseSec: number | null;
  unresolvedEvents: number;
  unreachableEvents: number;
  patrolCoveragePct: number | null;
  // overall
  resolutionRatePct: number;
  eventsByType: Record<string, number>;
  // cost (interventions only; null for baseline)
  interventionCostInr: number | null;
  // perpetrator incidents ("game mode"; absent on legacy runs)
  dramaIncidents?: number;
  incidentsDetectedPct?: number;
  detectedByCctvPct?: number;
  blindSpotIncidents?: number;
  perpsCaughtPct?: number;
  medianDetectionDelaySec?: number | null;
  dramaMedianResponseSec?: number | null;
  guardAsleepMin?: number;
}

export interface StoredRun {
  id: ID;
  label: "baseline" | "intervention";
  createdAt: string;
  engineVersion: string;
  seed: number;
  scenario: ScenarioConfig;
  /** Full immutable snapshot of the world used for this run. */
  world: World;
  events: StoredRunEvent[];
  metrics: RunMetrics;
  /** Narrative beats (optional; regenerated deterministically on replay). */
  beats?: IncidentBeat[];
  /** Frame data is NOT persisted; it is deterministically replayed. */
}

export interface ProjectSource {
  kind: WorldSourceKind;
  attribution?: string;
  importedAt?: string;
  geo?: ProjectGeo;
}

export interface ProjectGeo {
  lat: number;
  lng: number;
  /** [south, north, west, east] in degrees. The world origin is the bbox center; world bounds match the bbox. */
  bbox: [number, number, number, number];
  placeName?: string;
  societyType?: string;
  /** Short AI description of the site. */
  summary?: string;
  /** Satellite JPEG covering exactly the bbox (data URL). */
  satelliteImage?: string;
}

export interface PraesidiumProject {
  schemaVersion: number;
  projectId: ID;
  name: string;
  description: string;
  createdAt: string;
  modifiedAt: string;
  source: ProjectSource;
  world: World;
  scenario: ScenarioConfig;
  baselineRun: StoredRun | null;
  interventionRun: StoredRun | null;
}

/* ------------------------------------------------------------------ */
/* Cost assumptions (INR, clearly labeled estimates)                   */
/* ------------------------------------------------------------------ */

export const COST_ASSUMPTIONS = {
  streetlightInstallInr: 14000,
  cameraInstallInr: 26000,
  guardNightInr: 3200,
  patrolWaypointEditInr: 0,
} as const;

/* ------------------------------------------------------------------ */
/* Default factory helpers                                             */
/* ------------------------------------------------------------------ */

export function defaultScenario(id: ScenarioId = "typical_night"): ScenarioConfig {
  if (id === "high_risk_night") {
    return {
      id,
      name: "High-Risk Night",
      description:
        "Late, dark night: several synthetic perpetrators probe the society's blind spots, lights are failing, and tired night-shift guards may doze off. A stress test of the security setup — fictional scenario, not a prediction.",
      startTime: "01:00",
      durationSec: 1800,
      population: 40,
      residentRatio: 0.7,
      pedestrianSpeed: 1.35,
      guardCount: null,
      guardSpeed: 1.15,
      eventsPerHour: 4,
      lightingOutageFraction: 0.2,
      ambientVisibility: 0.75,
      cctvRangeScale: 1,
      seed: 913377,
      perpCount: 6,
      guardFatigue: 0.7,
    };
  }
  return {
    perpCount: id === "low_visibility_night" ? 4 : 3,
    guardFatigue: id === "low_visibility_night" ? 0.4 : 0.3,
    id,
    name: id === "low_visibility_night" ? "Low-Visibility Night" : "Typical Night",
    description:
      id === "low_visibility_night"
        ? "Hazy night with reduced ambient visibility, several modeled lighting outages, and a higher rate of fictional incidents."
        : "A typical night with normal modeled pedestrian activity, routine patrols, and a low rate of fictional incidents.",
    startTime: "22:00",
    durationSec: 1800,
    population: 48,
    residentRatio: 0.65,
    pedestrianSpeed: 1.35,
    guardCount: null,
    guardSpeed: 1.15,
    eventsPerHour: 6,
    lightingOutageFraction: id === "low_visibility_night" ? 0.25 : 0.04,
    ambientVisibility: id === "low_visibility_night" ? 0.6 : 1,
    cctvRangeScale: 1,
    seed: 20260214,
  };
}

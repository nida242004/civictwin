/**
 * Scenario templates + coverage model.
 *
 * IMPORTANT: All event generation is a FICTIONAL scenario model used for
 * planning exercises. It is NOT a prediction of actual crime and must not
 * be presented as one.
 */

import type { CctvCamera, ScenarioConfig, ScenarioId, Streetlight, World } from "../world/types";
import { defaultScenario } from "../world/types";
import { makeRng } from "./rng";

export function scenarioTemplates(): ScenarioConfig[] {
  const a = defaultScenario("typical_night");
  const b = defaultScenario("low_visibility_night");
  b.seed = 777001;
  const c = defaultScenario("high_risk_night");
  c.seed = 913377;
  return [a, b, c];
}

export function applyScenarioTemplate(base: ScenarioConfig, id: ScenarioId): ScenarioConfig {
  const t = scenarioTemplates().find((s) => s.id === id);
  if (!t) return base;
  // keep user's seed & population tweaks
  return { ...t, seed: base.seed, population: base.population, guardCount: base.guardCount };
}

/* ------------------------------------------------------------------ */
/* Coverage model (transparent geometric approximation)                */
/* ------------------------------------------------------------------ */

/** Lighting threshold constant — illumination at which a sample counts as lit. */
export const LIGHT_THRESHOLD = 0.35;
export const COVERAGE_SAMPLE_STEP_M = 5;

export interface PathSample {
  x: number;
  z: number;
  roadId: string;
  /** distance along the full network, used only for ordering */
}

export interface SampleCoverage {
  light: number; // modeled illumination 0..∞
  lit: boolean;
  cctv: boolean;
}

export interface CoverageResult {
  samples: PathSample[];
  perSample: SampleCoverage[];
  litLenM: number;
  totalLenM: number;
  cctvLenM: number;
  /** per road-id aggregated: fraction of length lit */
  perRoadLit: Map<string, number>;
  perRoadCctv: Map<string, number>;
}

export function illuminationAt(
  x: number,
  z: number,
  lights: Streetlight[],
  visibility: number
): number {
  let e = 0;
  for (const l of lights) {
    if (!l.on || l.maintenance === "faulty") continue;
    const d2 = (l.x - x) * (l.x - x) + (l.z - z) * (l.z - z);
    const r = Math.max(l.radius, 1);
    if (d2 > r * r) continue;
    const d = Math.sqrt(d2);
    const att = Math.pow(1 - d / r, 1.5); // simple attenuation curve
    e += l.brightness * att;
  }
  return e * Math.max(0.2, visibility);
}

export function cctvCovers(cam: CctvCamera, x: number, z: number, rangeScale: number): boolean {
  if (!cam.active) return false;
  const dx = x - cam.x;
  const dz = z - cam.z;
  const d2 = dx * dx + dz * dz;
  const range = cam.range * rangeScale;
  if (d2 > range * range) return false;
  if (cam.fovDeg >= 359) return true;
  const ang = (Math.atan2(dz, dx) * 180) / Math.PI; // -180..180, 0 = +x
  const diff = Math.abs(((ang - cam.orientationDeg + 540) % 360) - 180);
  return diff <= cam.fovDeg / 2;
}

/**
 * Sample walkable network and compute modeled lighting + CCTV coverage.
 * Assumptions are intentionally simple and disclosed in the UI:
 * - illumination = Σ brightness · (1 − d/radius)^1.5 over active lights
 * - lower ambient visibility raises the effective lit threshold
 * - CCTV coverage = sample point within range × rangeScale and within FOV cone
 */
export function computeCoverage(world: World, visibility: number, cctvRangeScale: number): CoverageResult {
  const samples: PathSample[] = [];
  const perSample: SampleCoverage[] = [];
  let litLen = 0;
  let totalLen = 0;
  let cctvLen = 0;
  const litByRoad = new Map<string, { lit: number; total: number; cctv: number }>();

  // effective threshold rises as visibility falls (need more light to see)
  const threshold = LIGHT_THRESHOLD / Math.max(0.35, visibility);

  for (const road of world.roads) {
    if (!road.pedestrian) continue;
    for (let i = 0; i + 1 < road.points.length; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (segLen < 0.01) continue;
      const n = Math.max(1, Math.ceil(segLen / COVERAGE_SAMPLE_STEP_M));
      const agg = litByRoad.get(road.id) ?? { lit: 0, total: 0, cctv: 0 };
      for (let s = 0; s < n; s++) {
        const t = n === 1 ? 0.5 : s / (n - 1);
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const light = illuminationAt(x, z, world.streetlights, visibility);
        const lit = light >= threshold;
        let covered = false;
        for (const cam of world.cameras) {
          if (cctvCovers(cam, x, z, cctvRangeScale)) {
            covered = true;
            break;
          }
        }
        const w = segLen / n;
        totalLen += w;
        agg.total += w;
        if (lit) {
          litLen += w;
          agg.lit += w;
        }
        if (covered) {
          cctvLen += w;
          agg.cctv += w;
        }
        samples.push({ x, z, roadId: road.id });
        perSample.push({ light, lit, cctv: covered });
      }
      litByRoad.set(road.id, agg);
    }
  }

  const perRoadLit = new Map<string, number>();
  const perRoadCctv = new Map<string, number>();
  for (const [k, v] of litByRoad) {
    perRoadLit.set(k, v.total > 0 ? v.lit / v.total : 0);
    perRoadCctv.set(k, v.total > 0 ? v.cctv / v.total : 0);
  }

  return {
    samples,
    perSample,
    litLenM: litLen,
    totalLenM: totalLen,
    cctvLenM: cctvLen,
    perRoadLit,
    perRoadCctv,
  };
}

/**
 * Deterministically choose lights that suffer an outage this night.
 * Selection is keyed on the light's ID (not its index), so adding or
 * removing lamps never reshuffles which existing lamps are out — baseline
 * and intervention runs stay genuinely like-for-like.
 */
export function applyOutages(world: World, fraction: number, seed: number): Set<string> {
  const out = new Set<string>();
  if (fraction <= 0) return out;
  const f = Math.min(1, fraction);
  for (const l of world.streetlights) {
    const h = hashId(l.id, seed);
    // map uniform hash to [0,1); independent per lamp
    if (h < f) out.add(l.id);
  }
  return out;
}

/** Deterministic 32-bit hash of a light id + seed → uniform [0,1). */
function hashId(id: string, seed: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

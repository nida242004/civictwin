/**
 * Camera planning for the split-screen compare: fit the headline incident + the
 * responding guard, and choose an azimuth/elevation whose sight line to the action
 * is not blocked by a building (buildings are one merged mesh, so we avoid
 * occlusion by choosing the view rather than fading roofs).
 */

import type { Building, StoredRun, StoredRunEvent } from "@/lib/world/types";
import type { ActiveRun } from "@/lib/sim/runner";
import type { Headline } from "@/lib/sim/compare";

export interface Pt {
  x: number;
  z: number;
}

export interface FitPlan {
  mode: "incident" | "society";
  version: number;
  center: Pt;
  /** world-space extent (m) that should fit the shorter canvas side */
  extent: number;
  /** unit-ish direction from target to camera (x, y, z) */
  dir: [number, number, number];
  minZoom: number;
  maxZoom: number;
}

const DEG = Math.PI / 180;
const DEFAULT_AZ = 45 * DEG;
const DEFAULT_EL = Math.atan2(150, 120 * Math.SQRT2);

function dirOf(az: number, el: number): [number, number, number] {
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}

function insideBuilding(b: Building, x: number, z: number): boolean {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  // inverse of three's rotation about Y
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  return Math.abs(lx) <= b.width / 2 && Math.abs(lz) <= b.depth / 2;
}

/** How much of the sight line from a ground-level target to the camera is inside buildings. */
function blockedSamples(buildings: Building[], p: Pt, az: number, el: number): number {
  const d = dirOf(az, el);
  const hx = d[0] / Math.cos(el);
  const hz = d[2] / Math.cos(el);
  const slope = Math.tan(el);
  const near = buildings.filter((b) => Math.hypot(b.x - p.x, b.z - p.z) < 160);
  let n = 0;
  for (let t = 3; t < 140; t += 2) {
    const x = p.x + hx * t;
    const z = p.z + hz * t;
    const rayH = 1.4 + t * slope;
    for (const b of near) if (b.height > rayH && insideBuilding(b, x, z)) n++;
  }
  return n;
}

export function chooseView(buildings: Building[], targets: { p: Pt; w: number }[]): { az: number; el: number } {
  let best = { az: DEFAULT_AZ, el: DEFAULT_EL, score: Infinity };
  const els = [DEFAULT_EL, 56 * DEG, 68 * DEG];
  for (let i = 0; i < 16; i++) {
    const az = DEFAULT_AZ + (i * Math.PI * 2) / 16;
    const dev = Math.abs(((az - DEFAULT_AZ + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const turn = dev; // angular distance from the default azimuth
    els.forEach((el, k) => {
      let score = 0;
      for (const t of targets) score += t.w * blockedSamples(buildings, t.p, az, el);
      score += turn * 0.8 + k * 3;
      if (score < best.score) best = { az, el, score };
    });
  }
  return { az: best.az, el: best.el };
}

function frameAt(run: ActiveRun, t: number) {
  return run.frames[Math.max(0, Math.min(run.frames.length - 1, Math.floor(t)))];
}

function matchEvent(stored: StoredRun, h: Headline): StoredRunEvent | undefined {
  return stored.events
    .filter((ev) => Math.abs(ev.tSec - h.tSec) <= 240 && Math.hypot(ev.x - h.x, ev.z - h.z) < 60)
    .sort((a, b) => Math.abs(a.tSec - h.tSec) - Math.abs(b.tSec - h.tSec))[0];
}

/** Incident + responding guard positions (both runs) around the incident. */
export function incidentPoints(h: Headline, runs: { stored: StoredRun; run: ActiveRun }[]): Pt[] {
  const pts: Pt[] = [{ x: h.x, z: h.z }];
  for (const { stored, run } of runs) {
    const e = matchEvent(stored, h);
    if (!e || !e.assignedGuardId) continue;
    const gi = stored.world.guards.findIndex((g) => g.id === e.assignedGuardId);
    if (gi < 0) continue;
    for (const t of [e.tSec, e.guardArrivalSec ?? e.tSec + 20]) {
      const f = frameAt(run, t);
      const gx = f?.guardPos[gi * 2];
      const gz = f?.guardPos[gi * 2 + 1];
      if (gx === undefined || gz === undefined) continue;
      // ignore a guard that is far away; fitting it would shrink everything
      if (Math.hypot(gx - h.x, gz - h.z) <= 70) pts.push({ x: gx, z: gz });
    }
  }
  return pts;
}

export function planFit(
  mode: "incident" | "society",
  version: number,
  headline: Headline | null,
  runs: { stored: StoredRun; run: ActiveRun }[]
): FitPlan {
  const world = runs[0].stored.world;
  if (mode === "society" || !headline) {
    return {
      mode: "society",
      version,
      center: { x: 0, z: 0 },
      extent: Math.max(world.bounds.width, world.bounds.depth) * 0.8,
      dir: dirOf(DEFAULT_AZ, DEFAULT_EL),
      minZoom: 0.6,
      maxZoom: 14,
    };
  }
  const pts = incidentPoints(headline, runs);
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minZ = Math.min(...pts.map((p) => p.z));
  const maxZ = Math.max(...pts.map((p) => p.z));
  const view = chooseView(world.buildings, [
    { p: { x: headline.x, z: headline.z }, w: 3 },
    ...pts.slice(1).map((p) => ({ p, w: 1 })),
  ]);
  return {
    mode: "incident",
    version,
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    extent: Math.max(maxX - minX, maxZ - minZ, 12) + 26, // margin so actors are not on the edge
    dir: dirOf(view.az, view.el),
    minZoom: 0.6,
    maxZoom: 16,
  };
}

/** Polyline walking helpers shared by the engine and the incident director. */

import { dist } from "../world/ids";

export interface WalkRef {
  segIdx: number;
  segT: number;
}

export type Pt = { x: number; z: number };

/** Advance `d` meters along a polyline, mutating the segment reference. */
export function advanceAlong(path: Pt[], ref: WalkRef, d: number): { finished: boolean; x: number; z: number } {
  if (path.length === 0) return { finished: true, x: 0, z: 0 };
  if (path.length === 1) return { finished: true, x: path[0].x, z: path[0].z };
  let i = ref.segIdx;
  let t = ref.segT;
  if (i >= path.length - 1) {
    const last = path[path.length - 1];
    return { finished: true, x: last.x, z: last.z };
  }
  while (d > 0 && i < path.length - 1) {
    const a = path[i];
    const b = path[i + 1];
    const len = dist(a.x, a.z, b.x, b.z);
    const remain = len - t;
    if (d < remain) {
      t += d;
      d = 0;
    } else {
      d -= remain;
      i += 1;
      t = 0;
    }
  }
  if (i >= path.length - 1) {
    ref.segIdx = path.length - 2;
    ref.segT = 0;
    const last = path[path.length - 1];
    return { finished: true, x: last.x, z: last.z };
  }
  ref.segIdx = i;
  ref.segT = t;
  const a = path[i];
  const b = path[i + 1];
  const len = Math.max(dist(a.x, a.z, b.x, b.z), 1e-6);
  const tt = Math.min(t / len, 1);
  return { finished: false, x: a.x + (b.x - a.x) * tt, z: a.z + (b.z - a.z) * tt };
}

export function positionOf(path: Pt[], ref: WalkRef): Pt {
  if (!path.length) return { x: 0, z: 0 };
  if (path.length === 1) return { x: path[0].x, z: path[0].z };
  const r = advanceAlong(path, ref, 0);
  return { x: r.x, z: r.z };
}

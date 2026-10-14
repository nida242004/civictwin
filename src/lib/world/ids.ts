import type { ID } from "./types";

let counter = 0;

/** Short, collision-resistant id for world objects. */
export function makeId(prefix: string): ID {
  counter += 1;
  const rand = Math.floor(Math.random() * 0xffff).toString(36);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Deterministic id generator for procedural generation (demo/import). */
export function seededId(prefix: string, n: number): ID {
  return `${prefix}_${n.toString(36)}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

export function deepClone<T>(v: T): T {
  return structuredClone(v);
}

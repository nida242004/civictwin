/**
 * Deterministic seeded PRNG — mulberry32.
 * Never use Math.random() inside the simulation.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [a, b). */
  range(a: number, b: number): number;
  /** Uniform integer in [a, b] inclusive. */
  int(a: number, b: number): number;
  /** Exponential distribution sample with given rate (mean = 1/rate). */
  exponential(rate: number): number;
  /** Weighted pick from an array of weights. */
  weighted(weights: number[]): number;
}

export function makeRng(seed: number): Rng {
  // avoid degenerate seeds
  let s = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  const next = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range(a, b) {
      return a + (b - a) * next();
    },
    int(a, b) {
      return Math.min(b, a + Math.floor(next() * (b - a + 1)));
    },
    exponential(rate) {
      if (rate <= 0) return Infinity;
      const u = Math.max(next(), 1e-12);
      return -Math.log(1 - u) / rate;
    },
    weighted(weights) {
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) return 0;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },
  };
}

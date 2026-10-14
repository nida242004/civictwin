import { describe, it, expect } from "vitest";
import { makeRng } from "@/lib/sim/rng";

describe("seeded PRNG (mulberry32)", () => {
  it("produces identical sequences for identical seeds", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let differs = false;
    for (let i = 0; i < 100; i++) {
      if (a.next() !== b.next()) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("range() stays within bounds", () => {
    const r = makeRng(42);
    for (let i = 0; i < 500; i++) {
      const v = r.range(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
    }
  });

  it("int() stays within inclusive bounds", () => {
    const r = makeRng(99);
    for (let i = 0; i < 500; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("exponential() is positive and mean-ish correct", () => {
    const r = makeRng(7);
    const rate = 0.5; // mean = 2
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = r.exponential(rate);
      expect(v).toBeGreaterThan(0);
      sum += v;
    }
    const mean = sum / n;
    expect(mean).toBeGreaterThan(1.8);
    expect(mean).toBeLessThan(2.2);
  });

  it("weighted() respects boundaries", () => {
    const r = makeRng(3);
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[r.weighted([0.2, 0.3, 0.5])]++;
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
    expect(r.weighted([0, 0])).toBe(0);
  });
});

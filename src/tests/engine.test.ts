import { describe, it, expect } from "vitest";
import { runSimulation, AGENT_STATE, GUARD_STATE } from "@/lib/sim/engine";
import { buildDemoWorld } from "@/lib/world/demo";
import { defaultScenario, type ScenarioConfig } from "@/lib/world/types";

function scenario(patch: Partial<ScenarioConfig> = {}): ScenarioConfig {
  return { ...defaultScenario("typical_night"), durationSec: 240, population: 10, ...patch };
}

describe("deterministic simulation engine", () => {
  it("produces identical results for identical setups (frames + events)", () => {
    const world = buildDemoWorld();
    const sc = scenario();
    const a = runSimulation(world, sc);
    const b = runSimulation(world, sc);
    expect(a.events.length).toBe(b.events.length);
    expect(a.trips.length).toBe(b.trips.length);
    expect(a.frames.length).toBe(b.frames.length);
    // spot-check frames deeply
    for (const t of [0, 30, 77, 150, 239]) {
      const fa = a.frames[Math.min(t, a.frames.length - 1)];
      const fb = b.frames[Math.min(t, b.frames.length - 1)];
      expect(Array.from(fa.agentPos)).toEqual(Array.from(fb.agentPos));
      expect(Array.from(fa.agentState)).toEqual(Array.from(fb.agentState));
      expect(Array.from(fa.guardPos)).toEqual(Array.from(fb.guardPos));
    }
  });

  it("changes results when the seed changes", () => {
    const world = buildDemoWorld();
    const a = runSimulation(world, scenario({ seed: 1 }));
    const b = runSimulation(world, scenario({ seed: 2 }));
    const sig = (r: ReturnType<typeof runSimulation>) => r.events.map((e) => `${e.tSec}:${e.type}`).join("|");
    // statistically almost impossible to be identical across seeds with events
    if (a.events.length > 0 && b.events.length > 0) {
      expect(sig(a)).not.toBe(sig(b));
    }
  });

  it("moves agents along routes and records arrivals", () => {
    const world = buildDemoWorld();
    const res = runSimulation(world, scenario({ population: 12, durationSec: 300 }));
    // some agents must start walking and some positions must change over time
    const f0 = res.frames[0];
    const fEnd = res.frames[res.frames.length - 1];
    const moved = Array.from(fEnd.agentPos).some((v, i) => v !== f0.agentPos[i]);
    expect(moved).toBe(true);
    expect(res.trips.length).toBeGreaterThan(0);
    const walkingOrArrived = Array.from(fEnd.agentState).filter(
      (s) => s === AGENT_STATE.WALKING || s === AGENT_STATE.ARRIVED
    ).length;
    expect(walkingOrArrived).toBeGreaterThan(0);
  });

  it("guards patrol and their positions change over time", () => {
    const world = buildDemoWorld();
    const res = runSimulation(world, scenario({ population: 4, durationSec: 180 }));
    expect(res.guardCount).toBe(2); // demo has two guards
    const f0 = res.frames[0];
    const fEnd = res.frames[res.frames.length - 1];
    const moved = Array.from(fEnd.guardPos).some((v, i) => v !== f0.guardPos[i]);
    expect(moved).toBe(true);
    // guards remain in a valid state
    Array.from(fEnd.guardState).forEach((s) => {
      expect(Object.values(GUARD_STATE)).toContain(s);
    });
  });

  it("generates events under a fixed seed and assigns guards", () => {
    const world = buildDemoWorld();
    const sc = scenario({ eventsPerHour: 60, durationSec: 600, population: 8 });
    const res = runSimulation(world, sc);
    expect(res.events.length).toBeGreaterThan(0);
    for (const e of res.events) {
      expect(e.tSec).toBeLessThanOrEqual(sc.durationSec);
      expect(["resolved", "open_at_end", "unreachable", "no_guard", "perp_escaped", "escaped_on_cctv"]).toContain(e.outcome);
      if (e.assignedGuardId !== null) {
        if (e.outcome === "resolved") {
          expect(e.guardArrivalSec).not.toBeNull();
          expect(e.guardArrivalSec! - e.tSec).toBeGreaterThanOrEqual(0);
        }
        // open_at_end: guard may still be en route (arrival null) or on scene
        if (e.guardArrivalSec !== null) {
          expect(e.guardArrivalSec - e.tSec).toBeGreaterThanOrEqual(0);
        }
      } else {
        expect(["no_guard", "unreachable", "open_at_end", "perp_escaped", "escaped_on_cctv"]).toContain(e.outcome);
      }
    }
    const resolved = res.events.filter((e) => e.outcome === "resolved");
    if (resolved.length) {
      for (const e of resolved) {
        expect(e.resolvedSec).toBeGreaterThan(e.tSec);
      }
    }
  });

  it("handles zero-event scenarios (eventsPerHour = 0)", () => {
    const world = buildDemoWorld();
    const res = runSimulation(world, scenario({ eventsPerHour: 0, population: 6 }));
    expect(res.events.length).toBe(0);
    expect(res.trips.length).toBeGreaterThan(0);
  });

  it("handles zero-guard scenarios and records no_guard outcomes", () => {
    const world = buildDemoWorld();
    const res = runSimulation(world, scenario({ eventsPerHour: 120, guardCount: 0, durationSec: 600, population: 6 }));
    expect(res.guardCount).toBe(0);
    for (const e of res.events) {
      expect(e.assignedGuardId).toBeNull();
      expect(e.outcome).toBe("no_guard");
    }
  });

  it("handles unreachable destinations honestly (no fake arrivals)", () => {
    const world = buildDemoWorld();
    // leave ONLY an isolated building far from any road — every trip is unreachable
    world.buildings = [
      {
        id: "bd_island",
        x: 999,
        z: 999,
        width: 10,
        depth: 10,
        rotation: 0,
        height: 6,
        floors: 2,
        category: "residential",
        occupancy: 100,
      },
    ];
    const res = runSimulation(world, scenario({ population: 8, durationSec: 300 }));
    expect(res.unreachableDestinations).toContain("bd_island");
    // unreachable trips are recorded as such
    const unreachable = res.trips.filter((t) => !t.reachable);
    expect(unreachable.length).toBeGreaterThan(0);
  });

  it("respects invalid world configuration without crashing (no roads)", () => {
    const world = buildDemoWorld();
    world.roads = [];
    const res = runSimulation(world, scenario({ population: 5 }));
    expect(res.trips.every((t) => !t.reachable)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSimulation } from "@/lib/sim/engine";
import { buildDemoWorld } from "@/lib/world/demo";
import { defaultScenario, type ScenarioConfig } from "@/lib/world/types";
import { enumeratePolicySpecs, PERP_ACTIONS, GUARD_ACTIONS, type JevPolicy } from "@/lib/sim/policy";
import { PERP_KINDS } from "@/lib/sim/incidents";

const baked = JSON.parse(readFileSync(join(__dirname, "../../public/jev/policy-high_risk_night.json"), "utf8")) as JevPolicy;

/** Table where every situation of one actor type deterministically picks `action`. */
function forced(prefix: "perp" | "guard", action: string): JevPolicy {
  const actions = prefix === "perp" ? PERP_ACTIONS : GUARD_ACTIONS;
  const table: JevPolicy["table"] = {};
  for (const s of enumeratePolicySpecs(PERP_KINDS, true)) {
    if (!s.key.startsWith(prefix + "|")) continue;
    table[s.key] = Object.fromEntries(actions.map((a) => [a, a === action ? 1 : 0]));
  }
  return { version: 1, source: "manual", table };
}

const hr = (patch: Partial<ScenarioConfig> = {}): ScenarioConfig => ({ ...defaultScenario("high_risk_night"), durationSec: 1200, ...patch });

describe("Jev behaviour policy", () => {
  it("covers every situation key with a normalised distribution", () => {
    const specs = enumeratePolicySpecs(PERP_KINDS, true);
    for (const s of specs) {
      const d = baked.table[s.key];
      expect(d, s.key).toBeDefined();
      const sum = Object.values(d).reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0.97);
      expect(sum).toBeLessThan(1.03);
    }
  });

  it("is deterministic with a fixed table: same table + seed ⇒ same night", () => {
    const world = buildDemoWorld();
    const sc = hr({ jevPolicy: baked });
    const a = runSimulation(world, sc);
    const b = runSimulation(world, structuredClone(sc));
    expect(a.decisions!.length).toBeGreaterThan(0);
    expect(JSON.stringify(a.decisions)).toBe(JSON.stringify(b.decisions));
    expect(JSON.stringify(a.beats)).toBe(JSON.stringify(b.beats));
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    for (const t of [0, 300, 777, 1199]) expect(Array.from(a.frames[t].perpPos!)).toEqual(Array.from(b.frames[t].perpPos!));
  });

  it("records decisions with situation, chosen action and distribution", () => {
    const r = runSimulation(buildDemoWorld(), hr({ jevPolicy: baked }));
    for (const d of r.decisions!) {
      expect(baked.table[d.key]).toBeDefined();
      expect(d.probs[d.action]).toBeGreaterThan(0);
      expect(d.situation.length).toBeGreaterThan(10);
    }
  });

  it("without a table, the heuristics run and no decisions are recorded", () => {
    const r = runSimulation(buildDemoWorld(), hr());
    expect(r.decisions).toEqual([]);
  });

  it("changing the table changes behaviour as expected", () => {
    const world = buildDemoWorld();
    const attack = runSimulation(world, hr({ jevPolicy: forced("perp", "attack_now") }));
    const abort = runSimulation(world, hr({ jevPolicy: forced("perp", "abort") }));
    const personInc = (r: typeof attack) => r.incidents.filter((i) => i.victimIdx !== null && i.perpIdx !== 0).length;
    expect(abort.decisions!.every((d) => d.action === "abort")).toBe(true);
    expect(personInc(abort)).toBeLessThan(personInc(attack));
    expect(abort.beats.some((b) => b.line.includes("gives up"))).toBe(true);

    // quiet night (no incidents keep guards busy) so fatigue decisions are reached
    const quiet = { guardFatigue: 1, eventsPerHour: 0, perpCount: 0, durationSec: 1800 };
    const doze = runSimulation(world, hr({ ...quiet, jevPolicy: forced("guard", "doze") }));
    const alert = runSimulation(world, hr({ ...quiet, jevPolicy: forced("guard", "stay_alert") }));
    expect(doze.guardAsleepSec).toBeGreaterThan(0);
    expect(alert.decisions!.some((d) => d.action === "stay_alert")).toBe(true);
    expect(alert.guardAsleepSec).toBeLessThan(doze.guardAsleepSec);
  });
});

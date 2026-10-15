/**
 * Bake TypeSafe Jev behaviour-policy tables for the demo scenarios into
 * public/jev/policy-<scenarioId>.json (used offline / when the API fails).
 *
 *   bun run scripts/bake-jev-policy.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { judge } from "../src/lib/ai/typesafe";
import { enumeratePolicySpecs, normaliseDist, actionsForKey, type JevPolicy } from "../src/lib/sim/policy";
import { DEFAULT_INCIDENT_MIX, PERP_KINDS, type PerpKind } from "../src/lib/sim/incidents";
import { defaultScenario, type ScenarioId } from "../src/lib/world/types";

const out = join(process.cwd(), "public", "jev");
mkdirSync(out, { recursive: true });

for (const id of ["typical_night", "low_visibility_night", "high_risk_night"] as ScenarioId[]) {
  const sc = defaultScenario(id);
  const mix = sc.incidentMix ?? DEFAULT_INCIDENT_MIX;
  const kinds = PERP_KINDS.filter((k) => (mix[k] ?? 0) > 0) as PerpKind[];
  const specs = enumeratePolicySpecs(kinds, (sc.guardFatigue ?? 0) > 0);
  const ids = specs.map((_, i) => `s${i}`);
  const questions = Object.fromEntries(specs.map((s, i) => [ids[i], { type: "choice" as const, instructions: s.instructions, criteria: s.criteria }]));
  const state = {
    simulation: "Praesidium — fictional night-time security stress test of a residential society. All actors are synthetic.",
    night: { name: sc.name, description: sc.description, startTime: sc.startTime, ambientVisibility: sc.ambientVisibility, guardFatigue: sc.guardFatigue ?? 0 },
  };
  const r = await judge(state, questions, { timeoutMs: 10000 });
  const table: JevPolicy["table"] = {};
  specs.forEach((s, i) => {
    const a = r.answers[ids[i]];
    if (a?.type === "choice") {
      const d = normaliseDist(a.probabilities, actionsForKey(s.key));
      if (d) table[s.key] = d;
    }
  });
  const policy: JevPolicy = { version: 1, source: "prebaked", model: r.model, createdAt: new Date().toISOString(), table };
  writeFileSync(join(out, `policy-${id}.json`), JSON.stringify(policy, null, 1));
  console.log(`${id}: ${Object.keys(table).length}/${specs.length} situations · ${r.requests} request(s) · ${r.latencyMs} ms · ${r.model}`);
}

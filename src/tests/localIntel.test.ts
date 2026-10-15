import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSimulation } from "@/lib/sim/engine";
import { makeDemoProject } from "@/lib/world/demo";
import { policyCacheKey, type JevPolicy } from "@/lib/sim/policy";
import { compactIntel, intelHash, localTagFor, type LocalIntel } from "@/lib/ai/context";

const intel: LocalIntel = {
  summary: "Busy metro-adjacent colony with evening snatching incidents.",
  riskFactors: [
    { factor: "Chain snatching near metro exits after dusk", evidence: "", sourceIdx: null },
    { factor: "Poorly lit service lanes", evidence: "", sourceIdx: null },
  ],
  incidentMix: { mugger: 0.1, harasser: 0.1, burglar: 0.1, vandal: 0.1, chain_snatcher: 0.6 },
  peakHours: "6-9 pm",
  suggestedScenario: { eventsPerHour: 8, perpCount: 3, guardFatigue: 0.3, lightingOutageFraction: 0.15, ambientVisibility: 0.8 },
  helplines: [],
  sources: [],
  placeName: "Test Colony",
  generatedAt: new Date().toISOString(),
  model: "test",
  grounded: false,
};

describe("Local Intel as shared context", () => {
  const proj = makeDemoProject();
  const sc = proj.scenario;

  it("policy cache key is unchanged without intel and differs with an intel hash", () => {
    const base = policyCacheKey(proj.projectId, sc);
    expect(policyCacheKey(proj.projectId, sc, undefined)).toBe(base);
    expect(policyCacheKey(proj.projectId, sc, "")).toBe(base);
    const c = compactIntel(intel)!;
    const k = policyCacheKey(proj.projectId, sc, intelHash(c));
    expect(k).not.toBe(base);
    const c2 = compactIntel({ ...intel, peakHours: "11 pm-2 am" })!;
    expect(policyCacheKey(proj.projectId, sc, intelHash(c2))).not.toBe(k);
    expect(intelHash(c)).toBe(intelHash(compactIntel(intel)));
  });

  it("matches candidates to local factors in code", () => {
    const c = compactIntel(intel)!;
    expect(localTagFor("light", c)).toMatch(/lit/i);
    expect(localTagFor("camera", c)).toMatch(/metro exits|chain snatching/i);
    expect(localTagFor("light", null)).toBeNull();
    // a pick aimed at a specific incident is tagged with that incident's share, not the top local type
    expect(localTagFor("camera", c, "burglar")).toMatch(/^burglary \(\d+% of local mix\)$/);
  });

  it("demo baseline with the prebaked table is deterministic and independent of intel", () => {
    const pre = JSON.parse(readFileSync(join(__dirname, "../../public/jev/policy-typical_night.json"), "utf8")) as JevPolicy;
    const run = () =>
      runSimulation(proj.world, { ...sc, jevPolicy: pre }).events.filter((e) => e.type !== "scheduled").map((e) => `${e.type}@${Math.round(e.tSec)}`);
    const a = run();
    expect(a).toEqual(run());
    // golden timeline recorded before Local Intel was wired in: must never drift for judges
    expect(a.join(" ")).toBe("chain_snatcher@89 vandalism@94 mugger@314 burglar@1005 vandalism@1167");
    const beats = runSimulation(proj.world, { ...sc, jevPolicy: pre }).beats;
    const wall = beats.find((b) => /wall|climb/i.test(b.line));
    expect(wall && Math.round(wall.tSec)).toBe(44);
  });
});

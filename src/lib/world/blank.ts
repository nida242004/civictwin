import type { PraesidiumProject } from "./types";
import { defaultScenario } from "./types";
import { makeId } from "./ids";

export function makeBlankProject(name = "Untitled Neighborhood"): PraesidiumProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    projectId: makeId("prj"),
    name,
    description: "",
    createdAt: now,
    modifiedAt: now,
    source: { kind: "blank" },
    world: {
      bounds: { width: 320, depth: 240 },
      roads: [],
      buildings: [],
      facilities: [],
      streetlights: [],
      cameras: [],
      guards: [],
    },
    scenario: defaultScenario("typical_night"),
    baselineRun: null,
    interventionRun: null,
  };
}

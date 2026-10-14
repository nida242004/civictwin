/** Smoke test: render the PDF report for the demo + a 2-camera intervention to screenshots/report_smoke.pdf. */
import fs from "fs";
import { makeDemoProject } from "@/lib/world/demo";
import { executeRun } from "@/lib/sim/runner";
import { deepClone } from "@/lib/world/ids";
import { compareRuns } from "@/lib/sim/metrics";
import { ablateSync, headlineDiff } from "@/lib/sim/compare";
import { generateReportPdf } from "@/lib/report/pdf";

const p = makeDemoProject();
const base = executeRun(p.world, p.scenario, "baseline").stored;
const w = deepClone(p.world);
base.events.filter((e) => e.outcome !== "resolved").forEach((e, i) =>
  w.cameras.push({ id: `cam_x${i}`, x: e.x + 6, z: e.z + 6, height: 6.5, range: 30, fovDeg: 120, orientationDeg: 225, active: true })
);
w.streetlights.push({ id: "sl_x", x: 0, z: 0, height: 8, brightness: 0.9, radius: 18, on: true, maintenance: "ok" });
const int = executeRun(w, { ...p.scenario, seed: base.seed }, "intervention", p.world).stored;
const doc = generateReportPdf({
  project: { ...p, baselineRun: base, interventionRun: int },
  baseline: base,
  intervention: int,
  comparison: compareRuns(base.metrics, int.metrics),
  ablation: ablateSync(base, int),
  headline: headlineDiff(base, int),
  generatedAt: new Date().toISOString(),
}, { download: false });
fs.writeFileSync("screenshots/report_smoke.pdf", Buffer.from(doc.output("arraybuffer")));
console.log("ok", fs.statSync("screenshots/report_smoke.pdf").size);

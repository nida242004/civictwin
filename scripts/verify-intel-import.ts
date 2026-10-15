import puppeteer from "puppeteer-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1500,920"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 920 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 90000 });
await sleep(1500);
const clickText = (t: string) =>
  page.evaluate((t) => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").includes(t));
    (b as HTMLElement | undefined)?.click();
    return !!b;
  }, t);
await clickText("Launch demo");
await sleep(1500);

// 1) demo: run baseline, record incident timeline + policy
await clickText("Run simulation");
await page.waitForFunction(() => !!(window as any).__praesidiumEditor.getState().project.baselineRun, { timeout: 60000 });
const demo = await page.evaluate(() => {
  const p = (window as any).__praesidiumEditor.getState().project;
  const b = p.baselineRun;
  return {
    policy: b.scenario.jevPolicy?.source,
    key: b.scenario.jevPolicy?.key,
    timeline: b.events.filter((e: any) => e.type !== "scheduled").map((e: any) => `${e.type}@${Math.round(e.tSec)}`).join(" "),
  };
});
console.log("DEMO", JSON.stringify(demo));

// 2) a sample society at a Delhi NCR location
await page.evaluate(() => {
  const ed = (window as any).__praesidiumEditor;
  const p = structuredClone(ed.getState().project);
  p.projectId = "prj_intel_test";
  p.name = "Sample Society (Dwarka)";
  p.baselineRun = null;
  p.interventionRun = null;
  p.scenario.jevPolicy = undefined;
  p.source = { kind: "osm", geo: { lat: 28.5921, lng: 77.046, bbox: [28.59, 28.594, 77.044, 77.048], placeName: "Dwarka Sector 10, Delhi" } };
  ed.getState().openProject(p);
});
await page.waitForFunction(() => /Local context: .*(grounded|ungrounded)/.test(document.body.innerText) || true, { timeout: 5000 });
await page.evaluate(() => (window as any).__praesidiumEditor.getState().setAssistantOpen(true));
await page.waitForFunction(() => /Dwarka.*(grounded|ungrounded)/i.test(document.querySelector('[data-testid="intel-chip"]')?.textContent ?? ""), { timeout: 120000 });
console.log("chip:", await page.$eval('[data-testid="intel-chip"]', (e) => e.textContent));
await page.evaluate(() => (window as any).__praesidiumEditor.getState().setAssistantOpen(false));
await clickText("Run simulation");
await page.waitForFunction(() => !!(window as any).__praesidiumEditor.getState().project.baselineRun, { timeout: 90000 });
const imp = await page.evaluate(() => {
  const pol = (window as any).__praesidiumEditor.getState().project.baselineRun.scenario.jevPolicy;
  return { source: pol?.source, key: pol?.key, intelHash: pol?.intelHash, entries: pol ? Object.keys(pol.table).length : 0 };
});
console.log("IMPORTED", JSON.stringify(imp));
await browser.close();

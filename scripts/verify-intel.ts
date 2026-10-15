import puppeteer from "puppeteer-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1500,920"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 920 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
const apiLog: string[] = [];
page.on("request", (r) => {
  if (r.url().includes("/api/ai/")) apiLog.push(`${r.url().split("/api/")[1]} ${(r.postData() ?? "").includes('"local') ? "[+local]" : ""}`);
});
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
const t0 = Date.now();
await page.waitForSelector('[data-testid="intel-chip"], aside', { timeout: 5000 }).catch(() => {});
await page.evaluate(() => (window as any).__praesidiumEditor.getState().setAssistantOpen(true));
await page.waitForFunction(() => /Local context: .*(grounded|ungrounded)/.test(document.querySelector('[data-testid="intel-chip"]')?.textContent ?? ""), { timeout: 120000 });
console.log("chip:", await page.$eval('[data-testid="intel-chip"]', (e) => e.textContent), `after ${Date.now() - t0} ms`);
console.log("baseline clicked:", await clickText("Run simulation"));
await page.waitForFunction(() => !!(window as any).__praesidiumEditor.getState().project.baselineRun, { timeout: 60000 }).catch(() => console.log("no baseline"));
await page.evaluate(() => (window as any).__praesidiumEditor.setState({ resultsOpen: false }));
await page.evaluate(() => (window as any).__praesidiumEditor.getState().setAssistantOpen(true));
await sleep(800);
const q0 = Date.now();
await clickText("Quick picks");
await page.waitForSelector('[data-testid="local-tag"]', { timeout: 30000 }).catch(() => console.log("no local tags"));
console.log("quickpicks ms:", Date.now() - q0, "tags:", await page.$$eval('[data-testid="local-tag"]', (e) => e.map((x) => x.textContent)));
await sleep(2500);
await page.screenshot({ path: "screenshots/local_intel_chip_quickpicks.png" });
await clickText("Ask Gemini to explain");
await page.waitForFunction(() => /proposed operations/i.test(document.body.innerText), { timeout: 60000 }).catch(() => console.log("no proposal"));
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("aside p")).find((p) => p.className.includes("leading-relaxed") && p.className.includes("mt-1.5"));
  el?.scrollIntoView();
});
await sleep(500);
console.log("rationale:", await page.evaluate(() => (Array.from(document.querySelectorAll("aside p")).find((p) => p.className.includes("mt-1.5") && p.className.includes("leading-relaxed")) as HTMLElement | undefined)?.innerText));
await page.screenshot({ path: "screenshots/local_intel_proposal.png" });
console.log("api calls:", apiLog.join(" | "));
await browser.close();


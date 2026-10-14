/**
 * Measure voice latency in the headless browser.
 * Usage: bun scripts/voice-latency.ts [seconds=90] [speed=1]
 * Requires the dev server on http://localhost:3000. Prints window.__praesidiumVoiceLog.
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const secs = Number(process.argv[2] ?? 90);
const speed = Number(process.argv[3] ?? 1);

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1500,920", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 920 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.evaluateOnNewDocument(() => {
  (window as any).__praesidiumVoiceDebug = true;
});
await page.goto(BASE, { waitUntil: "networkidle2", timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
const click = (t: string) =>
  page.evaluate((t) => {
    const el = (Array.from(document.querySelectorAll("button, a, [role=button]")) as HTMLElement[]).find((e) => (e.textContent ?? "").includes(t));
    el?.click();
    return Boolean(el);
  }, t);
console.log("launch", await click("Launch live demo"));
await new Promise((r) => setTimeout(r, 3000));
console.log("run", await click("Run simulation"));
await new Promise((r) => setTimeout(r, 2500));
// close results dialog, set speed via store hook if exposed
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 500));
await new Promise((r) => setTimeout(r, secs * 1000));
const log = await page.evaluate(() => (window as any).__praesidiumVoiceLog ?? []);
console.log("entries", log.length);
for (const e of log) console.log(`beat@${e.beatT.toFixed(1)} clock@${e.clockT.toFixed(2)} late=${e.lateMs.toFixed(0)}ms handler=${e.handlerMs.toFixed(2)}ms ${e.mode}${e.reason ? "(" + e.reason + ")" : ""} sev${e.sev}`);
const buf = log.filter((e: any) => e.mode === "buffer");
if (buf.length) {
  const l = buf.map((e: any) => e.lateMs).sort((a: number, b: number) => a - b);
  console.log(`buffer starts: n=${buf.length} median late=${l[Math.floor(l.length / 2)].toFixed(0)}ms max=${l[l.length - 1].toFixed(0)}ms; handler max=${Math.max(...buf.map((e: any) => e.handlerMs)).toFixed(2)}ms`);
}
await browser.close();
void speed;

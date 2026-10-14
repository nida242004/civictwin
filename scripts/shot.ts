/**
 * Quick screenshot helper for dev verification.
 * Usage: bun scripts/shot.ts <out.png> [step ...]
 *   step = "click:<button text>" | "wait:<ms>" | "goto:<path>" | "eval:<js>"
 * Requires the dev server on http://localhost:3000 (override with BASE_URL).
 */
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const [out = "screenshots/shot.png", ...steps] = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1500,920"],
});
const page = await browser.newPage();
// VIEWPORT=390x844 for phone checks
const [vw, vh] = (process.env.VIEWPORT ?? "1500x920").split("x").map(Number);
await page.setViewport({ width: vw, height: vh, isMobile: vw < 800, hasTouch: vw < 800 });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.goto(BASE, { waitUntil: "networkidle2", timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));

for (const step of steps) {
  const [kind, ...rest] = step.split(":");
  const arg = rest.join(":");
  if (kind === "wait") await new Promise((r) => setTimeout(r, Number(arg)));
  else if (kind === "goto") await page.goto(BASE + arg, { waitUntil: "networkidle2", timeout: 90000 });
  else if (kind === "eval") console.log("[eval]", await page.evaluate(arg));
  else if (kind === "click") {
    const ok = await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll("button, a, [role=button], [role=tab]")) as HTMLElement[];
      const el = els.find((e) => (e.textContent ?? "").trim().includes(t));
      if (el) el.click();
      return Boolean(el);
    }, arg);
    console.log(`[click] "${arg}" ${ok ? "ok" : "NOT FOUND"}`);
    await new Promise((r) => setTimeout(r, 800));
  }
}

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
await page.screenshot({ path: out });
console.log("saved", out);
await browser.close();

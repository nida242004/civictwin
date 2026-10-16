/**
 * Screenshots of the import map picker (base layers, rotated rectangle,
 * polygon) and the editor tour. Requires the dev server on :3000.
 * Usage: bun scripts/shot-picker.ts <outDir>
 */
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "screenshots/picker";
fs.mkdirSync(out, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1500,920"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 920 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => m.type() === "error" && console.log("[console.error]", m.text().slice(0, 200)));

const click = async (text: string) => {
  const ok = await page.evaluate((t) => {
    const els = Array.from(document.querySelectorAll("button")) as HTMLElement[];
    const el = els.find((e) => (e.textContent ?? "").trim().includes(t));
    el?.click();
    return !!el;
  }, text);
  console.log(`[click] ${text}: ${ok ? "ok" : "NOT FOUND"}`);
  await sleep(600);
};
const shot = async (name: string) => {
  const p = path.join(out, name);
  await page.screenshot({ path: p });
  console.log("saved", p);
};

await page.goto(BASE, { waitUntil: "networkidle2", timeout: 90000 });
await sleep(1200);
await click("Build my society");
await sleep(5000);
await shot("picker-satellite.png");

await click("Map");
await sleep(3500);
await shot("picker-map.png");

await click("Hybrid");
await sleep(3500);

// drag the rotation handle (↻) ~35° clockwise around the move handle (✥)
const handle = async (glyph: string) =>
  page.evaluate((g) => {
    const el = Array.from(document.querySelectorAll(".leaflet-marker-icon")).find((e) => (e.textContent ?? "").includes(g)) as HTMLElement | undefined;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, glyph);
const rot = await handle("↻");
const ctr = await handle("✥");
// leaflet divIcons have 0×0 boxes; the visible circle is offset by its negative margins → aim at the child
const child = async (glyph: string) =>
  page.evaluate((g) => {
    const el = Array.from(document.querySelectorAll(".leaflet-marker-icon > div")).find((e) => (e.textContent ?? "").includes(g)) as HTMLElement | undefined;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, glyph);
const r0 = (await child("↻")) ?? rot;
const c0 = (await child("✥")) ?? ctr;
if (r0 && c0) {
  const R = Math.hypot(r0.x - c0.x, r0.y - c0.y);
  const a = (-90 + 35) * (Math.PI / 180);
  await page.mouse.move(r0.x, r0.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const t = -Math.PI / 2 + ((a + Math.PI / 2) * i) / 10;
    await page.mouse.move(c0.x + R * Math.cos(t), c0.y + R * Math.sin(t));
    await sleep(30);
  }
  await page.mouse.up();
  console.log("rotated");
} else console.log("rotation handle NOT FOUND");
await sleep(1200);
await shot("picker-hybrid-rotated.png");

// polygon: switch, then redraw a 6-point outline by clicking the map
await click("Polygon");
await sleep(800);
await click("Redraw outline");
const box = await page.evaluate(() => {
  const el = document.querySelector(".leaflet-container") as HTMLElement;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
const cx = box.x + box.w / 2;
const cy = box.y + box.h / 2;
const pts = [
  [-150, -110],
  [60, -140],
  [170, -30],
  [120, 120],
  [-40, 150],
  [-170, 40],
];
for (const [dx, dy] of pts) {
  await page.mouse.click(cx + dx, cy + dy);
  await sleep(250);
}
await sleep(400);
await shot("picker-polygon-drawing.png");
await click("Done");
await sleep(1000);
await shot("picker-polygon.png");

await browser.close();

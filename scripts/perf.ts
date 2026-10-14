/**
 * Initial-load perf probe. Usage: BASE_URL=http://localhost:3100 bun scripts/perf.ts
 * Reports JS bytes (decoded/transfer), request count, FCP, LCP, load, and
 * time until the "Launch live demo" button is present and clickable.
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 920 });
const jsSizes: Record<string, number> = {};
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
const urls: Record<string, string> = {};
cdp.on("Network.responseReceived", (e: any) => {
  urls[e.requestId] = e.response.url;
});
cdp.on("Network.loadingFinished", (e: any) => {
  const u = urls[e.requestId];
  if (u && /\.js(\?|$)/.test(u)) jsSizes[u] = e.encodedDataLength;
});
await page.evaluateOnNewDocument(() => {
  (window as any).__lcp = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) (window as any).__lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
});
const t0 = Date.now();
await page.goto(BASE, { waitUntil: "load", timeout: 90000 });
await page.waitForFunction(
  () => Array.from(document.querySelectorAll("button")).some((b) => /Launch live demo/i.test(b.textContent ?? "")),
  { timeout: 90000 },
);
const tInteractive = Date.now() - t0;
await new Promise((r) => setTimeout(r, 3000));
const m = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
  return { fcp, lcp: (window as any).__lcp, load: nav.loadEventEnd, dcl: nav.domContentLoadedEventEnd };
});
const total = Object.values(jsSizes).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ ...m, buttonReadyMs: tInteractive, jsFiles: Object.keys(jsSizes).length, jsTransferKB: Math.round(total / 1024) }));
if (process.env.LIST) for (const [u, s] of Object.entries(jsSizes).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(Math.round(s / 1024), u.split("/").pop());
await browser.close();

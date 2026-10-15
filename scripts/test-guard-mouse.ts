import puppeteer from "puppeteer-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1500,920"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 920 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 90000 });
await sleep(1500);
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").includes("Launch demo"));
  (b as HTMLElement | undefined)?.click();
});
await sleep(2500);
const state = () =>
  page.evaluate(() => {
    const s = (window as any).__praesidiumEditor.getState();
    return { tool: s.tool, mode: s.mode, sel: s.selection, guards: s.project.world.guards.map((g: any) => g.waypoints.length), hint: s.canvasHint };
  });
await page.keyboard.press("g");
await sleep(500);
console.log("start", JSON.stringify(await state()));

// left click with no guard selected -> hint
await page.mouse.click(700, 500);
await sleep(300);
console.log("left-click no guard", JSON.stringify(await state()));
await page.screenshot({ path: "screenshots/guard_mouse_0_hint.png" });

// right drag must not drop guard
await page.mouse.move(700, 500);
await page.mouse.down({ button: "right" });
await page.mouse.move(760, 520, { steps: 6 });
await page.mouse.up({ button: "right" });
await sleep(300);
console.log("after right drag", JSON.stringify(await state()));

// right click drops guard
await page.mouse.move(800, 520);
await page.mouse.down({ button: "right" });
await page.mouse.up({ button: "right" });
await sleep(400);
console.log("after right click", JSON.stringify(await state()));

// left clicks add stops
for (const [x, y] of [[900, 560], [950, 480], [820, 430]]) {
  await page.mouse.click(x, y);
  await sleep(300);
  console.log("  click", x, y, JSON.stringify(await state()));
}
console.log("after 3 left clicks", JSON.stringify(await state()));

// left drag pans (no stop added)
await page.mouse.move(600, 600);
await page.mouse.down();
await page.mouse.move(680, 640, { steps: 6 });
await page.mouse.up();
await sleep(300);
console.log("after left drag", JSON.stringify(await state()));
await page.screenshot({ path: "screenshots/guard_mouse_1_route.png" });

await page.keyboard.press("Backspace");
await sleep(200);
console.log("after backspace", JSON.stringify(await state()));
await page.keyboard.press("Enter");
await sleep(200);
console.log("after enter", JSON.stringify(await state()));
await page.keyboard.press("Escape");
await sleep(200);
console.log("after esc", JSON.stringify(await state()));
await browser.close();


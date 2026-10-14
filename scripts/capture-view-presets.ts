import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function findButtonByText(page: puppeteer.Page, matchText: string) {
  const buttons = await page.$$("button");
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes(matchText)) return b;
  }
  return null;
}

async function captureViews() {
  console.log("=== Testing and Capturing View Presets (Isometric, Road View, Top-down) ===");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1500,920"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 920 });

  await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  const demoBtn = await findButtonByText(page, "Explore the demo neighborhood");
  if (demoBtn) {
    await demoBtn.click();
    await new Promise((r) => setTimeout(r, 2000));
  }

  const screenshotsDir = path.resolve("./screenshots");
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  // 1. Capture default Isometric
  await page.screenshot({ path: path.join(screenshotsDir, "19_view_isometric.png") });
  console.log("Captured 19_view_isometric.png");

  // 2. Click Road view
  const roadViewBtn = await findButtonByText(page, "Road view");
  if (roadViewBtn) {
    console.log("Clicking 'Road view' button...");
    await roadViewBtn.click();
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(screenshotsDir, "20_view_road_level.png") });
    console.log("Captured 20_view_road_level.png");
  } else {
    console.error("Road view button not found!");
  }

  // 3. Click Top-down
  const topdownBtn = await findButtonByText(page, "Top-down");
  if (topdownBtn) {
    console.log("Clicking 'Top-down' button...");
    await topdownBtn.click();
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(screenshotsDir, "21_view_topdown.png") });
    console.log("Captured 21_view_topdown.png");
  } else {
    console.error("Top-down button not found!");
  }

  // 4. Click Reset view to return to Isometric
  const resetBtn = await findButtonByText(page, "Reset view");
  if (resetBtn) {
    console.log("Clicking 'Reset view' button...");
    await resetBtn.click();
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(screenshotsDir, "22_view_reset_confirmed.png") });
    console.log("Captured 22_view_reset_confirmed.png");
  }

  await browser.close();
  console.log("✓ View preset captures complete!");
}

captureViews().catch((err) => {
  console.error("Error capturing views:", err);
  process.exit(1);
});

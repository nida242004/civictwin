import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function findButtonByText(page: puppeteer.Page, matchText: string): Promise<puppeteer.ElementHandle<HTMLButtonElement> | null> {
  const buttons = await page.$$("button");
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes(matchText)) {
      return b as puppeteer.ElementHandle<HTMLButtonElement>;
    }
  }
  return null;
}

async function captureThemes() {
  console.log("=== Capturing High-Fidelity 3D Visual Themes via Edge ===");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1500,920"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 920 });

  const screenshotsDir = path.resolve("./screenshots");
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  try {
    console.log("Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 30000 });

    // Open demo neighborhood
    const demoBtn = await findButtonByText(page, "Explore the demo neighborhood");
    if (!demoBtn) throw new Error("Could not find demo button");
    await demoBtn.click();

    console.log("Waiting for 3D canvas...");
    await page.waitForSelector("canvas", { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 3000));

    // 1. Capture Night Digital Twin mode
    console.log("Capturing 15_theme_night_digital_twin.png...");
    await page.screenshot({ path: path.join(screenshotsDir, "15_theme_night_digital_twin.png") });

    // 2. Toggle Coverage Heatmap
    const coverageCheckbox = await page.$("input[type='checkbox']:nth-of-type(3)");
    const labels = await page.$$("label");
    for (const l of labels) {
      const text = await page.evaluate((el) => el.textContent, l);
      if (text && text.includes("Coverage heat overlay")) {
        const cb = await l.$("input[type='checkbox']");
        if (cb) await cb.click();
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
    console.log("Capturing 16_theme_coverage_heatmap.png...");
    await page.screenshot({ path: path.join(screenshotsDir, "16_theme_coverage_heatmap.png") });

    // 3. Switch to Sunset / Golden Hour
    const sunsetBtn = await findButtonByText(page, "Sunset");
    if (sunsetBtn) {
      await sunsetBtn.click();
      await new Promise((r) => setTimeout(r, 1200));
      console.log("Capturing 17_theme_sunset.png...");
      await page.screenshot({ path: path.join(screenshotsDir, "17_theme_sunset.png") });
    }

    // 4. Switch to Daylight Architectural
    const dayBtn = (await findButtonByText(page, "Daylight")) || (await findButtonByText(page, "Day"));
    if (dayBtn) {
      await dayBtn.click();
      await new Promise((r) => setTimeout(r, 1200));
      console.log("Capturing 18_theme_daylight.png...");
      await page.screenshot({ path: path.join(screenshotsDir, "18_theme_daylight.png") });
    }

    console.log("✓ All visual themes captured successfully!");
  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    await browser.close();
  }
}

captureThemes();

import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function findButtonByText(page: puppeteer.Page, matchText: string) {
  const buttons = await page.$$("button");
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes(matchText)) return b;
  }
  return null;
}

async function testRoad() {
  console.log("=== Testing Road Drawing and Visual Contrast ===");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1500,920"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 920 });

  const consoleLogs: string[] = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err: any) => consoleLogs.push(`[PAGE ERROR] ${err.message}`));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));

  const demoBtn = await findButtonByText(page, "Explore the demo neighborhood");
  if (demoBtn) {
    console.log("Opening demo...");
    await demoBtn.click();
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 1. Screenshot initial roads in Night mode (check if roads, curbs, markings are clearly visible)
  await page.screenshot({ path: "screenshots/road_enhanced_1_night_initial.png" });

  // 2. Select Road Tool
  console.log("Selecting 'Road or path' tool...");
  const roadToolBtn = await findButtonByText(page, "Road or path");
  if (roadToolBtn) {
    await roadToolBtn.click();
    await new Promise((r) => setTimeout(r, 500));
  }

  // Check if RoadDrawingHUD appears
  const hudText = await page.evaluate(() => {
    return document.querySelector(".animate-in")?.textContent ?? "no hud";
  });
  console.log("HUD text:", hudText);

  // 3. Move mouse to start point and click (open area around x=850, y=550)
  console.log("Adding road point 1...");
  await page.mouse.move(850, 550);
  await page.mouse.click(850, 550);
  await new Promise((r) => setTimeout(r, 400));

  console.log("Adding road point 2...");
  await page.mouse.move(950, 500);
  await page.mouse.click(950, 500);
  await new Promise((r) => setTimeout(r, 400));

  // Move mouse to show live rubberband preview
  await page.mouse.move(1020, 600);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: "screenshots/road_enhanced_2_drafting_active.png" });

  // 4. Click Finish Road in the HUD
  console.log("Finishing road via HUD button...");
  const finishBtn = await findButtonByText(page, "Finish Road");
  if (finishBtn) {
    await finishBtn.click();
    await new Promise((r) => setTimeout(r, 1000));
  } else {
    console.log("Pressing Enter to finish road...");
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 1000));
  }

  await page.screenshot({ path: "screenshots/road_enhanced_3_committed_selected.png" });

  // Check state
  const stateInfo = await page.evaluate(() => {
    const s = (window as any).__praesidiumEditor?.getState?.();
    return {
      roadCount: s?.project?.world?.roads?.length,
      selection: s?.selection,
      tool: s?.tool,
    };
  });
  console.log("State after drawing road:", stateInfo);

  // 5. Test Sunset and Daylight themes to ensure roads are crisp in all lighting conditions
  console.log("Switching to Sunset...");
  const sunsetBtn = await findButtonByText(page, "Sunset");
  if (sunsetBtn) {
    await sunsetBtn.click();
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: "screenshots/road_enhanced_4_sunset.png" });
  }

  console.log("Switching to Daylight...");
  const daylightBtn = await findButtonByText(page, "Daylight");
  if (daylightBtn) {
    await daylightBtn.click();
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: "screenshots/road_enhanced_5_daylight.png" });
  }

  console.log("Console errors/warnings:");
  const errs = consoleLogs.filter((l) => l.includes("error") || l.includes("ERROR"));
  if (errs.length === 0) console.log("None!");
  else errs.forEach((l) => console.log(l));

  await browser.close();
  console.log("All road tests complete!");
}

testRoad().catch((err) => {
  console.error("Error in testRoad:", err);
  process.exit(1);
});

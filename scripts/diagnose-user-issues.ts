import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function diagnose() {
  console.log("=== Diagnosing user issues on http://localhost:3000 ===");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1500,920"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 920 });

  const consoleLogs: string[] = [];
  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err: any) => {
    consoleLogs.push(`[PAGE ERROR] ${err.message}\n${err.stack}`);
  });

  await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Find demo button if on welcome screen
  const buttons = await page.$$("button");
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes("Explore the demo neighborhood")) {
      console.log("Clicking 'Explore the demo neighborhood'...");
      await b.click();
      await new Promise((r) => setTimeout(r, 2000));
      break;
    }
  }

  // 1. Check Reset view button
  console.log("Testing 'Reset view' button...");
  let resetBtn: puppeteer.ElementHandle<HTMLButtonElement> | null = null;
  const currentButtons = await page.$$("button");
  for (const b of currentButtons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes("Reset view")) {
      resetBtn = b as any;
      break;
    }
  }

  if (resetBtn) {
    console.log("Found Reset view button. Clicking it...");
    await resetBtn.click();
    await new Promise((r) => setTimeout(r, 1000));
    console.log("Reset view clicked without crashing.");
  } else {
    console.log("Reset view button NOT found!");
  }

  // 2. Test selecting a road: click on canvas where roads are
  console.log("Testing canvas click to select road or object...");
  const canvas = await page.$("canvas");
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      console.log(`Canvas found at (${box.x}, ${box.y}) size (${box.width}x${box.height})`);
      // Click near center
      await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.48);
      await new Promise((r) => setTimeout(r, 1000));

      // Check what is in the Inspector aside
      const asides = await page.$$("aside");
      if (asides.length > 1) {
        const inspectorText = await page.evaluate((el) => el.innerText, asides[1]);
        console.log("Inspector text after center click:\n", inspectorText.slice(0, 300));
      }
    }
  }

  // 3. Test placing streetlight
  console.log("Testing streetlight placement on road...");
  const allButtons = await page.$$("button");
  for (const b of allButtons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes("Streetlight")) {
      console.log("Selecting Streetlight tool...");
      await b.click();
      await new Promise((r) => setTimeout(r, 500));
      break;
    }
  }

  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      console.log("Clicking on road area to place streetlight...");
      await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.48);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 4. Test road tool
  console.log("Testing road tool...");
  const roadButtons = await page.$$("button");
  for (const b of roadButtons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes("Road or path")) {
      console.log("Selecting Road or path tool...");
      await b.click();
      await new Promise((r) => setTimeout(r, 500));
      break;
    }
  }

  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      console.log("Clicking 2 points to draw road...");
      await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);
      await new Promise((r) => setTimeout(r, 400));
      await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.38);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log("Console errors/warnings captured during diagnosis:");
  const errs = consoleLogs.filter((l) => l.includes("error") || l.includes("ERROR") || l.includes("warn"));
  if (errs.length === 0) {
    console.log("None!");
  } else {
    errs.forEach((l) => console.log(l));
  }

  await page.screenshot({ path: "screenshots/diagnosis_test.png" });
  await browser.close();
  console.log("Diagnosis complete.");
}

diagnose().catch((err) => {
  console.error("Diagnosis error:", err);
  process.exit(1);
});

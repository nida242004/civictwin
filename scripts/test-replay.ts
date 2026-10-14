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

async function testReplay() {
  console.log("=== Testing 'Replay this run in the 3D view' ===");
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

  // Click 'Run simulation'
  console.log("Clicking 'Run simulation'...");
  const runSimBtn = await findButtonByText(page, "Run simulation");
  if (runSimBtn) {
    await runSimBtn.click();
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Check if Results dialog is open
  const resultsDialog = await page.$("[role='dialog']");
  console.log("Is Results dialog open?", !!resultsDialog);

  if (resultsDialog) {
    await page.screenshot({ path: "screenshots/replay_test_1_results_open.png" });

    const replayBtn = await findButtonByText(page, "Replay this run in the 3D view") ?? await findButtonByText(page, "Load this run in the 3D view");
    if (replayBtn) {
      const btnText = await page.evaluate((el) => el.textContent, replayBtn);
      console.log(`Found button: '${btnText?.trim()}'`);
      console.log("Clicking 'Replay this run in the 3D view' button...");
      await replayBtn.click();
      await new Promise((r) => setTimeout(r, 1500));

      const isDialogStillOpen = await page.$("[role='dialog']");
      console.log("Is dialog STILL open after clicking replay?", !!isDialogStillOpen);

      await page.screenshot({ path: "screenshots/replay_test_2_after_click.png" });
    } else {
      console.error("Replay button not found in dialog!");
    }
  }

  console.log("Console errors/warnings:");
  const errs = consoleLogs.filter((l) => l.includes("error") || l.includes("ERROR"));
  if (errs.length === 0) console.log("None!");
  else errs.forEach((l) => console.log(l));

  await browser.close();
  console.log("Replay test complete.");
}

testReplay().catch((err) => {
  console.error("Error testing replay:", err);
  process.exit(1);
});

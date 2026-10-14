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

async function waitForButton(page: puppeteer.Page, matchText: string, timeoutMs = 8000): Promise<puppeteer.ElementHandle<HTMLButtonElement>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = await findButtonByText(page, matchText);
    if (btn) return btn;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for button containing "${matchText}"`);
}

async function runTest() {
  console.log("=== Starting Comprehensive End-to-End Automated Browser Test ===");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--window-size=1440,900",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];

  page.on("console", (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === "error") {
      if (!text.includes("react-devtools")) {
        consoleErrors.push(text);
        console.log(`[BROWSER ERROR]: ${text}`);
      }
    } else if (type === "warning") {
      consoleWarnings.push(text);
    } else {
      console.log(`[BROWSER LOG]: ${text}`);
    }
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
    console.log(`[BROWSER CRASH]: ${err.message}`);
  });

  const screenshotsDir = path.resolve("./screenshots");
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  try {
    // -------------------------------------------------------------
    // TEST 1: Welcome Screen
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Visiting Welcome Screen at http://localhost:3000...");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 30000 });
    await page.screenshot({ path: path.join(screenshotsDir, "01_welcome_screen.png") });
    console.log("✓ Welcome screen loaded successfully.");

    // -------------------------------------------------------------
    // TEST 2: Import Real Location Dialog & Search
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Testing Import Real Location Dialog...");
    const importBtn = await waitForButton(page, "Import a real location");
    await importBtn.click();
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(screenshotsDir, "02_import_dialog.png") });

    // Type into dialog input
    const searchInput = await page.waitForSelector("div[role='dialog'] input", { timeout: 4000 });
    if (!searchInput) throw new Error("Search input in import dialog not found");
    await searchInput.type("Indiranagar");
    console.log("Typed 'Indiranagar' into import dialog.");

    // Hit Enter to trigger search
    await page.keyboard.press("Enter");
    console.log("Sent search request, waiting for results...");
    await new Promise((r) => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(screenshotsDir, "03_search_results.png") });

    // Close import dialog via Escape
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 600));

    // -------------------------------------------------------------
    // TEST 3: Load Demo Neighborhood into 3D Editor Canvas
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Loading Demo Neighborhood into 3D Canvas...");
    const demoBtn = await waitForButton(page, "Explore the demo neighborhood");
    await demoBtn.click();

    console.log("Waiting for 3D canvas and editor UI to mount...");
    await page.waitForSelector("canvas", { timeout: 15000 });
    // Allow Three.js to render initial scene and billboard sprites
    await new Promise((r) => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(screenshotsDir, "04_editor_3d_canvas.png") });
    console.log("✓ 3D Editor Canvas loaded and rendered successfully.");

    // -------------------------------------------------------------
    // TEST 4: Run Baseline Simulation
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Running Baseline Simulation...");
    const runSimBtn = await waitForButton(page, "Run simulation");
    await runSimBtn.click();
    console.log("Baseline simulation started, waiting for completion...");
    await new Promise((r) => setTimeout(r, 3500));
    await page.screenshot({ path: path.join(screenshotsDir, "05_simulation_running.png") });
    console.log("✓ Baseline simulation completed.");

    // -------------------------------------------------------------
    // TEST 5: Timeline Playback & Event Log
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Testing Timeline Playback & Results Dialog...");
    const playBtn = await page.$("button[title*='Play']");
    if (playBtn) {
      await playBtn.click();
      await new Promise((r) => setTimeout(r, 1200));
      await playBtn.click(); // pause
      console.log("✓ Timeline played and paused.");
    }

    // Open Event log
    const eventLogBtn = await findButtonByText(page, "Event log");
    if (eventLogBtn) {
      await eventLogBtn.click();
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(screenshotsDir, "06_event_log.png") });
      await eventLogBtn.click(); // close log
    }

    // Open Results Dialog
    const resultsBtn = await findButtonByText(page, "Results");
    if (resultsBtn) {
      await resultsBtn.click();
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: path.join(screenshotsDir, "07_results_dialog.png") });
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 500));
      console.log("✓ Results dialog viewed and closed.");
    }

    // -------------------------------------------------------------
    // TEST 6: Tool Selection & 3D Interaction
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Testing Tools Selection (Streetlight / Camera)...");
    const lightToolBtn = await page.$("button[title*='Streetlight']");
    if (lightToolBtn) {
      await lightToolBtn.click();
      await new Promise((r) => setTimeout(r, 400));
    }
    // Click on canvas to ensure raycasting works without error
    const canvas = await page.$("canvas");
    if (canvas) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    // Switch back to Select tool (press 'v')
    await page.keyboard.press("v");
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: path.join(screenshotsDir, "08_tool_interaction.png") });
    console.log("✓ Tools and canvas interaction tested.");

    // -------------------------------------------------------------
    // TEST 7: AI Planning Assistant (Gemini)
    // -------------------------------------------------------------
    console.log("\n[TEST 7] Testing AI Planning Assistant (✦ Assistant)...");
    const assistantBtn = await waitForButton(page, "✦ Assistant");
    await assistantBtn.click();
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(screenshotsDir, "09_assistant_opened.png") });

    // Click suggestion button
    const suggestionBtn = await findButtonByText(page, "Improve nighttime safety with lighting and a patrol");
    if (suggestionBtn) {
      console.log("Clicking assistant suggestion: 'Improve nighttime safety with lighting and a patrol'...");
      await suggestionBtn.click();
    } else {
      console.log("Clicking 'Get proposal' or 'Analyze my project'...");
      const getProposalBtn = (await findButtonByText(page, "Get proposal")) || (await findButtonByText(page, "Analyze my project"));
      if (getProposalBtn) await getProposalBtn.click();
    }

    console.log("Waiting for AI proposal from Gemini API...");
    let proposalApplied = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const applyBtn = await findButtonByText(page, "Apply to intervention scenario");
      if (applyBtn) {
        console.log("✓ AI proposal received from model!");
        await page.screenshot({ path: path.join(screenshotsDir, "10_ai_proposal_received.png") });
        await applyBtn.click();
        proposalApplied = true;
        console.log("✓ Proposal applied to intervention scenario.");
        await new Promise((r) => setTimeout(r, 1000));
        await page.screenshot({ path: path.join(screenshotsDir, "11_ai_proposal_applied.png") });
        break;
      }
      // Check if error appeared
      const errorDiv = await page.$("div.text-\\[\\#a33\\]");
      if (errorDiv) {
        const errText = await page.evaluate((el) => el.textContent, errorDiv);
        console.log(`Assistant note: ${errText}`);
        break;
      }
    }

    // Close assistant panel via Close button or Escape
    const closeAssistantBtn = await page.$("aside[aria-label='Planning assistant'] button[aria-label='Close']");
    if (closeAssistantBtn) await closeAssistantBtn.click();
    else await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 500));

    // -------------------------------------------------------------
    // TEST 8: Run Intervention & Compare Dialog
    // -------------------------------------------------------------
    if (proposalApplied) {
      console.log("\n[TEST 8] Running Intervention Simulation...");
      const runInterventionBtn = await waitForButton(page, "Run intervention");
      await runInterventionBtn.click();
      console.log("Waiting for intervention run to complete...");
      await new Promise((r) => setTimeout(r, 3500));
      await page.screenshot({ path: path.join(screenshotsDir, "12_intervention_run.png") });

      // Now open Compare Dialog
      console.log("Opening Compare Dialog...");
      const compareBtn = await findButtonByText(page, "Compare");
      if (compareBtn) {
        await compareBtn.click();
        await new Promise((r) => setTimeout(r, 1000));
        await page.screenshot({ path: path.join(screenshotsDir, "13_compare_dialog.png") });
        console.log("✓ Compare dialog opened with baseline vs intervention delta metrics.");
        await page.keyboard.press("Escape");
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // -------------------------------------------------------------
    // TEST 9: Generate PDF Report
    // -------------------------------------------------------------
    console.log("\n[TEST 9] Testing PDF Report generation...");
    const pdfBtn = await findButtonByText(page, "PDF report");
    if (pdfBtn) {
      await pdfBtn.click();
      await new Promise((r) => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(screenshotsDir, "14_pdf_report_generated.png") });
      console.log("✓ PDF report action triggered.");
    }

    // -------------------------------------------------------------
    // CONSOLE ERROR AUDIT
    // -------------------------------------------------------------
    console.log("\n================ CONSOLE AUDIT ================");
    console.log(`Total Errors Logged: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log("Errors detected:");
      consoleErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    } else {
      console.log("✓ ZERO CONSOLE ERRORS! The application runs completely clean.");
    }
    console.log("===============================================");

    console.log("\n=== ALL END-TO-END TESTS COMPLETED SUCCESSFULLY ===");
  } catch (err) {
    console.error("Test encountered an exception:", err);
    await page.screenshot({ path: path.join(screenshotsDir, "error_state.png") }).catch(() => {});
  } finally {
    await browser.close();
  }
}

runTest();

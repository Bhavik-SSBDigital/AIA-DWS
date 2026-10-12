/**
 * test-puppeteer-fix.mjs
 *
 * Run this LOCALLY (your Mac) to verify puppeteer-manager.js actually
 * works BEFORE deploying anywhere near production.
 *
 * SETUP:
 *   1. Put this file in the SAME folder as your real puppeteer-manager.js
 *      (the one with getBrowser/closeBrowser/withPage).
 *   2. Make sure puppeteer is installed in that folder:
 *        npm ls puppeteer
 *      (if not, run: npm install puppeteer)
 *   3. Run:
 *        node test-puppeteer-fix.mjs
 *
 * WHAT IT DOES:
 *   Test A - Baseline: one normal render, confirms chrome processes
 *            return to 0 after.
 *   Test B - Concurrency: fires 5 renders at once (simulating
 *            saveDescriptionDocument + appendDescriptionToPdf overlapping,
 *            which is what broke things in the live test on prod),
 *            confirms processes still clean up.
 *   Test C - Simulated hang: forces one render to take 45s (longer than
 *            the 30s withPage timeout) to confirm the timeout actually
 *            fires and the page still gets cleaned up rather than
 *            leaking forever.
 *
 * PASS/FAIL is printed clearly at the end of each test and a final
 * summary. If any test FAILS, do not deploy — tell me which one failed
 * and I'll fix the actual bug instead of guessing.
 */

import { withPage, closeBrowser } from "./puppeteer-manager.js";
import { execSync } from "child_process";

const countChromeProcs = () => {
  try {
    // Works on both macOS and Linux
    const out = execSync(
      `ps ax | grep -i "chrome" | grep -v grep | grep -v Cursor | grep -v "Visual Studio Code" | grep -v Brave | grep -v "Google Chrome.app" | wc -l`,
    )
      .toString()
      .trim();
    return parseInt(out, 10) || 0;
  } catch {
    return -1;
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];

async function warmup() {
  // The FIRST call to withPage() launches the shared singleton browser,
  // which spawns ~9 Chrome subprocesses (main, zygote x2, GPU, utility,
  // renderer, crashpad, etc). That's normal Chrome architecture, not a
  // leak — it happens exactly once because the browser is a singleton
  // meant to stay alive and be reused. We warm it up here so the real
  // tests below measure growth from a stable baseline, not from zero.
  console.log("\n=== WARMUP: launching shared browser (one-time cost) ===");
  const before = countChromeProcs();
  await withPage(
    async (page) => {
      await page.setContent("<html><body>warmup</body></html>", {
        waitUntil: "domcontentloaded",
      });
      return page.pdf({ format: "A4" });
    },
    "warmup",
    30000,
  );
  await wait(1000);
  const after = countChromeProcs();
  console.log(
    `Chrome procs: ${before} -> ${after} (one-time browser launch, expected)`,
  );
  return after; // this becomes the real baseline for tests A/B/C
}

async function testA_baseline(stableBaseline) {
  console.log("\n=== TEST A: Single render after warmup ===");
  console.log(`Chrome procs before: ${stableBaseline}`);

  const html = `<html><body><h1>Test PDF</h1></body></html>`;

  const pdfBuffer = await withPage(
    async (page) => {
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      return page.pdf({ format: "A4" });
    },
    "test-baseline",
    30000,
  );

  console.log(`PDF generated: ${pdfBuffer.length} bytes`);

  await wait(1000); // give processes a moment to actually exit
  const after = countChromeProcs();
  console.log(`Chrome procs after: ${after}`);

  const pass = pdfBuffer.length > 0 && after <= stableBaseline;
  console.log(
    pass ? "PASS" : "FAIL — chrome procs grew beyond the warmed-up baseline",
  );
  results.push({ name: "A: Baseline", pass });
  return after;
}

async function testB_concurrency(stableBaseline) {
  console.log("\n=== TEST B: 5 concurrent renders (simulates overlap) ===");
  const before = stableBaseline;
  console.log(`Chrome procs before: ${before}`);

  const html = (i) => `<html><body><h1>Concurrent Test ${i}</h1></body></html>`;

  const renders = Array.from({ length: 5 }, (_, i) =>
    withPage(
      async (page) => {
        await page.setContent(html(i), { waitUntil: "domcontentloaded" });
        return page.pdf({ format: "A4" });
      },
      `test-concurrent-${i}`,
      30000,
    ),
  );

  const buffers = await Promise.all(renders);
  console.log(`Generated ${buffers.length} PDFs concurrently`);

  await wait(1500);
  const after = countChromeProcs();
  console.log(`Chrome procs after: ${after}`);

  const allSucceeded = buffers.every((b) => b.length > 0);
  const pass = allSucceeded && after <= before;
  console.log(pass ? "PASS" : "FAIL — chrome procs grew or a render failed");
  results.push({ name: "B: Concurrency", pass });
  return after;
}

async function testC_timeoutRecovery(stableBaseline) {
  console.log("\n=== TEST C: Simulated hang + timeout recovery ===");
  const before = stableBaseline;
  console.log(`Chrome procs before: ${before}`);

  let threw = false;
  let errorMessage = "";

  try {
    // 5 second timeout, but the page function takes 10s -> must throw
    await withPage(
      async (page) => {
        await page.setContent("<html><body>hang test</body></html>");
        await wait(10000); // simulate a hung operation
        return page.pdf({ format: "A4" });
      },
      "test-hang",
      5000, // short timeout on purpose
    );
  } catch (err) {
    threw = true;
    errorMessage = err.message;
  }

  console.log(`Timed out as expected: ${threw} (${errorMessage})`);

  // Give cleanup a moment, then confirm no orphaned page/process pileup
  await wait(2000);
  const after = countChromeProcs();
  console.log(`Chrome procs after: ${after}`);

  const pass = threw && after <= before;
  console.log(
    pass
      ? "PASS"
      : "FAIL — either didn't time out, or left orphaned chrome processes",
  );
  results.push({ name: "C: Timeout recovery", pass });
}

async function main() {
  try {
    const baseline = await warmup();
    const afterA = await testA_baseline(baseline);
    const afterB = await testB_concurrency(afterA);
    await testC_timeoutRecovery(afterB);
  } catch (err) {
    console.error("\nUNEXPECTED ERROR — test harness itself failed:", err);
    results.push({ name: "UNEXPECTED", pass: false });
  } finally {
    await closeBrowser();
  }

  console.log("\n\n========== SUMMARY ==========");
  let allPass = true;
  for (const r of results) {
    console.log(`${r.pass ? "✅ PASS" : "❌ FAIL"} — ${r.name}`);
    if (!r.pass) allPass = false;
  }
  console.log("==============================");
  console.log(
    allPass
      ? "\nAll tests passed. Safe to deploy to staging/prod for the real live-test."
      : "\nAt least one test FAILED. Do not deploy — send me this full output.",
  );

  process.exit(allPass ? 0 : 1);
}

main();

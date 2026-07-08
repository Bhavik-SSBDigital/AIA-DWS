/**
 * puppeteer-manager.js
 *
 * Extracted from the getBrowser()/closeBrowser() that already existed in
 * description-controller.js, so it can be shared by process-controller.js
 * too (fixes Bug 2: appendDescriptionToPdf launching its own separate
 * browser instead of reusing the singleton — confirmed cause of chrome
 * procs jumping 11 -> 22 in the live test).
 *
 * Also fixes Bug 1: browser.newPage() is now wrapped in the same timeout
 * as everything else, and happens INSIDE the try, so a hang here can't
 * leak an orphaned page anymore (confirmed cause of chrome procs jumping
 * 0 -> 10 after saveDescriptionDocument and never dropping back down).
 */

import puppeteer from "puppeteer";

let _browser = null;

export const getBrowser = async () => {
  if (_browser) {
    try {
      await Promise.race([
        _browser.version(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Browser unresponsive")), 5000),
        ),
      ]);

      const pages = await _browser.pages();
      if (pages.length > 5) {
        console.warn(
          `[Puppeteer] ${pages.length} open pages — closing orphans`,
        );
        await Promise.all(pages.slice(1).map((p) => p.close().catch(() => {})));
      }
      return _browser;
    } catch {
      console.warn(
        "[Puppeteer] Browser zombie detected. Killing and relaunching...",
      );
      await _browser.close().catch(() => {});
      _browser = null;
    }
  }

  _browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    headless: "new",
    timeout: 15000,
  });

  _browser.once("disconnected", () => {
    _browser = null;
  });

  return _browser;
};

export const closeBrowser = async () => {
  if (_browser) {
    console.log("[Puppeteer] Closing browser on shutdown...");
    await _browser.close().catch(() => {});
    _browser = null;
    console.log("[Puppeteer] Browser closed.");
  }
};

/**
 * Opens a page from the shared browser with a hard timeout on newPage()
 * itself (fixes Bug 1) and guarantees page.close() on every path.
 *
 * @param {(page: import('puppeteer').Page) => Promise<any>} fn
 * @param {string} label - for error messages
 * @param {number} timeoutMs
 */
export const withPage = async (fn, label, timeoutMs = 30000) => {
  let page = null;
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  try {
    const browser = await getBrowser();

    // FIX for Bug 1: newPage() is now covered by the same timeout race,
    // and — critically — is inside the try block, so once it settles
    // (resolves or the timeout fires) the finally below can close it.
    page = await Promise.race([browser.newPage(), timeoutPromise]);

    const result = await Promise.race([fn(page), timeoutPromise]);
    clearTimeout(timeoutHandle);
    return result;
  } finally {
    clearTimeout(timeoutHandle);
    if (page) {
      await page.close().catch(() => {});
    }
    // NOTE: browser itself is the shared singleton — never closed here.
  }
};

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

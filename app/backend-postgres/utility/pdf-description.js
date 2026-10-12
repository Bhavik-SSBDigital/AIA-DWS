import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, degrees, PDFName, PDFDict, PDFNumber } from "pdf-lib";
import { withPage } from "../puppeteer-manager.js";
import { executePythonScript } from "../controller/e-sign-controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_RENDER_TIMEOUT_MS = Number(
  process.env.PDF_RENDER_TIMEOUT_MS || 30000,
);

const withTimeout = (promise, timeoutMs, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/* ───────── Rotation / placement helpers ───────── */

const getPageRotation = (page) => {
  const raw = page.getRotation()?.angle || 0;
  return (((Math.round(raw / 90) * 90) % 360) + 360) % 360;
};

/**
 * Draws an embedded page so it appears UPRIGHT in the viewer, whatever the
 * page's /Rotate is. (vx, vy) = bottom-left of the block in *visual* space.
 */
const drawEmbeddedUpright = (page, embedded, vx, vy, w, h) => {
  const rot = getPageRotation(page);
  const box = page.getCropBox();
  const W = box.width;
  const H = box.height;
  let u, v;
  switch (rot) {
    case 90:
      u = W - vy;
      v = vx;
      break;
    case 180:
      u = W - vx;
      v = H - vy;
      break;
    case 270:
      u = vy;
      v = H - vx;
      break;
    default:
      u = vx;
      v = vy;
  }
  page.drawPage(embedded, {
    x: box.x + u,
    y: box.y + v,
    width: w,
    height: h,
    rotate: degrees(rot),
  });
};

/**
 * True if the page holds a big raster image (scanned page). The python
 * script ignores full-page images, so on such pages its "free space" answer
 * cannot be trusted. If we can't inspect, assume "scanned" (the safe side).
 */
const pageHasLargeImage = (pdfDoc, page) => {
  try {
    const resources = page.node.Resources();
    if (!resources) return false;
    const xObjects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xObjects) return false;
    for (const [, ref] of xObjects.entries()) {
      const obj = pdfDoc.context.lookup(ref);
      const dict = obj && obj.dict;
      if (!dict) continue;
      const subtype = dict.get(PDFName.of("Subtype"));
      if (!subtype || subtype.toString() !== "/Image") continue;
      const w = dict.lookup(PDFName.of("Width"));
      const h = dict.lookup(PDFName.of("Height"));
      if (
        w instanceof PDFNumber &&
        h instanceof PDFNumber &&
        w.asNumber() * h.asNumber() > 400000
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
};

/**
 * Appends the HTML description to a PDF.
 *  - upright on ANY page rotation / size
 *  - right after the content when free space is trustworthy
 *  - otherwise on fresh upright page(s) -> can never overlap content
 */
export async function appendDescriptionToPdf(
  pdfDoc,
  lastPage,
  documentPath,
  descriptionHtml,
  pythonEnvPath,
  pythonScriptPath,
  options = {},
) {
  const fnStartTime = Date.now();
  const logStep = (step, extra = {}) => {
    console.log(`[appendDescriptionToPdf] ${step}`, {
      documentPath,
      elapsedMs: Date.now() - fnStartTime,
      ...extra,
    });
  };

  logStep("function entered");

  const {
    marginLeft = 50,
    marginTop = 50,
    marginBottom = 50,
    safetyMargin = 25,
  } = options;

  const absDocumentPath = path.join(
    __dirname,
    "../../../../",
    "storage",
    documentPath,
  );

  // ── VISUAL geometry of the last page (what the human sees) ──
  const lastRotation = getPageRotation(lastPage);
  const lastBox = lastPage.getCropBox();
  const swapped = lastRotation === 90 || lastRotation === 270;
  const visW = swapped ? lastBox.height : lastBox.width;
  const visH = swapped ? lastBox.width : lastBox.height;

  // ── Free space on the last page (python), trusted ONLY if it passes checks ──
  let contentExtremes = null;
  try {
    logStep("calling executePythonScript (space calculation)");
    contentExtremes = await withTimeout(
      executePythonScript(pythonEnvPath, pythonScriptPath, absDocumentPath),
      PDF_RENDER_TIMEOUT_MS,
      "PDF space calculation",
    );
    logStep("executePythonScript done", { contentExtremes });
  } catch (e) {
    logStep("executePythonScript failed/timed out", {
      error: e?.message || e,
    });
    contentExtremes = null;
  }

  const pyH = Number(contentExtremes?.height);
  const pyW = Number(contentExtremes?.width);
  const pyLastY = Number(contentExtremes?.last_y);

  const lastPageIsScanned = pageHasLargeImage(pdfDoc, lastPage);
  const pythonTrusted =
    !!contentExtremes &&
    !contentExtremes.error &&
    Number.isFinite(pyLastY) &&
    pyLastY > 50 && // 50 == "script found nothing" -> don't trust
    Number.isFinite(pyH) &&
    Math.abs(pyH - visH) <= 2 && // rotation/box mismatch -> don't trust
    (!Number.isFinite(pyW) || pyW === 0 || Math.abs(pyW - visW) <= 2);

  const canTryLastPage = pythonTrusted && !lastPageIsScanned;
  logStep("placement pre-check", {
    lastRotation,
    visW,
    visH,
    pythonTrusted,
    lastPageIsScanned,
    canTryLastPage,
  });

  const fullHtml = `
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Helvetica, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.6;
          }
          .description-container {
            padding: 10px;
            white-space: pre-wrap;
            word-break: break-word;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 10px;
          }
          th, td {
            border: 1px solid #999;
            padding: 6px;
            font-size: 12px;
          }
          th {
            background: #f2f2f2;
          }
        </style>
      </head>
      <body>
        <div class="description-container">
          <b>Description:</b><br/><br/>
          ${descriptionHtml}
        </div>
      </body>
    </html>
  `;

  logStep("calling withPage");

  return withPage(
    async (page) => {
      logStep("withPage: page acquired, setting viewport");
      await page.setViewport({ width: 800, height: 1080 });

      logStep("withPage: viewport set, setting content");
      await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

      logStep("withPage: content set, querying container");
      const container = await page.$(".description-container");
      if (!container) {
        throw new Error("Description container was not rendered");
      }

      logStep("withPage: container found, getting bounding box");
      const box = await container.boundingBox();
      if (!box) {
        throw new Error("Description container has no render box");
      }

      logStep("withPage: bounding box obtained", { box });

      const rawWidth = Math.ceil(box.width) + 10;
      const rawHeight = Math.ceil(box.height) + 10;

      logStep("withPage: calling page.pdf", { rawWidth, rawHeight });
      const pdfBuffer = await page.pdf({
        width: `${rawWidth}px`,
        height: `${rawHeight}px`,
        printBackground: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      logStep("withPage: page.pdf done", { bytes: pdfBuffer.length });

      // ───────────── everything below is pdf-lib only ─────────────
      const tempDoc = await PDFDocument.load(pdfBuffer);
      logStep("withPage: tempDoc loaded");

      const srcPage = tempDoc.getPages()[0];
      const srcW = srcPage.getWidth();
      const srcH = srcPage.getHeight();

      const STANDARD_PAGE_WIDTH = 595.28; // A4
      const STANDARD_PAGE_HEIGHT = 841.89;
      const MIN_USABLE_SPACE = 150;
      const MAX_PAGES_TO_ADD = 50;

      // shrink-to-fit only (never enlarge)
      const fitScale = (pageW) => {
        const maxW = pageW - marginLeft * 2;
        return maxW > 0 && rawWidth > maxW ? maxW / rawWidth : 1;
      };

      const lastTooSmall =
        visW - marginLeft * 2 < MIN_USABLE_SPACE ||
        visH - marginTop * 2 < MIN_USABLE_SPACE;

      // ── OPTION A: right after the content on the last page ──
      if (canTryLastPage && !lastTooSmall) {
        const k = (rawWidth * fitScale(visW)) / srcW;
        const drawW = srcW * k;
        const drawH = srcH * k;
        const topY = visH - pyLastY - safetyMargin; // visual y of block top
        const bottomY = topY - drawH;

        if (bottomY >= marginBottom) {
          const embedded = await pdfDoc.embedPage(srcPage);
          drawEmbeddedUpright(
            lastPage,
            embedded,
            marginLeft,
            bottomY,
            drawW,
            drawH,
          );
          logStep("withPage: drawn on last page", { bottomY, drawW, drawH });
          return {
            x: marginLeft,
            y: topY,
            width: drawW,
            height: drawH,
            pagesAdded: 0,
            newlyAdded: false,
          };
        }
      }

      // ── OPTION B: fresh, upright page(s) — can NEVER overlap anything ──
      const overflowW = lastTooSmall
        ? Math.max(visW, STANDARD_PAGE_WIDTH)
        : visW;
      const overflowH = lastTooSmall
        ? Math.max(visH, STANDARD_PAGE_HEIGHT)
        : visH;

      const k = (rawWidth * fitScale(overflowW)) / srcW;
      const drawW = srcW * k;
      const totalH = srcH * k;
      const usableH = overflowH - marginTop - marginBottom;

      if (usableH <= 0 || drawW <= 0 || totalH <= 0) {
        throw new Error(
          `appendDescriptionToPdf: invalid geometry (usableH=${usableH}, drawW=${drawW}, totalH=${totalH})`,
        );
      }

      const pageCount = Math.ceil(totalH / usableH);
      if (pageCount > MAX_PAGES_TO_ADD) {
        throw new Error(
          `appendDescriptionToPdf: description needs ${pageCount} pages (max ${MAX_PAGES_TO_ADD})`,
        );
      }

      const srcPerDrawn = srcH / totalH; // source pts per drawn pt
      let pagesAdded = 0;

      for (let i = 0; i < pageCount; i++) {
        const sliceH = Math.min(usableH, totalH - i * usableH);
        const newPage = pdfDoc.addPage([overflowW, overflowH]); // rotation 0
        pagesAdded++;

        let embedded;
        if (pageCount === 1) {
          embedded = await pdfDoc.embedPage(srcPage);
        } else {
          const topSrc = srcH - i * usableH * srcPerDrawn;
          const bottomSrc = Math.max(0, topSrc - sliceH * srcPerDrawn);
          embedded = await pdfDoc.embedPage(srcPage, {
            left: 0,
            right: srcW,
            bottom: bottomSrc,
            top: topSrc,
          });
        }

        drawEmbeddedUpright(
          newPage,
          embedded,
          marginLeft,
          overflowH - marginTop - sliceH,
          drawW,
          sliceH,
        );
      }

      logStep("withPage: drawn on new page(s)", {
        pagesAdded,
        overflowW,
        overflowH,
      });

      return {
        x: marginLeft,
        y: overflowH - marginTop,
        width: drawW,
        height: totalH,
        pagesAdded,
        newlyAdded: true,
      };
    },
    "appendDescriptionToPdf",
    PDF_RENDER_TIMEOUT_MS,
  )
    .then((result) => {
      logStep("function complete", { result });
      return result;
    })
    .catch((err) => {
      logStep("function threw", { error: err?.message || err });
      throw err;
    });
}

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { dirname } from "path";
import puppeteer from "puppeteer";
import sanitizeHtml from "sanitize-html";
import { verifyUser } from "../utility/verifyUser.js";
import { generateUniqueDocumentName } from "./process-controller.js";
import prisma from "../config/prisma-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_PATH = process.env.STORAGE_PATH || "../storage";

const ALLOWED_SUBDIRS = new Set(["check", "descriptions", "documents"]);

let _browser = null;

const getBrowser = async () => {
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

const escapeHtml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SANITIZE_OPTIONS = {
  allowedTags: [
    "p",
    "br",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "span",
    "div",
    "blockquote",
    "pre",
    "code",
  ],
  allowedAttributes: {
    "*": ["style"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: [],
  disallowedTagsMode: "discard",
};

const sanitizeDescription = (html) =>
  sanitizeHtml(html || "", SANITIZE_OPTIONS);

const renderDescriptionPdf = async ({
  processName,
  initiatorName,
  workflowName,
  descriptionHtml,
  generatedAt,
}) => {
  const safeDescriptionHtml = sanitizeDescription(descriptionHtml);

  const pageHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8" />
      <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
              font-size: 13px; color: #1e293b; background: #ffffff; padding: 0;
          }
          .cover-banner { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 36px 48px 28px; color: #ffffff; }
          .cover-banner .doc-type { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; opacity: 0.8; margin-bottom: 10px; }
          .cover-banner h1 { font-size: 26px; font-weight: 700; line-height: 1.25; margin-bottom: 8px; }
          .cover-banner .subtitle { font-size: 13px; opacity: 0.85; }
          .meta-section { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 20px 48px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .meta-item .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 4px; }
          .meta-item .value { font-size: 13px; font-weight: 600; color: #0f172a; }
          .divider { height: 3px; background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 60%, transparent 100%); }
          .content-wrapper { padding: 32px 48px 48px; }
          .section-heading { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #4f46e5; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
          .description-content { font-size: 13.5px; line-height: 1.8; color: #1e293b; }
          .description-content p { margin-bottom: 10px; }
          .description-content b, .description-content strong { font-weight: 700; }
          .description-content i, .description-content em { font-style: italic; }
          .description-content u { text-decoration: underline; }
          .description-content ul { list-style: disc; margin-left: 24px; margin-bottom: 10px; }
          .description-content ol { list-style: decimal; margin-left: 24px; margin-bottom: 10px; }
          .description-content li { margin-bottom: 4px; }
          .description-content table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
          .description-content th { background: #4f46e5; color: #ffffff; font-weight: 700; padding: 9px 12px; text-align: left; border: 1px solid #4338ca; }
          .description-content td { padding: 8px 12px; border: 1px solid #e2e8f0; vertical-align: top; }
          .description-content tr:nth-child(even) td { background: #f8fafc; }
      </style>
  </head>
  <body>
      <div class="cover-banner">
          <div class="doc-type">Process Description Document</div>
          <h1>${escapeHtml(processName)}</h1>
          <div class="subtitle">${escapeHtml(workflowName)} &nbsp;·&nbsp; Initiated by ${escapeHtml(initiatorName)}</div>
      </div>
      <div class="meta-section">
          <div class="meta-item"><div class="label">Process Name</div><div class="value">${escapeHtml(processName)}</div></div>
          <div class="meta-item"><div class="label">Workflow</div><div class="value">${escapeHtml(workflowName)}</div></div>
          <div class="meta-item"><div class="label">Initiator</div><div class="value">${escapeHtml(initiatorName)}</div></div>
          <div class="meta-item"><div class="label">Generated On</div><div class="value">${escapeHtml(generatedAt)}</div></div>
          <div class="meta-item"><div class="label">Document Type</div><div class="value">Process Description</div></div>
          <div class="meta-item"><div class="label">Status</div><div class="value">Draft</div></div>
      </div>
      <div class="divider"></div>
      <div class="content-wrapper">
          <div class="section-heading">Description</div>
          <div class="description-content">
              ${safeDescriptionHtml || '<p style="color:#94a3b8;font-style:italic;">No description provided.</p>'}
          </div>
      </div>
  </body>
  </html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();

  const PDF_TIMEOUT_MS = 30000;
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new Error(`PDF generation timed out after ${PDF_TIMEOUT_MS / 1000}s`),
      );
    }, PDF_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      page.setContent(pageHtml, { waitUntil: "domcontentloaded" }),
      timeoutPromise,
    ]);

    const pdfBuffer = await Promise.race([
      page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0mm", bottom: "18mm", left: "0mm", right: "0mm" },
        displayHeaderFooter: false,
      }),
      timeoutPromise,
    ]);

    clearTimeout(timeoutHandle);
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close().catch(() => {});
  }
};

const resolveStoragePath = (rawHeaderPath, baseStorageDir) => {
  const normalized = path.normalize(rawHeaderPath);

  if (
    path.isAbsolute(normalized) ||
    normalized.split(path.sep).includes("..")
  ) {
    throw Object.assign(new Error("Invalid x-file-path header"), {
      statusCode: 400,
    });
  }

  const topLevel = normalized.split(path.sep)[0];
  if (!ALLOWED_SUBDIRS.has(topLevel)) {
    throw Object.assign(new Error(`Directory '${topLevel}' is not allowed`), {
      statusCode: 400,
    });
  }

  const descDir = path.resolve(baseStorageDir, normalized);

  if (
    !descDir.startsWith(baseStorageDir + path.sep) &&
    descDir !== baseStorageDir
  ) {
    throw Object.assign(new Error("Path traversal detected"), {
      statusCode: 400,
    });
  }

  return {
    cleanSubPath: normalized,
    descDir,
    responseDocumentPath: `/${normalized}`,
  };
};

// ======================================================================
// POST /saveDescriptionDocument
// ======================================================================
export const saveDescriptionDocument = async (req, res) => {
  try {
    const accessToken =
      req.headers["authorization"]?.replace("Bearer ", "") ||
      req.headers["x-authorization"]?.substring(7);

    if (!accessToken) {
      return res
        .status(401)
        .json({ message: "No authorization token provided" });
    }

    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { workflowId, processName, description, existingDescDocId } =
      req.body;

    if (!workflowId) {
      return res.status(400).json({ message: "workflowId is required" });
    }

    const rawHeaderPath = req.headers["x-file-path"] || "check";
    const baseStorageDir = path.resolve(__dirname, STORAGE_PATH);

    let cleanSubPath, descDir, responseDocumentPath;
    try {
      ({ cleanSubPath, descDir, responseDocumentPath } = resolveStoragePath(
        rawHeaderPath,
        baseStorageDir,
      ));
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }

    await fs.mkdir(descDir, { recursive: true });

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true },
    });

    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }

    const generatedAt = new Date().toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const pdfBuffer = await Promise.race([
      renderDescriptionPdf({
        processName: processName || `${workflow.name} - New Process`,
        initiatorName: userData.name || userData.username || "Unknown",
        workflowName: workflow.name,
        descriptionHtml: description || "",
        generatedAt,
      }),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Master PDF generation timed out. Browser hang averted.",
              ),
            ),
          45000,
        ),
      ),
    ]);

    const docName = await generateUniqueDocumentName({
      workflowId,
      extension: "pdf",
    });

    const absPath = path.join(descDir, docName);
    await fs.writeFile(absPath, pdfBuffer);

    if (existingDescDocId) {
      try {
        const oldDoc = await prisma.document.findUnique({
          where: { id: parseInt(existingDescDocId, 10) },
          select: { path: true },
        });

        if (oldDoc?.path) {
          const cleanOld = path.normalize(
            oldDoc.path.replace(/^(\.\.\/|\.\/|\/)+/, ""),
          );
          const oldAbsPath = path.resolve(baseStorageDir, cleanOld);

          if (oldAbsPath.startsWith(baseStorageDir + path.sep)) {
            await fs.unlink(oldAbsPath).catch(() => {});
          }
        }

        await prisma.document.delete({
          where: { id: parseInt(existingDescDocId, 10) },
        });
      } catch (e) {
        console.warn("Could not delete old description doc:", e.message);
      }
    }

    const dbRelPath = `/${path.posix.join(cleanSubPath.split(path.sep).join("/"), docName)}`;

    const newDoc = await prisma.document.create({
      data: {
        name: docName,
        type: "pdf",
        path: dbRelPath,
        createdById: userData.id,
        isRecord: true,
        tags: ["process-description-doc"],
      },
    });

    return res.status(200).json({
      message: "Description document saved successfully",
      documentId: newDoc.id,
      documentName: newDoc.name,
      documentPath: responseDocumentPath,
    });
  } catch (error) {
    console.error("saveDescriptionDocument error:", error);
    return res.status(500).json({
      message: "Failed to generate description document",
      error: error.message,
    });
  }
};

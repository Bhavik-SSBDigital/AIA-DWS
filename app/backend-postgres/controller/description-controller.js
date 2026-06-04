// ======================================================================
// description-doc-controller.js
// Generates / replaces a professional "Process Description" PDF document
// and links it to the process, mimicking standard file upload behavior.
// ======================================================================

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { PrismaClient } from "@prisma/client";
import puppeteer from "puppeteer";
import { verifyUser } from "../utility/verifyUser.js";
import { generateUniqueDocumentName } from "./process-controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient();
const STORAGE_PATH = process.env.STORAGE_PATH || "../storage";

// ── Helper ─────────────────────────────────────────────────────────────────
const escapeHtml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Renders the description HTML into a polished A4 PDF using Puppeteer.
 * Returns the PDF as a Buffer.
 */
const renderDescriptionPdf = async ({
  processName,
  initiatorName,
  workflowName,
  descriptionHtml,
  generatedAt,
}) => {
  const pageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #1e293b;
      background: #ffffff;
      padding: 0;
    }

    /* ── Cover banner ── */
    .cover-banner {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      padding: 36px 48px 28px;
      color: #ffffff;
    }
    .cover-banner .doc-type {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      opacity: 0.8;
      margin-bottom: 10px;
    }
    .cover-banner h1 {
      font-size: 26px;
      font-weight: 700;
      line-height: 1.25;
      margin-bottom: 8px;
    }
    .cover-banner .subtitle {
      font-size: 13px;
      opacity: 0.85;
    }

    /* ── Meta grid ── */
    .meta-section {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 20px 48px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .meta-item .label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .meta-item .value {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
    }

    /* ── Divider ── */
    .divider {
      height: 3px;
      background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 60%, transparent 100%);
    }

    /* ── Content area ── */
    .content-wrapper {
      padding: 32px 48px 48px;
    }
    .section-heading {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #4f46e5;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
    }
    .description-content {
      font-size: 13.5px;
      line-height: 1.8;
      color: #1e293b;
    }

    /* Rich text elements */
    .description-content p { margin-bottom: 10px; }
    .description-content b, .description-content strong { font-weight: 700; }
    .description-content i, .description-content em { font-style: italic; }
    .description-content u { text-decoration: underline; }
    .description-content ul { list-style: disc; margin-left: 24px; margin-bottom: 10px; }
    .description-content ol { list-style: decimal; margin-left: 24px; margin-bottom: 10px; }
    .description-content li { margin-bottom: 4px; }

    .description-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 12px;
    }
    .description-content th {
      background: #4f46e5;
      color: #ffffff;
      font-weight: 700;
      padding: 9px 12px;
      text-align: left;
      border: 1px solid #4338ca;
    }
    .description-content td {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
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
    <div class="meta-item">
      <div class="label">Process Name</div>
      <div class="value">${escapeHtml(processName)}</div>
    </div>
    <div class="meta-item">
      <div class="label">Workflow</div>
      <div class="value">${escapeHtml(workflowName)}</div>
    </div>
    <div class="meta-item">
      <div class="label">Initiator</div>
      <div class="value">${escapeHtml(initiatorName)}</div>
    </div>
    <div class="meta-item">
      <div class="label">Generated On</div>
      <div class="value">${escapeHtml(generatedAt)}</div>
    </div>
    <div class="meta-item">
      <div class="label">Document Type</div>
      <div class="value">Process Description</div>
    </div>
    <div class="meta-item">
      <div class="label">Status</div>
      <div class="value">Draft</div>
    </div>
  </div>

  <div class="divider"></div>

  <div class="content-wrapper">
    <div class="section-heading">Description</div>
    <div class="description-content">
      ${descriptionHtml || '<p style="color:#94a3b8;font-style:italic;">No description provided.</p>'}
    </div>
  </div>

</body>
</html>`;

  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    headless: "new",
  });

  try {
    const page = await browser.newPage();
    await page.setContent(pageHtml, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "18mm", left: "0mm", right: "0mm" },
      displayHeaderFooter: false,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
};

// ======================================================================
// POST /saveDescriptionDocument
// Body: { workflowId, processName, description, existingDescDocId? }
// Headers: { x-file-path: "../check" } (Optional, defaults to "check")
// Returns: { documentId, documentName, documentPath, message }
// ======================================================================
export const saveDescriptionDocument = async (req, res) => {
  try {
    const accessToken =
      req.headers["authorization"]?.replace("Bearer ", "") ||
      req.headers["x-authorization"]?.substring(7);

    if (!accessToken)
      return res
        .status(401)
        .json({ message: "No authorization token provided" });

    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const { workflowId, processName, description, existingDescDocId } =
      req.body;

    if (!workflowId) {
      return res.status(400).json({ message: "workflowId is required" });
    }

    // ── 1. Resolve Path from Headers ──────────────────────────────────────
    const rawHeaderPath = req.headers["x-file-path"] || "check";

    // Sanitize the path: remove leading relative indicators like "../", "./", or "/"
    // This gives us a clean directory name (e.g., "../check" becomes "check")
    const cleanSubPath = rawHeaderPath.replace(/^(\.\.\/|\.\/|\/)+/, "");

    // Formulate the strict response path requested (e.g., "/check")
    const responseDocumentPath = `/${cleanSubPath}`;

    // Resolve absolute path for directory creation
    const baseStorageDir = path.resolve(__dirname, STORAGE_PATH);
    const descDir = path.resolve(baseStorageDir, cleanSubPath);

    // Ensure directory exists
    await fs.mkdir(descDir, { recursive: true });

    // ── 2. Resolve Workflow Info & Generate PDF ───────────────────────────
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true },
    });
    if (!workflow)
      return res.status(404).json({ message: "Workflow not found" });

    const generatedAt = new Date().toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const pdfBuffer = await renderDescriptionPdf({
      processName: processName || `${workflow.name} - New Process`,
      initiatorName: userData.name || userData.username || "Unknown",
      workflowName: workflow.name,
      descriptionHtml: description || "",
      generatedAt,
    });

    // ── 3. Handle File Naming and Saving ──────────────────────────────────
    const docName = await generateUniqueDocumentName({
      workflowId,
      extension: "pdf",
    });

    // The physical location to write the file
    const absPath = path.join(descDir, docName);

    // Save to disk
    await fs.writeFile(absPath, pdfBuffer);

    // ── 4. Delete Old Description Doc (If Replacing) ──────────────────────
    if (existingDescDocId) {
      try {
        const oldDoc = await prisma.document.findUnique({
          where: { id: parseInt(existingDescDocId) },
          select: { path: true },
        });

        if (oldDoc) {
          // Reconstruct the physical path from the DB path
          const cleanOldPath = oldDoc.path.replace(/^(\.\.\/|\.\/|\/)+/, "");
          const oldAbsPath = path.resolve(baseStorageDir, cleanOldPath);
          await fs.unlink(oldAbsPath).catch(() => {});
        }

        await prisma.document.delete({
          where: { id: parseInt(existingDescDocId) },
        });
      } catch (e) {
        console.warn("Could not delete old description doc:", e.message);
      }
    }

    // ── 5. Create Document Record in DB ───────────────────────────────────
    // FIX: We MUST prepend a leading '/' to the DB path so it matches the
    // exact string format generated in file_download (extra + "/" + fileName)
    const dbRelPath = `/${path.posix.join(cleanSubPath, docName)}`;

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

    // ── 6. Return strict documentPath as requested ────────────────────────
    return res.status(200).json({
      message: "Description document saved successfully",
      documentId: newDoc.id,
      documentName: newDoc.name,
      documentPath: responseDocumentPath, // strictly returns "/check"
    });
  } catch (error) {
    console.error("saveDescriptionDocument error:", error);
    return res.status(500).json({
      message: "Failed to generate description document",
      error: error.message,
    });
  }
};

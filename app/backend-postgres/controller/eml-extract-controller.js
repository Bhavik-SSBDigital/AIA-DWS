import { spawn, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import fsSync from "fs";
import { dirname } from "path";
import fs from "fs/promises";

import { verifyUser } from "../utility/verifyUser.js";
import { generateUniqueDocumentName } from "./process-controller.js";
import PDFDocument from "pdfkit";
import { PDFDocument as PDFLibDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import prisma from "../config/prisma-config.js";
const STORAGE_PATH = process.env.STORAGE_PATH || "../storage";

const execFileAsync = promisify(execFile);

// Hard ceilings so a stuck subprocess can never hang a request (or the
// whole Node process, in the case of the old execSync-based approach)
// forever. Tune via env if your conversions are legitimately slower.
const LIBREOFFICE_TIMEOUT_MS = Number(
  process.env.LIBREOFFICE_TIMEOUT_MS || 60_000,
);
const PYTHON_EXTRACTOR_TIMEOUT_MS = Number(
  process.env.PYTHON_EXTRACTOR_TIMEOUT_MS || 90_000,
);

// ======================================================================
// UNIVERSAL OS LIBREOFFICE INVOCATION (no shell, no string interpolation)
// ======================================================================
const getSofficeInvocation = (outDir, inFile) => {
  const platform = os.platform();
  const baseArgs = [
    "--headless",
    "--convert-to",
    "pdf",
    "--outdir",
    outDir,
    inFile,
  ];

  if (platform === "darwin") {
    return {
      file: "soffice",
      args: baseArgs,
      options: {
        env: {
          ...process.env,
          PATH: `${process.env.PATH || ""}:/opt/homebrew/bin:/usr/local/bin:/Applications/LibreOffice.app/Contents/MacOS`,
        },
      },
    };
  }
  if (platform === "win32") {
    return {
      file: "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      args: baseArgs,
      options: {},
    };
  }
  return { file: "soffice", args: baseArgs, options: {} };
};

/**
 * Runs LibreOffice conversion asynchronously via execFile (no shell,
 * so no quoting/injection issues) with a hard timeout. Unlike the
 * previous execSync call, this NEVER blocks Node's event loop — other
 * requests keep being served while this runs — and it can never hang
 * indefinitely: if soffice wedges, it gets killed and we throw.
 */
const executeLibreOfficeConversion = async (inputFilePath, outputDir) => {
  const { file, args, options } = getSofficeInvocation(
    outputDir,
    inputFilePath,
  );
  try {
    await execFileAsync(file, args, {
      ...options,
      timeout: LIBREOFFICE_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: 20 * 1024 * 1024,
    });
    const parsedPath = path.parse(inputFilePath);
    return path.join(outputDir, `${parsedPath.name}.pdf`);
  } catch (error) {
    const timedOut = error.killed || error.signal === "SIGKILL";
    console.log("LibreOffice Error:", error.message);
    throw new Error(
      timedOut
        ? `LibreOffice conversion timed out after ${LIBREOFFICE_TIMEOUT_MS}ms and was killed.`
        : `LibreOffice conversion failed. Ensure LibreOffice is installed.`,
    );
  }
};

const cleanupTempFiles = async (files, additionalPath) => {
  for (let file of files) {
    try {
      await fs.unlink(file);
    } catch (e) {}
  }
  if (additionalPath) {
    try {
      await fs.unlink(additionalPath);
    } catch (e) {}
  }
};

// Recursively removes a directory tree and swallows errors — used to
// guarantee temp attachment dirs never accumulate across requests,
// which is what causes slow disk-driven memory/cache pressure over
// time on long-running servers.
const cleanupDir = async (dirPath) => {
  if (!dirPath) return;
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (e) {}
};

// ======================================================================
// EML THREAD-PARSING HELPERS
// ======================================================================
const normalizeQuoteHeaderLine = (line) => {
  let normalized = line.replace(/mailto:[^\s>]*>/gi, "");
  normalized = normalized.replace(/>>+/g, ">").replace(/<<+/g, "<");
  return normalized.replace(/\s+/g, " ").trim();
};

const cleanMailto = (str) => {
  if (!str) return "";
  return str
    .replace(/mailto:[^\s>]*>/gi, "")
    .replace(/<https?:\/\/[^>]*>/gi, "")
    .replace(/>>+/g, ">")
    .replace(/<<+/g, "<")
    .trim();
};

const extractQuotedHeaderMeta = (line) => {
  const normalized = normalizeQuoteHeaderLine(line);

  const wrapper = normalized.match(/^On\s+(.+?)\s+wrote:\s*$/i);
  if (!wrapper) return null;

  const middle = wrapper[1].trim();

  // Find the FIRST email anywhere in the header
  const emailMatch = middle.match(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i,
  );

  if (!emailMatch) {
    return {
      date: "",
      from: middle,
    };
  }

  const email = emailMatch[0];

  // Everything before the email
  let beforeEmail = middle.substring(0, emailMatch.index);

  beforeEmail = beforeEmail.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

  const gmailMatch = beforeEmail.match(
    /^(.*?\d{4}\s+at\s+\d{1,2}:\d{2}\s*[AP]M)\s+(.+)$/i,
  );

  if (gmailMatch) {
    return {
      date: gmailMatch[1].replace(/\s+at\s+/i, " ").trim(),
      from: `${gmailMatch[2]} <${email}>`,
    };
  }

  const outlookMatch = beforeEmail.match(
    /^(.*?\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\s+(.+)$/i,
  );

  if (outlookMatch) {
    return {
      date: outlookMatch[1].trim(),
      from: `${outlookMatch[2]} <${email}>`,
    };
  }

  return {
    date: "",
    from: `${beforeEmail} <${email}>`,
  };
};

const preprocessBodyText = (bodyText) => {
  if (!bodyText) return "";
  let text = bodyText.replace(/\r\n/g, "\n");
  text = text.replace(/^(On\s+.+?)[\n\s]+(.+?\s+wrote:\s*)$/gm, "$1 $2");
  text = text.replace(/^(From:.*?)[\n\s]+(Sent:|Date:)/gm, "$1\n$2");
  return text;
};

const parseEnterpriseThread = (rawBodyText, rootEmailMeta) => {
  const bodyText = preprocessBodyText(rawBodyText);
  if (!bodyText) return [{ ...rootEmailMeta, body_plain: "(No content)" }];

  const lines = bodyText.split(/\n/);
  const thread = [];

  let currentMsg = {
    from: cleanMailto(rootEmailMeta.from),
    to: cleanMailto(rootEmailMeta.to),
    date: rootEmailMeta.date || "",
    subject: rootEmailMeta.subject || "No Subject",
    cc: cleanMailto(rootEmailMeta.cc),
    bcc: cleanMailto(rootEmailMeta.bcc),
    content: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleaned = line.replace(/^(>\s*)+/, "").trim();

    const isGmailStart = cleaned.match(/^On\s+.+\s+wrote:\s*$/i);
    const isOutlookStart =
      cleaned.toLowerCase().startsWith("from:") &&
      ((i + 1 < lines.length &&
        lines[i + 1].toLowerCase().match(/^(sent|date):/)) ||
        (i + 2 < lines.length &&
          lines[i + 2].toLowerCase().match(/^(sent|date):/)));
    const isHorizontalRule = cleaned.match(/^[-_ ]*Original Message[-_ ]*$/i);

    if (isGmailStart || isHorizontalRule || isOutlookStart) {
      const body = currentMsg.content.join("\n").trim();

      if (body.length > 0 || currentMsg.from !== "") {
        currentMsg.body_plain = body;
        thread.push({ ...currentMsg });
      }

      currentMsg = {
        from: "",
        to: "",
        date: "",
        subject: rootEmailMeta.subject,
        cc: "",
        bcc: "",
        content: [],
      };

      if (isGmailStart) {
        console.log("GMAIL HEADER >>>", cleaned);
        const meta = extractQuotedHeaderMeta(cleaned);
        if (meta) {
          currentMsg.date = meta.date;
          currentMsg.from = cleanMailto(meta.from);
        }
        continue;
      }
      if (isHorizontalRule) continue;
    }

    if (/^From:/i.test(cleaned))
      currentMsg.from = cleanMailto(cleaned.replace(/^From:\s*/i, ""));
    else if (/^Sent:|^Date:/i.test(cleaned))
      currentMsg.date = cleaned.replace(/^(Sent|Date):\s*/i, "").trim();
    else if (/^To:/i.test(cleaned))
      currentMsg.to = cleanMailto(cleaned.replace(/^To:\s*/i, ""));
    else if (/^Cc:/i.test(cleaned))
      currentMsg.cc = cleanMailto(cleaned.replace(/^Cc:\s*/i, ""));
    else if (/^Bcc:/i.test(cleaned))
      currentMsg.bcc = cleanMailto(cleaned.replace(/^Bcc:\s*/i, ""));
    else if (/^Subject:/i.test(cleaned))
      currentMsg.subject = cleaned.replace(/^Subject:\s*/i, "").trim();
    else currentMsg.content.push(line);
  }

  currentMsg.body_plain = currentMsg.content.join("\n").trim();
  if (currentMsg.body_plain.length > 0 || currentMsg.from !== "") {
    thread.push(currentMsg);
  }

  return thread.filter((m) => {
    const isMissingCore = m.from.toLowerCase() === "unknown" || m.from === "";
    const isGhostContent = m.body_plain.trim().length === 0;
    return !(isMissingCore && isGhostContent);
  });
};

const formatDate = (dateString) => {
  if (
    !dateString ||
    !String(dateString).trim() ||
    String(dateString).toLowerCase() === "invalid date"
  ) {
    return "Date not available";
  }
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return String(dateString).trim();
  }
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// Removes literal "N/A" and "UNKNOWN" text so it leaves a clean empty string
const sanitizeField = (str) => {
  let cleaned = cleanMailto(str);
  const upper = cleaned.toUpperCase();
  if (upper === "N/A" || upper === "UNKNOWN") return "";
  return cleaned;
};

// ======================================================================
// DYNAMIC PDF GENERATOR (NO BLEED-THROUGH, NO OVERLAPPING FIELDS)
// ======================================================================
const generateThreadContextPDF = async (
  allMessages,
  pdfFullPath,
  threadSubject,
) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margins: { top: 45, bottom: 50, left: 45, right: 45 },
        size: "A4",
        bufferPages: true,
      });
      const stream = fsSync.createWriteStream(pdfFullPath);
      doc.pipe(stream);

      const colors = {
        primary: "#1e293b",
        secondary: "#475569",
        accent: "#4f46e5",
        lightBg: "#f1f5f9",
        border: "#cbd5e1",
        text: "#0f172a",
        lightText: "#64748b",
        inferred: "#94a3b8",
      };

      const fonts = {
        bold: "Helvetica-Bold",
        regular: "Helvetica",
        italic: "Helvetica-Oblique",
      };
      const pageWidth = doc.page.width - 90;

      const addPageHeader = () => {
        // Temporarily disable margins and line-breaks so PDFKit doesn't panic and spawn empty pages
        const originalTopMargin = doc.page.margins.top;
        doc.page.margins.top = 0;

        doc.fontSize(8).font(fonts.regular).fillColor(colors.lightText);
        doc.text("Email Thread Context Document", 45, 25, {
          width: pageWidth,
          align: "left",
          lineBreak: false,
        });
        doc.text(`Generated: ${new Date().toLocaleString()}`, 45, 25, {
          width: pageWidth,
          align: "right",
          lineBreak: false,
        });
        doc
          .moveTo(45, 38)
          .lineTo(550, 38)
          .strokeColor(colors.border)
          .lineWidth(0.5)
          .stroke();

        doc.page.margins.top = originalTopMargin; // Restore margin
      };

      const addPageFooter = (pageNumber) => {
        // Temporarily disable the bottom margin while drawing the footer to prevent "infinite blank pages" glitch
        const originalBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        const footerY = doc.page.height - 35;
        doc
          .moveTo(45, footerY)
          .lineTo(550, footerY)
          .strokeColor(colors.border)
          .lineWidth(0.5)
          .stroke();
        doc
          .fontSize(8)
          .font(fonts.regular)
          .fillColor(colors.lightText)
          .text(`Page ${pageNumber}`, 45, footerY + 10, {
            width: pageWidth,
            align: "center",
            lineBreak: false,
          });

        doc.page.margins.bottom = originalBottomMargin; // Restore margin
      };

      doc.on("pageAdded", () => {
        addPageHeader();
        doc.y = 55;
      });

      addPageHeader();

      doc
        .fontSize(24)
        .font(fonts.bold)
        .fillColor(colors.primary)
        .text("Email Thread", 45, 55);
      doc
        .fontSize(14)
        .font(fonts.bold)
        .fillColor(colors.accent)
        .text(threadSubject || "Conversation History", 45, 85, {
          width: pageWidth,
        });

      const summaryY = doc.y + 10;

      const validDates = allMessages
        .map((m) => Date.parse(m.date))
        .filter((d) => !Number.isNaN(d))
        .sort((a, b) => a - b);

      const earliestDate =
        validDates.length > 0 ? formatDate(new Date(validDates[0])) : "Unknown";

      const latestDate =
        validDates.length > 0
          ? formatDate(new Date(validDates[validDates.length - 1]))
          : "Unknown";
      doc
        .rect(45, summaryY, pageWidth, 45)
        .fillAndStroke(colors.lightBg, colors.border);
      doc
        .fontSize(9)
        .font(fonts.bold)
        .fillColor(colors.primary)
        .text(`Total Messages: ${allMessages.length}`, 55, summaryY + 8);
      doc
        .fontSize(9)
        .font(fonts.regular)
        .fillColor(colors.secondary)
        .text(
          `Date Range: ${earliestDate} to ${latestDate}`,
          55,
          summaryY + 23,
        );

      doc.y = summaryY + 60;

      const ensureSpace = (neededHeight = 20) => {
        if (doc.y + neededHeight > doc.page.height - 50) {
          doc.addPage();
        }
      };

      allMessages.forEach((msg, idx) => {
        ensureSpace(80);

        doc.rect(45, doc.y, pageWidth, 3).fill(colors.accent);
        doc.moveDown(0.5);

        doc
          .fontSize(11)
          .font(fonts.bold)
          .fillColor(colors.primary)
          .text(`Message ${idx + 1}`, 55, doc.y);
        doc
          .fontSize(8)
          .font(fonts.regular)
          .fillColor(colors.lightText)
          .text(`${formatDate(msg.date)}`, 55, doc.y + 2);
        doc.moveDown(0.5);

        // Prints a header row and, when the value was back-filled from
        // the original message rather than found verbatim in this
        // message's own quoted text, appends a small "(inherited)"
        // note instead of just silently filling it in.
        const printHeaderRow = (label, value, inferred) => {
          if (!value) return;
          const startY = doc.y;
          doc
            .fontSize(8)
            .font(fonts.bold)
            .fillColor(colors.secondary)
            .text(label, 55, startY, { lineBreak: false });
          doc
            .font(fonts.regular)
            .fillColor(colors.text)
            .text(value, 90, startY, { width: 400, continued: !!inferred });
          if (inferred) {
            doc
              .font(fonts.italic)
              .fillColor(colors.inferred)
              .text("  (from original thread, not in this reply)", {
                width: 400,
              });
          }
          doc.y = doc.y + 2;
        };

        printHeaderRow("FROM:", msg.from || "—", false);
        printHeaderRow(
          "TO:",
          msg.to || (msg.toInferred ? "" : "—"),
          msg.toInferred,
        );
        printHeaderRow("CC:", msg.cc, msg.ccInferred);

        doc.moveDown(0.5);
        const subY = doc.y;
        doc
          .fontSize(10)
          .font(fonts.bold)
          .fillColor(colors.primary)
          .text("SUBJECT:", 55, subY, { lineBreak: false });
        doc
          .fontSize(10)
          .font(fonts.bold)
          .fillColor(colors.accent)
          .text(msg.subject || "(No Subject)", 115, subY, {
            width: pageWidth - 70,
          });

        doc.moveDown(0.5);
        doc
          .moveTo(45, doc.y)
          .lineTo(550, doc.y)
          .strokeColor(colors.border)
          .lineWidth(0.5)
          .stroke();
        doc.moveDown(0.5);

        doc.fontSize(9).font(fonts.regular).fillColor(colors.text);
        const bodyText = (msg.body_plain || "").trim();
        if (bodyText) {
          doc.text(bodyText, 55, doc.y, {
            width: pageWidth - 20,
            align: "left",
            lineGap: 2,
          });
        }

        // Only push the cursor down if there is another message coming.
        if (idx < allMessages.length - 1) {
          doc.moveDown(1.5);
        }
      });

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        addPageFooter(i + 1);
      }

      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
};

// ======================================================================
// MAIN CONTROLLER
// ======================================================================
// NOTE ON ATTACHMENT CLASSIFICATION:
// There is deliberately no logo/template-asset detection logic left in
// this file. That decision now lives entirely in eml_extractor.py,
// which has visibility into every attachment across the WHOLE thread
// at once (needed for its primary signal: an image whose exact bytes
// recur across multiple messages is a template logo, not a one-off
// upload). Node just reads the `is_likely_logo` flag the script
// already computed off each attachment record. Do not reintroduce
// sharp()-based dimension checks or filename regexes here — if the
// classification needs adjusting, change it in the Python script so
// there is exactly one place this logic lives.

export const extractEMLDetails = async (req, res) => {
  const accessToken =
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.headers["x-authorization"]?.substring(7);

  if (!accessToken)
    return res.status(401).json({ message: "No authorization token provided" });

  // Every temp resource created for this request is tracked here so
  // the finally block can guarantee cleanup regardless of where the
  // request succeeds or fails — this is what stops temp attachment
  // dirs (and therefore disk/memory pressure over time) from ever
  // accumulating.
  let attachmentsDir = null;
  let pythonProcess = null;
  let pythonTimeoutHandle = null;

  try {
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const { documentId, workflowId } = req.body;
    const emlDocument = await prisma.document.findUnique({
      where: { id: parseInt(documentId) },
    });

    if (!emlDocument)
      return res.status(404).json({ message: "Document not found" });

    const emlFilePath = path.join(__dirname, STORAGE_PATH, emlDocument.path);
    const pythonScriptPath = path.join(
      __dirname,
      "../../support/eml_extractor.py",
    );

    attachmentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "eml_att_"));

    const extractionResult = await new Promise((resolve, reject) => {
      pythonProcess = spawn("python3", [
        pythonScriptPath,
        emlFilePath,
        attachmentsDir,
      ]);

      let output = "";
      let errorOutput = "";

      pythonProcess.stdout.on("data", (data) => {
        output += data.toString();
      });
      pythonProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      // Hard timeout: if the Python extractor ever hangs (malformed
      // EML, filesystem stall, etc.) we kill it and reject instead of
      // leaving the HTTP request — and the child process — hanging
      // forever.
      pythonTimeoutHandle = setTimeout(() => {
        pythonProcess.kill("SIGKILL");
        reject(
          new Error(
            `EML extraction timed out after ${PYTHON_EXTRACTOR_TIMEOUT_MS}ms`,
          ),
        );
      }, PYTHON_EXTRACTOR_TIMEOUT_MS);

      pythonProcess.on("error", (err) => {
        clearTimeout(pythonTimeoutHandle);
        reject(err);
      });

      pythonProcess.on("close", (code) => {
        clearTimeout(pythonTimeoutHandle);
        if (code !== 0) {
          reject(
            new Error(
              errorOutput || `Python extractor exited with code ${code}`,
            ),
          );
          return;
        }
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(new Error(`Failed to parse extractor output: ${e.message}`));
        }
      });
    });

    // 1. SPLIT ATTACHMENTS ON THE FLAG THE PYTHON SCRIPT ALREADY SET.
    //    No re-derivation here — is_likely_logo + classification_reason
    //    were computed in eml_extractor.py, which had the whole
    //    thread's attachment set available (needed for the duplicate-
    //    hash check). Node just partitions on it.
    const allAttachments = extractionResult.attachments || [];
    const rawAttachmentCount = allAttachments.length;
    const validAttachments = allAttachments.filter((a) => !a.is_likely_logo);
    const droppedAsLogo = allAttachments
      .filter((a) => a.is_likely_logo)
      .map((a) => ({
        filename: a.filename,
        reason: a.classification_reason,
      }));

    // Loud and visible on purpose: if this ever mismatches what you
    // expect (e.g. rawAttachmentCount is 0 when the EML clearly has
    // attachments), the problem is upstream in the Python extractor's
    // collection step, not in the filtering logic below.
    console.log(
      `[EML extraction] raw attachments found: ${rawAttachmentCount}, ` +
        `kept: ${validAttachments.length}, dropped as logo: ${droppedAsLogo.length}`,
      droppedAsLogo,
    );

    // 2. PROCESS VALID ATTACHMENTS (read from disk path, not base64)
    const attachmentsWithDocumentIds = [];
    const uploadedDocumentIds = [];

    for (const attachment of validAttachments) {
      const originalExt = attachment.filename.split(".").pop().toLowerCase();
      const originalBaseName =
        attachment.filename.substring(
          0,
          attachment.filename.lastIndexOf("."),
        ) || attachment.filename;

      let finalBuffer;
      let finalExt = originalExt;
      let finalDisplayFilename = attachment.filename;

      // Read the original attachment bytes exactly once, straight
      // from the file the Python script wrote — no base64 round trip.
      const originalBuffer = await fs.readFile(attachment.file_path);

      if (["jpg", "jpeg", "png"].includes(originalExt)) {
        try {
          const imgPdf = await PDFLibDocument.create();
          const image = sharp(originalBuffer, { failOn: "none" });
          const metadata = await image.metadata();
          const imageObj = ["jpg", "jpeg"].includes(originalExt)
            ? await imgPdf.embedJpg(originalBuffer)
            : await imgPdf.embedPng(await image.png().toBuffer());

          const page = imgPdf.addPage([metadata.width, metadata.height]);
          page.drawImage(imageObj, {
            x: 0,
            y: 0,
            width: metadata.width,
            height: metadata.height,
          });
          finalBuffer = Buffer.from(await imgPdf.save());
          finalExt = "pdf";
          finalDisplayFilename = `${originalBaseName}.pdf`;
        } catch (imgErr) {
          // Same principle as the doc/docx case: don't destroy the real
          // image behind a placeholder just because wrapping it in a
          // PDF failed. Keep the original image file.
          console.log(
            `[EML extraction] image->pdf conversion failed for ${attachment.filename}, keeping original file:`,
            imgErr.message,
          );
          finalBuffer = originalBuffer;
          finalExt = originalExt;
          finalDisplayFilename = attachment.filename;
        }
      } else if (["doc", "docx"].includes(originalExt)) {
        try {
          const convertedPdfPath = await executeLibreOfficeConversion(
            attachment.file_path,
            attachmentsDir,
          );
          finalBuffer = await fs.readFile(convertedPdfPath);
          finalExt = "pdf";
          finalDisplayFilename = `${originalBaseName}.pdf`;
          await fs.unlink(convertedPdfPath).catch(() => {});
        } catch (convErr) {
          // Conversion failing is NOT a reason to throw away the real
          // attachment. Keep the original .doc/.docx bytes as-is so the
          // genuine content is still there and openable — just not as
          // a PDF. Losing the source file behind a "[Conversion
          // Failed]" placeholder page was actively destroying real
          // attachments whenever LibreOffice wasn't available or choked
          // on a file.
          console.log(
            `[EML extraction] doc->pdf conversion failed for ${attachment.filename}, keeping original file:`,
            convErr.message,
          );
          finalBuffer = originalBuffer;
          finalExt = originalExt;
          finalDisplayFilename = attachment.filename;
        }
      } else {
        finalBuffer = originalBuffer;
      }

      const safeName = await generateUniqueDocumentName({
        workflowId,
        extension: finalExt,
      });
      const relPath = path.join(path.dirname(emlDocument.path), safeName);
      const fullPath = path.join(__dirname, STORAGE_PATH, relPath);

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, finalBuffer);
      finalBuffer = null; // release reference promptly

      const newDoc = await prisma.document.create({
        data: {
          name: safeName,
          type: finalExt,
          path: relPath,
          createdById: userData.id,
          parentId: parseInt(documentId),
          isRecord: true,
          tags: [`extracted-from-eml:${documentId}`, "attachment"],
        },
      });

      uploadedDocumentIds.push(newDoc.id);
      attachment.filename = finalDisplayFilename;
      attachmentsWithDocumentIds.push({
        ...attachment,
        originalFilename: safeName,
        documentId: newDoc.id,
        fileType: finalExt,
      });
    }

    // 3. PARSE EMAILS
    let allMessages = [];
    const threadSubject =
      extractionResult.emails?.[0]?.subject || "Email Thread";
    const rootTo = sanitizeField(extractionResult.emails?.[0]?.to);
    const rootCc = sanitizeField(extractionResult.emails?.[0]?.cc);

    (extractionResult.emails || []).forEach((email) => {
      const parsed = parseEnterpriseThread(email.body_text, email);
      allMessages.push(...parsed);
    });

    // 4. SANITIZE EMAILS (Fix N/A, Mailto, and AM/PM Dates) + inherit
    //    To/Cc from the root message when a quoted reply's header
    //    genuinely never contained one (e.g. Gmail-style "On ... wrote:"
    //    quoting never includes To/Cc at all). We flag this explicitly
    //    rather than pretending it was found, so the PDF can label it.
    allMessages = allMessages.map((msg, idx) => {
      let body = (msg.body_plain || "")
        .replace(/mailto:[^\s>]*>/gi, "")
        .replace(/<https?:\/\/[^>]*>/gi, "");

      let dateStr = (msg.date || "")
        .replace(/\s+at\s+/i, " ")
        .replace(/,$/, "")
        .trim();
      let fromStr = (msg.from || "").trim();

      const amPmMatch = fromStr.match(/^(AM|PM)\s+/i);
      if (amPmMatch) {
        fromStr = fromStr.replace(/^(AM|PM)\s+/i, "").trim();
        if (!dateStr.match(/(AM|PM)$/i)) {
          dateStr = `${dateStr} ${amPmMatch[1].toUpperCase()}`;
        }
      }

      const cleanTo = sanitizeField(msg.to);
      const cleanCc = sanitizeField(msg.cc);
      const toInferred = idx > 0 && !cleanTo && !!rootTo;
      const ccInferred = idx > 0 && !cleanCc && !!rootCc;

      return {
        ...msg,
        from: sanitizeField(fromStr),
        to: cleanTo || (toInferred ? rootTo : cleanTo),
        cc: cleanCc || (ccInferred ? rootCc : cleanCc),
        toInferred,
        ccInferred,
        date: dateStr,
        body_plain: body,
      };
    });

    // 5. STRICT CHRONOLOGICAL SORT
    allMessages.sort((a, b) => {
      const ta = Date.parse(a.date);
      const tb = Date.parse(b.date);

      const validA = !Number.isNaN(ta);
      const validB = !Number.isNaN(tb);

      if (validA && validB) {
        return ta - tb;
      }

      if (validA) return -1;
      if (validB) return 1;

      return 0;
    });

    // Generate thread context PDF
    const threadContextPdfName = await generateUniqueDocumentName({
      workflowId,
      extension: "pdf",
    });
    const threadContextRelPath = path.join(
      path.dirname(emlDocument.path),
      `thread_context_${threadContextPdfName}`,
    );
    const threadContextFullPath = path.join(
      __dirname,
      STORAGE_PATH,
      threadContextRelPath,
    );

    await fs.mkdir(path.dirname(threadContextFullPath), { recursive: true });
    await generateThreadContextPDF(
      allMessages,
      threadContextFullPath,
      threadSubject,
    );

    const threadContextPdf = await prisma.document.create({
      data: {
        name: `thread_context_${threadContextPdfName}`,
        type: "pdf",
        path: threadContextRelPath,
        createdById: userData.id,
        parentId: parseInt(documentId),
        tags: ["email-thread-context", "timeline"],
      },
    });

    uploadedDocumentIds.push(threadContextPdf.id);
    attachmentsWithDocumentIds.push({
      documentId: threadContextPdf.id,
      originalFilename: threadContextPdf.name,
      fileType: "pdf",
      isThreadContext: true,
      description:
        "Complete email thread context with full conversation history",
    });

    res.status(200).json({
      success: true,
      message: `Successfully extracted email thread with ${uploadedDocumentIds.length - 1} attachment(s) and generated formatted thread context PDF`,
      data: {
        emails: allMessages,
        attachmentsMapping: attachmentsWithDocumentIds,
        extractedDocumentIds: uploadedDocumentIds,
        threadContextPdfId: threadContextPdf.id,
        summary: {
          total_messages: allMessages.length,
          total_attachments: uploadedDocumentIds.length - 1,
          raw_attachments_found_in_eml: rawAttachmentCount,
          attachments_dropped_as_logo: droppedAsLogo,
          has_thread_context_pdf: true,
          thread_subject: threadSubject,
        },
      },
    });
  } catch (e) {
    console.error("Extraction error:", e);
    if (!res.headersSent) {
      res.status(500).json({
        message: "Extraction failed",
        error: e.message,
        stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
      });
    }
  } finally {
    // Guaranteed cleanup regardless of success/failure/timeout — this
    // is the piece that stops attachment temp dirs (and the memory
    // pressure that comes from an unbounded number of them) from ever
    // building up on a busy server.
    if (pythonTimeoutHandle) clearTimeout(pythonTimeoutHandle);
    if (pythonProcess && !pythonProcess.killed) {
      try {
        pythonProcess.kill("SIGKILL");
      } catch {}
    }
    await cleanupDir(attachmentsDir);
  }
};

export const convertFileToPdf = async (req, res) => {
  let tempFilePath = null;
  let convertedFilePath = null;

  try {
    const authHeader =
      req.headers["authorization"] || req.headers["x-authorization"];
    const accessToken = authHeader?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });
    if (!req.file)
      return res
        .status(400)
        .json({ message: "No file uploaded for conversion." });

    const file = req.file;
    const originalName = file.originalname;
    const fileExtension = path.extname(originalName).toLowerCase();

    const allowedConversionExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".docx",
      ".doc",
    ];
    if (!allowedConversionExtensions.includes(fileExtension)) {
      return res.status(400).json({
        message:
          "Security Error: Only jpg, jpeg, png, doc, and docx are allowed for conversion.",
      });
    }

    let finalPdfBytes;

    if ([".jpg", ".jpeg", ".png"].includes(fileExtension)) {
      const mergedPdf = await PDFLibDocument.create();
      let image;
      try {
        image = sharp(file.buffer, { failOn: "none" });
      } catch (sharpError) {
        image = sharp(file.buffer);
      }

      const metadata = await image.metadata();
      let imageObj;

      if ([".jpg", ".jpeg"].includes(fileExtension)) {
        imageObj = await mergedPdf.embedJpg(file.buffer);
      } else {
        const pngBuffer = await image.png().toBuffer();
        imageObj = await mergedPdf.embedPng(pngBuffer);
      }

      const page = mergedPdf.addPage([metadata.width, metadata.height]);
      page.drawImage(imageObj, {
        x: 0,
        y: 0,
        width: metadata.width,
        height: metadata.height,
      });
      finalPdfBytes = await mergedPdf.save();
    } else if ([".docx", ".doc"].includes(fileExtension)) {
      const tempDir = path.join(__dirname, STORAGE_PATH, "temp");
      await fs.mkdir(tempDir, { recursive: true });

      tempFilePath = path.join(tempDir, `conv_${Date.now()}${fileExtension}`);
      await fs.writeFile(tempFilePath, file.buffer);

      convertedFilePath = await executeLibreOfficeConversion(
        tempFilePath,
        tempDir,
      );
      finalPdfBytes = await fs.readFile(convertedFilePath);
    }

    const cleanName = originalName.substring(0, originalName.lastIndexOf("."));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${cleanName}_converted.pdf"`,
    );
    res.setHeader("Content-Length", finalPdfBytes.length);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    return res.status(200).send(Buffer.from(finalPdfBytes));
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "problem doing convert file to pdf" });
  } finally {
    if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
    if (convertedFilePath) await fs.unlink(convertedFilePath).catch(() => {});
  }
};

export const mergeFilesToPdf = async (req, res) => {
  let tempFiles = [];
  let mergedPdfPath = null;
  const tempDir = path.join(__dirname, STORAGE_PATH, "temp");

  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0)
      return res.status(400).json({ message: "No files uploaded for merging" });

    const mergedPdf = await PDFLibDocument.create();
    await fs.mkdir(tempDir, { recursive: true });

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const fileBuffer = file.buffer;
      const originalName = file.originalname;
      const fileExtension = path.extname(originalName).toLowerCase();

      const tempFilePath = path.join(
        tempDir,
        `temp_${Date.now()}_${i}${fileExtension}`,
      );
      await fs.writeFile(tempFilePath, fileBuffer);
      tempFiles.push(tempFilePath);

      try {
        if (fileExtension === ".pdf") {
          const pdfDoc = await PDFLibDocument.load(fileBuffer);
          const copiedPages = await mergedPdf.copyPages(
            pdfDoc,
            pdfDoc.getPageIndices(),
          );
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        } else if (
          [".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"].includes(
            fileExtension,
          )
        ) {
          let image;
          try {
            image = sharp(fileBuffer, { failOn: "none" });
          } catch (sharpError) {
            image = sharp(fileBuffer);
          }

          const metadata = await image.metadata();
          let imageObj = [".jpg", ".jpeg"].includes(fileExtension)
            ? await mergedPdf.embedJpg(fileBuffer)
            : await mergedPdf.embedPng(await image.png().toBuffer());

          const page = mergedPdf.addPage([metadata.width, metadata.height]);
          page.drawImage(imageObj, {
            x: 0,
            y: 0,
            width: metadata.width,
            height: metadata.height,
          });
        } else if (
          [".txt", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt"].includes(
            fileExtension,
          )
        ) {
          try {
            const convertedPdfPath = await executeLibreOfficeConversion(
              tempFilePath,
              tempDir,
            );
            tempFiles.push(convertedPdfPath);

            const convertedPdfBytes = await fs.readFile(convertedPdfPath);
            const pdfDoc = await PDFLibDocument.load(convertedPdfBytes);
            const copiedPages = await mergedPdf.copyPages(
              pdfDoc,
              pdfDoc.getPageIndices(),
            );
            copiedPages.forEach((page) => mergedPdf.addPage(page));
          } catch (docError) {
            console.log("Merge conversion error:", docError.message);
            const page = mergedPdf.addPage([595.28, 841.89]);
            const helveticaFont = await mergedPdf.embedFont(
              StandardFonts.Helvetica,
            );
            page.drawText(`File: ${originalName}`, {
              x: 50,
              y: 400,
              size: 16,
              font: helveticaFont,
            });
            page.drawText("(Error processing file formatting)", {
              x: 50,
              y: 370,
              size: 12,
              font: helveticaFont,
            });
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (mergedPdf.getPageCount() === 0)
      return res
        .status(400)
        .json({ message: "No valid files could be merged" });

    const mergedPdfBytes = await mergedPdf.save();
    const timestamp = Date.now();
    mergedPdfPath = path.join(tempDir, `merged_${timestamp}.pdf`);
    await fs.writeFile(mergedPdfPath, mergedPdfBytes);

    const stat = await fs.stat(mergedPdfPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="merged_documents_${timestamp}.pdf"`,
    );
    res.setHeader("Accept-Ranges", "bytes");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", end - start + 1);
      res.status(206);

      const fileStream = fsSync.createReadStream(mergedPdfPath, { start, end });
      fileStream.pipe(res);
      fileStream.on(
        "end",
        async () => await cleanupTempFiles(tempFiles, mergedPdfPath),
      );
      fileStream.on(
        "error",
        async () => await cleanupTempFiles(tempFiles, mergedPdfPath),
      );
    } else {
      res.setHeader("Content-Length", fileSize);
      const fileStream = fsSync.createReadStream(mergedPdfPath);
      fileStream.pipe(res);
      fileStream.on(
        "end",
        async () => await cleanupTempFiles(tempFiles, mergedPdfPath),
      );
      fileStream.on(
        "error",
        async () => await cleanupTempFiles(tempFiles, mergedPdfPath),
      );
    }
  } catch (error) {
    console.log(error);
    await cleanupTempFiles(tempFiles, mergedPdfPath);
    if (!res.headersSent)
      return res
        .status(500)
        .json({ message: "problem doing merge files to pdf" });
  }
};

export const mergeAndSavePdf = async (req, res) => {
  let tempFiles = [];

  try {
    const authHeader =
      req.headers["authorization"] || req.headers["x-authorization"];
    const accessToken = authHeader?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0)
      return res.status(400).json({ message: "No files uploaded for merging" });

    const mergedPdf = await PDFLibDocument.create();
    const tempDir = path.join(__dirname, STORAGE_PATH, "temp");
    await fs.mkdir(tempDir, { recursive: true });

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const fileExtension = path.extname(file.originalname).toLowerCase();

      const tempFilePath = path.join(
        tempDir,
        `temp_${Date.now()}_${i}${fileExtension}`,
      );
      await fs.writeFile(tempFilePath, file.buffer);
      tempFiles.push(tempFilePath);

      try {
        if (fileExtension === ".pdf") {
          const pdfDoc = await PDFLibDocument.load(file.buffer);
          const copiedPages = await mergedPdf.copyPages(
            pdfDoc,
            pdfDoc.getPageIndices(),
          );
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        } else if ([".jpg", ".jpeg", ".png"].includes(fileExtension)) {
          let image = sharp(file.buffer, { failOn: "none" });
          const metadata = await image.metadata();
          const imageObj = [".jpg", ".jpeg"].includes(fileExtension)
            ? await mergedPdf.embedJpg(file.buffer)
            : await mergedPdf.embedPng(await image.png().toBuffer());
          const page = mergedPdf.addPage([metadata.width, metadata.height]);
          page.drawImage(imageObj, {
            x: 0,
            y: 0,
            width: metadata.width,
            height: metadata.height,
          });
        } else if (
          [".docx", ".doc", ".xlsx", ".xls", ".ppt", ".pptx"].includes(
            fileExtension,
          )
        ) {
          try {
            const convertedPdfPath = await executeLibreOfficeConversion(
              tempFilePath,
              tempDir,
            );
            tempFiles.push(convertedPdfPath);

            const convertedPdfBytes = await fs.readFile(convertedPdfPath);
            const pdfDoc = await PDFLibDocument.load(convertedPdfBytes);
            const copiedPages = await mergedPdf.copyPages(
              pdfDoc,
              pdfDoc.getPageIndices(),
            );
            copiedPages.forEach((page) => mergedPdf.addPage(page));
          } catch (docErr) {
            console.log("Merge and Save Doc Error:", docErr.message);
          }
        }
      } catch (docError) {
        continue;
      }
    }

    const mergedPdfBytes = await mergedPdf.save();
    const timestamp = Date.now();
    const fileName = `merged_documents_${timestamp}.pdf`;
    const filePath = `temp/merged/${fileName}`;
    const fullPath = path.join(__dirname, STORAGE_PATH, filePath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, mergedPdfBytes);

    const newDocument = await prisma.document.create({
      data: {
        name: fileName,
        type: "pdf",
        path: filePath,
        createdById: userData.id,
        isInvolvedInProcess: false,
        isRecord: false,
      },
    });

    if (typeof createUserPermissions !== "undefined") {
      await createUserPermissions(newDocument.id, userData.username, true);
    }

    const fileURLBase = process.env.FILE_URL;
    const fileURL = `${fileURLBase}${filePath}?token=${accessToken}`;

    return res.status(200).json({
      message: "Files merged and saved successfully",
      documentId: newDocument.id,
      fileUrl: fileURL,
      fileName: fileName,
      pageCount: mergedPdf.getPageCount(),
    });
  } catch (error) {
    console.log(error);
    await cleanupTempFiles(tempFiles, null);
    return res
      .status(500)
      .json({ message: "problem doing merge and save pdf" });
  }
};

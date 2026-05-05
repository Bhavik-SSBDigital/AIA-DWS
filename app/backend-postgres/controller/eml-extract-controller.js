import { spawn, execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fsSync from "fs";
import { dirname } from "path";
import fs from "fs/promises";
import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../utility/verifyUser.js";
import { generateUniqueDocumentName } from "./process-controller.js";
import PDFDocument from "pdfkit";
import { PDFDocument as PDFLibDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient();
const STORAGE_PATH = process.env.STORAGE_PATH || "../storage";

// ======================================================================
// 🛡️ UNIVERSAL OS LIBREOFFICE COMMAND GENERATOR
// ======================================================================
const getSofficeCommand = (outDir, inFile) => {
  const platform = os.platform();
  if (platform === "darwin") {
    return `PATH=$PATH:/opt/homebrew/bin:/usr/local/bin:/Applications/LibreOffice.app/Contents/MacOS soffice --headless --convert-to pdf --outdir "${outDir}" "${inFile}"`;
  } else if (platform === "win32") {
    return `""C:\\Program Files\\LibreOffice\\program\\soffice.exe"" --headless --convert-to pdf --outdir "${outDir}" "${inFile}"`;
  } else {
    return `soffice --headless --convert-to pdf --outdir "${outDir}" "${inFile}"`;
  }
};

const executeLibreOfficeConversion = async (inputFilePath, outputDir) => {
  try {
    const command = getSofficeCommand(outputDir, inputFilePath);
    execSync(command, { stdio: "ignore" });
    const parsedPath = path.parse(inputFilePath);
    return path.join(outputDir, `${parsedPath.name}.pdf`);
  } catch (error) {
    console.log("LibreOffice Error:", error.message);
    throw new Error(
      `LibreOffice conversion failed. Ensure LibreOffice is installed.`,
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

// ======================================================================
// USER'S ORIGINAL EML HELPERS (UNTOUCHED)
// ======================================================================
const parseEnterpriseThread = (bodyText, rootEmailMeta) => {
  if (!bodyText) return [{ ...rootEmailMeta, body_plain: "(No content)" }];
  const lines = bodyText.split(/\r?\n/);
  const thread = [];
  let currentMsg = {
    from: rootEmailMeta.from || "Unknown",
    to: rootEmailMeta.to || "Unknown",
    date: rootEmailMeta.date || "Unknown",
    subject: rootEmailMeta.subject || "No Subject",
    cc: rootEmailMeta.cc || "",
    bcc: rootEmailMeta.bcc || "",
    content: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleaned = line.replace(/^(>\s*)+/, "").trim();
    const isGmailStart = cleaned.match(/^On\s+.*\s+wrote:\s*$/i);
    const isOutlookStart =
      cleaned.toLowerCase().startsWith("from:") &&
      i + 1 < lines.length &&
      lines[i + 1].toLowerCase().includes("sent:");
    const isHorizontalRule = cleaned.match(/^[- ]*Original Message[- ]*$/i);

    if (isGmailStart || isHorizontalRule || isOutlookStart) {
      const body = currentMsg.content.join("\n").trim();
      if (body.length > 20) {
        currentMsg.body_plain = body;
        thread.push({ ...currentMsg });
      }
      currentMsg = {
        from: "Unknown",
        to: "Unknown",
        date: "Unknown",
        subject: rootEmailMeta.subject,
        cc: "",
        bcc: "",
        content: [],
      };
      if (isGmailStart) {
        const metaMatch = cleaned.match(
          /On\s+(.*?)\s+([^<>]+<[^<>]+>|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[a-zA-Z\s<>.@]+)\s+wrote:/i,
        );
        if (metaMatch) {
          currentMsg.date = metaMatch[1].trim();
          currentMsg.from = metaMatch[2].trim();
        }
      }
      if (isHorizontalRule) continue;
    }
    if (/^From:/i.test(cleaned))
      currentMsg.from = cleaned.replace(/^From:\s*/i, "");
    else if (/^Sent:|^Date:/i.test(cleaned))
      currentMsg.date = cleaned.replace(/^(Sent|Date):\s*/i, "");
    else if (/^To:/i.test(cleaned))
      currentMsg.to = cleaned.replace(/^To:\s*/i, "");
    else if (/^Cc:/i.test(cleaned))
      currentMsg.cc = cleaned.replace(/^Cc:\s*/i, "");
    else if (/^Bcc:/i.test(cleaned))
      currentMsg.bcc = cleaned.replace(/^Bcc:\s*/i, "");
    else if (/^Subject:/i.test(cleaned))
      currentMsg.subject = cleaned.replace(/^Subject:\s*/i, "");
    else currentMsg.content.push(cleaned);
  }

  currentMsg.body_plain = currentMsg.content.join("\n").trim();
  thread.push(currentMsg);
  const filtered = thread.filter((m) => m.body_plain.length > 30);
  return filtered.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
};

const generateThreadContextPDF = async (
  allMessages,
  pdfFullPath,
  threadSubject,
) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 45,
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
        success: "#10b981",
        warning: "#f59e0b",
        text: "#0f172a",
        lightText: "#64748b",
      };
      const fonts = {
        bold: "Helvetica-Bold",
        regular: "Helvetica",
        oblique: "Helvetica-Oblique",
      };
      const pageWidth = doc.page.width - 90;

      doc.registerFont("Helvetica", "Helvetica");
      doc.registerFont("Helvetica-Bold", "Helvetica-Bold");
      doc.registerFont("Helvetica-Oblique", "Helvetica-Oblique");

      const addPageHeader = () => {
        doc.fontSize(8).font(fonts.regular).fillColor(colors.lightText);
        doc.text("Email Thread Context Document", 45, 25, {
          width: pageWidth,
          align: "left",
        });
        doc
          .fontSize(8)
          .text(`Generated: ${new Date().toLocaleString()}`, 45, 40, {
            width: pageWidth,
            align: "right",
          });
        doc
          .moveTo(45, 48)
          .lineTo(550, 48)
          .strokeColor(colors.border)
          .lineWidth(0.5)
          .stroke();
      };

      const addPageFooter = (pageNumber) => {
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
          });
      };

      addPageHeader();

      doc.fontSize(24).font(fonts.bold).fillColor(colors.primary);
      doc.text("Email Thread", 45, 65);
      doc.fontSize(14).font(fonts.bold).fillColor(colors.accent);
      doc.text(threadSubject || "Conversation History", 45, 95, {
        width: pageWidth,
        height: 40,
      });

      const summaryY = doc.y + 15;
      doc
        .rect(45, summaryY, pageWidth, 45)
        .fillAndStroke(colors.lightBg, colors.border);
      doc.fontSize(9).font(fonts.bold).fillColor(colors.primary);
      doc.text(`Total Messages: ${allMessages.length}`, 55, summaryY + 8);
      doc.fontSize(9).font(fonts.regular).fillColor(colors.secondary);
      doc.text(
        `Date Range: ${formatDate(allMessages[0]?.date)} to ${formatDate(allMessages[allMessages.length - 1]?.date)}`,
        55,
        summaryY + 23,
      );
      doc.y = summaryY + 50;

      allMessages.forEach((msg, idx) => {
        if (doc.y > 650) {
          addPageFooter(doc.bufferedPageRange().count);
          doc.addPage();
          addPageHeader();
        }

        const messageNumber = idx + 1;
        const bgColor = idx % 2 === 0 ? colors.lightBg : "#ffffff";

        doc.rect(45, doc.y, pageWidth, 3).fill(colors.accent);
        doc.moveDown(0.3);
        doc
          .rect(45, doc.y, pageWidth, 68)
          .fillAndStroke(bgColor, colors.border);

        const headerY = doc.y + 8;
        doc
          .fontSize(11)
          .font(fonts.bold)
          .fillColor(colors.primary)
          .text(`Message ${messageNumber}`, 55, headerY);
        doc
          .fontSize(8)
          .font(fonts.regular)
          .fillColor(colors.lightText)
          .text(`${formatDate(msg.date)}`, 55, headerY + 16);

        doc
          .fontSize(8)
          .font(fonts.bold)
          .fillColor(colors.secondary)
          .text("FROM:", 55, headerY + 32);
        doc
          .font(fonts.regular)
          .fillColor(colors.text)
          .text(truncateEmail(msg.from, 60), 90, headerY + 32, { width: 450 });
        doc
          .fontSize(8)
          .font(fonts.bold)
          .fillColor(colors.secondary)
          .text("TO:", 55, headerY + 44);
        doc
          .font(fonts.regular)
          .fillColor(colors.text)
          .text(truncateEmail(msg.to, 60), 90, headerY + 44, { width: 450 });

        if (msg.cc && msg.cc.trim()) {
          doc
            .fontSize(8)
            .font(fonts.bold)
            .fillColor(colors.secondary)
            .text("CC:", 55, headerY + 56);
          doc
            .font(fonts.regular)
            .fillColor(colors.text)
            .text(truncateEmail(msg.cc, 60), 90, headerY + 56, { width: 450 });
        }

        doc.y = headerY + 70;
        doc
          .fontSize(10)
          .font(fonts.bold)
          .fillColor(colors.primary)
          .text("SUBJECT:", 55, doc.y);
        doc
          .fontSize(10)
          .font(fonts.bold)
          .fillColor(colors.accent)
          .text(msg.subject || "(No Subject)", 55, doc.y + 12, {
            width: pageWidth - 20,
            height: 20,
          });
        doc.moveDown(0.5);
        doc
          .moveTo(45, doc.y)
          .lineTo(550, doc.y)
          .strokeColor(colors.border)
          .lineWidth(0.5)
          .stroke();
        doc.moveDown(0.3);
        doc.fontSize(9).font(fonts.regular).fillColor(colors.text);

        const bodyText = (msg.body_plain || "").trim();
        const bodyLines = bodyText.split("\n");
        const maxBodyLines = 30;
        const displayBodyLines = bodyLines.slice(0, maxBodyLines);

        displayBodyLines.forEach((line) => {
          if (doc.y > 680) {
            addPageFooter(doc.bufferedPageRange().count);
            doc.addPage();
            addPageHeader();
          }
          doc.text(line.trim() || " ", 55, doc.y, {
            width: pageWidth - 20,
            align: "left",
            lineGap: 2,
          });
        });

        if (bodyLines.length > maxBodyLines) {
          doc
            .fontSize(8)
            .font(fonts.oblique)
            .fillColor(colors.warning)
            .text("... [message truncated for display]", 55, doc.y);
        }
        doc.moveDown(0.8);

        if (idx < allMessages.length - 1) {
          doc
            .moveTo(45, doc.y)
            .lineTo(550, doc.y)
            .strokeColor(colors.border)
            .lineWidth(1)
            .stroke();
          doc.moveDown(0.5);
        }
      });

      addPageFooter(doc.bufferedPageRange().count);
      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
};

const formatDate = (dateString) => {
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateString;
  }
};

const truncateEmail = (email, length) => {
  if (!email) return "N/A";
  return email.length > length ? email.substring(0, length) + "..." : email;
};

// ======================================================================
// 1. EXTRACT EML DETAILS (FORCED PDF CONVERSION FOR IMAGES & DOCS)
// ======================================================================
export const extractEMLDetails = async (req, res) => {
  const accessToken =
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.headers["x-authorization"]?.substring(7);

  if (!accessToken)
    return res.status(401).json({ message: "No authorization token provided" });

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
    const pythonProcess = spawn("python3", [pythonScriptPath, emlFilePath]);

    let output = "";
    let errorOutput = "";

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on("close", async (code) => {
      try {
        if (code !== 0) {
          return res
            .status(500)
            .json({ message: "Python extraction failed", error: errorOutput });
        }

        const extractionResult = JSON.parse(output);
        const attachmentsWithDocumentIds = [];
        const uploadedDocumentIds = [];

        for (const attachment of extractionResult.attachments || []) {
          const originalBuffer = Buffer.from(
            attachment.base64_content,
            "base64",
          );
          const originalExt = attachment.filename
            .split(".")
            .pop()
            .toLowerCase();
          const originalBaseName =
            attachment.filename.substring(
              0,
              attachment.filename.lastIndexOf("."),
            ) || attachment.filename;

          let finalBuffer = originalBuffer;
          let finalExt = originalExt;
          let finalDisplayFilename = attachment.filename;

          // ------------------------------------------------------------------
          // FORCE PDF CONVERSION FOR TARGET EXTENSIONS
          // ------------------------------------------------------------------
          if (["jpg", "jpeg", "png"].includes(originalExt)) {
            try {
              const imgPdf = await PDFLibDocument.create();
              let image = sharp(originalBuffer, { failOn: "none" });
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
              console.log(
                `Fallback for fake/corrupted image ${attachment.filename}. Forcing PDF extension.`,
              );
              const errPdf = await PDFLibDocument.create();
              const page = errPdf.addPage([595.28, 841.89]);
              page.drawText(
                "[Image Conversion Failed or Dummy Data Provided]",
                { x: 50, y: 800, size: 12 },
              );
              finalBuffer = Buffer.from(await errPdf.save());
              finalExt = "pdf";
              finalDisplayFilename = `${originalBaseName}.pdf`;
            }
          } else if (["doc", "docx"].includes(originalExt)) {
            const tempDir = path.join(__dirname, STORAGE_PATH, "temp");
            await fs.mkdir(tempDir, { recursive: true });
            const tempOriginal = path.join(
              tempDir,
              `eml_att_${Date.now()}.${originalExt}`,
            );

            try {
              await fs.writeFile(tempOriginal, originalBuffer);
              const convertedPdfPath = await executeLibreOfficeConversion(
                tempOriginal,
                tempDir,
              );
              finalBuffer = await fs.readFile(convertedPdfPath);
              finalExt = "pdf";
              finalDisplayFilename = `${originalBaseName}.pdf`;
              await fs.unlink(convertedPdfPath).catch(() => {});
            } catch (convErr) {
              console.log(
                `Fallback for fake/corrupted doc ${attachment.filename}. Forcing PDF extension.`,
              );
              const errPdf = await PDFLibDocument.create();
              const page = errPdf.addPage([595.28, 841.89]);
              page.drawText("[Doc Conversion Failed or Dummy Data Provided]", {
                x: 50,
                y: 800,
                size: 12,
              });
              finalBuffer = Buffer.from(await errPdf.save());
              finalExt = "pdf";
              finalDisplayFilename = `${originalBaseName}.pdf`;
            } finally {
              await fs.unlink(tempOriginal).catch(() => {});
            }
          }
          // Any other extension (xls, xlsx, pdf, zip) ignores the above blocks completely
          // ------------------------------------------------------------------

          const safeName = await generateUniqueDocumentName({
            workflowId,
            extension: finalExt,
          });
          const relPath = path.join(path.dirname(emlDocument.path), safeName);
          const fullPath = path.join(__dirname, STORAGE_PATH, relPath);

          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, finalBuffer);

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

        let allMessages = [];
        const threadSubject =
          extractionResult.emails?.[0]?.subject || "Email Thread";

        (extractionResult.emails || []).forEach((email) => {
          const parsed = parseEnterpriseThread(email.body_text, email);
          allMessages.push(...parsed);
        });

        allMessages.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return dateA - dateB;
        });

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

        await fs.mkdir(path.dirname(threadContextFullPath), {
          recursive: true,
        });
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
              has_thread_context_pdf: true,
              thread_subject: threadSubject,
            },
          },
        });
      } catch (e) {
        console.error("Extraction error:", e);
        res.status(500).json({
          message: "Extraction failed",
          error: e.message,
          stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
        });
      }
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ======================================================================
// 2. CONVERT SINGLE IMAGE/DOC TO PDF
// ======================================================================
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

// ======================================================================
// 3. MERGE FILES TO PDF
// ======================================================================
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

// ======================================================================
// 4. MERGE AND SAVE PDF
// ======================================================================
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

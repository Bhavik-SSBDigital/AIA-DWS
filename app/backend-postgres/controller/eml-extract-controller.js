import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fsSync from "fs";
import { dirname } from "path";
import fs from "fs/promises";
import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../utility/verifyUser.js";
import { generateUniqueDocumentName } from "./process-controller.js";
import PDFDocument from "pdfkit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient();
const STORAGE_PATH = process.env.STORAGE_PATH || "../storage";

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

  const isHeaderStart = (line) =>
    /^From:|^Sent:|^Date:|^To:|^Subject:/i.test(line);

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
    else {
      currentMsg.content.push(cleaned);
    }
  }

  currentMsg.body_plain = currentMsg.content.join("\n").trim();
  thread.push(currentMsg);

  const filtered = thread.filter((m) => m.body_plain.length > 30);
  return filtered.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateA - dateB;
  });
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
      const lineHeight = 1.5;

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

        doc.fontSize(8).font(fonts.regular).fillColor(colors.lightText);
        doc.text(`${formatDate(msg.date)}`, 55, headerY + 16);

        doc.fontSize(8).font(fonts.bold).fillColor(colors.secondary);
        doc.text("FROM:", 55, headerY + 32);
        doc.font(fonts.regular).fillColor(colors.text);
        doc.text(truncateEmail(msg.from, 60), 90, headerY + 32, { width: 450 });

        doc.fontSize(8).font(fonts.bold).fillColor(colors.secondary);
        doc.text("TO:", 55, headerY + 44);
        doc.font(fonts.regular).fillColor(colors.text);
        doc.text(truncateEmail(msg.to, 60), 90, headerY + 44, { width: 450 });

        if (msg.cc && msg.cc.trim()) {
          doc.fontSize(8).font(fonts.bold).fillColor(colors.secondary);
          doc.text("CC:", 55, headerY + 56);
          doc.font(fonts.regular).fillColor(colors.text);
          doc.text(truncateEmail(msg.cc, 60), 90, headerY + 56, { width: 450 });
        }

        doc.y = headerY + 70;

        doc
          .fontSize(10)
          .font(fonts.bold)
          .fillColor(colors.primary)
          .text("SUBJECT:", 55, doc.y);
        doc.fontSize(10).font(fonts.bold).fillColor(colors.accent);
        doc.text(msg.subject || "(No Subject)", 55, doc.y + 12, {
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
        const truncated = bodyLines.length > maxBodyLines;

        displayBodyLines.forEach((line) => {
          if (doc.y > 680) {
            addPageFooter(doc.bufferedPageRange().count);
            doc.addPage();
            addPageHeader();
          }

          const displayText = line.trim() || " ";
          doc.text(displayText, 55, doc.y, {
            width: pageWidth - 20,
            align: "left",
            lineGap: 2,
          });
        });

        if (truncated) {
          doc.fontSize(8).font(fonts.oblique).fillColor(colors.warning);
          doc.text("... [message truncated for display]", 55, doc.y);
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
          return res.status(500).json({
            message: "Python extraction failed",
            error: errorOutput,
          });
        }

        const extractionResult = JSON.parse(output);
        const attachmentsWithDocumentIds = [];
        const uploadedDocumentIds = [];

        for (const attachment of extractionResult.attachments || []) {
          const buffer = Buffer.from(attachment.base64_content, "base64");
          const safeName = await generateUniqueDocumentName({
            workflowId,
            extension: attachment.filename.split(".").pop(),
          });
          const relPath = path.join(path.dirname(emlDocument.path), safeName);
          const fullPath = path.join(__dirname, STORAGE_PATH, relPath);

          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, buffer);

          const newDoc = await prisma.document.create({
            data: {
              name: safeName,
              type: path.extname(attachment.filename).replace(".", ""),
              path: relPath,
              createdById: userData.id,
              parentId: parseInt(documentId),
              isRecord: true,
              tags: [`extracted-from-eml:${documentId}`, "attachment"],
            },
          });

          uploadedDocumentIds.push(newDoc.id);
          attachmentsWithDocumentIds.push({
            ...attachment,
            originalFilename: safeName,
            documentId: newDoc.id,
            fileType: path.extname(attachment.filename).replace(".", ""),
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
          message: `Successfully extracted email thread with ${
            uploadedDocumentIds.length - 1
          } attachment(s) and generated formatted thread context PDF`,
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

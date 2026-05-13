import { verifyUser } from "../utility/verifyUser.js";
import axios from "axios";
import FTPClient from "ftp";
import pkg from "@prisma/client";
import { executePythonScript } from "./e-sign-controller.js";
import { file_copy, delete_file } from "./file-controller.js";
import { createFolder } from "./file-controller.js";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import { dirname, join, normalize, extname } from "path";
import { file_delete } from "./file-controller.js";
import { watermarkDocument } from "./watermark.js";
import dotenv from "dotenv";
import { sendProcessNotification } from "../services/emailService.js";
import {
  createPaymentSchedule,
  handleOnApprovalPayment,
} from "../services/paymentScheduler.js";
import fs from "fs/promises";

dotenv.config();

import path from "path";

const STORAGE_PATH = process.env.STORAGE_PATH;
const P2P_SERVER = process.env.P2P_SERVER;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const {
  PrismaClient,
  AccessType,
  NotificationType,
  ProcessStatus,
  StepStatus,
} = pkg;

const prisma = new PrismaClient();

async function connectWithRetry(maxRetries = 5, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();

      return true;
    } catch (error) {
      if (
        error.message.includes("Engine is not yet connected") &&
        i < maxRetries - 1
      ) {
        console.warn(
          `Connection attempt ${i + 1} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(2, i)),
        ); // Exponential backoff
      } else {
        throw error; // Throw if max retries reached or different error
      }
    }
  }
}

connectWithRetry().catch((err) => {
  console.error("Failed to connect to Prisma client:", err);
  process.exit(1); // Exit process if connection fails
});

const checkUserProcessAssignment = async (processId, userId) => {
  try {
    // Validate input
    if (!processId || userId === undefined || userId === null) {
      return {
        success: false,
        hasAssignment: false,
        error: "processId and userId are required parameters",
      };
    }

    // Convert userId to number if it's a string
    const numericUserId =
      typeof userId === "string" ? parseInt(userId, 10) : userId;

    if (isNaN(numericUserId)) {
      return {
        success: false,
        hasAssignment: false,
        error: "userId must be a valid number",
      };
    }

    // Check if user has any step instance assigned in the process
    const stepInstance = await prisma.processStepInstance.findFirst({
      where: {
        processId: processId,
        assignedTo: numericUserId,
        status: {
          in: [
            "PENDING",
            "IN_PROGRESS",
            "FOR_RECIRCULATION",
            "FOR_RECOMMENDATION",
          ],
        },
      },
      select: {
        id: true,
      },
    });

    const hasAssignment = !!stepInstance;

    return hasAssignment;
  } catch (error) {
    console.error("Error checking user process assignment:", error);
    return {
      success: false,
      hasAssignment: false,
      error: error.message || "Internal server error",
    };
  }
};

async function checkDocumentAccess(userId, documentId, requiredAccess) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });

  const userDepartments = await prisma.department.findMany({
    where: { users: { some: { id: userId } } },
    select: { id: true },
  });

  return prisma.documentAccess.findFirst({
    where: {
      documentId,
      accessType: requiredAccess,
      stepInstance: {
        status: { in: ["IN_PROGRESS", "IN_PROGRESS"] },
        process: { status: "IN_PROGRESS" },
      },
      OR: [
        { userId },
        { roleId: { in: userRoles.map((r) => r.roleId) } },
        { departmentId: { in: userDepartments.map((d) => d.id) } },
      ],
    },
  });
}

export async function generateDocumentNameController(req, res) {
  try {
    const { workflowId, replacedDocId, extension } = req.body;

    if (!workflowId) {
      return res.status(400).json({ error: "workflowId is required" });
    }

    const documentName = await generateUniqueDocumentName({
      workflowId,
      replacedDocId,
      extension,
    });

    return res.json({ documentName });
  } catch (error) {
    console.error("Error in document name controller:", error);
    return res.status(500).json({ error: "Failed to generate document name" });
  }
}

export async function generateUniqueDocumentName({
  workflowId,
  replacedDocId,
  extension,
}) {
  try {
    // Fetch workflow details
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true, version: true },
    });

    if (!workflow) {
      throw new Error(`Workflow with ID ${workflowId} not found`);
    }

    const { name: workflowName, version: workflowVersion } = workflow;

    // Format date as YYYYMMDD
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    // Base name for documents
    const baseDocName = `${workflowName}_w${workflowVersion}_${dateStr}`;

    if (replacedDocId) {
      // Handle document replacement
      const existingDoc = await prisma.document.findFirst({
        where: { id: parseInt(replacedDocId) },
      });

      if (!existingDoc) {
        throw new Error(`Document with id ${replacedDocId} not found`);
      }

      // Extract version
      const parts = existingDoc.name.split("_");
      const versionPart = parts[parts.length - 1];
      const version = parseInt(versionPart.replace("v", ""), 10) || 1;
      const newVersion = version + 1;

      // Construct new name by replacing version
      const newDocName = `${parts
        .slice(0, -1)
        .join("_")}_v${newVersion}.${extension}`;

      // // Verify uniqueness
      // const existing = await prisma.document.findFirst({
      //   where: { name: newDocName },
      // });

      // if (existing) {
      //   throw new Error(`Document name ${newDocName} already exists`);
      // }

      return newDocName;
    } else {
      // Handle new document
      const existingDocs = await prisma.document.findMany({
        where: {},
        select: { name: true },
      });

      // Extract serial numbers
      const serialNumbers = existingDocs
        .map((doc) => {
          const parts = doc.name.split("_");
          const serial = parseInt(parts[parts.length - 2], 10) || 0;
          return serial;
        })
        .filter((num) => !isNaN(num));

      const nextSerialNumber =
        serialNumbers.length > 0 ? Math.max(...serialNumbers) + 1 : 1;

      const newDocName = `${baseDocName}_${nextSerialNumber
        .toString()
        .padStart(3, "0")}_v1`;

      // Verify uniqueness
      const existing = await prisma.document.findFirst({
        where: { name: newDocName },
      });

      if (existing) {
        throw new Error(`Document name ${newDocName} already exists`);
      }

      return `${newDocName}.${extension}`;
    }
  } catch (error) {
    console.error("Error generating unique document name:", error);
    throw error;
  } finally {
    // await prisma.$disconnect();
  }
}

const generate_unique_process_name = async (workflowId) => {
  try {
    // Fetch workflow name and version
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true, version: true },
    });

    if (!workflow) {
      throw new Error(`Workflow with ID ${workflowId} not found`);
    }

    const { name: workflowName, version: workflowVersion } = workflow;

    // Format date as YYYYMMDD
    const today = new Date();
    const processCreationDate = today
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");

    // Base process name
    const baseProcessName = `${workflowName}_w${workflowVersion}_${processCreationDate}`;

    // Find existing processes with same base name
    const existingProcesses = await prisma.processInstance.findMany({
      where: {
        name: {
          startsWith: baseProcessName,
        },
      },
      select: { name: true },
    });

    // Extract serial numbers
    const serialNumbers = existingProcesses
      .map((process) => {
        const parts = process.name.split("_");
        const serial = parts[parts.length - 1];
        return parseInt(serial, 10) || 0;
      })
      .filter((num) => !isNaN(num));

    // Determine next serial number
    const nextSerialNumber =
      serialNumbers.length > 0 ? Math.max(...serialNumbers) + 1 : 1;

    // Construct unique process name with 3-digit serial number
    const uniqueProcessName = `${baseProcessName}_${nextSerialNumber
      .toString()
      .padStart(3, "0")}`;

    return uniqueProcessName;
  } catch (error) {
    console.error("Error generating unique process name:", error);
    throw error;
  } finally {
    // await prisma.$disconnect();
  }
};

// Helper to get process tags (unique tags from all processDocuments)
// Helper to get process tag directly from ProcessInstance
const getProcessTags = async (processId) => {
  const processInstance = await prisma.processInstance.findUnique({
    where: { id: processId },
    select: { tags: true },
  });

  return processInstance?.tags || [];
};

import { exec } from "child_process";
import { promisify } from "util";
const execPromise = promisify(exec);

/**
 * Appends an HTML description to an existing PDF, placing it right after the
 * last content on the last page (like a signature), using the same Y‑coordinate
 * detection as the signing process.
 *
 * @param {string} pdfPath - Path to the existing PDF file.
 * @param {string} descriptionHtml - HTML string (typically a table) to append.
 * @param {string} pythonEnvPath - Path to Python executable (e.g., venv/bin/python).
 * @param {string} pythonScriptPath - Path to getFileSpace.py script.
 * @param {object} options - Optional settings.
 * @param {number} options.marginTop - Top margin in points (default 20).
 * @param {number} options.marginBottom - Bottom margin (default 20).
 * @param {number} options.marginLeft - Left margin (default 20).
 * @param {number} options.marginRight - Right margin (default 20).
 */

async function appendDescriptionToPdf(
  pdfDoc,
  lastPage,
  documentPath,
  descriptionHtml,
  pythonEnvPath,
  pythonScriptPath,
  options = {},
) {
  const { marginLeft = 50, marginTop = 50, safetyMargin = 25 } = options;

  let browser = null;

  try {
    const absDocumentPath = path.join(
      __dirname,
      "../../../../",
      "storage",
      documentPath,
    );

    // -----------------------------------------
    // ✅ CORRECT SPACE CALCULATION (FIXED)
    // -----------------------------------------
    let contentExtremes;
    try {
      contentExtremes = await executePythonScript(
        pythonEnvPath,
        pythonScriptPath,
        absDocumentPath,
      );
    } catch (e) {
      contentExtremes = {
        height: lastPage.getHeight(),
        last_y: 0,
      };
    }

    const pageHeight = contentExtremes.height || lastPage.getHeight();

    // 🔥 Convert TOP-based (pdfplumber) → BOTTOM-based (pdf-lib)
    const usedFromTop = contentExtremes.last_y || 0;
    const freeSpaceBottom = Math.max(0, pageHeight - usedFromTop);

    // Start Y from bottom coordinate system
    let startY = freeSpaceBottom - safetyMargin;

    // -----------------------------------------
    // 🚀 RENDER HTML USING PUPPETEER (UNCHANGED)
    // -----------------------------------------
    browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      headless: "new",
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1080 });

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

    await page.setContent(fullHtml, { waitUntil: "networkidle0" });

    const container = await page.$(".description-container");
    const box = await container.boundingBox();

    const rawWidth = Math.ceil(box.width) + 10;
    const rawHeight = Math.ceil(box.height) + 10;

    const pdfBuffer = await page.pdf({
      width: `${rawWidth}px`,
      height: `${rawHeight}px`,
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    const tempDoc = await PDFDocument.load(pdfBuffer);
    const embeddedPage = await pdfDoc.embedPage(tempDoc.getPages()[0]);

    // -----------------------------------------
    // 📐 SCALE TO FIT WIDTH
    // -----------------------------------------
    const maxWidth = lastPage.getWidth() - marginLeft * 2;
    const scale = rawWidth > maxWidth ? maxWidth / rawWidth : 1;

    const finalWidth = rawWidth * scale;
    const finalHeight = rawHeight * scale;

    // -----------------------------------------
    // 🎯 SMART PLACEMENT (FIXED)
    // -----------------------------------------
    let targetPage = lastPage;
    let pagesAdded = 0;

    // If not enough space → new page
    if (startY < marginTop || finalHeight > startY) {
      targetPage = pdfDoc.addPage([lastPage.getWidth(), lastPage.getHeight()]);
      startY = targetPage.getHeight() - marginTop;
      pagesAdded++;
    }

    let remainingHeight = finalHeight;
    let offsetY = 0;

    while (remainingHeight > 0) {
      const availableHeight = startY - marginTop;

      const drawHeight = Math.min(availableHeight, remainingHeight);

      targetPage.drawPage(embeddedPage, {
        x: marginLeft,
        y: startY - drawHeight,
        width: finalWidth,
        height: finalHeight,
      });

      remainingHeight -= drawHeight;

      if (remainingHeight > 0) {
        targetPage = pdfDoc.addPage([
          lastPage.getWidth(),
          lastPage.getHeight(),
        ]);
        startY = targetPage.getHeight() - marginTop;
        pagesAdded++;
      }
    }

    return {
      x: marginLeft,
      y: startY,
      width: finalWidth,
      height: finalHeight,
      pagesAdded,
      newlyAdded: pagesAdded > 0,
    };
  } catch (err) {
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

export const initiate_process = async (req, res, next) => {
  try {
    const pythonScriptPath = path.join(
      __dirname,
      "../../support/getFileSpace.py",
    );
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const {
      description,
      workflowId,
      issueNo,
      emailThreads = [],
      tag,
      printDescriptionPref = "NONE",
    } = req.body;

    const processName = await generate_unique_process_name(workflowId);

    const workflowDetails = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true },
    });

    const workflowName = workflowDetails.name;

    await createFolder(false, `../${workflowName}/${processName}`, userData);

    let documentIds = req.body.documents?.map((item) => item.documentId) || [];
    const copiedDocumentIds = [];

    for (const documentId of documentIds) {
      const document = await prisma.document.findUnique({
        where: { id: parseInt(documentId) },
        select: { path: true, type: true, name: true },
      });

      if (document) {
        const sourcePath = `./${document.path}`;
        const destinationPath = `../${workflowName}/${processName}`;
        const name = document.name;

        try {
          const copyResult = await new Promise((resolve, reject) => {
            file_copy(
              {
                headers: { authorization: `Bearer ${accessToken}` },
                body: { sourcePath, destinationPath, name },
              },
              {
                status: (code) => ({
                  json: (data) => {
                    if (code === 200) resolve(data);
                    else reject(data);
                  },
                }),
              },
            );
          });

          if (copyResult.documentId) {
            copiedDocumentIds.push({
              newDocId: copyResult.documentId,
              oldDocId: documentId,
              type: document.type,
              newPath: copyResult.newPath || copyResult.documentPath,
            });
          }

          await new Promise((resolve, reject) => {
            delete_file(
              {
                headers: { authorization: `Bearer ${accessToken}` },
                body: { documentId },
              },
              {
                status: (code) => ({
                  json: (data) => {
                    if (code === 200) resolve(data);
                    else reject(data);
                  },
                }),
              },
            );
          });
        } catch (error) {}
      }
    }

    const requestedDocCount = req.body.documents?.length || 0;
    if (
      copiedDocumentIds.length === 0 ||
      copiedDocumentIds.length !== requestedDocCount
    ) {
      return res.status(500).json({
        message:
          "Failed to copy one or more documents. Process initiation aborted.",
      });
    }

    if (printDescriptionPref !== "NONE") {
      for (const docObj of copiedDocumentIds) {
        if (docObj.type.toLowerCase() === "pdf") {
          const reqDoc = req.body.documents.find(
            (d) => d.documentId === docObj.oldDocId,
          );

          let descToPrint = "";
          if (printDescriptionPref === "PROCESS" && description) {
            descToPrint = description;
          } else if (
            printDescriptionPref === "INDIVIDUAL" &&
            reqDoc &&
            reqDoc.description
          ) {
            descToPrint = reqDoc.description;
          }

          if (descToPrint && descToPrint.trim() !== "") {
            const physicalDocInfo = await prisma.document.findUnique({
              where: { id: parseInt(docObj.newDocId) },
              select: { path: true },
            });

            if (physicalDocInfo) {
              const documentPath = physicalDocInfo.path;
              const absolutePath = path.join(
                __dirname,
                "../../../../",
                "storage",
                documentPath,
              );

              try {
                const existingPdfBytes = await fs.readFile(absolutePath);

                const pdfDoc = await PDFDocument.load(existingPdfBytes, {
                  ignoreEncryption: true,
                });

                const pages = pdfDoc.getPages();
                if (!pages || pages.length === 0) {
                  throw new Error("No pages found in the PDF.");
                }

                const lastPage = pages[pages.length - 1];

                await appendDescriptionToPdf(
                  pdfDoc,
                  lastPage,
                  documentPath,
                  descToPrint,
                  pythonEnvPath,
                  pythonScriptPath,
                  {},
                );

                const updatedPdfBytes = await pdfDoc.save();
                await fs.writeFile(absolutePath, updatedPdfBytes);
              } catch (pdfError) {}
            }
          }
        }
      }
    }

    documentIds = copiedDocumentIds.map((d) => d.newDocId);

    const initiatorId = userData.id;

    const process = await prisma.$transaction(async (tx) => {
      const process_ = await tx.processInstance.create({
        data: {
          workflowId,
          initiatorId,
          name: processName,
          status: "IN_PROGRESS",
          description: description,
          printDescriptionPref: printDescriptionPref,
          issueNo: issueNo,
          tags: tag ? [tag] : [],
          currentStepId: null,
          reopenCycle: 0,
          storagePath: `../${workflowName}/${processName}`,
        },
      });

      if (emailThreads && emailThreads.length > 0) {
        for (const thread of emailThreads) {
          await tx.emailThread.create({
            data: {
              processId: process_.id,
              threadText: thread.threadText || "Email thread",
              createdById: userData.id,
              metadata: {
                extractionData: {
                  attachments: thread.attachmentsMapping || [],
                  threadTree: thread.threadTree || {},
                  summary: thread.summary || {},
                },
                extractedAt: thread.extractedAt || new Date(),
              },
              originalEmails: thread.emails
                ? {
                    create: thread.emails.map((email) => ({
                      subject: email.subject || "No subject",
                      from: email.from || "",
                      to: email.to
                        ? Array.isArray(email.to)
                          ? email.to
                          : [email.to]
                        : [],
                      cc: email.cc
                        ? Array.isArray(email.cc)
                          ? email.cc
                          : [email.cc]
                        : [],
                      bcc: email.bcc
                        ? Array.isArray(email.bcc)
                          ? email.bcc
                          : [email.bcc]
                        : [],
                      date: (() => {
                        if (!email.date) return new Date();
                        // Normalize Google-style "Mon, Mar 30, 2026 at 12:36 PM" → "Mon, Mar 30, 2026 12:36 PM"
                        const normalized = String(email.date).replace(
                          " at ",
                          " ",
                        );
                        const parsed = new Date(normalized);
                        return isNaN(parsed.getTime()) ? new Date() : parsed;
                      })(),
                      bodyText: email.body_plain || email.bodyText || "",
                      bodyHtml: email.bodyHtml || email.body_html || "",
                      attachments: email.attachments || [],
                      headers: email.headers || {},
                      messageId: email.message_id || "",
                      inReplyTo: Array.isArray(email.in_reply_to)
                        ? email.in_reply_to
                        : [],
                      references: Array.isArray(email.references)
                        ? email.references
                        : [],
                      originalData: email,
                    })),
                  }
                : undefined,
            },
          });
        }
      }

      const documentsArray = req.body.documents || [];
      const processDocumentData = documentsArray.map((item, index) => ({
        processId: process_.id,
        documentId: documentIds[index],
        reopenCycle: 0,
        SOPIssueNo: issueNo || null,
        preApproved: item.preApproved || false,
        tags: item.tags || [],
        partNumber: item.partNumber || null,
        description: item.description || null,
        issueNo: item.issueNo || null,
      }));

      await tx.processDocument.createMany({
        data: processDocumentData,
      });

      const workflow = await tx.workflow.findUnique({
        where: { id: workflowId },
        include: { steps: { include: { assignments: true } } },
      });

      if (!workflow || !workflow.steps.length) {
        throw new Error("Workflow or steps not found");
      }

      const step = workflow.steps[0];

      for (const assignment of step.assignments) {
        await processAssignment(
          tx,
          process_,
          step,
          assignment,
          documentIds,
          false,
          true,
          workflowId,
        );
      }

      await tx.processInstance.update({
        where: { id: process_.id },
        data: { currentStepId: step.id, status: "IN_PROGRESS" },
      });

      return process_;
    });

    try {
      const firstStepInstance = await prisma.processStepInstance.findFirst({
        where: {
          processId: process.id,
          status: "IN_PROGRESS",
        },
        include: {
          process: {
            include: {
              initiator: {
                select: { id: true, username: true, name: true, email: true },
              },
            },
          },
        },
      });

      if (firstStepInstance && firstStepInstance.assignedTo) {
        const assignedUser = await prisma.user.findUnique({
          where: { id: firstStepInstance.assignedTo },
          select: { id: true, email: true, username: true, name: true },
        });

        const processDocs = await prisma.processDocument.findMany({
          where: { processId: process.id },
          include: { document: true },
        });

        const tags = await getProcessTags(process.id);
        const processDescription = process.description;

        if (assignedUser) {
          await sendProcessNotification("stepAssigned", {
            params: [
              firstStepInstance.process,
              firstStepInstance,
              processDocs,
              assignedUser,
              processDescription,
              tags,
            ],
          });
        }
      }
    } catch (emailError) {}

    const { paymentMode, paymentDate, processTagId } = req.body;

    try {
      if (paymentMode === "ON_APPROVAL" || paymentMode === "ON_DATE") {
        await createPaymentSchedule(
          process.id,
          processTagId || null,
          paymentMode,
          paymentMode === "ON_DATE" ? paymentDate : null,
        );
      }
    } catch (error) {
      console.log("Error creating payment schedule:", error);
    }

    return res.status(200).json({
      message: `Process with the name ${processName} initiated successfully`,
      processId: process.id,
    });
  } catch (error) {
    console.log("error initiating process", error);
    return res.status(500).json({
      message: "Error initiating the process",
      error: "Error initiating the process",
    });
  }
};

async function ensureDocumentAccessWithParents(
  tx,
  {
    documentId,
    userId,
    stepInstanceId,
    processId,
    assignmentId,
    roleId = null,
    departmentId = null,
  },
) {
  const process = await tx.processInstance.findUnique({
    where: { id: processId },
    select: { reopenCycle: true },
  });

  // First get all parent folders up to root
  const parents = await getDocumentParentHierarchy(tx, documentId);

  // Check which parents the user doesn't already have access to
  const existingAccess = await tx.documentAccess.findMany({
    where: {
      documentId: { in: parents.map((p) => p.id) },
      userId: userId,
      processId: processId,
    },
    select: { documentId: true },
  });

  const existingAccessIds = new Set(existingAccess.map((a) => a.documentId));
  const parentsToCreate = parents.filter((p) => !existingAccessIds.has(p.id));

  if (parentsToCreate.length > 0) {
    await tx.documentAccess.createMany({
      data: parentsToCreate.map((parent) => ({
        documentId: parent.id,
        stepInstanceId: stepInstanceId,
        accessType: [AccessType.READ],
        processId: processId,
        assignmentId: assignmentId,
        userId: userId,
        roleId: roleId,
        departmentId: departmentId,
        reopenCycle: process.reopenCycle,
      })),
    });
  }

  // Now create access for the actual document
  await tx.documentAccess.create({
    data: {
      documentId: documentId,
      stepInstanceId: stepInstanceId,
      accessType: [AccessType.EDIT],
      processId: processId,
      assignmentId: assignmentId,
      userId: userId,
      roleId: roleId,
      departmentId: departmentId,
      reopenCycle: process.reopenCycle,
    },
  });
}

async function getDocumentParentHierarchy(tx, documentId) {
  const parents = [];
  let currentDocId = documentId;

  while (currentDocId) {
    const doc = await tx.document.findUnique({
      where: { id: currentDocId },
      select: { parentId: true },
    });

    if (!doc || !doc.parentId) break;

    parents.push({ id: doc.parentId });
    currentDocId = doc.parentId;
  }

  return parents;
}

async function processAssignment(
  tx,
  process_,
  step,
  assignment,
  documentIds,
  isRecirculated,
  fromInitiator,
  workflowId,
) {
  let foundProgress = await tx.assignmentProgress.findFirst({
    where: {
      processId: process_.id,
      assignmentId: assignment.id,
    },
  });

  const progress = foundProgress
    ? foundProgress
    : await tx.assignmentProgress.create({
        data: {
          process: {
            connect: { id: process_.id },
          },
          workflowAssignment: {
            connect: { id: assignment.id },
          },
          roleHierarchy: assignment.allowParallel
            ? await buildRoleHierarchy(assignment)
            : null,
          completed: false,
        },
      });

  switch (assignment.assigneeType) {
    case "DEPARTMENT":
      await handleDepartmentAssignment(
        tx,
        assignment,
        progress,
        documentIds,
        step,
        fromInitiator,
        workflowId,
      );
      break;
    case "ROLE":
      await handleRoleAssignment(
        tx,
        assignment,
        progress,
        documentIds,
        step,
        fromInitiator,
        workflowId,
      );
      break;
    case "USER":
      await handleUserAssignment(
        tx,
        assignment,
        progress,
        documentIds,
        step,
        fromInitiator,
        workflowId,
      );
      break;
  }

  return progress;
}

async function handleDepartmentAssignment(
  tx,
  assignment,
  progress,
  documentIds,
  step,
  fromInitiator,
  workflowId,
) {
  const hierarchy = await buildRoleHierarchyForAssignment(
    assignment.direction,
    assignment.allowParallel,
    assignment.selectedRoles,
  );

  for (const departmentId of assignment.assigneeIds) {
    let departmentProgress = await tx.departmentStepProgress.findFirst({
      where: {
        processId: progress.processId,
        stepId: step.id,
        departmentId: departmentId,
      },
    });

    if (!departmentProgress) {
      departmentProgress = await tx.departmentStepProgress.create({
        data: {
          processId: progress.processId,
          stepId: step.id,
          departmentId: departmentId,
          roleLevels: JSON.stringify(hierarchy),
          currentLevel: 0,
          direction: assignment.direction || "DOWNWARDS",
          requiredRoles: assignment.selectedRoles,
          completedRoles: [],
          assignmentProgressId: progress.id,
        },
      });
    }

    const currentLevel = departmentProgress.currentLevel;
    const roleLevels = JSON.parse(departmentProgress.roleLevels);
    const currentRoles = assignment.allowParallel
      ? assignment.selectedRoles
      : roleLevels[currentLevel] || [];

    const users = await tx.userRole.findMany({
      where: {
        roleId: { in: currentRoles },
        role: {
          departmentId: departmentId,
        },
      },
      select: {
        userId: true,
        roleId: true,
        role: {
          select: { departmentId: true },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    const usersByRole = new Map();
    users.forEach((user) => {
      if (!usersByRole.has(user.roleId)) {
        usersByRole.set(user.roleId, []);
      }
      usersByRole.get(user.roleId).push(user);
    });

    for (const roleId of currentRoles) {
      const roleUsers = usersByRole.get(roleId) || [];
      if (roleUsers.length === 0) continue;

      for (const user of roleUsers) {
        const hasAccess = await checkUserProcessAssignment(
          progress.processId,
          user.userId,
        );

        let stepInstance;
        if (hasAccess) {
          continue;
        } else {
          stepInstance = fromInitiator
            ? await tx.processStepInstance.create({
                data: {
                  processId: progress.processId,
                  assignmentId: assignment.id,
                  progressId: progress.id,
                  assignedTo: user.userId,
                  roleId: roleId,
                  departmentId: departmentId,
                  status: "APPROVED",
                  stepId: step.id,
                },
              })
            : await tx.processStepInstance.create({
                data: {
                  processId: progress.processId,
                  assignmentId: assignment.id,
                  progressId: progress.id,
                  assignedTo: user.userId,
                  roleId: roleId,
                  departmentId: departmentId,
                  status: "IN_PROGRESS",
                  stepId: step.id,
                },
              });

          for (const docId of documentIds) {
            await ensureDocumentAccessWithParents(tx, {
              documentId: docId,
              userId: user.userId,
              stepInstanceId: stepInstance.id,
              processId: progress.processId,
              assignmentId: assignment.id,
              roleId: roleId,
              departmentId: departmentId,
            });
          }
        }
      }
    }
  }

  if (fromInitiator) {
    const process = await tx.processInstance.findUnique({
      where: { id: progress.processId },
    });

    const workflow = await tx.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { include: { assignments: true } } },
    });

    const nextStep = workflow.steps[1];
    for (const nextAssignment of nextStep.assignments) {
      await processAssignment(
        tx,
        process,
        nextStep,
        nextAssignment,
        documentIds,
        false,
        false,
        workflowId,
      );
    }

    await tx.processInstance.update({
      where: { id: process.id },
      data: { currentStepId: nextStep.id, status: "IN_PROGRESS" },
    });
  }
}

async function handleUserAssignment(
  tx,
  assignment,
  progress,
  documentIds,
  step,
  fromInitiator,
  workflowId,
) {
  // FIX: Fetch valid users to prevent P2003 Foreign Key crashes for deleted users
  const validUsers = await tx.user.findMany({
    where: { id: { in: assignment.assigneeIds } },
    select: { id: true },
  });
  const validUserIds = new Set(validUsers.map((u) => u.id));

  for (const userId of assignment.assigneeIds) {
    if (!validUserIds.has(userId)) {
      console.warn(
        `User ID ${userId} not found in database. Skipping assignment.`,
      );
      continue;
    }

    const hasAccess = await checkUserProcessAssignment(
      progress.processId,
      userId,
    );
    let stepInstance;

    if (hasAccess) {
      continue;
    } else {
      stepInstance = fromInitiator
        ? await tx.processStepInstance.create({
            data: {
              processId: progress.processId,
              assignmentId: assignment.id,
              progressId: progress.id,
              assignedTo: userId,
              status: "APPROVED",
              stepId: step.id,
            },
          })
        : await tx.processStepInstance.create({
            data: {
              processId: progress.processId,
              assignmentId: assignment.id,
              progressId: progress.id,
              assignedTo: userId,
              status: "IN_PROGRESS",
              stepId: step.id,
            },
          });

      for (const docId of documentIds) {
        await ensureDocumentAccessWithParents(tx, {
          documentId: docId,
          userId: userId,
          stepInstanceId: stepInstance.id,
          processId: progress.processId,
          assignmentId: assignment.id,
        });
      }
    }
  }

  if (fromInitiator) {
    const process = await tx.processInstance.findUnique({
      where: { id: progress.processId },
    });

    const workflow = await tx.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { include: { assignments: true } } },
    });

    const nextStep = workflow.steps[1];

    // FIX: Safely check if a next step exists
    if (nextStep) {
      for (const nextAssignment of nextStep.assignments) {
        await processAssignment(
          tx,
          process,
          nextStep,
          nextAssignment,
          documentIds,
          false,
          false,
          workflowId,
        );
      }

      await tx.processInstance.update({
        where: { id: process.id },
        data: { currentStepId: nextStep.id, status: "IN_PROGRESS" },
      });
    }
  }
}
async function handleRoleAssignment(
  tx,
  assignment,
  progress,
  documentIds,
  step,
  fromInitiator,
  workflowId,
) {
  const users = await tx.userRole.findMany({
    where: {
      roleId: { in: assignment.assigneeIds },
    },
    select: {
      userId: true,
      roleId: true,
      role: {
        select: {
          departmentId: true,
        },
      },
    },
  });

  for (const user of users) {
    const hasAccess = await checkUserProcessAssignment(
      progress.processId,
      user.userId,
    );

    if (hasAccess) {
      continue;
    } else {
      const stepInstance = fromInitiator
        ? await tx.processStepInstance.create({
            data: {
              processId: progress.processId,
              assignmentId: assignment.id,
              progressId: progress.id,
              assignedTo: user.userId,
              roleId: user.roleId,
              departmentId: user.role.departmentId,
              status: "APPROVED",
              stepId: step.id,
            },
          })
        : await tx.processStepInstance.create({
            data: {
              processId: progress.processId,
              assignmentId: assignment.id,
              progressId: progress.id,
              assignedTo: user.userId,
              roleId: user.roleId,
              departmentId: user.role.departmentId,
              status: "IN_PROGRESS",
              stepId: step.id,
            },
          });

      for (const docId of documentIds) {
        await ensureDocumentAccessWithParents(tx, {
          documentId: docId,
          userId: user.userId,
          stepInstanceId: stepInstance.id,
          processId: progress.processId,
          assignmentId: assignment.id,
          roleId: user.roleId,
          departmentId: user.role.departmentId,
        });
      }
    }
  }

  if (fromInitiator) {
    const process = await tx.processInstance.findUnique({
      where: { id: progress.processId },
    });

    const workflow = await tx.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { include: { assignments: true } } },
    });

    const nextStep = workflow.steps[1];
    for (const nextAssignment of nextStep.assignments) {
      await processAssignment(
        tx,
        process,
        nextStep,
        nextAssignment,
        documentIds,
        false,
        false,
        workflowId,
      );
    }

    await tx.processInstance.update({
      where: { id: process.id },
      data: { currentStepId: nextStep.id, status: "IN_PROGRESS" },
    });
  }
}

export const serializeBigInt = (obj) => {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
};

function buildThreadTextFromEmails(emails) {
  let threadLines = [];

  emails.forEach((email, index) => {
    threadLines.push("=".repeat(80));
    threadLines.push(`MESSAGE ${index + 1} (DATABASE)`);
    threadLines.push("=".repeat(80));
    threadLines.push(`Subject: ${email.subject}`);
    threadLines.push(`From: ${email.from}`);
    threadLines.push(
      `To: ${Array.isArray(email.to) ? email.to.join(", ") : email.to}`,
    );
    if (email.cc && email.cc.length > 0) {
      threadLines.push(
        `Cc: ${Array.isArray(email.cc) ? email.cc.join(", ") : email.cc}`,
      );
    }
    if (email.bcc && email.bcc.length > 0) {
      threadLines.push(
        `Bcc: ${Array.isArray(email.bcc) ? email.bcc.join(", ") : email.bcc}`,
      );
    }
    threadLines.push(`Date: ${email.date}`);
    threadLines.push(`Message-ID: ${email.message_id}`);

    if (email.attachments_filenames && email.attachments_filenames.length > 0) {
      threadLines.push(
        `Attachments: ${email.attachments_filenames.join(", ")}`,
      );
    }

    threadLines.push("-".repeat(80));
    threadLines.push(email.body_text || email.body_plain);
    threadLines.push("\n");
  });

  return threadLines.join("\n");
}

// Helper function to build simple thread tree
function buildSimpleThreadTree(emails) {
  // Create a simple linear thread tree since we don't have full thread structure
  const roots = emails.length > 0 ? [`email-${emails[0].id}`] : [];
  const parent = {};
  const children = {};
  const branchPaths = [];

  emails.forEach((email, index) => {
    const uid = `email-${email.id}`;
    parent[uid] = index > 0 ? `email-${emails[index - 1].id}` : null;
    children[uid] =
      index < emails.length - 1 ? [`email-${emails[index + 1].id}`] : [];
    if (index === 0) {
      branchPaths.push([uid]);
    }
  });

  return {
    roots: roots,
    parent: parent,
    children: children,
    branch_paths: branchPaths,
  };
}

export const view_process = async (req, res) => {
  try {
    let { processId } = req.params;
    processId = String(processId);
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized" || !userData?.id) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Unauthorized request",
          details: "Invalid or missing authorization token.",
          code: "UNAUTHORIZED",
        },
      });
    }

    // ── Admin/Root privilege flag ────────────────────────────────────────────
    const isPrivileged = userData.isAdmin || userData.isRootLevel;

    const retry = async (fn, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === retries - 1) throw error;
          console.warn(`Retry ${i + 1} for processId: ${processId}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };

    console.log("process id", processId);

    // Fetch ProcessInstance with minimal relations
    const process = await retry(() =>
      prisma.processInstance.findUnique({
        where: { id: processId },
        include: {
          initiator: {
            select: { id: true, username: true, name: true, email: true },
          },
          workflow: { select: { id: true, name: true, version: true } },
          currentStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
        },
      }),
    );

    if (!process) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Process not found",
          details: "No process found with the specified ID.",
          code: "PROCESS_NOT_FOUND",
        },
      });
    }

    // ── Determine if this user is read-only ──────────────────────────────────
    // A user is read-only when they are privileged but NOT the initiator and NOT
    // directly assigned to any step in this process.
    const isDirectlyAssigned = isPrivileged
      ? await prisma.processStepInstance.findFirst({
          where: { processId, assignedTo: userData.id },
          select: { id: true },
        })
      : true; // non-privileged: treat as assigned (normal flow)

    const isReadOnly = Boolean(
      isPrivileged &&
      process.initiatorId !== userData.id &&
      !isDirectlyAssigned,
    );

    // Fetch email threads for the process
    const emailThreads = await retry(() =>
      prisma.emailThread.findMany({
        where: { processId: process.id },
        include: {
          originalEmails: {
            orderBy: { date: "asc" },
            select: {
              id: true,
              subject: true,
              from: true,
              to: true,
              cc: true,
              bcc: true,
              date: true,
              bodyText: true,
              bodyHtml: true,
              attachments: true,
              headers: true,
              messageId: true,
              inReplyTo: true,
              references: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              username: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { extractedAt: "desc" },
      }),
    );

    // Format email threads for response
    const formattedEmailThreads = emailThreads.map((thread) => {
      const metadata = thread.metadata || {};
      const attachmentsMapping = metadata.attachmentsMapping || [];
      const extractedDocumentIds = metadata.extractedDocumentIds || [];

      const emails = thread.originalEmails.map((email) => ({
        id: email.id,
        uid: `email-${email.id}`,
        source: "database",
        subject: email.subject || "No subject",
        from: email.from || "",
        to: email.to.join("") || [],
        cc: email.cc.join("") || [],
        bcc: email.bcc.join("") || [],
        date: email.date
          ? new Date(email.date).toISOString()
          : new Date().toISOString(),
        body_plain: email.bodyText || "",
        body_html: email.bodyHtml || "",
        body_text: email.bodyText || "",
        message_id: email.messageId || "",
        in_reply_to: Array.isArray(email.inReplyTo) ? email.inReplyTo : [],
        references: Array.isArray(email.references) ? email.references : [],
        headers: email.headers || {},
        attachments_filenames:
          email.attachments?.map((att) => att.filename) || [],
        attachments:
          email.attachments?.map((att) => ({
            filename: att.filename,
            size: att.size || 0,
            content_type: att.contentType || "application/octet-stream",
            disposition: att.disposition || "attachment",
            associated_email_subject: email.subject,
            associated_email_from: email.from,
            documentId: att.documentId || null,
          })) || [],
        containment_parent_uid: null,
      }));

      const threadText = thread.threadText || buildThreadTextFromEmails(emails);
      const threadTree = metadata.threadTree || buildSimpleThreadTree(emails);

      const totalMessages = emails.length;
      const totalAttachments = emails.reduce(
        (acc, email) => acc + (email.attachments?.length || 0),
        0,
      );

      const summary = metadata.summary || {
        total_messages: totalMessages,
        total_attachments: totalAttachments,
        thread_roots: 1,
        thread_branches: 1,
      };

      const originalEmail =
        emails.length > 0
          ? {
              subject: emails[0].subject,
              from: emails[0].from,
              date: emails[0].date,
              totalMessages: totalMessages,
              totalAttachments: totalAttachments,
            }
          : null;

      return {
        id: thread.id,
        threadText: threadText,
        attachments: attachmentsMapping,
        emails: emails,
        threadTree: threadTree,
        summary: summary,
        originalEmail: originalEmail,
        extractedDocumentIds: extractedDocumentIds,
        attachmentsMapping: attachmentsMapping,
        extractedAt: thread.extractedAt,
        createdBy: {
          id: thread.createdBy.id,
          username: thread.createdBy.username,
          name: thread.createdBy.name,
          email: thread.createdBy.email,
        },
      };
    });

    // Fetch documents separately (Privileged or not, all authorized users get documents)
    const documents = await retry(() =>
      prisma.processDocument.findMany({
        where: { processId: process.id },
        include: {
          document: {
            select: { id: true, name: true, type: true, path: true },
          },
          signatures: {
            include: { user: { select: { id: true, username: true } } },
          },
          rejections: {
            include: { user: { select: { id: true, username: true } } },
          },
          documentHistory: {
            include: {
              user: { select: { id: true, name: true, username: true } },
              replacedDocument: {
                select: { id: true, name: true, path: true },
              },
            },
          },
        },
      }),
    );

    // Fetch stepInstances separately: Read-only admins get [] so they can't take action
    const stepInstances = isReadOnly
      ? []
      : await retry(() =>
          prisma.processStepInstance.findMany({
            where: {
              processId: process.id,
              assignedTo: userData.id,
              status: {
                in: [
                  "IN_PROGRESS",
                  "FOR_RECIRCULATION",
                  "APPROVED",
                  "FOR_RECOMMENDATION",
                ],
              },
            },
            include: {
              workflowStep: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
              workflowAssignment: {
                include: {
                  step: {
                    select: {
                      id: true,
                      stepName: true,
                      stepNumber: true,
                      stepType: true,
                    },
                  },
                },
              },
              pickedBy: { select: { id: true, username: true } },
              processQA: {
                where: {
                  OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
                },
                include: {
                  initiator: { select: { id: true, name: true } },
                  process: { select: { id: true, name: true } },
                },
              },
              recommendations: {
                include: {
                  initiator: { select: { id: true, username: true } },
                  recommender: { select: { id: true, username: true } },
                },
              },
            },
          }),
        );

    process.documents = documents;
    process.stepInstances = stepInstances;

    const getAssigneeUserIds = async (process, prisma) => {
      const assigneeIds = (
        await Promise.all(
          process.stepInstances.flatMap(async (step) => {
            if (!step.workflowAssignment) {
              return step.assignedTo ? [step.assignedTo] : [];
            }

            const { assigneeType, assigneeIds, selectedRoles } =
              step.workflowAssignment;

            if (assigneeType === "USER") {
              return assigneeIds || [];
            } else if (assigneeType === "ROLE") {
              const userRoles = await prisma.userRole.findMany({
                where: {
                  roleId: { in: assigneeIds.map((id) => parseInt(id)) },
                },
                select: {
                  userId: true,
                },
              });

              return userRoles.map((ur) => ur.userId);
            } else if (assigneeType === "DEPARTMENT") {
              const userRoles = await prisma.userRole.findMany({
                where: {
                  roleId: { in: selectedRoles.map((id) => parseInt(id)) },
                },
                select: {
                  userId: true,
                },
              });

              return userRoles.map((ur) => ur.userId);
            }

            return [];
          }),
        )
      ).flat();

      return [...new Set(assigneeIds)];
    };

    const assigneeIds = await getAssigneeUserIds(process, prisma);

    const assignees = await prisma.user.findMany({
      where: {
        id: { in: assigneeIds },
      },
      select: {
        id: true,
        username: true,
      },
    });

    const assigneeMap = assignees.reduce((map, user) => {
      map[user.id] = user;
      return map;
    }, {});

    const firstStepInstances = await retry(() =>
      prisma.processStepInstance.findMany({
        where: {
          processId: process.id,
          status: {
            in: ["APPROVED"],
          },
          workflowStep: {
            stepNumber: 1,
          },
        },
        include: {
          workflowStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
            },
          },
          pickedBy: { select: { id: true, username: true } },
          processQA: {
            where: {
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
            },
            include: {
              initiator: { select: { id: true, name: true } },
              process: { select: { id: true, name: true } },
            },
          },
          recommendations: {
            include: {
              initiator: { select: { id: true, username: true } },
              recommender: { select: { id: true, username: true } },
            },
          },
        },
      }),
    );

    const steps = await (async () => {
      const stepNumberOneInstances = firstStepInstances.filter(
        (step) =>
          step.status === "APPROVED" &&
          (step.workflowAssignment?.step?.stepNumber === 1 ||
            step.workflowStep?.stepNumber === 1),
      );

      if (stepNumberOneInstances.length === 0) {
        return [];
      }

      const latestStep = stepNumberOneInstances.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt;
        const bTime = b.updatedAt || b.createdAt;
        return bTime - aTime;
      })[0];

      const initiator = await prisma.user.findFirst({
        where: {
          id: latestStep.assignedTo,
        },
      });

      const stepData =
        latestStep.workflowAssignment?.step ?? latestStep.workflowStep;

      const assigneeUsername = latestStep.assignedTo
        ? initiator.username
        : "Unknown User";

      return [
        {
          stepName: stepData
            ? `${stepData.stepName}_${assigneeUsername}`
            : `Unknown Step (${assigneeUsername})`,
          stepNumber: stepData?.stepNumber ?? 1,
          stepId: stepData?.id ?? null,
          stepType: stepData?.stepType ?? "UNKNOWN",
          assignees: [latestStep.assignedTo].map((id) => ({
            assigneeId: id,
            assigneeName: initiator.username ?? "Unknown User",
          })),
        },
      ];
    })();

    const processDocuments = await prisma.processDocument.findMany({
      where: { processId: process.id },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            createdOn: true,
          },
        },
        replacedDocument: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
      },
    });

    const replacedDocumentIds = new Set(
      processDocuments
        .filter((pd) => pd.replacedDocumentId)
        .map((pd) => pd.replacedDocumentId),
    );

    const supersededDocumentIds = new Set(
      processDocuments
        .filter((pd) => pd.superseding)
        .map((pd) => pd.replacedDocumentId),
    );

    let latestDocument = processDocuments.find(
      (pd) =>
        !replacedDocumentIds.has(pd.documentId) &&
        !supersededDocumentIds.has(pd.documentId),
    );

    if (!latestDocument) {
      latestDocument = processDocuments
        .filter((pd) => !replacedDocumentIds.has(pd.documentId))
        .sort((a, b) => b.document.id - a.document.id)[0];
    }

    const documentVersioning = [];
    const allProcessDocuments = await prisma.processDocument.findMany({
      where: { processId: process.id },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            createdOn: true,
          },
        },
        replacedDocument: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
      },
    });

    const docIdToProcessDoc = new Map(
      allProcessDocuments.map((d) => [d.documentId, d]),
    );
    const replacedToReplacer = new Map(
      allProcessDocuments
        .filter((d) => d.replacedDocumentId)
        .map((d) => [d.replacedDocumentId, d.documentId]),
    );

    const terminalDocumentIds = allProcessDocuments
      .filter((d) => !replacedToReplacer.has(d.documentId))
      .map((d) => d.documentId);

    for (const terminalDocId of terminalDocumentIds) {
      const versions = [];
      let currentDocId = terminalDocId;
      const visitedDocIds = new Set();

      while (currentDocId) {
        if (visitedDocIds.has(currentDocId)) {
          console.warn(
            `Cycle detected at docId: ${currentDocId}. Breaking loop.`,
          );
          break;
        }
        visitedDocIds.add(currentDocId);

        const processDoc = docIdToProcessDoc.get(currentDocId);

        if (!processDoc) {
          break;
        }

        versions.unshift({
          id: processDoc.document.id,
          createdAt: processDoc.document.createdOn || null,
          name: processDoc.document.name,
          path: processDoc.document.path.split("/").slice(0, -1).join("/"),
          type: processDoc.document.type,
          issueNo: processDoc.issueNo || null,
          SOPIssueNo: processDoc.SOPIssueNo || null,
          tags: processDoc.tags,
          preApproved: processDoc.preApproved,
          reasonOfSupersed: processDoc.reasonOfSupersed,
          description: processDoc.description,
          partNumber: processDoc.partNumber,
          active: processDoc.document.id === latestDocument?.document?.id,
          isReplacement: processDoc.isReplacement,
          superseding: processDoc.superseding,
          reopenCycle: processDoc.reopenCycle,
        });

        currentDocId = processDoc.replacedDocumentId;
      }

      if (versions.length > 0) {
        documentVersioning.push({
          latestDocumentId: terminalDocId,
          versions: versions,
        });
      } else {
        console.log("No versions added for terminalDocId:", terminalDocId);
      }
    }

    const standaloneDocs = allProcessDocuments.filter((doc) => {
      const isNotReplacement = !doc.replacedDocumentId;
      const isNotReplaced = !replacedToReplacer.has(doc.documentId);
      const isNotIncluded = !documentVersioning.some((chain) =>
        chain.versions.some((v) => v.id === doc.documentId),
      );

      return isNotReplacement && isNotReplaced && isNotIncluded;
    });

    for (const standaloneDoc of standaloneDocs) {
      documentVersioning.push({
        latestDocumentId: standaloneDoc.documentId,
        versions: [
          {
            id: standaloneDoc.document.id,
            name: standaloneDoc.document.name,
            createdAt: standaloneDoc.document.createdOn || null,
            path: standaloneDoc.document.path.split("/").slice(0, -1).join("/"),
            type: standaloneDoc.document.type,
            tags: standaloneDoc.tags,
            reasonOfSupersed: standaloneDoc.reasonOfSupersed,
            description: standaloneDoc.description,
            partNumber: standaloneDoc.partNumber,
            active: standaloneDoc.document.id === latestDocument?.document?.id,
            isReplacement: standaloneDoc.isReplacement,
            superseding: standaloneDoc.superseding,
            reopenCycle: standaloneDoc.reopenCycle,
            issueNo: standaloneDoc.issueNo || null,
            SOPIssueNo: standaloneDoc.SOPIssueNo || null,
            preApproved: standaloneDoc.preApproved,
          },
        ],
      });
    }

    const groupedDocumentVersioning = {};
    documentVersioning.forEach((chain) => {
      const latestVersion = chain.versions[chain.versions.length - 1];
      const reopenCycle = latestVersion.reopenCycle || 0;

      if (!groupedDocumentVersioning[reopenCycle]) {
        groupedDocumentVersioning[reopenCycle] = [];
      }
      groupedDocumentVersioning[reopenCycle].push(chain);
    });

    const finalDocumentVersioning = Object.entries(
      groupedDocumentVersioning,
    ).map(([reopenCycle, chains]) => ({
      reopenCycle: parseInt(reopenCycle),
      chains: chains,
    }));

    finalDocumentVersioning.sort((a, b) => a.reopenCycle - b.reopenCycle);

    const sededDocuments = [];

    if (processDocuments.length > 0) {
      const allDocsSorted = [...processDocuments].sort(
        (a, b) => a.document.id - b.document.id,
      );

      const reopenCycle1Docs = allDocsSorted.filter(
        (doc) => doc.reopenCycle === 1,
      );

      reopenCycle1Docs.forEach((firstReopenCycle1Doc) => {
        const documentWhichSuperseded = allDocsSorted.find(
          (doc) => doc.documentId === firstReopenCycle1Doc.replacedDocumentId,
        );

        const versions = [];
        let currentDoc = firstReopenCycle1Doc;
        let currentReopenCycle = 1;
        let lastDocBeforeCycleChange = null;
        const visitedDocIds = new Set();

        while (currentDoc && !visitedDocIds.has(currentDoc.documentId)) {
          visitedDocIds.add(currentDoc.documentId);

          if (currentDoc.reopenCycle > currentReopenCycle) {
            if (lastDocBeforeCycleChange) {
              versions.push({
                id: lastDocBeforeCycleChange.document.id,
                createdAt: lastDocBeforeCycleChange.document.createdOn || null,
                name: lastDocBeforeCycleChange.document.name,
                path: lastDocBeforeCycleChange.document.path
                  ? lastDocBeforeCycleChange.document.path
                      .split("/")
                      .slice(0, -1)
                      .join("/")
                  : "",
                issueNo: lastDocBeforeCycleChange.issueNo || null,
                SOPIssueNo: lastDocBeforeCycleChange.SOPIssueNo || null,
                type: lastDocBeforeCycleChange.document.type || "",
                tags: lastDocBeforeCycleChange.tags || [],
                reasonOfSupersed:
                  lastDocBeforeCycleChange.reasonOfSupersed || null,
                description: lastDocBeforeCycleChange.description || null,
                partNumber: lastDocBeforeCycleChange.partNumber || null,
                active:
                  lastDocBeforeCycleChange.document.id ===
                  (latestDocument?.document?.id || null),
                isReplacement: lastDocBeforeCycleChange.isReplacement || false,
                superseding: lastDocBeforeCycleChange.superseding || false,
                preApproved: lastDocBeforeCycleChange.preApproved || false,
                reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
              });
            }
            currentReopenCycle = currentDoc.reopenCycle;
          }

          lastDocBeforeCycleChange = currentDoc;

          currentDoc = allDocsSorted.find(
            (d) => d.replacedDocumentId === currentDoc.documentId,
          );
        }

        if (
          lastDocBeforeCycleChange &&
          !versions.some((v) => v.id === lastDocBeforeCycleChange.document.id)
        ) {
          versions.push({
            id: lastDocBeforeCycleChange.document.id,
            name: lastDocBeforeCycleChange.document.name,
            createdAt: lastDocBeforeCycleChange.document.createdOn || null,
            path: lastDocBeforeCycleChange.document.path
              ? lastDocBeforeCycleChange.document.path
                  .split("/")
                  .slice(0, -1)
                  .join("/")
              : "",
            type: lastDocBeforeCycleChange.document.type || "",
            issueNo: lastDocBeforeCycleChange.document.issueNo || null,
            tags: lastDocBeforeCycleChange.tags || [],
            active:
              lastDocBeforeCycleChange.document.id ===
              (latestDocument?.document?.id || null),
            isReplacement: lastDocBeforeCycleChange.isReplacement || false,
            superseding: lastDocBeforeCycleChange.superseding || false,
            reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
            preApproved: lastDocBeforeCycleChange.preApproved || false,
            reasonOfSupersed: lastDocBeforeCycleChange.reasonOfSupersed || null,
            description: lastDocBeforeCycleChange.description || null,
            partNumber: lastDocBeforeCycleChange.partNumber || null,
          });
        }

        if (documentWhichSuperseded) {
          sededDocuments.push({
            documentWhichSuperseded: {
              id: documentWhichSuperseded.document.id,
              name: documentWhichSuperseded.document.name,
              createdAt: documentWhichSuperseded.document.createdOn || null,
              path: documentWhichSuperseded.document.path
                ? documentWhichSuperseded.document.path
                    .split("/")
                    .slice(0, -1)
                    .join("/")
                : "",
              type: documentWhichSuperseded.document.type || "",
              description: documentWhichSuperseded.description || "",
              preApproved: documentWhichSuperseded.preApproved || false,
              tags: documentWhichSuperseded.tags || [],
              issueNo: documentWhichSuperseded.issueNo || null,
              SOPIssueNo: documentWhichSuperseded.SOPIssueNo || null,
              reasonOfSupersed:
                documentWhichSuperseded.reasonOfSupersed || null,
              partNumber: documentWhichSuperseded.partNumber || null,
            },
            latestDocumentId: latestDocument
              ? latestDocument.document.id
              : null,
            versions: versions,
          });
        }
      });
    }

    const transformedDocuments = processDocuments
      .filter(
        (doc) =>
          (!replacedDocumentIds.has(doc.documentId) ||
            (doc.replacedDocument &&
              doc.document.id === doc.replacedDocument.id)) &&
          !supersededDocumentIds.has(doc.documentId),
      )
      .map((doc) => {
        const processDoc = process.documents.find(
          (d) => d.documentId === doc.documentId,
        );
        const signedBy =
          processDoc?.signatures.map((sig) => ({
            signedBy: sig.user.username,
            signedAt: sig.signedAt ? sig.signedAt.toISOString() : null,
            remarks: sig.reason || null,
            byRecommender: sig.byRecommender,
            isAttachedWithRecommendation: sig.isAttachedWithRecommendation,
          })) || [];

        const rejectionDetails =
          processDoc?.rejections.length > 0
            ? {
                rejectedBy: processDoc.rejections[0].user.username,
                rejectionReason: processDoc.rejections[0].reason || null,
                rejectedAt: processDoc.rejections[0].rejectedAt
                  ? processDoc.rejections[0].rejectedAt.toISOString()
                  : null,
                byRecommender: processDoc.rejections[0].byRecommender,
                isAttachedWithRecommendation:
                  processDoc.rejections[0].isAttachedWithRecommendation,
              }
            : null;

        const parts = doc.document.path.split("/");
        parts.pop();
        const updatedPath = parts.join("/");
        return {
          id: doc.document.id,
          name: doc.document.name,
          createdAt: doc.document.createdOn || null,
          type: doc.document.type,
          path: updatedPath,
          tags: doc.tags,
          signedBy,
          rejectionDetails,
          isRecirculationTrigger:
            processDoc?.documentHistory.some(
              (history) => history.isRecirculationTrigger,
            ) || false,
          approvalCount: signedBy.length,
          isReplacement: doc.isReplacement,
          superseding: doc.superseding,
          preApproved: doc.preApproved,
          reopenCycle: doc.reopenCycle,
          description: doc.description,
          reasonOfSupersed: doc.reasonOfSupersed,
          partNumber: doc.partNumber,
          issueNo: doc.issueNo,
          SOPIssueNo: doc.SOPIssueNo,
          active: true,
        };
      });

    const queryStepInstances = await retry(() =>
      prisma.processStepInstance.findMany({
        where: {
          processId: process.id,
        },
        include: {
          workflowStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
            },
          },
          pickedBy: { select: { id: true, username: true } },
          processQA: {
            where: {
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
            },
            include: {
              initiator: { select: { id: true, name: true } },
              process: { select: { id: true, name: true } },
            },
          },
          recommendations: {
            include: {
              initiator: { select: { id: true, username: true } },
              recommender: { select: { id: true, username: true } },
            },
          },
        },
      }),
    );

    const queryDetails = await Promise.all(
      queryStepInstances.flatMap((step) =>
        step.processQA.map(async (qa) => {
          const rawHistoryIds = [
            ...(qa.details?.documentChanges?.map(
              (dc) => dc.documentHistoryId,
            ) || []),
            ...(qa.details?.documentSummaries?.map(
              (ds) => ds.documentHistoryId,
            ) || []),
          ];

          const documentHistoryIds = rawHistoryIds.filter((id) => id != null);

          const documentHistories =
            documentHistoryIds.length > 0
              ? await prisma.documentHistory.findMany({
                  where: { id: { in: documentHistoryIds } },
                  include: {
                    document: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        path: true,
                      },
                    },
                    replacedDocument: {
                      select: {
                        id: true,
                        name: true,
                        path: true,
                      },
                    },
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                      },
                    },
                  },
                })
              : [];

          return {
            stepInstanceId: step.id,
            stepName: step.workflowAssignment?.step?.stepName ?? null,
            stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
            status: step.status,
            taskType: qa.answer ? "RESOLVED" : "QUERY_UPLOAD",
            queryText: qa.question,
            answerText: qa.answer || null,
            initiatorName: qa.initiator.name,
            createdAt: qa.createdAt.toISOString(),
            answeredAt: qa.answeredAt ? qa.answeredAt.toISOString() : null,
            documentChanges:
              qa.details?.documentChanges?.map((dc) => {
                const history = documentHistories.find(
                  (h) => h.id === dc.documentHistoryId,
                );
                return {
                  documentId: dc.documentId,
                  requiresApproval: dc.requiresApproval,
                  isReplacement: dc.isReplacement,
                  superseding: dc.superseding || false,
                  documentHistoryId: dc.documentHistoryId,
                  document: history?.document
                    ? {
                        id: history.document.id,
                        name: history.document.name,
                        type: history.document.type,
                        path: history.document.path,
                        tags: history.document.tags,
                      }
                    : null,
                  actionDetails: history?.actionDetails,
                  user: history?.user?.name,
                  createdAt: history?.createdAt?.toISOString(),
                  replacedDocument: history?.replacedDocument
                    ? {
                        id: history.replacedDocument.id,
                        name: history.replacedDocument.name,
                        path: history.replacedDocument.path,
                      }
                    : null,
                  reopenCycle: history?.actionDetails?.reopenCycle || 0,
                };
              }) || [],
            documentSummaries:
              qa.details?.documentSummaries?.map((ds) => {
                const history = documentHistories.find(
                  (h) => h.id === ds.documentHistoryId,
                );
                return {
                  documentId: ds.documentId,
                  feedbackText: ds.feedbackText,
                  documentHistoryId: ds.documentHistoryId,
                  documentDetails: history?.document
                    ? {
                        id: history.document.id,
                        name: history.document.name,
                        path: history.document.path,
                      }
                    : null,
                  user: history?.user?.username,
                  createdAt: history?.createdAt?.toISOString(),
                  reopenCycle: history?.actionDetails?.reopenCycle || 0,
                };
              }) || [],
            assigneeDetails: qa.details?.assigneeDetails
              ? {
                  assignedStepName: qa.details.assigneeDetails.assignedStepName,
                  assignedAssigneeId:
                    qa.details.assigneeDetails.assignedAssigneeId,
                  assignedAssigneeName: qa.details.assigneeDetails
                    .assignedAssigneeId
                    ? (
                        await prisma.user.findUnique({
                          where: {
                            id: parseInt(
                              qa.details.assigneeDetails.assignedAssigneeId,
                            ),
                          },
                          select: { username: true },
                        })
                      )?.username || null
                    : null,
                }
              : null,
          };
        }),
      ),
    );

    const recommendationDetails = await Promise.all(
      process.stepInstances.flatMap((step) =>
        step.recommendations.map(async (rec) => {
          const documentSummaries = rec.documentSummaries || [];
          const documentResponses = rec.details?.documentResponses || [];

          const documentIds = documentSummaries
            .map((ds) => parseInt(ds.documentId))
            .filter((id) => !isNaN(id));

          const documents = documentIds.length
            ? await prisma.document.findMany({
                where: { id: { in: documentIds } },
                select: { id: true, name: true },
              })
            : [];

          const documentMap = documents.reduce((map, doc) => {
            map[doc.id] = doc.name;
            return map;
          }, {});

          const documentDetails = documentSummaries.map((ds) => {
            const response = documentResponses?.find(
              (dr) => parseInt(dr.documentId) === parseInt(ds.documentId),
            );
            return {
              documentId: ds.documentId,
              documentName: documentMap[ds.documentId] || "Unknown Document",
              queryText: ds.queryText,
              answerText: response?.answerText || null,
            };
          });

          return {
            recommendationId: rec.id,
            stepInstanceId: step.id,
            stepName: step.workflowAssignment?.step?.stepName ?? null,
            stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
            status: rec.status,
            recommendationText: rec.recommendationText,
            responseText: rec.responseText || null,
            initiatorName: rec.initiator.username,
            recommenderName: rec.recommender.username,
            createdAt: rec.createdAt.toISOString(),
            respondedAt: rec.respondedAt ? rec.respondedAt.toISOString() : null,
            documentDetails,
          };
        }),
      ),
    );

    const toBePicked = process.stepInstances.every(
      (step) => step.pickedById === null,
    );

    const workflow = {
      id: process.workflow.id,
      name: process.workflow.name,
      version: process.workflow.version,
    };

    const processDocs = await prisma.processDocument.findMany({
      where: {
        processId,
      },
      select: {
        reopenCycle: true,
      },
      distinct: ["reopenCycle"],
    });

    const versions = [
      ...new Set(processDocs.map((doc) => doc.reopenCycle + 1)),
    ].sort((a, b) => a - b);

    const normalizedEmailThreads = formattedEmailThreads.map((thread) => {
      const attachmentsMapping = [];
      const extractedDocumentIds = new Set();

      thread.emails.forEach((email) => {
        (email.attachments || []).forEach((att) => {
          if (att.documentId) {
            extractedDocumentIds.add(att.documentId);

            attachmentsMapping.push({
              originalFilename: att.filename,
              documentId: att.documentId,
              contentType: att.content_type || "application/pdf",
            });
          }
        });

        email.attachments_filenames = (email.attachments || []).map(
          (a) => a.filename,
        );
      });

      return {
        threadText: thread.threadText || "",
        attachmentsMapping,
        extractedDocumentIds: Array.from(extractedDocumentIds),
        emails: thread.emails,
        threadTree: thread.threadTree || null,
        summary: thread.summary || null,
        originalEmail: thread.originalEmail || null,

        _metadata: {
          id: thread.id,
          extractedAt: thread.extractedAt,
          createdBy: thread.createdBy,
        },
      };
    });

    const responseData = {
      process: {
        processStoragePath: process.storagePath,
        description: process.description, // HTML goes perfectly here
        processName: process.name,
        initiatorName: process.initiator.username,
        status: process.status,
        createdAt: process.createdAt,
        issueNo: process.issueNo,
        tags: process.tags || [],
        processId: process.id,
        reopenCycle: process.reopenCycle,
        versions: versions,
        processStepInstanceId:
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS",
          )[0]?.id || null,
        arrivedAt:
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS",
          )[0]?.updatedAt ||
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS",
          )[0]?.createdAt ||
          null,
        updatedAt: process.updatedAt,
        toBePicked,
        isRecirculated: process.isRecirculated,
        documents: transformedDocuments,
        steps,
        queryDetails,
        poNumbers: process.poNumbers,
        recommendationDetails,
        documentVersioning: finalDocumentVersioning,
        sededDocuments,
        workflow,
        currentStepNumber: process.currentStep?.stepNumber || null,
        currentStepType:
          process.status === "COMPLETED" || process.initiator.id === userData.id
            ? "APPROVAL"
            : process.currentStep?.stepType || null,
        emailThreads: normalizedEmailThreads,
        isReadOnly: isReadOnly, // <-- This ensures frontend knows to disable action buttons for Admins
      },
    };

    const serializedResponse = serializeBigInt(responseData);

    return res.status(200).json(serializedResponse);
  } catch (error) {
    console.error("Error getting process:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to view process",
        details: "Failed to retrieve process details. Please try again later.",
        code: "PROCESS_VIEW_ERROR",
      },
    });
  }
};

// Add this import at the top of your file with other imports

import dns from "dns/promises";
import net from "net";
import https from "https";

import { execFile } from "child_process";
import util from "util";

// 🔥 FORCE IPV4 (VERY IMPORTANT)
dns.setDefaultResultOrder("ipv4first");

// Promisify execFile so we can safely use async/await
const execFileAsync = util.promisify(execFile);

// import dns from "dns/promises";
// import net from "net";
// import https from "https";
// import fs from "fs/promises";
// import path from "path";
// import axios from "axios";
// import { execFile } from "child_process";
// import util from "util";

// 🔥 FORCE IPV4 (VERY IMPORTANT)
// dns.setDefaultResultOrder("ipv4first");

// Promisify execFile so we can safely use async/await without shell injection risks
// const execFileAsync = util.promisify(execFile);

/**
 * Builds the Active Mode PORT flag based on your .env settings.
 * Example output: "52.12.34.56:50000-50050" or "-"
 */
const getPortFlag = () => {
  const ip = process.env.PUBLIC_IP || "-";
  const ports = process.env.FTP_PORT_RANGE
    ? `:${process.env.FTP_PORT_RANGE}`
    : "";
  return `${ip}${ports}`;
};

/**
 * 1. MOCK FTP CONNECTION
 */
const ftpConnect = async (config) => {
  return {
    ...config,
    end: () => {},
  };
};

/**
 * Helper to fix cURL absolute path issue.
 * Converts "/home/AIAAudit/..." to "%2Fhome/AIAAudit/..."
 */
const getCurlUrl = (host, port, remotePath) => {
  const safePath = remotePath.startsWith("/")
    ? `%2F${remotePath.slice(1)}`
    : remotePath;
  return `ftp://${host}:${port}/${safePath}`;
};

/**
 * 2. UPLOAD FILE (ACTIVE MODE - DEFINED PORT RANGE)
 */
const getPublicIp = async () => {
  try {
    const { stdout } = await execAsync("curl -s https://ifconfig.me");
    return stdout.trim();
  } catch (err) {
    console.error("Could not fetch Public IP, defaulting to interface");
    return "-"; // Fallback to let curl decide
  }
};

/**
 * 2. UPLOAD FILE (ACTIVE MODE - FIXED FOR NAT)
 */
const ftpUploadFile = async (client, localPath, remoteName) => {
  const remoteUrl = getCurlUrl(client.host, client.port, remoteName);
  const publicIp = await getPublicIp();

  console.log(`\n--- FTP UPLOAD START ---`);
  console.log(`Local: ${localPath}`);
  console.log(`Public IP being reported to FTP: ${publicIp}`);

  const curlArgs = [
    "-u",
    `${client.user}:${client.password}`,
    "--ftp-port",
    `${publicIp}:50000-50050`, // Tells FTP server exactly where to send data back
    "--disable-eprt",
    "--ftp-create-dirs",
    "--show-error",
    "-v", // Verbose so we can see the "PORT" command result
    "-T",
    localPath,
    remoteUrl,
  ];

  try {
    const { stdout, stderr } = await execFileAsync("curl", curlArgs);

    // Look for "200 PORT command successful" and "150 Opening BINARY mode" in logs
    console.log("=== CURL VERBOSE LOG ===");
    console.log(stderr);

    if (stderr.includes("150 Opening BINARY mode data connection")) {
      console.log("✅ Data channel opened successfully.");
    }
  } catch (err) {
    console.error("❌ FTP Upload Failed:", err.message);
    if (err.stderr) console.error(err.stderr);
    throw err;
  }
};

/**
 * 3. LIST DIRECTORY (ACTIVE MODE)
 */
const ftpList = async (client, remotePath) => {
  const remoteUrl = getCurlUrl(client.host, client.port, remotePath) + "/";

  try {
    const { stdout } = await execFileAsync("curl", [
      "-u",
      `${client.user}:${client.password}`,
      "--ftp-port",
      getPortFlag(),
      "--disable-eprt", // 🔥 FORCE CLASSIC PORT COMMAND
      "--silent",
      "-l",
      remoteUrl,
    ]);

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((name) => ({ name }));
  } catch (err) {
    if (
      err.message.includes("does not exist") ||
      err.message.includes("failed")
    ) {
      return [];
    }
    throw err;
  }
};

/**
 * 4. MAKE DIRECTORY (ACTIVE MODE)
 */
const ftpMkdir = async (client, remotePath) => {
  const remoteUrl = `ftp://${client.host}:${client.port}/`;

  try {
    await execFileAsync("curl", [
      "-u",
      `${client.user}:${client.password}`,
      "--ftp-port",
      getPortFlag(),
      "--disable-eprt", // 🔥 FORCE CLASSIC PORT COMMAND
      "--silent",
      "-Q",
      `MKD ${remotePath}`,
      remoteUrl,
    ]);
  } catch (err) {
    // Ignore if directory exists
  }
};

// ==========================================
// CONTROLLERS
// ==========================================

export const attach_po_numbers = async (req, res) => {
  const startTime = Date.now();

  try {
    const { processId, poNumbers } = req.body;

    if (!processId || !Array.isArray(poNumbers) || poNumbers.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid PO Numbers payload" });
    }

    console.log("==== REQUEST START ====");

    // 1. DB UPDATE
    const updatedProcess = await prisma.processInstance.update({
      where: { id: processId },
      data: {
        poNumbers: { push: [...poNumbers] },
        status: "PO_NO_ATTACHED",
      },
      include: {
        documents: {
          include: {
            document: true,
            signatures: { include: { user: true } },
          },
        },
      },
    });

    const allUniquePoNumbers = Array.from(new Set(updatedProcess.poNumbers));

    // 2. MONGO SYNC
    const syncPayload = {
      processId: updatedProcess.id,
      processName: updatedProcess.name,
      poNumbers: allUniquePoNumbers,
      documents: updatedProcess.documents.map((pd) => ({
        name: pd.document.name,
        path: path.join(__dirname, STORAGE_PATH, pd.document.path),
        signatures: pd.signatures.map((sig) => ({
          signedBy: sig.user.username,
          signedAt: sig.signedAt,
          remarks: sig.reason,
        })),
      })),
    };

    try {
      console.log("---- MONGO SYNC ----");
      await axios.post(`${P2P_SERVER}/sync-po-details`, syncPayload, {
        timeout: 15000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      console.log("Mongo Sync SUCCESS ✅");
    } catch (err) {
      console.log("Mongo Sync FAILED ❌:", err.message);
    }

    // 3. FTP UPLOAD — Active Mode using 'ftp' package
    let client;
    try {
      console.log("---- FTP START ----");
      const {
        FTP_HOST,
        FTP_PORT = "21",
        FTP_USER,
        FTP_PASSWORD,
        FTP_REMOTE_PATH,
      } = process.env;

      if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD)
        throw new Error("Missing FTP ENV variables");

      client = await ftpConnect({
        host: FTP_HOST,
        port: parseInt(FTP_PORT),
        user: FTP_USER,
        password: FTP_PASSWORD,
      });

      const remotePath = FTP_REMOTE_PATH || "/home/vendx_prd/prd/po";

      await ftpMkdir(client, remotePath);

      const existingFilesList = await ftpList(client, remotePath);
      const existingFtpFiles = new Set(existingFilesList.map((f) => f.name));

      for (const po of allUniquePoNumbers) {
        for (const pd of updatedProcess.documents) {
          // ==========================================
          // PATH DEBUGGING LOGS
          // ==========================================
          console.log("--- DEBUG PATH: attach_po_numbers ---");
          console.log("1. __dirname is:", __dirname);
          console.log("2. STORAGE_PATH is:", STORAGE_PATH);
          console.log("3. pd.document.path is:", pd.document.path);

          const localFilePath = path.join(
            __dirname,
            STORAGE_PATH,
            pd.document.path,
          );

          console.log("=> FINAL localFilePath RESOLVED TO:", localFilePath);
          // ==========================================

          const remoteFileName = `${remotePath}/${po}_${pd.document.name}`;
          const remoteFileNameOnly = `${po}_${pd.document.name}`;

          if (existingFtpFiles.has(remoteFileNameOnly)) {
            console.log(`Skipping (Already on FTP): ${remoteFileNameOnly}`);
            continue;
          }

          try {
            await fs.access(localFilePath);
            console.log(
              `fs.access PASSED for: ${localFilePath} - Starting FTP upload...`,
            );
            await ftpUploadFile(client, localFilePath, remoteFileName);
            console.log(`Uploaded: ${remoteFileNameOnly}`);
          } catch (err) {
            console.log(`File failed (${remoteFileNameOnly}):`, err.message);
          }
        }
      }

      console.log("FTP DONE ✅");
    } catch (err) {
      console.log("FTP FAILED ❌:", err.message);
    } finally {
      if (client) client.end();
    }

    console.log("TIME:", Date.now() - startTime, "ms");
    return res.status(200).json({
      success: true,
      message: "Process completed",
      data: updatedProcess,
    });
  } catch (error) {
    console.error("FATAL:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const sync_missing_po_data = async (req, res) => {
  const { processId } = req.params;
  let client;

  try {
    const processInstance = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        documents: {
          include: {
            document: true,
            signatures: { include: { user: true } },
          },
        },
      },
    });

    if (
      !processInstance ||
      !processInstance.poNumbers ||
      processInstance.poNumbers.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid process or missing PO numbers",
      });
    }

    const allUniquePoNumbers = Array.from(new Set(processInstance.poNumbers));

    // MONGO SYNC
    const syncPayload = {
      processId: processInstance.id,
      processName: processInstance.name,
      poNumbers: allUniquePoNumbers,
      documents: processInstance.documents.map((pd) => ({
        name: pd.document.name,
        path: path.join(__dirname, STORAGE_PATH, pd.document.path),
        signatures: pd.signatures.map((sig) => ({
          signedBy: sig.user.username,
          signedAt: sig.signedAt,
          remarks: sig.reason,
        })),
      })),
    };

    let mongoSuccess = false;
    try {
      await axios.post(`${P2P_SERVER}/sync-po-details`, syncPayload, {
        timeout: 15000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      mongoSuccess = true;
    } catch (err) {
      console.log("Mongo Sync FAILED:", err.message);
    }

    // FTP UPLOAD — Active Mode
    let ftpSuccess = true;

    try {
      const {
        FTP_HOST,
        FTP_PORT = "21",
        FTP_USER,
        FTP_PASSWORD,
        FTP_REMOTE_PATH,
      } = process.env;

      client = await ftpConnect({
        host: FTP_HOST,
        port: parseInt(FTP_PORT),
        user: FTP_USER,
        password: FTP_PASSWORD,
      });

      const remotePath = FTP_REMOTE_PATH || "/home/vendx_prd/prd/po";
      await ftpMkdir(client, remotePath);

      const existingFilesList = await ftpList(client, remotePath);
      const existingFtpFiles = new Set(existingFilesList.map((f) => f.name));

      for (const po of allUniquePoNumbers) {
        for (const pd of processInstance.documents) {
          // ==========================================
          // PATH DEBUGGING LOGS
          // ==========================================
          console.log("--- DEBUG PATH: sync_missing_po_data ---");
          console.log("1. __dirname is:", __dirname);
          console.log("2. STORAGE_PATH is:", STORAGE_PATH);
          console.log("3. pd.document.path is:", pd.document.path);

          const localFilePath = path.join(
            __dirname,
            STORAGE_PATH,
            pd.document.path,
          );

          console.log("=> FINAL localFilePath RESOLVED TO:", localFilePath);
          // ==========================================

          const remoteFileNameOnly = `${po}_${pd.document.name}`;
          const remoteFileName = `${remotePath}/${remoteFileNameOnly}`;

          if (existingFtpFiles.has(remoteFileNameOnly)) continue;

          try {
            await fs.access(localFilePath);
            console.log(
              `fs.access PASSED for: ${localFilePath} - Starting FTP upload...`,
            );
            await ftpUploadFile(client, localFilePath, remoteFileName);
          } catch (err) {
            console.log(
              `File access or upload failed for (${localFilePath}):`,
              err.message,
            );
            ftpSuccess = false;
          }
        }
      }
    } catch (err) {
      ftpSuccess = false;
      console.log("FTP FAILED:", err.message);
    } finally {
      if (client) client.end();
    }

    return res
      .status(200)
      .json({ success: true, data: { mongoSuccess, ftpSuccess } });
  } catch (error) {
    if (client) client.end();
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const mass_sync_po_data = async (req, res) => {
  const { processIds } = req.body;

  if (!processIds || !Array.isArray(processIds) || processIds.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "No process IDs provided" });
  }

  let client;

  try {
    const processes = await prisma.processInstance.findMany({
      where: { id: { in: processIds } },
      include: {
        documents: {
          include: {
            document: true,
            signatures: { include: { user: true } },
          },
        },
      },
    });

    let mongoSuccessCount = 0;
    let ftpSuccessCount = 0;

    // MONGO MASS SYNC
    for (const proc of processes) {
      if (!proc.poNumbers || proc.poNumbers.length === 0) continue;
      const allUniquePoNumbers = Array.from(new Set(proc.poNumbers));

      const syncPayload = {
        processId: proc.id,
        processName: proc.name,
        poNumbers: allUniquePoNumbers,
        documents: proc.documents.map((pd) => ({
          name: pd.document.name,
          path: path.join(__dirname, STORAGE_PATH, pd.document.path),
          signatures: pd.signatures.map((sig) => ({
            signedBy: sig.user.username,
            signedAt: sig.signedAt,
            remarks: sig.reason,
          })),
        })),
      };

      console.log("P2P", `${P2P_SERVER}/sync-po-details`);
      try {
        await axios.post(`${P2P_SERVER}/sync-po-details`, syncPayload, {
          timeout: 15000,
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        });
        mongoSuccessCount++;
      } catch (err) {
        console.log("error syncing data to P2P", err);
      }
    }

    // FTP MASS UPLOAD — Active Mode (Connect Once)
    try {
      const {
        FTP_HOST,
        FTP_PORT = "21",
        FTP_USER,
        FTP_PASSWORD,
        FTP_REMOTE_PATH,
      } = process.env;

      client = await ftpConnect({
        host: FTP_HOST,
        port: parseInt(FTP_PORT),
        user: FTP_USER,
        password: FTP_PASSWORD,
      });

      const remotePath = FTP_REMOTE_PATH || "/home/vendx_prd/prd/po";
      await ftpMkdir(client, remotePath);

      const existingFilesList = await ftpList(client, remotePath);
      const existingFtpFiles = new Set(existingFilesList.map((f) => f.name));

      for (const proc of processes) {
        if (!proc.poNumbers || proc.poNumbers.length === 0) continue;
        const allUniquePoNumbers = Array.from(new Set(proc.poNumbers));
        let allDocsUploaded = true;

        for (const po of allUniquePoNumbers) {
          for (const pd of proc.documents) {
            // ==========================================
            // PATH DEBUGGING LOGS
            // ==========================================
            console.log("--- DEBUG PATH: mass_sync_po_data ---");
            console.log("1. __dirname is:", __dirname);
            console.log("2. STORAGE_PATH is:", STORAGE_PATH);
            console.log("3. pd.document.path is:", pd.document.path);

            const localFilePath = path.join(
              __dirname,
              STORAGE_PATH,
              pd.document.path,
            );

            console.log("=> FINAL localFilePath RESOLVED TO:", localFilePath);
            // ==========================================

            const remoteFileNameOnly = `${po}_${pd.document.name}`;
            const remoteFileName = `${remotePath}/${remoteFileNameOnly}`;

            if (existingFtpFiles.has(remoteFileNameOnly)) continue;

            try {
              await fs.access(localFilePath);
              console.log(
                `fs.access PASSED for: ${localFilePath} - Starting FTP upload...`,
              );
              await ftpUploadFile(client, localFilePath, remoteFileName);
              existingFtpFiles.add(remoteFileNameOnly);
            } catch (err) {
              console.log(`Error uploading ftp doc (${localFilePath}):`, err);
              allDocsUploaded = false;
            }
          }
        }
        if (allDocsUploaded) ftpSuccessCount++;
      }
    } catch (err) {
      console.log("error uploading to ftp", err);
    } finally {
      if (client) client.end();
    }
    console.log("MASS FTP SYNC SUCCESS");
    return res.status(200).json({
      success: true,
      message: "Mass sync completed.",
      data: { mongoSuccessCount, ftpSuccessCount, total: processes.length },
    });
  } catch (error) {
    console.log("error syncing ftp", error);
    if (client) client.end();
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const get_po_inspection_data = async (req, res) => {
  let client;

  try {
    const processes = await prisma.processInstance.findMany({
      where: { status: "PO_NO_ATTACHED" },
      select: {
        id: true,
        name: true,
        poNumbers: true,
        documents: { select: { document: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (processes.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const allPoNumbersSet = new Set();
    processes.forEach((p) =>
      p.poNumbers.forEach((po) => allPoNumbersSet.add(po)),
    );
    const allPoNumbers = Array.from(allPoNumbersSet);

    // 1. BULK MONGO CHECK
    let mongoSyncStatus = {};
    try {
      const p2pResponse = await axios.post(
        `${P2P_SERVER}/check-po-sync-status`,
        { poNumbers: allPoNumbers },
        {
          timeout: 10000,
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        },
      );
      if (p2pResponse.data && p2pResponse.data.data)
        mongoSyncStatus = p2pResponse.data.data;
    } catch (err) {}

    // 2. BULK FTP CHECK — Active Mode
    let ftpFiles = new Set();
    try {
      const {
        FTP_HOST,
        FTP_PORT = "21",
        FTP_USER,
        FTP_PASSWORD,
        FTP_REMOTE_PATH,
      } = process.env;

      if (FTP_HOST && FTP_USER) {
        client = await ftpConnect({
          host: FTP_HOST,
          port: parseInt(FTP_PORT),
          user: FTP_USER,
          password: FTP_PASSWORD,
        });

        const remotePath = FTP_REMOTE_PATH || "/home/vendx_prd/prd/po";
        const list = await ftpList(client, remotePath);
        list.forEach((file) => ftpFiles.add(file.name));
      }
    } catch (err) {
      console.log("FTP Check FAILED:", err.message);
    } finally {
      if (client) client.end();
    }

    // 3. MAP DATA TOGETHER
    const inspectionData = processes.map((proc) => {
      const uniquePos = Array.from(new Set(proc.poNumbers));
      const missingFtpDocs = [];
      let ftpFullySynced = true;

      uniquePos.forEach((po) => {
        proc.documents.forEach((pd) => {
          const expectedFileName = `${po}_${pd.document.name}`;
          if (!ftpFiles.has(expectedFileName)) {
            ftpFullySynced = false;
            missingFtpDocs.push(expectedFileName);
          }
        });
      });

      const mongoFullySynced = uniquePos.every(
        (po) => mongoSyncStatus[po] === true,
      );

      return {
        id: proc.id,
        processName: proc.name,
        poNumbers: uniquePos,
        mongoFullySynced,
        ftpFullySynced,
        missingFtpDocs,
      };
    });

    return res.status(200).json({ success: true, data: inspectionData });
  } catch (error) {
    if (client) client.end();
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

async function handleProcessClaim(userId, stepInstanceId) {
  return prisma.$transaction(async (tx) => {
    // 2. Claim the step
    const step = await tx.processStepInstance.update({
      where: {
        id: stepInstanceId,
        status: "IN_PROGRESS",
        assignedTo: userId,
      },
      data: {
        status: "APPROVED",
        claimedAt: new Date(),
        pickedById: userId,
      },
      include: {
        workflowAssignment: {
          include: { departmentRoles: true },
        },
        assignmentProgress: {
          include: {
            departmentStepProgress: true,
          },
        },
        process: {
          select: { id: true },
        },
      },
    });

    const processId = step.process.id;

    // 3. Handle Role assignments
    if (step.workflowAssignment.assigneeType === "ROLE") {
      await tx.processStepInstance.deleteMany({
        where: {
          assignmentId: step.assignmentId,
          status: "IN_PROGRESS",
          id: { not: step.id },
        },
      });

      await tx.processNotification.deleteMany({
        where: {
          stepInstanceId: {
            in: (
              await tx.processStepInstance.findMany({
                where: {
                  assignmentId: step.assignmentId,
                  status: "IN_PROGRESS",
                  id: { not: step.id },
                },
                select: { id: true },
              })
            ).map((si) => si.id),
          },
        },
      });

      await tx.assignmentProgress.update({
        where: { id: step.assignmentProgress.id },
        data: { completed: true },
      });
    }

    // 4. Handle department-specific tracking
    if (step.workflowAssignment.assigneeType === "DEPARTMENT") {
      if (step.workflowAssignment.allowParallel) {
        await tx.departmentStepProgress.update({
          where: {
            id: step.assignmentProgress.departmentStepProgress.id,
          },
          data: {
            completedRoles: { push: step.roleId },
          },
        });
      }
      await updateDepartmentProgress(tx, step);
    }

    // 5. Check assignment and process completion
    await checkAssignmentCompletion(tx, step.assignmentProgress.id);
    await checkProcessProgress(tx, processId);

    // 6. Notify about step completion
    await tx.processNotification.create({
      data: {
        stepId: step.id,
        userId: userId,
        type: NotificationType.STEP_ASSIGNMENT,
        status: "COMPLETED",
        metadata: { action: "Step claimed and approved" },
      },
    });

    return step;
  });
}

async function updateDepartmentProgress(tx, stepInstance, workflowId) {
  const departmentProgress = await tx.departmentStepProgress.findFirst({
    where: {
      processId: stepInstance.processId,
      stepId: stepInstance.stepId,
      departmentId: stepInstance.departmentId,
      assignmentProgressId: stepInstance.progressId,
    },
  });

  if (!departmentProgress) {
    throw new Error("Department step progress not found");
  }

  let roleLevels = departmentProgress.roleLevels;
  if (typeof roleLevels === "string") {
    roleLevels = JSON.parse(roleLevels);
  }

  const updatedCompletedRoles = [
    ...new Set([...departmentProgress.completedRoles, stepInstance.roleId]),
  ];

  const currentLevelRoles = roleLevels[departmentProgress.currentLevel] || [];

  const currentLevelComplete = currentLevelRoles.every((roleId) =>
    updatedCompletedRoles.includes(roleId),
  );

  await tx.departmentStepProgress.update({
    where: { id: departmentProgress.id },
    data: { completedRoles: updatedCompletedRoles },
  });

  if (currentLevelComplete) {
    if (departmentProgress.currentLevel + 1 < roleLevels.length) {
      const nextLevel = departmentProgress.currentLevel + 1;
      const nextLevelRoles = roleLevels[nextLevel];

      const process = await tx.processInstance.findUnique({
        where: { id: stepInstance.processId },
        include: { documents: true },
      });

      const documentIds = process.documents.map((doc) => doc.documentId);

      for (const roleId of nextLevelRoles) {
        const userRoles = await tx.userRole.findMany({
          where: {
            roleId: roleId,
            role: {
              departmentId: stepInstance.departmentId,
            },
          },
          include: {
            user: true,
          },
        });

        if (userRoles.length > 0) {
          const user = userRoles[0].user;

          const hasAccess = await checkUserProcessAssignment(
            stepInstance.processId,
            user.id,
          );

          let newStepInstance;

          if (hasAccess) {
            continue;
          } else {
            newStepInstance = await tx.processStepInstance.create({
              data: {
                processId: stepInstance.processId,
                stepId: stepInstance.stepId,
                assignmentId: stepInstance.assignmentId,
                progressId: stepInstance.progressId,
                departmentId: stepInstance.departmentId,
                roleId: roleId,
                assignedTo: user.id,
                status: "IN_PROGRESS",
              },
            });

            for (const docId of documentIds) {
              await ensureDocumentAccessWithParents(tx, {
                documentId: docId,
                userId: user.id,
                stepInstanceId: newStepInstance.id,
                processId: stepInstance.processId,
                assignmentId: stepInstance.assignmentId,
                roleId: roleId,
                departmentId: stepInstance.departmentId,
              });
            }
          }
        }
      }

      await tx.departmentStepProgress.update({
        where: { id: departmentProgress.id },
        data: {
          currentLevel: nextLevel,
        },
      });
    } else {
      await tx.departmentStepProgress.update({
        where: { id: departmentProgress.id },
        data: {
          isCompleted: true,
        },
      });

      await tx.assignmentProgress.update({
        where: { id: stepInstance.progressId },
        data: { completed: true, completedAt: new Date() },
      });
    }
  }
}

async function checkAssignmentCompletion(tx, progressId, stepInstanceId) {
  const progress = await tx.assignmentProgress.findUnique({
    where: { id: progressId },
    include: { workflowAssignment: true },
  });

  if (!progress) return false;

  if (progress.completed) {
    return true;
  }

  if (progress.workflowAssignment.assigneeType === "DEPARTMENT") {
    const departmentProgresses = await tx.departmentStepProgress.findMany({
      where: { assignmentProgressId: progressId },
    });

    return departmentProgresses.every(
      (deptProgress) => deptProgress.isCompleted,
    );
  }

  return false;
}

async function checkProcessProgress(tx, processId) {
  const process = await tx.processInstance.findUnique({
    where: { id: processId },
    include: {
      currentStep: true,
      workflow: {
        include: {
          steps: {
            include: { assignments: true },
          },
        },
      },
      qaChannels: {
        // Changed from 'queries' to 'qaChannels'
        where: { status: "RECIRCULATION_PENDING" },
      },
    },
  });

  if (process.qaChannels.length > 0) {
    return;
  }

  // Check only non-recirculated step instances for completion
  const currentStepAssignments = await tx.assignmentProgress.findMany({
    where: {
      processId,
      workflowAssignment: {
        stepId: process.currentStepId,
      },
    },
    include: {
      stepInstances: {
        where: {
          isRecirculated: false, // Only consider original instances
          OR: [{ status: "APPROVED" }, { status: "IN_PROGRESS" }],
        },
      },
    },
  });

  const allCompleted = currentStepAssignments.every(
    (a) =>
      a.stepInstances.every((si) => si.status === "APPROVED") || a.completed,
  );

  if (allCompleted) {
    const result = await advanceToNextStep(
      tx,
      processId,
      process.currentStepId,
    );
    return result;
  }
}

async function advanceToNextStep(tx, processId, currentStepId) {
  const currentStep = await tx.workflowStep.findUnique({
    where: { id: currentStepId },
    select: { id: true, stepNumber: true, workflowId: true },
  });

  if (!currentStep) {
    throw new Error(`Current step with ID ${currentStepId} not found`);
  }

  const nextStep = await tx.workflowStep.findFirst({
    where: {
      workflowId: currentStep.workflowId,
      stepNumber: currentStep.stepNumber + 1,
    },
    orderBy: { stepNumber: "asc" },
    include: { assignments: true },
  });

  const openQueries = await tx.processQA.findMany({
    where: {
      processId,
      answer: null,
      status: "OPEN",
    },
  });

  if (openQueries.length > 0) {
    return {
      status: "WAITING_QUERIES",
      openQueriesCount: openQueries.length,
    };
  }

  if (nextStep) {
    const process = await tx.processInstance.findUnique({
      where: { id: processId },
      include: { documents: true },
    });

    if (!process) {
      throw new Error(`Process with ID ${processId} not found`);
    }

    const documentIds = process.documents.map((doc) => doc.documentId);

    // Check if there are recirculated instances for the next step
    const existingRecirculatedInstances = await tx.processStepInstance.findMany(
      {
        where: {
          processId,
          stepId: nextStep.id,
          isRecirculated: true,
          status: "IN_PROGRESS",
        },
      },
    );

    if (existingRecirculatedInstances.length > 0) {
      // Use existing recirculated instances
      await tx.processInstance.update({
        where: { id: processId },
        data: { currentStepId: nextStep.id },
      });

      return {
        status: "ADVANCED",
        nextStepId: nextStep.id,
        recirculated: true,
      };
    } else {
      // Create new instances as before
      for (const assignment of nextStep.assignments) {
        await processAssignment(
          tx,
          process,
          nextStep,
          assignment,
          documentIds,
          false,
          false,
          currentStep.workflowId,
        );
      }

      await tx.processInstance.update({
        where: { id: processId },
        data: { currentStepId: nextStep.id },
      });

      return { status: "ADVANCED", nextStepId: nextStep.id };
    }
  } else {
    await tx.processInstance.update({
      where: { id: processId },
      data: { status: "COMPLETED", currentStepId: null },
    });
    return { status: "COMPLETED" };
  }
}

export async function buildRoleHierarchy(step, assignment) {
  const { allowParallel, direction } = assignment;
  const selectedRoles = step.selectedRoles;

  if (allowParallel) {
    return [selectedRoles];
  }

  if (selectedRoles.length === 0) {
    return [];
  }

  const roles = await prisma.role.findMany({
    where: { id: { in: selectedRoles } },
    include: { parentRole: true, childRoles: true },
  });

  // Create a map for quick lookup
  const roleMap = new Map();
  roles.forEach((role) => {
    roleMap.set(role.id, role);
  });

  // Find root roles (roles with no parent or parent not in selected roles)
  const rootRoles = roles.filter((role) => {
    return !role.parentRoleId || !selectedRoles.includes(role.parentRoleId);
  });

  // If no root roles found (all roles have parents within selection),
  // find the highest level roles (those whose parents are not in selection)
  if (rootRoles.length === 0) {
    const highestLevelRoles = roles.filter((role) => {
      return !role.parentRoleId || !selectedRoles.includes(role.parentRoleId);
    });

    if (highestLevelRoles.length > 0) {
      const result = [highestLevelRoles.map((r) => r.id)];
      return direction === "UPWARDS" ? result.reverse() : result;
    }

    // Fallback: if somehow still no roles found, return all as single level
    return [selectedRoles];
  }

  const levels = [];
  let currentLevel = rootRoles.map((role) => role.id);

  while (currentLevel.length > 0) {
    // Only include roles that are in our selected list
    const validRoles = currentLevel.filter((roleId) =>
      selectedRoles.includes(roleId),
    );
    if (validRoles.length > 0) {
      levels.push(validRoles);
    }

    const nextLevel = [];
    for (const roleId of currentLevel) {
      const role = roleMap.get(roleId);
      if (role && role.childRoles) {
        const childRoleIds = role.childRoles
          .filter((child) => selectedRoles.includes(child.id))
          .map((child) => child.id);
        nextLevel.push(...childRoleIds);
      }
    }
    currentLevel = nextLevel;
  }

  return direction === "UPWARDS" ? levels.reverse() : levels;
}

export async function buildRoleHierarchyForAssignment(
  direction,
  allowParallel,
  selectedRoles,
) {
  if (allowParallel) {
    return [selectedRoles];
  }

  if (selectedRoles.length === 0) {
    return [];
  }

  const roles = await prisma.role.findMany({
    where: { id: { in: selectedRoles } },
    include: { parentRole: true },
  });

  // Calculate depth for each role
  const depthMap = new Map();

  const calculateDepth = (roleId, visited = new Set()) => {
    if (visited.has(roleId)) return 0; // Prevent cycles
    if (depthMap.has(roleId)) return depthMap.get(roleId);

    visited.add(roleId);
    const role = roles.find((r) => r.id === roleId);

    if (
      !role ||
      !role.parentRoleId ||
      !selectedRoles.includes(role.parentRoleId)
    ) {
      depthMap.set(roleId, 0);
      return 0;
    }

    const depth = calculateDepth(role.parentRoleId, visited) + 1;
    depthMap.set(roleId, depth);
    return depth;
  };

  // Calculate depth for all selected roles
  selectedRoles.forEach((roleId) => calculateDepth(roleId));

  // Group by depth
  const depthGroups = {};
  selectedRoles.forEach((roleId) => {
    const depth = depthMap.get(roleId) || 0;
    if (!depthGroups[depth]) {
      depthGroups[depth] = [];
    }
    depthGroups[depth].push(roleId);
  });

  // Convert to array of levels
  const levels = Object.keys(depthGroups)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((depth) => depthGroups[depth]);

  return direction === "UPWARDS" ? levels.reverse() : levels;
}

// Bulletproof string extractor for messy JSON/Array/String fields
// Bulletproof string extractor for messy JSON/Array/String fields
const extractSafeStrings = (rawField) => {
  if (!rawField) return [];

  let parsed = [];

  if (Array.isArray(rawField)) {
    parsed = rawField;
  } else if (typeof rawField === "string") {
    try {
      const json = JSON.parse(rawField);
      parsed = Array.isArray(json) ? json : [json];
    } catch {
      parsed = rawField.split(",");
    }
  } else if (typeof rawField === "object") {
    parsed = [rawField];
  }

  return parsed
    .map((item) => {
      if (typeof item === "string") return item.trim();

      if (typeof item === "object" && item !== null) {
        return (
          item.label || item.name || item.value || item.tag || item.id || ""
        );
      }

      return String(item).trim();
    })
    .filter(Boolean);
};

export const get_user_processes = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const userId = userData.id;

    const inputParams = { ...req.query, ...req.body };

    const page = Number(inputParams.page) || 1;
    const pageSize =
      Number(inputParams.pageSize) || Number(inputParams.limit) || 15;

    const {
      search,
      workflowName,
      status,
      paymentMode,
      poNumber,
      tag,
      createdDateFrom,
      createdDateTo,
      paymentDateFrom,
      paymentDateTo,
    } = inputParams;

    // ───────────────── FETCH ─────────────────
    const stepInstances = await prisma.processStepInstance.findMany({
      where: {
        assignedTo: userId,
        status: "IN_PROGRESS",
      },
      include: {
        process: {
          include: {
            workflow: { select: { name: true } },
            initiator: { select: { username: true, id: true } },
            qaChannels: {
              where: { entityId: userId, status: "OPEN" },
              select: { id: true },
            },
          },
        },
        workflowStep: {
          select: {
            stepType: true,
            stepName: true,
            stepNumber: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });

    // ───────────────── MAP DATA ─────────────────
    let baseData = stepInstances.map((step) => {
      const process = step.process;
      const hasOpenQuery = process.qaChannels?.length > 0;

      return {
        id: step.id,
        processId: process.id,
        processName: process.name || "Unnamed Process",
        workflowName: process.workflow?.name || "Unknown Workflow",
        initiatorName: process.initiator?.username || "System User",
        isOwnProcess: process.initiatorId === userId,
        createdAt: step.createdAt,

        actionType:
          process.initiatorId === userId
            ? "APPROVAL"
            : step.workflowStep?.stepType || "GENERAL",

        currentStepName: step.workflowStep?.stepName || "Pending Step",
        stepNumber: step.workflowStep?.stepNumber || null,

        status: hasOpenQuery ? "REJECTED" : step.status || "IN_PROGRESS",
        hasOpenQuery,

        paymentMode: process.paymentMode || null,
        paymentDate: process.paymentDate || null,

        // ✅ FIXED HERE
        poNumbers: extractSafeStrings(process.poNumbers),
        tags: extractSafeStrings(process.tags),
      };
    });

    // ───────────────── FILTER OPTIONS ─────────────────
    const workflowsSet = new Set();
    const posSet = new Set();
    const tagsSet = new Set();

    baseData.forEach((item) => {
      if (item.workflowName) workflowsSet.add(item.workflowName);
      item.poNumbers.forEach((po) => posSet.add(po));
      item.tags.forEach((t) => tagsSet.add(t));
    });

    const filterOptions = {
      workflows: Array.from(workflowsSet).sort(),
      poNumbers: Array.from(posSet).sort(),
      tags: Array.from(tagsSet).sort(),
    };

    // ───────────────── FILTERING ─────────────────
    if (search) {
      const s = search.toLowerCase();
      baseData = baseData.filter(
        (item) =>
          item.processName.toLowerCase().includes(s) ||
          item.initiatorName.toLowerCase().includes(s) ||
          item.workflowName.toLowerCase().includes(s) ||
          item.currentStepName.toLowerCase().includes(s),
      );
    }

    if (workflowName && workflowName !== "All") {
      baseData = baseData.filter((item) => item.workflowName === workflowName);
    }

    if (status && status !== "All") {
      baseData = baseData.filter((item) => item.status === status);
    }

    if (paymentMode && paymentMode !== "All") {
      baseData = baseData.filter((item) => item.paymentMode === paymentMode);
    }

    if (poNumber && poNumber !== "All") {
      baseData = baseData.filter((item) => item.poNumbers.includes(poNumber));
    }

    if (tag && tag !== "All") {
      baseData = baseData.filter((item) => item.tags.includes(tag));
    }

    if (createdDateFrom) {
      const from = new Date(createdDateFrom).getTime();
      baseData = baseData.filter(
        (item) => new Date(item.createdAt).getTime() >= from,
      );
    }

    if (createdDateTo) {
      const to = new Date(createdDateTo);
      to.setHours(23, 59, 59, 999);
      baseData = baseData.filter(
        (item) => new Date(item.createdAt).getTime() <= to.getTime(),
      );
    }

    if (paymentDateFrom) {
      const from = new Date(paymentDateFrom).getTime();
      baseData = baseData.filter(
        (item) =>
          item.paymentDate && new Date(item.paymentDate).getTime() >= from,
      );
    }

    if (paymentDateTo) {
      const to = new Date(paymentDateTo);
      to.setHours(23, 59, 59, 999);
      baseData = baseData.filter(
        (item) =>
          item.paymentDate &&
          new Date(item.paymentDate).getTime() <= to.getTime(),
      );
    }

    // ───────────────── PAGINATION ─────────────────
    const total = baseData.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedData = baseData.slice(startIndex, startIndex + pageSize);

    return res.json({
      data: paginatedData,
      total,
      page,
      pageSize,
      filterOptions,
    });
  } catch (error) {
    console.error("Error in get_user_processes:", error);
    return res.status(500).json({ message: "Failed to retrieve processes" });
  }
};

export const get_all_processes_for_admin = async (req, res) => {
  try {
    // 1. Authorization check
    if (!req.user || (!req.user.isAdmin && !req.user.isRootLevel)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Admin privileges required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      paymentMode,
      poNumber,
      tag,
      workflowName,
      initiatorName,
      createdDateFrom,
      createdDateTo,
      // Pass this flag when the frontend only needs filter options, not paginated data
      // e.g. ?optionsOnly=true — skips the heavy findMany and only returns filter options
      optionsOnly,
    } = req.query;

    // ── Build WHERE clause ──────────────────────────────────────────────────
    const whereClause = buildAdminWhereClause({
      search,
      status,
      paymentMode,
      poNumber,
      tag,
      workflowName,
      initiatorName,
      createdDateFrom,
      createdDateTo,
    });

    // ── Fetch filter options for ALL matching records (not just this page) ──
    // We pull only the fields needed for dropdowns using a lean aggregation.
    const filterOptionRecords = await prisma.processInstance.findMany({
      where: whereClause,
      select: {
        tags: true,
        poNumbers: true,
        workflow: { select: { name: true } },
        initiator: { select: { name: true, username: true } },
        paymentSchedule: { select: { paymentMode: true } },
      },
    });

    const filterOptions = extractFilterOptions(filterOptionRecords);

    // If the caller only wants options (e.g. on initial load), return early.
    if (optionsOnly === "true") {
      return res.status(200).json({ success: true, filterOptions });
    }

    // ── Paginated data fetch ────────────────────────────────────────────────
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [processes, total] = await Promise.all([
      prisma.processInstance.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          workflow: { select: { name: true } },
          initiator: { select: { name: true, username: true } },
          currentStep: { select: { stepName: true } },
          paymentSchedule: { select: { paymentDate: true, paymentMode: true } },
        },
      }),
      prisma.processInstance.count({ where: whereClause }),
    ]);

    const processesWithReadOnlyFlag = processes.map((proc) => ({
      ...proc,
      processId: proc.id,
      processName: proc.name,
      workflowName: proc.workflow?.name || "N/A",
      initiatorName:
        proc.initiator?.name || proc.initiator?.username || "Unknown",
      currentStepName: proc.currentStep?.stepName || "N/A",
      paymentMode:
        proc.paymentMode || proc.paymentSchedule?.paymentMode || null,
      paymentDate:
        proc.paymentDate || proc.paymentSchedule?.paymentDate || null,
      isReadOnly: true,
    }));

    return res.status(200).json({
      success: true,
      processes: processesWithReadOnlyFlag,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      // Always include filterOptions so the frontend can update dropdowns
      // after every filter change without an extra round-trip.
      filterOptions,
    });
  } catch (error) {
    console.error("Error getting processes for admin:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error getting processes" });
  }
};

// ── Helper: build WHERE clause ──────────────────────────────────────────────
function buildAdminWhereClause({
  search,
  status,
  paymentMode,
  poNumber,
  tag,
  workflowName,
  initiatorName,
  createdDateFrom,
  createdDateTo,
}) {
  const where = {};

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  if (status && status !== "All") {
    where.status = status;
  }

  if (paymentMode && paymentMode !== "All") {
    where.OR = [{ paymentMode }, { paymentSchedule: { paymentMode } }];
  }

  if (poNumber && poNumber !== "All") {
    where.poNumbers = { has: poNumber };
  }

  if (tag && tag !== "All") {
    where.tags = { has: tag };
  }

  if (workflowName && workflowName !== "All") {
    where.workflow = { name: workflowName };
  }

  if (initiatorName && initiatorName !== "All") {
    where.initiator = {
      OR: [
        { name: { contains: initiatorName, mode: "insensitive" } },
        { username: { contains: initiatorName, mode: "insensitive" } },
      ],
    };
  }

  if (createdDateFrom || createdDateTo) {
    where.createdAt = {};
    if (createdDateFrom) where.createdAt.gte = new Date(createdDateFrom);
    if (createdDateTo) {
      const toDate = new Date(createdDateTo);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  return where;
}

async function checkAllAssignmentsCompleted(tx, processId, stepId) {
  const assignments = await tx.workflowAssignment.findMany({
    where: { stepId },
  });

  for (const assignment of assignments) {
    const assignmentProgress = await tx.assignmentProgress.findFirst({
      where: {
        processId,
        assignmentId: assignment.id,
      },
    });

    if (!assignmentProgress || !assignmentProgress.completed) {
      return false;
    }
  }

  return true;
}

export const complete_process_step = async (req, res) => {
  try {
    const { stepInstanceId } = req.body;
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const updatedStepInstance = await handleProcessClaim(
      userData.id,
      stepInstanceId,
    );

    const result = await prisma.$transaction(async (tx) => {
      let stepInstance = await tx.processStepInstance.findUnique({
        where: {
          id: stepInstanceId,
          assignedTo: userData.id,
          status: "IN_PROGRESS",
        },
        include: {
          process: {
            select: {
              id: true,
              status: true,
              currentStepId: true,
              workflowId: true,
              reopenCycle: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  workflowId: true,
                  stepNumber: true,
                },
              },
            },
          },
          assignmentProgress: true,
        },
      });

      if (!stepInstance) {
        stepInstance = updatedStepInstance;
      }

      if (!stepInstance.process) {
        throw new Error("Process not found for this step instance");
      }

      if (stepInstance.status === "FOR_RECIRCULATION") {
        throw new Error("Cannot complete step until recirculation is resolved");
      }

      const workflowId = stepInstance.process.workflowId;

      // Handle recirculated steps differently
      if (stepInstance.isRecirculated) {
        await tx.processStepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: "APPROVED",
            decisionAt: new Date(),
            pickedById: userData.id,
            claimedAt: new Date(),
          },
        });

        // For recirculated steps, check if all instances for this assignment are completed
        const pendingRecirculatedInstances =
          await tx.processStepInstance.findMany({
            where: {
              progressId: stepInstance.assignmentProgress.id,
              isRecirculated: true,
              status: "IN_PROGRESS",
            },
          });

        if (pendingRecirculatedInstances.length === 0) {
          await tx.assignmentProgress.update({
            where: { id: stepInstance.assignmentProgress.id },
            data: { completed: true, completedAt: new Date() },
          });
        }

        // Check if all assignments for the current step are completed
        const allAssignmentsCompleted = await checkAllAssignmentsCompleted(
          tx,
          stepInstance.processId,
          stepInstance.stepId,
        );

        if (allAssignmentsCompleted) {
          const advanceResult = await advanceToNextStep(
            tx,
            stepInstance.processId,
            stepInstance.stepId,
            workflowId,
          );

          return {
            message:
              "Recirculated step completed successfully and process advanced",
            advanceStatus: advanceResult.status,
            recirculated: true,
          };
        }

        return {
          message: "Recirculated step completed successfully",
          recirculated: true,
        };
      } else {
        // Original logic for non-recirculated steps
        await tx.processStepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: "APPROVED",
            decisionAt: new Date(),
            pickedById: userData.id,
            claimedAt: new Date(),
          },
        });

        if (stepInstance.workflowAssignment?.assigneeType === "DEPARTMENT") {
          await updateDepartmentProgress(tx, stepInstance, workflowId);
        }

        if (stepInstance.workflowAssignment?.assigneeType === "ROLE") {
          await tx.processStepInstance.deleteMany({
            where: {
              processId: stepInstance.processId,
              stepId: stepInstance.stepId,
              assignmentId: stepInstance.assignmentId,
              id: { not: stepInstanceId },
              status: "IN_PROGRESS",
            },
          });

          await tx.assignmentProgress.update({
            where: { id: stepInstance.assignmentProgress.id },
            data: { completed: true, completedAt: new Date() },
          });
        }

        const assignmentCompleted =
          stepInstance.workflowAssignment?.assigneeType !== "USER"
            ? await checkAssignmentCompletion(
                tx,
                stepInstance.assignmentProgress.id,
                stepInstance.id,
              )
            : true;

        const openQueries = await tx.processQA.findMany({
          where: {
            processId: stepInstance.processId,
            answer: null,
            status: "OPEN",
          },
        });

        if (openQueries.length > 0) {
          return {
            message:
              "Step completed, but process is waiting for query resolution",
            openQueriesCount: openQueries.length,
          };
        }

        if (assignmentCompleted) {
          const allAssignmentsCompleted =
            stepInstance.workflowAssignment?.assigneeType !== "USER"
              ? await checkAllAssignmentsCompleted(
                  tx,
                  stepInstance.processId,
                  stepInstance.stepId,
                )
              : true;

          const currentStep = await tx.workflowStep.findUnique({
            where: { id: stepInstance.stepId },
            select: { id: true, stepNumber: true, workflowId: true },
          });

          if (!currentStep) {
            throw new Error(
              `Current step with ID ${stepInstance.stepId} not found`,
            );
          }

          const nextStep = await tx.workflowStep.findFirst({
            where: {
              workflowId: currentStep.workflowId,
              stepNumber: currentStep.stepNumber + 1,
            },
            orderBy: { stepNumber: "asc" },
            include: { assignments: true },
          });

          if (allAssignmentsCompleted && nextStep) {
            const advanceResult = await advanceToNextStep(
              tx,
              stepInstance.processId,
              stepInstance.stepId,
              workflowId,
            );

            return {
              message: "Step completed successfully and process advanced",
              advanceStatus: advanceResult.status,
            };
          } else {
            await tx.processInstance.update({
              where: {
                id: stepInstance.processId,
              },
              data: { status: "COMPLETED" },
            });
          }
        }

        return {
          message: "Step completed successfully",
        };
      }
    });

    try {
      const stepInstance = await prisma.processStepInstance.findUnique({
        where: { id: stepInstanceId },
        include: {
          pickedBy: {
            select: { id: true, username: true, name: true, email: true },
          },
          process: {
            include: {
              initiator: {
                select: { id: true, username: true, name: true, email: true },
              },
            },
          },
          workflowStep: true,
        },
      });

      if (stepInstance) {
        const getNextAssignee = async (currentStepInstance) => {
          const currentStep = await prisma.workflowStep.findUnique({
            where: { id: currentStepInstance.stepId },
          });
          if (!currentStep) return null;
          const nextStep = await prisma.workflowStep.findFirst({
            where: {
              workflowId: currentStep.workflowId,
              stepNumber: currentStep.stepNumber + 1,
            },
          });
          if (!nextStep) return null;
          const nextInstance = await prisma.processStepInstance.findFirst({
            where: {
              processId: currentStepInstance.processId,
              stepId: nextStep.id,
              status: "IN_PROGRESS",
            },
            select: { assignedTo: true },
          });
          if (!nextInstance || !nextInstance.assignedTo) return null;
          return await prisma.user.findUnique({
            where: { id: nextInstance.assignedTo },
            select: { id: true, username: true, name: true, email: true },
          });
        };

        const nextAssignee = await getNextAssignee(stepInstance);
        const tags = await getProcessTags(stepInstance.processId);
        const processDescription = stepInstance.process.description;

        await sendProcessNotification("stepAssigned", {
          params: [
            stepInstance.process,
            stepInstance,
            userData, // completedByUser (though not used in template)
            nextAssignee,
            processDescription,
            tags,
          ],
        });

        // If process is completed, send processCompleted notification
        const processStatus = await prisma.processInstance.findUnique({
          where: { id: stepInstance.processId },
          select: { status: true, initiatorId: true },
        });

        if (processStatus.status === "COMPLETED") {
          const initiator = await prisma.user.findUnique({
            where: { id: processStatus.initiatorId },
            select: { id: true, email: true, username: true, name: true },
          });
          if (initiator) {
            const tags = await getProcessTags(stepInstance.processId);
            const processDescription = stepInstance.process.description;
            await sendProcessNotification("processCompleted", {
              params: [
                stepInstance.process,
                initiator,
                processDescription,
                tags,
              ],
            });
          }

          try {
            await handleOnApprovalPayment(stepInstance.processId);
          } catch (error) {
            console.error("Error handling payment on approval:", error);
          }
        }
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error completing step:", error);
    return res.status(500).json({
      message: "Error completing step",
      error: "Failed to complete the step. Please try again later.",
    });
  }
};

async function checkPendingQueries(tx, stepInstanceId) {
  const count = await tx.processQuery.count({
    where: {
      stepInstanceId,
      status: { in: ["OPEN", "RECIRCULATION_PENDING"] },
    },
  });
  return count > 0;
}

async function getUserRecommendations(tx, userId) {
  return await tx.processRecommendation.findMany({
    where: {
      OR: [{ requestedById: userId }, { recommendedToId: userId }],
      status: "IN_PROGRESS",
    },
    select: {
      id: true,
      processId: true,
      remarks: true,
      status: true,
    },
  });
}

async function copyAndDeleteSingleDocument(processId, documentId, accessToken) {
  try {
    // Fetch the ProcessInstance with related workflow data
    const processInstance = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        workflow: true,
      },
    });

    if (!processInstance) {
      throw new Error(`ProcessInstance with id ${processId} not found`);
    }

    // Fetch the document details
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { path: true },
    });

    if (!document) {
      throw new Error(`Document with id ${documentId} not found`);
    }

    // Extract workflowName and processName
    const workflowName = processInstance.workflow.name;
    const processName = processInstance.name;

    // Construct paths and name
    const sourcePath = `./${document.path}`;
    const destinationPath = `../${workflowName}/${processName}`;
    const name = sourcePath.split("/").pop();

    // Perform file copy operation
    const copyResult = await new Promise((resolve, reject) => {
      file_copy(
        {
          headers: { authorization: `Bearer ${accessToken}` },
          body: { sourcePath, destinationPath, name },
        },
        {
          status: (code) => ({
            json: (data) => {
              if (code === 200) resolve(data);
              else reject(data);
            },
          }),
        },
      );
    });

    // Delete the original file
    await new Promise((resolve, reject) => {
      delete_file(
        {
          headers: { authorization: `Bearer ${accessToken}` },
          body: { documentId },
        },
        {
          status: (code) => ({
            json: (data) => {
              if (code === 200) resolve(data);
              else reject(data);
            },
          }),
        },
      );
    });

    // Return the copied documentId
    if (copyResult.documentId) {
      return copyResult.documentId;
    }

    throw new Error("Copy operation did not return a documentId");
  } catch (error) {
    console.log(
      `Error processing document ${documentId} for process ${processId}:`,
      error,
    );
    throw error;
  }
}

export const createQuery = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const {
      processId,
      stepInstanceId,
      queryText,
      answerText,
      documentChanges = [],
      documentSummaries = [],
      queryRaiserStepInstanceId,
    } = req.body;

    if (!processId || !stepInstanceId || (!queryText && !answerText)) {
      return res.status(400).json({
        message:
          "Missing required fields: processId, stepInstanceId, and queryText or answerText",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const stepInstance = await tx.processStepInstance.findUnique({
        where: { id: stepInstanceId, status: "IN_PROGRESS" },
        include: {
          process: { include: { workflow: true } },
          workflowStep: true,
        },
      });

      if (!stepInstance) {
        throw new Error("Invalid step instance or user not assigned");
      }

      let isDelegatedTask;
      if (queryRaiserStepInstanceId) {
        isDelegatedTask = await tx.processQA.findFirst({
          where: { stepInstanceId: queryRaiserStepInstanceId, status: "OPEN" },
        });
      }

      // Find step number 1 in the workflow
      const firstStep = await tx.workflowStep.findFirst({
        where: { workflowId: stepInstance.process.workflowId, stepNumber: 1 },
        include: {
          assignments: {
            include: {
              stepInstances: {
                where: { processId: processId },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      });

      if (!firstStep || !firstStep.assignments[0]) {
        throw new Error(
          "Step number 1 or its assignment not found in workflow",
        );
      }

      const firstStepAssignment = firstStep.assignments[0];
      let assignedAssigneeId =
        firstStepAssignment.stepInstances?.length > 0
          ? firstStepAssignment.stepInstances[0].assignedTo
          : firstStepAssignment.assigneeIds?.[0];

      if (!assignedAssigneeId) {
        throw new Error("No assignee found for step number 1");
      }

      const qaDetails = {
        documentChanges: [],
        documentSummaries: [],
        assigneeDetails: {
          assignedStepName: firstStep.stepName,
          assignedAssigneeId,
        },
      };

      // 1. Create or Update ProcessQA Record
      let processQA;
      if (!isDelegatedTask) {
        processQA = await tx.processQA.create({
          data: {
            processId,
            stepInstanceId,
            initiatorId: userData.id,
            entityId: parseInt(assignedAssigneeId),
            entityType: "USER",
            question: queryText,
            createdAt: new Date(),
            details: qaDetails,
          },
        });
      } else {
        processQA = await tx.processQA.update({
          where: { id: isDelegatedTask.id },
          data: {
            answer: answerText,
            answeredAt: new Date(),
            status: "RESOLVED",
            details: qaDetails,
          },
        });
      }

      // 2. Handle Document Changes
      const documentHistoryEntries = [];
      for (const change of documentChanges) {
        const {
          documentId,
          requiresApproval,
          isReplacement,
          replacesDocumentId,
          superseding = false,
        } = change;

        const document = await tx.document.findUnique({
          where: { id: parseInt(documentId) },
        });
        if (!document) throw new Error(`Document ${documentId} not found`);

        let replacedDocument = null;
        if (isReplacement) {
          if (!replacesDocumentId)
            throw new Error(
              `replacesDocumentId is required when isReplacement is true`,
            );
          replacedDocument = await tx.document.findUnique({
            where: { id: parseInt(replacesDocumentId) },
          });
          if (!replacedDocument)
            throw new Error(
              `Replaced document ${replacesDocumentId} not found`,
            );

          await tx.processDocument.delete({
            where: {
              documentId_processId: {
                documentId: parseInt(replacesDocumentId),
                processId,
              },
            },
          });
        }

        const processDocument = await tx.processDocument.create({
          data: {
            processId,
            documentId: parseInt(documentId),
            isReplacement: false,
            superseding,
            replacedDocumentId: isReplacement
              ? parseInt(replacesDocumentId)
              : null,
            reopenCycle: stepInstance.process.reopenCycle,
          },
        });

        if (!isReplacement) {
          const history = await tx.documentHistory.create({
            data: {
              documentId: parseInt(documentId),
              processId,
              stepInstanceId,
              userId: userData.id,
              actionType: "UPLOADED",
              actionDetails: {
                isReplacement,
                superseding,
                requiresApproval,
                reopenCycle: stepInstance.process.reopenCycle,
              },
              isRecirculationTrigger: true,
              processDocumentId: processDocument.id,
            },
          });
          documentHistoryEntries.push(history);
        }

        qaDetails.documentChanges.push({
          documentId: parseInt(documentId),
          requiresApproval,
          isReplacement,
          superseding,
          replacesDocumentId: isReplacement
            ? parseInt(replacesDocumentId)
            : null,
        });
      }

      // 3. Handle Document Summaries
      for (const summary of documentSummaries) {
        const { documentId, feedbackText } = summary;
        const document = await tx.document.findUnique({
          where: { id: parseInt(documentId) },
        });
        if (!document) throw new Error(`Document ${documentId} not found`);

        const history = await tx.documentHistory.create({
          data: {
            documentId: parseInt(documentId),
            processId,
            stepInstanceId,
            userId: userData.id,
            actionType: "FEEDBACK",
            actionDetails: {
              feedbackText,
              reopenCycle: stepInstance.process.reopenCycle,
            },
            isRecirculationTrigger: true,
          },
        });

        qaDetails.documentSummaries.push({
          documentId,
          feedbackText,
          documentHistoryId: history.id,
        });
      }

      if (
        qaDetails.documentChanges.length > 0 ||
        qaDetails.documentSummaries.length > 0
      ) {
        await tx.processQA.update({
          where: { id: processQA.id },
          data: { details: qaDetails },
        });
      }

      // ==========================================
      // 4. ROUTING LOGIC (Fixed Block)
      // ==========================================

      if (isDelegatedTask) {
        // --- SCENARIO A: SOLVING A QUERY ---

        // 1. Mark the solver's task as complete
        await tx.processStepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: "APPROVED",
            decisionAt: new Date(),
            isRecirculated: true,
            recirculationReason: answerText || queryText,
          },
        });

        if (documentChanges.length > 0) {
          // If documents changed, fallback to Step 2 loop (from your original logic)
          const secondStep = await tx.workflowStep.findFirst({
            where: {
              workflowId: stepInstance.process.workflowId,
              stepNumber: 2,
            },
            include: { assignments: true },
          });

          if (secondStep) {
            await tx.processInstance.update({
              where: { id: processId },
              data: { currentStepId: secondStep.id },
            });

            const engagedStepInstances = await tx.processStepInstance.findMany({
              where: {
                processId,
                stepId: secondStep.id,
                OR: [
                  { pickedById: { not: null } },
                  { claimedAt: { not: null } },
                  {
                    status: {
                      in: ["APPROVED", "IN_PROGRESS", "FOR_RECIRCULATION"],
                    },
                  },
                ],
              },
            });

            for (const instance of engagedStepInstances) {
              await tx.processStepInstance.update({
                where: { id: instance.id },
                data: {
                  status: "IN_PROGRESS",
                  isRecirculated: true,
                  recirculationReason:
                    "Process reopened with superseded documents",
                  claimedAt: null,
                  pickedById: null,
                  recirculationCycle: { increment: 1 },
                },
              });
              await tx.processNotification.create({
                data: {
                  stepId: instance.id,
                  userId: instance.assignedTo,
                  type: "STEP_ASSIGNMENT",
                  status: "ACTIVE",
                  metadata: { processId, reason: "Process reopened" },
                },
              });
            }

            if (engagedStepInstances.length === 0) {
              const documentIds = documentChanges.map((doc) =>
                parseInt(doc.replacesDocumentId),
              );
              for (const assignment of secondStep.assignments) {
                await processAssignment(
                  tx,
                  process,
                  secondStep,
                  assignment,
                  documentIds,
                  true,
                  false,
                  process.workflowId,
                );
              }
            }
          }
        } else {
          // *** THE FIX ***
          // If NO documents changed, send it directly back to the original Query Raiser
          const raiserInstance = await tx.processStepInstance.findUnique({
            where: { id: queryRaiserStepInstanceId },
          });

          if (raiserInstance) {
            await tx.processStepInstance.update({
              where: { id: queryRaiserStepInstanceId },
              data: {
                status: "IN_PROGRESS",
                isRecirculated: true,
                recirculationReason: "Query resolved",
                claimedAt: null,
                pickedById: null,
              },
            });

            await tx.processInstance.update({
              where: { id: processId },
              data: { currentStepId: raiserInstance.stepId },
            });

            await tx.processNotification.create({
              data: {
                stepId: queryRaiserStepInstanceId,
                userId: raiserInstance.assignedTo,
                type: "DOCUMENT_QUERY",
                status: "ACTIVE",
                metadata: { answerText, processId },
              },
            });
          }
        }
      } else {
        // --- SCENARIO B: RAISING A QUERY ---

        // 1. Suspend the reviewer's current task
        await tx.processStepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: "FOR_RECIRCULATION",
            recirculationReason: queryText,
            isRecirculated: true,
          },
        });

        // 2. Create a brand new task for Step 1 (The Initiator/Solver)
        const newStepInstance = await tx.processStepInstance.create({
          data: {
            processId,
            stepId: firstStep.id,
            assignmentId: firstStepAssignment.id,
            assignedTo: parseInt(assignedAssigneeId),
            status: "IN_PROGRESS",
            createdAt: new Date(),
            deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
          },
        });

        await tx.processInstance.update({
          where: { id: processId },
          data: { currentStepId: firstStep.id },
        });

        await tx.processNotification.create({
          data: {
            stepId: newStepInstance.id,
            userId: parseInt(assignedAssigneeId),
            type: "DOCUMENT_QUERY",
            status: "ACTIVE",
            metadata: { queryText, processId },
          },
        });
      }

      return { processQA, documentHistoryEntries };
    });

    // --- EMAIL NOTIFICATIONS (Unchanged) ---
    try {
      const processQA = await prisma.processQA.findUnique({
        where: { id: result.processQA.id },
        include: {
          stepInstance: {
            include: {
              process: {
                include: {
                  initiator: {
                    select: {
                      id: true,
                      email: true,
                      username: true,
                      name: true,
                    },
                  },
                },
              },
              workflowStep: true,
            },
          },
          initiator: {
            select: { id: true, email: true, username: true, name: true },
          },
        },
      });

      if (processQA) {
        const isSolvingQuery = !!req.body.queryRaiserStepInstanceId;
        const tags = await getProcessTags(processId);
        const processDescription = processQA.stepInstance.process.description;

        if (isSolvingQuery) {
          if (processQA.initiator) {
            await sendProcessNotification("queryResolved", {
              params: [
                processQA.stepInstance.process,
                processQA,
                userData,
                processQA.initiator,
                processDescription,
                tags,
              ],
            });
          }
        } else {
          const initiator = processQA.stepInstance.process.initiator;
          if (initiator && initiator.id !== userData.id) {
            await sendProcessNotification("queryRaisedToInitiator", {
              params: [
                processQA.stepInstance.process,
                processQA,
                userData,
                initiator,
                processDescription,
                tags,
              ],
            });
          }
        }
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json({
      message: "Query processed successfully",
      queryId: result.processQA.id,
    });
  } catch (error) {
    console.error("Error creating/solving query:", error);
    return res
      .status(500)
      .json({ message: "Error processing request", error: error.message });
  }
};

export const createRecommendation = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const {
      processId,
      stepInstanceId,
      recommendationText,
      documentSummaries = [],
      recommenderUsername,
    } = req.body;

    if (
      !processId ||
      !stepInstanceId ||
      !recommendationText ||
      !recommenderUsername
    ) {
      return res.status(400).json({
        message:
          "Missing required fields: processId, stepInstanceId, recommendationText, recommenderUsername",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate step instance and user access
      const stepInstance = await tx.processStepInstance.findUnique({
        where: {
          id: stepInstanceId,
          assignedTo: userData.id,
          status: "IN_PROGRESS",
        },
        include: {
          process: true,
        },
      });

      if (!stepInstance) {
        throw new Error("Invalid step instance or user not assigned");
      }

      // 2. Validate recommender
      const recommender = await tx.user.findUnique({
        where: { username: recommenderUsername },
        select: { id: true },
      });

      if (!recommender) {
        throw new Error(
          `Recommender with username ${recommenderUsername} not found`,
        );
      }

      // 3. Validate document summaries
      for (const summary of documentSummaries) {
        const { documentId, queryText, requiresApproval } = summary;
        if (!documentId || !queryText || requiresApproval === undefined) {
          throw new Error(
            "Invalid document summary: documentId, queryText, and requiresApproval are required",
          );
        }
        const document = await tx.document.findUnique({
          where: { id: parseInt(documentId) },
        });
        if (!document) {
          throw new Error(
            `Document ${`One with ID ${documentId} not found`} not found`,
          );
        }
      }

      // 4. Create Recommendation entry
      const recommendation = await tx.recommendation.create({
        data: {
          processId,
          stepInstanceId,
          initiatorId: userData.id,
          recommenderId: recommender.id,
          recommendationText,
          documentSummaries,
          status: "OPEN",
          createdAt: new Date(),
        },
      });

      // 5. Update step instance status to FOR_RECOMMENDATION
      await tx.processStepInstance.update({
        where: { id: stepInstanceId },
        data: {
          status: "FOR_RECOMMENDATION",
        },
      });

      // 6. Create notification for the recommender
      await tx.processNotification.create({
        data: {
          stepId: stepInstanceId,
          userId: recommender.id,
          type: "DOCUMENT_QUERY", // Reusing DOCUMENT_QUERY type for consistency
          status: "ACTIVE",
          metadata: { recommendationText, processId },
        },
      });

      return recommendation;
    });

    try {
      const recommendation = await prisma.recommendation.findUnique({
        where: { id: result.id },
        include: {
          process: {
            include: {
              initiator: {
                select: { id: true, username: true, name: true, email: true },
              },
            },
          },
          stepInstance: {
            include: {
              workflowStep: true,
            },
          },
          initiator: {
            select: { id: true, username: true, name: true, email: true },
          },
          recommender: {
            select: { id: true, email: true, username: true, name: true },
          },
        },
      });

      if (recommendation && recommendation.recommender) {
        const tags = await getProcessTags(processId);
        const processDescription = recommendation.process.description;
        await sendProcessNotification("recommendationRequested", {
          params: [
            recommendation.process,
            recommendation,
            userData, // requesterUser
            recommendation.recommender,
            processDescription,
            tags,
          ],
        });
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json({
      message: "Recommendation request submitted successfully",
      recommendationId: result.id,
    });
  } catch (error) {
    console.error("Error creating recommendation:", error);
    return res.status(500).json({
      message: "Error creating recommendation",
      error: "Failed to create recommendation. Please try again later.",
    });
  }
};

export const signAsRecommender = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { recommendationId, documentId, reason } = req.body;

    if (!recommendationId || !documentId) {
      return res.status(400).json({
        message: "Missing required fields: recommendationId, documentId",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate recommendation and user
      const recommendation = await tx.recommendation.findUnique({
        where: { id: recommendationId },
        include: { process: true },
      });

      if (!recommendation) {
        throw new Error("Recommendation not found");
      }

      if (recommendation.recommenderId !== userData.id) {
        throw new Error("User is not the assigned recommender");
      }

      if (recommendation.status !== "OPEN") {
        throw new Error("Recommendation is not open for signing");
      }

      // 2. Validate document and ensure it requires approval
      const documentSummary = recommendation.documentSummaries?.find(
        (ds) =>
          parseInt(ds.documentId) === parseInt(documentId) &&
          ds.requiresApproval,
      );

      if (!documentSummary) {
        throw new Error(
          `Document ${documentId} does not require approval or is not part of this recommendation`,
        );
      }

      // 3. Find or create ProcessDocument
      let processDocument = await tx.processDocument.findFirst({
        where: {
          processId: recommendation.processId,
          documentId: parseInt(documentId),
        },
      });

      if (!processDocument) {
        processDocument = await tx.processDocument.create({
          data: {
            processId: recommendation.processId,
            documentId: parseInt(documentId),
          },
        });
      }

      // 4. Create DocumentSignature with recommender flags
      const signature = await tx.documentSignature.create({
        data: {
          processDocumentId: processDocument.id,
          userId: userData.id,
          reason: reason || "Signed as recommender",
          signedAt: new Date(),
          byRecommender: true,
          isAttachedWithRecommendation: false, // Will be updated to true in response
        },
      });

      // 5. Create DocumentHistory entry
      await tx.documentHistory.create({
        data: {
          documentId: parseInt(documentId),
          processId: recommendation.processId,
          stepInstanceId: recommendation.stepInstanceId,
          userId: userData.id,
          actionType: "SIGNED",
          actionDetails: {
            reason: reason || "Signed as recommender",
            byRecommender: true,
          },
          createdAt: new Date(),
          processDocumentId: processDocument.id,
        },
      });

      return signature;
    });

    return res.status(200).json({
      message: "Document signed successfully by recommender",
      signatureId: result.id,
    });
  } catch (error) {
    console.error("Error signing as recommender:", error);
    return res.status(500).json({
      message: "Error signing document",
      error: "Failed to sign document. Please try again later.",
    });
  }
};

export const submitRecommendationResponse = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { recommendationId, responseText, documentResponses = [] } = req.body;

    if (!recommendationId || !responseText) {
      return res.status(400).json({
        message: "Missing required fields: recommendationId, responseText",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate recommendation and user
      const recommendation = await tx.recommendation.findUnique({
        where: { id: recommendationId },
        include: { process: true, stepInstance: true },
      });

      if (!recommendation) {
        throw new Error("Recommendation not found");
      }

      if (recommendation.recommenderId !== userData.id) {
        throw new Error("User is not the assigned recommender");
      }

      if (recommendation.status !== "OPEN") {
        throw new Error("Recommendation is already resolved");
      }

      // 2. Validate document responses
      for (const response of documentResponses) {
        const { documentId, answerText } = response;
        if (!documentId || !answerText) {
          throw new Error(
            "Invalid document response: documentId and answerText are required",
          );
        }
        const documentSummary = recommendation.documentSummaries?.find(
          (ds) => parseInt(ds.documentId) === parseInt(documentId),
        );
        if (!documentSummary) {
          throw new Error(
            `Document ${documentId} is not part of this recommendation`,
          );
        }
      }

      // 3. Find and attach signatures
      const signatures = await tx.documentSignature.findMany({
        where: {
          processDocument: {
            processId: recommendation.processId,
            documentId: {
              in: recommendation.documentSummaries.map((ds) =>
                parseInt(ds.documentId),
              ),
            },
          },
          userId: userData.id,
          byRecommender: true,
          isAttachedWithRecommendation: false,
        },
      });

      for (const signature of signatures) {
        await tx.documentSignature.update({
          where: { id: signature.id },
          data: { isAttachedWithRecommendation: true },
        });
      }

      // 4. Create document history for responses
      const documentHistoryEntries = [];
      for (const response of documentResponses) {
        const { documentId, answerText } = response;
        const history = await tx.documentHistory.create({
          data: {
            documentId: parseInt(documentId),
            processId: recommendation.processId,
            stepInstanceId: recommendation.stepInstanceId,
            userId: userData.id,
            actionType: "FEEDBACK",
            actionDetails: { answerText, byRecommender: true },
            createdAt: new Date(),
          },
        });
        documentHistoryEntries.push(history);
      }

      // 5. Update Recommendation with response
      const updatedRecommendation = await tx.recommendation.update({
        where: { id: recommendationId },
        data: {
          responseText,
          details: { documentResponses },
          status: "RESOLVED",
          respondedAt: new Date(),
        },
      });

      // 6. Unfreeze the step instance
      await tx.processStepInstance.update({
        where: { id: recommendation.stepInstanceId },
        data: { status: "IN_PROGRESS" },
      });

      // 7. Create notification for the initiator
      await tx.processNotification.create({
        data: {
          stepId: recommendation.stepInstanceId,
          userId: recommendation.initiatorId,
          type: "DOCUMENT_QUERY",
          status: "ACTIVE",
          metadata: { responseText, processId: recommendation.processId },
        },
      });

      return { recommendation: updatedRecommendation, documentHistoryEntries };
    });

    try {
      const recommendation = await prisma.recommendation.findUnique({
        where: { id: recommendationId },
        include: {
          process: {
            include: {
              initiator: {
                select: { id: true, username: true, name: true, email: true },
              },
            },
          },
          initiator: {
            select: { id: true, username: true, name: true, email: true },
          },
          recommender: {
            select: { id: true, email: true, username: true, name: true },
          },
        },
      });

      if (recommendation && recommendation.initiator) {
        const tags = await getProcessTags(recommendation.processId);
        const processDescription = recommendation.process.description;
        await sendProcessNotification("recommendationResponded", {
          params: [
            recommendation.process,
            recommendation,
            userData, // recommenderUser (who responded)
            recommendation.initiator, // requesterUser
            processDescription,
            tags,
          ],
        });
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json({
      message: "Recommendation response submitted successfully",
      recommendationId: result.recommendation.id,
    });
  } catch (error) {
    console.error("Error submitting recommendation response:", error);
    return res.status(500).json({
      message: "Error submitting recommendation response",
      error:
        "Failed to submit recommendation response. Please try again later.",
    });
  }
};

export const get_recommendations = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized" || !userData?.id) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Unauthorized request",
          details: "Invalid or missing authorization token.",
          code: "UNAUTHORIZED",
        },
      });
    }

    const recommendations = await prisma.recommendation.findMany({
      where: {
        recommenderId: userData.id,
        status: "OPEN",
      },
      include: {
        process: {
          select: { id: true, name: true },
        },
        initiator: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedRecommendations = recommendations.map((rec) => ({
      recommendationId: rec.id,
      processId: rec.processId,
      processName: rec.process.name,
      initiatorUsername: rec.initiator.username,
      recommendationText: rec.recommendationText,
      createdAt: rec.createdAt.toISOString(),
    }));

    return res.status(200).json({
      success: true,
      recommendations: formattedRecommendations,
    });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to fetch recommendations",
        details: "Failed to fetch recommendations. Please try again later.",
        code: "RECOMMENDATIONS_FETCH_ERROR",
      },
    });
  }
};

export const get_recommendation = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized" || !userData?.id) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Unauthorized request",
          details: "Invalid or missing authorization token.",
          code: "UNAUTHORIZED",
        },
      });
    }

    const { recommendationId } = req.params;

    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: {
        process: {
          select: { id: true, name: true },
        },
        initiator: {
          select: { id: true, username: true },
        },
      },
    });

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Recommendation not found",
          details: "No recommendation found with the specified ID.",
          code: "RECOMMENDATION_NOT_FOUND",
        },
      });
    }

    if (recommendation.recommenderId !== userData.id) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Forbidden",
          details: "User is not the assigned recommender.",
          code: "FORBIDDEN",
        },
      });
    }

    // Fetch document names for documentSummaries
    const documentSummaries = recommendation.documentSummaries || [];
    const documentIds = documentSummaries.map((ds) => parseInt(ds.documentId));
    const documents = documentIds.length
      ? await prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, name: true, path: true },
        })
      : [];

    const documentMap = documents.reduce((map, doc) => {
      map[doc.id] = { name: doc.name, path: doc.path };
      return map;
    }, {});

    const formattedDocumentSummaries = documentSummaries.map((ds) => ({
      documentId: ds.documentId,
      documentName: documentMap[ds.documentId]?.name || "Unknown Document",
      documentPath:
        documentMap[ds.documentId]?.path.substring(
          0,
          documentMap[ds.documentId]?.path.lastIndexOf("/"),
        ) || "Unknown Path",
      queryText: ds.queryText,
      requiresApproval: ds.requiresApproval,
    }));

    return res.status(200).json({
      success: true,
      recommendation: {
        recommendationId: recommendation.id,
        processId: recommendation.processId,
        processName: recommendation.process.name,
        initiatorUsername: recommendation.initiator.username,
        recommendationText: recommendation.recommendationText,
        documentSummaries: formattedDocumentSummaries,
        status: recommendation.status,
        createdAt: recommendation.createdAt.toISOString(),
        responseText: recommendation.responseText || null,
        respondedAt: recommendation.respondedAt
          ? recommendation.respondedAt.toISOString()
          : null,
        documentResponses: recommendation.details?.documentResponses || [],
      },
    });
  } catch (error) {
    console.error("Error fetching recommendation:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to fetch recommendation",
        details:
          "Failed to retrieve recommendation details. Please try again later.",
        code: "RECOMMENDATION_FETCH_ERROR",
      },
    });
  }
};

export const reopen_process = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { processId, supersededDocuments } = req.body;

    const SOPIssueNo = req.body.issueNo;

    if (
      !processId ||
      !supersededDocuments ||
      !Array.isArray(supersededDocuments)
    ) {
      return res.status(400).json({
        message:
          "Missing required fields: processId, supersededDocuments (array)",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const process = await tx.processInstance.findUnique({
        where: { id: processId, initiatorId: userData.id },
        include: {
          workflow: {
            include: {
              steps: {
                include: {
                  assignments: true,
                },
              },
            },
          },
          documents: true,
        },
      });

      if (!process) {
        throw new Error(
          "Process not found, not completed, or user is not the initiator",
        );
      }

      // Update process status and increment reopen cycle
      const updatedProcess = await tx.processInstance.update({
        where: { id: processId },
        data: {
          status: "IN_PROGRESS",
          reopenCycle: { increment: 1 },
          isRecirculated: true,
        },
      });

      const documentIds = [];
      for (let {
        isNewDocument,
        preApproved,
        oldDocumentId,
        newDocumentId,
        reasonOfSupersed,
        issueNo,
        fileDescription,
        tags,
        partNumber,
      } of supersededDocuments) {
        const newDoc = await tx.document.findUnique({
          where: { id: parseInt(newDocumentId) },
        });

        if (!newDoc) {
          throw new Error(`New document not found: ${newDocumentId}`);
        }

        let oldDoc = null;

        if (!isNewDocument) {
          if (!oldDocumentId) {
            throw new Error(
              "oldDocumentId is required when isNewDocument is false",
            );
          }

          oldDoc = await tx.document.findUnique({
            where: { id: parseInt(oldDocumentId) },
          });

          if (!oldDoc) {
            throw new Error(`Old document not found: ${oldDocumentId}`);
          }
        }

        // Create process document
        const processDocument = await tx.processDocument.create({
          data: {
            processId,
            documentId: parseInt(newDocumentId),
            isReplacement: !isNewDocument,
            superseding: !isNewDocument,
            replacedDocumentId: !isNewDocument ? parseInt(oldDocumentId) : null,
            preApproved: !!preApproved,
            reasonOfSupersed: !isNewDocument
              ? reasonOfSupersed || "No reason provided"
              : null,
            SOPIssueNo: SOPIssueNo || null,
            issueNo: issueNo || null,
            description: fileDescription || null,
            tags: tags || [],
            partNumber: partNumber || null,
            reopenCycle: updatedProcess.reopenCycle,
          },
        });

        // Document history
        await tx.documentHistory.create({
          data: {
            documentId: parseInt(newDocumentId),
            processId,
            userId: userData.id,
            actionType: isNewDocument ? "UPLOADED" : "REPLACED",
            actionDetails: {
              isNewDocument,
              isReplacement: !isNewDocument,
              originalDocumentId: oldDoc ? oldDoc.id : null,
              reopenCycle: updatedProcess.reopenCycle,
            },
            isRecirculationTrigger: true,
            processDocumentId: processDocument.id,
            replacedDocumentId: oldDoc ? oldDoc.id : null,
          },
        });

        documentIds.push(parseInt(newDocumentId));

        // Ensure access for initiator
        await ensureDocumentAccessWithParents(tx, {
          documentId: parseInt(newDocumentId),
          userId: userData.id,
          processId,
          assignmentId: null,
          roleId: null,
          departmentId: null,
        });

        // Ensure access for old document (only if replacement)
        if (oldDoc) {
          await ensureDocumentAccessWithParents(tx, {
            documentId: oldDoc.id,
            userId: userData.id,
            processId,
            assignmentId: null,
            roleId: null,
            departmentId: null,
          });
        }
      }

      // Get all step instances that were engaged (APPROVED or IN_PROGRESS)
      const engagedStepInstances = await tx.processStepInstance.findMany({
        where: {
          processId,
          OR: [
            { status: "APPROVED" },
            { status: "IN_PROGRESS" },
            { pickedById: { not: null } },
          ],
        },
        include: {
          workflowAssignment: true,
        },
      });

      // Create new step instances for recirculation
      for (const oldStepInstance of engagedStepInstances) {
        const hasAccess = await checkUserProcessAssignment(
          processId,
          parseInt(oldStepInstance.assignedTo),
        );

        if (hasAccess) {
          continue;
        } else {
          const newStepInstance = await tx.processStepInstance.create({
            data: {
              processId,
              stepId: oldStepInstance.stepId,
              assignmentId: oldStepInstance.assignmentId,
              progressId: oldStepInstance.progressId,
              assignedTo: oldStepInstance.assignedTo,
              roleId: oldStepInstance.roleId,
              departmentId: oldStepInstance.departmentId,
              status: "IN_PROGRESS",
              isRecirculated: true,
              recirculationCycle: updatedProcess.reopenCycle,
              recirculationReason: "Process reopened with superseded documents",
              createdAt: new Date(),
              deadline: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours deadline
            },
          });

          // Ensure document access for the assigned user
          for (const docId of documentIds) {
            await ensureDocumentAccessWithParents(tx, {
              documentId: docId,
              userId: oldStepInstance.assignedTo,
              stepInstanceId: newStepInstance.id,
              processId,
              assignmentId: oldStepInstance.assignmentId,
              roleId: oldStepInstance.roleId,
              departmentId: oldStepInstance.departmentId,
            });
          }
        }
      }

      // Update current step to the first step that has recirculated instances
      const firstRecirculatedStep = await tx.processStepInstance.findFirst({
        where: {
          processId,
          isRecirculated: true,
          status: "IN_PROGRESS",
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          stepId: true,
        },
      });

      if (firstRecirculatedStep) {
        await tx.processInstance.update({
          where: { id: processId },
          data: { currentStepId: firstRecirculatedStep.stepId },
        });
      }

      return { process: updatedProcess };
    });

    try {
      const updatedProcess = await prisma.processInstance.findUnique({
        where: { id: processId },
        include: {
          initiator: {
            select: { id: true, username: true, name: true, email: true },
          },
          workflow: true,
        },
      });

      if (updatedProcess) {
        // Get all users who have step instances in this process
        const stepInstances = await prisma.processStepInstance.findMany({
          where: { processId: processId },
          distinct: ["assignedTo"],
          include: {
            assignedToUser: {
              select: { id: true, email: true, username: true, name: true },
            },
          },
        });

        // Send to all users involved in the process
        for (const stepInstance of stepInstances) {
          if (stepInstance.assignedToUser) {
            await sendProcessNotification("processReopened", {
              params: [
                updatedProcess,
                userData,
                "Process reopened with superseded documents",
              ],
            });
          }
        }
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json({
      message: "Process reopened successfully with superseded documents",
      processId: result.process.id,
      reopenCycle: result.process.reopenCycle,
    });
  } catch (error) {
    console.error("Error reopening process:", error);
    return res.status(500).json({
      message: "Error reopening process",
      error: "Failed to reopen process. Please try again later.",
    });
  }
};

export const get_completed_initiator_processes = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized" || !userData?.id) {
      return res.status(401).json({
        success: false,
        error: { message: "Unauthorized request", code: "UNAUTHORIZED" },
      });
    }

    const isPrivileged = userData.isAdmin || userData.isRootLevel;

    // ── Pagination ───────────────────────────────────────────────────────────
    const page = Math.max(0, parseInt(req.query.page ?? "1", 10) - 1);
    const pageSize = Math.min(
      100,
      Math.max(5, parseInt(req.query.pageSize ?? "10", 10)),
    );

    // ── Scope flags ──────────────────────────────────────────────────────────
    const showAll = req.query.showAll === "true";
    const ownOnly = req.query.ownOnly === "true";
    const optionsOnly = req.query.optionsOnly === "true";

    // Non-privileged users always see only their own processes.
    // Privileged users see all unless ownOnly=true or neither showAll nor ownOnly is set.
    const applyOwnFilter = isPrivileged ? ownOnly : true;

    // ── Filter params ────────────────────────────────────────────────────────
    const {
      search,
      poSearch, // legacy – maps to poNumbers array
      tagSearch, // legacy – maps to tags array
      workflowName,
      initiatorName,
      status,
      paymentMode,
      createdDateFrom,
      createdDateTo,
      paymentDateFrom,
      paymentDateTo,
    } = req.query;

    // ── Status filter ────────────────────────────────────────────────────────
    let statusFilter;
    if (status === "NOT_COMPLETED") {
      statusFilter = { not: "COMPLETED" };
    } else if (status && status !== "All") {
      statusFilter = status;
    }

    // ── Resolve workflowName → workflowId ────────────────────────────────────
    let resolvedWorkflowId;
    if (workflowName && workflowName !== "All") {
      const wf = await prisma.workflow.findFirst({
        where: { name: { contains: workflowName, mode: "insensitive" } },
        select: { id: true },
      });
      if (!wf) return emptyPage(res, page, pageSize);
      resolvedWorkflowId = wf.id;
    }

    // ── Resolve initiatorName → initiatorId ──────────────────────────────────
    let resolvedInitiatorId;
    if (initiatorName && initiatorName !== "All" && isPrivileged) {
      const u = await prisma.user.findFirst({
        where: { username: { contains: initiatorName, mode: "insensitive" } },
        select: { id: true },
      });
      if (!u) return emptyPage(res, page, pageSize);
      resolvedInitiatorId = u.id;
    }

    // ── Build paymentSchedule sub-filter ─────────────────────────────────────
    let paymentScheduleFilter;
    const hasPaymentFilter = paymentMode || paymentDateFrom || paymentDateTo;
    if (hasPaymentFilter) {
      paymentScheduleFilter = {
        is: {
          ...(paymentMode && paymentMode !== "All" ? { paymentMode } : {}),
          ...(paymentDateFrom || paymentDateTo
            ? {
                paymentDate: {
                  ...(paymentDateFrom
                    ? { gte: new Date(paymentDateFrom) }
                    : {}),
                  ...(paymentDateTo
                    ? {
                        lte: new Date(
                          new Date(paymentDateTo).setHours(23, 59, 59, 999),
                        ),
                      }
                    : {}),
                },
              }
            : {}),
        },
      };
    }

    // ── Build text search OR clause ───────────────────────────────────────────
    const textSearchClauses = [];
    if (search) {
      textSearchClauses.push(
        { name: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
        { poNumbers: { has: search } },
      );
    }
    if (poSearch && poSearch !== "All") {
      textSearchClauses.push({ poNumbers: { has: poSearch } });
    }
    if (tagSearch && tagSearch !== "All") {
      textSearchClauses.push({ tags: { has: tagSearch } });
    }

    // ── Build main WHERE clause ───────────────────────────────────────────────
    const whereClause = {
      ...(applyOwnFilter ? { initiatorId: userData.id } : {}),
      ...(resolvedInitiatorId ? { initiatorId: resolvedInitiatorId } : {}),
      ...(resolvedWorkflowId ? { workflowId: resolvedWorkflowId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(paymentScheduleFilter
        ? { paymentSchedule: paymentScheduleFilter }
        : {}),
      ...(createdDateFrom || createdDateTo
        ? {
            createdAt: {
              ...(createdDateFrom ? { gte: new Date(createdDateFrom) } : {}),
              ...(createdDateTo
                ? {
                    lte: new Date(
                      new Date(createdDateTo).setHours(23, 59, 59, 999),
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(textSearchClauses.length > 0 ? { OR: textSearchClauses } : {}),
    };

    // ── Fetch filter options for ALL matching records (whole result set) ──────
    // These are used to populate dropdowns on the frontend.
    const filterOptionRecords = await prisma.processInstance.findMany({
      where: whereClause,
      select: {
        tags: true,
        poNumbers: true,
        workflow: { select: { name: true } },
        initiator: { select: { name: true, username: true } },
        paymentSchedule: { select: { paymentMode: true } },
      },
    });

    const filterOptions = extractFilterOptions(filterOptionRecords);

    // Return early if only options are needed (e.g. initial page load).
    if (optionsOnly) {
      return res.status(200).json({ success: true, filterOptions });
    }

    // ── Parallel: count + paginated data ─────────────────────────────────────
    const [total, processes] = await Promise.all([
      prisma.processInstance.count({ where: whereClause }),
      prisma.processInstance.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip: page * pageSize,
        take: pageSize,
        include: {
          initiator: { select: { id: true, username: true, name: true } },
          workflow: { select: { id: true, name: true, version: true } },
          currentStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          paymentSchedule: {
            select: { paymentMode: true, paymentDate: true, status: true },
          },
        },
      }),
    ]);

    const transformed = processes.map((p) => ({
      _id: p.id,
      name: p.name,
      processId: p.id,
      processName: p.name,
      initiatorName: p.initiator?.username || "—",
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      tags: p.tags || [],
      poNumbers: p.poNumbers || [],
      workflowName: p.workflow?.name || "—",
      currentStepName: p.currentStep?.stepName || null,
      paymentMode: p.paymentSchedule?.paymentMode || null,
      paymentDate: p.paymentSchedule?.paymentDate || null,
      paymentStatus: p.paymentSchedule?.status || null,
      isOwnProcess: p.initiatorId === userData.id,
    }));

    return res.status(200).json({
      success: true,
      data: transformed,
      // Always return filterOptions so the frontend can refresh dropdowns
      // whenever filters change — no separate round-trip needed.
      filterOptions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: (page + 1) * pageSize < total,
        hasPrev: page > 0,
      },
    });
  } catch (error) {
    console.error("get_completed_initiator_processes error:", error);
    return res.status(500).json({
      success: false,
      error: { message: "Failed to retrieve processes" },
    });
  }
};

// ── Shared helper: empty paginated response ───────────────────────────────────
function emptyPage(res, page, pageSize) {
  return res.status(200).json({
    success: true,
    data: [],
    filterOptions: {
      workflows: ["All"],
      initiators: ["All"],
      paymentModes: ["All"],
      tags: ["All"],
      poNumbers: ["All"],
    },
    pagination: {
      page,
      pageSize,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    },
  });
}

// ── Shared helper: extract unique dropdown values from a set of records ───────
function extractFilterOptions(records) {
  const workflows = new Set();
  const initiators = new Set();
  const paymentModes = new Set();
  const tags = new Set();
  const poNumbers = new Set();

  for (const rec of records) {
    if (rec.workflow?.name) workflows.add(rec.workflow.name);
    if (rec.initiator?.name) initiators.add(rec.initiator.name);
    else if (rec.initiator?.username) initiators.add(rec.initiator.username);
    if (rec.paymentSchedule?.paymentMode)
      paymentModes.add(rec.paymentSchedule.paymentMode);
    rec.tags?.forEach((t) => t && tags.add(String(t).trim()));
    rec.poNumbers?.forEach((p) => p && poNumbers.add(String(p).trim()));
  }

  return {
    workflows: ["All", ...workflows],
    initiators: ["All", ...initiators],
    paymentModes: ["All", ...paymentModes],
    tags: ["All", ...tags],
    poNumbers: ["All", ...poNumbers],
  };
}

export const get_process_documents = async (req, res) => {
  try {
    const { processId, versionNumber } = req.params;
    const versionNum = parseInt(versionNumber);

    if (!processId || isNaN(versionNum) || versionNum < 1) {
      return res
        .status(400)
        .json({ error: "Invalid processId or versionNumber" });
    }

    // Fetch ProcessDocuments for the given processId and reopenCycle
    let processDocs = await prisma.processDocument.findMany({
      where: {
        processId,
        reopenCycle: versionNum - 1,
      },
      include: {
        document: true,
        replacedDocument: true,
      },
    });

    // Filter out replaced documents
    const filteredDocs = processDocs.filter((doc) => {
      const isReplaced = processDocs.some(
        (otherDoc) => otherDoc.replacedDocumentId === doc.documentId,
      );
      return !isReplaced;
    });

    let result = filteredDocs.map((doc) => {
      const pathWithoutFileName = doc.document.path.substring(
        0,
        doc.document.path.lastIndexOf("/"),
      );
      return {
        name: doc.document.name,
        path: pathWithoutFileName,
        id: doc.documentId,
        isNew: false,
      };
    });

    // If versionNumber > 1, compare with previous version
    if (versionNum > 1) {
      const prevVersionDocs = await prisma.processDocument.findMany({
        where: {
          processId,
          reopenCycle: versionNum - 2,
        },
        include: {
          document: true,
          replacedDocument: true,
        },
      });

      // Filter out replaced documents in previous version
      const filteredPrevDocs = prevVersionDocs.filter((doc) => {
        const isReplaced = prevVersionDocs.some(
          (otherDoc) => otherDoc.replacedDocumentId === doc.documentId,
        );
        return !isReplaced;
      });

      // Mark documents as new if they don't exist in previous version
      result = result.map((doc) => {
        const existsInPrev = filteredPrevDocs.some(
          (prevDoc) => prevDoc.documentId === doc.documentId,
        );
        return {
          ...doc,
          isNew: !existsInPrev,
        };
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching process documents:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    // await prisma.$disconnect();
  }
};

export const upload_documents_in_process = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { processId, documents, issueNo } = req.body;

    if (!processId || !documents || !Array.isArray(documents)) {
      return res.status(400).json({
        message: "Missing required fields: processId and documents (array)",
      });
    }

    // Check if process exists and user has access
    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        workflow: { select: { name: true } },
        initiator: { select: { id: true } },
      },
    });

    if (!process) {
      return res.status(404).json({ message: "Process not found" });
    }

    // Check if user is initiator or has access to the process
    const hasAccess = await checkUserProcessAccess(
      process.initiatorId,
      userData.id,
    );
    if (!hasAccess && process.initiator.id !== userData.id) {
      return res.status(403).json({
        message:
          "You don't have permission to upload documents to this process",
      });
    }

    const workflowName = process.workflow.name;
    const processName = process.name;

    let documentIds = documents.map((item) => item.documentId) || [];
    const copiedDocumentIds = [];

    // Copy documents to process folder (similar to initiate_process)
    for (const documentId of documentIds) {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { path: true, name: true, type: true },
      });

      if (document) {
        const sourcePath = `./${document.path}`;
        const destinationPath = `../${workflowName}/${processName}`;
        const name = sourcePath.split("/").pop();

        try {
          const copyResult = await new Promise((resolve, reject) => {
            file_copy(
              {
                headers: { authorization: `Bearer ${accessToken}` },
                body: { sourcePath, destinationPath, name },
              },
              {
                status: (code) => ({
                  json: (data) => {
                    if (code === 200) resolve(data);
                    else reject(data);
                  },
                }),
              },
            );
          });

          if (copyResult.documentId) {
            copiedDocumentIds.push(copyResult.documentId);
          }

          // Delete original document from workspace
          await new Promise((resolve, reject) => {
            delete_file(
              {
                headers: { authorization: `Bearer ${accessToken}` },
                body: { documentId },
              },
              {
                status: (code) => ({
                  json: (data) => {
                    if (code === 200) resolve(data);
                    else reject(data);
                  },
                }),
              },
            );
          });
        } catch (error) {
          console.error(`Error processing document ${documentId}:`, error);
          // If copy fails, use original document ID
          copiedDocumentIds.push(documentId);
        }
      }
    }

    documentIds = copiedDocumentIds;

    if (documentIds.length === 0) {
      return res.status(400).json({
        message: "No documents were successfully uploaded",
      });
    }

    // Create processDocument entries
    const processDocumentData = documents.map((item, index) => ({
      processId: processId,
      documentId: documentIds[index],
      reopenCycle: process.reopenCycle || 0,
      SOPIssueNo: issueNo || null,
      preApproved: item.preApproved || false,
      tags: item.tags || [],
      partNumber: item.partNumber || null,
      description: item.description || null,
      issueNo: item.issueNo || null,
      isReplacement: item.isReplacement || false,
      superseding: item.superseding || false,
      reasonOfSupersed: item.reasonOfSupersed || null,
    }));

    await prisma.processDocument.createMany({
      data: processDocumentData,
    });

    // Create document history for uploaded documents
    for (let i = 0; i < documents.length; i++) {
      await prisma.documentHistory.create({
        data: {
          documentId: documentIds[i],
          processId: processId,
          userId: userData.id,
          actionType: "UPLOADED",
          actionDetails: {
            uploadType: "ADDITIONAL_DOCUMENT",
            reopenCycle: process.reopenCycle || 0,
          },
          createdAt: new Date(),
        },
      });
    }

    const COMPLETED_STATUSES = ["APPROVED", "SKIPPED"];

    // Users who have ONLY completed step instances in this process
    const usersWithIncompleteSteps = await prisma.processStepInstance.findMany({
      where: {
        processId,
        status: { notIn: COMPLETED_STATUSES },
      },
      select: { assignedTo: true },
    });

    const excludedUserIds = usersWithIncompleteSteps.map((u) => u.assignedTo);

    const eligibleUsers = await prisma.processStepInstance.findMany({
      where: {
        processId,
        status: { in: COMPLETED_STATUSES },
        assignedTo: { notIn: excludedUserIds },
      },
      distinct: ["assignedTo"],
      select: {
        assignedTo: true,
        roleId: true,
        departmentId: true,
      },
    });

    if (eligibleUsers.length > 0) {
      await prisma.processStepInstance.createMany({
        data: eligibleUsers.map((user) => ({
          processId,
          assignedTo: user.assignedTo,
          roleId: user.roleId,
          departmentId: user.departmentId,
          status: "IN_PROGRESS",
          createdAt: new Date(),
        })),
      });
    }

    // Get updated document arrays (using the same logic as view_process)
    const { documentVersioning, sededDocuments, transformedDocuments } =
      await getProcessDocumentArrays(processId);

    return res.status(200).json({
      message: "Documents uploaded successfully to the process",
      documentVersioning,
      sededDocuments,
      documents: transformedDocuments,
    });
  } catch (error) {
    console.error("Error uploading documents to process:", error);
    return res.status(500).json({
      message: "Error uploading documents to process",
      error: "Failed to upload documents. Please try again later.",
    });
  }
};

export const delete_document_in_process = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { processId, documentId } = req.body;

    if (!processId || !documentId) {
      return res.status(400).json({
        message: "Missing required fields: processId and documentId",
      });
    }

    // Check if process exists and user has access
    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        initiator: { select: { id: true } },
      },
    });

    if (!process) {
      return res.status(404).json({ message: "Process not found" });
    }

    // Check if user is initiator or has access to the process
    const hasAccess = await checkUserProcessAccess(processId, userData.id);
    if (!hasAccess && process.initiator.id !== userData.id) {
      return res.status(403).json({
        message:
          "You don't have permission to delete documents from this process",
      });
    }

    // Check if document exists in process
    const processDocument = await prisma.processDocument.findFirst({
      where: {
        processId: processId,
        documentId: parseInt(documentId),
      },
      include: {
        signatures: true,
        rejections: true,
        document: {
          select: {
            id: true,
            path: true,
            name: true,
          },
        },
      },
    });

    if (!processDocument) {
      return res.status(404).json({
        message: "Document not found in the specified process",
      });
    }

    // Check if document has signatures or rejections (prevent deletion if signed/rejected)
    if (
      processDocument.signatures.length > 0 ||
      processDocument.rejections.length > 0
    ) {
      return res.status(400).json({
        message: "Cannot delete document that has been signed or rejected",
      });
    }

    // Check if this document is referenced as a replaced document
    const isReferenced = await prisma.processDocument.findFirst({
      where: {
        replacedDocumentId: parseInt(documentId),
      },
    });

    if (isReferenced) {
      return res.status(400).json({
        message:
          "Cannot delete document that is referenced by other documents in version chain",
      });
    }

    // Delete the process document association
    await prisma.processDocument.delete({
      where: {
        id: processDocument.id,
      },
    });

    // Check if this is the last reference to the document, then delete the document completely
    const otherReferences = await prisma.processDocument.findFirst({
      where: {
        documentId: parseInt(documentId),
        id: { not: processDocument.id },
      },
    });

    if (!otherReferences) {
      // Use the file_delete function to permanently delete the file from drive
      try {
        await new Promise((resolve, reject) => {
          file_delete(
            {
              headers: { authorization: `Bearer ${accessToken}` },
              body: { documentId: parseInt(documentId) },
            },
            {
              status: (code) => ({
                json: (data) => {
                  if (code === 200) {
                    resolve(data);
                  } else {
                    console.error(
                      `Failed to delete document from drive:`,
                      data,
                    );
                    reject(
                      new Error(
                        data.message || "Failed to delete file from drive",
                      ),
                    );
                  }
                },
              }),
            },
          );
        });
      } catch (fileDeleteError) {
        console.error(
          `Error deleting file from drive for document ${documentId}:`,
          fileDeleteError,
        );
        // Even if file deletion fails, we continue since the process document association is already removed
      }
    } else {
      console.log(
        `Document ${documentId} not deleted from drive as it has other process references`,
      );
    }

    // Get updated document arrays
    const { documentVersioning, sededDocuments, transformedDocuments } =
      await getProcessDocumentArrays(processId);

    return res.status(200).json({
      message: "Document deleted successfully from process",
      documentVersioning,
      sededDocuments,
      documents: transformedDocuments,
    });
  } catch (error) {
    console.error("Error deleting document from process:", error);
    return res.status(500).json({
      message: "Error deleting document from process",
      error: "Failed to delete document from process. Please try again later.",
    });
  }
};

// Helper function to get document arrays (extracted from view_process logic)
const getProcessDocumentArrays = async (processId) => {
  const processDocuments = await prisma.processDocument.findMany({
    where: { processId },
    include: {
      document: {
        select: {
          id: true,
          name: true,
          type: true,
          path: true,
        },
      },
      replacedDocument: {
        select: {
          id: true,
          name: true,
          path: true,
        },
      },
      signatures: {
        include: { user: { select: { id: true, username: true } } },
      },
      rejections: {
        include: { user: { select: { id: true, username: true } } },
      },
      documentHistory: {
        include: {
          user: { select: { id: true, name: true, username: true } },
          replacedDocument: {
            select: { id: true, name: true, path: true },
          },
        },
      },
    },
  });

  // Identify replaced and superseded document IDs
  const replacedDocumentIds = new Set(
    processDocuments
      .filter((pd) => pd.replacedDocumentId)
      .map((pd) => pd.replacedDocumentId),
  );

  const supersededDocumentIds = new Set(
    processDocuments
      .filter((pd) => pd.superseding)
      .map((pd) => pd.replacedDocumentId),
  );

  // Find the latest document
  let latestDocument = processDocuments.find(
    (pd) =>
      !replacedDocumentIds.has(pd.documentId) &&
      !supersededDocumentIds.has(pd.documentId),
  );

  if (!latestDocument) {
    latestDocument = processDocuments
      .filter((pd) => !replacedDocumentIds.has(pd.documentId))
      .sort((a, b) => b.document.id - a.document.id)[0];
  }

  // Build documentVersioning (same logic as view_process)
  const documentVersioning = [];
  const allProcessDocuments = processDocuments;

  const docIdToProcessDoc = new Map(
    allProcessDocuments.map((d) => [d.documentId, d]),
  );
  const replacedToReplacer = new Map(
    allProcessDocuments
      .filter((d) => d.replacedDocumentId)
      .map((d) => [d.replacedDocumentId, d.documentId]),
  );

  const terminalDocumentIds = allProcessDocuments
    .filter((d) => !replacedToReplacer.has(d.documentId))
    .map((d) => d.documentId);

  for (const terminalDocId of terminalDocumentIds) {
    const versions = [];
    let currentDocId = terminalDocId;
    const visitedDocIds = new Set();

    while (currentDocId) {
      if (visitedDocIds.has(currentDocId)) {
        console.warn(
          `Cycle detected at docId: ${currentDocId}. Breaking loop.`,
        );
        break;
      }
      visitedDocIds.add(currentDocId);

      const processDoc = docIdToProcessDoc.get(currentDocId);
      if (!processDoc) break;

      versions.unshift({
        id: processDoc.document.id,
        name: processDoc.document.name,
        path: processDoc.document.path.split("/").slice(0, -1).join("/"),
        type: processDoc.document.type,
        issueNo: processDoc.issueNo || null,
        SOPIssueNo: processDoc.SOPIssueNo || null,
        tags: processDoc.tags,
        preApproved: processDoc.preApproved,
        reasonOfSupersed: processDoc.reasonOfSupersed,
        description: processDoc.description,
        partNumber: processDoc.partNumber,
        active: processDoc.document.id === latestDocument?.document?.id,
        isReplacement: processDoc.isReplacement,
        superseding: processDoc.superseding,
        reopenCycle: processDoc.reopenCycle,
      });

      currentDocId = processDoc.replacedDocumentId;
    }

    if (versions.length > 0) {
      documentVersioning.push({
        latestDocumentId: terminalDocId,
        versions: versions,
      });
    }
  }

  // Build sededDocuments (same logic as view_process)
  const sededDocuments = [];
  if (processDocuments.length > 0) {
    const allDocsSorted = [...processDocuments].sort(
      (a, b) => a.document.id - b.document.id,
    );

    const reopenCycle1Docs = allDocsSorted.filter(
      (doc) => doc.reopenCycle === 1,
    );

    reopenCycle1Docs.forEach((firstReopenCycle1Doc) => {
      const documentWhichSuperseded = allDocsSorted.find(
        (doc) => doc.documentId === firstReopenCycle1Doc.replacedDocumentId,
      );

      const versions = [];
      let currentDoc = firstReopenCycle1Doc;
      let currentReopenCycle = 1;
      let lastDocBeforeCycleChange = null;
      const visitedDocIds = new Set();

      while (currentDoc && !visitedDocIds.has(currentDoc.documentId)) {
        visitedDocIds.add(currentDoc.documentId);

        if (currentDoc.reopenCycle > currentReopenCycle) {
          if (lastDocBeforeCycleChange) {
            versions.push({
              id: lastDocBeforeCycleChange.document.id,
              name: lastDocBeforeCycleChange.document.name,
              path: lastDocBeforeCycleChange.document.path
                ? lastDocBeforeCycleChange.document.path
                    .split("/")
                    .slice(0, -1)
                    .join("/")
                : "",
              issueNo: lastDocBeforeCycleChange.issueNo || null,
              SOPIssueNo: lastDocBeforeCycleChange.SOPIssueNo || null,
              type: lastDocBeforeCycleChange.document.type || "",
              tags: lastDocBeforeCycleChange.tags || [],
              reasonOfSupersed:
                lastDocBeforeCycleChange.reasonOfSupersed || null,
              description: lastDocBeforeCycleChange.description || null,
              partNumber: lastDocBeforeCycleChange.partNumber || null,
              active:
                lastDocBeforeCycleChange.document.id ===
                (latestDocument?.document?.id || null),
              isReplacement: lastDocBeforeCycleChange.isReplacement || false,
              superseding: lastDocBeforeCycleChange.superseding || false,
              preApproved: lastDocBeforeCycleChange.preApproved || false,
              reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
            });
          }
          currentReopenCycle = currentDoc.reopenCycle;
        }

        lastDocBeforeCycleChange = currentDoc;
        currentDoc = allDocsSorted.find(
          (d) => d.replacedDocumentId === currentDoc.documentId,
        );
      }

      if (
        lastDocBeforeCycleChange &&
        !versions.some((v) => v.id === lastDocBeforeCycleChange.document.id)
      ) {
        versions.push({
          id: lastDocBeforeCycleChange.document.id,
          name: lastDocBeforeCycleChange.document.name,
          path: lastDocBeforeCycleChange.document.path
            ? lastDocBeforeCycleChange.document.path
                .split("/")
                .slice(0, -1)
                .join("/")
            : "",
          type: lastDocBeforeCycleChange.document.type || "",
          issueNo: lastDocBeforeCycleChange.document.issueNo || null,
          tags: lastDocBeforeCycleChange.tags || [],
          active:
            lastDocBeforeCycleChange.document.id ===
            (latestDocument?.document?.id || null),
          isReplacement: lastDocBeforeCycleChange.isReplacement || false,
          superseding: lastDocBeforeCycleChange.superseding || false,
          reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
          preApproved: lastDocBeforeCycleChange.preApproved || false,
          reasonOfSupersed: lastDocBeforeCycleChange.reasonOfSupersed || null,
          description: lastDocBeforeCycleChange.description || null,
          partNumber: lastDocBeforeCycleChange.partNumber || null,
        });
      }

      if (documentWhichSuperseded) {
        sededDocuments.push({
          documentWhichSuperseded: {
            id: documentWhichSuperseded.document.id,
            name: documentWhichSuperseded.document.name,
            path: documentWhichSuperseded.document.path
              ? documentWhichSuperseded.document.path
                  .split("/")
                  .slice(0, -1)
                  .join("/")
              : "",
            type: documentWhichSuperseded.document.type || "",
            description: documentWhichSuperseded.description || "",
            preApproved: documentWhichSuperseded.preApproved || false,
            tags: documentWhichSuperseded.tags || [],
            issueNo: documentWhichSuperseded.issueNo || null,
            SOPIssueNo: documentWhichSuperseded.SOPIssueNo || null,
            reasonOfSupersed: documentWhichSuperseded.reasonOfSupersed || null,
            description: documentWhichSuperseded.description || null,
            partNumber: documentWhichSuperseded.partNumber || null,
          },
          latestDocumentId: latestDocument ? latestDocument.document.id : null,
          versions: versions,
        });
      }
    });
  }

  // Transform documents for response
  const transformedDocuments = processDocuments
    .filter(
      (doc) =>
        (!replacedDocumentIds.has(doc.documentId) ||
          (doc.replacedDocument &&
            doc.document.id === doc.replacedDocument.id)) &&
        !supersededDocumentIds.has(doc.documentId),
    )
    .map((doc) => {
      const signedBy =
        doc?.signatures.map((sig) => ({
          signedBy: sig.user.username,
          signedAt: sig.signedAt ? sig.signedAt.toISOString() : null,
          remarks: sig.reason || null,
          byRecommender: sig.byRecommender,
          isAttachedWithRecommendation: sig.isAttachedWithRecommendation,
        })) || [];

      const rejectionDetails =
        doc?.rejections.length > 0
          ? {
              rejectedBy: doc.rejections[0].user.username,
              rejectionReason: doc.rejections[0].reason || null,
              rejectedAt: doc.rejections[0].rejectedAt
                ? doc.rejections[0].rejectedAt.toISOString()
                : null,
              byRecommender: doc.rejections[0].byRecommender,
              isAttachedWithRecommendation:
                doc.rejections[0].isAttachedWithRecommendation,
            }
          : null;

      const parts = doc.document.path.split("/");
      parts.pop();
      const updatedPath = parts.join("/");

      return {
        id: doc.document.id,
        name: doc.document.name,
        type: doc.document.type,
        path: updatedPath,
        tags: doc.tags,
        signedBy,
        rejectionDetails,
        isRecirculationTrigger:
          doc?.documentHistory.some(
            (history) => history.isRecirculationTrigger,
          ) || false,
        approvalCount: signedBy.length,
        isReplacement: doc.isReplacement,
        superseding: doc.superseding,
        preApproved: doc.preApproved,
        reopenCycle: doc.reopenCycle,
        description: doc.description,
        reasonOfSupersed: doc.reasonOfSupersed,
        partNumber: doc.partNumber,
        issueNo: doc.issueNo,
        SOPIssueNo: doc.SOPIssueNo,
        active: true,
      };
    });

  return { documentVersioning, sededDocuments, transformedDocuments };
};

// Helper to check user access to process
const checkUserProcessAccess = async (initiatorId, userId) => {
  return initiatorId === userId;
};

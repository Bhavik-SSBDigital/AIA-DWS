import { verifyUser } from "../utility/verifyUser.js";
import fs from "fs/promises";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import puppeteer from "puppeteer";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import sharp from "sharp";
import { promisify } from "util";

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import forge from "node-forge";
import { plainAddPlaceholder } from "node-signpdf/dist/helpers/index.js";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import prisma from "../config/prisma-config.js";
const execPromise = promisify(exec);

const envVariables = process.env;

// ─────────────────────────────────────────────────────────────────────────
// Duplicate-signature protection
// ─────────────────────────────────────────────────────────────────────────

// Serialises signing per (process, user, document) so retries / double-clicks queue up
const signingLocks = new Map();
const acquireSigningLock = async (key) => {
  const previous = signingLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => (release = resolve));
  const tail = previous.then(() => current);
  signingLocks.set(key, tail);
  await previous;
  return () => {
    release();
    if (signingLocks.get(key) === tail) signingLocks.delete(key);
  };
};

// Same user already signed this document for this step (or within the last 2 min)?
const findDuplicateSignature = (
  processDocumentId,
  userId,
  processStepInstanceId,
) =>
  prisma.documentSignature.findFirst({
    where: {
      processDocumentId,
      userId,
      OR: [
        ...(processStepInstanceId ? [{ processStepInstanceId }] : []),
        { signedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) } },
      ],
    },
    select: { id: true },
  });

// ─────────────────────────────────────────────────────────────────────────
// PDF loading / output verification
// ─────────────────────────────────────────────────────────────────────────

// BEGIN loadPdfSafely

// A document "has pages" only if pdf-lib can actually enumerate them.
// NOTE: pdf-lib does NOT throw on some linearized / hybrid-xref PDFs
// (e.g. TallyPrime e-invoices). It silently returns a document with 0 pages,
// which later crashed with "Cannot read properties of undefined (reading 'getRotation')".
const hasPages = (doc) => {
  try {
    return doc.getPageCount() > 0 && doc.getPages().length > 0;
  } catch {
    return false;
  }
};

// --- ULTIMATE FAIL-SAFE PDF LOADER (Leveraging PyMuPDF for broken XREFs) ---
export const loadPdfSafely = async (
  pdfBytes,
  absDocumentPath,
  pythonEnvPath,
) => {
  let attempt1Threw = false;

  // Attempt 1: Standard Load (must really contain pages)
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    doc.getPageIndices(); // Force a parse to catch missing object refs immediately
    if (hasPages(doc)) return doc;
    console.warn(
      "pdf-lib loaded the file but found 0 pages (linearized/hybrid PDF). Healing with PyMuPDF...",
    );
  } catch (e1) {
    attempt1Threw = true;
    console.warn(
      "Standard load failed, attempting to strip trailing signatures...",
    );
  }

  // Attempt 2: Strip corrupted trailing incremental updates (node-signpdf tail blocks).
  // Only when the load actually THREW. If pdf-lib merely saw 0 pages, an older
  // revision could be returned and the latest content would be lost, so we go
  // straight to PyMuPDF healing instead.
  if (attempt1Threw) {
    try {
      const buffer = Buffer.isBuffer(pdfBytes)
        ? pdfBytes
        : Buffer.from(pdfBytes);
      const eofBuf = Buffer.from("%%EOF");
      let eofs = [];
      let i = buffer.indexOf(eofBuf);
      while (i !== -1) {
        eofs.push(i);
        i = buffer.indexOf(eofBuf, i + eofBuf.length);
      }

      // Iterate backwards through previous EOFs to find the last uncorrupted state
      for (let j = eofs.length - 2; j >= 0; j--) {
        try {
          const sliced = buffer.subarray(0, eofs[j] + eofBuf.length);
          const doc = await PDFDocument.load(sliced, {
            ignoreEncryption: true,
          });
          doc.getPageIndices();
          if (hasPages(doc)) return doc;
        } catch (e2) {
          continue;
        }
      }
    } catch (err) {}
  }

  // Attempt 3: Ultimate PyMuPDF Healing Strategy
  console.warn(
    "PDF-lib cannot parse the file. Using PyMuPDF to heal the structure...",
  );
  try {
    const tempHealedPath = absDocumentPath + ".healed.pdf";

    const command = `"${pythonEnvPath}" -c "import fitz, sys; doc = fitz.open(sys.argv[1]); doc.save(sys.argv[2]); doc.close()" "${absDocumentPath}" "${tempHealedPath}"`;
    await execPromise(command);

    const healedBytes = await fs.readFile(tempHealedPath);
    const doc = await PDFDocument.load(healedBytes, { ignoreEncryption: true });
    doc.getPageIndices(); // Verify
    if (!hasPages(doc)) {
      await fs.unlink(tempHealedPath).catch(() => {});
      throw new Error("healed PDF still has 0 pages");
    }

    await fs.writeFile(absDocumentPath, healedBytes);
    await fs.unlink(tempHealedPath).catch(() => {});

    return doc;
  } catch (healingError) {
    console.error(
      "Critical: PyMuPDF failed to heal the document:",
      healingError,
    );
    throw new Error(`PDF is irreversibly corrupted: ${healingError.message}`);
  }
};

// END loadPdfSafely

// Safety net: never write a signed file that lost pages.
// If the output can be parsed and has FEWER pages than the original, abort
// BEFORE the DB row is created and BEFORE the file on disk is replaced.
// (If pdf-lib simply cannot re-parse a DSC-signed output we only warn, because
// digitally signed output can legitimately be unreadable to pdf-lib.)
const verifyOutputPdf = async (bytes, minPages, label) => {
  let check;
  try {
    check = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (e) {
    console.warn(
      `[sign] ${label}: output re-parse skipped (${e.message}) - continuing`,
    );
    return;
  }
  if (check.getPageCount() < minPages) {
    throw new Error(
      `Signed output has ${check.getPageCount()} page(s), expected at least ${minPages}. Aborted to protect the original file.`,
    );
  }
};
// --------------------------------------------------------------------------------

// Unchanged Helper Functions
export async function executePythonScript(
  pythonEnvPath,
  pythonScriptPath,
  absDocumentPath,
) {
  const command = `"${pythonEnvPath}" "${pythonScriptPath}" "${absDocumentPath}"`;
  try {
    const { stdout, stderr } = await execPromise(command);

    // Attempt to parse stdout first. If valid JSON exists, ignore stderr warnings.
    try {
      const match = stdout.match(/\{.*\}/s);
      if (match) {
        return JSON.parse(match[0]);
      }
      return JSON.parse(stdout.trim());
    } catch (parseError) {
      console.error(
        `Script Output Unparseable: STDOUT: ${stdout} | STDERR: ${stderr}`,
      );
      throw new Error("Failed to parse coordinates from document.");
    }
  } catch (error) {
    console.error(`Error executing script: ${error.message}`);
    throw error;
  }
}

export function formatDate(timestamp) {
  const date = new Date(timestamp);
  const dateOptions = { day: "numeric", month: "short", year: "numeric" };
  const timeOptions = { hour: "numeric", minute: "numeric", hour12: true };
  const datePart = new Intl.DateTimeFormat("en-US", dateOptions).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", timeOptions).format(date);
  return `${datePart} at ${timePart}`;
}

export async function get_sign_coordinates_for_specific_step_in_process(
  documentId,
  stepId,
) {
  const coordinates = await prisma.signCoordinate.findMany({
    where: { processDocument: { documentId }, stepId },
  });
  return coordinates.map((coord) => ({
    page: coord.page,
    x: coord.x,
    y: coord.y,
    width: coord.width,
    height: coord.height,
    stepId: coord.stepId,
  }));
}

async function is_process_forwardable(process, userId) {
  return { isForwardable: true, isRevertable: false };
}

// Main Functions
export const sign_document = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const user = await prisma.user.findUnique({
      where: { id: userData.id },
      select: { signaturePicFileName: true, dscFileName: true },
    });
    if (!user?.signaturePicFileName)
      return res
        .status(400)
        .json({ message: "Please upload pic of your signature first" });

    const imagePath = path.join(
      __dirname,
      envVariables.SIGNATURE_FOLDER_PATH,
      user.signaturePicFileName,
    );
    try {
      await fs.access(imagePath);
    } catch {
      return res
        .status(400)
        .json({ message: "Couldn't find your signature image" });
    }

    const convertToJpeg = async (inputPath) => {
      const metadata = await sharp(inputPath).metadata();
      if (metadata.format === "jpeg") return inputPath;
      const outputFilePath = path.join(
        __dirname,
        envVariables.SIGNATURE_FOLDER_PATH,
        `${userData.username.toLowerCase()}.jpeg`,
      );
      await sharp(inputPath).jpeg().toFile(outputFilePath);
      return outputFilePath;
    };

    const jpegImagePath = await convertToJpeg(imagePath);
    const dscPath = user.dscFileName
      ? path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName)
      : undefined;

    const {
      documentId,
      processId,
      processStepInstanceId,
      p12password,
      remarks = "N/A",
    } = req.body;

    // ▼ NEW: serialise concurrent / repeated sign requests for this doc+user
    const releaseLock = await acquireSigningLock(
      `${processId}:${userData.id}:${documentId}`,
    );
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
      });
      const process = await prisma.processInstance.findUnique({
        where: { id: processId },
      });
      const processDocument = await prisma.processDocument.findFirst({
        where: { processId, documentId },
      });

      if (!document || !process || !processDocument) {
        return res
          .status(404)
          .json({ message: "Document or process not found" });
      }

      // ▼ NEW: already signed by this user for this step / within 2 minutes
      const duplicate = await findDuplicateSignature(
        processDocument.id,
        userData.id,
        processStepInstanceId,
      );
      if (duplicate) {
        return res.status(200).json({
          message: "Document already signed",
          isForwardable: true,
          isRevertable: false,
        });
      }

      const currentStep = await prisma.workflowStep.findUnique({
        where: { id: process.currentStepId },
      });
      const absDocumentPath = path.join(
        __dirname,
        "../../../../",
        "storage",
        document.path,
      );
      const existingPdfBytes = await fs.readFile(absDocumentPath);

      const pythonEnvPath = path.join(
        __dirname,
        "../../support/venv/bin/python",
      );
      const pythonScriptPath = path.join(
        __dirname,
        "../../support/getFileSpace.py",
      );

      const pdfDoc = await loadPdfSafely(
        existingPdfBytes,
        absDocumentPath,
        pythonEnvPath,
      );
      const pages = pdfDoc.getPages();
      const originalPageCount = pages.length;
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const coordinates =
        await get_sign_coordinates_for_specific_step_in_process(
          documentId,
          currentStep?.id,
        );

      let finalPdfBytes;
      let signatureCoordinates;

      // STEP 1: Generate PDF Bytes in memory (Atomic boundary)
      if (coordinates.length > 0) {
        finalPdfBytes = await print_signature_at_coordinates(
          pdfDoc,
          coordinates,
          jpegImagePath,
          userData.username,
          remarks,
          formatDate(Date.now()),
          helveticaFont,
          dscPath,
          p12password,
        );
      } else {
        const result = await print_signature_after_content_on_the_last_page(
          pdfDoc,
          pages[pages.length - 1],
          document.path,
          jpegImagePath,
          userData.username,
          formatDate(Date.now()),
          remarks,
          helveticaFont,
          pythonEnvPath,
          pythonScriptPath,
          dscPath,
          p12password,
        );
        finalPdfBytes = result.pdfBytes;
        signatureCoordinates = result.coords;
      }

      // ▼ NEW: never persist a signed file that lost pages
      await verifyOutputPdf(
        finalPdfBytes,
        originalPageCount,
        `doc ${documentId} process ${processId}`,
      );

      // STEP 2: Database updates via Transaction
      await prisma.$transaction(async (tx) => {
        if (coordinates.length > 0) {
          await tx.signCoordinate.updateMany({
            where: {
              processDocumentId: documentId.toString(),
              page: { in: coordinates.map((c) => c.page) },
            },
            data: { isSigned: true, signedById: userData.id },
          });
        } else if (signatureCoordinates) {
          await tx.signCoordinate.create({
            data: {
              processDocumentId: processDocument.id,
              page: signatureCoordinates.newlyAdded
                ? pages.length + 1
                : pages.length,
              x: signatureCoordinates.x,
              y: signatureCoordinates.y,
              width: signatureCoordinates.width,
              height: signatureCoordinates.height,
              stepId: currentStep?.id,
              isSigned: true,
              signedById: userData.id,
            },
          });
        }

        await tx.documentSignature.create({
          data: {
            processDocumentId: processDocument.id,
            userId: userData.id,
            processStepInstanceId: processStepInstanceId,
            reason: remarks,
          },
        });
      });

      // STEP 3: Write File (Only reached if memory generation and DB succeed)
      await fs.writeFile(absDocumentPath, finalPdfBytes);

      // ▼ NEW: one greppable success line per signed document
      console.log(
        `[sign] SIGNED document ${documentId} process ${processId} by ${userData.username}`,
      );

      const processResult = await is_process_forwardable(process, userData.id);
      return res.status(200).json({
        message: "Document signed successfully",
        isForwardable: processResult.isForwardable,
        isRevertable: processResult.isRevertable,
      });
    } finally {
      releaseLock(); // ▼ NEW
    }
  } catch (error) {
    console.error(
      `Error signing document ${req.body?.documentId} (process ${req.body?.processId}):`,
      error,
    );
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const sign_documents = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const user = await prisma.user.findUnique({
      where: { id: userData.id },
      select: { signaturePicFileName: true, dscFileName: true },
    });
    if (!user?.signaturePicFileName)
      return res
        .status(400)
        .json({ message: "Please upload pic of your signature first" });

    const imagePath = path.join(
      __dirname,
      envVariables.SIGNATURE_FOLDER_PATH,
      user.signaturePicFileName,
    );
    try {
      await fs.access(imagePath);
    } catch {
      return res
        .status(400)
        .json({ message: "Couldn't find your signature image" });
    }

    const convertToJpeg = async (inputPath) => {
      const metadata = await sharp(inputPath).metadata();
      if (metadata.format === "jpeg") return inputPath;
      const outputFilePath = path.join(
        __dirname,
        envVariables.SIGNATURE_FOLDER_PATH,
        `${userData.username.toLowerCase()}.jpeg`,
      );
      await sharp(inputPath).jpeg().toFile(outputFilePath);
      return outputFilePath;
    };

    const jpegImagePath = await convertToJpeg(imagePath);
    const dscPath = user.dscFileName
      ? path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName)
      : undefined;

    const { documents, processId, p12password } = req.body;
    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
    });
    if (!process) return res.status(404).json({ message: "Process not found" });

    const results = [];
    const errors = [];
    const currentStep = process.currentStepId
      ? await prisma.workflowStep.findUnique({
          where: { id: process.currentStepId },
        })
      : null;
    const pythonScriptPath = path.join(
      __dirname,
      "../../support/getFileSpace.py",
    );
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");

    for (const doc of documents) {
      // ▼ NEW: one signer at a time per (process, user, document)
      const releaseLock = await acquireSigningLock(
        `${processId}:${userData.id}:${doc.documentId}`,
      );
      try {
        const { documentId, processStepInstanceId, remarks = "N/A" } = doc;
        const document = await prisma.document.findUnique({
          where: { id: documentId },
        });
        if (!document) throw new Error("Document not found");

        const processDocument = await prisma.processDocument.findFirst({
          where: { processId, documentId },
        });
        if (!processDocument) throw new Error("Document not found in process");

        // ▼ NEW: skip if this user already signed (same step, or within 2 min)
        const duplicate = await findDuplicateSignature(
          processDocument.id,
          userData.id,
          processStepInstanceId,
        );
        if (duplicate) {
          results.push({
            documentId,
            documentName: document.name,
            success: true,
            message: "Already signed - skipped",
          });
          continue; // finally{} below still releases the lock
        }

        const extension = document.name?.split(".").pop()?.toLowerCase();
        const isPdf = extension === "pdf";

        // ── PDF PATH: print signature + DB + file write ──────────────────
        if (isPdf) {
          const absDocumentPath = path.join(
            __dirname,
            "../../../../",
            "storage",
            document.path,
          );
          const existingPdfBytes = await fs.readFile(absDocumentPath);
          const pdfDoc = await loadPdfSafely(
            existingPdfBytes,
            absDocumentPath,
            pythonEnvPath,
          );
          const pages = pdfDoc.getPages();
          const originalPageCount = pages.length;
          const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
          const coordinates =
            await get_sign_coordinates_for_specific_step_in_process(
              documentId,
              currentStep?.id,
            );

          let finalPdfBytes;
          let signatureCoordinates;

          // IN-MEMORY GENERATION (Atomic boundary)
          if (coordinates.length > 0) {
            finalPdfBytes = await print_signature_at_coordinates(
              pdfDoc,
              coordinates,
              jpegImagePath,
              userData.username,
              remarks,
              formatDate(Date.now()),
              helveticaFont,
              dscPath,
              p12password,
            );
          } else {
            const result = await print_signature_after_content_on_the_last_page(
              pdfDoc,
              pages[pages.length - 1],
              document.path,
              jpegImagePath,
              userData.username,
              formatDate(Date.now()),
              remarks,
              helveticaFont,
              pythonEnvPath,
              pythonScriptPath,
              dscPath,
              p12password,
            );
            finalPdfBytes = result.pdfBytes;
            signatureCoordinates = result.coords;
          }

          // ▼ NEW: never persist a signed file that lost pages
          await verifyOutputPdf(
            finalPdfBytes,
            originalPageCount,
            `doc ${documentId} process ${processId}`,
          );

          // DATABASE TRANSACTION
          await prisma.$transaction(async (tx) => {
            if (coordinates.length > 0) {
              await tx.signCoordinate.updateMany({
                where: {
                  processDocumentId: documentId.toString(),
                  page: { in: coordinates.map((c) => c.page) },
                },
                data: { isSigned: true, signedById: userData.id },
              });
            } else if (signatureCoordinates) {
              await tx.signCoordinate.create({
                data: {
                  processDocumentId: processDocument.id,
                  page: signatureCoordinates.newlyAdded
                    ? pages.length + 1
                    : pages.length,
                  x: signatureCoordinates.x,
                  y: signatureCoordinates.y,
                  width: signatureCoordinates.width,
                  height: signatureCoordinates.height,
                  stepId: currentStep?.id,
                  isSigned: true,
                  signedById: userData.id,
                },
              });
            }
            await tx.documentSignature.create({
              data: {
                processDocumentId: processDocument.id,
                userId: userData.id,
                processStepInstanceId,
                reason: remarks,
              },
            });
          });

          // FILE WRITE (Only triggers if everything above succeeds)
          await fs.writeFile(absDocumentPath, finalPdfBytes);

          // ── NON-PDF PATH: DB only, no printing ───────────────────────────
        } else {
          await prisma.$transaction(async (tx) => {
            await tx.documentSignature.create({
              data: {
                processDocumentId: processDocument.id,
                userId: userData.id,
                processStepInstanceId,
                reason: remarks,
              },
            });
          });
        }

        // ▼ NEW: one greppable success line per signed document
        console.log(
          `[sign] SIGNED document ${documentId} process ${processId} by ${userData.username}`,
        );

        results.push({
          documentId,
          documentName: document.name,
          success: true,
          message: isPdf ? "Signed successfully" : "Acknowledged successfully",
        });
      } catch (error) {
        // ▼ CHANGED: log now carries the process id so it can be grepped by process
        console.error(
          `Error signing document ${doc.documentId} (process ${processId}):`,
          error,
        );
        errors.push({
          documentId: doc.documentId,
          error: error.message,
          success: false,
        });
      } finally {
        releaseLock(); // ▼ NEW
      }
    }

    const processResult = await is_process_forwardable(process, userData.id);

    // ▼ NEW: partial failure must never look like success.
    // isForwardable is false unless EVERY document was signed, and the
    // failed document ids are returned explicitly for the frontend.
    const allSigned = errors.length === 0;
    const response = {
      message: "Batch signing completed",
      signedCount: results.length,
      failedCount: errors.length,
      allSigned,
      failedDocumentIds: errors.map((e) => e.documentId),
      results,
      isForwardable: processResult.isForwardable && allSigned,
      isRevertable: processResult.isRevertable,
      ...(errors.length > 0 && { errors }),
    };

    if (errors.length > 0) {
      console.error(
        `[sign] PARTIAL FAILURE process ${processId} by ${userData.username}: failed documents = ${response.failedDocumentIds.join(", ")}`,
      );
    }

    if (results.length === 0 && errors.length > 0)
      return res
        .status(500)
        .json({ ...response, message: "Failed to sign any documents" });
    if (errors.length > 0)
      return res
        .status(207)
        .json({ ...response, message: "Some documents failed to sign" });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Batch signing error:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: "An error occurred during batch signing",
    });
  }
};

export const revoke_sign = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { documentId, processId } = req.body;

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
    });
    if (!process) {
      return res.status(404).json({ message: "Process not found" });
    }

    const processDocument = await prisma.processDocument.findFirst({
      where: { processId, documentId },
    });

    if (!processDocument) {
      return res.status(404).json({ message: "Document not found in process" });
    }

    const signature = await prisma.documentSignature.findFirst({
      where: { processDocumentId: processDocument.id, userId: userData.id },
    });

    if (!signature) {
      return res
        .status(400)
        .json({ message: "User has not signed this document" });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    const absDocumentPath = path.join(
      __dirname,
      "../../../../",
      "storage",
      document.path,
    );
    const existingPdfBytes = await fs.readFile(absDocumentPath);
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");

    const pdfDoc = await loadPdfSafely(
      existingPdfBytes,
      absDocumentPath,
      pythonEnvPath,
    );

    const coordinates = await get_sign_coordinates_for_specific_step_in_process(
      documentId,
      process.currentStepId,
    );
    await clear_signature_at_coordinates(
      pdfDoc,
      coordinates,
      processDocument.id,
    );

    const updatedPdfBytes = await pdfDoc.save();
    await fs.writeFile(absDocumentPath, updatedPdfBytes);

    await prisma.documentSignature.delete({ where: { id: signature.id } });

    return res.status(200).json({ message: "Signature reversed successfully" });
  } catch (error) {
    console.error("Error in revoke_sign:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const reject_document = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const {
      processId,
      documentId,
      reason,
      processStepInstanceId,
      byRecommender = false,
      isAttachedWithRecommendation = false,
    } = req.body;

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
    });
    if (!process) {
      return res.status(400).json({ message: "Error getting process" });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      return res.status(400).json({ message: "Document not found" });
    }

    const processDocument = await prisma.processDocument.findFirst({
      where: { processId, documentId },
    });

    if (!processDocument) {
      return res.status(404).json({ message: "Document not found in process" });
    }

    const documentPath = document.path;
    const absDocumentPath = path.join(
      __dirname,
      "../../../../",
      "storage",
      documentPath,
    );
    const existingPdfBytes = await fs.readFile(absDocumentPath);

    const pythonScriptPath = path.join(
      __dirname,
      "../../support/getFileSpace.py",
    );
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");

    let scriptOutput;
    try {
      scriptOutput = await executePythonScript(
        pythonEnvPath,
        pythonScriptPath,
        absDocumentPath,
      );
    } catch (error) {
      console.error("Error calculating available space:", error);
      scriptOutput = { last_y: "not a number", height: 0 };
    }

    const lastYCoordinate = Number(scriptOutput.last_y);
    const pageHeight = Number(scriptOutput.height);
    const availableSpace = !isNaN(lastYCoordinate)
      ? Math.max(0, pageHeight - lastYCoordinate - 50)
      : 0;

    const pdfDoc = await loadPdfSafely(
      existingPdfBytes,
      absDocumentPath,
      pythonEnvPath,
    );

    const pages = pdfDoc.getPages();
    const lastPageIndex = pages.length - 1;
    const lastPage = pages[lastPageIndex];
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const rotationAngle = lastPage.getRotation().angle;

    const currentDate = new Date().toLocaleString();

    const rejectionReason = reason || "No reason provided";
    const watermarkLines = [
      `Rejected By: ${userData.username}`,
      `Timestamp: ${currentDate}`,
      `Reason: ${rejectionReason}`,
    ];

    const fontSize = 12;
    const lineSpacing = 20;
    const maxLineWidth = lastPage.getWidth() - 100;

    const splitText = (text) => {
      const words = text.split(" ");
      let lines = [];
      let currentLine = words[0];
      for (let i = 1; i < words.length; i++) {
        const width = helveticaFont.widthOfTextAtSize(
          currentLine + " " + words[i],
          fontSize,
        );
        if (width < maxLineWidth) {
          currentLine += " " + words[i];
        } else {
          lines.push(currentLine);
          currentLine = words[i];
        }
      }
      lines.push(currentLine);
      return lines;
    };

    // Shared Coordinate Calculation helper to fix Rotation Overlaps
    const drawRotatedText = (page, text, x, y, rot, font, size) => {
      try {
        const W = page.getWidth();
        const H = page.getHeight();
        const w = font.widthOfTextAtSize(text, size);
        const h = size;
        let drawX, drawY, actualRot;

        if (rot === 0) {
          drawX = x;
          drawY = y;
          actualRot = 0;
        } else if (rot === 90) {
          drawX = W - y;
          drawY = x + w;
          actualRot = -90;
        } else if (rot === 180) {
          drawX = W - x + w;
          drawY = H - y + h;
          actualRot = 180;
        } else {
          drawX = y + h;
          drawY = H - x;
          actualRot = 90;
        }

        page.drawText(text, {
          x: drawX,
          y: drawY,
          size,
          font,
          color: rgb(1, 0, 0),
          rotate: degrees(actualRot),
        });
      } catch (e) {
        console.warn("Skipped bad text:", text);
      }
    };

    let preparedLines = watermarkLines.flatMap(splitText);
    let totalTextHeight = preparedLines.length * lineSpacing;

    let yCoordinate = availableSpace;
    if (yCoordinate < totalTextHeight) {
      const newPage = pdfDoc.addPage();
      yCoordinate = newPage.getHeight() - 50;
      preparedLines.forEach((line, index) => {
        drawRotatedText(
          newPage,
          line,
          50,
          yCoordinate - index * lineSpacing,
          0,
          helveticaFont,
          fontSize,
        );
      });
    } else {
      preparedLines.forEach((line, index) => {
        drawRotatedText(
          lastPage,
          line,
          50,
          yCoordinate - index * lineSpacing,
          rotationAngle,
          helveticaFont,
          fontSize,
        );
      });
    }

    const updatedPdfBytes = await pdfDoc.save();
    await fs.writeFile(absDocumentPath, updatedPdfBytes);

    await prisma.document.update({
      where: { id: documentId },
      data: { isRejected: true },
    });

    await prisma.documentRejection.create({
      data: {
        processDocumentId: processDocument.id,
        userId: userData.id,
        reason: rejectionReason,
        processStepInstanceId,
        byRecommender,
        isAttachedWithRecommendation,
      },
    });

    const processResult = await is_process_forwardable(process, userData.id);

    return res.status(200).json({
      message: "Document rejected successfully",
      isForwardable: processResult.isForwardable,
      isRevertable: processResult.isRevertable,
    });
  } catch (error) {
    console.error("Error rejecting document:", error);
    return res.status(500).json({ message: "Error rejecting document" });
  }
};

export const revoke_rejection = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { processId, documentId } = req.body;

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
    });
    if (!process) {
      return res.status(400).json({ message: "Error getting process" });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document || !document.isRejected) {
      return res
        .status(400)
        .json({ message: "Document is not rejected or does not exist" });
    }

    const processDocument = await prisma.processDocument.findFirst({
      where: { processId, documentId },
    });

    const documentPath = document.path;
    const absDocumentPath = path.join(
      __dirname,
      "../../../../",
      "storage",
      documentPath,
    );
    const existingPdfBytes = await fs.readFile(absDocumentPath);
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");

    const pdfDoc = await loadPdfSafely(
      existingPdfBytes,
      absDocumentPath,
      pythonEnvPath,
    );

    const pages = pdfDoc.getPages();
    const lastPageIndex = pages.length - 1;

    if (pages.length > 1) {
      pdfDoc.removePage(lastPageIndex);
    } else {
      const lastPage = pages[lastPageIndex];
      lastPage.drawRectangle({
        x: 0,
        y: 0,
        width: lastPage.getWidth(),
        height: 50,
        color: rgb(1, 1, 1),
      });
    }

    const updatedPdfBytes = await pdfDoc.save();
    await fs.writeFile(absDocumentPath, updatedPdfBytes);

    await prisma.document.update({
      where: { id: documentId },
      data: { isRejected: false },
    });

    await prisma.processDocument.update({
      where: { id: processDocument.id },
      data: { rejectedById: null, rejectionReason: null, rejectedAt: null },
    });

    const processResult = await is_process_forwardable(process, userData.id);

    return res.status(200).json({
      message: "Rejection revoked successfully",
      isForwardable: processResult.isForwardable,
      isRevertable: processResult.isRevertable,
    });
  } catch (error) {
    console.error("Error revoking rejection:", error);
    return res.status(500).json({ message: "Error revoking rejection" });
  }
};

// Helper Functions for PDF Manipulation
async function clear_signature_at_coordinates(
  pdfDoc,
  coordinates,
  processDocumentId,
) {
  for (const coord of coordinates) {
    const page = pdfDoc.getPage(coord.page - 1);
    page.drawRectangle({
      x: coord.x - 1,
      y: page.getHeight() - coord.y - coord.height - 1,
      width: coord.width + 2,
      height: coord.height + 2,
      color: rgb(1, 1, 1),
      opacity: 1,
    });
  }

  await prisma.signCoordinate.updateMany({
    where: { processDocumentId, page: { in: coordinates.map((c) => c.page) } },
    data: { isSigned: false, signedById: null },
  });
}

function sanitizeText(text) {
  if (!text) return "";

  return text
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text, font, fontSize, maxWidth) {
  text = sanitizeText(text);
  if (!text) return [];

  const words = text.split(" ");
  const lines = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + " " + words[i];

    let width;
    try {
      width = font.widthOfTextAtSize(testLine, fontSize);
    } catch {
      continue;
    }

    if (width < maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }

  lines.push(currentLine);
  return lines;
}

export async function print_signature_after_content_on_the_last_page(
  pdfDoc,
  lastPage,
  documentPath,
  jpegImagePath,
  username,
  timestamp,
  remarks,
  helveticaFont,
  pythonEnvPath,
  pythonScriptPath,
  p12Path,
  p12password,
) {
  // ▼ NEW: clear message instead of "reading 'getRotation'" of undefined
  if (!lastPage) {
    throw new Error("PDF has no readable pages - cannot place signature");
  }

  const absDocumentPath = path.join(
    __dirname,
    "../../../../",
    "storage",
    documentPath,
  );
  const lastContentCoordinates = await executePythonScript(
    pythonEnvPath,
    pythonScriptPath,
    absDocumentPath,
  );

  // ▼ CHANGED: normalised (handles 360 / -90 etc.)
  const rotationAngle = ((lastPage.getRotation().angle % 360) + 360) % 360;
  const isLandscape = rotationAngle === 90 || rotationAngle === 270;

  // Normalize dimensions to represent the visual layout
  const visualWidth = isLandscape ? lastPage.getHeight() : lastPage.getWidth();
  const visualHeight = isLandscape ? lastPage.getWidth() : lastPage.getHeight();

  const pageHeight = lastContentCoordinates.height || visualHeight;
  const startingYFromTop = lastContentCoordinates.last_y || pageHeight;
  const availableSpaceAtBottom = Math.max(0, pageHeight - startingYFromTop);

  // CHANGED: copy into a fresh Uint8Array. Small files read into a pooled Buffer make
  // pdf-lib fail with "SOI not found in JPEG".
  const signatureImageBytes = new Uint8Array(await fs.readFile(jpegImagePath));
  const signatureImage = await pdfDoc.embedJpg(signatureImageBytes);

  const signatureImageWidth = 200;
  const signatureImageHeight = 75;
  const fontSize = 12;
  const lineSpacing = fontSize + 5;
  const MAX_WIDTH = 300;
  const LEFT_MARGIN = 50;
  const SAFETY_MARGIN = 120;

  let currentPage = lastPage;
  let rotation = rotationAngle;

  // ▼ CHANGED: rotated pages ALWAYS get a fresh upright page (avoids
  //   upside-down / overlapping signatures on rotated scans)
  let startY =
    rotationAngle === 0 && availableSpaceAtBottom > 150
      ? availableSpaceAtBottom - SAFETY_MARGIN
      : -1;

  // If there's no room, create a natively correctly-oriented page
  if (startY < 150) {
    currentPage = pdfDoc.addPage([visualWidth, visualHeight]);
    rotation = 0;
    startY = currentPage.getHeight() - 90;
  }

  let currentY = startY;

  // Properly maps coordinates regardless of document rotation
  const drawRotatedText = (page, text, x, y, rot, font, size) => {
    try {
      const W = page.getWidth();
      const H = page.getHeight();
      const w = font.widthOfTextAtSize(text, size);
      const h = size;
      let drawX, drawY, actualRot;

      if (rot === 0) {
        drawX = x;
        drawY = y;
        actualRot = 0;
      } else if (rot === 90) {
        drawX = W - y;
        drawY = x + w;
        actualRot = -90;
      } else if (rot === 180) {
        drawX = W - x + w;
        drawY = H - y + h;
        actualRot = 180;
      } else {
        drawX = y + h;
        drawY = H - x;
        actualRot = 90;
      }

      page.drawText(text, {
        x: drawX,
        y: drawY,
        size,
        font,
        color: rgb(0, 0, 0),
        rotate: degrees(actualRot),
      });
    } catch (e) {
      console.warn("Skipped bad text:", text);
    }
  };

  const drawRotatedImage = (page, img, x, y, w, h, rot) => {
    const W = page.getWidth();
    const H = page.getHeight();
    let drawX, drawY, actualRot;

    if (rot === 0) {
      drawX = x;
      drawY = y;
      actualRot = 0;
    } else if (rot === 90) {
      drawX = W - y;
      drawY = x + w;
      actualRot = -90;
    } else if (rot === 180) {
      drawX = W - x + w;
      drawY = H - y + h;
      actualRot = 180;
    } else {
      drawX = y + h;
      drawY = H - x;
      actualRot = 90;
    }

    page.drawImage(img, {
      x: drawX,
      y: drawY,
      width: w,
      height: h,
      rotate: degrees(actualRot),
    });
  };

  drawRotatedImage(
    currentPage,
    signatureImage,
    LEFT_MARGIN,
    currentY,
    signatureImageWidth,
    signatureImageHeight,
    rotation,
  );
  currentY -= signatureImageHeight + 4;

  const labels = [
    `Signed By: ${username}`,
    `Timestamp: ${timestamp}`,
    `Remarks: ${remarks || "N/A"}`,
  ];

  for (const label of labels) {
    const lines = wrapText(label, helveticaFont, fontSize, MAX_WIDTH);
    for (const line of lines) {
      drawRotatedText(
        currentPage,
        line,
        LEFT_MARGIN,
        currentY,
        rotation,
        helveticaFont,
        fontSize,
      );
      currentY -= lineSpacing;
    }
  }

  let finalPdfBytes;
  if (!p12Path) {
    finalPdfBytes = await pdfDoc.save();
  } else {
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: Buffer.from(pdfBytes),
      reason: "Digital Signature",
      signatureLength: 8192,
    });
    const p12Buffer = readFileSync(p12Path);
    const signer = new P12Signer(p12Buffer, { passphrase: p12password });
    const signPdf = new SignPdf();
    finalPdfBytes = await signPdf.sign(pdfWithPlaceholder, signer);
  }

  return {
    pdfBytes: finalPdfBytes,
    coords: {
      x: LEFT_MARGIN,
      y: currentY,
      width: MAX_WIDTH,
      height: 200,
      newlyAdded: rotation === 0 && startY === currentPage.getHeight() - 90,
    },
  };
}

export async function print_signature_at_coordinates(
  pdfDoc,
  coordinates,
  jpegImagePath,
  username,
  remarks,
  timestamp,
  helveticaFont,
  p12Path,
  p12password,
) {
  // CHANGED: readFileSync returned a pooled Buffer for small images -> "SOI not found in JPEG".
  const signatureImageBytes = new Uint8Array(await fs.readFile(jpegImagePath));
  const signatureImage = await pdfDoc.embedJpg(signatureImageBytes);

  for (const coord of coordinates) {
    const page = pdfDoc.getPage(coord.page - 1);
    const { x, y, width, height } = coord;

    const imageHeight = height * 0.65;
    const textHeight = height * 0.35;
    const textFontSize = Math.min(10, textHeight / 3);
    const textPadding = 2;

    // pdf-lib origin is bottom-left
    page.drawImage(signatureImage, {
      x,
      y: page.getHeight() - y - imageHeight,
      width,
      height: imageHeight,
    });

    let currentTextY = page.getHeight() - y - imageHeight - textPadding;
    const drawTextLine = (text) => {
      page.drawText(text, {
        x: x + 2,
        y: currentTextY,
        size: textFontSize,
        font: helveticaFont,
        color: rgb(0, 0, 0),
        maxWidth: width - 4,
      });
      currentTextY -= textFontSize + textPadding;
    };

    drawTextLine(`SignedBy: ${username}`);
    drawTextLine(`Remarks: ${remarks}`);
    drawTextLine(`Timestamp: ${timestamp}`);
  }

  let finalPdfBytes;
  if (!p12Path) {
    finalPdfBytes = await pdfDoc.save();
  } else {
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: Buffer.from(pdfBytes),
      reason: "Digital Signature",
      signatureLength: 8192,
    });

    const p12Buffer = readFileSync(p12Path);
    const signer = new P12Signer(p12Buffer, { passphrase: p12password });
    const signPdf = new SignPdf();
    finalPdfBytes = await signPdf.sign(pdfWithPlaceholder, signer);
  }

  return finalPdfBytes;
}

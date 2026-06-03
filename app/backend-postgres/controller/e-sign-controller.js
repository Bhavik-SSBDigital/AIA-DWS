import { PrismaClient } from "@prisma/client";
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

const prisma = new PrismaClient();
const execPromise = promisify(exec);

const envVariables = process.env;

// --- FIX: ULTIMATE FAIL-SAFE PDF LOADER (Leveraging PyMuPDF for broken XREFs) ---
const loadPdfSafely = async (pdfBytes, absDocumentPath, pythonEnvPath) => {
  // Attempt 1: Standard Load
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    doc.getPageIndices(); // Force a parse to catch missing object refs immediately
    return doc;
  } catch (e1) {
    console.warn(
      "Standard load failed, attempting to strip trailing signatures...",
    );
  }

  // Attempt 2: Strip corrupted trailing incremental updates (node-signpdf tail blocks)
  try {
    const buffer = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
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
        const doc = await PDFDocument.load(sliced, { ignoreEncryption: true });
        doc.getPageIndices();
        return doc;
      } catch (e2) {
        continue;
      }
    }
  } catch (err) {}

  // Attempt 3: Ultimate PyMuPDF Healing Strategy
  // If we hit "Invalid object ref: 4 0 R", the PDF structure is broken. We use your
  // existing python environment to rapidly rebuild the file structure.
  console.warn(
    "PDF-lib cannot parse the file. Using PyMuPDF to heal the structure...",
  );
  try {
    const tempHealedPath = absDocumentPath + ".healed.pdf";

    // Command line python execution to instantly heal missing objects
    const command = `"${pythonEnvPath}" -c "import fitz, sys; doc = fitz.open(sys.argv[1]); doc.save(sys.argv[2]); doc.close()" "${absDocumentPath}" "${tempHealedPath}"`;
    await execPromise(command);

    // Read the perfectly healed file
    const healedBytes = await fs.readFile(tempHealedPath);
    const doc = await PDFDocument.load(healedBytes, { ignoreEncryption: true });
    doc.getPageIndices(); // Verify

    // Overwrite the original broken file with the healed version
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
// --------------------------------------------------------------------------------

// Unchanged Helper Functions
export async function executePythonScript(
  pythonEnvPath,
  pythonScriptPath,
  absDocumentPath,
) {
  const command = `${pythonEnvPath} ${pythonScriptPath} "${absDocumentPath}"`;
  try {
    const { stdout, stderr } = await execPromise(command);
    if (stderr) {
      console.error(`Error output: ${stderr}`);
      throw new Error(stderr);
    }
    const scriptOutput = JSON.parse(stdout);
    return scriptOutput;
  } catch (error) {
    console.error(`Error executing script: ${error.message}`);
    throw error;
  }
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const dateOptions = { day: "numeric", month: "short", year: "numeric" };
  const timeOptions = { hour: "numeric", minute: "numeric", hour12: true };
  const datePart = new Intl.DateTimeFormat("en-US", dateOptions).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", timeOptions).format(date);
  return `${datePart} at ${timePart}`;
}

async function get_sign_coordinates_for_specific_step_in_process(
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
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const signaturePic = await prisma.user.findUnique({
      where: { id: userData.id },
      select: { signaturePicFileName: true },
    });
    const eSignFileName = signaturePic?.signaturePicFileName;

    if (!eSignFileName) {
      return res
        .status(400)
        .json({ message: "Please upload pic of your signature first" });
    }

    const imagePath = path.join(
      __dirname,
      envVariables.SIGNATURE_FOLDER_PATH,
      eSignFileName,
    );
    try {
      await fs.access(imagePath);
    } catch (error) {
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
    const {
      documentId,
      processId,
      passphrase,
      processStepInstanceId,
      p12password,
    } = req.body;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
    });

    if (!document || !process) {
      return res.status(404).json({ message: "Document or process not found" });
    }

    const processDocument = await prisma.processDocument.findFirst({
      where: { processId, documentId },
    });

    if (!processDocument) {
      return res.status(404).json({ message: "Document not found in process" });
    }

    const currentStep = await prisma.workflowStep.findUnique({
      where: { id: process.currentStepId },
    });

    const signature = `[${userData.username}, 
    }, Timestamp: ${formatDate(Date.now())}, fileName: ${document.name})]`;

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
    const lastPage = pages[lastPageIndex];
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const coordinates = await get_sign_coordinates_for_specific_step_in_process(
      documentId,
      currentStep?.id,
    );
    const remarks = req.body.remarks || "N/A";

    const pythonScriptPath = path.join(
      __dirname,
      "../../support/getFileSpace.py",
    );

    const user = await prisma.user.findUnique({
      where: { username: userData.username },
      select: { dscFileName: true },
    });
    if (coordinates.length > 0) {
      if (user.dscFileName) {
        console.log("dir name", __dirname);
        await print_signature_at_coordinates(
          pdfDoc,
          coordinates,
          jpegImagePath,
          userData.username,
          remarks,
          formatDate(Date.now()),
          helveticaFont,
          absDocumentPath,
          documentId,
          userData,
          path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName),
          p12password,
        );
      } else {
        console.log("dir name", __dirname);
        await print_signature_at_coordinates(
          pdfDoc,
          coordinates,
          jpegImagePath,
          userData.username,
          remarks,
          formatDate(Date.now()),
          helveticaFont,
          absDocumentPath,
          documentId,
          userData,
        );
      }
    } else {
      const dscPath = user.dscFileName
        ? path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName)
        : undefined;

      console.log("dsc path", dscPath);
      const signatureCoordinates =
        await print_signature_after_content_on_the_last_page(
          pdfDoc,
          lastPage,
          documentPath,
          jpegImagePath,
          userData.username,
          formatDate(Date.now()),
          remarks,
          helveticaFont,
          pythonEnvPath,
          pythonScriptPath,
        );

      await prisma.signCoordinate.create({
        data: {
          processDocumentId: processDocument.id,
          page: signatureCoordinates.newlyAdded
            ? lastPageIndex + 2
            : lastPageIndex + 1,
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

    const signDetails = await prisma.documentSignature.create({
      data: {
        processDocumentId: processDocument.id,
        userId: userData.id,
        processStepInstanceId: processStepInstanceId,
        reason: remarks,
      },
    });

    console.log("signed details", signDetails);
    const processResult = await is_process_forwardable(process, userData.id);

    return res.status(200).json({
      message: "Document signed successfully",
      isForwardable: processResult.isForwardable,
      isRevertable: processResult.isRevertable,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const sign_documents = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const signaturePic = await prisma.user.findUnique({
      where: { id: userData.id },
      select: { signaturePicFileName: true },
    });
    const eSignFileName = signaturePic?.signaturePicFileName;

    if (!eSignFileName) {
      return res
        .status(400)
        .json({ message: "Please upload pic of your signature first" });
    }

    const imagePath = path.join(
      __dirname,
      envVariables.SIGNATURE_FOLDER_PATH,
      eSignFileName,
    );
    try {
      await fs.access(imagePath);
    } catch (error) {
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

    const user = await prisma.user.findUnique({
      where: { username: userData.username },
      select: { dscFileName: true },
    });

    const dscPath = user.dscFileName
      ? path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName)
      : undefined;

    const { documents, processId, passphrase, p12password } = req.body;

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
    });

    if (!process) {
      return res.status(404).json({ message: "Process not found" });
    }

    const results = [];
    const errors = [];

    if (!Array.isArray(documents) || documents.length === 0) {
      const processResult = await is_process_forwardable(process, userData.id);
      const response = {
        message: "Batch signing completed",
        signedCount: results.length,
        failedCount: errors.length,
        results: results,
        isForwardable: processResult.isForwardable,
        isRevertable: processResult.isRevertable,
      };
      return res.status(200).json(response);
    }

    const currentStep = await prisma.workflowStep.findUnique({
      where: { id: process.currentStepId },
    });

    const pythonScriptPath = path.join(
      __dirname,
      "../../support/getFileSpace.py",
    );
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");

    for (const doc of documents) {
      try {
        const { documentId, processStepInstanceId, remarks = "N/A" } = doc;

        const document = await prisma.document.findUnique({
          where: { id: documentId },
        });

        if (!document) {
          errors.push({
            documentId,
            error: "Document not found",
            success: false,
          });
          continue;
        }

        const processDocument = await prisma.processDocument.findFirst({
          where: { processId, documentId },
        });

        if (!processDocument) {
          errors.push({
            documentId,
            error: "Document not found in process",
            success: false,
          });
          continue;
        }

        const extension = document.name?.split(".").pop()?.toLowerCase();
        const documentPath = document.path;

        if (extension === "pdf") {
          const absDocumentPath = path.join(
            __dirname,
            "../../../../",
            "storage",
            documentPath,
          );
          const existingPdfBytes = await fs.readFile(absDocumentPath);

          const pdfDoc = await loadPdfSafely(
            existingPdfBytes,
            absDocumentPath,
            pythonEnvPath,
          );

          const pages = pdfDoc.getPages();
          const lastPageIndex = pages.length - 1;
          const lastPage = pages[lastPageIndex];
          const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

          const coordinates =
            await get_sign_coordinates_for_specific_step_in_process(
              documentId,
              currentStep?.id,
            );

          if (coordinates.length > 0) {
            await print_signature_at_coordinates(
              pdfDoc,
              coordinates,
              jpegImagePath,
              userData.username,
              remarks,
              formatDate(Date.now()),
              helveticaFont,
              absDocumentPath,
              documentId,
              userData,
              dscPath,
              p12password,
            );
          } else {
            const signatureCoordinates =
              await print_signature_after_content_on_the_last_page(
                pdfDoc,
                lastPage,
                documentPath,
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

            await prisma.signCoordinate.create({
              data: {
                processDocumentId: processDocument.id,
                page: signatureCoordinates.newlyAdded
                  ? lastPageIndex + 2
                  : lastPageIndex + 1,
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
        }

        const signDetails = await prisma.documentSignature.create({
          data: {
            processDocumentId: processDocument.id,
            userId: userData.id,
            processStepInstanceId: processStepInstanceId,
            reason: remarks,
          },
        });

        results.push({
          documentId,
          documentName: document.name,
          signDetailsId: signDetails.id,
          success: true,
          message: "Document signed successfully",
        });
      } catch (error) {
        console.error(`Error signing document ${doc.documentId}:`, error);
        errors.push({
          documentId: doc.documentId,
          error: error.message,
          success: false,
        });
      }
    }

    const processResult = await is_process_forwardable(process, userData.id);

    const response = {
      message: "Batch signing completed",
      signedCount: results.length,
      failedCount: errors.length,
      results: results,
      isForwardable: processResult.isForwardable,
      isRevertable: processResult.isRevertable,
    };

    if (errors.length > 0) {
      response.errors = errors;
    }

    if (results.length === 0 && errors.length > 0) {
      return res.status(500).json({
        ...response,
        message: "Failed to sign any documents",
      });
    } else if (errors.length > 0) {
      return res.status(207).json({
        ...response,
        message: "Some documents failed to sign",
      });
    }

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

    let preparedLines = watermarkLines.flatMap(splitText);
    let totalTextHeight = preparedLines.length * lineSpacing;

    let yCoordinate = availableSpace;
    if (yCoordinate < totalTextHeight) {
      const newPage = pdfDoc.addPage();
      yCoordinate = newPage.getHeight() - 50;
      preparedLines.forEach((line, index) => {
        newPage.drawText(line, {
          x: 50,
          y: yCoordinate - index * lineSpacing,
          size: fontSize,
          font: helveticaFont,
          color: rgb(1, 0, 0),
        });
      });
    } else {
      preparedLines.forEach((line, index) => {
        lastPage.drawText(line, {
          x: 50,
          y: yCoordinate - index * lineSpacing,
          size: fontSize,
          font: helveticaFont,
          color: rgb(1, 0, 0),
        });
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

async function print_signature_after_content_on_the_last_page(
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

  const pageHeight = lastContentCoordinates.height || lastPage.getHeight();
  const startingYFromTop = lastContentCoordinates.last_y || pageHeight;
  const availableSpaceAtBottom = Math.max(0, pageHeight - startingYFromTop);

  const signatureImageBytes = await fs.readFile(jpegImagePath);
  const signatureImage = await pdfDoc.embedJpg(signatureImageBytes);

  const signatureImageWidth = 200;
  const signatureImageHeight = 75;

  const fontSize = 12;
  const lineSpacing = fontSize + 5;
  const MAX_WIDTH = 300;
  const LEFT_MARGIN = 50;
  const SAFETY_MARGIN = 120;

  const safeUsername = sanitizeText(username);
  const safeTimestamp = sanitizeText(timestamp);
  const safeRemarks = sanitizeText(remarks);

  const signedByLines = wrapText(
    `Signed By: ${safeUsername}`,
    helveticaFont,
    fontSize,
    MAX_WIDTH,
  );

  const timestampLines = wrapText(
    `Timestamp: ${safeTimestamp}`,
    helveticaFont,
    fontSize,
    MAX_WIDTH,
  );

  const remarksLines = wrapText(
    `Remarks: ${safeRemarks}`,
    helveticaFont,
    fontSize,
    MAX_WIDTH,
  );

  const drawRotatedText = (page, text, x, y, rotation, font, size) => {
    try {
      const W = page.getWidth();
      const H = page.getHeight();

      let rawX, rawY, rot;

      if (rotation === 0) {
        rawX = x;
        rawY = y;
        rot = 0;
      } else if (rotation === 90) {
        rawX = W - y;
        rawY = x;
        rot = 90;
      } else if (rotation === 270 || rotation === -90) {
        rawX = y;
        rawY = H - x;
        rot = -90;
      } else {
        rawX = W - x;
        rawY = H - y;
        rot = 180;
      }

      page.drawText(text, {
        x: rawX,
        y: rawY,
        size,
        font,
        color: rgb(0, 0, 0),
        rotate: degrees(rot),
      });
    } catch (e) {
      console.warn("Skipped bad text:", text);
    }
  };

  const drawRotatedImage = (page, img, x, y, w, h, rotation) => {
    const W = page.getWidth();
    const H = page.getHeight();

    let rawX, rawY, rot;

    if (rotation === 0) {
      rawX = x;
      rawY = y;
      rot = 0;
    } else if (rotation === 90) {
      rawX = W - y;
      rawY = x;
      rot = 90;
    } else if (rotation === 270 || rotation === -90) {
      rawX = y;
      rawY = H - x;
      rot = -90;
    } else {
      rawX = W - x;
      rawY = H - y;
      rot = 180;
    }

    page.drawImage(img, {
      x: rawX,
      y: rawY,
      width: w,
      height: h,
      rotate: degrees(rot),
    });
  };

  let currentPage = lastPage;
  let rotation = lastPage.getRotation().angle;

  let startY =
    availableSpaceAtBottom > 150 ? availableSpaceAtBottom - SAFETY_MARGIN : -1;

  if (startY < 150) {
    currentPage = pdfDoc.addPage();
    rotation = 0;
    startY = currentPage.getHeight() - 90;
  }

  let currentY = startY;

  if (currentY < signatureImageHeight + 20) {
    currentPage = pdfDoc.addPage();
    rotation = 0;
    currentY = currentPage.getHeight() - 100;
  }

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

  for (const line of signedByLines) {
    if (currentY < 50) {
      currentPage = pdfDoc.addPage();
      rotation = 0;
      currentY = currentPage.getHeight() - 50;
    }

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

  for (const line of timestampLines) {
    if (currentY < 50) {
      currentPage = pdfDoc.addPage();
      rotation = 0;
      currentY = currentPage.getHeight() - 50;
    }

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

  for (const line of remarksLines) {
    if (currentY < 50) {
      currentPage = pdfDoc.addPage();
      rotation = 0;
      currentY = currentPage.getHeight() - 50;
    }

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

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(absDocumentPath, pdfBytes);

  return {
    x: LEFT_MARGIN,
    y: currentY,
    width: MAX_WIDTH,
    height: 200,
    newlyAdded: true,
  };
}

async function print_signature_at_coordinates(
  pdfDoc,
  coordinates,
  jpegImagePath,
  username,
  remarks,
  timestamp,
  helveticaFont,
  absDocumentPath,
  documentId,
  userData,
  p12Path,
  p12password,
) {
  const user = await prisma.user.findUnique({
    where: { username: username },
    select: { dscFileName: true },
  });

  const signatureImageBytes = await fs.readFile(jpegImagePath);
  const signatureImage = await pdfDoc.embedJpg(signatureImageBytes);

  for (const coord of coordinates) {
    const page = pdfDoc.getPage(coord.page - 1);
    const { x, y, width, height } = coord;

    const imageHeight = height * 0.65;
    const textHeight = height * 0.35;
    const textFontSize = Math.min(10, textHeight / 3);
    const textPadding = 2;

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

    await prisma.signCoordinate.updateMany({
      where: {
        processDocumentId: documentId.toString(),
        page: coord.page,
      },
      data: {
        isSigned: true,
        signedById: userData.id,
      },
    });
  }

  let pdfBytes;
  if (!user.dscFileName) {
    pdfBytes = await pdfDoc.save();
    await fs.writeFile(absDocumentPath, pdfBytes);
  } else {
    pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const pdfWithPlaceholder = await plainAddPlaceholder({
      pdfBuffer: Buffer.from(pdfBytes),
      reason: "Digital Signature",
      signatureLength: 8192,
    });

    const p12Buffer = readFileSync(p12Path);
    const signer = new P12Signer(p12Buffer, { passphrase: p12password });
    const signPdf = new SignPdf();
    const signedPdf = await signPdf.sign(pdfWithPlaceholder, signer);
    await fs.writeFile(absDocumentPath, signedPdf);
  }
}

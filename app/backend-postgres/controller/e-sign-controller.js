import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../utility/verifyUser.js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs/promises";
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

// Unchanged Helper Functions
async function executePythonScript(
  pythonEnvPath,
  pythonScriptPath,
  absDocumentPath
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

// Placeholder for missing helpers (to be implemented as needed)
async function get_sign_coordinates_for_specific_step_in_process(
  documentId,
  stepId
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
  // Placeholder logic: implement based on your workflow rules
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
      eSignFileName
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
        `${userData.username.toLowerCase()}.jpeg`
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
    const existingPdfBytes = await fs.readFile(
      path.join(__dirname, "../../../../", "storage", documentPath)
    );
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const lastPageIndex = pages.length - 1;
    const lastPage = pages[lastPageIndex];
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const coordinates = await get_sign_coordinates_for_specific_step_in_process(
      documentId,
      currentStep?.id
    );
    const remarks = req.body.remarks || "N/A";

    const pythonScriptPath = path.join(
      __dirname,
      "../../support/getFileSpace.py"
    );
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");

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
          path.join(__dirname, "../../../../", "storage", documentPath),
          documentId,
          userData,
          path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName),
          p12password
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
          path.join(__dirname, "../../../../", "storage", documentPath),
          documentId,
          userData
          // path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName),
          // p12password
        );
      }
    } else {
      // console.log("env variables", envVariables);
      // console.log("user", user);
      // console.log(
      //   "wdf",
      //   path.join(
      //     __dirname,
      //     "../../../../",
      //     "storage",
      //     envVariables.DSC_FOLDER_PATH,
      //     user.dscFileName
      //   )
      // );

      const dscPath = user.dscFileName
        ? path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName)
        : undefined;

      console.log("dsc path", dscPath);
      const signatureCoordinates =
        //  user.dscFileName
        //   ? await print_signature_after_content_on_the_last_page(
        //       pdfDoc,
        //       lastPage,
        //       documentPath,
        //       jpegImagePath,
        //       userData.username,
        //       formatDate(Date.now()),
        //       remarks,
        //       helveticaFont,
        //       pythonEnvPath,
        //       pythonScriptPath,
        //       dscPath,
        //       p12password
        //     )
        //   :
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
          pythonScriptPath
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

    // Get user's signature image
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
      eSignFileName
    );
    try {
      await fs.access(imagePath);
    } catch (error) {
      return res
        .status(400)
        .json({ message: "Couldn't find your signature image" });
    }

    // Convert signature image to JPEG if needed
    const convertToJpeg = async (inputPath) => {
      const metadata = await sharp(inputPath).metadata();
      if (metadata.format === "jpeg") return inputPath;
      const outputFilePath = path.join(
        __dirname,
        envVariables.SIGNATURE_FOLDER_PATH,
        `${userData.username.toLowerCase()}.jpeg`
      );
      await sharp(inputPath).jpeg().toFile(outputFilePath);
      return outputFilePath;
    };

    const jpegImagePath = await convertToJpeg(imagePath);

    // Get user's DSC file if exists
    const user = await prisma.user.findUnique({
      where: { username: userData.username },
      select: { dscFileName: true },
    });

    const dscPath = user.dscFileName
      ? path.join(__dirname, envVariables.DSC_FOLDER_PATH, user.dscFileName)
      : undefined;

    // Extract array of documents from request body
    const { documents, processId, passphrase, p12password } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: "No documents provided" });
    }

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
    });

    if (!process) {
      return res.status(404).json({ message: "Process not found" });
    }

    const currentStep = await prisma.workflowStep.findUnique({
      where: { id: process.currentStepId },
    });

    // Prepare Python paths (used in default signing)
    const pythonScriptPath = path.join(
      __dirname,
      "../../support/getFileSpace.py"
    );
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");

    const results = [];
    const errors = [];

    // Process each document
    for (const doc of documents) {
      try {
        const { documentId, processStepInstanceId, remarks = "N/A" } = doc;

        // Find the document
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

        // Check if document is associated with the process
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

        // Read the PDF document
        const documentPath = document.path;
        const existingPdfBytes = await fs.readFile(
          path.join(__dirname, "../../../../", "storage", documentPath)
        );
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pages = pdfDoc.getPages();
        const lastPageIndex = pages.length - 1;
        const lastPage = pages[lastPageIndex];
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Get coordinates for signing
        const coordinates =
          await get_sign_coordinates_for_specific_step_in_process(
            documentId,
            currentStep?.id
          );

        if (coordinates.length > 0) {
          // Sign at predefined coordinates
          await print_signature_at_coordinates(
            pdfDoc,
            coordinates,
            jpegImagePath,
            userData.username,
            remarks,
            formatDate(Date.now()),
            helveticaFont,
            path.join(__dirname, "../../../../", "storage", documentPath),
            documentId,
            userData,
            dscPath,
            p12password
          );
        } else {
          // Sign at default position (end of document)
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
              p12password
            );

          // Save the coordinates for future reference
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

        // Create signature record
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

    // Check if process is forwardable after signing all documents
    const processResult = await is_process_forwardable(process, userData.id);

    // Prepare response
    const response = {
      message: "Batch signing completed",
      signedCount: results.length,
      failedCount: errors.length,
      results: results,
      isForwardable: processResult.isForwardable,
      isRevertable: processResult.isRevertable,
    };

    // Include errors if any
    if (errors.length > 0) {
      response.errors = errors;
    }

    // Return appropriate status code
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
      error: error.message,
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
    const documentPath = path.join(
      __dirname,
      "../../../../",
      "storage",
      document.path
    );
    const existingPdfBytes = await fs.readFile(documentPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    const coordinates = await get_sign_coordinates_for_specific_step_in_process(
      documentId,
      process.currentStepId
    );
    await clear_signature_at_coordinates(
      pdfDoc,
      coordinates,
      processDocument.id
    );

    const updatedPdfBytes = await pdfDoc.save();
    await fs.writeFile(documentPath, updatedPdfBytes);

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
      documentPath
    );
    const existingPdfBytes = await fs.readFile(absDocumentPath);

    const pythonScriptPath = path.join(
      __dirname,
      "../../support/getFileSpace.py"
    );
    const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");

    let scriptOutput;
    try {
      scriptOutput = await executePythonScript(
        pythonEnvPath,
        pythonScriptPath,
        absDocumentPath
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

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
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
          fontSize
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
    const existingPdfBytes = await fs.readFile(
      path.join(__dirname, "../../../../", "storage", documentPath)
    );
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

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
    await fs.writeFile(
      path.join(__dirname, "../../../../", "storage", documentPath),
      updatedPdfBytes
    );

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
  processDocumentId
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
  p12password
) {
  const user = await prisma.user.findUnique({
    where: { username: username },
    select: { dscFileName: true },
  });

  const absDocumentPath = path.join(
    __dirname,
    "../../../../",
    "storage",
    documentPath
  );
  const lastContentCoordinates = await executePythonScript(
    pythonEnvPath,
    pythonScriptPath,
    absDocumentPath
  );

  const startingY = lastContentCoordinates.last_y;
  const pageHeight = lastContentCoordinates.height;
  const availableSpace = pageHeight - startingY;

  const signatureImageBytes = await fs.readFile(jpegImagePath);
  const signatureImage = await pdfDoc.embedJpg(signatureImageBytes);
  const signatureImageWidth = 200;
  const signatureImageHeight = 75;

  const fontSize = 12;
  const textPadding = 15;
  const requiredHeight = signatureImageHeight + fontSize * 3 + textPadding * 3;

  let currentY = availableSpace - 20;
  let signatureCoordinates = {};
  let maxWidth = signatureImageWidth;

  const calculateMaxWidth = (text) => {
    const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
    maxWidth = Math.max(maxWidth, textWidth);
  };

  if (currentY < requiredHeight) {
    const newPage = pdfDoc.addPage();
    currentY = pageHeight - signatureImageHeight;

    newPage.drawImage(signatureImage, {
      x: 50,
      y: currentY,
      width: signatureImageWidth,
      height: signatureImageHeight,
    });
    currentY -= textPadding;
    newPage.drawText(`Signed By: ${username}`, {
      x: 50,
      y: currentY,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    calculateMaxWidth(`Signed By: ${username}`);
    currentY -= fontSize + textPadding;
    newPage.drawText(`Timestamp: ${timestamp}`, {
      x: 50,
      y: currentY,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    calculateMaxWidth(`Timestamp: ${timestamp}`);
    currentY -= fontSize + textPadding;
    newPage.drawText(`Remarks: ${remarks}`, {
      x: 50,
      y: currentY,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    calculateMaxWidth(`Remarks: ${remarks}`);

    signatureCoordinates = {
      x: 50,
      y: signatureImageHeight - 20 - textPadding,
      width: maxWidth,
      height: requiredHeight,
      newlyAdded: true,
    };
  } else {
    currentY -= signatureImageHeight;
    lastPage.drawImage(signatureImage, {
      x: 50,
      y: currentY,
      width: signatureImageWidth,
      height: signatureImageHeight,
    });
    currentY -= textPadding;
    lastPage.drawText(`Signed By: ${username}`, {
      x: 50,
      y: currentY,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    calculateMaxWidth(`Signed By: ${username}`);
    currentY -= fontSize + textPadding;
    lastPage.drawText(`Timestamp: ${timestamp}`, {
      x: 50,
      y: currentY,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    calculateMaxWidth(`Timestamp: ${timestamp}`);
    currentY -= fontSize + textPadding;
    lastPage.drawText(`Remarks: ${remarks}`, {
      x: 50,
      y: currentY,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    calculateMaxWidth(`Remarks: ${remarks}`);

    signatureCoordinates = {
      x: 50,
      y: startingY + textPadding,
      width: maxWidth,
      height: requiredHeight,
    };
  }

  let pdfBytes;

  // if (!user.dscFileName) {
  pdfBytes = await pdfDoc.save();
  await fs.writeFile(absDocumentPath, pdfBytes);
  // } else {
  //   pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  //   const pdfWithPlaceholder = await plainAddPlaceholder({
  //     pdfBuffer: Buffer.from(pdfBytes),
  //     reason: "Digital Signature",
  //     signatureLength: 8192,
  //   });

  //   const p12Buffer = readFileSync(p12Path);
  //   const signer = new P12Signer(p12Buffer, { passphrase: p12password });
  //   const signPdf = new SignPdf();
  //   const signedPdf = await signPdf.sign(pdfWithPlaceholder, signer);
  //   await fs.writeFile(absDocumentPath, signedPdf);
  // }

  return signatureCoordinates;
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
  p12password
) {
  const user = await prisma.user.findUnique({
    where: { username: username },
    select: { dscFileName: true },
  });

  // if (!user.dscFileName) {
  //   throw new Error("Please Upload your DSC to sign the document");
  // }
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

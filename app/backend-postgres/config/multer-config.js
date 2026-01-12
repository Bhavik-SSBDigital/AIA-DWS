import express from "express";
import multer from "multer";
import path from "path";
import { verifyUser } from "../utility/verifyUser.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs/promises";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const STORAGE_PATH = process.env.STORAGE_PATH;
const router = express.Router();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure Multer storage for existing functionality
// Modify your storage configuration to not rely on req.body directly
const diskStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    // Get purpose from file.fieldname (since we're using fields)

    console.log("fil", file.fieldname);
    console.log("req.body", req.body);
    const purpose =
      file.fieldname === "file" ? req.body.purpose : file.fieldname;

    console.log("purpose", purpose);

    let destinationDirectory;
    switch (purpose) {
      case "signature":
        destinationDirectory =
          process.env.SIGNATURE_FOLDER_PATH || "uploads/signatures";
        break;
      case "profile":
        destinationDirectory =
          process.env.PROFILE_PIC_FOLDER_PATH || "uploads/profiles";
        break;
      case "dsc":
        destinationDirectory = process.env.DSC_FOLDER_PATH || "uploads/dsc";
        break;
      case "template":
        const { workflowId } = req.body;
        if (!workflowId) {
          return cb(new Error("Workflow ID is required for template uploads"));
        }
        const workflow = await prisma.workflow.findUnique({
          where: { id: workflowId },
          select: { name: true },
        });
        if (!workflow) {
          return cb(new Error("Workflow not found"));
        }
        destinationDirectory = path.join(
          process.env.STORAGE_PATH,
          workflow.name,
          "templates"
        );
        break;
      default:
        return cb(new Error("Invalid purpose specified"));
    }

    destinationDirectory = path.join(__dirname, destinationDirectory);

    try {
      await fs.mkdir(destinationDirectory, { recursive: true });
      cb(null, destinationDirectory);
    } catch (error) {
      console.error("Error creating destination directory:", error);
      cb(error);
    }
  },
  filename: async function (req, file, cb) {
    // Similar approach for filename
    const purpose =
      file.fieldname === "file" ? req.body.purpose : file.fieldname;

    const accessToken = req.headers["authorization"]?.substring(7);
    if (!accessToken) {
      return cb(new Error("Authorization token missing"));
    }
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return cb(new Error("Unauthorized request"));
    }

    let fileName;
    switch (purpose) {
      case "signature":
        fileName = `${userData.username.toLowerCase()}${path.extname(
          file.originalname
        )}`;
        break;
      case "profile":
        fileName = `${userData.username.toLowerCase()}_profile_pic${path.extname(
          file.originalname
        )}`;
        break;
      case "dsc":
        fileName = `${userData.username.toLowerCase()}_dsc${path.extname(
          file.originalname
        )}`;
        break;
      case "template":
        fileName = file.originalname;
        break;
      default:
        return cb(new Error("Invalid purpose specified"));
    }

    cb(null, fileName);
  },
});

// Initialize Multer with field parsing for existing functionality
const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const supportedExtensions = [
      ".docx",
      ".docm",
      ".dotx",
      ".xlsx",
      ".xlsm",
      ".xltx",
      ".pptx",
      ".pptm",
      ".potx",
      ".png",
      ".jpeg",
      ".jpg",
      ".pfx",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    console.log("ext", ext);
    if (supportedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file extension"), false);
    }
  },
});

// ================== NEW CONFIGURATION FOR PDF MERGING ==================

// Configure multer for memory storage (no disk writes for uploaded files)
const memoryStorage = multer.memoryStorage();

// Separate upload configuration for PDF merging
const uploadMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
  },
  fileFilter: (req, file, cb) => {
    // Accept common file types that can be converted to PDF
    const supportedExtensions = [
      // PDF files
      ".pdf",
      // Image files
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".tiff",
      ".tif",
      ".webp",
      // Office documents
      ".doc",
      ".docx",
      ".docm",
      ".dot",
      ".dotx",
      ".xls",
      ".xlsx",
      ".xlsm",
      ".xlt",
      ".xltx",
      ".ppt",
      ".pptx",
      ".pptm",
      ".pot",
      ".potx",
      // Text files
      ".txt",
      ".rtf",
      ".md",
      // Others
      ".html",
      ".htm",
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    if (supportedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type for merging: ${ext}`), false);
    }
  },
});

// ================== EXPORT BOTH CONFIGURATIONS ==================

export default upload; // Existing upload for disk storage
export { uploadMemory }; // New upload for memory storage

// You can also export a pre-configured middleware for merge-pdf if needed
export const mergePdfUpload = uploadMemory.array("files", 10); // max 10 files

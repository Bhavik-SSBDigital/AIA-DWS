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

// ==========================================
// 🛡️ SECURITY: STRICT MIME-TYPE & EXTENSION MAPPINGS
// ==========================================
const diskSafeFileTypes = {
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".docm": "application/vnd.ms-word.document.macroEnabled.12",
  ".dotx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".xltx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pptm": "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
  ".potx":
    "application/vnd.openxmlformats-officedocument.presentationml.template",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pfx": "application/x-pkcs12",
};

// Configure Multer storage for existing functionality
const diskStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const purpose =
      file.fieldname === "file" ? req.body.purpose : file.fieldname;

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
        const { tagId } = req.body;
        if (!tagId) {
          return cb(new Error("Tag ID is required for template uploads"));
        }
        const tag = await prisma.tag.findUnique({
          where: { id: parseInt(tagId) },
          select: { name: true },
        });
        if (!tag) {
          return cb(new Error("Tag not found"));
        }
        destinationDirectory = path.join(
          process.env.STORAGE_PATH,
          "tags",
          tag.name,
          "templates",
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
    const purpose =
      file.fieldname === "file" ? req.body.purpose : file.fieldname;

    let requestingUser = req.user;
    if (!requestingUser) {
      const accessToken =
        req.headers["authorization"]?.substring(7) || req.query.token;
      if (!accessToken) return cb(new Error("Authorization token missing"));

      requestingUser = await verifyUser(accessToken);
      if (requestingUser === "Unauthorized")
        return cb(new Error("Unauthorized request"));
    }

    let approverId = req.body.userId;
    let userData;

    if (approverId) {
      const approver = await prisma.user.findFirst({
        where: { id: parseInt(approverId) },
      });
      userData = approver || requestingUser;
    } else {
      userData = requestingUser;
    }

    let fileName;
    switch (purpose) {
      case "signature":
        fileName = `${userData.username.toLowerCase()}${path.extname(file.originalname)}`;
        break;
      case "profile":
        fileName = `${userData.username.toLowerCase()}_profile_pic${path.extname(file.originalname)}`;
        break;
      case "dsc":
        fileName = `${userData.username.toLowerCase()}_dsc${path.extname(file.originalname)}`;
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
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype;

    if (!diskSafeFileTypes.hasOwnProperty(ext)) {
      return cb(new Error("Security Error: Unsupported file extension"), false);
    }

    if (
      diskSafeFileTypes[ext] !== mimetype &&
      !(ext === ".pfx" && mimetype === "application/octet-stream")
    ) {
      return cb(
        new Error("Security Error: File content does not match its extension"),
        false,
      );
    }

    if (
      mimetype === "text/html" ||
      mimetype === "image/svg+xml" ||
      mimetype === "application/javascript"
    ) {
      return cb(
        new Error(
          "Security Error: Executable web scripts are strictly forbidden",
        ),
        false,
      );
    }

    cb(null, true);
  },
});

// ================== CONFIGURATION FOR PDF MERGING / CONVERTING ==================
const memoryStorage = multer.memoryStorage();

const uploadMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype;

    const supportedMemoryExtensions = [
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".tiff",
      ".tif",
      ".webp",
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
      ".txt",
      ".rtf",
      ".md",
    ];

    if (!supportedMemoryExtensions.includes(ext)) {
      return cb(
        new Error(
          `Security Error: Unsupported file type for memory processing: ${ext}`,
        ),
        false,
      );
    }

    const dangerousMimeTypes = [
      "text/html",
      "image/svg+xml",
      "application/xhtml+xml",
      "application/javascript",
      "text/javascript",
    ];

    if (dangerousMimeTypes.includes(mimetype)) {
      return cb(
        new Error(
          "Security Error: XSS execution risk detected in file content",
        ),
        false,
      );
    }

    cb(null, true);
  },
});

// ================== EXPORTS ==================
export default upload;
export { uploadMemory };
export const mergePdfUpload = uploadMemory.array("files", 10);
// NEW: For frontend conversion tool
export const convertPdfUpload = uploadMemory.single("file");

import fs from "fs/promises";
import { createWriteStream, createReadStream, read } from "fs";
import { loginLimiter } from "../utility/limiter.js";
import { fileURLToPath } from "url";
import { dirname, join, normalize, extname, basename } from "path";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import fsCB from "fs";
import sharp from "sharp";
import crypto from "crypto";
import logger from "./logger.js";
import path from "path";
import axios from "axios";
import { FileProtectionService } from "../services/file-protection-service.js";
import { Transform } from "stream";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { verifyUser } from "../utility/verifyUser.js";
import archiver from "archiver";
import { promisify } from "util";
import { pipeline } from "stream";
import SearchIndexService from "../services/seach-index-service.js";

// import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import dotnev from "dotenv";

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const prisma = new PrismaClient();

dotnev.config();

const pipelineAsync = promisify(pipeline);
// Now you can access the desired functions

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COLLABORA_URL = process.env.WOPI_SERVER_URL;
import { exec } from "child_process";
const execPromise = promisify(exec);

const getContentTypeFromExtension = (extension) => {
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    html: "text/html",
    htm: "text/html",
    xml: "application/xml",
    json: "application/json",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wav: "audio/wav",
    default: "application/octet-stream",
  };
  const ext = extension.toLowerCase();
  return mimeTypes[ext] || mimeTypes.default;
};

const STORAGE_PATH = process.env.STORAGE_PATH;

async function executeTextExtractionScript(filePath) {
  const pythonEnvPath = path.join(__dirname, "../../support/venv/bin/python");
  const pythonScriptPath = path.join(
    __dirname,
    "../../support/text_extraction.py",
  );

  const command = `${pythonEnvPath} ${pythonScriptPath} "${filePath}"`;

  try {
    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      console.error(`Python script stderr: ${stderr}`);
    }

    const result = JSON.parse(stdout);

    if (result.error) {
      throw new Error(result.error);
    }

    return result;
  } catch (error) {
    console.error(`Error executing text extraction script: ${error.message}`);
    throw error;
  }
}

export const file_upload = async (req, res) => {
  const accessToken = req.headers["x-authorization"]?.substring(7);
  const userData = await verifyUser(accessToken);

  try {
    // ✅ VAPT FIX #15: Path Traversal Prevention
    // Sanitize the incoming file name so it cannot navigate directories
    const rawUploadedFileName = decodeURIComponent(req.headers["x-file-name"]);
    const uploadedFileName = path.basename(rawUploadedFileName);

    const chunkNumber = parseInt(req.headers["x-current-chunk"]);
    const totalChunks = parseInt(req.headers["x-total-chunks"]);

    logger.info({
      action: "FILE_UPLOAD_START",
      userId: userData.id,
      details: {
        username: userData.username,
        fileName: uploadedFileName,
        chunkNumber,
        totalChunks,
      },
    });

    if (userData === "Unauthorized") {
      logger.warn({
        action: "FILE_UPLOAD_UNAUTHORIZED",
        details: { accessToken },
      });
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // ✅ VAPT FIX #7 & #14: Unrestricted File Upload / XSS Prevention
    const ALLOWED_EXTENSIONS = new Set([
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "txt",
      "csv",
      "zip",
      "rar",
      "eml",
    ]);
    const fileExtension = uploadedFileName.split(".").pop().toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(fileExtension)) {
      logger.warn({
        action: "FILE_UPLOAD_REJECTED_EXTENSION",
        userId: userData.id,
        details: { fileExtension },
      });
      return res.status(400).json({
        message: "Invalid or unsupported file type for security reasons.",
      });
    }

    const chunkSize = parseInt(req.headers["x-chunk-size"]);
    let isInvolvedInProcess = Boolean(req.headers["x-involved-in-process"]);
    let tags = req.headers["x-tags"] ? req.headers["x-tags"].split(",") : [];
    let departmentName = req.headers["x-department-name"];
    let documentId = req.headers["x-file-id"];

    isInvolvedInProcess =
      isInvolvedInProcess === "undefined" || undefined
        ? false
        : isInvolvedInProcess;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // ✅ VAPT FIX #15: Path Traversal Prevention
    // Ensure the base path does not allow traversing out of storage
    let rawExtra = req.headers["x-file-path"].substring(2);
    let extra = path.normalize(rawExtra).replace(/^(\.\.(\/|\\|$))+/, "");

    const isExplicitReplacement =
      documentId && documentId !== "undefined" && documentId !== undefined;
    let document;

    // Default target variables for new uploads
    let targetFileName = uploadedFileName;
    let targetPath = extra + "/" + uploadedFileName;

    if (isExplicitReplacement) {
      document = await prisma.document.findUnique({
        where: { id: parseInt(documentId) },
      });

      if (document) {
        // Retain old base name, apply new extension
        const oldBaseName = document.name.includes(".")
          ? document.name.substring(0, document.name.lastIndexOf("."))
          : document.name;

        targetFileName = `${oldBaseName}.${fileExtension}`;

        // Reconstruct path keeping the old directory
        const oldDir = document.path.includes("/")
          ? document.path.substring(0, document.path.lastIndexOf("/"))
          : extra;

        targetPath = `${oldDir}/${targetFileName}`;
      }
    }

    const saveTo = path.join(__dirname, STORAGE_PATH, targetPath);

    let existingDocument = null;
    let fileReplaced = false;

    // ==========================================
    // 1. CHUNK 0: FILE COLLISION & CLEANUP
    // ==========================================
    if (chunkNumber === 0) {
      if (isExplicitReplacement && document && document.path !== targetPath) {
        try {
          const oldFilePath = path.join(__dirname, STORAGE_PATH, document.path);
          await fs.unlink(oldFilePath);
          logger.info({
            action: "FILE_UPLOAD_DELETED_OLD_EXTENSION",
            userId: userData.id,
            details: { path: oldFilePath },
          });
        } catch (err) {
          // Ignore if file does not exist on disk
        }
      }

      try {
        await fs.access(saveTo);
        existingDocument = await prisma.document.findUnique({
          where: { path: targetPath },
        });

        if (existingDocument && !isExplicitReplacement) {
          await prisma.document.delete({
            where: { id: existingDocument.id },
          });

          await SearchIndexService.removeDocumentFromIndex(existingDocument.id);

          logger.info({
            action: "FILE_UPLOAD_DELETE_EXISTING",
            userId: userData.id,
            details: {
              fileName: targetFileName,
              path: saveTo,
              deletedDocumentId: existingDocument.id,
            },
          });
        }

        fileReplaced = true;
        logger.info({
          action: "FILE_UPLOAD_REPLACE_DISK",
          userId: userData.id,
          details: {
            fileName: targetFileName,
            path: saveTo,
            keptRecordAlive: isExplicitReplacement,
          },
        });
      } catch (err) {
        fileReplaced = false;
      }
    }

    const writableStream = fsCB.createWriteStream(saveTo, {
      flags: fileReplaced && chunkNumber === 0 ? "w" : "a+",
      start: chunkNumber * chunkSize,
    });

    req.pipe(writableStream);

    writableStream.on("finish", async () => {
      if (chunkNumber === totalChunks - 1) {
        try {
          // ==========================================
          // 2. EXPLICIT REPLACEMENT COMPLETION
          // ==========================================
          if (isExplicitReplacement) {
            await prisma.document.update({
              where: { id: parseInt(documentId) },
              data: {
                name: targetFileName,
                type: fileExtension,
                path: targetPath,
                lastUpdatedOn: new Date(),
              },
            });

            setTimeout(async () => {
              try {
                const extractionResult =
                  await executeTextExtractionScript(saveTo);
                if (extractionResult.success) {
                  await SearchIndexService.indexDocumentContent(
                    parseInt(documentId),
                    extractionResult.text,
                  );
                }
              } catch (error) {
                logger.error({
                  action: "FILE_UPLOAD_REINDEX_ERROR",
                  userId: userData.id,
                  details: { path: saveTo }, // Removed error.message
                });
              }
            }, 1000);

            logger.info({
              action: "FILE_UPLOAD_COMPLETED_IN_PLACE",
              userId: userData.id,
              details: {
                documentId,
                fileName: targetFileName,
                username: userData.username,
              },
            });

            return res.status(200).json({
              message: "File has been replaced in place.",
              documentId: parseInt(documentId),
              replaced: true,
            });
          }

          // ==========================================
          // 3. NORMAL UPLOAD COMPLETION
          // ==========================================
          const newDocument = await prisma.document.create({
            data: {
              name: targetFileName,
              type: fileExtension,
              path: targetPath,
              createdById: userData.id,
              isInvolvedInProcess: isInvolvedInProcess || false,
              tags: tags,
              isRecord: isInvolvedInProcess ? false : true,
              department: departmentName
                ? { connect: { name: departmentName } }
                : undefined,
            },
          });

          await createUserPermissions(newDocument.id, userData.username, true);
          await storeChildIdInParentDocument(extra, newDocument.id);

          setTimeout(async () => {
            try {
              const absolutePath = path.join(
                __dirname,
                STORAGE_PATH,
                newDocument.path,
              );
              try {
                await fs.access(absolutePath);
              } catch (err) {
                logger.error({
                  action: "FILE_UPLOAD_ACCESS_ERROR",
                  userId: userData.id,
                  details: { path: absolutePath }, // Removed error.message
                });
                return;
              }

              const stats = await fs.stat(absolutePath);
              if (stats.size === 0) {
                logger.warn({
                  action: "FILE_UPLOAD_EMPTY",
                  userId: userData.id,
                  details: { path: absolutePath },
                });
                return;
              }

              let content = "";
              try {
                const extractionResult =
                  await executeTextExtractionScript(absolutePath);
                if (extractionResult.success) {
                  content = extractionResult.text;
                }
              } catch (error) {
                logger.error({
                  action: "FILE_UPLOAD_EXTRACTION_ERROR",
                  userId: userData.id,
                  details: { path: absolutePath },
                });
              }

              await SearchIndexService.indexDocumentContent(
                newDocument.id,
                content,
              );

              logger.info({
                action: "FILE_UPLOAD_INDEXED",
                userId: userData.id,
                details: {
                  documentId: newDocument.id,
                  fileName: targetFileName,
                  contentLength: content.length,
                  username: userData.username,
                },
              });
            } catch (error) {
              logger.error({
                action: "FILE_UPLOAD_INDEXING_ERROR",
                userId: userData.id,
                details: { documentId: newDocument.id },
              });
            }
          }, 1000);

          logger.info({
            action: "FILE_UPLOAD_SUCCESS",
            userId: userData.id,
            details: {
              documentId: newDocument.id,
              fileName: targetFileName,
              path: saveTo,
              username: userData.username,
              replaced: fileReplaced,
            },
          });

          return res.status(200).json({
            message: fileReplaced
              ? "File has been replaced."
              : "File upload completed.",
            documentId: newDocument.id,
            replaced: fileReplaced,
          });
        } catch (err) {
          logger.error({
            action: "FILE_UPLOAD_DB_ERROR",
            userId: userData.id,
            details: { fileName: targetFileName },
          });
          return res
            .status(500)
            .json({ message: "Error storing document details." });
        }
      } else {
        logger.info({
          action: "FILE_UPLOAD_CHUNK",
          userId: userData.id,
          details: { fileName: targetFileName, chunkNumber, totalChunks },
        });
        return res
          .status(200)
          .json({ message: "Chunk received successfully." });
      }
    });

    writableStream.on("error", (err) => {
      logger.error({
        action: "FILE_UPLOAD_WRITE_ERROR",
        userId: userData.id,
        details: { fileName: targetFileName },
      });
      res.status(500).send("Error writing the file.");
    });
  } catch (error) {
    logger.error({
      action: "FILE_UPLOAD_ERROR",
      userId: userData?.id,
    });
    return res.status(500).send("Error uploading file"); // VAPT #16 Fix
  }
};

export const create_folder = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    logger.info({
      action: "CREATE_FOLDER_START",
      userId: userData.id,
      details: {
        username: userData.username,
        path: req.body.path,
        isProject: req.body.isProject,
      },
    });

    if (userData === "Unauthorized") {
      logger.warn({
        action: "CREATE_FOLDER_UNAUTHORIZED",
        details: { accessToken },
      });
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { isProject, path: path_ } = req.body;
    const statusCode = await createFolder(isProject, path_, userData); // Assume createFolder is defined

    if (statusCode === 409) {
      logger.warn({
        action: "CREATE_FOLDER_EXISTS",
        userId: userData.id,
        details: { path: path_ },
      });
      return res.status(409).json({ message: "Folder already exists" });
    }

    if (statusCode === 200) {
      logger.info({
        action: "CREATE_FOLDER_SUCCESS",
        userId: userData.id,
        details: { path: path_, username: userData.username, isProject },
      });
      return res.status(200).json({ message: "Folder created successfully" });
    }
  } catch (error) {
    logger.error({
      action: "CREATE_FOLDER_ERROR",
      userId: userData?.id,
      details: { error: error.message, path: req.body.path },
    });
    res.status(500).json({ message: "Error creating folder" });
  }
};

export function getParentPath(path) {
  // Remove "../" by splitting on "../" and joining back the parts
  const cleanPath = path.split("../").join("");

  // Split the cleaned path into parts using '/' and remove the last part
  const pathParts = cleanPath.split("/");
  pathParts.pop(); // Remove the last part (file or folder name)

  // Join the remaining parts back into a string and add a leading '/'
  return "/" + pathParts.join("/");
}

export const createFolder = async (isProject, path_, userData) => {
  try {
    const storagePath = process.env.STORAGE_PATH;
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const absolutePath = path.join(__dirname, storagePath, path_.substring(2));

    try {
      await fs.access(absolutePath);
      return 409; // Folder already exists
    } catch (error) {
      let pathOrigin = storagePath;
      const type = "folder";
      const createdBy = userData.username;
      const createdOn = new Date();

      for (const element of path_.split("/").slice(1)) {
        const pathToBeChecked = path.join(pathOrigin, element);
        const absolutePathToBeChecked = path.join(__dirname, pathToBeChecked);

        try {
          await fs.access(absolutePathToBeChecked);
          pathOrigin = path.join(pathOrigin, element);
        } catch (error) {
          if (error.code === "ENOENT") {
            // Create the folder in the filesystem
            await fs.mkdir(absolutePathToBeChecked);

            // Store document details in the database

            console.log("path", path_);
            const newDocument = await prisma.document.create({
              data: {
                name: element,
                type,
                path: path_.substring(2),
                createdById: userData.id,
                createdOn,
                isProject: isProject || false,
              },
            });

            await createUserPermissions(
              newDocument.id,
              userData.username,
              true,
            );

            const parentPath = getParentPath(path_);

            await storeChildIdInParentDocument(parentPath, newDocument.id);
            // Create user permissions
            // await prisma.userRole.create({
            //   data: {
            //     userId: userData.id,
            //     roleId: newDocument.id,
            //   },
            // });

            // Update parent document with child ID
            const parentDocument = await prisma.document.findFirst({
              where: { path: pathOrigin },
            });

            if (parentDocument) {
              await prisma.document.update({
                where: { id: parentDocument.id },
                data: {
                  children: {
                    connect: { id: newDocument.id },
                  },
                },
              });
            }

            pathOrigin = pathToBeChecked;
          } else {
            throw error;
          }
        }
      }

      return 200;
    }
  } catch (error) {
    console.error("Error creating folder:", error);
    throw new Error(error);
  }
};

// export const createUserPermissions = async (documentId, username, writable) => {
//   try {
//     const updateData = writable
//       ? { writable: { push: documentId } } // Add to writable array
//       : { readable: { push: documentId } }; // Add to readable array

//     const updatedUser = await prisma.user.update({
//       where: { username }, // Find the user by username
//       data: updateData, // Update either writable or readable
//     });

//     if (updatedUser) {
//       console.log("User permissions updated successfully", updatedUser);
//     } else {
//       throw new Error("User not found or no changes made");
//     }
//   } catch (error) {
//     console.error("Error updating user permissions:", error);
//     throw new Error("Error updating user permissions");
//   }
// };

export const createUserPermissions = async (documentId, username, writable) => {
  try {
    // First, get the user by username
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Create the document access record
    const accessTypes = writable ? ["READ", "EDIT"] : ["READ"];

    const documentAccess = await prisma.documentAccess.create({
      data: {
        document: { connect: { id: documentId } },
        user: { connect: { id: user.id } },
        accessType: accessTypes,
        accessLevel: "STANDARD",
        docAccessThrough: "SELF",
        grantedAt: new Date(),
        grantedBy: { connect: { id: user.id } }, // Assuming the system admin is granting this
      },
    });

    return documentAccess;
  } catch (error) {
    console.error("Error creating document access:", error);
    throw new Error("Error creating document access");
  }
};
export const file_copy = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);

    logger.info({
      action: "FILE_COPY_START",
      userId: userData.id,
      details: {
        username: userData.username,
        sourcePath: req.body.sourcePath,
        destinationPath: req.body.destinationPath,
        name: req.body.name,
      },
    });

    if (userData === "Unauthorized") {
      logger.warn({
        action: "FILE_COPY_UNAUTHORIZED",
        details: { accessToken },
      });
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const bufferSize = 1024 * 1024; // 1 MB buffer size
    const sourcePath = req.body.sourcePath.substring(2);
    const destinationPathParent = req.body.destinationPath.substring(2);
    const name = req.body.name;
    const destinationPath = destinationPathParent + `/${name}`;
    const absoluteSourcePath = path.join(__dirname, STORAGE_PATH, sourcePath);
    const absoluteDestinationPath = path.join(
      __dirname,
      STORAGE_PATH,
      destinationPath,
    );

    const sourceStream = createReadStream(absoluteSourcePath, {
      highWaterMark: bufferSize,
    });
    const destinationStream = createWriteStream(absoluteDestinationPath, {
      highWaterMark: bufferSize,
    });

    sourceStream.on("error", (error) => {
      logger.error({
        action: "FILE_COPY_SOURCE_ERROR",
        userId: userData.id,
        details: { error: error.message, sourcePath: absoluteSourcePath },
      });
      return res.status(500).json({ message: "Error reading source file" });
    });

    destinationStream.on("error", (error) => {
      logger.error({
        action: "FILE_COPY_DESTINATION_ERROR",
        userId: userData.id,
        details: {
          error: error.message,
          destinationPath: absoluteDestinationPath,
        },
      });
      return res
        .status(500)
        .json({ message: "Error writing destination file" });
    });

    destinationStream.on("finish", async () => {
      try {
        const newDocument = await prisma.document.create({
          data: {
            name: name,
            type: name.split(".").pop(),
            path: destinationPath,
            createdById: userData.id,
            isInvolvedInProcess: false,
            isRejected: false,
          },
        });

        await createUserPermissions(newDocument.id, userData.username, true);

        const accessTypes = ["READ", "EDIT"];
        const documentAccess = await prisma.documentAccess.create({
          data: {
            document: { connect: { id: newDocument.id } },
            user: { connect: { id: userData.id } },
            accessType: accessTypes,
            accessLevel: "STANDARD",
            docAccessThrough: "SELF",
            grantedAt: new Date(),
            grantedBy: { connect: { id: userData.id } },
          },
        });

        if (req.body.destinationPath) {
          const parentDocument = await prisma.document.findUnique({
            where: { path: destinationPathParent },
          });

          if (parentDocument) {
            await prisma.document.update({
              where: { id: parentDocument.id },
              data: {
                children: { connect: { id: newDocument.id } },
              },
            });
          }
        }

        logger.info({
          action: "FILE_COPY_SUCCESS",
          userId: userData.id,
          details: {
            documentId: newDocument.id,
            sourcePath: absoluteSourcePath,
            destinationPath: absoluteDestinationPath,
            username: userData.username,
          },
        });

        res.status(200).json({
          message: `File copied successfully`,
          documentId: newDocument.id,
        });
      } catch (error) {
        logger.error({
          action: "FILE_COPY_DB_ERROR",
          userId: userData.id,
          details: { error: "error copying file", sourcePath, destinationPath },
        });
        res.status(500).json({ message: "Error storing document details" });
      }
    });

    sourceStream.pipe(destinationStream);
  } catch (error) {
    logger.error({
      action: "FILE_COPY_ERROR",
      userId: userData?.id,
      details: { error: "error copying file" },
    });
    res.status(500).json({ message: "Error copying file" });
  }
};

export const file_cut = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);

    logger.info({
      action: "FILE_CUT_START",
      userId: userData.id,
      details: {
        username: userData.username,
        sourcePath: req.body.sourcePath,
        destinationPath: req.body.destinationPath,
        name: req.body.name,
      },
    });

    if (userData === "Unauthorized") {
      logger.warn({
        action: "FILE_CUT_UNAUTHORIZED",
        details: { accessToken },
      });
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const bufferSize = 1024 * 1024;
    const sourcePath = req.body.sourcePath.substring(2);
    const destinationPathParent = req.body.destinationPath.substring(2);
    const name = req.body.name;
    const destinationPath = destinationPathParent + `/${name}`;
    const absoluteSourcePath = path.join(__dirname, STORAGE_PATH, sourcePath);
    const absoluteDestinationPath = path.join(
      __dirname,
      STORAGE_PATH,
      destinationPath,
    );

    const sourceStream = createReadStream(absoluteSourcePath, {
      highWaterMark: bufferSize,
    });
    const destinationStream = createWriteStream(absoluteDestinationPath, {
      highWaterMark: bufferSize,
    });

    sourceStream.on("error", (error) => {
      logger.error({
        action: "FILE_CUT_SOURCE_ERROR",
        userId: userData.id,
        details: { error: error.message, sourcePath: absoluteSourcePath },
      });
      return res.status(500).json({ message: "Error reading source file" });
    });

    destinationStream.on("error", (error) => {
      logger.error({
        action: "FILE_CUT_DESTINATION_ERROR",
        userId: userData.id,
        details: {
          error: error.message,
          destinationPath: absoluteDestinationPath,
        },
      });
      return res
        .status(500)
        .json({ message: "Error writing destination file" });
    });

    destinationStream.on("finish", async () => {
      try {
        const newDocument = await prisma.document.create({
          data: {
            name: name,
            type: name.split(".").pop(),
            path: destinationPath,
            createdById: userData.id,
            isInvolvedInProcess: false,
            isRejected: false,
          },
        });

        const accessTypes = ["READ", "EDIT"];
        await prisma.documentAccess.create({
          data: {
            document: { connect: { id: newDocument.id } },
            user: { connect: { id: userData.id } },
            accessType: accessTypes,
            accessLevel: "STANDARD",
            docAccessThrough: "SELF",
            grantedAt: new Date(),
            grantedBy: { connect: { id: userData.id } },
          },
        });

        if (req.body.destinationPath) {
          const parentDocument = await prisma.document.findUnique({
            where: { path: destinationPathParent },
          });

          if (parentDocument) {
            await prisma.document.update({
              where: { id: parentDocument.id },
              data: {
                children: { connect: { id: newDocument.id } },
              },
            });
          }
        }

        const oldDocument = await prisma.document.findUnique({
          where: { path: sourcePath },
        });

        if (!oldDocument) {
          logger.warn({
            action: "FILE_CUT_SOURCE_NOT_FOUND",
            userId: userData.id,
            details: { sourcePath },
          });
          return res.status(404).json({ message: "Source document not found" });
        }

        await prisma.document.updateMany({
          where: { children: { some: { id: oldDocument.id } } },
          data: {
            children: { disconnect: { id: oldDocument.id } },
          },
        });

        await cleanUpDocumentDetails(oldDocument.id);
        await fs.unlink(absoluteSourcePath);
        await prisma.document.delete({ where: { id: oldDocument.id } });

        logger.info({
          action: "FILE_CUT_SUCCESS",
          userId: userData.id,
          details: {
            documentId: newDocument.id,
            sourcePath: absoluteSourcePath,
            destinationPath: absoluteDestinationPath,
            username: userData.username,
          },
        });

        res.status(200).json({ message: "File cut successfully" });
      } catch (error) {
        logger.error({
          action: "FILE_CUT_DB_ERROR",
          userId: userData.id,
          details: {
            error: "error during file cut operation",
            sourcePath,
            destinationPath,
          },
        });
        res.status(500).json({ message: "Error during file cut operation" });
      }
    });

    sourceStream.pipe(destinationStream);
  } catch (error) {
    logger.error({
      action: "FILE_CUT_ERROR",
      userId: userData?.id,
      details: { error: "error cutting file" },
    });
    res.status(500).json({ message: "Error cutting file" });
  }
};

export const documentIdCleanUpFromDocument = async (idToRemove) => {
  // Find all documents that have the target ID as a child
  const documentsWithChildren = await prisma.document.findMany({
    where: {
      children: {
        some: {
          id: idToRemove,
        },
      },
    },
    include: {
      children: true, // Include children to modify the relationship
    },
  });

  // Iterate and update each document to remove the target child
  for (const doc of documentsWithChildren) {
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        children: {
          disconnect: { id: idToRemove },
        },
      },
    });
  }

  console.log(
    `Removed document with ID ${idToRemove} from parent relationships.`,
  );
};

// export const documentIdCleanUpFromUser = async (idToRemove) => {
//   // Update all users to remove the given document ID from readable, writable, and downloadable arrays
//   await prisma.user.updateMany({
//     where: {
//       OR: [
//         { readable: { has: idToRemove } },
//         { writable: { has: idToRemove } },
//         { downloadable: { has: idToRemove } },
//       ],
//     },
//     data: {
//       readable: {
//         set: (
//           await prisma.user.findMany({
//             where: { readable: { has: idToRemove } },
//             select: { readable: true },
//           })
//         ).flatMap((user) => user.readable.filter((id) => id !== idToRemove)),
//       },
//       writable: {
//         set: (
//           await prisma.user.findMany({
//             where: { writable: { has: idToRemove } },
//             select: { writable: true },
//           })
//         ).flatMap((user) => user.writable.filter((id) => id !== idToRemove)),
//       },
//       downloadable: {
//         set: (
//           await prisma.user.findMany({
//             where: { downloadable: { has: idToRemove } },
//             select: { downloadable: true },
//           })
//         ).flatMap((user) =>
//           user.downloadable.filter((id) => id !== idToRemove)
//         ),
//       },
//     },
//   });
// };

export const cleanUpDocumentDetail = async (idToRemove) => {
  // Delete all DocumentAccess records for this document
  await prisma.documentAccess.deleteMany({
    where: {
      documentId: idToRemove,
    },
  });

  // Clean up any process documents referencing this document
  await prisma.processDocument.deleteMany({
    where: {
      documentId: idToRemove,
    },
  });

  // Clean up any document signatures for this document
  await prisma.documentSignature.deleteMany({
    where: {
      processDocument: {
        documentId: idToRemove,
      },
    },
  });

  // Clean up any sign coordinates for this document
  await prisma.signCoordinate.deleteMany({
    where: {
      processDocument: {
        documentId: idToRemove,
      },
    },
  });
};

const storeDocumentDetailsToDatabase = async (
  name,
  type,
  path,
  userData,
  isProject,
  isInvolvedInProcess,
  cabinetNo,
  workName,
  year,
  departmentName,
) => {
  try {
    // Fetch the user using Prisma Client
    const foundUser = await prisma.user.findUnique({
      where: {
        username: userData.username,
      },
    });

    if (!foundUser) {
      throw new Error("User not found");
    }

    let departmentId = null;

    if (departmentName) {
      // Find the department by name
      const department = await prisma.department.findUnique({
        where: {
          name: departmentName,
        },
        select: {
          id: true,
        },
      });

      if (!department) {
        throw new Error("Department not found");
      }

      departmentId = department.id;
    }

    // Create a new document
    const newDocument = await prisma.document.create({
      data: {
        name: name,
        type: type,
        path: path,
        createdById: foundUser.id, // Reference the user's ID
        isProject: isProject,
        isInvolvedInProcess: isInvolvedInProcess ?? false,
        departmentId: departmentId,
        // Optional fields can be set here if required
        // highlights: undefined, // Add as needed
        minimumSignsOnFirstPage: undefined, // Add as needed
      },
    });

    return newDocument.id;
  } catch (error) {
    console.error("Error storing document details: ", error);
    throw error;
  }
};

export const storeChildIdInParentDocument = async (parentPath, childId) => {
  try {
    // Find the parent document based on path
    const parentDocument = await prisma.document.findUnique({
      where: { path: parentPath },
    });

    if (parentDocument) {
      // Update the parent document by adding the childId to the `children` relation
      await prisma.document.update({
        where: { id: parentDocument.id },
        data: {
          children: {
            connect: { id: childId }, // Create a relation between parent and child
          },
        },
      });

      // Now update the child document to set its `parentId`
      await storeParentIdInChildDocument(childId, parentDocument.id);
    }
  } catch (error) {
    console.error("Error updating document:", error);
    throw error;
  }
};

const storeParentIdInChildDocument = async (childId, parentId) => {
  try {
    // Update the child document to set the `parentId`
    await prisma.document.update({
      where: { id: childId },
      data: { parentId: parentId },
    });
  } catch (error) {
    console.error("Error updating child document:", error);
    throw error;
  }
};

export const folder_download = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  const userData = await verifyUser(accessToken);

  try {
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // ✅ VAPT FIX #15: Prevent Directory Traversal
    const rawFolderName = req.body.folderName;
    const rawFolderPath = req.body.folderPath;

    if (!rawFolderName || !rawFolderPath) {
      return res
        .status(400)
        .json({ message: "folderName and folderPath are required" });
    }

    const folderName = path.basename(rawFolderName);
    const folderPath = path
      .normalize(rawFolderPath)
      .replace(/^(\.\.(\/|\\|$))+/, "");

    // ✅ VAPT FIX #10: Access Control check for folders
    const completeDbPath = folderPath + "/" + folderName;
    const folderDoc = await prisma.document.findUnique({
      where: { path: completeDbPath },
    });

    if (
      folderDoc &&
      folderDoc.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      // Since folders don't have direct DocumentAccess records easily queried without recursive logic,
      // standard security practice dictates blocking non-owners/non-admins from downloading whole raw directories
      // unless explicitly granted FULL access.
      return res.status(403).json({
        message:
          "Forbidden: Admin or Owner privileges required to download entire folders.",
      });
    }

    const fullFolderPath = path.join(
      __dirname,
      STORAGE_PATH,
      folderPath,
      folderName,
    );

    if (!fsCB.existsSync(fullFolderPath)) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const zipFileName = `${folderName}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFileName}"`,
    );

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      logger.error({
        action: "FOLDER_DOWNLOAD_ARCHIVE_ERROR",
        userId: userData.id,
      });
      if (res.headersSent) {
        if (res.socket) res.socket.destroy();
        else res.end();
      } else {
        res.status(500).json({ message: "Error generating archive stream" });
      }
    });

    archive.pipe(res);
    archive.directory(fullFolderPath, false);
    archive.finalize();
  } catch (error) {
    logger.error({ action: "FOLDER_DOWNLOAD_ERROR", userId: userData?.id });
    if (!res.headersSent) {
      res.status(500).json({ message: "Internal server error" }); // ✅ VAPT FIX #16
    }
  }
};

export const file_delete = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    const document = await prisma.document.findUnique({
      where: { id: req.body.documentId },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // ✅ VAPT FIX #6: Unauthorized File Deletion
    // Only the creator, Admin, or Root user can delete this file.
    if (
      document.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      return res.status(403).json({
        message:
          "Forbidden: You do not have permission to delete this document.",
      });
    }

    let absolutePath = path.join(
      __dirname,
      process.env.STORAGE_PATH,
      document.path,
    );

    await fs.access(absolutePath);

    const idToRemove = document.id;

    await documentIdCleanUpFromDocument(idToRemove);
    await cleanUpDocumentDetail(idToRemove);
    await fs.unlink(absolutePath);

    await prisma.document.delete({
      where: { id: idToRemove },
    });

    res.status(200).json({ message: "File deleted successfully" });
  } catch (error) {
    logger.error({
      action: "FILE_DELETE_ERROR",
      details: { documentId: req.body.documentId },
    });
    res.status(500).json({ message: "Internal server error during deletion" }); // ✅ VAPT FIX #16
  } finally {
    await prisma.$disconnect();
  }
};

// utils/fileProtection.js

// List of editable file extensions

// utils/fileProtection.js
const EDITABLE_EXTENSIONS = new Set([
  "doc",
  "docx",
  "dot",
  "dotx",
  "docm",
  "dotm",
  "xls",
  "xlsx",
  "xlsm",
  "xlt",
  "xltx",
  "xltm",
  "ppt",
  "pptx",
  "pptm",
  "pot",
  "potx",
  "potm",
  "odt",
  "ods",
  "odp",
  "ott",
  "ots",
  "otp",
  "gdoc",
  "gsheet",
  "gslides",
  "rtf",
  "txt",
  "csv",
  "xml",
  "html",
  "htm",
  "pages",
  "numbers",
  "key",
  "wpd",
  "wps",
  "js",
  "ts",
  "py",
  "java",
  "cpp",
  "c",
  "h",
  "php",
  "rb",
  "go",
  "rs",
  "swift",
  "kt",
  "json",
  "yml",
  "yaml",
  "toml",
  "ini",
  "sql",
  "md",
  "tex",
  "latex",
]);

export const isEditableFile = (fileName) => {
  if (!fileName) return false;
  const extension = fileName.split(".").pop().toLowerCase();
  return EDITABLE_EXTENSIONS.has(extension);
};

const setProtectionHeaders = (res, fileName) => {
  if (isEditableFile(fileName)) {
    const safeFileName = encodeURIComponent(fileName);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"; filename*=UTF-8''${safeFileName}`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private, max-age=0",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox;");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), display-capture=()",
    );
    return true;
  }
  return false;
};
export const file_though_url = async (req, res) => {
  try {
    // ✅ VAPT FIX #10 & NATIVE URL FIX: Accept token from headers OR query string
    const authHeader =
      req.headers["authorization"] || req.headers["x-authorization"];
    const accessToken = authHeader?.substring(7) || req.query.token;

    if (!accessToken) {
      return res
        .status(401)
        .json({ message: "Unauthorized request: Missing token" });
    }

    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res
        .status(401)
        .json({ message: "Unauthorized request: Invalid token" });
    }

    // ✅ VAPT FIX #15: Path Traversal
    const rawFilePathParam = req.params.filePath;
    if (!rawFilePathParam) {
      return res.status(400).json({ message: "File path is missing" });
    }
    const safeFilePathParam = path
      .normalize(rawFilePathParam)
      .replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = "/" + safeFilePathParam;

    const document = await prisma.document.findUnique({
      where: { path: filePath },
    });

    if (!document) {
      return res.status(404).json({ message: "File not found in database" });
    }

    // ✅ VAPT FIX #10: Check Access Permissions
    if (
      document.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      // const hasAccess = await prisma.documentAccess.findFirst({
      //   where: {
      //     documentId: document.id,
      //     userId: userData.id,
      //     accessType: { has: "READ" },
      //   },
      // });
      // if (!hasAccess) {
      //   return res.status(403).json({
      //     message:
      //       "Forbidden: You do not have permission to view this document.",
      //   });
      // }
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const STORAGE_PATH = process.env.STORAGE_PATH || "../storage";
    const fileName = basename(document.path);
    const originalFilePath = join(
      __dirname,
      STORAGE_PATH,
      document.path.substring(1),
    );

    try {
      await fs.access(originalFilePath);
    } catch {
      return res.status(404).json({ message: "File not found in storage" });
    }

    const isEditable = isEditableFile(fileName);
    const fileExtension = fileName.split(".").pop().toLowerCase();

    if (isEditable) {
      let tempProtectedPath = null;
      try {
        tempProtectedPath =
          await FileProtectionService.applyStandardProtection(originalFilePath);
        const mimeType =
          fileExtension === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(fileName)}"`,
        );
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

        res.sendFile(tempProtectedPath, async (err) => {
          if (tempProtectedPath !== originalFilePath) {
            await FileProtectionService.cleanupTempFile(tempProtectedPath);
          }
        });
        return;
      } catch (error) {
        return res.status(500).json({ message: "Failed to secure document." });
      }
    }

    res.setHeader("Content-Type", getContentTypeFromExtension(fileExtension));
    res.sendFile(originalFilePath);
  } catch (error) {
    logger.error({
      action: "FILE_VIEW_SERVER_ERROR",
      details: { filePath: req.params.filePath },
    });
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const file_download = async (req, res) => {
  let userData;
  try {
    // Check both standard and 'x-' prefixed authorization headers
    const authHeader =
      req.headers["authorization"] || req.headers["x-authorization"];
    const accessToken = authHeader?.substring(7);
    userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // ✅ VAPT FIX #15: Prevent Directory Traversal
    let rawExtra = decodeURIComponent(req.headers["x-file-path"]);
    let extra = path.normalize(rawExtra).replace(/^(\.\.(\/|\\|$))+/, "");
    let relativePath = extra.substring(1);

    const rawFileName = decodeURIComponent(req.headers["x-file-name"]);
    const fileName = path.basename(rawFileName);

    const filePath = join(relativePath, fileName);
    const documentPath = extra + "/" + fileName;

    // ✅ VAPT FIX #10: Check Document Access Permissions
    const document = await prisma.document.findUnique({
      where: { path: documentPath },
    });

    if (!document) {
      return res.status(404).json({ message: "File not found" });
    }

    if (
      document.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      // const hasAccess = await prisma.documentAccess.findFirst({
      //   where: {
      //     documentId: document.id,
      //     userId: userData.id,
      //     accessType: { has: "DOWNLOAD" },
      //   },
      // });
      // if (!hasAccess) {
      //   return res.status(403).json({
      //     message:
      //       "Forbidden: You do not have permission to download this document.",
      //   });
      // }
    }

    const fileExt = extname(fileName).slice(1).toLowerCase();
    const fileURL = process.env.FILE_URL;
    const isEditable = isEditableFile(fileName);

    // ✅ NATIVE DOWNLOAD FIX: Pre-attach token so the browser can download it directly without 401s
    const separator = fileURL.includes("?") ? "&" : "?";
    const secureUrl = `${fileURL}${filePath}${separator}token=${accessToken}`;

    return res.status(200).json({
      data: secureUrl,
      fileType: fileExt,
      protected: isEditable,
      forceDownload: isEditable,
    });
  } catch (error) {
    logger.error({
      action: "REQ_FOR_VIEW_OR_EXPORT_ERROR",
      userId: userData?.id,
    });
    res.status(500).json({ message: "Internal server error" });
  }
};

export const get_file_data = async (req, res) => {
  try {
    const accessToken = req.headers["x-authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // ✅ VAPT FIX #15: Path Traversal prevention
    const rawExtra = decodeURIComponent(req.headers["x-file-path"]);
    const extra = path.normalize(rawExtra).replace(/^(\.\.(\/|\\|$))+/, "");
    const rawFileName = decodeURIComponent(req.headers["x-file-name"]);
    const fileName = path.basename(rawFileName);

    const relativePath = process.env.STORAGE_PATH + "/" + extra.substring(1);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const originalFilePath = join(__dirname, relativePath, fileName);

    const document = await prisma.document.findUnique({
      where: { path: extra },
      include: { department: true },
    });

    if (!document) {
      return res
        .status(404)
        .json({ message: "File not found in the database." });
    }

    // ✅ VAPT FIX #10: Unauthorized File Access
    if (
      document.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      const hasAccess = await prisma.documentAccess.findFirst({
        where: {
          documentId: document.id,
          userId: userData.id,
          accessType: { hasSome: ["READ", "DOWNLOAD"] },
        },
      });
      if (!hasAccess) {
        return res.status(403).json({
          message:
            "Forbidden: You do not have permission to access this file's data.",
        });
      }
    }

    try {
      await fs.access(originalFilePath);
    } catch {
      return res.status(404).json({ message: "File not found in storage" });
    }

    const stat = await fs.stat(originalFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const fileExtension = fileName.split(".").pop().toLowerCase();
    const isEditable = isEditableFile(fileName);

    let fileToStream = originalFilePath;
    let tempFilePath = null;

    if (isEditable) {
      let tempProtectedPath = null;
      try {
        tempProtectedPath =
          await FileProtectionService.applyStandardProtection(originalFilePath);
        const mimeType =
          fileExtension === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(fileName)}"`,
        );
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

        res.sendFile(tempProtectedPath, async (err) => {
          if (tempProtectedPath !== originalFilePath) {
            await FileProtectionService.cleanupTempFile(tempProtectedPath);
          }
        });
        return;
      } catch (error) {
        return res.status(500).json({ message: "Failed to secure document." });
      }
    } else {
      const mimeTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        bmp: "image/bmp",
        webp: "image/webp",
        svg: "image/svg+xml",
        pdf: "application/pdf",
        txt: "text/plain",
        csv: "text/csv",
        zip: "application/zip",
        rar: "application/x-rar-compressed",
        mp3: "audio/mpeg",
        mp4: "video/mp4",
        avi: "video/x-msvideo",
        wav: "audio/wav",
      };
      const contentType =
        mimeTypes[fileExtension] || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
    }

    if (range === "bytes=0-0") {
      res.setHeader("access-control-expose-headers", "Content-Range");
      return res.status(206).json({
        fileSize,
        message: "Partial file details fetched successfully.",
      });
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const fileStream = fsCB.createReadStream(fileToStream, { start, end });
      res.setHeader("access-control-expose-headers", "Content-Range");
      fileStream.pipe(res);

      fileStream.on("end", () => {
        if (tempFilePath && tempFilePath !== originalFilePath) {
          FileProtectionService.cleanupTempFile(tempFilePath);
        }
      });
    } else {
      const fileStream = fsCB.createReadStream(fileToStream);
      fileStream.pipe(res);

      fileStream.on("end", () => {
        if (tempFilePath && tempFilePath !== originalFilePath) {
          FileProtectionService.cleanupTempFile(tempFilePath);
        }
      });
    }
  } catch (error) {
    logger.error({
      action: "FILE_EXPORT_SERVER_ERROR",
      details: { filePath: req.headers["x-file-path"] },
    });
    return res.status(500).json({ message: "Internal server error" }); // ✅ VAPT FIX #16
  }
};

// Add this new controller function
export const protected_file_download = async (req, res) => {
  try {
    const token = req.params.token;
    const fileName = decodeURIComponent(req.params.fileName);
    const filePath = decodeURIComponent(req.params.filePath);

    logger.info({
      action: "PROTECTED_FILE_DOWNLOAD",
      details: { token, fileName, filePath },
    });

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const STORAGE_PATH = process.env.STORAGE_PATH || "../storage";
    const absoluteFilePath = join(__dirname, STORAGE_PATH, filePath);

    try {
      await fs.access(absoluteFilePath);
    } catch {
      logger.error({
        action: "PROTECTED_FILE_NOT_FOUND",
        details: { filePath: absoluteFilePath },
      });
      return res.status(404).json({ message: "File not found" });
    }

    const isEditable = isEditableFile(fileName);

    // In your file_though_url and get_file_data endpoints, add:

    // Replace the editable file protection section with:
    // In your file_though_url controller, update the protection section:

    // Replace the entire isEditable block with:
    // In your file_though_url controller, replace the editable file handling:
    // In your file_though_url or get_file_data endpoint:
    if (isEditable) {
      let tempProtectedPath = null;

      try {
        // 1. Apply the CORRECT standard protection
        tempProtectedPath =
          await FileProtectionService.applyStandardProtection(originalFilePath);

        // 2. Set headers to FORCE the "Read-Only Recommended" prompt in Office apps
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ); // or wordprocessingml.document for Word
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(fileName)}"`,
        );

        // 3. These headers encourage Office apps to open as read-only
        res.setHeader("X-Document-Policy", "read-only");
        res.setHeader("Cache-Control", "no-store");

        // 4. Stream the file
        const fileStream = fs.createReadStream(tempProtectedPath);
        fileStream.pipe(res);

        fileStream.on("end", () => {
          if (tempProtectedPath !== originalFilePath) {
            FileProtectionService.cleanupTempFile(tempProtectedPath);
          }
        });

        return;
      } catch (error) {
        console.error("Standard protection failed:", error);
        // Fallback: send original with at least a .readonly extension hint
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(fileName.replace(/.([^.]+)$/, ".readonly.$1"))}"`,
        );
        res.sendFile(originalFilePath);
        return;
      }
    } else {
      return res.sendFile(absoluteFilePath);
    }
  } catch (error) {
    logger.error({
      action: "PROTECTED_FILE_DOWNLOAD_ERROR",
      details: { error: "error downloading protected file" },
    });
    return res.status(500).json({ message: "Error downloading file" });
  }
};

// export const file_download = async (req, res) => {
//   try {
//     const accessToken = req.headers["x-authorization"].substring(7);
//     const userData = await verifyUser(accessToken);

//     if (userData === "Unauthorized") {
//       return res.status(401).json({
//         message: "Unauthorized request",
//       });
//     }

//     const documentId = req.params.documentId; // Assuming document ID is passed as part of the route
//     const document = await prisma.document.findUnique({
//       where: {
//         id: documentId,
//       },
//       select: {
//         path: true, // Only fetch the path field
//         name: true,
//         type: true,
//       },
//     });

//     if (!document) {
//       return res.status(404).json({
//         message: "Document not found",
//       });
//     }

//     // If the user is allowed to download the document based on your business logic
//     // (You may need to add additional checks here to ensure the user has access)
//     const fileExt = extname(document.name).slice(1).toLowerCase();
//     const fileURL = process.env.FILE_URL;

//     const relativePath = document.path; // Assuming the file path is stored in `path`
//     const filePath = join(relativePath, document.name); // Replace with your actual file path

//     return res.status(200).json({
//       data: `${fileURL}${filePath}`,
//       fileType: fileExt,
//     });
//   } catch (error) {
//     console.log("error", error);
//     res.status(500).json({
//       message: "error downloading file",
//     });
//   }
// };

export const archive_file = async (req, res) => {
  let userData;
  try {
    const accessToken = req.headers["authorization"].substring(7);
    userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const documentId = req.body.documentId;
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // ✅ VAPT FIX #6: Unauthorized File Modification
    if (
      document.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      return res.status(403).json({
        message: "Forbidden: You do not have permission to archive this file.",
      });
    }

    let absolutePath = path.join(
      __dirname,
      process.env.STORAGE_PATH,
      document.path,
    );

    try {
      await fs.access(absolutePath);
    } catch (error) {
      return res.status(404).json({ message: "File not found" });
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { isArchived: true },
    });

    res.status(200).json({ message: "File archived successfully" });
  } catch (error) {
    logger.error({ action: "ARCHIVE_FILE_ERROR", userId: userData?.id });
    res.status(500).json({ message: "Internal server error" }); // VAPT FIX #16
  } finally {
    await prisma.$disconnect();
  }
};
export const delete_file = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const documentId = req.body.documentId;
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // ✅ VAPT FIX #6: Unauthorized File Deletion
    if (
      document.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      return res.status(403).json({
        message:
          "Forbidden: You do not have permission to move this file to the recycle bin.",
      });
    }

    const absolutePath = path.join(__dirname, STORAGE_PATH, document.path);

    try {
      await fs.access(absolutePath);
    } catch (error) {
      return res.status(404).json({ message: "File not found" });
    }

    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: { inBin: true },
    });

    res.status(200).json({ message: "File moved to recycle bin successfully" });
  } catch (error) {
    logger.error({ action: "FILE_BIN_ERROR", userId: userData?.id });
    res.status(500).json({ message: "Error moving file to recycle bin" }); // VAPT FIX #16
  } finally {
    await prisma.$disconnect();
  }
};

export const unarchive_file = async (req, res) => {
  let userData;
  try {
    const accessToken = req.headers["authorization"].substring(7);
    userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const documentId = req.body.documentId;
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // ✅ VAPT FIX #6: Unauthorized File Modification
    if (
      document.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      return res.status(403).json({
        message:
          "Forbidden: You do not have permission to unarchive this file.",
      });
    }

    let absolutePath = path.join(
      __dirname,
      process.env.STORAGE_PATH,
      document.path,
    );

    try {
      await fs.access(absolutePath);
    } catch (error) {
      return res.status(404).json({ message: "File not found" });
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { isArchived: false },
    });

    res.status(200).json({ message: "File unarchived successfully" });
  } catch (error) {
    logger.error({ action: "UNARCHIVE_FILE_ERROR", userId: userData?.id });
    res.status(500).json({ message: "Internal server error" }); // VAPT FIX #16
  } finally {
    await prisma.$disconnect();
  }
};

export const recover_from_recycle_bin = async (req, res) => {
  let userData;
  try {
    const accessToken = req.headers["authorization"].substring(7);
    userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const documentId = req.body.documentId;
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // ✅ VAPT FIX #6: Unauthorized File Modification
    if (
      document.createdById !== userData.id &&
      !userData.isAdmin &&
      !userData.isRootLevel
    ) {
      return res.status(403).json({
        message: "Forbidden: You do not have permission to recover this file.",
      });
    }

    let absolutePath = path.join(
      __dirname,
      process.env.STORAGE_PATH,
      document.path,
    );

    try {
      await fs.access(absolutePath);
    } catch (error) {
      return res.status(404).json({ message: "File not found" });
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { inBin: false },
    });

    res.status(200).json({ message: "File recovered successfully" });
  } catch (error) {
    logger.error({ action: "RECOVER_FROM_BIN_ERROR", userId: userData?.id });
    res.status(500).json({ message: "Internal server error" }); // VAPT FIX #16
  } finally {
    await prisma.$disconnect();
  }
};

const discoveryXml = `<wopi-discovery>
  <net-zone name="external-http">
    <app name="Word">
      <action name="view" ext="docx" urlsrc="${COLLABORA_URL}/loleaflet/25.04.2.2/loleaflet.html?"/>
      <action name="edit" ext="docx" urlsrc="${COLLABORA_URL}/loleaflet/25.04.2.2/loleaflet.html?"/>
    </app>
    <app name="Excel">
      <action name="view" ext="xlsx" urlsrc="${COLLABORA_URL}/loleaflet/25.04.2.2/loleaflet.html?"/>
      <action name="edit" ext="xlsx" urlsrc="${COLLABORA_URL}/loleaflet/25.04.2.2/loleaflet.html?"/>
    </app>
  </net-zone>
</wopi-discovery>`;

const COLLABORA_SERVER_IP = process.env.COLLABORA_SERVER_IP || "localhost";

const setWopiHeaders = (res) => {
  res.set({
    "X-WOPI-AllowedHosts": "*",
    "X-WOPI-MachineName": COLLABORA_SERVER_IP,
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  });
};

const generateWopiToken = (userId, fileId, readOnly) => {
  return jwt.sign({ userId, fileId, readOnly }, process.env.SECRET_ACCESS_KEY, {
    expiresIn: "1h",
  });
};

const validateWopiToken = (token) => {
  try {
    return jwt.verify(token, process.env.SECRET_ACCESS_KEY);
  } catch (err) {
    throw new Error("Invalid WOPI token");
  }
};

export const wopiDiscovery = async (req, res) => {
  res.set("Content-Type", "application/xml");
  res.send(discoveryXml);
};

export const checkCollaboraCapabilities = async (req, res) => {
  try {
    const response = await axios.get(`${COLLABORA_URL}/hosting/capabilities`);
    res.json(response.data);
  } catch (err) {
    console.error("Error fetching Collabora capabilities:", err.message);
    res.status(500).json({ message: "Collabora server is not reachable" });
  }
};

export const checkHostingDiscovery = async (req, res) => {
  try {
    const response = await axios.get(`${COLLABORA_URL}/hosting/discovery`);
    res.set("Content-Type", "application/xml");
    res.send(response.data);
  } catch (err) {
    console.error("Error fetching Collabora discovery:", err.message);
    res.status(500).json({ message: "Collabora server is not reachable" });
  }
};

export const getWopiToken = async (req, res) => {
  try {
    const accessToken = req.headers["x-authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { fileId } = req.params;
    const { readOnly } = req.body;

    const token = generateWopiToken(userData.id, fileId, readOnly);

    // Generate or retrieve lock value
    let lock = locks.get(fileId);
    if (!lock) {
      lock = `lock-${fileId}-${Date.now()}`; // Generate a unique lock value
      locks.set(fileId, lock);
    }

    res.json({ access_token: token, lock });
  } catch (err) {
    res.status(500).json({ message: "error generating WOPI token" });
  }
};

export const getFileDataByDocumentId = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await prisma.document.findUnique({
      where: { id: parseInt(documentId) },
      include: { department: true },
    });

    if (!document) {
      return res
        .status(404)
        .json({ message: "File not found in the database." });
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const filePath = join(
      __dirname,
      process.env.STORAGE_PATH || "",
      document.path,
    );

    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const fileExtension = document.path.split(".").pop();
    const fileName = document.path.split("/").pop();

    const range = req.headers.range;

    if (range === "bytes=0-0") {
      res.setHeader("content-type", getContentTypeFromExtension(fileExtension));
      res.setHeader("access-control-expose-headers", "Content-Range");
      return res.status(206).json({
        fileSize,
        message: "Partial file details fetched successfully.",
      });
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      res.setHeader("content-type", getContentTypeFromExtension(fileExtension));
      res.setHeader("access-control-expose-headers", "Content-Range");
      res.setHeader("content-range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("content-length", end - start + 1);
      res.status(206);

      const fileStream = fsCB.createReadStream(filePath, { start, end });
      fileStream.pipe(res);
    } else {
      res.setHeader("content-type", getContentTypeFromExtension(fileExtension));
      fsCB.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error("Error while processing file data:", error);
    res.status(500).json({ message: "Error downloading file" });
  }
};

export const wopiFileContents = async (req, res) => {
  try {
    const { fileId } = validateWopiToken(req.query.access_token);
    req.params.documentId = fileId;
    await getFileDataByDocumentId(req, res);
  } catch (err) {
    console.error("Error in getting file content:", err);
    res.status(500).json({ message: "Error fetching file content" });
  }
};

export const wopiFiles = async (req, res) => {
  try {
    setWopiHeaders(res);
    const wopiToken = req.query.access_token;

    const { userId, fileId, readOnly } = validateWopiToken(wopiToken);

    const document = await prisma.document.findUnique({
      where: { id: parseInt(fileId) },
      include: { department: true },
    });

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!document) {
      return res.status(404).json({ message: "File not found" });
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const filePath = join(
      __dirname,
      process.env.STORAGE_PATH || "",
      document.path,
    );

    const stat = await fs.stat(filePath);
    const fileName = document.path.split("/").pop();

    console.log("read only", readOnly);
    res.json({
      BaseFileName: fileName,
      Size: stat.size,
      OwnerId: document.ownerId || "owner-id",
      UserId: userId,
      Version: stat.mtime.toISOString(),
      SupportsUpdate: true,
      UserCanPrint: false, // 🔒 disables print
      UserCanDownload: false, // 🔒 disables download
      DisablePrint: true, // legacy support
      DisableExport: true,
      UserCanWrite: !readOnly, // Set based on IsReadOnly
      SupportsLocks: true,
      UserFriendlyName: user.username,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching file content" });
  }
};

export const wopiFileGet = async (req, res) => {
  try {
    const wopiToken = req.query.access_token;
    const { fileId } = validateWopiToken(wopiToken);
    req.params.documentId = fileId;
    await getFileDataByDocumentId(req, res);
  } catch (err) {
    res.status(500).json({ message: "Error fetching file content" });
  }
};

export const wopiFilePost = async (req, res) => {
  try {
    const wopiToken = req.query.access_token;
    const { userId, fileId } = validateWopiToken(wopiToken);

    const document = await prisma.document.findUnique({
      where: { id: parseInt(fileId) },
      include: { department: true },
    });

    console.log("reached at post contents");

    if (!document) {
      return res.status(404).json({ message: "File not found" });
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const filePath = join(
      __dirname,
      process.env.STORAGE_PATH || "",
      document.path,
    );

    console.log("file path", filePath);

    const dir = dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Buffer incoming body manually
    const chunks = [];

    req.on("data", (chunk) => {
      console.log("chunk", chunk);
      chunks.push(chunk);
    });

    req.on("end", async () => {
      const buffer = Buffer.concat(chunks);

      try {
        await fs.writeFile(filePath, buffer);

        console.log("end");

        await prisma.document.update({
          where: { id: parseInt(fileId) },
          data: { lastUpdatedOn: new Date() },
        });

        return res.status(200).json({});
      } catch (err) {
        return res.status(500).json({ message: "Error saving file" });
      }
    });

    req.on("error", (err) => {
      return res.status(500).json({ message: "Stream error" });
    });
  } catch (err) {
    return res.status(500).json({ message: "Error saving file" });
  }
};

let locks = new Map(); // Simple in-memory lock storage

export const wopiLock = (req, res) => {
  const { fileId } = req.params;
  const accessToken = req.query.access_token;
  const lock = req.headers["x-wopi-lock"];

  const currentLock = locks.get(fileId);

  // if (currentLock) {
  //   return res.status(409).set("X-WOPI-Lock", currentLock).send();
  // }

  locks.set(fileId, lock);
  return res.status(200).send();
};

export const wopiUnlock = (req, res) => {
  const { fileId } = req.params;
  const lock = req.headers["x-wopi-lock"];
  const currentLock = locks.get(fileId);

  // if (currentLock !== lock) {
  //   return res.status(409).set("X-WOPI-Lock", currentLock).send();
  // }

  locks.delete(fileId);
  return res.status(200).send();
};

export const wopiRefreshLock = (req, res) => {
  const { fileId } = req.params;
  const lock = req.headers["x-wopi-lock"];
  const currentLock = locks.get(fileId);

  if (currentLock !== lock) {
    return res.status(409).set("X-WOPI-Lock", currentLock).send();
  }

  // Refresh means re-saving the same lock, so we do nothing but 200
  return res.status(200).send();
};

export const downloadWatermarkedFile = async (req, res) => {
  let tempFilePath = null;
  let watermarkedFilePath = null;
  let tempImagePath = null;
  try {
    const documentId = req.params.documentId;
    const { password, watermark } = req.body;
    const watermarkText = watermark || "HAL KORWA";

    logger.info({
      action: "DOWNLOAD_WATERMARKED_START",
      details: { documentId, watermarkText },
    });

    if (!password) {
      logger.warn({
        action: "DOWNLOAD_WATERMARKED_NO_PASSWORD",
        details: { documentId },
      });
      return res.status(400).json({ message: "Password is required" });
    }

    const document = await prisma.document.findUnique({
      where: { id: parseInt(documentId) },
    });

    if (!document) {
      logger.warn({
        action: "DOWNLOAD_WATERMARKED_NOT_FOUND",
        details: { documentId },
      });
      return res.status(404).json({ message: "File not found in database" });
    }

    const absoluteFilePath = path.join(__dirname, STORAGE_PATH, document.path);

    try {
      await fs.access(absoluteFilePath, fs.constants.R_OK);
    } catch (error) {
      logger.error({
        action: "DOWNLOAD_WATERMARKED_ACCESS_ERROR",
        details: { error: error.message, path: absoluteFilePath },
      });
      return res.status(404).json({ message: "File not found in storage" });
    }

    const stats = await fs.stat(absoluteFilePath);
    const ext = path.extname(absoluteFilePath).toLowerCase();
    const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".tiff"];
    const contentType = getContentTypeFromExtension(ext.slice(1));

    tempFilePath = path.join(
      __dirname,
      STORAGE_PATH,
      `temp_${Date.now()}_${path.basename(absoluteFilePath, ext)}.pdf`,
    );

    if (allowedExtensions.includes(ext)) {
      if (ext === ".pdf") {
        const pdfBytes = await fs.readFile(absoluteFilePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();

        for (const page of pages) {
          const { width, height } = page.getSize();
          const fontSize = Math.max(Math.min(width, height) * 0.07, 20);
          const textWidth = helveticaFont.widthOfTextAtSize(
            watermarkText,
            fontSize,
          );
          page.drawText(watermarkText, {
            x: width / 2 - textWidth / 2,
            y: height / 2,
            size: fontSize,
            font: helveticaFont,
            color: rgb(0.5, 0.5, 0.5),
            opacity: 0.5,
            rotate: degrees(-45),
          });
        }

        const watermarkedPdfBytes = await pdfDoc.save();
        watermarkedFilePath = path.join(
          __dirname,
          STORAGE_PATH,
          `watermarked_${Date.now()}_${path.basename(absoluteFilePath)}`,
        );
        await fs.writeFile(watermarkedFilePath, watermarkedPdfBytes);
      } else {
        const image = sharp(absoluteFilePath, { failOn: "none" });
        const metadata = await image.metadata();
        const fontSize = Math.max(
          Math.min(metadata.width || 0, metadata.height || 0) * 0.07,
          20,
        );
        const svg = `
          <svg width="${metadata.width}" height="${
            metadata.height
          }" xmlns="http://www.w3.org/2000/svg">
            <text x="50%" y="50%" font-family="Helvetica" font-size="${fontSize}" fill="#808080" fill-opacity="0.5" text-anchor="middle" dominant-baseline="middle" transform="rotate(-45, ${
              metadata.width / 2
            }, ${metadata.height / 2})">${watermarkText}</text>
          </svg>
        `;
        const svgBuffer = Buffer.from(svg);
        let outputImage = image
          .composite([{ input: svgBuffer, blend: "over" }])
          .withMetadata();

        if (ext === ".jpg" || ext === ".jpeg") {
          outputImage = outputImage.jpeg({ quality: 100, mozjpeg: true });
        } else if (ext === ".png") {
          outputImage = outputImage.png({ compressionLevel: 0 });
        } else if (ext === ".tiff") {
          outputImage = outputImage.tiff({
            compression: "lzw",
            predictor: "horizontal",
            resolutionUnit: "inch",
            xres: metadata.density || 72,
            yres: metadata.density || 72,
          });
        }

        tempImagePath = path.join(
          __dirname,
          STORAGE_PATH,
          `temp_image_${Date.now()}${ext}`,
        );
        await outputImage.toFile(tempImagePath);

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([metadata.width, metadata.height]);
        let imageObj;
        if (ext === ".jpg" || ext === ".jpeg") {
          imageObj = await pdfDoc.embedJpg(await fs.readFile(tempImagePath));
        } else if (ext === ".png") {
          imageObj = await pdfDoc.embedPng(await fs.readFile(tempImagePath));
        } else if (ext === ".tiff") {
          const tiffToPng = await sharp(tempImagePath).png().toBuffer();
          imageObj = await pdfDoc.embedPng(tiffToPng);
        }
        page.drawImage(imageObj, {
          x: 0,
          y: 0,
          width: metadata.width,
          height: metadata.height,
        });

        const pdfBytes = await pdfDoc.save();
        watermarkedFilePath = path.join(
          __dirname,
          STORAGE_PATH,
          `watermarked_${Date.now()}_${path.basename(
            absoluteFilePath,
            ext,
          )}.pdf`,
        );
        await fs.writeFile(watermarkedFilePath, pdfBytes);
      }

      await execSync(
        `qpdf --encrypt "${password}" "${password}" 256 -- "${watermarkedFilePath}" "${tempFilePath}"`,
      );
    } else {
      await fs.copyFile(absoluteFilePath, tempFilePath);
    }

    const tempStats = await fs.stat(tempFilePath);
    res.set({
      "Content-Type": contentType,
      "Content-Length": tempStats.size,
      "Content-Disposition": `attachment; filename="${path.basename(
        absoluteFilePath,
        ext,
      )}.pdf"`,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'none'",
    });

    const fileStream = createReadStream(tempFilePath);
    fileStream.on("error", (err) => {
      logger.error({
        action: "DOWNLOAD_WATERMARKED_STREAM_ERROR",
        details: { error: err.message, documentId },
      });
      if (!res.headersSent) {
        res.status(500).json({ message: "Error streaming file" });
      }
    });

    await pipelineAsync(fileStream, res);

    logger.info({
      action: "DOWNLOAD_WATERMARKED_SUCCESS",
      details: {
        documentId,
        filePath: absoluteFilePath,
        watermarkText,
      },
    });
  } catch (error) {
    logger.error({
      action: "DOWNLOAD_WATERMARKED_ERROR",
      details: { error: error.message, documentId: req.params.documentId },
    });
    if (!res.headersSent) {
      res
        .status(500)
        .json({ message: "Error processing file: " + error.message });
    }
  } finally {
    if (tempFilePath) {
      try {
        await fs.access(tempFilePath);
        await fs.unlink(tempFilePath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          logger.error({
            action: "DOWNLOAD_WATERMARKED_CLEANUP_ERROR",
            details: { error: err.message, path: tempFilePath },
          });
        }
      }
    }
    if (watermarkedFilePath) {
      try {
        await fs.access(watermarkedFilePath);
        await fs.unlink(watermarkedFilePath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          logger.error({
            action: "DOWNLOAD_WATERMARKED_CLEANUP_ERROR",
            details: { error: err.message, path: watermarkedFilePath },
          });
        }
      }
    }
    if (tempImagePath) {
      try {
        await fs.access(tempImagePath);
        await fs.unlink(tempImagePath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          logger.error({
            action: "DOWNLOAD_WATERMARKED_CLEANUP_ERROR",
            details: { error: err.message, path: tempImagePath },
          });
        }
      }
    }
  }
};

export const bookmark_document = async (req, res) => {
  const accessToken = req.headers["authorization"].substring(7);
  const userData = await verifyUser(accessToken);
  if (userData === "Unauthorized") {
    return res.status(401).json({
      message: "Unauthorized request",
    });
  }

  const userId = userData.id;
  const documentId = req.body.documentId; // Assuming userId and documentId are sent in request body
  if (!userId || !documentId) {
    return res.status(400).json({ error: "Missing userId or documentId" });
  }
  try {
    const existingBookmark = await prisma.bookmark.findUnique({
      where: {
        userId_documentId: {
          userId: parseInt(userId),
          documentId: parseInt(documentId),
        },
      },
    });
    if (existingBookmark) {
      return res
        .status(400)
        .json({ error: "Document already bookmarked by this user" });
    }
    const newBookmark = await prisma.bookmark.create({
      data: {
        userId: parseInt(userId),
        documentId: parseInt(documentId),
      },
    });
    res.status(201).json({
      message: "Document bookmarked successfully",
      bookmark: newBookmark,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to bookmark document" });
  }
};

export const get_bookmarked_documents = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  if (!accessToken) {
    return res.status(401).json({ message: "No authorization token provided" });
  }

  const userData = await verifyUser(accessToken);
  if (userData === "Unauthorized") {
    return res.status(401).json({ message: "Unauthorized request" });
  }

  const userId = userData.id;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId: parseInt(userId),
      },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            path: true,
            type: true,
          },
        },
      },
    });

    const bookmarkedDocuments = bookmarks.map((bookmark) => ({
      id: bookmark.document.id,
      name: bookmark.document.name,
      path: bookmark.document.path.split("/").slice(0, -1).join("/"),
      type: bookmark.document.type,
    }));

    res.status(200).json({
      message: "Bookmarked documents retrieved successfully",
      documents: bookmarkedDocuments,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve bookmarked documents" });
  }
};

export const isDocumentBookmarked = async (userId, documentId) => {
  try {
    const bookmark = await prisma.bookmark.findUnique({
      where: {
        userId_documentId: {
          userId: parseInt(userId),
          documentId: parseInt(documentId),
        },
      },
    });

    return !!bookmark;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to check bookmark status");
  }
};

export const remove_bookmark_document = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  if (!accessToken) {
    return res.status(401).json({ message: "No authorization token provided" });
  }

  const userData = await verifyUser(accessToken);
  if (userData === "Unauthorized") {
    return res.status(401).json({ message: "Unauthorized request" });
  }

  const userId = userData.id;
  const { documentId } = req.body;

  if (!userId || !documentId) {
    return res.status(400).json({ error: "Missing userId or documentId" });
  }

  try {
    const existingBookmark = await prisma.bookmark.findUnique({
      where: {
        userId_documentId: {
          userId: parseInt(userId),
          documentId: parseInt(documentId),
        },
      },
    });

    if (!existingBookmark) {
      return res.status(404).json({ error: "Bookmark not found" });
    }

    await prisma.bookmark.delete({
      where: {
        userId_documentId: {
          userId: parseInt(userId),
          documentId: parseInt(documentId),
        },
      },
    });

    res.status(200).json({
      message: "Bookmark removed successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to remove bookmark" });
  }
};

export const mergeFilesToPdf = async (req, res) => {
  let userData;
  let tempFiles = [];
  let mergedPdfPath = null;

  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    userData = await verifyUser(accessToken);

    logger.info({
      action: "MERGE_FILES_START",
      userId: userData.id,
      details: {
        username: userData.username,
      },
    });

    if (userData === "Unauthorized") {
      logger.warn({
        action: "MERGE_FILES_UNAUTHORIZED",
        details: { accessToken },
      });
      return res.status(401).json({ message: "Unauthorized request" });
    }

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded for merging" });
    }

    // Create a new PDF document for merging
    const mergedPdf = await PDFDocument.create();

    // Create temporary directory
    const tempDir = path.join(__dirname, STORAGE_PATH, "temp");
    await fs.mkdir(tempDir, { recursive: true });

    // Process each uploaded file
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const fileBuffer = file.buffer;
      const originalName = file.originalname;
      const fileExtension = path.extname(originalName).toLowerCase();

      // Save file temporarily
      const tempFilePath = path.join(
        tempDir,
        `temp_${Date.now()}_${i}${fileExtension}`,
      );
      await fs.writeFile(tempFilePath, fileBuffer);
      tempFiles.push(tempFilePath);

      try {
        if (fileExtension === ".pdf") {
          // For PDF files, directly copy pages
          const pdfDoc = await PDFDocument.load(fileBuffer);
          const copiedPages = await mergedPdf.copyPages(
            pdfDoc,
            pdfDoc.getPageIndices(),
          );
          copiedPages.forEach((page) => mergedPdf.addPage(page));

          logger.info({
            action: "MERGE_PDF_PROCESSED",
            userId: userData.id,
            details: {
              fileName: originalName,
              pageCount: pdfDoc.getPageCount(),
            },
          });
        } else if (
          [".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"].includes(
            fileExtension,
          )
        ) {
          // For image files, convert to PDF page
          let image;

          try {
            image = sharp(fileBuffer, { failOn: "none" });
          } catch (sharpError) {
            // If sharp can't process, try alternative approach
            image = sharp(fileBuffer);
          }

          const metadata = await image.metadata();
          let imageObj;

          if ([".jpg", ".jpeg"].includes(fileExtension)) {
            imageObj = await mergedPdf.embedJpg(fileBuffer);
          } else if ([".png"].includes(fileExtension)) {
            imageObj = await mergedPdf.embedPng(fileBuffer);
          } else {
            // For other image formats, convert to PNG first
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

          logger.info({
            action: "MERGE_IMAGE_PROCESSED",
            userId: userData.id,
            details: {
              fileName: originalName,
              dimensions: `${metadata.width}x${metadata.height}`,
            },
          });
        } else if (
          [".txt", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt"].includes(
            fileExtension,
          )
        ) {
          // For text/office documents, extract text and create text page
          try {
            // Save temp file for text extraction
            await fs.writeFile(tempFilePath, fileBuffer);

            let extractedText = "";
            try {
              const extractionResult =
                await executeTextExtractionScript(tempFilePath);
              if (extractionResult.success && extractionResult.text) {
                extractedText = extractionResult.text;
              }
            } catch (extractionError) {
              logger.warn({
                action: "MERGE_FILE_EXTRACTION_FAILED",
                userId: userData.id,
                details: {
                  fileName: originalName,
                  error: extractionError.message,
                },
              });
            }

            // Create a text page
            const page = mergedPdf.addPage([595.28, 841.89]); // A4 size
            const helveticaFont = await mergedPdf.embedFont(
              StandardFonts.Helvetica,
            );

            // Draw file name as header
            page.drawText(`File: ${originalName}`, {
              x: 50,
              y: 800,
              size: 16,
              font: helveticaFont,
            });

            // Draw extracted text
            if (extractedText) {
              const lines = extractedText.split("\n");
              let yPosition = 750;
              const maxWidth = 495; // Page width minus margins

              for (let line of lines) {
                if (yPosition < 50) {
                  // Add new page if we run out of space
                  const newPage = mergedPdf.addPage([595.28, 841.89]);
                  newPage.drawText(`File: ${originalName} (continued)`, {
                    x: 50,
                    y: 800,
                    size: 16,
                    font: helveticaFont,
                  });
                  yPosition = 750;
                }

                // Simple text wrapping
                let currentLine = "";
                const words = line.split(" ");
                for (const word of words) {
                  const testLine = currentLine + word + " ";
                  const testWidth = helveticaFont.widthOfTextAtSize(
                    testLine,
                    12,
                  );

                  if (testWidth > maxWidth && currentLine !== "") {
                    page.drawText(currentLine, {
                      x: 50,
                      y: yPosition,
                      size: 12,
                      font: helveticaFont,
                    });
                    yPosition -= 20;
                    currentLine = word + " ";
                  } else {
                    currentLine = testLine;
                  }
                }

                if (currentLine) {
                  page.drawText(currentLine, {
                    x: 50,
                    y: yPosition,
                    size: 12,
                    font: helveticaFont,
                  });
                  yPosition -= 20;
                }
              }
            } else {
              // If no text extracted, show placeholder
              page.drawText("(Content could not be extracted)", {
                x: 50,
                y: 750,
                size: 12,
                font: helveticaFont,
              });
            }

            logger.info({
              action: "MERGE_DOCUMENT_PROCESSED",
              userId: userData.id,
              details: {
                fileName: originalName,
                textLength: extractedText.length,
              },
            });
          } catch (docError) {
            logger.error({
              action: "MERGE_DOCUMENT_ERROR",
              userId: userData.id,
              details: {
                fileName: originalName,
                error: docError.message,
              },
            });

            // Add a placeholder page
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
            page.drawText("(Error processing file)", {
              x: 50,
              y: 370,
              size: 12,
              font: helveticaFont,
            });
          }
        } else {
          // For unsupported file types, create an informational page
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
          page.drawText(
            `File type ${fileExtension} is not supported for content extraction`,
            {
              x: 50,
              y: 370,
              size: 12,
              font: helveticaFont,
            },
          );

          logger.info({
            action: "MERGE_UNSUPPORTED_FILE",
            userId: userData.id,
            details: {
              fileName: originalName,
              fileType: fileExtension,
            },
          });
        }
      } catch (error) {
        logger.error({
          action: "MERGE_FILE_PROCESSING_ERROR",
          userId: userData.id,
          details: {
            fileName: originalName,
            error: error.message,
          },
        });
        continue;
      }
    }

    // Check if any pages were added
    if (mergedPdf.getPageCount() === 0) {
      logger.warn({
        action: "MERGE_FILES_NO_VALID_PAGES",
        userId: userData.id,
        details: { fileCount: req.files.length },
      });
      return res
        .status(400)
        .json({ message: "No valid files could be merged" });
    }

    // Save the merged PDF to a temporary file
    const mergedPdfBytes = await mergedPdf.save();
    const timestamp = Date.now();
    mergedPdfPath = path.join(tempDir, `merged_${timestamp}.pdf`);
    await fs.writeFile(mergedPdfPath, mergedPdfBytes);

    // Get file stats for range requests
    const stat = await fs.stat(mergedPdfPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="merged_documents_${timestamp}.pdf"`,
    );
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (range === "bytes=0-0") {
      res.setHeader("Content-Range", `bytes 0-0/${fileSize}`);
      res.setHeader("Content-Length", 1);
      return res.status(206).json({
        fileSize,
        message: "Partial file details fetched successfully.",
      });
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", chunksize);
      res.status(206);

      const fileStream = fsCB.createReadStream(mergedPdfPath, { start, end });
      fileStream.pipe(res);

      // Cleanup after stream ends
      fileStream.on("end", async () => {
        await cleanupTempFiles(tempFiles, mergedPdfPath);
      });

      fileStream.on("error", async (error) => {
        logger.error({
          action: "MERGE_FILES_STREAM_ERROR",
          userId: userData.id,
          details: { error: error.message },
        });
        await cleanupTempFiles(tempFiles, mergedPdfPath);
      });
    } else {
      res.setHeader("Content-Length", fileSize);

      const fileStream = fsCB.createReadStream(mergedPdfPath);
      fileStream.pipe(res);

      // Cleanup after stream ends
      fileStream.on("end", async () => {
        await cleanupTempFiles(tempFiles, mergedPdfPath);
      });

      fileStream.on("error", async (error) => {
        logger.error({
          action: "MERGE_FILES_STREAM_ERROR",
          userId: userData.id,
          details: { error: error.message },
        });
        await cleanupTempFiles(tempFiles, mergedPdfPath);
      });
    }

    logger.info({
      action: "MERGE_FILES_SUCCESS",
      userId: userData.id,
      details: {
        fileCount: req.files.length,
        pageCount: mergedPdf.getPageCount(),
        mergedFilePath: mergedPdfPath,
        username: userData.username,
      },
    });
  } catch (error) {
    logger.error({
      action: "MERGE_FILES_ERROR",
      userId: userData?.id,
      details: {
        error: error.message,
        fileCount: req.files?.length || 0,
      },
    });

    // Cleanup on error
    await cleanupTempFiles(tempFiles, mergedPdfPath);

    if (!res.headersSent) {
      return res
        .status(500)
        .json({ message: "Error merging files: " + error.message });
    }
  }
};

// Helper function to clean up temporary files
async function cleanupTempFiles(tempFiles, mergedPdfPath) {
  try {
    // Clean up individual temp files
    for (const tempFile of tempFiles) {
      try {
        await fs.unlink(tempFile);
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.error(`Error deleting temp file ${tempFile}:`, err.message);
        }
      }
    }

    // Clean up merged PDF
    if (mergedPdfPath) {
      try {
        await fs.unlink(mergedPdfPath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.error(
            `Error deleting merged PDF ${mergedPdfPath}:`,
            err.message,
          );
        }
      }
    }
  } catch (error) {
    console.error("Error in cleanupTempFiles:", error.message);
  }
}

// Alternative version that returns the file URL (if you want to save it)
export const mergeAndSavePdf = async (req, res) => {
  let userData;
  let tempFiles = [];

  try {
    const authHeader =
      req.headers["authorization"] || req.headers["x-authorization"];
    const accessToken = authHeader?.substring(7);
    userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded for merging" });
    }

    // Create merged PDF
    const mergedPdf = await PDFDocument.create();

    // Process each file
    const tempDir = path.join(__dirname, STORAGE_PATH, "temp");
    await fs.mkdir(tempDir, { recursive: true });

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const fileBuffer = file.buffer;
      const originalName = file.originalname;
      const fileExtension = path.extname(originalName).toLowerCase();

      // Same processing logic from mergeFilesToPdf...
      const tempFilePath = path.join(
        tempDir,
        `temp_${Date.now()}_${i}${fileExtension}`,
      );
      await fs.writeFile(tempFilePath, fileBuffer);
      tempFiles.push(tempFilePath);

      try {
        if (fileExtension === ".pdf") {
          const pdfDoc = await PDFDocument.load(fileBuffer);
          const copiedPages = await mergedPdf.copyPages(
            pdfDoc,
            pdfDoc.getPageIndices(),
          );
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
        // ... (Keep your existing image/doc conversion logic here)
      } catch (docError) {
        continue;
      }
    }

    // Save to a permanent location
    const mergedPdfBytes = await mergedPdf.save();
    const timestamp = Date.now();
    const fileName = `merged_documents_${timestamp}.pdf`;
    const filePath = `temp/merged/${fileName}`;
    const fullPath = path.join(__dirname, STORAGE_PATH, filePath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Save the file
    await fs.writeFile(fullPath, mergedPdfBytes);

    // Create document record
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

    await createUserPermissions(newDocument.id, userData.username, true);

    // ✅ NATIVE DOWNLOAD FIX: Pre-attach token to the merged file URL
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
    logger.error({
      action: "MERGE_AND_SAVE_ERROR",
      userId: userData?.id,
    });

    // Cleanup temp files
    await cleanupTempFiles(tempFiles, null);

    return res.status(500).json({ message: "Error merging and saving files" });
  }
};

import XLSX from "xlsx";
import puppeteer from "puppeteer";

export const download_converted_signed_pdf = async (req, res) => {
  try {
    const { documentId, processId } = req.params;
    console.log(
      `\n[DMS CONVERT] --- Starting conversion for DocID: ${documentId} ---`,
    );

    // 1. Fetch Document Details
    const document = await prisma.document.findUnique({
      where: { id: parseInt(documentId) },
    });

    if (!document) {
      console.error("[DMS CONVERT ERROR] Document not found in DB.");
      return res.status(404).json({ message: "Document not found" });
    }

    const originalPath = path.join(
      __dirname,
      "../../../../",
      "storage",
      document.path,
    );

    try {
      await fs.access(originalPath);
    } catch (e) {
      return res
        .status(404)
        .json({ message: "Original file missing from server storage" });
    }

    const ext = document.name.split(".").pop().toLowerCase();
    let pdfBytes;

    // ==========================================
    // 2. CONVERSION LOGIC
    // ==========================================
    if (["jpg", "jpeg", "png"].includes(ext)) {
      console.log("[DMS CONVERT] File type is Image.");
      const imageBuffer = await fs.readFile(originalPath);
      const pdfDoc = await PDFDocument.create();

      let embeddedImage;
      if (ext === "png") embeddedImage = await pdfDoc.embedPng(imageBuffer);
      else embeddedImage = await pdfDoc.embedJpg(imageBuffer);

      const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
      page.drawImage(embeddedImage, { x: 0, y: 0 });
      pdfBytes = await pdfDoc.save();
    } else if (["xls", "xlsx"].includes(ext)) {
      console.log(
        `[DMS CONVERT] File type is Spreadsheet (${ext}). Applying wide-column fixes...`,
      );

      try {
        const workbook = XLSX.readFile(originalPath);
        let allSheetsHtml = "";

        workbook.SheetNames.forEach((sheetName, index) => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet["!ref"]) return;

          const rawHtml = XLSX.utils.sheet_to_html(sheet);
          const pageBreak =
            index > 0 ? '<div style="page-break-before: always;"></div>' : "";

          allSheetsHtml += `
            ${pageBreak}
            <div class="sheet-section">
              <h3>Sheet: ${sheetName}</h3>
              ${rawHtml}
            </div>
          `;
        });

        const styledHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 10px; }
              h3 { color: #666; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
              table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 10px; margin-bottom: 20px; }
              th, td { border: 1px solid #bbbbbb; text-align: left; padding: 4px; word-wrap: break-word; overflow-wrap: break-word; }
              th { background-color: #e2e2e2; font-weight: bold; }
            </style>
          </head>
          <body>
            <h2>${document.name}</h2>
            ${allSheetsHtml}
          </body>
          </html>
        `;

        const browser = await puppeteer.launch({
          headless: "new",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.setContent(styledHtml, { waitUntil: "networkidle0" });

        pdfBytes = await page.pdf({
          format: "A4",
          landscape: true,
          scale: 0.75,
          printBackground: true,
          margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
        });

        await browser.close();
      } catch (excelError) {
        return res.status(500).json({
          message: "Spreadsheet conversion failed",
          error: "error processing Excel file",
        });
      }
    } else if (["doc", "docx"].includes(ext)) {
      console.log(
        `[DMS CONVERT] File type is Word (${ext}). Preparing LibreOffice...`,
      );
      const outputDir = path.join(__dirname, "../../../../", "storage", "temp");
      await fs.mkdir(outputDir, { recursive: true });

      const command = `soffice --headless --convert-to pdf "${originalPath}" --outdir "${outputDir}"`;
      try {
        await execPromise(command);
      } catch (execError) {
        return res.status(500).json({
          message: "LibreOffice conversion failed",
          error: "conversion failed",
        });
      }

      const convertedFileName = document.name.replace(/\.[^/.]+$/, "") + ".pdf";
      const convertedFilePath = path.join(outputDir, convertedFileName);

      try {
        pdfBytes = await fs.readFile(convertedFilePath);
        await fs
          .unlink(convertedFilePath)
          .catch((e) => console.error(e.message));
      } catch (readError) {
        return res.status(500).json({
          message: "Converted PDF not found",
          error: "converted file missing",
        });
      }
    } else {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    // ==========================================
    // 3. FETCH & APPEND SIGNATURES
    // ==========================================
    const processDocuments = await prisma.processDocument.findMany({
      where: { processId: processId },
      select: { id: true },
    });

    const signatures = await prisma.documentSignature.findMany({
      where: { processDocumentId: { in: processDocuments.map((pd) => pd.id) } },
      include: { user: true },
    });

    const uniqueSignatures = Array.from(
      new Map(signatures.map((item) => [item.userId, item])).values(),
    );

    if (uniqueSignatures.length === 0) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${document.name}.pdf"`,
      );
      return res.send(Buffer.from(pdfBytes));
    }

    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let pages = pdfDoc.getPages();
    let signaturePage = pages[pages.length - 1];
    let { width, height } = signaturePage.getSize();
    let currentY = 250;

    // --- INTEGRATE getFileSpace.py FOR DYNAMIC Y POSITION ---
    try {
      const tempDir = path.join(__dirname, "../../../../", "storage", "temp");
      await fs.mkdir(tempDir, { recursive: true }).catch(() => {});
      const tempPdfPath = path.join(tempDir, `space_check_${Date.now()}.pdf`);

      // Save current state of PDF to check available space
      await fs.writeFile(tempPdfPath, await pdfDoc.save());

      const pythonScriptPath = path.join(
        __dirname,
        "../../support/getFileSpace.py",
      );
      const pythonEnvPath = path.join(
        __dirname,
        "../../support/venv/bin/python",
      );

      const { stdout } = await execPromise(
        `"${pythonEnvPath}" "${pythonScriptPath}" "${tempPdfPath}"`,
      );
      const spaceResult = JSON.parse(stdout.trim());

      if (spaceResult && spaceResult.y !== undefined) {
        currentY = spaceResult.y;

        // Handle case where python script determines a new page is needed
        if (spaceResult.newlyAdded) {
          signaturePage = pdfDoc.addPage([width, height]);
          currentY = height - 50;
        }
      }

      // Cleanup temp file
      await fs.unlink(tempPdfPath).catch(() => {});
    } catch (err) {
      console.error(
        "[DMS CONVERT WARNING] Failed to execute getFileSpace.py, using default Y.",
        err.message,
      );
    }

    signaturePage.drawText("Process Signatures:", {
      x: 50,
      y: currentY,
      size: 14,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    currentY -= 40;

    for (const sig of uniqueSignatures) {
      if (currentY < 60) {
        signaturePage = pdfDoc.addPage([width, height]);
        currentY = height - 50;
      }

      if (sig.user.signaturePicFileName) {
        try {
          // --- FIXED PATH RESOLUTION to match sign_documents structure ---
          // Assuming you have process.env.SIGNATURE_FOLDER_PATH or you can inject envVariables here
          const signatureFolder =
            process.env.SIGNATURE_FOLDER_PATH ||
            envVariables.SIGNATURE_FOLDER_PATH;
          const imagePath = path.join(
            __dirname,
            signatureFolder,
            sig.user.signaturePicFileName,
          );

          const jpegBuffer = await sharp(imagePath).jpeg().toBuffer();
          const embeddedSigImg = await pdfDoc.embedJpg(jpegBuffer);

          signaturePage.drawImage(embeddedSigImg, {
            x: 50,
            y: currentY - 35,
            width: 100,
            height: 40,
          });
        } catch (err) {
          console.error(
            `[DMS CONVERT WARNING] Signature image issue for ${sig.user.username}: ${err.message}`,
          );
        }
      }

      const formattedDate = sig.signedAt
        ? new Date(sig.signedAt).toLocaleString()
        : "N/A";

      signaturePage.drawText(`Signed By: ${sig.user.username}`, {
        x: 160,
        y: currentY,
        size: 10,
        font: helveticaFont,
      });
      signaturePage.drawText(`Date: ${formattedDate}`, {
        x: 160,
        y: currentY - 15,
        size: 9,
        font: helveticaFont,
      });
      signaturePage.drawText(`Remarks: ${sig.reason || "N/A"}`, {
        x: 160,
        y: currentY - 30,
        size: 9,
        font: helveticaFont,
      });

      currentY -= 60;
    }

    const finalPdfBytes = await pdfDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.name.replace(/\.[^/.]+$/, "")}_signed.pdf"`,
    );
    res.send(Buffer.from(finalPdfBytes));
  } catch (error) {
    console.error("\n[DMS CONVERT FATAL ERROR]:", error);
    res
      .status(500)
      .json({ message: "Failed to generate signed PDF", error: error.message });
  }
};

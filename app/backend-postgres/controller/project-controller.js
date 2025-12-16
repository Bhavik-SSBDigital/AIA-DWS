import { verifyUser } from "../utility/verifyUser.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { dirname, join } from "path";
import {
  getChildrenForDoc,
  getChildrenForFullAccess,
} from "../utility/accessFunction.js";
import { read } from "fs";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getRootDocumentsWithAccess = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const userId = userData.id;

    // Fetch user with roles
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get all role IDs for the user
    const roleIds = user.roles.map((userRole) => userRole.roleId);

    // Fetch root documents (isProject: true)
    const rootDocuments = await prisma.document.findMany({
      where: { isProject: true },
    });

    if (!rootDocuments.length) {
      return res.status(200).json({ children: [] });
    }

    // Get document access for user and their roles
    const documentAccesses = await prisma.documentAccess.findMany({
      where: {
        OR: [{ userId: userId }, { roleId: { in: roleIds } }],
        documentId: { in: rootDocuments.map((doc) => doc.id) },
      },
      select: {
        documentId: true,
        accessType: true,
        accessLevel: true,
      },
    });

    // Organize access by document
    const documentAccessMap = new Map();
    documentAccesses.forEach((access) => {
      if (!documentAccessMap.has(access.documentId)) {
        documentAccessMap.set(access.documentId, {
          readable: false,
          writable: false,
          uploadable: false,
          downloadable: false,
          isFullAccess: access.accessLevel === "FULL",
        });
      }

      const docAccess = documentAccessMap.get(access.documentId);

      // For FULL access level, grant all permissions
      if (access.accessLevel === "FULL") {
        docAccess.readable = true;
        docAccess.writable = true;
        docAccess.uploadable = true;
        docAccess.downloadable = true;
        docAccess.isFullAccess = true;
      } else {
        // For STANDARD access, only grant the specified permissions
        access.accessType.forEach((type) => {
          if (type === "READ") docAccess.readable = true;
          if (type === "EDIT") {
            docAccess.writable = true;
            docAccess.uploadable = true;
          }
          if (type === "DOWNLOAD") docAccess.downloadable = true;
        });
      }
    });

    // Filter documents based on user permissions
    const accessibleRootDocuments = rootDocuments.filter((doc) => {
      // Admin has full access
      if (user.username === "admin") return true;

      const access = documentAccessMap.get(doc.id);
      return access && (access.readable || access.writable);
    });

    // Map documents to include metadata
    const mappedDocuments = await Promise.all(
      accessibleRootDocuments.map(async (doc) => {
        const fileAbsolutePath = path.join(
          __dirname,
          process.env.STORAGE_PATH,
          doc.path.substring(1)
        );

        try {
          const fileStats = await fs.stat(fileAbsolutePath);
          const access = documentAccessMap.get(doc.id) || {};

          console.log("dpc path", doc.path);
          return {
            id: doc.id,
            name: doc.name,
            path: `..`,
            type: doc.type,
            createdOn: doc.createdOn,
            createdBy: doc.createdById,
            lastUpdated: fileStats.mtime,
            lastAccessed: fileStats.atime,
            size: fileStats.size,
            isUploadable: user.username === "admin" || access.uploadable,
            isDownloadable: user.username === "admin" || access.downloadable,
            children: [],
          };
        } catch (err) {
          console.error(`Failed to retrieve file stats for ${doc.path}:`, err);
          return null;
        }
      })
    );

    // Filter out null values
    const result = mappedDocuments.filter((doc) => doc !== null);

    return res.status(200).json({ children: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getRootDocumentsForEdit = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    const roleId = Number(req.body.role);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    if (!roleId) {
      return res.status(400).json({
        message: "Role ID is required",
      });
    }

    // Fetch document accesses for the specific role
    const roleAccesses = await prisma.documentAccess.findMany({
      where: {
        roleId: roleId,
        OR: [
          { docAccessThrough: "ADMINISTRATION" },
          { docAccessThrough: "SELF" },
        ],
      },
      include: {
        document: {
          select: {
            id: true,
            parentId: true,
          },
        },
      },
    });

    // Organize access data with parent consideration
    const selectedUpload = [];
    const selectedDownload = [];
    const selectedView = [];
    const fullAccess = [];

    roleAccesses.forEach((access) => {
      if (access.accessLevel === "FULL") {
        fullAccess.push({
          id: access.documentId,
          upload: true,
          download: true,
          view: true,
        });
      } else {
        if (access.accessType.includes("EDIT")) {
          selectedUpload.push(access.documentId);
        }
        if (access.accessType.includes("DOWNLOAD")) {
          selectedDownload.push(access.documentId);
        }
        if (access.accessType.includes("READ")) {
          selectedView.push(access.documentId);
        }
      }
    });

    // Fetch root project documents with their children
    const rootDocuments = await prisma.document.findMany({
      where: {
        isProject: true,
        parentId: null,
      },
      include: {
        children: {
          select: {
            id: true,
            name: true,
            path: true,
            type: true,
          },
        },
      },
    });

    if (!rootDocuments.length) {
      return res.status(400).json({
        message: "No root documents found",
      });
    }

    // Process documents and include file stats
    const childrenData = await Promise.all(
      rootDocuments.map(async (doc) => {
        const fileAbsolutePath = path.join(
          __dirname,
          process.env.STORAGE_PATH,
          doc.path
        );
        try {
          const fileStats = await fs.stat(fileAbsolutePath);

          // Check if this document has full access
          const hasFullAccess = roleAccesses.some(
            (access) =>
              access.documentId === doc.id && access.accessLevel === "FULL"
          );

          // If full access, add all children to the respective arrays
          if (hasFullAccess) {
            doc.children.forEach((child) => {
              if (child.type === "folder") {
                fullAccess.push({
                  id: child.id,
                  upload: true,
                  download: true,
                  view: true,
                });
              } else {
                selectedUpload.push(child.id);
                selectedDownload.push(child.id);
                selectedView.push(child.id);
              }
            });
          }

          return {
            id: doc.id,
            name: doc.name,
            path: `../${doc.name}`,
            type: doc.type,
            children: doc.children.map((child) => ({
              id: child.id,
              name: child.name,
              path: `..${child.path.substring(19)}`,
              type: child.type,
              children: [],
            })),
          };
        } catch (error) {
          console.error(`Error accessing file at ${fileAbsolutePath}:`, error);
          return null;
        }
      })
    );

    // Filter out null results and prepare response
    const filteredChildren = childrenData.filter((doc) => doc !== null);

    return res.status(200).json({
      children: filteredChildren,
      selectedUpload: Array.from(new Set(selectedUpload)),
      selectedDownload: Array.from(new Set(selectedDownload)),
      selectedView: Array.from(new Set(selectedView)),
      fullAccess: Array.from(
        new Set(fullAccess.map((obj) => JSON.stringify(obj)))
      ).map((str) => JSON.parse(str)),
    });
  } catch (error) {
    console.error("Error in getRootDocumentsForEdit:", error);
    return res.status(500).json({
      message: "Error accessing documents",
    });
  }
};

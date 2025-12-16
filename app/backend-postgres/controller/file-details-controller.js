import { verifyUser } from "../utility/verifyUser.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { dirname, join } from "path";
import { access, read } from "fs";
import {
  getChildrenForFullAccess,
  getParents,
} from "../utility/accessFunction.js";

import SearchIndexService from "../services/seach-index-service.js";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function removeDuplicates(array) {
  return Array.from(new Set(array));
}

import dotenv from "dotenv";
import { serializeBigInt } from "./process-controller.js";
import { isDocumentBookmarked } from "./file-controller.js";

dotenv.config();

const STORAGE_PATH = process.env.STORAGE_PATH;

export const getDocumentChildren = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    const parentPath = process.env.STORAGE_PATH + req.body.path.substring(2);

    // Find the parent document using the unique path
    const parentDocument = await prisma.document.findUnique({
      where: {
        path: parentPath,
      },
    });

    if (!parentDocument) {
      return res.status(404).json({
        message: "Parent document not found",
      });
    }

    // Fetch children documents related to the parent
    const childDocuments = await prisma.document.findMany({
      where: {
        parentId: parentDocument.id,
        type: "folder", // Assuming type "folder" is used to filter folders
      },
      select: {
        path: true,
      },
    });

    // Map and format the paths of the children documents
    const formattedDocuments = childDocuments.map((doc) => {
      let relativePath = `..${doc.path.substring(
        process.env.STORAGE_PATH.length
      )}`;
      return relativePath;
    });

    return res.status(200).json({
      children: formattedDocuments,
    });
  } catch (error) {
    console.error("Error fetching children documents:", error);
    return res.status(500).json({
      message: "Error fetching children for document residing at given path",
    });
  }
};

export const getDocumentDetailsOnTheBasisOfPath = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    const user = await prisma.user.findUnique({
      where: { username: userData.username },
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

    // Get all document accesses for the user
    const userDocumentAccesses = await prisma.documentAccess.findMany({
      where: {
        OR: [
          { userId: user.id },
          { roleId: { in: user.roles.map((r) => r.roleId) } },
        ],
      },
    });

    // Check if user is admin
    const isAdmin = user.username === "admin" || user.isAdmin;

    let docPath = req.body.path;
    docPath = docPath.substring(2);

    // Find the document with its children
    const foundDocument = await prisma.document.findUnique({
      where: { path: docPath },
      include: {
        children: true,
      },
    });

    if (!foundDocument) {
      return res.status(400).json({
        message: "Document doesn't exist",
      });
    }

    // Get parent documents for full access checks
    const parents = await getParents([foundDocument.id]);

    // Create access map
    const accessMap = new Map();
    userDocumentAccesses.forEach((access) => {
      if (!accessMap.has(access.documentId)) {
        accessMap.set(access.documentId, {
          readable: false,
          writable: false,
          uploadable: false,
          downloadable: false,
          isFullAccess: access.accessLevel === "FULL",
        });
      }

      const docAccess = accessMap.get(access.documentId);

      if (access.accessLevel === "FULL") {
        docAccess.readable = true;
        docAccess.writable = true;
        docAccess.uploadable = true;
        docAccess.downloadable = true;
        docAccess.isFullAccess = true;
      } else {
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

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    let children;

    if (isAdmin || user.specialUser) {
      // Admin or special user gets all children with full permissions
      children = await Promise.all(
        foundDocument.children.map(async (child) => {
          const fileAbsolutePath = path.join(
            __dirname,
            STORAGE_PATH,
            child.path
          );
          const createdBy = await prisma.user.findUnique({
            where: { id: child.createdById },
            select: { username: true },
          });

          try {
            const fileStats = !child.onlyMetaData
              ? await fs.stat(fileAbsolutePath)
              : null;

            const isDocumentBookmarked_ = await isDocumentBookmarked(
              userData.id,
              child.id
            );

            return {
              id: child.id,
              isDocumentBookmarked: isDocumentBookmarked_,
              path: `${child.path.slice(0, -child.name.length - 1)}`,
              name: child.name,
              type: child.type,
              isArchived: child.isArchived ?? false,
              inBin: child.inBin ?? false,
              createdOn: child.createdOn,
              isInvolvedInProcess: child.isInvolvedInProcess ?? false,
              createdBy: createdBy?.username,
              lastUpdated: fileStats ? fileStats.mtime : null,
              lastAccessed: fileStats ? fileStats.atime : null,
              size: fileStats ? fileStats.size : null,
              isUploadable: true,
              isDownloadable: true,
              isRejected: child.isRejected ?? false,
              children: [],
              onlyMetaData: child.onlyMetaData,
            };
          } catch (error) {
            console.log("error", error);
            return null;
          }
        })
      );

      console.log(foundDocument.children.map((item) => item.id));
    } else {
      // Regular user - filter based on permissions
      children = await Promise.all(
        foundDocument.children
          .filter((child) => {
            // Check if user has any access to this child
            const hasAccess = userDocumentAccesses.some(
              (userAccess) =>
                (userAccess.documentId === child.id ||
                  (userAccess.accessLevel === "FULL" &&
                    parents.includes(userAccess.documentId))) &&
                (userAccess.accessType.includes("READ") ||
                  userAccess.accessType.includes("DOWNLOAD") ||
                  userAccess.accessType.includes("EDIT"))
            );
            return hasAccess;
          })
          .map(async (child) => {
            const fileAbsolutePath = path.join(
              __dirname,
              process.env.STORAGE_PATH,
              child.path
            );

            const createdBy = await prisma.user.findUnique({
              where: { id: child.createdById },
              select: { username: true },
            });

            try {
              const fileStats = !child.onlyMetaData
                ? await fs.stat(fileAbsolutePath)
                : null;

              // Check specific permissions for this document
              const documentAccess = userDocumentAccesses.find(
                (access) => access.documentId === child.id
              );

              // Check for inherited full access
              const hasFullAccess = userDocumentAccesses.some(
                (access) =>
                  access.accessLevel === "FULL" &&
                  parents.includes(access.documentId)
              );

              const isDocumentBookmarked_ = await isDocumentBookmarked(
                userData.id,
                child.id
              );
              return {
                id: child.id,
                path: `${child.path.slice(0, -child.name.length - 1)}`,
                isDocumentBookmarked: isDocumentBookmarked_,
                name: child.name,
                isArchived: child.isArchived ?? false,
                inBin: child.inBin ?? false,
                type: child.type,
                createdOn: child.createdOn,
                isInvolvedInProcess: child.isInvolvedInProcess ?? false,
                createdBy: createdBy?.username,
                lastUpdated: fileStats ? fileStats.mtime : null,
                lastAccessed: fileStats ? fileStats.atime : null,
                size: fileStats ? fileStats.size : null,
                isRejected: child.isRejected ?? false,
                isDownloadable:
                  user.id === child.createdById ||
                  (documentAccess?.accessType.includes("DOWNLOAD") ?? false) ||
                  (hasFullAccess && child.type !== "folder"),
                children: [],
                onlyMetaData: child.onlyMetaData,
              };
            } catch (error) {
              console.log("error", error);
              return null;
            }
          })
      );
    }

    let result = await Promise.all(children);
    result = result.filter((item) => item !== null);

    ///1. isArchived, 2. inBin 3. isArchived & inBin
    console.log("section type", req.body.sectionType);
    if (req.body.sectionType) {
      result = result.filter((item) => {
        return (
          item[`${req.body.sectionType}`] === true || item.type === "folder"
        );
      });
    } else {
      result = result.filter(
        (item) =>
          (item.inBin === false && item.isArchived === false) ||
          (!item.inBin && !item.isArchived)
      );
    }
    // Check if user can upload to this directory
    const canUpload = isAdmin
      ? true
      : foundDocument.createdById === user.id
      ? true
      : userDocumentAccesses.some(
          (access) =>
            (access.documentId === foundDocument.id ||
              (access.accessLevel === "FULL" &&
                parents.includes(access.documentId))) &&
            access.accessType.includes("EDIT")
        );

    res.status(200).json({
      children: result,
      isUploadable: canUpload,
    });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({
      message: "Error accessing given document",
    });
  }
};

export const getDocumentDetailsOnTheBasisOfPathForEdit = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    // Get role document accesses
    const roleDocumentAccesses = await prisma.documentAccess.findMany({
      where: { roleId: parseInt(req.body.role) },
    });

    let documentPath = req.body.path;
    documentPath = documentPath.substring(2);

    // Find the document with its children
    const foundDocument = await prisma.document.findUnique({
      where: { path: documentPath },
      include: {
        children: true,
      },
    });

    if (!foundDocument) {
      return res.status(400).json({
        message: "Document doesn't exist",
      });
    }

    // Get parent documents for full access checks
    const parents = await getParents([foundDocument.id]);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    let selectedUpload = [];
    let selectedDownload = [];
    let selectedView = [];
    let fullAccess = [];

    if (foundDocument) {
      const children = await Promise.all(
        foundDocument.children.map(async (child) => {
          const fileAbsolutePath = path.join(__dirname, child.path);
          try {
            await fs.stat(fileAbsolutePath);

            let obj = {
              id: child.id,
              upload: false,
              download: false,
              view: false,
            };

            const childParents = await getParents([child.id]);

            // Check for full access permissions (direct or inherited)
            const hasFullAccess = roleDocumentAccesses.some(
              (access) =>
                access.accessLevel === "FULL" &&
                (access.documentId === child.id ||
                  childParents.includes(access.documentId))
            );

            if (hasFullAccess) {
              if (child.type === "folder") {
                obj.upload = true;
                obj.download = true;
                obj.view = true;
                fullAccess.push(obj);
              } else {
                selectedUpload.push(child.id);
                selectedDownload.push(child.id);
                selectedView.push(child.id);
              }
            } else {
              // Check standard permissions
              const documentAccess = roleDocumentAccesses.find(
                (access) => access.documentId === child.id
              );

              if (documentAccess) {
                if (documentAccess.accessType.includes("EDIT")) {
                  if (child.type === "folder") {
                    obj.upload = true;
                  } else {
                    selectedUpload.push(child.id);
                  }
                }
                if (documentAccess.accessType.includes("DOWNLOAD")) {
                  if (child.type === "folder") {
                    obj.download = true;
                  } else {
                    selectedDownload.push(child.id);
                  }
                }
                if (documentAccess.accessType.includes("READ")) {
                  if (child.type === "folder") {
                    obj.view = true;
                  } else {
                    selectedView.push(child.id);
                  }
                }
              }
            }

            return {
              id: child.id,
              name: child.name,
              path: `..${child.path.substring(19)}`,
              type: child.type,
              children: [],
            };
          } catch (error) {
            return null;
          }
        })
      );

      let result = await Promise.all(children);
      result = result.filter((item) => item !== null);

      console.log("result", result);

      res.status(200).json({
        children: result,
        selectedUpload: Array.from(new Set(selectedUpload)),
        selectedDownload: Array.from(new Set(selectedDownload)),
        selectedView: Array.from(new Set(selectedView)),
        fullAccess: Array.from(
          new Set(fullAccess.map((obj) => JSON.stringify(obj)))
        ).map((str) => JSON.parse(str)),
      });
    } else {
      res.status(400).json({
        message: "Document doesn't exist",
      });
    }
  } catch (error) {
    console.log("error", error);
    res.status(500).json({
      message: "Error accessing given document",
    });
  }
};

export const create_permissions = async (req, res) => {
  try {
    for (let i = 0; i < req.body.permissions.length; i++) {
      const obj = req.body.permissions[i];

      // Find the document by its path
      const document = await prisma.document.findUnique({
        where: { path: obj.filePath },
      });

      if (!document) {
        res
          .status(404)
          .json({ message: `Document with path ${obj.filePath} not found` });
        return;
      }

      const pathSegments = obj.filePath
        .split("/")
        .filter((segment) => segment !== "");
      const permissionedUsers = [...obj.read, ...obj.write];

      // Loop through path segments to manage parent documents
      for (let m = 0; m < permissionedUsers.length; m++) {
        let path = "";
        for (let p = 0; p < pathSegments.length - 1; p++) {
          path += `/${pathSegments[p]}`;

          // Find the parent document by its path
          const parentDocument = await prisma.document.findUnique({
            where: { path },
          });

          if (parentDocument) {
            // Create user permissions for the parent document
            await createUserPermissions(
              parentDocument.id,
              permissionedUsers[m],
              false,
              "STANDARD"
            );
          }
        }
      }

      // Assign read permissions
      for (let j = 0; j < obj.read.length; j++) {
        await createUserPermissions(
          document.id,
          obj.read[j],
          false,
          "STANDARD"
        );
      }

      // Assign write permissions
      for (let k = 0; k < obj.write.length; k++) {
        await createUserPermissions(
          document.id,
          obj.write[k],
          true,
          "STANDARD"
        );
      }
    }

    res.status(200).json({
      message: "Permissions created successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error creating permissions",
    });
  }
};

const createUserPermissions = async (
  documentId,
  userId,
  isWritable,
  accessLevel
) => {
  try {
    const existingPermission = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingPermission) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const accessTypes = isWritable ? ["READ", "EDIT"] : ["READ"];

    // Check if permission already exists
    const existingAccess = await prisma.documentAccess.findFirst({
      where: {
        documentId,
        userId,
        accessType: {
          hasSome: accessTypes,
        },
      },
    });

    if (!existingAccess) {
      // Create new permission
      await prisma.documentAccess.create({
        data: {
          documentId,
          userId,
          accessType: accessTypes,
          accessLevel,
          docAccessThrough: "ADMINISTRATION",
          grantedById: userId, // Assuming self-granted for now
        },
      });
    } else {
      // Update existing permission
      await prisma.documentAccess.update({
        where: { id: existingAccess.id },
        data: {
          accessType: {
            set: [...new Set([...existingAccess.accessType, ...accessTypes])],
          },
        },
      });
    }
  } catch (error) {
    console.error(`Error creating user permissions: ${error.message}`);
    throw error;
  }
};

export const getDocumentDetailsForAdmin = async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      include: {
        department: true,
        history: true,
        highlights: true,
        children: true,
        parent: true,
        isArchived: true,
        isInBin: true,
        documentAccesses: {
          include: {
            user: true,
            role: true,
            department: true,
          },
        },
      },
    });

    res.status(200).json({
      documents,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error in returning document details",
    });
  } finally {
    await prisma.$disconnect();
  }
};

export const search_documents = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  const userData = await verifyUser(accessToken);
  if (userData === "Unauthorized") {
    return res.status(401).json({ message: "Unauthorized request" });
  }

  try {
    // Get user with roles and check if admin
    const user = await prisma.user.findUnique({
      where: { id: userData.id },
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

    // Check if user is admin or special user
    const isAdmin =
      user.username === "admin" || user.isAdmin || user.specialUser;

    // Function to get allowed document IDs for non-admin users
    const getAllowedDocumentIds = async (userId, userRoles) => {
      // Get all document accesses for the user
      const userDocumentAccesses = await prisma.documentAccess.findMany({
        where: {
          OR: [
            { userId: userId },
            { roleId: { in: userRoles.map((r) => r.roleId) } },
          ],
        },
      });

      const allowedDocumentIds = new Set();

      // Helper function to get parent IDs
      const getParents = async (documentId) => {
        const parents = [];
        let currentDoc = await prisma.document.findUnique({
          where: { id: documentId },
          select: { id: true, parentId: true },
        });

        while (currentDoc && currentDoc.parentId) {
          parents.push(currentDoc.parentId);
          currentDoc = await prisma.document.findUnique({
            where: { id: currentDoc.parentId },
            select: { id: true, parentId: true },
          });
        }
        return parents;
      };

      // Process each access
      for (const access of userDocumentAccesses) {
        if (access.accessLevel === "FULL") {
          // For FULL access, add the document and all its children
          allowedDocumentIds.add(access.documentId);

          // Get all children of this document
          const getAllChildren = async (parentId) => {
            const children = await prisma.document.findMany({
              where: { parentId: parentId },
              select: { id: true },
            });

            for (const child of children) {
              allowedDocumentIds.add(child.id);
              await getAllChildren(child.id);
            }
          };

          await getAllChildren(access.documentId);
        } else if (
          access.accessType.includes("READ") ||
          access.accessType.includes("DOWNLOAD") ||
          access.accessType.includes("EDIT")
        ) {
          // For STANDARD access with READ/DOWNLOAD/EDIT permission
          allowedDocumentIds.add(access.documentId);

          // Check if any parent has FULL access that grants access to this document
          const parents = await getParents(access.documentId);
          const hasFullAccessParent = userDocumentAccesses.some(
            (parentAccess) =>
              parentAccess.accessLevel === "FULL" &&
              parents.includes(parentAccess.documentId)
          );

          if (hasFullAccessParent) {
            allowedDocumentIds.add(access.documentId);
          }
        }
      }

      // Also add documents created by the user
      const userDocuments = await prisma.document.findMany({
        where: { createdById: userId },
        select: { id: true },
      });

      userDocuments.forEach((doc) => allowedDocumentIds.add(doc.id));

      return Array.from(allowedDocumentIds);
    };

    // Get allowed document IDs for non-admin users
    let allowedDocumentIds = null;
    if (!isAdmin) {
      allowedDocumentIds = await getAllowedDocumentIds(user.id, user.roles);
    }

    const {
      name,
      tags,
      partNumber,
      isArchived,
      inBin,
      createdByUsername,
      processName,
      processId,
      description,
      preApproved,
      superseding,
      content,
      page = "1",
      pageSize = "10",
    } = req.query;

    // Convert string parameters to appropriate types
    const parsedPartNumber = partNumber;
    const parsedPage = parseInt(page, 10);
    const parsedPageSize = parseInt(pageSize, 10);

    // Validate inputs
    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ error: "Invalid page number" });
    }
    if (isNaN(parsedPageSize) || parsedPageSize < 1) {
      return res.status(400).json({ error: "Invalid page size" });
    }

    // Parse tags
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = Array.isArray(tags) ? tags : JSON.parse(tags);
        if (!Array.isArray(parsedTags)) {
          parsedTags = tags.split(",").map((tag) => tag.trim());
        }
      } catch (e) {
        parsedTags = tags.split(",").map((tag) => tag.trim());
      }
    }

    // Determine search types
    const hasContentSearch = !!content;
    const hasMetadataSearch = !!(
      name ||
      parsedTags.length > 0 ||
      parsedPartNumber ||
      isArchived !== undefined ||
      inBin !== undefined ||
      createdByUsername ||
      processName ||
      processId ||
      description ||
      preApproved !== undefined ||
      superseding !== undefined
    );
    const searchTypes = [];
    if (hasContentSearch) searchTypes.push("content");
    if (hasMetadataSearch) searchTypes.push("metadata");

    let formattedResults = [];
    let totalCount = 0;
    let totalPages = 0;
    let searchTypeResponse = searchTypes.join(",");
    let searchQueryResponse = content || "";

    // Handle combined or individual searches
    if (hasContentSearch && hasMetadataSearch) {
      // Combined search: Run both content and metadata searches
      try {
        // Content search with access control
        const contentResults = await SearchIndexService.searchContent(content, {
          page: parsedPage,
          pageSize: parsedPageSize,
          allowedDocumentIds: isAdmin ? null : allowedDocumentIds,
        });

        // Metadata search with access control
        const where = {
          AND: [
            name ? { name: { contains: name, mode: "insensitive" } } : {},
            parsedTags.length > 0 ? { tags: { hasSome: parsedTags } } : {},
            isArchived !== undefined
              ? { isArchived: isArchived === "true" }
              : {},
            inBin !== undefined ? { inBin: inBin === "true" } : {},
            createdByUsername
              ? {
                  createdBy: {
                    username: {
                      contains: createdByUsername,
                      mode: "insensitive",
                    },
                  },
                }
              : {},
            // Add access control for non-admin users
            !isAdmin ? { id: { in: allowedDocumentIds } } : {},
          ],
        };

        const processDocumentConditions = [];
        if (parsedPartNumber)
          processDocumentConditions.push({ partNumber: parsedPartNumber });
        if (processId) processDocumentConditions.push({ processId });
        if (processName)
          processDocumentConditions.push({
            process: { name: { contains: processName, mode: "insensitive" } },
          });
        if (description)
          processDocumentConditions.push({
            description: { contains: description, mode: "insensitive" },
          });
        if (preApproved !== undefined)
          processDocumentConditions.push({
            preApproved: preApproved === "true",
          });
        if (superseding !== undefined)
          processDocumentConditions.push({
            superseding: superseding === "true",
          });
        if (processDocumentConditions.length > 0) {
          where.processDocuments = { some: { AND: processDocumentConditions } };
        }

        const documents = await prisma.document.findMany({
          where,
          select: {
            id: true,
            path: true,
            tags: true,
            name: true,
            isArchived: true,
            inBin: true,
            createdBy: { select: { username: true } },
            processDocuments: {
              select: {
                partNumber: true,
                processId: true,
                description: true,
                preApproved: true,
                superseding: true,
                process: { select: { name: true } },
              },
            },
            documentContent: { select: { content: true, indexedAt: true } },
          },
          skip: (parsedPage - 1) * parsedPageSize,
          take: parsedPageSize,
          orderBy: { createdOn: "desc" },
        });

        // Format content search results
        const contentFormatted = contentResults.results.map((result) => ({
          id: result.id,
          path: result.path.split("/").slice(0, -1).join("/"),
          tags: result.tags,
          name: result.name,
          isArchived: result.isArchived,
          inBin: result.inBin,
          createdByUsername: result.createdByUsername,
          partNumber: result.partNumber,
          processId: result.processId,
          processName: result.processName,
          description: result.description,
          preApproved: result.preApproved,
          superseding: result.superseding,
          contentSnippet: result.contentSnippet,
          searchScore: result.rank,
        }));

        // Format metadata search results
        const metadataFormatted = documents.map((doc) => ({
          id: doc.id,
          path: doc.path.split("/").slice(0, -1).join("/"),
          tags: doc.tags,
          name: doc.name,
          isArchived: doc.isArchived,
          inBin: doc.inBin,
          createdByUsername: doc.createdBy?.username || null,
          partNumber: doc.processDocuments[0]?.partNumber || null,
          processId: doc.processDocuments[0]?.processId || null,
          processName: doc.processDocuments[0]?.process?.name || null,
          description: doc.processDocuments[0]?.description || null,
          preApproved: doc.processDocuments[0]?.preApproved || null,
          superseding: doc.processDocuments[0]?.superseding || null,
          hasContent: !!doc.documentContent?.content,
          contentIndexedAt: doc.documentContent?.indexedAt,
        }));

        // Merge results, removing duplicates by id
        const uniqueResults = [];
        const seenIds = new Set();
        [...contentFormatted, ...metadataFormatted].forEach((doc) => {
          if (!seenIds.has(doc.id)) {
            uniqueResults.push(doc);
            seenIds.add(doc.id);
          }
        });

        // Sort by id or score if available (simplified sorting)
        formattedResults = uniqueResults.sort(
          (a, b) => (b.searchScore || 0) - (a.searchScore || 0)
        );
        totalCount = uniqueResults.length;
        totalPages = Math.ceil(totalCount / parsedPageSize);

        // Log search history
        const newSearch = await prisma.searchHistory.create({
          data: {
            userId: userData.id,
            searchQuery: req.query,
            searchType: "content,metadata",
          },
        });

        return res.status(200).json({
          data: serializeBigInt(formattedResults),
          pagination: {
            page: parsedPage,
            pageSize: parsedPageSize,
            totalCount,
            totalPages,
          },
          searchType: "content,metadata",
          searchQuery: content,
          id: newSearch.id,
        });
      } catch (error) {
        console.error("Error in combined search:", error);
        // Fallback to metadata search if content search fails
        req.query.name = content;
        req.query.description = content;
        delete req.query.content;
        return search_documents(req, res);
      }
    } else if (hasContentSearch) {
      // Content-only search
      try {
        const contentResults = await SearchIndexService.searchContent(content, {
          page: parsedPage,
          pageSize: parsedPageSize,
          allowedDocumentIds: isAdmin ? null : allowedDocumentIds,
        });

        formattedResults = contentResults.results.map((result) => ({
          id: result.id,
          path: result.path.split("/").slice(0, -1).join("/"),
          tags: result.tags,
          name: result.name,
          isArchived: result.isArchived,
          inBin: result.inBin,
          createdByUsername: result.createdByUsername,
          partNumber: result.partNumber,
          processId: result.processId,
          processName: result.processName,
          description: result.description,
          preApproved: result.preApproved,
          superseding: result.superseding,
          contentSnippet: result.contentSnippet,
          searchScore: result.rank,
        }));

        const newSearch = await prisma.searchHistory.create({
          data: {
            userId: userData.id,
            searchQuery: { content },
            searchType: "content",
          },
        });

        return res.status(200).json({
          data: serializeBigInt(formattedResults),
          pagination: {
            page: parsedPage,
            pageSize: parsedPageSize,
            totalCount: contentResults.totalCount,
            totalPages: contentResults.totalPages,
          },
          searchType: "content",
          searchQuery: content,
          id: newSearch.id,
        });
      } catch (error) {
        console.error("Error in content search:", error);
        req.query.name = content;
        req.query.description = content;
        delete req.query.content;
        return search_documents(req, res);
      }
    } else if (hasMetadataSearch) {
      // Metadata-only search
      const where = {
        AND: [
          name ? { name: { contains: name, mode: "insensitive" } } : {},
          parsedTags.length > 0 ? { tags: { hasSome: parsedTags } } : {},
          isArchived !== undefined ? { isArchived: isArchived === "true" } : {},
          inBin !== undefined ? { inBin: inBin === "true" } : {},
          createdByUsername
            ? {
                createdBy: {
                  username: {
                    contains: createdByUsername,
                    mode: "insensitive",
                  },
                },
              }
            : {},
          // Add access control for non-admin users
          !isAdmin ? { id: { in: allowedDocumentIds } } : {},
        ],
      };

      const processDocumentConditions = [];
      if (parsedPartNumber)
        processDocumentConditions.push({ partNumber: parsedPartNumber });
      if (processId) processDocumentConditions.push({ processId });
      if (processName)
        processDocumentConditions.push({
          process: { name: { contains: processName, mode: "insensitive" } },
        });
      if (description)
        processDocumentConditions.push({
          description: { contains: description, mode: "insensitive" },
        });
      if (preApproved !== undefined)
        processDocumentConditions.push({ preApproved: preApproved === "true" });
      if (superseding !== undefined)
        processDocumentConditions.push({ superseding: superseding === "true" });
      if (processDocumentConditions.length > 0) {
        where.processDocuments = { some: { AND: processDocumentConditions } };
      }

      console.log("Where clause:", JSON.stringify(where, null, 2));

      const documents = await prisma.document.findMany({
        where,
        select: {
          id: true,
          path: true,
          tags: true,
          name: true,
          isArchived: true,
          inBin: true,
          createdBy: { select: { username: true } },
          processDocuments: {
            select: {
              partNumber: true,
              processId: true,
              description: true,
              preApproved: true,
              superseding: true,
              process: { select: { name: true } },
            },
          },
          documentContent: { select: { content: true, indexedAt: true } },
        },
        skip: (parsedPage - 1) * parsedPageSize,
        take: parsedPageSize,
        orderBy: { createdOn: "desc" },
      });

      formattedResults = documents.map((doc) => ({
        id: doc.id,
        path: doc.path.split("/").slice(0, -1).join("/"),
        tags: doc.tags,
        name: doc.name,
        isArchived: doc.isArchived,
        inBin: doc.inBin,
        createdByUsername: doc.createdBy?.username || null,
        partNumber: doc.processDocuments[0]?.partNumber || null,
        processId: doc.processDocuments[0]?.processId || null,
        processName: doc.processDocuments[0]?.process?.name || null,
        description: doc.processDocuments[0]?.description || null,
        preApproved: doc.processDocuments[0]?.preApproved || null,
        superseding: doc.processDocuments[0]?.superseding || null,
        hasContent: !!doc.documentContent?.content,
        contentIndexedAt: doc.documentContent?.indexedAt,
      }));

      totalCount = await prisma.document.count({ where });
      totalPages = Math.ceil(totalCount / parsedPageSize);

      const newSearch = await prisma.searchHistory.create({
        data: {
          userId: userData.id,
          searchQuery: req.query,
          searchType: "metadata",
        },
      });

      res.status(200).json({
        data: serializeBigInt(formattedResults),
        pagination: {
          page: parsedPage,
          pageSize: parsedPageSize,
          totalCount,
          totalPages,
        },
        searchType: "metadata",
        id: newSearch.id,
      });
    } else {
      // No valid search parameters provided
      return res
        .status(400)
        .json({ error: "At least one search parameter is required" });
    }
  } catch (error) {
    console.error("Error searching documents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const get_searches = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  const userData = await verifyUser(accessToken);
  if (userData === "Unauthorized") {
    return res.status(401).json({ message: "Unauthorized request" });
  }

  try {
    const { searchType } = req.query;

    const where = {
      userId: userData.id,
    };
    if (searchType) {
      // Support filtering by single or multiple types (e.g., "content", "metadata", "content,metadata")
      where.searchType = { contains: searchType };
    }

    const searches = await prisma.searchHistory.findMany({
      where,
      select: {
        id: true,
        searchQuery: true,
        searchType: true,
        searchedAt: true,
      },
      orderBy: { searchedAt: "desc" },
    });

    res.status(200).json({
      data: serializeBigInt(searches),
    });
  } catch (error) {
    console.error("Error getting searches:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const delete_search = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  const userData = await verifyUser(accessToken);
  if (userData === "Unauthorized") {
    return res.status(401).json({ message: "Unauthorized request" });
  }

  try {
    const { id } = req.params; // Assume /delete_search/:id route
    const parsedId = parseInt(id, 10);

    if (isNaN(parsedId)) {
      return res.status(400).json({ error: "Invalid search ID" });
    }

    const search = await prisma.searchHistory.findUnique({
      where: { id: parsedId },
    });

    if (!search || search.userId !== userData.id) {
      return res
        .status(404)
        .json({ error: "Search not found or not owned by user" });
    }

    await prisma.searchHistory.delete({
      where: { id: parsedId },
    });

    res.status(200).json({ message: "Search deleted successfully" });
  } catch (error) {
    console.error("Error deleting search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

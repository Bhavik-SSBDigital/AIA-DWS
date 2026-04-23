import { PrismaClient } from "@prisma/client";
import { Document, Packer, Paragraph } from "docx";
import { verifyUser } from "../utility/verifyUser.js";
import { fileURLToPath } from "url";
import { dirname, join, normalize, extname, basename } from "path";
import { generateUniqueDocumentName } from "./process-controller.js";
import {
  createUserPermissions,
  getParentPath,
  storeChildIdInParentDocument,
  file_copy,
  file_cut,
  createFolder,
  create_folder,
} from "./file-controller.js";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import dotnev from "dotenv";
import fs from "fs/promises";
dotnev.config();

const prisma = new PrismaClient();

const STORAGE_PATH = process.env.STORAGE_PATH;

export const add_tags = async (req, res) => {
  try {
    let { tags } = req.body;

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        message: "tags must be a non-empty array of strings",
      });
    }

    // normalize + deduplicate
    tags = [...new Set(tags.map((t) => t?.trim()).filter(Boolean))];

    const result = await prisma.tag.createMany({
      data: tags.map((name) => ({ name })),
      skipDuplicates: true,
    });

    return res.status(201).json({
      message: "Tags added successfully",
      added: result.count,
    });
  } catch (err) {
    console.error("add_tags error:", err);
    res.status(500).json({ message: "Failed to add tags" });
  }
};

export const get_tags = async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    });

    res.status(200).json(tags);
  } catch (err) {
    console.error("get_tags error:", err);
    res.status(500).json({ message: "Failed to fetch tags" });
  }
};

// PUT /tags/:id
export const update_tag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Tag name is required" });
    }

    const trimmedName = name.trim();

    // Check if another tag already uses this name (unique constraint)
    const existing = await prisma.tag.findFirst({
      where: {
        name: trimmedName,
        NOT: { id: parseInt(id) },
      },
    });
    if (existing) {
      return res.status(409).json({ message: "Tag name already exists" });
    }

    const updatedTag = await prisma.tag.update({
      where: { id: parseInt(id) },
      data: { name: trimmedName },
    });

    res.status(200).json(updatedTag);
  } catch (err) {
    console.error("update_tag error:", err);
    if (err.code === "P2025") {
      // Record not found
      return res.status(404).json({ message: "Tag not found" });
    }
    res.status(500).json({ message: "Failed to update tag" });
  }
};

// DELETE /tags/:id
export const delete_tag = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.tag.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: "Tag deleted successfully" });
  } catch (err) {
    console.error("delete_tag error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Tag not found" });
    }
    // If tag is referenced elsewhere, Prisma will throw P2003 (foreign key)
    // You may choose to handle cascading deletes or block deletion
    res.status(500).json({ message: "Failed to delete tag" });
  }
};

// 1. FETCH TEMPLATES BY TAG ID
// ============================================================================
export const get_templates_by_tag = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    if (!accessToken)
      return res
        .status(401)
        .json({ message: "Authorization token is required" });

    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    // 🔄 UPDATED: Extract and parse tagId
    const tagId = parseInt(req.params.tagId, 10);
    if (!tagId || isNaN(tagId))
      return res.status(400).json({ error: "Valid tagId is required" });

    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      include: {
        templates: {
          select: { id: true, name: true, path: true },
          where: {
            type: "file",
            isArchived: false,
            inBin: false,
          },
        },
      },
    });

    if (!tag) return res.status(404).json({ error: "Tag not found" });

    return res.status(200).json({
      message: "Templates retrieved successfully",
      templates: tag.templates,
    });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return res.status(500).json({ error: "Failed to fetch templates" });
  }
};

// ============================================================================
// 2. CREATE BLANK TEMPLATE DOCUMENT (Using tagId)
// ============================================================================
export const create_template_document = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // 🔄 UPDATED: Use tagId
    const { extension, tagId, templateName } = req.body;

    if (!tagId) return res.status(400).json({ error: "tagId is required" });

    const parsedTagId = parseInt(tagId, 10);
    const tag = await prisma.tag.findUnique({
      where: { id: parsedTagId },
      select: { id: true, name: true },
    });

    if (!tag) return res.status(404).json({ error: "Tag not found" });

    const safeTagName = tag.name.replace(/[^a-zA-Z0-9]/g, "_");
    const templatePath = path.join(
      __dirname,
      STORAGE_PATH,
      "tags",
      safeTagName,
      "templates",
      `${templateName}.${extension}`,
    );
    const dirPath = path.join(
      __dirname,
      STORAGE_PATH,
      "tags",
      safeTagName,
      "templates",
    );

    try {
      await fs.access(dirPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        await fs.mkdir(dirPath, { recursive: true });

        const templa = await prisma.document.create({
          data: {
            name: "templates",
            path: `/tags/${safeTagName}/templates`,
            createdById: userData.id,
            type: "folder",
          },
        });

        await createUserPermissions(templa.id, userData.username, true);
        const parentPath = getParentPath(`../tags/${safeTagName}/templates`);
        await storeChildIdInParentDocument(parentPath, templa.id);
      } else {
        throw error;
      }
    }

    const cleanExtension = extension.replace(/^\./, "").toLowerCase();
    const supportedExtensions = [
      "docx",
      "xlsx",
      "pptx",
      "docm",
      "xlsm",
      "pptm",
      "dotx",
      "xltx",
      "potx",
    ];

    if (!supportedExtensions.includes(cleanExtension)) {
      return res.status(400).json({ error: "Unsupported file extension" });
    }

    // Generate physical files logic (Keep your Word/Excel/Powerpoint Buffer generation exactly as is here)
    if (["docx", "docm", "dotx"].includes(cleanExtension)) {
      const doc = new Document({
        sections: [{ children: [new Paragraph("")] }],
      });
      const buffer = await Packer.toBuffer(doc);
      await fs.writeFile(templatePath, buffer);
    } else if (["xlsx", "xlsm", "xltx"].includes(cleanExtension)) {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([]),
        "Sheet1",
      );
      XLSX.writeFile(workbook, templatePath, { bookType: cleanExtension });
    } else if (["pptx", "pptm", "potx"].includes(cleanExtension)) {
      const pptx = officegen("pptx");
      const slide = pptx.makeNewSlide();
      slide.addText("", { x: 0, y: 0, font_size: 18 });
      await new Promise((resolve, reject) => {
        const out = fsCB.createWriteStream(templatePath);
        pptx.generate(out);
        out.on("close", resolve);
        out.on("error", reject);
      });
    }

    const newTemplate = await prisma.document.create({
      data: {
        name: `${templateName}.${extension}`,
        path: `/tags/${safeTagName}/templates/${templateName}.${extension}`,
        createdById: userData.id,
        type: "file",
        templateTags: { connect: { id: tag.id } },
      },
    });

    await createUserPermissions(newTemplate.id, userData.username, true);
    const parentPath = getParentPath(
      `../tags/${safeTagName}/templates/${templateName}.${extension}`,
    );
    await storeChildIdInParentDocument(parentPath, newTemplate.id);

    return res.status(201).json({
      message: "Blank Office document created successfully",
      templateName,
      path: `/tags/${safeTagName}/templates/${templateName}.${extension}`,
      documentId: newTemplate.id,
    });
  } catch (error) {
    console.error("Error creating document:", error);
    // ✅ FIXED: Handle Prisma Unique Constraint Error
    if (error.code === "P2002") {
      return res.status(400).json({
        error:
          "A template with this name already exists. Please change the template name.",
      });
    }
    return res.status(500).json({ error: "Failed to create document" });
  }
};

// ============================================================================
// 5. DELETE TEMPLATE DOCUMENT
// ============================================================================
export const delete_template_document = async (req, res) => {
  try {
    const authHeader =
      req.headers["authorization"] || req.headers["x-authorization"];
    const accessToken = authHeader?.substring(7);

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

    const templateId = parseInt(req.params.id, 10);
    if (!templateId || isNaN(templateId)) {
      return res.status(400).json({ error: "Valid template ID is required" });
    }

    // 1. Verify the document exists and is a template
    const template = await prisma.document.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    if (!template.path.startsWith("/tags/")) {
      return res
        .status(403)
        .json({ error: "Forbidden: Not a valid template document" });
    }

    // 2. Delete the physical file from local storage
    const originalFilePath = path.join(
      __dirname,
      "../", // Note: Ensure this matches your upload_template path logic
      STORAGE_PATH,
      template.path.substring(1),
    );

    try {
      await fs.unlink(originalFilePath);
    } catch (fsError) {
      // If the file doesn't exist on disk, we still want to clean up the DB
      if (fsError.code !== "ENOENT") {
        console.error("Error deleting physical file:", fsError);
      }
    }

    // 3. Delete the Prisma DB record
    // Note: Due to onDelete: Cascade in your schema (e.g. DocumentAccess),
    // related child records are automatically cleaned up.
    await prisma.document.delete({
      where: { id: templateId },
    });

    return res.status(200).json({ message: "Template deleted successfully" });
  } catch (error) {
    console.error("Error deleting template:", error);
    return res
      .status(500)
      .json({ error: "Failed to delete template document" });
  }
};

// ============================================================================
// 3. UPLOAD TEMPLATE DOCUMENT (Using tagId)
// ============================================================================
export const upload_template_document = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    if (!accessToken)
      return res.status(401).json({ message: "Authorization token missing" });

    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    // 🔄 UPDATED: Use tagId
    const { tagId, purpose } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!tagId) return res.status(400).json({ error: "Tag ID is required" });
    if (purpose !== "template")
      return res.status(400).json({ error: "Invalid purpose specified" });

    const parsedTagId = parseInt(tagId, 10);
    const tag = await prisma.tag.findUnique({
      where: { id: parsedTagId },
      select: { id: true, name: true },
    });

    if (!tag) return res.status(404).json({ error: "Tag not found" });

    const extension = path
      .extname(file.originalname)
      .toLowerCase()
      .replace(/^\./, "");
    const templateName = path.basename(file.originalname, `.${extension}`);
    const safeTagName = tag.name.replace(/[^a-zA-Z0-9]/g, "_");

    const dirPath = path.join(
      __dirname,
      "../",
      STORAGE_PATH,
      "tags",
      safeTagName,
      "templates",
    );

    try {
      await fs.access(dirPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        await fs.mkdir(dirPath, { recursive: true });

        const templateDir = await prisma.document.create({
          data: {
            name: "templates",
            path: `/tags/${safeTagName}/templates`,
            createdById: userData.id,
            type: "folder",
          },
        });
        await createUserPermissions(templateDir.id, userData.username, true);
        const parentPath = getParentPath(`../tags/${safeTagName}/templates`);
        await storeChildIdInParentDocument(parentPath, templateDir.id);
      } else throw error;
    }

    const newTemplate = await prisma.document.create({
      data: {
        name: `${templateName}.${extension}`,
        path: `/tags/${safeTagName}/templates/${templateName}.${extension}`,
        createdById: userData.id,
        type: "file",
        templateTags: { connect: { id: tag.id } },
      },
    });

    await createUserPermissions(newTemplate.id, userData.username, true);
    const parentPath = getParentPath(
      `../tags/${safeTagName}/templates/${templateName}.${extension}`,
    );
    await storeChildIdInParentDocument(parentPath, newTemplate.id);

    return res.status(201).json({
      message: "Template document uploaded successfully",
      templateName: `${templateName}.${extension}`,
      path: `/tags/${safeTagName}/templates/${templateName}.${extension}`,
      documentId: newTemplate.id,
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    // ✅ FIXED: Handle Prisma Unique Constraint Error
    if (error.code === "P2002") {
      return res.status(400).json({
        error:
          "A template with this name already exists. Please rename the file and try uploading again.",
      });
    }
    return res.status(500).json({ error: "Failed to upload document" });
  }
};

export const use_template_document = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    if (!accessToken)
      return res.status(401).json({ message: "Authorization token missing" });
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    let { templateId, workflowId } = req.body; // Keep workflowId to know where to copy the temp file to
    templateId = parseInt(templateId, 10);

    const document = await prisma.document.findUnique({
      where: { id: templateId },
      select: { path: true, name: true },
    });

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true },
    });

    try {
      await fs.access(
        path.join(__dirname, STORAGE_PATH, workflow.name, "temp"),
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        await createFolder(false, `../${workflow.name}/temp`, userData);
      } else throw error;
    }

    const sourcePath = `./${document.path}`;
    const destinationPath = `../${workflow.name}/temp`;

    const name = await generateUniqueDocumentName({
      workflowId: workflowId,
      replacedDocId: null,
      extension: document.name.split(".").pop(),
    });

    const response = await new Promise((resolve, reject) => {
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

    const generatedDocument = await prisma.document.findUnique({
      where: { id: response.documentId },
      select: { id: true, name: true, path: true },
    });

    return res.status(200).json({
      message: "Template document used successfully",
      documentId: generatedDocument.id,
      documentName: generatedDocument.name,
      documentPath: generatedDocument.path,
    });
  } catch (error) {
    console.log("Error using template document:", error);
    return res.status(500).json({ error: "Failed to use template document" });
  }
};

// ============================================================================
// 4. DOWNLOAD TEMPLATE DOCUMENT
// ============================================================================
export const download_template_document = async (req, res) => {
  try {
    // 1. Verify User
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

    // 2. Extract Template ID
    const templateId = parseInt(req.params.id, 10);
    if (!templateId || isNaN(templateId)) {
      return res.status(400).json({ error: "Valid template ID is required" });
    }

    // 3. Find Template in Database
    const template = await prisma.document.findUnique({
      where: { id: templateId },
      include: { templateTags: true },
    });

    if (!template || template.type !== "file") {
      return res.status(404).json({ error: "Template not found" });
    }

    // 4. Security Check: Ensure this is actually a template file inside the tags directory
    if (!template.path.startsWith("/tags/")) {
      return res
        .status(403)
        .json({ error: "Forbidden: File is not a valid template" });
    }

    // 5. Locate File on Disk
    const fileName = basename(template.path);
    const originalFilePath = join(
      __dirname,
      STORAGE_PATH,
      template.path.substring(1),
    );

    try {
      await fs.access(originalFilePath);
    } catch {
      return res
        .status(404)
        .json({ message: "Template file not found in storage" });
    }

    // 6. Set appropriate Headers and Stream File
    const fileExtension = extname(fileName).slice(1).toLowerCase();

    // Basic MIME types, default to octet-stream for unknown
    const mimeTypes = {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      pdf: "application/pdf",
      txt: "text/plain",
      csv: "text/csv",
    };

    const contentType = mimeTypes[fileExtension] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    // Send the file back directly
    res.sendFile(originalFilePath);
  } catch (error) {
    console.error("Error downloading template:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during template download" });
  }
};

// GET /tags/:tagId/emails
export const get_tag_emails = async (req, res) => {
  try {
    const tagId = parseInt(req.params.tagId, 10);
    if (isNaN(tagId))
      return res.status(400).json({ error: "Valid tagId required" });

    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      include: { emailList: { orderBy: { createdAt: "asc" } } },
    });
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    return res.status(200).json({ emails: tag.emailList });
  } catch (err) {
    console.error("get_tag_emails error:", err);
    return res.status(500).json({ message: "Failed to fetch tag emails" });
  }
};

// POST /tags/:tagId/emails
export const add_tag_emails = async (req, res) => {
  try {
    let { emails } = req.body;
    const tagId = parseInt(req.params.tagId, 10);
    if (isNaN(tagId))
      return res.status(400).json({ error: "Valid tagId required" });

    if (!Array.isArray(emails) || emails.length === 0) {
      return res
        .status(400)
        .json({ error: "emails must be a non-empty array" });
    }

    // Normalize & validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    emails = [
      ...new Set(emails.map((e) => e?.trim()?.toLowerCase()).filter(Boolean)),
    ];
    const invalid = emails.filter((e) => !emailRegex.test(e));
    if (invalid.length > 0) {
      return res
        .status(400)
        .json({ error: `Invalid email(s): ${invalid.join(", ")}` });
    }

    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    const result = await prisma.tagEmail.createMany({
      data: emails.map((email) => ({ tagId, email })),
      skipDuplicates: true,
    });

    const updated = await prisma.tagEmail.findMany({
      where: { tagId },
      orderBy: { createdAt: "asc" },
    });

    return res.status(201).json({
      message: `${result.count} email(s) added`,
      emails: updated,
    });
  } catch (err) {
    console.error("add_tag_emails error:", err);
    return res.status(500).json({ message: "Failed to add tag emails" });
  }
};

// DELETE /tags/:tagId/emails/:emailId
export const delete_tag_email = async (req, res) => {
  try {
    const tagId = parseInt(req.params.tagId, 10);
    const emailId = parseInt(req.params.emailId, 10);
    if (isNaN(tagId) || isNaN(emailId)) {
      return res
        .status(400)
        .json({ error: "Valid tagId and emailId required" });
    }

    await prisma.tagEmail.delete({ where: { id: emailId } });
    return res.status(200).json({ message: "Email removed from tag" });
  } catch (err) {
    console.error("delete_tag_email error:", err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Email not found" });
    return res.status(500).json({ message: "Failed to delete tag email" });
  }
};

// GET /tags/:tagId/emails/list  — returns just email strings (used during process initiation)
export const get_tag_email_strings = async (req, res) => {
  try {
    const tagId = parseInt(req.params.tagId, 10);
    if (isNaN(tagId))
      return res.status(400).json({ error: "Valid tagId required" });

    const records = await prisma.tagEmail.findMany({
      where: { tagId },
      select: { email: true },
    });

    return res.status(200).json({ emails: records.map((r) => r.email) });
  } catch (err) {
    console.error("get_tag_email_strings error:", err);
    return res.status(500).json({ message: "Failed to fetch tag emails" });
  }
};

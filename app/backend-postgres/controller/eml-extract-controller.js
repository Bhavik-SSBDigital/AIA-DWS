import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs/promises";
import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../utility/verifyUser.js";
import { generateUniqueDocumentName } from "./process-controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient();

const STORAGE_PATH = process.env.STORAGE_PATH || "../storage";

export const extractEMLDetails = async (req, res) => {
  const accessToken =
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.headers["x-authorization"]?.substring(7);

  if (!accessToken) {
    return res.status(401).json({ message: "No authorization token provided" });
  }

  try {
    // Verify user
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { documentId, workflowId } = req.body;

    if (!documentId) {
      return res.status(400).json({ message: "documentId is required" });
    }

    // Get the EML document from database
    const emlDocument = await prisma.document.findUnique({
      where: { id: parseInt(documentId) },
    });

    if (!emlDocument) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Check if file is EML
    if (!["eml", "email", "msg"].includes(emlDocument.type?.toLowerCase())) {
      return res.status(400).json({ message: "Document is not an EML file" });
    }

    // Construct full path to EML file
    const emlFilePath = path.join(__dirname, STORAGE_PATH, emlDocument.path);

    // Check if file exists
    try {
      await fs.access(emlFilePath);
    } catch (error) {
      return res.status(404).json({ message: "EML file not found in storage" });
    }

    // Run the updated Python script (Case 2)
    const pythonScriptPath = path.join(
      __dirname,
      "../../support/eml_extractor.py",
    );

    const pythonProcess = spawn("python3", [pythonScriptPath, emlFilePath]);

    let output = "";
    let errorOutput = "";

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        console.error("Python script error:", errorOutput);
        // Check if there's valid output despite stderr warnings
        if (!output.trim()) {
          return res.status(500).json({
            message: "Error extracting EML details",
            error: errorOutput.substring(0, 500),
          });
        }
        // Continue if there's output despite warnings
      }

      try {
        let extractionResult;
        try {
          extractionResult = JSON.parse(output);
        } catch (parseError) {
          console.error("Failed to parse Python output:", output);
          return res.status(500).json({
            message: "Failed to parse extraction results",
            error: parseError.message,
          });
        }

        if (!extractionResult || !extractionResult.attachments) {
          console.error("Invalid extraction result:", extractionResult);
          return res.status(500).json({
            message: "Invalid extraction result from Python script",
            error: "No attachments field found",
          });
        }

        // Upload each attachment as separate document
        const uploadedDocumentIds = [];
        const attachmentsWithDocumentIds = [];

        for (const attachment of extractionResult.attachments) {
          console.log("attachment", attachment);
          try {
            // Decode base64 content
            const buffer = Buffer.from(attachment.base64_content, "base64");

            // Generate unique filename
            const filename = attachment.filename;
            const extension = filename.split(".").pop();

            const safeFilename = await generateUniqueDocumentName({
              workflowId,
              replacedDocId: null,
              extension,
            });

            console.log("safe file name", safeFilename);
            const newFilename = `${safeFilename}`;

            // Determine parent directory (same as EML file's directory)
            const emlDir = path.dirname(emlDocument.path);
            const newFilePath = path.join(emlDir, newFilename);
            const fullFilePath = path.join(
              __dirname,
              STORAGE_PATH,
              newFilePath,
            );

            // Ensure directory exists
            const dirPath = path.dirname(fullFilePath);
            await fs.mkdir(dirPath, { recursive: true });

            // Save attachment file
            await fs.writeFile(fullFilePath, buffer);

            // Determine file type from extension
            const fileExt = path
              .extname(attachment.filename)
              .toLowerCase()
              .replace(".", "");
            const fileType = fileExt || "bin";

            // Prepare tags array - include metadata as tags
            const tags = [
              `extracted-from-eml:${documentId}`,
              attachment.disposition === "inline"
                ? "inline-attachment"
                : "attachment",
            ];

            // Add email subject tag if available
            if (attachment.associated_email_subject) {
              const cleanSubject = attachment.associated_email_subject
                .substring(0, 50)
                .replace(/[^a-zA-Z0-9\s]/g, "");
              tags.push(`email-subject:${cleanSubject}`);
            }

            // Create document record
            const newDocument = await prisma.document.create({
              data: {
                name: newFilename,
                type: fileType,
                path: newFilePath,
                createdById: userData.id,
                isInvolvedInProcess: false,
                tags: tags,
                isRecord: true,
                parentId: parseInt(documentId),
              },
            });

            uploadedDocumentIds.push(newDocument.id);
            attachmentsWithDocumentIds.push({
              originalFilename: newFilename, // Only new filename, no original
              documentId: newDocument.id,
              emailSubject: attachment.associated_email_subject,
              emailFrom: attachment.associated_email_from,
              size: attachment.size,
              disposition: attachment.disposition,
              contentType: attachment.content_type,
            });

            console.log(
              `Created document ${newDocument.id} for attachment: ${newFilename}`,
            );
          } catch (attachmentError) {
            console.error(
              `Failed to process attachment ${attachment.filename}:`,
              attachmentError,
            );
            // Continue with other attachments
          }
        }

        // Update the emails array to reflect new filenames
        if (extractionResult.emails) {
          extractionResult.emails = extractionResult.emails.map((email) => {
            const emailCopy = { ...email };

            if (emailCopy.attachments && emailCopy.attachments.length > 0) {
              emailCopy.attachments = emailCopy.attachments.map(
                (attachment) => {
                  // Find matching attachment in our uploaded list
                  const uploadedAtt = attachmentsWithDocumentIds.find(
                    (att) =>
                      att.emailSubject === email.subject &&
                      att.emailFrom === email.from &&
                      att.size === attachment.size &&
                      att.contentType === attachment.content_type,
                  );

                  if (uploadedAtt) {
                    return {
                      ...attachment,
                      filename: uploadedAtt.filename, // Replace with new filename
                      documentId: uploadedAtt.documentId,
                    };
                  }
                  return attachment;
                },
              );
            }
            return emailCopy;
          });
        }

        // Update the main attachments array in extractionResult
        if (extractionResult.attachments) {
          extractionResult.attachments = extractionResult.attachments.map(
            (attachment, index) => {
              if (index < attachmentsWithDocumentIds.length) {
                const uploadedAtt = attachmentsWithDocumentIds[index];
                return {
                  ...attachment,
                  filename: uploadedAtt.filename, // Replace with new filename
                  documentId: uploadedAtt.documentId,
                };
              }
              return attachment;
            },
          );
        }

        // Build enhanced thread text with document IDs
        let enhancedThreadText = extractionResult.thread_text || "";

        // Helper function to format bytes
        const formatBytes = (bytes, decimals = 2) => {
          if (bytes === 0) return "0 Bytes";
          const k = 1024;
          const dm = decimals < 0 ? 0 : decimals;
          const sizes = ["Bytes", "KB", "MB", "GB"];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return (
            parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
          );
        };

        // Add comprehensive header at the beginning
        let summaryHeader = "=".repeat(80) + "\n";
        summaryHeader += "EML EXTRACTION SUMMARY\n";
        summaryHeader += "=".repeat(80) + "\n";
        summaryHeader += `Total Messages: ${extractionResult.summary?.total_messages || 1}\n`;
        summaryHeader += `Total Attachments: ${extractionResult.summary?.total_attachments || 0}\n`;
        summaryHeader += `Thread Roots: ${extractionResult.summary?.thread_roots || 1}\n`;
        summaryHeader += `Thread Branches: ${extractionResult.summary?.thread_branches || 1}\n`;

        // Add attachment mapping using new filenames
        if (attachmentsWithDocumentIds.length > 0) {
          summaryHeader += "\n" + "=".repeat(80) + "\n";
          summaryHeader += "EXTRACTED ATTACHMENTS\n";
          summaryHeader += "=".repeat(80) + "\n";
          attachmentsWithDocumentIds.forEach((att, index) => {
            summaryHeader += `${index + 1}. "${att.filename}"\n`;
            summaryHeader += `   Type: ${att.contentType}\n`;
            summaryHeader += `   Size: ${formatBytes(att.size)}\n`;
            summaryHeader += `   From Email: "${att.emailSubject}"\n`;
            summaryHeader += `   Sender: ${att.emailFrom}\n`;
            summaryHeader += `   Document ID: ${att.documentId}\n`;
            summaryHeader += `   Disposition: ${att.disposition}\n\n`;
          });
        }

        enhancedThreadText = summaryHeader + "\n\n" + enhancedThreadText;

        // Update the original document with tags to indicate it's been extracted
        try {
          await prisma.document.update({
            where: { id: parseInt(documentId) },
            data: {
              tags: {
                push: `eml-extracted:${new Date().toISOString().split("T")[0]}`,
              },
            },
          });
        } catch (updateError) {
          console.error(
            "Failed to update original document tags:",
            updateError,
          );
          // Not critical, continue
        }

        // Return comprehensive results
        res.status(200).json({
          success: true,
          message: `Extracted ${uploadedDocumentIds.length} attachment(s) from ${extractionResult.emails?.length || 1} message(s)`,
          data: {
            threadText: enhancedThreadText,
            extractedDocumentIds: uploadedDocumentIds,
            attachmentsMapping: attachmentsWithDocumentIds,
            emails: extractionResult.emails || [],
            threadTree: extractionResult.thread_tree || {},
            summary: extractionResult.summary || {},
            originalEmail: {
              subject: extractionResult.emails?.[0]?.subject || "No subject",
              from: extractionResult.emails?.[0]?.from || "Unknown sender",
              date: extractionResult.emails?.[0]?.date || "Unknown date",
              totalMessages: extractionResult.emails?.length || 1,
              totalAttachments: extractionResult.attachments?.length || 0,
            },
          },
        });
      } catch (parseError) {
        console.error("Parse error:", parseError);
        res.status(500).json({
          message: "Error parsing extraction results",
          error: parseError.message,
          rawOutput: output.substring(0, 1000), // For debugging
        });
      }
    });
  } catch (error) {
    console.error("EML extraction error:", error);
    res.status(500).json({
      message: "Internal server error during EML extraction",
      error: error.message,
    });
  }
};

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Add this to your Prisma schema if needed:
/*
model EmlExtractionRecord {
  id            Int      @id @default(autoincrement())
  createdAt     DateTime @default(now())
  originalDocumentId Int
  extractedByUserId Int
  totalMessages Int
  totalAttachments Int
  threadStructure Json
  extractionSummary Json
  
  originalDocument Document @relation(fields: [originalDocumentId], references: [id])
  extractedBy      User     @relation(fields: [extractedByUserId], references: [id])
}
*/

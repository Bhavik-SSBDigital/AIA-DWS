import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { transporter } from "../services/emailService.js";
import { verifyUser } from "../utility/verifyUser.js";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_PATH =
  process.env.STORAGE_PATH || path.join(__dirname, "../../storage");

import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ===================== EMAIL MANAGEMENT =====================

// Get list of email recipients (generic list) for a process
export const getEmailRecipients = async (req, res) => {
  try {
    const { processId } = req.params;
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      select: { emailRecipients: true, initiatorId: true },
    });

    if (!process) {
      return res.status(404).json({ message: "Process not found" });
    }

    // Only initiator can view/manage email recipients
    if (process.initiatorId !== userData.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({ emailRecipients: process.emailRecipients });
  } catch (error) {
    console.error("Error fetching email recipients:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Add email addresses to generic list
export const addEmailRecipients = async (req, res) => {
  try {
    const { processId } = req.params;
    const { emails } = req.body; // array of email strings
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: "Emails array required" });
    }

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      select: { emailRecipients: true, initiatorId: true },
    });

    if (!process) return res.status(404).json({ message: "Process not found" });
    if (process.initiatorId !== userData.id)
      return res.status(403).json({ message: "Forbidden" });

    const newRecipients = [...new Set([...process.emailRecipients, ...emails])];
    await prisma.processInstance.update({
      where: { id: processId },
      data: { emailRecipients: newRecipients },
    });

    return res.status(200).json({ emailRecipients: newRecipients });
  } catch (error) {
    console.error("Error adding email recipients:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getAllUniqueEmails = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // 1. Get emails from generic lists across all user's processes
    const processes = await prisma.processInstance.findMany({
      where: { initiatorId: userData.id },
      select: { emailRecipients: true },
    });

    // 2. Get emails from actual sent history across all user's processes
    const sentEmails = await prisma.processEmail.findMany({
      where: { process: { initiatorId: userData.id } },
      select: { recipientEmail: true },
    });

    // Use a Set to ensure uniqueness
    const emailSet = new Set();

    processes.forEach((p) => {
      if (p.emailRecipients && Array.isArray(p.emailRecipients)) {
        p.emailRecipients.forEach((email) => emailSet.add(email));
      }
    });

    sentEmails.forEach((se) => {
      if (se.recipientEmail) {
        emailSet.add(se.recipientEmail);
      }
    });

    return res.status(200).json({ uniqueEmails: Array.from(emailSet) });
  } catch (error) {
    console.error("Error fetching unique emails:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Remove email address from generic list
export const removeEmailRecipient = async (req, res) => {
  try {
    const { processId } = req.params;
    const { email } = req.body;
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      select: { emailRecipients: true, initiatorId: true },
    });

    if (!process) return res.status(404).json({ message: "Process not found" });
    if (process.initiatorId !== userData.id)
      return res.status(403).json({ message: "Forbidden" });

    const newRecipients = process.emailRecipients.filter((e) => e !== email);
    await prisma.processInstance.update({
      where: { id: processId },
      data: { emailRecipients: newRecipients },
    });

    return res.status(200).json({ emailRecipients: newRecipients });
  } catch (error) {
    console.error("Error removing email recipient:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Get list of sent emails for a process
export const getSentEmails = async (req, res) => {
  try {
    const { processId } = req.params;
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      select: { initiatorId: true },
    });
    if (!process) return res.status(404).json({ message: "Process not found" });
    if (process.initiatorId !== userData.id)
      return res.status(403).json({ message: "Forbidden" });

    const sentEmails = await prisma.processEmail.findMany({
      where: { processId },
      orderBy: { sentAt: "desc" },
    });

    return res.status(200).json({ sentEmails });
  } catch (error) {
    console.error("Error fetching sent emails:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Update this function in your emailController.js
export const sendManualEmail = async (req, res) => {
  try {
    const { processId } = req.params;
    const {
      recipientEmails, // The array of emails from the frontend
      subject,
      body,
      includeAttachments = true,
    } = req.body;

    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    if (
      !recipientEmails ||
      !Array.isArray(recipientEmails) ||
      recipientEmails.length === 0 ||
      !subject
    ) {
      return res.status(400).json({
        message: "A list of recipient emails and subject are required",
      });
    }

    // Fetch process with all needed data
    const processInstance = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        initiator: true,
        workflow: true,
        documents: { include: { document: true } },
      },
    });

    if (!processInstance)
      return res.status(404).json({ message: "Process not found" });
    if (processInstance.initiatorId !== userData.id)
      return res.status(403).json({ message: "Forbidden" });

    // Prepare attachments
    let attachments = [];
    let attachedDocsInfo = [];

    if (includeAttachments) {
      const processDocuments = processInstance.documents;
      const replacedDocIds = new Set(
        processDocuments
          .filter((pd) => pd.replacedDocumentId)
          .map((pd) => pd.replacedDocumentId),
      );
      const latestDocs = processDocuments.filter(
        (pd) => !replacedDocIds.has(pd.documentId),
      );

      for (const pd of latestDocs) {
        const filePath = path.join(__dirname, STORAGE_PATH, pd.document.path);
        if (fs.existsSync(filePath)) {
          attachments.push({ filename: pd.document.name, path: filePath });
          attachedDocsInfo.push({
            documentId: pd.documentId,
            fileName: pd.document.name,
          });
        }
      }
    }

    // Modern, styled HTML Email Template
    const emailBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          body { margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Arial, sans-serif; }
          .wrapper { width: 100%; background-color: #f8fafc; padding: 30px 10px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
          .header { background-color: #4f46e5; padding: 24px; color: #ffffff; text-align: center; }
          .header h2 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.5px; }
          .content { padding: 30px 24px; color: #334155; line-height: 1.6; }
          
          .message-box { background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; margin-bottom: 28px; border-radius: 0 6px 6px 0; }
          .message-title { font-size: 12px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
          .message-content { font-size: 15px; color: #1e40af; }
          
          .section-title { font-size: 16px; font-weight: 600; color: #0f172a; margin: 0 0 16px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; }
          
          .details-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
          .details-table th, .details-table td { padding: 10px 0; text-align: left; border-bottom: 1px solid #f8fafc; font-size: 14px; }
          .details-table th { width: 35%; color: #64748b; font-weight: 500; }
          .details-table td { color: #0f172a; font-weight: 600; }
          
          .tags-box { display: inline-block; background-color: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 4px; }
          
          .attachments-box { background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; }
          .attachments-title { font-size: 15px; font-weight: 600; color: #334155; margin: 0 0 12px 0; display: flex; align-items: center; }
          .attachment-item { font-size: 14px; color: #4f46e5; margin: 6px 0; padding-left: 14px; position: relative; }
          .attachment-item:before { content: "•"; position: absolute; left: 0; color: #94a3b8; }
          
          .footer { background-color: #f1f5f9; padding: 20px 24px; text-align: center; color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <h2>Process Documents & Update</h2>
            </div>
            <div class="content">
              
              ${
                body
                  ? `
              <div class="message-box">
                <div class="message-title">Additional Message</div>
                <div class="message-content">${body.replace(/\n/g, "<br/>")}</div>
              </div>`
                  : ""
              }

              <h3 class="section-title">Process Summary</h3>
              <table class="details-table">
                <tr><th>Process Name</th><td>${processInstance.name}</td></tr>
                <tr><th>Process ID</th><td><span style="font-family: monospace; color: #64748b;">${processInstance.id}</span></td></tr>
                <tr><th>Status</th><td>
                  <span style="color: ${processInstance.status === "COMPLETED" ? "#16a34a" : processInstance.status === "REJECTED" ? "#dc2626" : "#d97706"};">
                    ${processInstance.status}
                  </span>
                </td></tr>
                <tr><th>Completed At</th><td>${processInstance.updatedAt ? new Date(processInstance.updatedAt).toLocaleString() : "N/A"}</td></tr>
                <tr><th>Initiator</th><td>${processInstance.initiator.username}</td></tr>
                <tr><th>Description</th><td>${processInstance.description || "N/A"}</td></tr>
                ${
                  processInstance.tags && processInstance.tags.length > 0
                    ? `<tr><th>Tags</th><td>${processInstance.tags.map((tag) => `<span class="tags-box">${tag}</span>`).join("")}</td></tr>`
                    : ""
                }
                ${
                  processInstance.poNumbers &&
                  processInstance.poNumbers.length > 0
                    ? `<tr><th>PO Numbers</th><td>${processInstance.poNumbers.map((po) => `<span class="tags-box">${po}</span>`).join("")}</td></tr>`
                    : ""
                }
              </table>

              <div class="attachments-box">
                <h4 class="attachments-title">📎 Attached Documents</h4>
                ${
                  attachments.length > 0
                    ? attachments
                        .map(
                          (a) =>
                            `<div class="attachment-item">${a.filename}</div>`,
                        )
                        .join("")
                    : '<div style="font-size: 13px; color: #64748b;">No documents were attached to this email.</div>'
                }
              </div>
              
            </div>
            <div class="footer">
              This is an automated message generated by the Digital Workflow Solution.<br/>
              Please do not reply directly to this email.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Loop through the recipient array and send to each
    const successfulSends = [];
    const newUniqueRecipients = [];

    for (const email of recipientEmails) {
      try {
        const mailOptions = {
          from: `"Digital Workflow Solution" <${process.env.SMTP_FROM_EMAIL}>`,
          to: email,
          subject: subject,
          html: emailBody,
          attachments: attachments,
        };

        await transporter.sendMail(mailOptions);

        // Record success
        await prisma.processEmail.create({
          data: {
            processId,
            recipientEmail: email,
            subject,
            body: emailBody, // We save the full HTML in the DB for exact historical accuracy
            attachments: attachedDocsInfo,
            status: "SENT",
          },
        });
        successfulSends.push(email);
        newUniqueRecipients.push(email);
      } catch (err) {
        console.error(`Failed to send to ${email}:`, err);
        // Record failure
        await prisma.processEmail.create({
          data: {
            processId,
            recipientEmail: email,
            subject,
            body: emailBody,
            attachments: attachedDocsInfo, // Record what we TRIED to attach
            status: "FAILED",
          },
        });
      }
    }

    // Update the generic process list with any new emails so we have a record
    const currentRecipients = processInstance.emailRecipients || [];
    const combinedUnique = [
      ...new Set([...currentRecipients, ...newUniqueRecipients]),
    ];

    await prisma.processInstance.update({
      where: { id: processId },
      data: { emailRecipients: combinedUnique },
    });

    if (successfulSends.length === 0) {
      return res
        .status(500)
        .json({ message: "Failed to send to all recipients." });
    }

    return res.status(200).json({
      message: `Successfully sent to ${successfulSends.length} recipient(s).`,
    });
  } catch (error) {
    console.error("Error sending manual email:", error);
    return res.status(500).json({
      message: "Failed to process email request",
      error: error.message,
    });
  }
};

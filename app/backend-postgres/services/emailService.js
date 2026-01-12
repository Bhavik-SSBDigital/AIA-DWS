// services/emailService.js
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate secure tokens for public access
const generateAccessToken = (payload, expiresIn = "24h") => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// Decode token for verification
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Generate public URL for process viewing
const generatePublicProcessUrl = (processId, userId) => {
  const token = generateAccessToken({ processId, userId, type: "process" });
  return `${process.env.FRONTEND_URL}/public/process/${processId}?token=${token}`;
};

// Generate public URL for document viewing
const generatePublicDocumentUrl = (documentId, userId) => {
  const token = generateAccessToken({ documentId, userId, type: "document" });
  return `${process.env.FRONTEND_URL}/public/document/${documentId}?token=${token}`;
};

// Generate HTML email template with buttons
const generateEmailTemplate = (data) => {
  const {
    title,
    greeting,
    message,
    processDetails,
    documentDetails,
    actions = [],
    footerNote,
  } = data;

  // Action buttons HTML
  const actionButtons = actions
    .map(
      (action) => `
    <a href="${action.url}" 
       style="background-color: ${action.color || "#4CAF50"}; 
              border: none; 
              color: white; 
              padding: 12px 24px; 
              text-align: center; 
              text-decoration: none; 
              display: inline-block; 
              font-size: 14px; 
              margin: 4px 8px; 
              cursor: pointer; 
              border-radius: 4px;">
      ${action.text}
    </a>
  `
    )
    .join("");

  // Documents list HTML
  const documentsList =
    documentDetails
      ?.map(
        (doc) => `
    <li style="margin-bottom: 8px;">
      <strong>${doc.name}</strong>
      <a href="${doc.url}" 
         style="color: #0066cc; text-decoration: none; margin-left: 10px;">
        [View Document]
      </a>
    </li>
  `
      )
      .join("") || "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; }
        .content { padding: 20px 0; }
        .actions { margin: 20px 0; text-align: center; }
        .process-details, .documents-list { 
          background-color: #f8f9fa; 
          padding: 15px; 
          border-radius: 5px; 
          margin: 15px 0; 
        }
        .footer { 
          margin-top: 30px; 
          padding-top: 20px; 
          border-top: 1px solid #ddd; 
          font-size: 12px; 
          color: #666; 
        }
        .button { 
          display: inline-block; 
          padding: 10px 20px; 
          background-color: #007bff; 
          color: white; 
          text-decoration: none; 
          border-radius: 4px; 
          margin: 5px; 
        }
        .danger-button { background-color: #dc3545; }
        .success-button { background-color: #28a745; }
        .info-button { background-color: #17a2b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${title}</h1>
        </div>
        
        <div class="content">
          <p>${greeting}</p>
          
          <div class="message">
            ${message}
          </div>
          
          ${
            processDetails
              ? `
          <div class="process-details">
            <h3>Process Details:</h3>
            ${processDetails}
          </div>
          `
              : ""
          }
          
          ${
            documentsList
              ? `
          <div class="documents-list">
            <h3>Documents:</h3>
            <ul>${documentsList}</ul>
          </div>
          `
              : ""
          }
          
          ${
            actions.length > 0
              ? `
          <div class="actions">
            <h3>Quick Actions:</h3>
            ${actionButtons}
          </div>
          `
              : ""
          }
        </div>
        
        ${
          footerNote
            ? `
        <div class="footer">
          <p>${footerNote}</p>
          <p>This is an automated notification. Please do not reply to this email.</p>
        </div>
        `
            : ""
        }
      </div>
    </body>
    </html>
  `;
};

// Send email function
export const sendEmail = async (to, subject, templateData) => {
  try {
    const html = generateEmailTemplate(templateData);

    const mailOptions = {
      from: `"Process Management System" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text: templateData.text || subject, // Fallback text version
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

// Email templates for different events
export const emailTemplates = {
  // Step Assignment Email
  stepAssigned: async (process, stepInstance, documents, assignedUser) => {
    const processUrl = generatePublicProcessUrl(process.id, assignedUser.id);
    const documentUrls = await Promise.all(
      documents.map(async (doc) => ({
        name: doc.document?.name || "Document",
        url: generatePublicDocumentUrl(doc.documentId, assignedUser.id),
      }))
    );

    return {
      title: "New Process Step Assigned",
      greeting: `Hello ${assignedUser.name || assignedUser.username},`,
      message: `
        <p>You have been assigned a new task in the process workflow.</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Step:</strong> ${
          stepInstance.workflowStep?.stepName || "Unknown Step"
        }</p>
        <p><strong>Initiator:</strong> ${
          process.initiator?.username || "System"
        }</p>
        <p>Please review the documents and take necessary action.</p>
      `,
      processDetails: `
        <p><strong>Process ID:</strong> ${process.id}</p>
        <p><strong>Description:</strong> ${process.description || "N/A"}</p>
        <p><strong>Created:</strong> ${new Date(
          process.createdAt
        ).toLocaleDateString()}</p>
      `,
      documentDetails: documentUrls,
      actions: [
        {
          text: "View Process",
          url: processUrl,
          color: "#007bff",
        },
        {
          text: "Claim Step",
          url: `${process.env.FRONTEND_URL}/processes/claim/${stepInstance.id}`,
          color: "#28a745",
        },
      ],
      footerNote:
        "This step requires your attention. Please complete it before the deadline.",
    };
  },

  // Step Completed/Approved Email
  stepCompleted: async (
    process,
    stepInstance,
    completedByUser,
    nextAssignee
  ) => {
    return {
      title: "Process Step Completed",
      greeting: `Hello ${
        nextAssignee?.name || nextAssignee?.username || "Team"
      },`,
      message: `
        <p>A step in the process has been completed.</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Step:</strong> ${
          stepInstance.workflowStep?.stepName || "Unknown Step"
        }</p>
        <p><strong>Completed by:</strong> ${completedByUser.username}</p>
        ${
          nextAssignee
            ? `
          <p><strong>Next assignee:</strong> ${nextAssignee.username}</p>
        `
            : ""
        }
      `,
      processDetails: `
        <p><strong>Process ID:</strong> ${process.id}</p>
        <p><strong>Current Status:</strong> ${process.status}</p>
      `,
      actions: nextAssignee
        ? [
            {
              text: "View Process",
              url: generatePublicProcessUrl(process.id, nextAssignee.id),
              color: "#007bff",
            },
          ]
        : [],
      footerNote: "The process is moving forward in the workflow.",
    };
  },

  // Query/Rejection Email
  queryRaised: async (process, query, raisedByUser, assignedToUser) => {
    const processUrl = generatePublicProcessUrl(process.id, assignedToUser.id);

    return {
      title: "Query Raised on Process",
      greeting: `Hello ${assignedToUser.name || assignedToUser.username},`,
      message: `
        <p>A query has been raised regarding the process.</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Query:</strong> ${query.queryText}</p>
        <p><strong>Raised by:</strong> ${raisedByUser.username}</p>
        <p><strong>Raised at:</strong> ${new Date(
          query.createdAt
        ).toLocaleString()}</p>
      `,
      processDetails: `
        <p><strong>Process ID:</strong> ${process.id}</p>
        <p><strong>Description:</strong> ${process.description || "N/A"}</p>
      `,
      actions: [
        {
          text: "View Query",
          url: processUrl,
          color: "#007bff",
        },
        {
          text: "Respond to Query",
          url: `${process.env.FRONTEND_URL}/queries/respond/${query.id}`,
          color: "#17a2b8",
        },
      ],
      footerNote: "Please respond to this query promptly.",
    };
  },

  // Recommendation Request Email
  recommendationRequested: async (
    process,
    recommendation,
    requesterUser,
    recommenderUser
  ) => {
    return {
      title: "Recommendation Requested",
      greeting: `Hello ${recommenderUser.name || recommenderUser.username},`,
      message: `
        <p>You have been requested to provide a recommendation.</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Requested by:</strong> ${requesterUser.username}</p>
        <p><strong>Recommendation:</strong> ${recommendation.recommendationText}</p>
      `,
      processDetails: `
        <p><strong>Process ID:</strong> ${process.id}</p>
        <p><strong>Process Name:</strong> ${process.name}</p>
      `,
      actions: [
        {
          text: "View Recommendation",
          url: `${process.env.FRONTEND_URL}/recommendations/${recommendation.id}`,
          color: "#007bff",
        },
        {
          text: "Provide Recommendation",
          url: `${process.env.FRONTEND_URL}/recommendations/respond/${recommendation.id}`,
          color: "#28a745",
        },
      ],
      footerNote: "Your expert opinion is requested for this process.",
    };
  },

  // Document Signed Email
  documentSigned: async (process, document, signedByUser, documentSigners) => {
    const documentUrl = generatePublicDocumentUrl(document.id, signedByUser.id);

    return {
      title: "Document Signed",
      greeting: "Hello Team,",
      message: `
        <p>A document has been signed in the process.</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Document:</strong> ${document.name}</p>
        <p><strong>Signed by:</strong> ${signedByUser.username}</p>
        <p><strong>Signed at:</strong> ${new Date().toLocaleString()}</p>
        ${
          documentSigners.length > 0
            ? `
          <p><strong>All signers:</strong> ${documentSigners
            .map((s) => s.username)
            .join(", ")}</p>
        `
            : ""
        }
      `,
      documentDetails: [{ name: document.name, url: documentUrl }],
      footerNote: "The document has been successfully signed.",
    };
  },

  // Process Completed Email
  processCompleted: async (process, initiator) => {
    return {
      title: "Process Completed Successfully",
      greeting: `Hello ${initiator.name || initiator.username},`,
      message: `
        <p>Your process has been completed successfully!</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Completed at:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Status:</strong> ${process.status}</p>
      `,
      processDetails: `
        <p><strong>Process ID:</strong> ${process.id}</p>
        <p><strong>Description:</strong> ${process.description || "N/A"}</p>
        <p><strong>Total Steps:</strong> ${process.steps?.length || "N/A"}</p>
      `,
      actions: [
        {
          text: "View Process",
          url: generatePublicProcessUrl(process.id, initiator.id),
          color: "#007bff",
        },
        {
          text: "Download Documents",
          url: `${process.env.FRONTEND_URL}/processes/${process.id}/export`,
          color: "#28a745",
        },
      ],
      footerNote: "All steps have been completed and documents are ready.",
    };
  },

  // Re-open Process Email
  processReopened: async (process, reopenedByUser, reason) => {
    return {
      title: "Process Reopened",
      greeting: "Hello Team,",
      message: `
        <p>The process has been reopened.</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Reopened by:</strong> ${reopenedByUser.username}</p>
        <p><strong>Reason:</strong> ${reason || "N/A"}</p>
        <p><strong>Reopened at:</strong> ${new Date().toLocaleString()}</p>
      `,
      processDetails: `
        <p><strong>Process ID:</strong> ${process.id}</p>
        <p><strong>New Reopen Cycle:</strong> ${process.reopenCycle}</p>
      `,
      footerNote:
        "Please review the updated documents and take necessary action.",
    };
  },
};

// Main function to send notifications
export const sendProcessNotification = async (eventType, data) => {
  try {
    const template = emailTemplates[eventType];
    if (!template) {
      throw new Error(`No template found for event type: ${eventType}`);
    }

    // Get template data
    const templateData = await template(...data.params);

    // Get all recipients
    const recipients = await getRecipientsForEvent(eventType, data);

    console.log("recipients", recipients);

    // Send emails to all recipients
    const emailPromises = recipients.map(async (recipient) => {
      if (recipient.email) {
        return sendEmail(recipient.email, templateData.title, {
          ...templateData,
          greeting: `Hello ${recipient.name || recipient.username},`,
        });
      }
    });

    await Promise.all(emailPromises);
    console.log("successfully sent notification");
    return { success: true, recipients: recipients.length };
  } catch (error) {
    console.error(`Error sending ${eventType} notification:`, error);
    throw error;
  }
};

// Get recipients based on event type
const getRecipientsForEvent = async (eventType, data) => {
  console.log("event type", eventType);
  console.log("data", data);
  const recipients = new Set();

  switch (eventType) {
    case "stepAssigned":
      if (data.assignedUser) {
        recipients.add(data.assignedUser);
      }
      break;

    case "stepCompleted":
      // Send to next assignee and process initiator
      if (data.nextAssignee) {
        recipients.add(data.nextAssignee);
      }
      if (data.process?.initiator) {
        const initiator = await prisma.user.findUnique({
          where: { id: data.process.initiatorId },
          select: { id: true, email: true, username: true, name: true },
        });
        if (initiator) recipients.add(initiator);
      }
      break;

    case "queryRaised":
      if (data.assignedToUser) {
        recipients.add(data.assignedToUser);
      }
      if (data.process?.initiator) {
        const initiator = await prisma.user.findUnique({
          where: { id: data.process.initiatorId },
          select: { id: true, email: true, username: true, name: true },
        });
        if (initiator) recipients.add(initiator);
      }
      break;

    case "recommendationRequested":
      if (data.recommenderUser) {
        recipients.add(data.recommenderUser);
      }
      break;

    case "processCompleted":
      if (data.initiator) {
        recipients.add(data.initiator);
      }
      // Also notify all participants
      const participants = await prisma.processStepInstance.findMany({
        where: { processId: data.process.id },
        distinct: ["assignedTo"],
        include: {
          assignedToUser: {
            select: { id: true, email: true, username: true, name: true },
          },
        },
      });

      participants.forEach((p) => {
        if (p.assignedToUser && p.assignedToUser.id !== data.initiator.id) {
          recipients.add(p.assignedToUser);
        }
      });
      break;

    default:
      break;
  }

  return Array.from(recipients);
};

export default {
  sendEmail,
  sendProcessNotification,
  emailTemplates,
  verifyAccessToken,
  generatePublicProcessUrl,
  generatePublicDocumentUrl,
};

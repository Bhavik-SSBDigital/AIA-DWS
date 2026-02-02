// services/emailService.js
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const { env } = process;

const prisma = new PrismaClient();

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: parseInt(env.SMTP_PORT || "587"),
  secure: false,
  requireTLS: false,
  ignoreTLS: true,
  connectionTimeout: 10000,
  socketTimeout: 15000,
});

// Generate auto-login token with short expiration
const generateAutoLoginToken = (
  userId,
  resourceType,
  resourceId,
  processId,
) => {
  return jwt.sign(
    {
      userId,
      resourceType,
      resourceId,
      processId,
      type: "auto-login",
      timestamp: Date.now(), // To prevent replay attacks
    },
    env.SECRET_ACCESS_KEY,
    { expiresIn: "24h" },
  );
};

const generateAutoLoginProcessUrl = (processId, userId) => {
  const token = generateAutoLoginToken(userId, "process", processId);
  return `${env.FRONTEND_URL}/auth/auto-login?token=${token}&redirect=/process/${processId}`;
};

// In emailService.js, update the generateAutoLoginDocumentUrl function:
// In emailService.js, update the generateAutoLoginDocumentUrl function
// In emailService.js, update the generateAutoLoginDocumentUrl function
const generateAutoLoginDocumentUrl = (documentId, userId, processId) => {
  const token = generateAutoLoginToken(
    userId,
    "document",
    documentId,
    processId,
  );
  // Add the autoOpenDoc parameter to the process URL
  return `${env.FRONTEND_URL}/auth/auto-login?token=${token}&redirect=/processes/view/${processId}?autoOpenDoc=${documentId}`;
};

const generateOneTimeToken = (userId, resourceType, resourceId) => {
  const oneTimeToken = jwt.sign(
    {
      userId,
      resourceType,
      resourceId,
      type: "one-time",
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2), // Random nonce
    },
    env.SECRET_ACCESS_KEY,
  );

  // Store token in database to prevent reuse
  return oneTimeToken;
};

// Generate secure tokens for public access
const generateAccessToken = (payload, expiresIn = "24h") => {
  return jwt.sign(payload, env.SECRET_ACCESS_KEY, { expiresIn });
};

// Decode token for verification
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.SECRET_ACCESS_KEY);
  } catch (error) {
    return null;
  }
};

// Generate public URL for process viewing
const generatePublicProcessUrl = (processId, userId) => {
  const token = generateAccessToken({ processId, userId, type: "process" });
  return `${env.FRONTEND_URL}/public/process/${processId}?token=${token}`;
};

// Generate public URL for document viewing
const generatePublicDocumentUrl = (documentId, userId, processId) => {
  const token = generateAccessToken({ documentId, userId, type: "document" });
  return `${env.FRONTEND_URL}/process/view/${processId}?autoOpenDoc=${documentId}&token=${token}
`;
};

// Generate HTML email template with buttons
const generateEmailTemplate = (data) => {
  const {
    title,
    greeting,
    message,
    processDetails,
    timelineDetails,
    quickAccessLinks,
    closingMessage,
    text,
  } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0;
          padding: 0;
        }
        .container { 
          max-width: 700px; 
          margin: 0 auto; 
          padding: 30px; 
          background-color: #ffffff;
        }
        .header { 
          text-align: center;
          border-bottom: 2px solid #007bff;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .content { 
          padding: 20px 0; 
        }
        .section { 
          margin: 25px 0; 
          padding: 20px;
          background-color: #f9f9f9;
          border-radius: 8px;
          border-left: 4px solid #007bff;
        }
        .links-section {
          background-color: #e8f4ff;
          border-left: 4px solid #0056b3;
        }
        h1 { 
          color: #0056b3; 
          font-size: 24px;
          margin: 0;
        }
        h2 {
          color: #333;
          font-size: 18px;
          margin-top: 0;
          margin-bottom: 15px;
        }
        p {
          margin: 10px 0;
          color: #444;
        }
        ul {
          margin: 10px 0;
          padding-left: 20px;
        }
        li {
          margin: 8px 0;
          color: #555;
        }
        a {
          color: #007bff;
          text-decoration: none;
          font-weight: 500;
        }
        a:hover {
          text-decoration: underline;
          color: #0056b3;
        }
        .footer { 
          margin-top: 40px; 
          padding-top: 20px; 
          border-top: 1px solid #ddd; 
          font-size: 12px; 
          color: #666;
          text-align: center;
        }
        .signature {
          margin-top: 30px;
          font-style: italic;
          color: #555;
        }
        .highlight {
          background-color: #fff3cd;
          padding: 10px;
          border-radius: 4px;
          border: 1px solid #ffeaa7;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${title}</h1>
        </div>
        
        <div class="content">
          <p><strong>${greeting}</strong></p>
          
          ${message}
          
          ${processDetails ? `<div class="section">${processDetails}</div>` : ""}
          
          ${timelineDetails ? `<div class="section">${timelineDetails}</div>` : ""}
          
          ${quickAccessLinks ? `<div class="section links-section">${quickAccessLinks}</div>` : ""}
          
          <div class="highlight">
            <p><strong>Note:</strong> Clicking on the links above will automatically log you into the system and take you directly to the process.</p>
          </div>
          
          ${closingMessage}
        </div>
        
        <div class="footer">
          <p>This is an automated notification from the Process Management System.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send email function
// Send email function
export const sendEmail = async (to, subject, templateData) => {
  try {
    const html = generateEmailTemplate(templateData);

    const mailOptions = {
      from: `"${env.EMAIL_FROM_NAME || "Process Management System"}" <${env.SMTP_FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: templateData.text || subject, // Use the provided text version
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

// In your stepAssigned function, add this query to get lastApprovedBy
const getLastApprovedBy = async (
  processId,
  currentStepInstanceId,
  initiatorId,
) => {
  try {
    // 1️⃣ First: check if CURRENT step itself is approved
    const currentApprovedStep = currentStepInstanceId
      ? await prisma.processStepInstance.findFirst({
          where: {
            id: currentStepInstanceId,
            processId,
            status: "APPROVED",
            assignedTo: { not: initiatorId },
          },
          include: {
            workflowStep: {
              select: { stepType: true },
            },
            pickedBy: {
              select: { name: true, username: true },
            },
          },
        })
      : null;

    if (
      currentApprovedStep &&
      currentApprovedStep.workflowStep?.stepType === "APPROVAL"
    ) {
      return (
        currentApprovedStep.pickedBy?.name ||
        currentApprovedStep.pickedBy?.username ||
        "None"
      );
    }

    // 2️⃣ Fallback: find PREVIOUS approved step
    const lastApprovedStep = await prisma.processStepInstance.findFirst({
      where: {
        processId,
        status: "APPROVED",
        id: { not: currentStepInstanceId },
        assignedTo: { not: initiatorId },
      },
      include: {
        workflowStep: {
          select: { stepType: true },
        },
        pickedBy: {
          select: { name: true, username: true },
        },
      },
      orderBy: {
        decisionAt: "desc",
      },
    });

    if (
      !lastApprovedStep ||
      lastApprovedStep.workflowStep?.stepType !== "APPROVAL"
    ) {
      return "None";
    }

    if (lastApprovedStep.pickedBy) {
      return (
        lastApprovedStep.pickedBy.name ||
        lastApprovedStep.pickedBy.username ||
        "None"
      );
    }

    // 3️⃣ Absolute fallback: assignedTo user
    if (lastApprovedStep.assignedTo) {
      const user = await prisma.user.findUnique({
        where: { id: lastApprovedStep.assignedTo },
        select: { name: true, username: true },
      });

      return user?.name || user?.username || "None";
    }

    return "None";
  } catch (error) {
    console.error("Error fetching last approved by:", error);
    return "None";
  }
};

// Email templates for different events
export const emailTemplates = {
  // Step Assignment Email
  // In emailService.js, update stepAssigned template generation
  stepAssigned: async (process, stepInstance, documents, assignedUser) => {
    console.log("assigned user", assignedUser);
    console.log("process", process);

    const processUrl = generateAutoLoginProcessUrl(
      process.id,
      assignedUser?.id || process.initiator.id,
    );

    // Generate document links for each document - FIXED

    // Get last approved user
    const lastStep = process.steps?.find(
      (step) => step.status === "COMPLETED" && step.actionType === "APPROVAL",
    );

    const lastApprovedBy = await getLastApprovedBy(
      process.id,
      stepInstance.id,
      process.initiatorId,
    );

    return {
      title: `Request for Workflow Approval – Process ${process.name}`,
      greeting: `Dear Sir,`,
      message: `
      <p>I would like to request your recommendation and review for the following process, which is currently in progress.</p>
    `,
      processDetails: `
      <p><strong>Process Details:</strong></p>
      <ul style="list-style-type: none; padding-left: 0; margin: 10px 0;">
        <li style="margin-bottom: 8px; padding-left: 20px; position: relative;">
          <span style="position: absolute; left: 0;">•</span>
          <strong>Process Name:</strong> ${process.name}
        </li>
        <li style="margin-bottom: 8px; padding-left: 20px; position: relative;">
          <span style="position: absolute; left: 0;">•</span>
          <strong>Initiator Name:</strong> ${process.initiator.username || "Unknown"}
        </li>
        <li style="margin-bottom: 8px; padding-left: 20px; position: relative;">
          <span style="position: absolute; left: 0;">•</span>
          <strong>Last Approved By:</strong> ${lastApprovedBy}
        </li>
      </ul>
    `,
      quickAccessLinks: `
      <div style="margin: 20px 0; padding: 15px; background-color: #f0f8ff; border-left: 4px solid #007bff;">
        <p style="margin-top: 0;"><strong>Quick Access Links:</strong></p>
        <div style="margin: 10px 0;">
          <a href="${processUrl}" 
             style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 5px 10px 5px 0; font-weight: 500;">
            📋 View Process
          </a>
        </div>
      </div>
    `,
      closingMessage: `
      <p style="margin-top: 20px;">You may use the above links to directly access the process and review the associated documents.  </p>
      <p style="margin-top: 30px; font-style: italic;">Warm regards,<br/>
      <strong>${process.initiator.username || "Initiator"}</strong></p>
    `,
      text: `Dear Sir,

I hope this email finds you well.

I would like to request your recommendation and review for the following process, which is currently in progress. The complete details are provided below for your reference.

Process Details:
• Process ID: ${process.id}
• Process Name: ${process.name}
• Process Version: ${process.issueNo || "N/A"}
• Description: ${process.description || "N/A"}
• Initiator Name: ${process.initiator.username || "Unknown"}
• Current Status: ${process.status}
• Last Approved By: ${lastApprovedBy}

Timeline Information:
• Created At: ${new Date(process.createdAt).toLocaleDateString("en-GB")}, ${new Date(process.createdAt).toLocaleTimeString()}
• Last Updated At: ${process.updatedAt ? `${new Date(process.updatedAt).toLocaleDateString("en-GB")}, ${new Date(process.updatedAt).toLocaleTimeString()}` : "N/A"}
• Completed At: ${process.completedAt ? `${new Date(process.completedAt).toLocaleDateString("en-GB")}, ${new Date(process.completedAt).toLocaleTimeString()}` : "N/A"}

Quick Access Links:
• View Process: ${processUrl}

You may use the above links to directly access the process and review the associated documents. Kindly let me know if any additional information or clarification is required from my end.

I would appreciate your guidance and recommendation to proceed further.

Thank you for your time and support.

Warm regards,
${process.initiator.username || "Initiator"}`,
    };
  },

  // Step Completed/Approved Email
  stepCompleted: async (
    process,
    stepInstance,
    completedByUser,
    nextAssignee,
  ) => {
    return {
      title: "Process Step Completed",
      greeting: `Dear Sir`,
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
      greeting: `Dear Sir`,
      message: `
        <p>A query has been raised regarding the process.</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Query:</strong> ${query.queryText}</p>
        <p><strong>Raised by:</strong> ${raisedByUser.username}</p>
        <p><strong>Raised at:</strong> ${new Date(
          query.createdAt,
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
          url: `${env.FRONTEND_URL}/queries/respond/${query.id}`,
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
    recommenderUser,
  ) => {
    return {
      title: "Recommendation Requested",
      greeting: `Dear Sir`,
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
          url: `${env.FRONTEND_URL}/recommendations/${recommendation.id}`,
          color: "#007bff",
        },
        {
          text: "Provide Recommendation",
          url: `${env.FRONTEND_URL}/recommendations/respond/${recommendation.id}`,
          color: "#28a745",
        },
      ],
      footerNote: "Your expert opinion is requested for this process.",
    };
  },

  // Document Signed Email
  documentSigned: async (process, document, signedByUser, documentSigners) => {
    const documentUrl = generatePublicDocumentUrl(
      document.id,
      signedByUser.id,
      process.id,
    );

    return {
      title: "Document Signed",
      greeting: "Dear Sir,",
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
      greeting: `Dear Sir`,
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
          url: `${env.FRONTEND_URL}/processes/${process.id}/export`,
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
      greeting: "Dear Sir,",
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

    const templateData = await template(...data.params);
    const recipients = await getRecipientsForEvent(eventType, data);

    const emailPromises = recipients.map(async (recipient) => {
      if (recipient.email) {
        // Generate a personalized one-time token for each recipient
        let personalizedTemplate = { ...templateData };

        // Replace URLs with personalized ones
        personalizedTemplate.actions = personalizedTemplate.actions?.map(
          (action) => {
            if (action.url.includes("/auth/auto-login")) {
              // Extract original parameters and generate new token
              const urlObj = new URL(action.url);
              const token = urlObj.searchParams.get("token");
              if (token) {
                try {
                  const decoded = jwt.verify(token, env.SECRET_ACCESS_KEY);
                  const newToken = generateAutoLoginToken(
                    recipient.id,
                    decoded.resourceType,
                    decoded.resourceId,
                  );
                  action.url = `${env.FRONTEND_URL}/auth/auto-login?token=${newToken}&redirect=${urlObj.searchParams.get("redirect")}`;
                } catch (error) {
                  console.error("Error regenerating token:", error);
                }
              }
            }
            return action;
          },
        );

        return sendEmail(recipient.email, templateData.title, {
          ...personalizedTemplate,
          greeting: `Dear Sir,`,
        });
      }
    });

    await Promise.all(emailPromises);
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

  // Extract params safely
  const params = data?.params || [];

  switch (eventType) {
    case "stepAssigned": {
      // params: [process, stepInstance, documents, assignedUser]
      const [, , , assignedUser] = params;

      if (assignedUser) {
        recipients.add(assignedUser);
      }
      break;
    }

    case "stepCompleted": {
      // params: [process, stepInstance, completedByUser, nextAssignee]
      const [process, , , nextAssignee] = params;

      if (nextAssignee) {
        recipients.add(nextAssignee);
      }

      if (process?.initiatorId) {
        const initiator = await prisma.user.findUnique({
          where: { id: process.initiatorId },
          select: { id: true, email: true, username: true, name: true },
        });
        if (initiator) recipients.add(initiator);
      }
      break;
    }

    case "queryRaised": {
      // params: [process, query, raisedByUser, assignedToUser]
      const [process, , , assignedToUser] = params;

      if (assignedToUser) {
        recipients.add(assignedToUser);
      }

      if (process?.initiatorId) {
        const initiator = await prisma.user.findUnique({
          where: { id: process.initiatorId },
          select: { id: true, email: true, username: true, name: true },
        });
        if (initiator) recipients.add(initiator);
      }
      break;
    }

    case "recommendationRequested": {
      // params: [process, recommendation, requesterUser, recommenderUser]
      const [, , , recommenderUser] = params;

      if (recommenderUser) {
        recipients.add(recommenderUser);
      }
      break;
    }

    case "processCompleted": {
      // params: [process, initiator]
      const [process, initiator] = params;

      if (initiator) {
        recipients.add(initiator);
      }

      // Notify all unique participants
      let participants = await prisma.processStepInstance.findMany({
        where: { processId: process.id },
        distinct: ["assignedTo"],
        select: {
          assignedTo: true,
        },
      });

      participants = await Promise.all(
        participants.map(async (p) => {
          if (p.assignedTo) {
            const user = await prisma.user.findUnique({
              where: { id: p.assignedTo },
              select: { id: true, email: true, username: true, name: true },
            });
            return user;
          }
          return null;
        }),
      );
      participants.forEach((p) => {
        if (p.assignedTo && (!initiator || p.assignedTo.id !== initiator.id)) {
          recipients.add(p.assignedTo);
        }
      });
      break;
    }

    default:
      break;
  }

  const result = Array.from(recipients);
  console.log("resolved recipients", result);

  return result;
};

export default {
  sendEmail,
  sendProcessNotification,
  emailTemplates,
  verifyAccessToken,
  generatePublicProcessUrl,
  generatePublicDocumentUrl,
};

import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const { env } = process;

const prisma = new PrismaClient();

// Configure email transporter

//const transporter = nodemailer.createTransport({
// host: process.env.SMTP_HOST,
// port: 25,
// secure: false,
// ignoreTLS: true,
//});

console.log("smtp host", process.env.SMTP_HOST);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "25"),
  secure: false, // true for 465, false for other ports
  // auth: {
  //   user: process.env.SMTP_USER,
  //   pass: process.env.SMTP_PASSWORD,
  // },
  // Recommended: Increase timeout for corporate SMTP servers
  connectionTimeout: 10000, // 10 seconds
  socketTimeout: 15000, // 15 seconds
  // Optional: For debugging
  // logger: true,
  // debug: true
});

const formatTags = (tags) => {
  if (!tags || tags.length === 0) return "<p>No tags</p>";
  return `<ul style="list-style-type: none; padding-left: 0; margin: 10px 0;">${tags.map((tag) => `<li style="display: inline-block; background-color: #e9ecef; border-radius: 16px; padding: 4px 12px; margin: 4px; font-size: 13px;">${tag}</li>`).join("")}</ul>`;
};

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
          <p>This is an automated notification from the Digital Workflow Solution.</p>
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
      from: `"Digital Workflow Solution" <${env.SMTP_FROM_EMAIL}>`,
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
    // 2️⃣ Fallback: find PREVIOUS approved step
    const lastApprovedStep = await prisma.processStepInstance.findFirst({
      where: {
        processId,
        status: "APPROVED",
        id: currentStepInstanceId,
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

    if (lastApprovedStep.pickedById === initiatorId) {
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

  userCreated: (user, plainPassword) => {
    const loginUrl = `${process.env.FRONTEND_URL}/login`;
    return {
      title: "Account Successfully Created",
      greeting: `Hello ${user.username},`,
      message: `
        <p>Your account has been successfully created. Below are your login credentials:</p>
        <div style="background-color: #ffffff; padding: 15px; border-radius: 4px; margin: 15px 0; border: 1px solid #ddd;">
          <p><strong>Username:</strong> ${user.username}</p>
          <p><strong>Password:</strong> ${plainPassword}</p>
        </div>
        <p><strong style="color: #e74c3c;">Important:</strong> Please change your password after your first login.</p>
      `,
      quickAccessLinks: `
        <div style="margin: 20px 0;">
          <a href="${loginUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go to Login</a>
        </div>
      `,
      closingMessage: `
        <p>If you didn't request this account, please contact our support team immediately.</p>
        <p>Best regards,<br>${process.env.EMAIL_COMPANY_NAME || "AIA DWS Team"}</p>
      `,
      text: `Hello ${user.username},

Your account has been successfully created. Here are your login credentials:

Username: ${user.username}
Password: ${plainPassword}

Important: Please change your password after your first login.

Login URL: ${loginUrl}

If you didn't request this account, please contact our support team immediately.

Best regards,
${process.env.EMAIL_COMPANY_NAME || "AIA DWS Team"}`,
    };
  },

  passwordReset: (user, newPlainPassword) => {
    const loginUrl = `${process.env.FRONTEND_URL}/login`;
    return {
      title: "Password Reset Successful",
      greeting: `Hello ${user.username},`,
      message: `
        <p>Your password has been reset successfully. Below is your new login credentials:</p>
        <div style="background-color: #ffffff; padding: 15px; border-radius: 4px; margin: 15px 0; border: 1px solid #ddd;">
          <p><strong>Username:</strong> ${user.username}</p>
          <p><strong>Password:</strong> ${newPlainPassword}</p>
        </div>
        <p><strong style="color: #e74c3c;">Important:</strong> For security reasons, please change this password immediately after logging in.</p>
      `,
      quickAccessLinks: `
        <div style="margin: 20px 0;">
          <a href="${loginUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go to Login</a>
        </div>
      `,
      closingMessage: `
        <p>If you did not request this password reset, please contact our support team immediately.</p>
        <p>Best regards,<br>${process.env.EMAIL_COMPANY_NAME || "AIA DWS Team"}</p>
      `,
      text: `Hello ${user.username},

Your password has been reset successfully. Here is your new login credentials:

Username: ${user.username}
Password: ${newPlainPassword}

Important: For security reasons, please change this password immediately after logging in.

Login URL: ${loginUrl}

If you did not request this password reset, please contact our support team immediately.

Best regards,
${process.env.EMAIL_COMPANY_NAME || "AIA DWS Team"}`,
    };
  },
  stepAssigned: async (
    process,
    stepInstance,
    documents,
    assignedUser,
    processDescription,
    tags,
  ) => {
    const processUrl = generateAutoLoginProcessUrl(
      process.id,
      assignedUser?.id || process.initiator.id,
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
            <strong>Description:</strong> ${processDescription || "N/A"}
          </li>
          <li style="margin-bottom: 8px; padding-left: 20px; position: relative;">
            <span style="position: absolute; left: 0;">•</span>
            <strong>Initiator Name:</strong> ${process.initiator.username || "Unknown"}
          </li>
          <li style="margin-bottom: 8px; padding-left: 20px; position: relative;">
            <span style="position: absolute; left: 0;">•</span>
            <strong>Last Approved By:</strong> ${lastApprovedBy}
          </li>
          <li style="margin-bottom: 8px; padding-left: 20px; position: relative;">
            <span style="position: absolute; left: 0;">•</span>
            <strong>Tags:</strong> ${formatTags(tags)}
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
        <p style="margin-top: 20px;">You may use the above links to directly access the process and review the associated documents.</p>
        <p style="margin-top: 30px; font-style: italic;">Warm regards,<br/>
        <strong>${process.initiator.username || "Initiator"}</strong></p>
      `,
      text: `Dear Sir,

I would like to request your recommendation and review for the following process, which is currently in progress.

Process Details:
• Process Name: ${process.name}
• Description: ${processDescription || "N/A"}
• Initiator Name: ${process.initiator.username || "Unknown"}
• Last Approved By: ${lastApprovedBy}
• Tags: ${tags?.join(", ") || "None"}

Quick Access Links:
• View Process: ${processUrl}

Warm regards,
${process.initiator.username || "Initiator"}`,
    };
  },

  queryRaisedToInitiator: async (
    process,
    query,
    raisedByUser,
    initiator,
    processDescription,
    tags,
  ) => {
    const processUrl = generateAutoLoginProcessUrl(process.id, initiator.id);
    return {
      title: `Query Raised on Process ${process.name}`,
      greeting: `Dear ${initiator.username},`,
      message: `
        <p>A query has been raised on a process you initiated.</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Description:</strong> ${processDescription || "N/A"}</p>
        <p><strong>Tags:</strong> ${formatTags(tags)}</p>
        <p><strong>Query:</strong> ${query.question}</p>
        <p><strong>Raised by:</strong> ${raisedByUser.username}</p>
        <p><strong>Raised at:</strong> ${new Date(query.createdAt).toLocaleString()}</p>
      `,
      quickAccessLinks: `
        <div style="margin: 20px 0;">
          <a href="${processUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Process</a>
        </div>
      `,
      closingMessage: `<p>Please review and take necessary action.</p>`,
      text: `Dear ${initiator.username},

A query has been raised on process "${process.name}":
Query: ${query.question}
Raised by: ${raisedByUser.username}

View process: ${processUrl}`,
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
    processDescription,
    tags,
  ) => {
    const processUrl = generateAutoLoginProcessUrl(
      process.id,
      recommenderUser.id,
    );
    return {
      title: `Recommendation Requested – Process ${process.name}`,
      greeting: `Dear ${recommenderUser.username},`,
      message: `
        <p>You have been requested to provide a recommendation for the following process:</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Description:</strong> ${processDescription || "N/A"}</p>
        <p><strong>Tags:</strong> ${formatTags(tags)}</p>
        <p><strong>Requested by:</strong> ${requesterUser.username}</p>
        <p><strong>Recommendation details:</strong> ${recommendation.recommendationText}</p>
      `,
      quickAccessLinks: `
        <div style="margin: 20px 0;">
          <a href="${processUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Process</a>
        </div>
      `,
      closingMessage: `<p>Please provide your response at your earliest convenience.</p>`,
      text: `Dear ${recommenderUser.username},

You have been requested to provide a recommendation for process "${process.name}":
Description: ${processDescription || "N/A"}
Tags: ${tags?.join(", ") || "None"}
Requested by: ${requesterUser.username}
Recommendation: ${recommendation.recommendationText}

View process: ${processUrl}`,
    };
  },
  recommendationResponded: async (
    process,
    recommendation,
    recommenderUser,
    requesterUser,
    processDescription,
    tags,
  ) => {
    const processUrl = generateAutoLoginProcessUrl(
      process.id,
      requesterUser.id,
    );
    return {
      title: `Recommendation Response Received – Process ${process.name}`,
      greeting: `Dear ${requesterUser.username},`,
      message: `
          <p>A recommendation has been responded to.</p>
          <p><strong>Process:</strong> ${process.name}</p>
          <p><strong>Description:</strong> ${processDescription || "N/A"}</p>
          <p><strong>Tags:</strong> ${formatTags(tags)}</p>
          <p><strong>Recommender:</strong> ${recommenderUser.username}</p>
          <p><strong>Response:</strong> ${recommendation.responseText || "N/A"}</p>
          <p><strong>Status:</strong> ${recommendation.status}</p>
        `,
      quickAccessLinks: `
          <div style="margin: 20px 0;">
            <a href="${processUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Process</a>
          </div>
        `,
      closingMessage: `<p>You may now continue with the process.</p>`,
      text: `Dear ${requesterUser.username},
  
  A recommendation has been responded to for process "${process.name}":
  Recommender: ${recommenderUser.username}
  Response: ${recommendation.responseText || "N/A"}
  
  View process: ${processUrl}`,
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
  processCompleted: async (process, initiator, processDescription, tags) => {
    const processUrl = generateAutoLoginProcessUrl(process.id, initiator.id);
    return {
      title: `Process Completed Successfully – ${process.name}`,
      greeting: `Dear ${initiator.username},`,
      message: `
        <p>Your process has been completed successfully!</p>
        <p><strong>Process:</strong> ${process.name}</p>
        <p><strong>Description:</strong> ${processDescription || "N/A"}</p>
        <p><strong>Tags:</strong> ${formatTags(tags)}</p>
        <p><strong>Completed at:</strong> ${new Date().toLocaleString()}</p>
      `,
      quickAccessLinks: `
        <div style="margin: 20px 0;">
          <a href="${processUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Process</a>
        </div>
      `,
      closingMessage: `<p>All steps have been completed.</p>`,
      text: `Dear ${initiator.username},

Your process "${process.name}" has been completed successfully.
Description: ${processDescription || "N/A"}
Tags: ${tags?.join(", ") || "None"}

View process: ${processUrl}`,
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

export const sendUserEmail = async (eventType, user, plainPassword) => {
  const template = emailTemplates[eventType];
  if (!template) {
    throw new Error(`No template found for event type: ${eventType}`);
  }

  const templateData = template(user, plainPassword);
  await sendEmail(user.email, templateData.title, templateData);
};

// Get recipients based on event type
const getRecipientsForEvent = async (eventType, data) => {
  console.log("event type", eventType);
  console.log("data", data);

  const recipients = new Set();
  const params = data?.params || [];

  switch (eventType) {
    case "stepAssigned": {
      const [, , , assignedUser] = params;
      if (assignedUser) recipients.add(assignedUser);
      break;
    }
    case "stepCompleted": {
      const [process, , , nextAssignee] = params;
      if (nextAssignee) recipients.add(nextAssignee);
      if (process?.initiatorId) {
        const initiator = await prisma.user.findUnique({
          where: { id: process.initiatorId },
        });
        if (initiator) recipients.add(initiator);
      }
      break;
    }
    case "queryRaised": {
      const [process, , , assignedToUser] = params;
      if (assignedToUser) recipients.add(assignedToUser);
      break;
    }
    case "queryRaisedToInitiator": {
      const [process, , , initiator] = params;
      if (initiator) recipients.add(initiator);
      break;
    }
    case "recommendationRequested": {
      const [, , , recommenderUser] = params;
      if (recommenderUser) recipients.add(recommenderUser);
      break;
    }
    case "recommendationResponded": {
      const [, , , requesterUser] = params; // requester is the one who requested recommendation
      if (requesterUser) recipients.add(requesterUser);
      break;
    }
    case "processCompleted": {
      const [process, initiator] = params;
      if (initiator) recipients.add(initiator);
      // Also notify all participants
      let participants = await prisma.processStepInstance.findMany({
        where: { processId: process.id },
        distinct: ["assignedTo"],
        select: { assignedTo: true },
      });
      participants = await Promise.all(
        participants.map(async (p) => {
          if (p.assignedTo) {
            return await prisma.user.findUnique({
              where: { id: p.assignedTo },
            });
          }
          return null;
        }),
      );
      participants.forEach((p) => {
        if (p && (!initiator || p.id !== initiator.id)) recipients.add(p);
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

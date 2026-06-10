// services/paymentScheduler.js
// ============================================================
// Payment Email Scheduler Service
// Handles ON_APPROVAL (immediate on completion) and ON_DATE (scheduled D-1 at 10:00 IST)
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { transporter } from "./emailService.js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_PATH =
  process.env.STORAGE_PATH || path.join(__dirname, "../../storage");

dotenv.config();
const { env } = process;

import prisma from "../config/prisma-config.js";

// ─── IST offset ────────────────────────────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

function getISTNow() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

// Next occurrence of HH:MM IST as a UTC Date
function nextISTTime(hours, minutes) {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const target = new Date(istNow);
  target.setHours(hours, minutes, 0, 0);
  if (target <= istNow) target.setDate(target.getDate() + 1);
  // Convert back to UTC
  return new Date(target.getTime() - IST_OFFSET_MS);
}

// ─── Document Attachment Helper ────────────────────────────
function prepareAttachments(processDocuments) {
  let attachments = [];
  if (!processDocuments || processDocuments.length === 0) return attachments;

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
    }
  }
  return attachments;
}

// ─── Email sender ───────────────────────────────────────────
async function sendPaymentNotificationEmail(
  process,
  emails,
  paymentDate = null,
  attachments = [],
) {
  if (!emails || emails.length === 0) return;

  const subject = `Payment Notification – Process: ${process.name}`;
  const dateStr = paymentDate
    ? new Date(paymentDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : "Today";

  const htmlBody = `
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

        .notice-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; margin-bottom: 28px; border-radius: 0 6px 6px 0; }
        .notice-title { font-size: 12px; font-weight: 700; color: #92400e; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
        .notice-content { font-size: 15px; color: #92400e; }
        
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
            <h2>Payment Notification</h2>
          </div>
          <div class="content">
            
            ${
              paymentDate
                ? `
            <div class="notice-box">
              <div class="notice-title">Payment Reminder</div>
              <div class="notice-content">
                Payment is due on <strong>${dateStr}</strong>. Please ensure all necessary arrangements are in place.
              </div>
            </div>`
                : `
            // <div class="message-box">
            //   <div class="message-title">Payment Due</div>
            //   <div class="message-content">
            //     The associated workflow process has been completed and payment is now due.
            //   </div>
            // </div>`
            }

            <h3 class="section-title">Payment & Process Summary</h3>
            <table class="details-table">
              <tr><th>Process Name</th><td>${process.name}</td></tr>
              ${
                process.tags && process.tags.length > 0
                  ? `<tr><th>Tags</th><td>${process.tags.map((tag) => `<span class="tags-box">${tag}</span>`).join("")}</td></tr>`
                  : `<tr><th>Tags</th><td>—</td></tr>`
              }
              <tr><th>Initiated By</th><td>${process.initiator?.username || "—"}</td></tr>
              <tr><th>Status</th><td>${process.status}</td></tr>
              <tr><th>Payment Date</th><td>${dateStr}</td></tr>
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
                  : '<div style="font-size: 13px; color: #64748b;">No documents were attached to this process.</div>'
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

  const results = await Promise.allSettled(
    emails.map((email) =>
      transporter.sendMail({
        from: `"Digital Workflow Solution" <${env.SMTP_FROM_EMAIL}>`,
        to: email,
        subject,
        html: htmlBody,
        attachments: attachments,
      }),
    ),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(
    `Payment notification: sent=${sent}, failed=${failed} for process ${process.name}`,
  );
  return { sent, failed };
}

// ─── Get emails for a tag ───────────────────────────────────
async function getTagEmails(tagName) {
  if (!tagName) return [];
  const tag = await prisma.tag.findFirst({
    where: { name: tagName },
    include: { emailList: { select: { email: true } } },
  });
  return tag?.emailList?.map((e) => e.email) || [];
}

// ─── ON_APPROVAL handler ─────────────────────────────────────
// Called from process-controller when status → COMPLETED
export async function handleOnApprovalPayment(processId) {
  try {
    const schedule = await prisma.processPaymentSchedule.findUnique({
      where: { processId },
      include: {
        process: {
          include: {
            initiator: { select: { id: true, username: true } },
            documents: { include: { document: true } },
          },
        },
      },
    });

    if (!schedule) return;
    if (schedule.paymentMode !== "ON_APPROVAL") return;
    if (schedule.status === "SENT") return;

    const tags = schedule.process.tags || [];
    const allEmails = new Set();
    for (const tag of tags) {
      const emails = await getTagEmails(tag);
      emails.forEach((e) => allEmails.add(e));
    }

    if (allEmails.size === 0) {
      console.log(`No emails configured for tags of process ${processId}`);
      return;
    }

    const attachments = prepareAttachments(schedule.process.documents);

    await sendPaymentNotificationEmail(
      schedule.process,
      [...allEmails],
      null,
      attachments,
    );

    await prisma.processPaymentSchedule.update({
      where: { processId },
      data: { status: "SENT", emailSentAt: new Date() },
    });
  } catch (err) {
    console.error("handleOnApprovalPayment error:", err);
  }
}

// ─── Scheduled job: runs every minute, checks for D-1 at 10AM IST ──
let schedulerInterval = null;

async function runScheduledPaymentCheck() {
  try {
    const istNow = getISTNow();
    const istHour = istNow.getHours();
    const istMinute = istNow.getMinutes();

    // Only run once per hour (10:00–10:01 IST window)
    if (istHour !== 10 || istMinute > 1) return;

    const tomorrowIST = new Date(istNow);
    tomorrowIST.setDate(tomorrowIST.getDate() + 1);
    tomorrowIST.setHours(0, 0, 0, 0);

    const dayAfterTomorrowIST = new Date(tomorrowIST);
    dayAfterTomorrowIST.setDate(dayAfterTomorrowIST.getDate() + 1);

    const tomorrowUTCStart = new Date(tomorrowIST.getTime() - IST_OFFSET_MS);
    const tomorrowUTCEnd = new Date(
      dayAfterTomorrowIST.getTime() - IST_OFFSET_MS,
    );

    const pendingSchedules = await prisma.processPaymentSchedule.findMany({
      where: {
        paymentMode: "ON_DATE",
        status: "PENDING",
        paymentDate: {
          gte: tomorrowUTCStart,
          lt: tomorrowUTCEnd,
        },
      },
      include: {
        process: {
          include: {
            initiator: { select: { id: true, username: true } },
            documents: { include: { document: true } },
          },
        },
      },
    });

    console.log(
      `[PaymentScheduler] ${istNow.toISOString()} IST — found ${pendingSchedules.length} schedule(s) due tomorrow`,
    );

    for (const schedule of pendingSchedules) {
      const process = schedule.process;

      // ✅ NEW LOGIC: Check if process is completed
      if (process.status !== "COMPLETED") {
        console.log(
          `[PaymentScheduler] Process ${process.id} not completed. Switching to ON_APPROVAL.`,
        );

        await prisma.processPaymentSchedule.update({
          where: { id: schedule.id },
          data: {
            paymentMode: "ON_APPROVAL",
            updatedAt: new Date(),
          },
        });

        continue; // skip this iteration
      }

      // Existing logic continues if COMPLETED
      const tags = process.tags || [];
      const allEmails = new Set();

      for (const tag of tags) {
        const emails = await getTagEmails(tag);
        emails.forEach((e) => allEmails.add(e));
      }

      if (allEmails.size > 0) {
        const attachments = prepareAttachments(process.documents);

        await sendPaymentNotificationEmail(
          process,
          [...allEmails],
          schedule.paymentDate,
          attachments,
        );

        await prisma.processPaymentSchedule.update({
          where: { id: schedule.id },
          data: { status: "SENT", emailSentAt: new Date() },
        });
      } else {
        console.log(`No emails for process ${process.id}, skipping`);
      }
    }
  } catch (err) {
    console.error("[PaymentScheduler] error:", err);
  }
}

// ─── Start / Stop scheduler ─────────────────────────────────
export function startPaymentScheduler() {
  if (schedulerInterval) return;
  // Check every 60 seconds
  schedulerInterval = setInterval(runScheduledPaymentCheck, 60 * 1000);
  // Run immediately on start
  runScheduledPaymentCheck();
  console.log("[PaymentScheduler] Started — checking every 60s");
}

export function stopPaymentScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[PaymentScheduler] Stopped");
  }
}

// ─── Create a payment schedule record ──────────────────────
export async function createPaymentSchedule(
  processId,
  tagId,
  paymentMode,
  paymentDate = null,
) {
  return prisma.processPaymentSchedule.upsert({
    where: { processId },
    create: {
      processId,
      tagId: tagId ? parseInt(tagId) : null,
      paymentMode,
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      scheduledAt: paymentDate ? new Date(paymentDate) : null,
      status: "PENDING",
    },
    update: {
      tagId: tagId ? parseInt(tagId) : null,
      paymentMode,
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      scheduledAt: paymentDate ? new Date(paymentDate) : null,
      status: "PENDING",
    },
  });
}

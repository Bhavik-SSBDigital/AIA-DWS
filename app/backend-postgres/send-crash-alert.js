import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config({
  path:
    process.env.DWS_ENV_FILE ||
    "/home/ubuntu/AIA-DWS/app/backend-postgres/.env",
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "25", 10),
  secure: process.env.SMTP_SECURE === "true",
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
});

const sendAlert = async () => {
  const exitStatus = process.argv[2] || "Unknown";
  const serviceResult = process.argv[3] || "Unknown";
  const serverName = process.env.DWS_SERVER_NAME || "DWSAUDIT-PRD";
  const recipients =
    process.env.DWS_ALERT_TO ||
    "hardik.kachhadiya@aiaengineering.com, bhavik.bhatt@ssbi.in";

  const isUnresponsive = serviceResult === "unresponsive";

  try {
    const info = await transporter.sendMail({
      from: `"DWS Alert System" <${
        process.env.SMTP_FROM_EMAIL || "no-reply@aiaengineering.com"
      }>`,
      to: recipients,
      subject: isUnresponsive
        ? `CRITICAL ALERT: DWS Backend Unresponsive (health check failed)`
        : `CRITICAL ALERT: DWS Backend Service Stopped (${serviceResult})`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 650px; margin: auto;">
          <h2 style="color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 10px;">DWS Service Alert</h2>
          <p>
            The <strong>DWS Backend Service</strong> is ${
              isUnresponsive
                ? "alive but not responding to HTTP health checks"
                : "stopped or crashed"
            }.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr><td style="padding: 8px; border: 1px solid #ccc; background-color: #f9f9f9;"><strong>Time</strong></td><td style="padding: 8px; border: 1px solid #ccc;">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ccc; background-color: #f9f9f9;"><strong>Server</strong></td><td style="padding: 8px; border: 1px solid #ccc;">${serverName}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ccc; background-color: #f9f9f9;"><strong>Service Result</strong></td><td style="padding: 8px; border: 1px solid #ccc; color: #d9534f; font-weight: bold;">${serviceResult}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ccc; background-color: #f9f9f9;"><strong>Exit / Source</strong></td><td style="padding: 8px; border: 1px solid #ccc;">${exitStatus}</td></tr>
          </table>
          <p style="margin-top: 20px;">Useful commands:</p>
          <div style="background-color: #f4f4f4; padding: 12px; border-radius: 4px; border-left: 4px solid #333; font-family: monospace;">
            journalctl -u dws.service -n 150 --no-pager<br/>
            tail -n 150 /var/log/dws.log<br/>
            tail -n 150 /var/log/dws-health-guard.log
          </div>
        </div>
      `,
    });

    console.log("Alert email sent successfully:", info.messageId);
  } catch (error) {
    console.error("Failed to send alert email:", error);
    process.exit(1);
  }
};

sendAlert();

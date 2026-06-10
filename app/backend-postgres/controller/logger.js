import winston from "winston";

import prisma from "../config/prisma-config.js";

// Function to get local time as Date object (adjusted from UTC)
const getLocalDate = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000; // offset in milliseconds
  return new Date(now.getTime() - timezoneOffset);
};

// Custom transport to log to SystemLog model - PRESERVING ORIGINAL HANDLING
class PrismaTransport extends winston.Transport {
  constructor(options = {}) {
    super(options);
  }

  async log(info, callback) {
    setImmediate(async () => {
      try {
        // PRESERVE THE ORIGINAL LOGIC FOR EXTRACTING DATA
        // The original code handled both info.message object and direct properties correctly
        const logData = info.message || {};

        // Use the same extraction logic as before
        const userId = logData.userId || info.userId || null;
        const action = logData.action || info.action || "UNKNOWN";
        const details = logData.details || info.details || {};

        // Use local time instead of UTC
        const localTimestamp = getLocalDate();

        await prisma.systemLog.create({
          data: {
            userId: userId,
            action: action,
            details: details,
            timestamp: localTimestamp,
          },
        });
      } catch (error) {
        console.error("Error logging to database:", error);
      }
      this.emit("logged", info);
    });
    callback();
  }
}

// Configure Winston logger - keeping the original format
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    // Log to file
    new winston.transports.File({ filename: "logs/app.log" }),
    // Log to database
    new PrismaTransport(),
  ],
});

export default logger;

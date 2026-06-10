import ExcelJS from "exceljs";

import logger from "./logger.js";

import prisma from "../config/prisma-config.js";

const verifyUser = async (accessToken) => {
  // Placeholder for user verification logic
  // Replace with actual implementation
  return { id: 1, username: "testUser" }; // Mock for example
};

export const export_file_logs = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    logger.info({
      action: "EXPORT_LOGS_START",
      userId: userData.id,
      details: {
        username: userData.username,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
      },
    });

    if (userData === "Unauthorized") {
      logger.warn({
        action: "EXPORT_LOGS_UNAUTHORIZED",
        details: { accessToken },
      });
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { fromDate, toDate } = req.query;

    if (!fromDate || !toDate) {
      logger.warn({
        action: "EXPORT_LOGS_INVALID_DATES",
        userId: userData.id,
        details: { fromDate, toDate },
      });
      return res
        .status(400)
        .json({ message: "fromDate and toDate are required" });
    }

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);

    if (isNaN(startDate) || isNaN(endDate)) {
      logger.warn({
        action: "EXPORT_LOGS_INVALID_DATE_FORMAT",
        userId: userData.id,
        details: { fromDate, toDate },
      });
      return res.status(400).json({ message: "Invalid date format" });
    }

    // Query logs from SystemLog
    const logs = await prisma.systemLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        user: {
          select: { username: true },
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    if (logs.length === 0) {
      logger.info({
        action: "EXPORT_LOGS_NO_DATA",
        userId: userData.id,
        details: { fromDate, toDate },
      });
      return res
        .status(404)
        .json({ message: "No logs found for the specified date range" });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Logs");

    // Define columns
    worksheet.columns = [
      { header: "Timestamp", key: "timestamp", width: 20 },
      { header: "User", key: "username", width: 15 },
      { header: "Action", key: "action", width: 25 },
      { header: "Details", key: "details", width: 50 },
    ];

    // Add rows
    logs.forEach((log) => {
      worksheet.addRow({
        timestamp: log.timestamp.toISOString(),
        username: log.user?.username || "N/A",
        action: log.action,
        details: JSON.stringify(log.details, null, 2),
      });
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="logs_${fromDate}_${toDate}.xlsx"`,
    );

    // Write to response
    await workbook.xlsx.write(res);

    logger.info({
      action: "EXPORT_LOGS_SUCCESS",
      userId: userData.id,
      details: {
        fromDate,
        toDate,
        logCount: logs.length,
        username: userData.username,
      },
    });
  } catch (error) {
    logger.error({
      action: "EXPORT_LOGS_ERROR",
      userId: userData?.id,
      details: {
        error: error.message,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
      },
    });
    res.status(500).json({ message: "Error exporting logs: " + error.message });
  } finally {
  }
};

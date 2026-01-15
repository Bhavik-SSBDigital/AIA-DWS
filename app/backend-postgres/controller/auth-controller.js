import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { send_mail_for_sign_up } from "./email-handler.js";
import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../utility/verifyUser.js";
import ExcelJS from "exceljs";

const prisma = new PrismaClient();

function generateRandomPassword(length) {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

/*
{
  "username": "john_doe",
  "email": "john@example.com",
  "department": 1,
  "roles": [1, 2],
  "writable": [101, 102],
  "readable": [101, 103],
  "downloadable": [101],
  "uploadable": [104]
}
*/
export const sign_up = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }
    const {
      username,
      email,
      roles,
      writable,
      readable,
      downloadable,
      uploadable,
      status,
    } = req.body;

    // Generate a random password
    let password = req.body.password;
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if the user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        username: username,
      },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User with given email or username already exists",
      });
    }

    // Check if the provided roles exist
    const validRoles = await prisma.role.findMany({
      where: {
        id: { in: roles },
        isActive: true,
      },
    });

    if (validRoles.length !== roles.length) {
      return res.status(400).json({
        message: "One or more roles are invalid or inactive",
      });
    }

    // Create the user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        writable,
        readable,
        downloadable,
        uploadable,
        status,
        createdById: userData.id,
      },
    });

    // Manually create UserRole entries
    await prisma.userRole.createMany({
      data: roles.map((roleId) => ({
        userId: user.id,
        roleId,
      })),
    });

    // Attempt to send the email
    // const emailSent = await send_mail_for_sign_up(username, email, password);

    // if (!emailSent) {
    //   // If email sending fails, rollback the user creation
    //   await prisma.user.delete({ where: { id: user.id } });
    //   return res.status(500).json({
    //     message: "Error sending email. User creation rolled back.",
    //   });
    // }

    res.status(200).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Error creating user", error);
    return res.status(500).json({ message: "Error creating user" });
  }
};

/*
{
  "username": "john_doe",
  "password": "password123"
}
*/
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if the user exists
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        tokens: true,
        roles: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      await prisma.loginLog.create({
        data: {
          userId: user.id,
          username: user.username,
          email: user.email,
          action: "LOGIN",
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent"),
          success: false,
          error: "Password does not match",
        },
      });
      return res.status(400).json({ message: "Password does not match" });
    }

    // Check if the user already has a refresh token
    let refreshToken = user.tokens?.[0]?.token || "";

    if (!refreshToken) {
      refreshToken = jwt.sign({ id: user.id }, process.env.REFRESH_SECRET_KEY);

      await prisma.token.create({
        data: {
          token: refreshToken,
          userId: user.id,
        },
      });
    }

    // Generate an access token with all required user properties

    let roles = await prisma.role.findMany({
      where: { id: { in: user.roles.map((role) => role.roleId) } },
    });

    const isAdmin = roles.some((role) => role.isAdmin) || user.isAdmin;

    const isDepartmentHead = roles.some((role) => role.isDepartmentHead);

    const accessToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles.map((role) => role.roleId),
        isAdmin: isAdmin,
        isDepartmentHead: isDepartmentHead,
      },
      process.env.SECRET_ACCESS_KEY,
      {
        expiresIn: "365d",
      }
    );

    await prisma.loginLog.create({
      data: {
        userId: user.id,
        username: user.username,
        email: user.email,
        action: "LOGIN",
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get("User-Agent"),
        success: true,
      },
    });
    res.status(200).json({
      accessToken,
      refreshToken,
      email: user.email,
      userName: user.username,
      userId: user.id,
      roles: roles.map((role) => role.role),
      isAdmin: isAdmin,
      isDepartmentHead: isDepartmentHead,
      isRootUser: user.isRootLevel,
    });
  } catch (error) {
    console.error("Error during login", error);
    await prisma.loginLog.create({
      data: {
        username: req.body.username,
        action: "LOGIN",
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get("User-Agent"),
        success: false,
        error: error.message,
      },
    });
    return res.status(500).json({ message: "Error during login" });
  }
};

export const logout = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  const userData = await verifyUser(accessToken);
  if (userData === "Unauthorized" || !userData?.id) {
    return res.status(401).json({
      success: false,
      error: {
        message: "Unauthorized request",
        details: "Invalid or missing authorization token.",
        code: "UNAUTHORIZED",
      },
    });
  }
  try {
    const userId = userData.id;

    // Delete the refresh token from database
    await prisma.token.deleteMany({
      where: {
        userId: userId,
      },
    });

    // Log the logout action
    await prisma.loginLog.create({
      data: {
        userId: userId,
        username: userData.username,
        email: userData.email,
        action: "LOGOUT",
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get("User-Agent"),
        success: true,
      },
    });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error during logout", error);

    // Log failed logout attempt if user info is available
    if (req.user) {
      await prisma.loginLog.create({
        data: {
          userId: userData.id,
          username: userData.username,
          email: userData.email,
          action: "LOGOUT",
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent"),
          success: false,
          error: error.message,
        },
      });
    }

    return res.status(500).json({ message: "Error during logout" });
  }
};

export const create_admin = async (req, res) => {
  try {
    const encryptedPassword = await bcrypt.hash("check", 10);

    const adminData = {
      username: "admin",
      email: "bhavik.bhatt@ssbi.in",
      password: encryptedPassword,
      isRootLevel: true,
      isAdmin: true,
    };

    const admin = await prisma.user.create({
      data: adminData,
    });

    res.status(200).json({
      message: "Admin created successfully",
      admin,
    });
  } catch (error) {
    console.error("Error creating admin user:", error);
    res.status(500).json({
      message: "Failed to create admin user",
      error: error.message,
    });
  }
};

export const change_password = async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Check if new password is different
    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const download_login_logs = async (req, res) => {
  try {
    const { fromDate, toDate, action } = req.query;

    // Build where clause
    const where = {};

    if (fromDate && toDate) {
      where.createdAt = {
        gte: new Date(fromDate),
        lte: new Date(toDate),
      };
    }

    if (action) {
      where.action = action;
    }

    // Get login logs
    const logs = await prisma.loginLog.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Login Logs");

    // Define columns
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "User ID", key: "userId", width: 15 },
      { header: "Username", key: "username", width: 20 },
      { header: "Name", key: "name", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Action", key: "action", width: 15 },
      { header: "IP Address", key: "ipAddress", width: 20 },
      { header: "Success", key: "success", width: 15 },
      { header: "Error", key: "error", width: 30 },
      { header: "Timestamp", key: "createdAt", width: 25 },
    ];

    // Add data
    logs.forEach((log) => {
      worksheet.addRow({
        id: log.id,
        userId: log.userId,
        username: log.username,
        name: log.user?.name || "N/A",
        email: log.email,
        action: log.action,
        ipAddress: log.ipAddress,
        success: log.success ? "Yes" : "No",
        error: log.error || "None",
        createdAt: log.createdAt.toLocaleString(),
      });
    });

    // Style header row
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=login-logs-${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating login logs report:", error);
    return res.status(500).json({ message: "Error generating report" });
  }
};

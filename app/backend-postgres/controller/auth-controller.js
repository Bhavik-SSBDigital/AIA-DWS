import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../utility/verifyUser.js";
import ExcelJS from "exceljs";
import { sendUserEmail } from "../services/emailService.js";
import CryptoJS from "crypto-js"; // ✅ Added CryptoJS for decryption

const prisma = new PrismaClient();

function generateRandomPassword(length) {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// ✅ VAPT FIX: Helper for Improper Serverside Validation
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidUsername = (username) => /^[a-zA-Z0-9_]{3,30}$/.test(username);

export const sign_up = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    if (!userData.isAdmin && !userData.isRootLevel) {
      return res
        .status(403)
        .json({ message: "Forbidden: Admin privileges required." });
    }

    const { username, email, roles, status } = req.body;

    // ✅ VAPT FIX: Improper Serverside Validation
    if (!username || !isValidUsername(username)) {
      return res.status(400).json({
        message: "Invalid username format. Use 3-30 alphanumeric characters.",
      });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }
    if (!Array.isArray(roles) || roles.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one valid role must be assigned." });
    }

    const plainPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const existingUser = await prisma.user.findFirst({ where: { username } });
    if (existingUser)
      return res.status(400).json({ message: "User already exists." }); // Sanitized error

    const validRoles = await prisma.role.findMany({
      where: { id: { in: roles }, isActive: true },
    });
    if (validRoles.length !== roles.length) {
      return res
        .status(400)
        .json({ message: "One or more roles are invalid or inactive." });
    }

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        status:
          status === "Active" || status === "Inactive" ? status : "Inactive",
        createdById: userData.id,
      },
    });

    await prisma.userRole.createMany({
      data: roles.map((roleId) => ({ userId: user.id, roleId })),
    });

    try {
      await sendUserEmail("userCreated", user, plainPassword);
    } catch (emailError) {
      await prisma.user.delete({ where: { id: user.id } });
      console.error("Email failure during signup."); // Generic log to prevent info disclosure
      return res
        .status(500)
        .json({ message: "System error during user creation. Try again." });
    }

    res.status(200).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Signup Error", error); // Safely logged internally
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // ✅ VAPT FIX: Serverside Validation
    if (
      !username ||
      typeof username !== "string" ||
      !password ||
      typeof password !== "string"
    ) {
      return res.status(400).json({ message: "Invalid input format" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { tokens: true, roles: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // ✅ VAPT FIX: Decrypt the AES encrypted password from frontend
    let plainTextPassword;
    try {
      const bytes = CryptoJS.AES.decrypt(
        password,
        process.env.FRONTEND_ENCRYPTION_KEY,
      );
      plainTextPassword = bytes.toString(CryptoJS.enc.Utf8);
      if (!plainTextPassword)
        throw new Error("Decryption resulted in empty string");
    } catch (err) {
      return res
        .status(400)
        .json({ message: "Invalid encrypted password payload" });
    }

    // Pass the decrypted text to bcrypt
    const match = await bcrypt.compare(plainTextPassword, user.password);

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
          error: "Invalid credentials",
        },
      });
      return res.status(401).json({ message: "Invalid username or password" });
    }

    let refreshToken = user.tokens?.[0]?.token || "";
    if (!refreshToken) {
      refreshToken = jwt.sign({ id: user.id }, process.env.REFRESH_SECRET_KEY);
      await prisma.token.create({
        data: { token: refreshToken, userId: user.id },
      });
    }

    let roles = await prisma.role.findMany({
      where: { id: { in: user.roles.map((role) => role.roleId) } },
    });

    console.log("roles", roles);

    const isAdmin = roles.some((role) => role.isAdmin) || user.isAdmin;
    const isRootLevel =
      roles.some((role) => role.isRootLevel) || user.isRootLevel;
    const isDepartmentHead = roles.some((role) => role.isDepartmentHead);

    const accessToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles.map((role) => role.roleId),
        isAdmin,
        isDepartmentHead,
      },
      process.env.SECRET_ACCESS_KEY,
      { expiresIn: "1h" },
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

    console.log("isRootLevel", isRootLevel);

    res.status(200).json({
      accessToken,
      refreshToken,
      email: user.email,
      id: user.id,
      userName: user.username,
      userId: user.id,
      roles: roles.map((role) => role.role),
      isAdmin,
      isDepartmentHead,
      isRootUser: isRootLevel,
    });
  } catch (error) {
    console.error("Login System Error"); // ✅ VAPT FIX: Info Disclosure (No stack traces)
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const logout = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  const userData = await verifyUser(accessToken);

  if (userData === "Unauthorized" || !userData?.id) {
    return res.status(401).json({ message: "Unauthorized request" });
  }

  try {
    const userId = userData.id;

    // ✅ VAPT FIX: Improper Session Termination
    await prisma.token.deleteMany({ where: { userId: userId } });
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

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
    console.error("Logout Error");
    return res.status(500).json({ message: "Internal server error" });
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
      select: {
        id: true,
        username: true,
        email: true,
        isRootLevel: true,
        isAdmin: true,
        status: true,
        createdAt: true,
        // We strictly leave 'password' out of this list
      },
    });

    // ✅ VAPT FIX: Login Credentials rendering in Plaintext
    delete admin.password;

    res.status(200).json({ message: "Admin created successfully", admin });
  } catch (error) {
    console.error("Admin Creation Error", error);
    res.status(500).json({ message: "Failed to create admin user" });
  }
};

export const autoLogin = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: "Token is required" });

    const decoded = jwt.verify(token, process.env.SECRET_ACCESS_KEY);
    if (decoded.type !== "auto-login")
      return res.status(400).json({ message: "Invalid token type" });

    const tokenAge = Date.now() - decoded.timestamp;
    if (tokenAge > 24 * 60 * 60 * 1000)
      return res.status(400).json({ message: "Token has expired" });

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { roles: true },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const roles = await prisma.role.findMany({
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
        isAdmin,
        isDepartmentHead,
        source: "auto-login",
      },
      process.env.SECRET_ACCESS_KEY,
      { expiresIn: "1h" },
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.REFRESH_SECRET_KEY,
    );

    await prisma.token.upsert({
      where: { userId: user.id },
      update: { token: refreshToken },
      create: { token: refreshToken, userId: user.id },
    });

    await prisma.loginLog.create({
      data: {
        userId: user.id,
        username: user.username,
        email: user.email,
        action: "AUTO_LOGIN",
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get("User-Agent"),
        success: true,
      },
    });

    const redirectUrl =
      decoded.resourceType === "process"
        ? `${process.env.FRONTEND_URL}/process/view/${decoded.resourceId}` ||
          "/dashboard"
        : decoded.resourceType === "recommendation"
          ? `${process.env.FRONTEND_URL}/recommendation/${decoded.resourceId}` ||
            "/dashboard"
          : `${process.env.FRONTEND_URL}/process/view/${decoded.processId}?autoOpenDoc=${decoded.resourceId}` ||
            "/dashboard";

    res.status(200).json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        userName: user.username,
        roles: roles.map((role) => role.role),
        isAdmin,
        isDepartmentHead,
        isRootUser: user.isRootLevel,
      },
      redirectUrl,
    });
  } catch (error) {
    console.error("Auto-login error");
    return res.status(400).json({ message: "Invalid or expired token" });
  }
};

export const validateAutoLogin = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token)
      return res
        .status(400)
        .json({ valid: false, message: "Token is required" });

    const decoded = jwt.verify(token, process.env.SECRET_ACCESS_KEY);
    if (decoded.type !== "auto-login")
      return res.status(400).json({ valid: false, message: "Invalid token" });

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, status: "active" },
    });

    if (!user)
      return res
        .status(400)
        .json({ valid: false, message: "User not found or inactive" });

    res.status(200).json({
      valid: true,
      userId: decoded.userId,
      resourceType: decoded.resourceType,
      resourceId: decoded.resourceId,
    });
  } catch (error) {
    return res
      .status(400)
      .json({ valid: false, message: "Error validating token" });
  }
};

export const forget_password = async (req, res) => {
  try {
    const { username, email } = req.body;

    // ✅ VAPT FIX: Serverside Validation
    if (
      !username ||
      !isValidUsername(username) ||
      !email ||
      !isValidEmail(email)
    ) {
      return res.status(400).json({ message: "Invalid input format" });
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || user.email !== email) {
      return res.status(200).json({
        message:
          "If the details are correct, a new password has been sent to your registered email",
      });
    }

    const newPlainPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(newPlainPassword, 10);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, passwordChangedAt: new Date() },
      });
      await tx.token.deleteMany({ where: { userId: user.id } });
    });

    try {
      await sendUserEmail("passwordReset", user, newPlainPassword);
    } catch (emailError) {
      console.error("Password reset email failed");
      return res.status(500).json({
        message: "Error sending password reset email, please try again later",
      });
    }

    return res.status(200).json({
      message:
        "If the details are correct, a new password has been sent to your registered email",
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const change_password = async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    // ✅ VAPT FIX: Serverside Validation & Decryption
    if (
      !username ||
      typeof username !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({ message: "Invalid input." });
    }

    let plainCurrent, plainNew;
    try {
      plainCurrent = CryptoJS.AES.decrypt(
        currentPassword,
        process.env.FRONTEND_ENCRYPTION_KEY,
      ).toString(CryptoJS.enc.Utf8);
      plainNew = CryptoJS.AES.decrypt(
        newPassword,
        process.env.FRONTEND_ENCRYPTION_KEY,
      ).toString(CryptoJS.enc.Utf8);

      if (!plainCurrent || !plainNew) throw new Error("Decryption failed");
    } catch (err) {
      console.log("error changing password", err);
      return res
        .status(400)
        .json({ message: "Invalid encrypted password payload" });
    }

    console.log("hellossm");
    if (plainNew.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters long." });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPasswordValid = await bcrypt.compare(plainCurrent, user.password);
    if (!isPasswordValid)
      return res.status(401).json({ message: "Current password is incorrect" });

    if (plainCurrent === plainNew) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    const hashedPassword = await bcrypt.hash(plainNew, 10);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, passwordChangedAt: new Date() },
      });
      await tx.token.deleteMany({ where: { userId: user.id } });
    });

    res.status(200).json({
      message:
        "Password changed successfully. You have been logged out of all other sessions.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const download_login_logs = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const requestingUser = await verifyUser(accessToken);
    if (
      requestingUser === "Unauthorized" ||
      (!requestingUser.isAdmin && !requestingUser.isRootLevel)
    ) {
      return res.status(403).json({
        message: "Forbidden: Admin privileges required to download logs.",
      });
    }

    const { fromDate, toDate, action } = req.query;
    const where = {};

    if (fromDate && toDate) {
      where.createdAt = { gte: new Date(fromDate), lte: new Date(toDate) };
    }
    if (action) where.action = action;

    const logs = await prisma.loginLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Login Logs");

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

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=login-logs-${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Log Download Error");
    return res.status(500).json({ message: "Error generating report" });
  }
};

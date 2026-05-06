import fs from "fs/promises";
import { createWriteStream, createReadStream, read } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, normalize, extname, basename } from "path";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import fsCB from "fs";
import sharp from "sharp";
import path from "path";
import axios from "axios";
import { Transform } from "stream";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { verifyUser } from "../utility/verifyUser.js";
import archiver from "archiver";
import { promisify } from "util";
import { pipeline } from "stream";
// import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import dotnev from "dotenv";

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const prisma = new PrismaClient();

dotnev.config();

export const checkIfUserIsAdmin = async (userData) => {
  try {
    const roles = await prisma.role.findMany({
      where: { id: { in: userData.roles } },
      select: { isDepartmentHead: true, departmentId: true },
    });

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userData.id) },
      select: { isAdmin: true },
    });

    const isAdmin = roles.some((role) => role.isAdmin) || user.isAdmin;
    return isAdmin;
  } catch (error) {
    console.error("Error checking if user is admin:", error);
    return false;
  }
};

// POST /physical-requests
export const create_physical_request = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    let { documentId, departmentId, reason } = req.body;

    departmentId = parseInt(departmentId);
    documentId = parseInt(documentId);
    if (!documentId || !departmentId || !reason) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const userRoles = await prisma.userRole.findMany({
      where: { userId: userData.id },
    });

    const roles = await prisma.role.findMany({
      where: { id: { in: userRoles.map((userRole) => userRole.roleId) } },
      select: { departmentId: true },
    });

    const branches = roles.map((role) => role.departmentId);

    // Verify user has access to the department
    if (!branches.includes(departmentId)) {
      return res.status(403).json({ message: "No access to this department" });
    }

    const request = await prisma.physicalDocumentRequest.create({
      data: {
        documentId,
        departmentId,
        requestingUserId: userData.id,
        reason,
        status: "PENDING_ADMIN_APPROVAL",
      },
      include: {
        document: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        requestingUser: { select: { id: true, name: true } },
        messages: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    return res.status(201).json(request);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /physical-requests

export const get_physical_requests = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    let roles = await prisma.userRole.findMany({
      where: { userId: userData.id },
      include: { role: true },
    });

    roles = roles.map((r) => r.role);

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userData.id) },
      select: { isAdmin: true },
    });

    const isAdmin = roles.some((role) => role.isAdmin) || user.isAdmin;

    const isDepartmentHead = roles.some((role) => role.isDepartmentHead);

    const role =
      req.query.role || (isAdmin ? "admin" : isDepartmentHead ? "hod" : "user");

    console.log("role", role);
    let requests;

    if (role === "user") {
      requests = await prisma.physicalDocumentRequest.findMany({
        where: { requestingUserId: parseInt(userData.id) },
        include: {
          document: { select: { id: true, name: true, path: true } },
          department: { select: { id: true, name: true } },
        },
      });
      return res.status(200).json(requests);
    } else if (role === "admin") {
      requests = await prisma.physicalDocumentRequest.findMany({
        include: {
          document: { select: { id: true, name: true, path: true } },
          department: { select: { id: true, name: true } },
          requestingUser: { select: { id: true, name: true } },
        },
      });
      return res.status(200).json(requests);
    } else if (role === "hod") {
      const hodDepartments = roles
        .filter((r) => r.isDepartmentHead)
        .map((r) => r.departmentId);
      requests = await prisma.physicalDocumentRequest.findMany({
        where: { departmentId: { in: hodDepartments } },
        include: {
          document: { select: { id: true, name: true, path: true } },
          department: { select: { id: true, name: true } },
          requestingUser: { select: { id: true, name: true } },
        },
      });
      return res.status(200).json(requests);
    }
    return res.status(400).json({ message: "Invalid role" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const get_physical_request_messages = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { id } = req.params;

    const request = await prisma.physicalDocumentRequest.findUnique({
      where: { id: parseInt(id) },
      include: { department: true },
    });

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const isAdmin = await checkIfUserIsAdmin(userData);
    const isHod = await checkHodRole(userData, request.departmentId);
    const isRequestingUser = userData.id === request.requestingUserId;

    if (!isAdmin && !isHod && !isRequestingUser) {
      return res.status(403).json({ message: "No access to this request" });
    }

    const messages = await prisma.physicalRequestMessage.findMany({
      where: { requestId: parseInt(id) },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json(messages);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /physical-requests/:id
export const update_physical_request = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { id } = req.params;
    const { action, message } = req.body;
    if (!action) {
      return res.status(400).json({ message: "Missing action" });
    }

    const request = await prisma.physicalDocumentRequest.findUnique({
      where: { id: parseInt(id) },
      include: { department: true },
    });

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const isAdmin = await checkIfUserIsAdmin(userData);
    const isHod = await checkHodRole(userData, request.departmentId);

    console.log("is admin", isAdmin);
    console.log("is hod", isHod);
    const isRequestingUser = userData.id === request.requestingUserId;

    // Validate action permissions
    let newStatus;
    if (isAdmin) {
      if (
        request.status === "PENDING_ADMIN_APPROVAL" ||
        request.status === "HOD_APPROVED"
      ) {
        if (action === "approve") newStatus = "ADMIN_APPROVED";
        else if (action === "reject") newStatus = "ADMIN_REJECTED";
        else if (action === "sendToHod") newStatus = "PENDING_HOD_APPROVAL";
        else if (action === "queryUser") newStatus = "PENDING_USER_RESPONSE";
      } else if (["ADMIN_APPROVED", "HOD_APPROVED"].includes(request.status)) {
        if (action === "returnDoc") newStatus = "DOC_RETURNED";
        else if (action === "scrapDoc") newStatus = "DOC_SCRAPPED";
        else if (action === "queryUser") newStatus = "PENDING_USER_RESPONSE";
      }
    } else if (isHod && request.status === "PENDING_HOD_APPROVAL") {
      console.log("reached right");
      if (action === "approve") newStatus = "HOD_APPROVED";
      else if (action === "reject") newStatus = "HOD_REJECTED";
      else if (action === "queryUser") newStatus = "PENDING_USER_RESPONSE";
      else if (action === "sendToAdmin") newStatus = "PENDING_ADMIN_APPROVAL";
    } else if (
      isRequestingUser &&
      (request.status === "PENDING_USER_RESPONSE" ||
        request.status === "ADMIN_APPROVED" ||
        request.status === "DOC_RETURNED" ||
        request.status === "DOC_SCRAPPED")
    ) {
      if (action === "respond") newStatus = "PENDING_ADMIN_APPROVAL";
      else if (action === "returnDoc") newStatus = "DOC_RETURNED";
      else if (action === "scrapDoc") newStatus = "DOC_SCRAPPED";
    }

    if (!newStatus) {
      return res
        .status(403)
        .json({ message: "Action not allowed for this role or status" });
    }

    // Update request and add message if provided
    const updatedRequest = await prisma.$transaction([
      prisma.physicalDocumentRequest.update({
        where: { id: parseInt(id) },
        data: { status: newStatus, updatedAt: new Date() },
        include: {
          document: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          messages: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      ...(message
        ? [
            prisma.physicalRequestMessage.create({
              data: {
                requestId: parseInt(id),
                userId: userData.id,
                message,
                previousStatus: request.status,
                newStatus: newStatus,
                changerRole: isAdmin
                  ? "ADMIN"
                  : isHod
                    ? "HOD"
                    : isRequestingUser
                      ? "USER"
                      : null,
              },
            }),
          ]
        : []),
    ]);

    return res.json(updatedRequest[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /physical-requests/:id/messages
export const add_request_message = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { id } = req.params;
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: "Missing message" });
    }

    const request = await prisma.physicalDocumentRequest.findUnique({
      where: { id: parseInt(id) },
      include: { department: true },
    });
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const isAdmin = userData.isAdmin;
    const isHod = await checkHodRole(userData, request.departmentId);
    const isRequestingUser = userData.id === request.requestingUserId;

    if (!isAdmin && !isHod && !isRequestingUser) {
      return res.status(403).json({ message: "No access to this request" });
    }

    // If user is responding to a query, update status
    let update;
    let previousStatus;
    let newStatusForMsg;
    let changerRoleForMsg;
    if (isRequestingUser && request.status === "PENDING_USER_RESPONSE") {
      previousStatus = request.status;
      newStatusForMsg = "PENDING_ADMIN_APPROVAL";
      changerRoleForMsg = "USER";
      update = await prisma.physicalDocumentRequest.update({
        where: { id: parseInt(id) },
        data: { status: newStatusForMsg, updatedAt: new Date() },
      });
    }

    const newMessage = await prisma.physicalRequestMessage.create({
      data: {
        requestId: parseInt(id),
        userId: userData.id,
        message,
        ...(update
          ? {
              previousStatus: previousStatus,
              newStatus: newStatusForMsg,
              changerRole: changerRoleForMsg,
            }
          : {}),
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return res.status(201).json(newMessage);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Helper function to check if user is HOD for a department
export const checkHodRole = async (userData, departmentId) => {
  try {
    const roles = await prisma.role.findMany({
      where: { id: { in: userData.roles } },
      select: { isDepartmentHead: true, departmentId: true },
    });

    const headDepartments = roles
      .filter((role) => role.isDepartmentHead)
      .map((r) => r.departmentId);

    const isHod = headDepartments.some((dept) => dept === departmentId);
    return isHod;
  } catch (error) {
    console.error("Error checking if user is HOD:", error);
    return false;
  }
};

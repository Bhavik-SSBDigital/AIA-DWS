import { verifyUser } from "../utility/verifyUser.js";

import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";

import {
  uploadAccess,
  downloadAccess,
  viewAccess,
  fullAccess,
} from "../utility/accessFunction.js";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
/**
 * Get users based on the `isRootUser` parameter.
 * - If `isRootUser` is true, return only root-level users.
 * - Otherwise, return all users with basic details.
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export const get_users = async (req, res) => {
  try {
    const { isRootLevel, fromAdmin } = req.query;
    const whereClause = {};
    if (isRootLevel) whereClause.isRootLevel = true;
    if (fromAdmin !== "true") whereClause.status = "Active";

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        username: true,
        email: true,
        status: true,
        signaturePicFileName: true, // <-- fetch signature file name
        roles: {
          select: {
            role: {
              select: {
                id: true,
                role: true,
                isRootLevel: true,
                departmentRoleAssignment: {
                  select: {
                    department: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const transformedUsers = users.map((user) => {
      const seenDepartments = new Set();

      const roles = user.roles.map((userRole) => {
        const uniqueDepartments = [];
        userRole.role.departmentRoleAssignment.forEach((dra) => {
          const deptKey = `${dra.department.id}-${dra.department.name}`;
          if (!seenDepartments.has(deptKey)) {
            seenDepartments.add(deptKey);
            uniqueDepartments.push({
              id: dra.department.id,
              name: dra.department.name,
            });
          }
        });
        return {
          id: userRole.role.id,
          role: userRole.role.role,
          isRootLevel: userRole.role.isRootLevel,
          departments: uniqueDepartments,
        };
      });

      // Construct signature URL if available
      const signatureUrl = user.signaturePicFileName
        ? `${req.protocol}://${req.get("host")}/api/users/signature/${user.id}`
        : null;

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status || "UNKNOWN",
        roles,
        signatureUrl, // <-- added
      };
    });

    res.status(200).json({
      success: true,
      data: transformedUsers,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching users.",
    });
  }
};

export const get_users_with_details = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        branches: {
          select: {
            name: true,
          },
        },
        roles: {
          select: {
            role: {
              select: {
                role: true,
              },
            },
          },
        },
      },
    });

    const formattedUsers = users.map((user) => ({
      id: user.id,
      username: user.username,
      departments: user.branches.map((branch) => branch.name),
      roles: user.roles.map((role) => role.role.role),
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const get_user_profile_data = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      throw new Error("Unauthorised request");
    }
    const user = await prisma.user.findFirst({
      where: { id: userData.id },
      select: {
        id: true,
        username: true,
        email: true,
        signaturePicFileName: true,
        dscFileName: true,
        dscFileName: true,
        branches: true,
        roles: {
          select: {
            role: {
              select: {
                role: true,
              },
            },
          },
        },
      },
    });

    console.log("user", user);

    const formattedUser = {
      id: user.id,
      username: user.username,
      departmentsInvoledIn: user.branches.map((branch) => branch.name),
      roles: user.roles.map((role) => role.role.role),
      email: user.email,
      signaturePicFileName: user.signaturePicFileName,
      profilePicFileName: user.profilePicFileName,
      dscFileName: user.dscFileName,
    };

    res.status(200).json({
      message: "User profile data retrieved",
      userdata: formattedUser,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const get_user = async (req, res) => {
  try {
    const { userId } = req.params; // Assuming userId is passed as a URL parameter

    // Fetch the user with related data
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: {
        roles: {
          include: {
            role: {
              select: {
                id: true,
                role: true,
                departmentId: true,
                isActive: true,
              },
            },
          },
        },
        branches: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        headOfDepartments: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        adminOfDepartments: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Format the response
    const formattedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      specialUser: user.specialUser,
      isRootLevel: user.isRootLevel,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      status: user.status,
      permissions: {
        writable: user.writable,
        readable: user.readable,
        downloadable: user.downloadable,
        uploadable: user.uploadable,
      },
      roles: user.roles.map(
        (userRole) =>
          // {
          userRole.role.id,
        // name: userRole.role.role,
        // departmentId: userRole.role.departmentId,
        // isActive: userRole.role.isActive,
        // }
      ),
      departments: {
        member: user.branches.map((dept) => ({
          id: dept.id,
          name: dept.name,
          code: dept.code,
        })),
        head: user.headOfDepartments.map((dept) => ({
          id: dept.id,
          name: dept.name,
          code: dept.code,
        })),
        admin: user.adminOfDepartments.map((dept) => ({
          id: dept.id,
          name: dept.name,
          code: dept.code,
        })),
      },
    };

    res
      .status(200)
      .json({ message: "User retrieved successfully", data: formattedUser });
  } catch (error) {
    console.error("Error retrieving user", error);
    return res.status(500).json({ message: "Error retrieving user" });
  }
};

export const edit_user = async (req, res) => {
  try {
    const { userId } = req.params; // Assuming userId is passed as a URL parameter
    const {
      username,
      email,
      name,
      specialUser,
      isRootLevel,
      isAdmin,
      roles,
      permissions,
      status,
    } = req.body;

    // Check if the user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check for username/email uniqueness if provided
    if (username && username !== existingUser.username) {
      const usernameExists = await prisma.user.findFirst({
        where: { username },
      });
      if (usernameExists) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: { email },
      });
      if (emailExists) {
        return res.status(400).json({ message: "Email already taken" });
      }
    }

    // Validate roles if provided
    if (roles) {
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
    }

    // Prepare update data
    const updateData = {
      ...(username && { username }),
      ...(email && { email }),
      ...(name && { name }),
      ...(status && { status }),
      ...(typeof specialUser === "boolean" && { specialUser }),
      ...(typeof isRootLevel === "boolean" && { isRootLevel }),
      ...(typeof isAdmin === "boolean" && { isAdmin }),
      ...(permissions?.writable && { writable: permissions.writable }),
      ...(permissions?.readable && { readable: permissions.readable }),
      ...(permissions?.downloadable && {
        downloadable: permissions.downloadable,
      }),
      ...(permissions?.uploadable && { uploadable: permissions.uploadable }),
    };

    // Start a transaction to update user and roles
    const updatedUser = await prisma.$transaction(async (tx) => {
      // Update user details
      const user = await tx.user.update({
        where: { id: parseInt(userId) },
        data: updateData,
      });

      // Update roles if provided
      if (roles) {
        // Delete existing UserRole entries
        await tx.userRole.deleteMany({
          where: { userId: parseInt(userId) },
        });

        // Create new UserRole entries
        await tx.userRole.createMany({
          data: roles.map((roleId) => ({
            userId: user.id,
            roleId,
          })),
        });
      }

      return user;
    });

    res
      .status(200)
      .json({ message: "User updated successfully", data: updatedUser });
  } catch (error) {
    console.error("Error updating user", error);
    return res.status(500).json({ message: "Error updating user" });
  }
};

export const get_user_signature_id = async (req, res) => {
  try {
    let userId = parseInt(req.params.userId);

    console.log("user id", userId);
    const userData = await prisma.user.findFirst({
      where: {
        id: parseInt(userId),
      },
    });

    if (!userId) {
      return res.status(400).json({ message: "User ID required" });
    }

    // Fetch the user's signature
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { signaturePicFileName: true },
    });

    if (!user?.signaturePicFileName) {
      return res.status(404).json({ message: "Signature not uploaded" });
    }

    const imagePath = path.join(
      __dirname,
      process.env.SIGNATURE_FOLDER_PATH, // make sure this is absolute path
      user.signaturePicFileName,
    );

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ message: "Signature file not found" });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error("Error getting signature:", error);
    res.status(500).json({ message: "Error retrieving signature" });
  }
};

export const get_user_signature = async (req, res) => {
  try {
    console.log("reached in signature");

    const accessToken = req.headers["authorization"]?.substring(7);
    const requestingUser = await verifyUser(accessToken);

    if (requestingUser === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    console.log("req params", req.params);
    let { userId } = parseInt(req.params.userId);

    let userData;

    if (userId) {
      userData = await prisma.user.findFirst({
        where: {
          id: parseInt(userId),
        },
      });
    } else {
      userId = requestingUser.id;
      userData = requestingUser;
    }

    console.log("user id", userId);

    if (!userId) {
      return res.status(400).json({ message: "User ID required" });
    }

    // Fetch the user's signature
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { signaturePicFileName: true },
    });

    if (!user?.signaturePicFileName) {
      return res.status(404).json({ message: "Signature not uploaded" });
    }

    const imagePath = path.join(
      __dirname,
      process.env.SIGNATURE_FOLDER_PATH, // make sure this is absolute path
      user.signaturePicFileName,
    );

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ message: "Signature file not found" });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error("Error getting signature:", error);
    res.status(500).json({ message: "Error retrieving signature" });
  }
};

export const get_user_profile_pic = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userData.id },
      select: { profilePicFileName: true },
    });

    if (!user?.profilePicFileName) {
      return res.status(400).json({ message: "Please upload profile picture" });
    }

    const imagePath = path.join(
      __dirname,
      process.env.PROFILE_PIC_FOLDER_PATH, // Use absolute path in env
      user.profilePicFileName,
    );

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ message: "Profile picture not found" });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error("Error getting profile pic:", error);
    res.status(500).json({ message: "Error retrieving profile picture" });
  }
};

export const get_user_dsc = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userData.id },
      select: { dscFileName: true },
    });

    if (!user?.dscFileName) {
      return res.status(400).json({ message: "Please upload DSC" });
    }

    const imagePath = path.join(
      __dirname,
      process.env.DSC_FOLDER_PATH, // Use absolute path in env
      user.dscFileName,
    );

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ message: "DSC not found" });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error("Error getting DSC:", error);
    res.status(500).json({ message: "Error retrieving DSC" });
  }
};

export const deactivate_user = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { id } = req.params;

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { status: "Inactive" },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "User deactivated successfully" });
  } catch (error) {
    console.error("Error deactivating user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

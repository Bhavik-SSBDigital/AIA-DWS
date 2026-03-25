import { PrismaClient } from "@prisma/client";

import { verifyUser } from "../utility/verifyUser.js";
const prisma = new PrismaClient();

// Utility function to remove duplicates
const removeDuplicates = (arr) => [...new Set(arr)];

/*
{
  "role": "Project Manager",
  "department": "IT Department", // Only required if the role is not root-level
  "selectedUpload": [101, 102], // Document IDs with upload access
  "selectedDownload": [103, 104], // Document IDs with download access
  "selectedView": [105, 106], // Document IDs with view access
  "fullAccess": [
    { "id": 201, "upload": true, "download": true, "view": true }, // Full access document
    { "id": 202, "upload": false, "download": true, "view": true } // Partial full access
  ],
  "isRootLevel": false, // Set to true if creating a root-level role
  "parentRoleId": 3 // Parent role ID (optional, for hierarchy)
}

*/
export const add_role = async (req, res) => {
  try {
    const {
      role,
      department,
      selectedUpload,
      selectedDownload,
      selectedView,
      fullAccess,
      parentRoleId,
      isRootLevel,
      isAdmin,
      isDepartmentHead,
      status,
    } = req.body;

    // Check if department is required and exists
    let departmentObj = null;
    if (!isRootLevel && department) {
      departmentObj = await prisma.department.findUnique({
        where: { id: parseInt(department) },
      });
      if (!departmentObj) {
        return res.status(400).json({
          message: "Department selected for role doesn't exist.",
        });
      }
    }

    // Check for duplicate role
    const existingRole = await prisma.role.findFirst({
      where: {
        role,
        departmentId: departmentObj?.id || null,
      },
    });
    if (existingRole) {
      return res.status(400).json({
        message: "Role with the same name and department already exists.",
      });
    }

    // Process document permissions
    const documentAccesses = [];

    // Handle FULL access permissions
    fullAccess.forEach((doc) => {
      documentAccesses.push({
        documentId: doc.id,
        roleId: null, // Will be set after role creation
        accessType: ["READ", "EDIT", "DOWNLOAD"],
        accessLevel: "FULL",
        docAccessThrough: "ADMINISTRATION",
      });
    });

    // Handle STANDARD access permissions
    const processStandardAccess = (ids, accessTypes) => {
      ids.forEach((id) => {
        documentAccesses.push({
          documentId: id,
          roleId: null, // Will be set after role creation
          accessType: accessTypes,
          accessLevel: "STANDARD",
          docAccessThrough: "ADMINISTRATION",
        });
      });
    };

    processStandardAccess(selectedView, ["READ"]);
    processStandardAccess(selectedDownload, ["READ", "DOWNLOAD"]);
    processStandardAccess(selectedUpload, ["READ", "EDIT"]);

    const roleStatus = status || "Active";

    // Create the role and its document accesses in a transaction
    const [newRole] = await prisma.$transaction([
      prisma.role.create({
        data: {
          role,
          status: roleStatus,
          departmentId: departmentObj?.id || null,
          isRootLevel: Boolean(isRootLevel),
          isAdmin: Boolean(isAdmin),
          isDepartmentHead: Boolean(isDepartmentHead),
          parentRoleId: parentRoleId ? parseInt(parentRoleId) : null,
        },
      }),
      ...documentAccesses.map((access) =>
        prisma.documentAccess.create({
          data: {
            ...access,
            roleId: undefined, // Placeholder for the role ID
          },
        }),
      ),
    ]);

    // Update the document accesses with the new role ID
    await prisma.documentAccess.updateMany({
      where: {
        documentId: { in: documentAccesses.map((a) => a.documentId) },
        roleId: null,
      },
      data: { roleId: newRole.id },
    });

    res.status(201).json({
      message: "Role created successfully.",
      role: newRole,
    });
  } catch (error) {
    console.error("Error adding role:", error);
    res.status(500).json({
      message: "Error adding role.",
      error: "failed to create role",
    });
  }
};

/*
  isRootLevel: true, 
  departmentName: "IT Department"
*/
export const get_roles = async (req, res) => {
  try {
    const { isRootLevel, departmentName, fromAdmin } = req.query;
    const filters = {};
    if (typeof isRootLevel !== "undefined") {
      filters.isRootLevel = isRootLevel === "true";
    }
    if (departmentName) {
      const department = await prisma.department.findUnique({
        where: { name: departmentName },
        select: { id: true },
      });
      if (!department) {
        return res
          .status(400)
          .json({ message: "The specified department does not exist." });
      }
      filters.departmentId = department.id;
    }
    if (!fromAdmin) {
      filters.status = "Active";
    }
    const roles = await prisma.role.findMany({
      where: filters,
      select: {
        id: true,
        role: true,
        departmentId: true,
        isRootLevel: true,
        isAdmin: true,
        isDepartmentHead: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        branch: {
          select: {
            name: true,
          },
        },
      },
    });
    const formattedRoles = roles.map((role) => ({
      id: role.id,
      role: role.role,
      isRootLevel: role.isRootLevel,
      isDepartmentHead: role.isDepartmentHead,
      departmentId: role.departmentId,
      departmentName: role.branch?.name || null,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      status: role.status,
    }));
    res.status(200).json({
      message: "Roles fetched successfully.",
      roles: formattedRoles,
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({
      message: "Error fetching roles.",
      error: "failed to fetch roles",
    });
  }
};

export const get_role = async (req, res) => {
  try {
    const { id } = req.params;

    // Get role with department and parent role info
    const role = await prisma.role.findUnique({
      where: { id: parseInt(id) },
      include: {
        branch: {
          select: { id: true, name: true },
        },
        parentRole: {
          select: { id: true, role: true },
        },
      },
    });

    if (!role) {
      return res.status(404).json({ message: "Role not found." });
    }

    // Get all document accesses for this role
    const documentAccesses = await prisma.documentAccess.findMany({
      where: { roleId: parseInt(id) },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            path: true,
            type: true,
          },
        },
      },
    });

    // Organize permissions
    const selectedUpload = [];
    const selectedDownload = [];
    const selectedView = [];
    const fullAccess = [];

    documentAccesses.forEach((access) => {
      if (access.accessLevel === "FULL") {
        fullAccess.push({
          id: access.document.id,
          name: access.document.name,
          path: access.document.path,
          type: access.document.type,
          upload: true,
          download: true,
          view: true,
        });
      } else {
        if (access.accessType.includes("EDIT")) {
          selectedUpload.push(access.document.id);
        }
        if (access.accessType.includes("DOWNLOAD")) {
          selectedDownload.push(access.document.id);
        }
        if (access.accessType.includes("READ")) {
          selectedView.push(access.document.id);
        }
      }
    });

    // Format the response
    const formattedRole = {
      id: role.id,
      role: role.role,
      status: role.status,
      department: role.department
        ? {
            id: role.department.id,
            name: role.department.name,
          }
        : null,
      isRootLevel: role.isRootLevel,
      isAdmin: role.isAdmin,
      isDepartmentHead: role.isDepartmentHead,
      parentRoleId: role.parentRoleId,
      parentRole: role.parentRole,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      selectedUpload: [...new Set(selectedUpload)],
      selectedDownload: [...new Set(selectedDownload)],
      selectedView: [...new Set(selectedView)],
      fullAccess: fullAccess,
    };

    res.status(200).json({
      message: "Role fetched successfully.",
      role: formattedRole,
    });
  } catch (error) {
    console.error("Error fetching role:", error);
    res.status(500).json({
      message: "Error fetching role.",
      error: "failed to fetch role",
    });
  }
};

export const edit_role = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      role,
      department,
      selectedUpload,
      selectedDownload,
      selectedView,
      fullAccess,
      parentRoleId,
      isRootLevel,
      isAdmin,
      isDepartmentHead,
    } = req.body;

    // Check if role exists
    const existingRole = await prisma.role.findUnique({
      where: { id: parseInt(id) },
    });
    if (!existingRole) {
      return res.status(404).json({ message: "Role not found." });
    }

    // Check if department exists if provided
    let departmentObj = null;
    if (!isRootLevel && department) {
      departmentObj = await prisma.department.findUnique({
        where: { id: parseInt(department) },
      });
      if (!departmentObj) {
        return res.status(400).json({
          message: "Department selected for role doesn't exist.",
        });
      }
    }

    // Check for duplicate role (excluding current role)
    const duplicateRole = await prisma.role.findFirst({
      where: {
        role,
        departmentId: departmentObj?.id || null,
        id: { not: parseInt(id) },
      },
    });
    if (duplicateRole) {
      return res.status(400).json({
        message:
          "Another role with the same name and department already exists.",
      });
    }

    // Process document permissions
    const newDocumentAccesses = [];
    const documentIds = new Set();

    // Process FULL access
    fullAccess.forEach((doc) => {
      documentIds.add(doc.id);
      newDocumentAccesses.push({
        documentId: doc.id,
        accessType: ["READ", "EDIT", "DOWNLOAD"],
        accessLevel: "FULL",
        docAccessThrough: "ADMINISTRATION",
      });
    });

    // Process STANDARD access
    const processStandardAccess = (ids, accessTypes) => {
      ids.forEach((id) => {
        documentIds.add(id);
        newDocumentAccesses.push({
          documentId: id,
          accessType: accessTypes,
          accessLevel: "STANDARD",
          docAccessThrough: "ADMINISTRATION",
        });
      });
    };

    processStandardAccess(selectedView, ["READ"]);
    processStandardAccess(selectedDownload, ["READ", "DOWNLOAD"]);
    processStandardAccess(selectedUpload, ["READ", "EDIT"]);

    // Update role and document accesses in a transaction
    await prisma.$transaction([
      // Update role details
      prisma.role.update({
        where: { id: parseInt(id) },
        data: {
          role,
          departmentId: departmentObj?.id || null,
          isRootLevel: Boolean(isRootLevel),
          isAdmin: Boolean(isAdmin),
          isDepartmentHead: Boolean(isDepartmentHead),
          parentRoleId: parentRoleId ? parseInt(parentRoleId) : null,
          updatedAt: new Date(),
        },
      }),

      // Delete existing document accesses for this role
      prisma.documentAccess.deleteMany({
        where: { roleId: parseInt(id) },
      }),

      // Create new document accesses
      ...newDocumentAccesses.map((access) =>
        prisma.documentAccess.create({
          data: {
            ...access,
            roleId: parseInt(id),
          },
        }),
      ),
    ]);

    res.status(200).json({
      message: "Role updated successfully.",
    });
  } catch (error) {
    console.error("Error editing role:", error);
    res.status(500).json({
      message: "Error editing role.",
      error: "failed to edit role",
    });
  }
};

// export const getRolesHierarchyInDepartment = async (req, res) => {
//   const { departmentId } = req.params; // Get departmentId from request params

//   try {
//     // Fetch the department to get its name
//     const department = await prisma.department.findUnique({
//       where: { id: Number(departmentId) },
//     });

//     if (!department) {
//       return res.status(404).json({ message: "Department not found." });
//     }

//     // Fetch all roles for the department and their relationships
//     const roles = await prisma.role.findMany({
//       where: { departmentId: Number(departmentId) },
//       include: {
//         parentRole: true, // Include parent role for reference
//         childRoles: true, // Include child roles to build hierarchy
//       },
//     });

//     // Check if there are roles in the department
//     if (!roles || roles.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "No roles found for this department." });
//     }

//     // Identify top-level roles (roles with no parent in the same department)
//     const topRoles = roles.filter(
//       (role) =>
//         !role.parentRoleId || // No parent role
//         (role.parentRole &&
//           role.parentRole.departmentId !== Number(departmentId)) // Parent role is external
//     );

//     // Recursive function to build hierarchy
//     const buildHierarchy = (roles, parentRoleId) =>
//       roles
//         .filter((role) => role.parentRoleId === parentRoleId) // Filter roles by parentRoleId
//         .map((role) => ({
//           name: role.role,
//           children: buildHierarchy(roles, role.id), // Recursive call for children
//         }));

//     // Build hierarchies for all top-level roles
//     const hierarchies = topRoles.map((topRole) => ({
//       name: topRole.role,
//       children: buildHierarchy(roles, topRole.id),
//     }));

//     // Final response with department name as root
//     const responseHierarchy = {
//       name: department.name, // Use the actual department name
//       children: hierarchies,
//     };

//     res.json({ data: [responseHierarchy] });
//   } catch (error) {
//     console.error("Error fetching department roles:", error);
//     res.status(500).json({ error: "An error occurred while fetching roles." });
//   }
// };

export const getRolesHierarchyInDepartment = async (req, res) => {
  const { departmentId } = req.params;

  try {
    const department = await prisma.department.findUnique({
      where: { id: Number(departmentId) },
    });

    if (!department) {
      return res.status(404).json({ message: "Department not found." });
    }

    const roles = await prisma.role.findMany({
      where: { departmentId: Number(departmentId) },
      include: {
        parentRole: true,
        childRoles: true,
      },
    });

    if (!roles || roles.length === 0) {
      return res
        .status(404)
        .json({ message: "No roles found for this department." });
    }

    const topRoles = roles.filter(
      (role) =>
        !role.parentRoleId ||
        (role.parentRole &&
          role.parentRole.departmentId !== Number(departmentId)),
    );

    // Modified buildHierarchy to include IDs
    const buildHierarchy = (roles, parentRoleId) =>
      roles
        .filter((role) => role.parentRoleId === parentRoleId)
        .map((role) => ({
          id: role.id, // Add role ID
          name: role.role,
          children: buildHierarchy(roles, role.id),
        }));

    // Include IDs in top roles
    const hierarchies = topRoles.map((topRole) => ({
      id: topRole.id, // Add top role ID
      name: topRole.role,
      children: buildHierarchy(roles, topRole.id),
    }));

    const responseHierarchy = {
      id: department.id, // Optional: include department ID in root
      name: department.name,
      children: hierarchies,
    };

    res.json({ data: [responseHierarchy] });
  } catch (error) {
    console.error("Error fetching department roles:", error);
    res.status(500).json({ error: "An error occurred while fetching roles." });
  }
};

export const deactivate_role = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { id } = req.params;

    const role = await prisma.role.update({
      where: { id: parseInt(id) },
      data: { isActive: false },
    });

    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }

    return res.status(200).json({ message: "Role deactivated successfully" });
  } catch (error) {
    console.error("Error deactivating role:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

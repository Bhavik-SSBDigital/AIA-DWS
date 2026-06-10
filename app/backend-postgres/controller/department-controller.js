import { verifyUser } from "../utility/verifyUser.js";

import prisma from "../config/prisma-config.js";

/**
 * Registers a new department.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
// Add Department Function

/*
{
  "department": "string",
  "code": "string",
  "type": "string",
  "parentDepartmentId": "number (optional)",
  "adminId": "number (optional)"
}

*/
export const add_department = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    const { code, type, status } = req.body;

    const parentDepartmentId =
      req.body.parentDepartmentId !== ""
        ? parseInt(req.body.parentDepartmentId)
        : null;

    const adminId = req.body.adminId !== "" ? parseInt(req.body.adminId) : null;

    const name = req.body.department;

    // Validate required fields
    if (!name || !type) {
      return res.status(400).json({ error: "Name and type are required." });
    }

    const departmentStatus = status || "Active";

    // Create department in the database
    const newDepartment = await prisma.department.create({
      data: {
        name,
        code,
        type,
        parentDepartmentId,
        adminId,
        status: departmentStatus,
        createdById: userData.id,
      },
    });

    res.status(201).json({
      message: "Department registered successfully.",
      department: newDepartment,
    });
  } catch (error) {
    console.error("Error registering department:", error);
    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: "A department with this code or name already exists." });
    }
    res
      .status(500)
      .json({ error: "An error occurred while registering the department." });
  }
};

/*
{
  "id": "number"
}

*/
export const get_department = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Department ID is required." });
    }

    const department = await prisma.department.findUnique({
      where: { id: parseInt(id) },
    });

    department["department"] = department.name || "";
    if (!department) {
      return res.status(404).json({ error: "Department not found." });
    }

    res.status(200).json({ department });
  } catch (error) {
    console.error("Error fetching department:", error);
    res.status(500).json({
      error: "An error occurred while retrieving the department.",
    });
  }
};

/*
{
  "status": "string (optional)",
  "type": "string (optional)",
  "adminId": "number (optional)"
}

*/
export const get_departments = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }
    const { status, type, adminId, fromAdmin } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (adminId) filters.adminId = parseInt(adminId);
    if (!fromAdmin) {
      filters.status = "Active";
    }
    const departments = await prisma.department.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({
      error: "An error occurred while retrieving the departments.",
    });
  }
};

// Fetch hierarchical department data
export const getDepartmentsHierarchy = async (req, res) => {
  try {
    const departments = await prisma.department.findMany({
      include: {
        subDepartments: true, // Fetch related sub-departments
      },
    });

    // Recursive function to build hierarchy
    const buildHierarchy = (departments, parentId = null) =>
      departments
        .filter((dep) => dep.parentDepartmentId === parentId) // Filter by parent department
        .map((dep) => ({
          name: dep.name,
          children: buildHierarchy(departments, dep.id), // Recursive call for sub-departments
        }));

    // Build the full hierarchy starting from the root
    const hierarchy = buildHierarchy(departments);

    // Add a top-level "Organization" node
    const responseHierarchy = {
      name: "Organization",
      children: hierarchy,
    };

    res.json({ data: [responseHierarchy] });
  } catch (error) {
    console.error("Error fetching department hierarchy:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching departments." });
  }
};

export const add_workflow = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({
        message: "Unauthorized request",
      });
    }
  } catch (error) {
    console.log("Error adding workflow:", error);
    return res.status(500).json({
      message: "Error adding workflow",
    });
  }
};

export const deactivate_department = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { id } = req.params;

    const department = await prisma.department.update({
      where: { id: parseInt(id) },
      data: { status: "Inactive" },
    });

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    return res
      .status(200)
      .json({ message: "Department deactivated successfully" });
  } catch (error) {
    console.error("Error deactivating department:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

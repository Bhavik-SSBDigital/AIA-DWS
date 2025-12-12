import { PrismaClient } from "@prisma/client";

import { verifyUser } from "../utility/verifyUser.js";
import { file_copy } from "./file-controller.js";
import { buildRoleHierarchyForAssignment } from "./process-controller.js";
import {
  createFolder,
  createUserPermissions,
  getParentPath,
  storeChildIdInParentDocument,
} from "./file-controller.js";
import fs from "fs/promises";
import { createWriteStream, createReadStream, read } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, normalize, extname } from "path";
import fsCB from "fs";
import path from "path";
import XLSX from "xlsx";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { Document, Packer, Paragraph } from "docx";
import officegen from "officegen";
import { generateUniqueDocumentName } from "./process-controller.js";

const STORAGE_PATH = process.env.STORAGE_PATH;

const prisma = new PrismaClient();

export const add_workflow = async (req, res) => {
  const accessToken = req.headers["authorization"]?.substring(7);
  const userData = await verifyUser(accessToken);
  if (userData === "Unauthorized") {
    return res.status(401).json({ message: "Unauthorized request" });
  }

  const createdById = userData.id;
  const { name, description, steps } = req.body;

  if (!name || !steps || !steps.length) {
    return res
      .status(400)
      .json({ error: "Workflow name and steps are required." });
  }

  try {
    const workflow = await prisma.$transaction(async (tx) => {
      const newWorkflow = await tx.workflow.create({
        data: { name, description, createdById, version: 1 },
      });

      const stepRecords = await Promise.all(
        steps.map(async (step, index) => {
          return tx.workflowStep.create({
            data: {
              workflowId: newWorkflow.id,
              stepNumber: index + 1,
              stepName: step.stepName,
              allowParallel: step.allowParallel ?? false,
              requiresDocument: step.requiresDocument ?? true,
            },
          });
        })
      );

      for (let i = 0; i < steps.length; i++) {
        const assignments = steps[i].assignments || [];

        if (assignments.length) {
          const departmentAssignments = [];
          const groupedAssignments = {};

          assignments.forEach((assignee) => {
            // Extract assigneeIds
            const assigneeIds = Array.isArray(assignee.assigneeIds)
              ? assignee.assigneeIds
                  .map((item) => item.id)
                  .filter((id) => id != null)
              : [];

            if (assignee.assigneeType === "DEPARTMENT") {
              // Create a separate assignment for each department
              assigneeIds.forEach((departmentId) => {
                // Find the selectedRoles entry for this department
                const roleEntry = (assignee.selectedRoles ?? []).find(
                  (role) => role.department === departmentId
                );
                const roleIds = roleEntry
                  ? (roleEntry.roles ?? [])
                      .filter((role) => role.id != null)
                      .map((role) => role.id)
                  : [];
                const allowParallel = roleEntry
                  ? roleEntry.allowParallel ?? false
                  : false;
                const direction = roleEntry
                  ? roleEntry.direction ?? assignee.direction
                  : assignee.direction;

                departmentAssignments.push({
                  ...assignee,
                  assigneeIds: [departmentId], // Single department per assignment
                  selectedRoles: roleIds,
                  allowParallel,
                  direction,
                });
              });
            } else {
              // Group non-DEPARTMENT assignments
              const roleIds = (assignee.selectedRoles ?? []).flatMap(
                ({ roles }) =>
                  (roles ?? [])
                    .filter((role) => role.id != null)
                    .map((role) => role.id)
              );

              assigneeIds.forEach((assigneeId) => {
                const allowParallelMapping = {};
                if (
                  assignee.selectedRoles &&
                  Array.isArray(assignee.selectedRoles)
                ) {
                  assignee.selectedRoles.forEach((role) => {
                    if (role.department && Array.isArray(role.roles)) {
                      role.roles.forEach((r) => {
                        allowParallelMapping[role.department] =
                          role.allowParallel ?? false;
                      });
                    }
                  });
                }

                const allowParallel = allowParallelMapping[assigneeId] ?? false;
                const key = JSON.stringify({
                  assigneeType: assignee.assigneeType,
                  actionType: assignee.actionType,
                  accessTypes: Array.isArray(assignee.accessTypes)
                    ? assignee.accessTypes.sort()
                    : [],
                  direction: assignee.direction ?? null,
                  allowParallel,
                  selectedRoles: roleIds.sort(),
                });

                if (!groupedAssignments[key]) {
                  groupedAssignments[key] = { ...assignee, assigneeIds: [] };
                }
                groupedAssignments[key].assigneeIds.push(Number(assigneeId));
              });
            }
          });

          // Combine grouped non-DEPARTMENT and ungrouped DEPARTMENT assignments
          const allAssignments = [
            ...Object.values(groupedAssignments),
            ...departmentAssignments,
          ];

          await tx.workflowAssignment.createMany({
            data: allAssignments.map((assignee) => ({
              stepId: stepRecords[i].id,
              assigneeType: assignee.assigneeType,
              assigneeIds: assignee.assigneeIds,
              actionType: assignee.actionType,
              accessTypes: Array.isArray(assignee.accessTypes)
                ? assignee.accessTypes
                : [],
              direction: assignee.direction ?? null,
              allowParallel: assignee.allowParallel ?? false,
              selectedRoles:
                assignee.assigneeType === "DEPARTMENT"
                  ? assignee.selectedRoles ?? []
                  : [],
            })),
          });

          const createdAssignments = await tx.workflowAssignment.findMany({
            where: { stepId: stepRecords[i].id },
            select: { id: true, assigneeType: true },
            orderBy: { id: "asc" }, // Ensure consistent order
          });

          const departmentRoleAssignments = assignments
            .filter((assignee) => assignee.assigneeType === "DEPARTMENT")
            .flatMap((assignee) => {
              return (assignee.assigneeIds ?? []).flatMap((dept) => {
                const departmentId = dept.id;
                const roleEntry = (assignee.selectedRoles ?? []).find(
                  (role) => role.department === departmentId
                );
                if (!roleEntry || !Array.isArray(roleEntry.roles)) return [];

                // Find the corresponding WorkflowAssignment for this department
                const assignment = createdAssignments.find(
                  (ca, idx) =>
                    ca.assigneeType === "DEPARTMENT" &&
                    idx >=
                      createdAssignments.length -
                        departmentAssignments.length &&
                    departmentAssignments[
                      idx -
                        (createdAssignments.length -
                          departmentAssignments.length)
                    ].assigneeIds[0] === departmentId
                );

                if (!assignment) return [];

                return roleEntry.roles
                  .filter((role) => role.id != null)
                  .map((role) => ({
                    workflowAssignmentId: assignment.id,
                    departmentId,
                    roleId: role.id,
                  }));
              });
            });

          if (departmentRoleAssignments.length > 0) {
            await tx.departmentRoleAssignment.createMany({
              data: departmentRoleAssignments,
            });
          }
        }
      }

      const created = await createFolder(true, `../${name}`, userData);
      console.log("created", created);
      return newWorkflow;
    });

    return res
      .status(201)
      .json({ message: "Workflow created successfully", workflow });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create workflow" });
  }
};

export const edit_workflow = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { name, description, steps, id: workflowId } = req.body;

    const updatedById = userData.id;
    const oldWorkflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: true },
    });

    if (!oldWorkflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    const newWorkflow = await prisma.$transaction(async (tx) => {
      const latestVersion = await tx.workflow.findFirst({
        where: { name: oldWorkflow.name },
        orderBy: { version: "desc" },
      });

      const newWorkflow = await tx.workflow.create({
        data: {
          name,
          description,
          createdById: updatedById,
          version: latestVersion ? latestVersion.version + 1 : 1,
          previousVersionId: oldWorkflow.id,
          isActive: true,
        },
      });

      const stepRecords = await Promise.all(
        steps.map(async (step, index) => {
          return tx.workflowStep.create({
            data: {
              workflowId: newWorkflow.id,
              stepNumber: index + 1,
              stepName: step.stepName,
              allowParallel: step.allowParallel ?? false,
              requiresDocument: step.requiresDocument ?? true,
            },
          });
        })
      );

      for (let i = 0; i < steps.length; i++) {
        const assignments = steps[i].assignments || [];
        if (assignments.length) {
          const departmentAssignments = [];
          const groupedAssignments = {};

          assignments.forEach((assignee) => {
            // Extract assigneeIds
            const assigneeIds = Array.isArray(assignee.assigneeIds)
              ? assignee.assigneeIds
                  .map((item) => item.id)
                  .filter((id) => id != null)
              : [];

            if (assignee.assigneeType === "DEPARTMENT") {
              // Create a separate assignment for each department
              assigneeIds.forEach((departmentId) => {
                // Find the selectedRoles entry for this department
                const roleEntry = (assignee.selectedRoles ?? []).find(
                  (role) => role.department === departmentId
                );
                const roleIds = roleEntry
                  ? (roleEntry.roles ?? [])
                      .filter((role) => role.id != null)
                      .map((role) => role.id)
                  : [];
                const allowParallel = roleEntry
                  ? roleEntry.allowParallel ?? false
                  : false;
                const direction = roleEntry
                  ? roleEntry.direction ?? assignee.direction
                  : assignee.direction;

                departmentAssignments.push({
                  ...assignee,
                  assigneeIds: [departmentId], // Single department per assignment
                  selectedRoles: roleIds,
                  allowParallel,
                  direction,
                });
              });
            } else {
              // Group non-DEPARTMENT assignments
              const roleIds = (assignee.selectedRoles ?? []).flatMap(
                ({ roles }) =>
                  (roles ?? [])
                    .filter((role) => role.id != null)
                    .map((role) => role.id)
              );

              assigneeIds.forEach((assigneeId) => {
                const allowParallelMapping = {};
                if (
                  assignee.selectedRoles &&
                  Array.isArray(assignee.selectedRoles)
                ) {
                  assignee.selectedRoles.forEach((role) => {
                    if (role.department && Array.isArray(role.roles)) {
                      role.roles.forEach((r) => {
                        allowParallelMapping[role.department] =
                          role.allowParallel ?? false;
                      });
                    }
                  });
                }

                const allowParallel = allowParallelMapping[assigneeId] ?? false;
                const key = JSON.stringify({
                  assigneeType: assignee.assigneeType,
                  actionType: assignee.actionType,
                  accessTypes: Array.isArray(assignee.accessTypes)
                    ? assignee.accessTypes.sort()
                    : [],
                  direction: assignee.direction ?? null,
                  allowParallel,
                  selectedRoles: roleIds.sort(),
                });

                if (!groupedAssignments[key]) {
                  groupedAssignments[key] = { ...assignee, assigneeIds: [] };
                }
                groupedAssignments[key].assigneeIds.push(Number(assigneeId));
              });
            }
          });

          // Combine grouped non-DEPARTMENT and ungrouped DEPARTMENT assignments
          const allAssignments = [
            ...Object.values(groupedAssignments),
            ...departmentAssignments,
          ];

          await tx.workflowAssignment.createMany({
            data: allAssignments.map((assignee) => ({
              stepId: stepRecords[i].id,
              assigneeType: assignee.assigneeType,
              assigneeIds: assignee.assigneeIds,
              actionType: assignee.actionType,
              accessTypes: Array.isArray(assignee.accessTypes)
                ? assignee.accessTypes
                : [],
              direction: assignee.direction ?? null,
              allowParallel: assignee.allowParallel ?? false,
              selectedRoles: assignee.selectedRoles ?? [],
            })),
          });

          const createdAssignments = await tx.workflowAssignment.findMany({
            where: { stepId: stepRecords[i].id },
            select: { id: true, assigneeType: true },
            orderBy: { id: "asc" }, // Ensure consistent order
          });

          const departmentRoleAssignments = assignments
            .filter((assignee) => assignee.assigneeType === "DEPARTMENT")
            .flatMap((assignee) => {
              return (assignee.assigneeIds ?? []).flatMap((dept) => {
                const departmentId = dept.id;
                const roleEntry = (assignee.selectedRoles ?? []).find(
                  (role) => role.department === departmentId
                );
                if (!roleEntry || !Array.isArray(roleEntry.roles)) return [];

                // Find the corresponding WorkflowAssignment for this department
                const assignment = createdAssignments.find(
                  (ca, idx) =>
                    ca.assigneeType === "DEPARTMENT" &&
                    idx >=
                      createdAssignments.length -
                        departmentAssignments.length &&
                    departmentAssignments[
                      idx -
                        (createdAssignments.length -
                          departmentAssignments.length)
                    ].assigneeIds[0] === departmentId
                );

                if (!assignment) return [];

                return roleEntry.roles
                  .filter((role) => role.id != null)
                  .map((role) => ({
                    workflowAssignmentId: assignment.id,
                    departmentId,
                    roleId: role.id,
                  }));
              });
            });

          if (departmentRoleAssignments.length > 0) {
            await tx.departmentRoleAssignment.createMany({
              data: departmentRoleAssignments,
            });
          }
        }
      }

      await tx.workflow.update({
        where: { id: oldWorkflow.id },
        data: { isActive: false },
      });

      return newWorkflow;
    });

    return res.status(200).json({
      message: "Workflow updated successfully",
      workflow: newWorkflow,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update workflow" });
  }
};

export const view_workflow = async (req, res) => {
  const { workflowId } = req.params;

  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        createdBy: { select: { id: true, username: true } },
        previousVersion: { select: { id: true, name: true, version: true } },
        steps: {
          include: {
            assignments: {
              include: {
                departmentRoles: {
                  include: { department: true, role: true },
                },
              },
            },
          },
          orderBy: { stepNumber: "asc" },
        },
      },
    });

    if (!workflow) return res.status(404).json({ error: "Workflow not found" });

    // Fetch all role details in bulk for better performance
    const allRoleIds = new Set();

    // Collect role IDs from departmentRoles and selectedRoles
    workflow.steps.forEach((step) => {
      step.assignments.forEach((assignment) => {
        // Add role IDs from departmentRoles
        assignment.departmentRoles.forEach((dr) => {
          allRoleIds.add(dr.roleId);
        });

        // Add role IDs from selectedRoles (for non-DEPARTMENT assignments)
        if (
          assignment.assigneeType !== "DEPARTMENT" &&
          Array.isArray(assignment.selectedRoles)
        ) {
          assignment.selectedRoles.forEach((roleId) => {
            allRoleIds.add(roleId);
          });
        }
      });
    });

    // Fetch all roles at once
    const roles = await prisma.role.findMany({
      where: { id: { in: Array.from(allRoleIds) } },
      select: { id: true, role: true },
    });

    const roleMap = new Map(roles.map((r) => [r.id, r.role]));

    const formattedWorkflow = {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      previousVersion: workflow.previousVersion,
      createdBy: workflow.createdBy.username,
      steps: workflow.steps.map((step) => ({
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        allowParallel: step.allowParallel,
        requiresDocument: step.requiresDocument,
        assignments: step.assignments.map((assignee) => {
          // Format for DEPARTMENT assignments
          if (assignee.assigneeType === "DEPARTMENT") {
            const departmentRoles = assignee.departmentRoles.reduce(
              (acc, dr) => {
                const dept = acc.find(
                  (d) => d.department.id === dr.department.id
                );
                if (dept) {
                  dept.roles.push({ id: dr.role.id, name: dr.role.role });
                } else {
                  acc.push({
                    department: {
                      id: dr.department.id,
                      name: dr.department.name,
                    },
                    roles: [{ id: dr.role.id, name: dr.role.role }],
                  });
                }
                return acc;
              },
              []
            );

            return {
              assigneeType: assignee.assigneeType,
              assigneeIds: assignee.assigneeIds,
              actionType: assignee.actionType,
              accessTypes: assignee.accessTypes,
              direction: assignee.direction,
              allowParallel: assignee.allowParallel,
              selectedRoles: departmentRoles,
            };
          }
          // Format for non-DEPARTMENT assignments (ROLE/USER)
          else {
            return {
              assigneeType: assignee.assigneeType,
              assigneeIds: assignee.assigneeIds,
              actionType: assignee.actionType,
              accessTypes: assignee.accessTypes,
              direction: assignee.direction,
              allowParallel: assignee.allowParallel,
              selectedRoles: Array.isArray(assignee.selectedRoles)
                ? assignee.selectedRoles.map((roleId) => ({
                    id: roleId,
                    name: roleMap.get(roleId) || "Unknown Role",
                  }))
                : [],
            };
          }
        }),
      })),
    };

    return res.status(200).json(formattedWorkflow);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to retrieve workflow" });
  }
};

/*
AS A URL PARAM: workflowId
*/
export const delete_workflow = async (req, res) => {
  const { workflowId } = req.params;

  try {
    const activeProcesses = await prisma.processInstance.count({
      where: { workflowId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });

    if (activeProcesses > 0) {
      return res.status(400).json({
        error: "Cannot deactivate workflow. Active processes are using it.",
      });
    }

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { isActive: false },
    });

    return res
      .status(200)
      .json({ message: "Workflow deactivated successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to deactivate workflow" });
  }
};

export const get_workflows = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // Fetch user's roles for ROLE and DEPARTMENT checks
    const userRoles = await prisma.userRole.findMany({
      where: { userId: userData.id },
      select: { roleId: true },
    });
    const userRoleIds = userRoles.map((r) => r.roleId);

    // Fetch assignments for DEPARTMENT type to build hierarchies
    const departmentAssignments = await prisma.workflowAssignment.findMany({
      where: {
        assigneeType: "DEPARTMENT",
        step: {
          stepNumber: 1,
          workflow: {
            isActive: true,
          },
        },
      },
      select: {
        direction: true,
        allowParallel: true,
        selectedRoles: true,
      },
    });

    // Build role hierarchies for each department assignment
    const departmentRoleFilters = await Promise.all(
      departmentAssignments.map(async (assignment) => {
        const hierarchy = await buildRoleHierarchyForAssignment(
          assignment.direction,
          assignment.allowParallel,
          assignment.selectedRoles
        );
        // Check first level for UPWARDS, last level for DOWNWARDS
        const targetRoles =
          assignment.direction === "UPWARDS"
            ? hierarchy[0] || []
            : hierarchy[hierarchy.length - 1] || [];
        return targetRoles.some((roleId) => userRoleIds.includes(roleId));
      })
    );

    // Filter assignments where user roles match the hierarchy condition
    const validDepartmentAssignments = departmentAssignments
      .filter((_, index) => departmentRoleFilters[index])
      .map((assignment) => ({
        direction: assignment.direction,
        allowParallel: assignment.allowParallel,
        selectedRoles: assignment.selectedRoles,
      }));

    // Fetch workflows where user is assigned to step 1
    const workflows = await prisma.workflow.findMany({
      where: {
        isActive: true,
        steps: {
          some: {
            stepNumber: 1,
            assignments: {
              some: {
                OR: [
                  { assigneeType: "USER", assigneeIds: { has: userData.id } },
                  {
                    assigneeType: "ROLE",
                    assigneeIds: { hasSome: userRoleIds },
                  },
                  {
                    assigneeType: "DEPARTMENT",
                    OR: validDepartmentAssignments.map((assignment) => ({
                      direction: assignment.direction,
                      allowParallel: assignment.allowParallel,
                      selectedRoles: { hasSome: assignment.selectedRoles },
                    })),
                  },
                ],
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        steps: {
          select: {
            stepNumber: true,
            stepName: true,
            allowParallel: true,
            requiresDocument: true,
            assignments: {
              select: {
                id: true,
                assigneeType: true,
                assigneeIds: true,
                actionType: true,
                accessTypes: true,
                direction: true,
                allowParallel: true,
                selectedRoles: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Collect all assignee IDs by type and role IDs
    const departmentIds = new Set();
    const roleIds = new Set();
    const userIds = new Set();
    const selectedRoleIds = new Set();

    workflows.forEach((workflow) => {
      workflow.steps.forEach((step) => {
        step.assignments.forEach((assignment) => {
          assignment.assigneeIds.forEach((id) => {
            switch (assignment.assigneeType) {
              case "DEPARTMENT":
                departmentIds.add(id);
                break;
              case "ROLE":
                roleIds.add(id);
                break;
              case "USER":
                userIds.add(id);
                break;
            }
          });
          // Collect selectedRoles
          if (Array.isArray(assignment.selectedRoles)) {
            assignment.selectedRoles.forEach((roleId) =>
              selectedRoleIds.add(roleId)
            );
          }
        });
      });
    });

    // Fetch related entities in bulk
    const [departments, roles, users, selectedRoles] = await Promise.all([
      prisma.department.findMany({
        where: { id: { in: Array.from(departmentIds) } },
        select: { id: true, name: true },
      }),
      prisma.role.findMany({
        where: { id: { in: Array.from(roleIds) } },
        select: { id: true, role: true },
      }),
      prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, username: true },
      }),
      prisma.role.findMany({
        where: { id: { in: Array.from(selectedRoleIds) } },
        select: { id: true, role: true },
      }),
    ]);

    // Create lookup maps
    const departmentMap = new Map(departments.map((d) => [d.id, d.name]));
    const roleMap = new Map(roles.map((r) => [r.id, r.role]));
    const userMap = new Map(users.map((u) => [u.id, u.username]));
    const selectedRoleMap = new Map(selectedRoles.map((r) => [r.id, r.role]));

    // Enrich assigneeIds with names
    const processedWorkflows = workflows.map((workflow) => ({
      ...workflow,
      steps: workflow.steps.map((step) => ({
        ...step,
        assignments: step.assignments.map((assignment) => ({
          ...assignment,
          assigneeIds: assignment.assigneeIds.map((id) => {
            let name = "Unknown";
            switch (assignment.assigneeType) {
              case "DEPARTMENT":
                name = departmentMap.get(id) || "Unknown Department";
                break;
              case "ROLE":
                name = roleMap.get(id) || "Unknown Role";
                break;
              case "USER":
                name = userMap.get(id) || "Unknown User";
                break;
            }
            return { id, name };
          }),
          // Format selectedRoles to match add_workflow payload
          selectedRoles:
            assignment.assigneeType === "DEPARTMENT"
              ? [
                  {
                    direction: assignment.direction,
                    department: assignment.assigneeIds[0], // Assuming single department per assignment
                    roles: Array.isArray(assignment.selectedRoles)
                      ? assignment.selectedRoles.map((roleId) => ({
                          id: roleId,
                          name: selectedRoleMap.get(roleId) || "Unknown Role",
                        }))
                      : [],
                  },
                ]
              : Array.isArray(assignment.selectedRoles)
              ? assignment.selectedRoles.map((roleId) => ({
                  id: roleId,
                  name: selectedRoleMap.get(roleId) || "Unknown Role",
                }))
              : [],
        })),
      })),
    }));

    // Group workflows by name
    const groupedWorkflows = processedWorkflows.reduce((acc, workflow) => {
      const key = workflow.name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(workflow);
      return acc;
    }, {});

    return res.status(200).json({
      message: "Workflows retrieved successfully",
      workflows: Object.entries(groupedWorkflows).map(([name, versions]) => ({
        name,
        versions: versions.map((wf) => ({
          id: wf.id,
          version: wf.version,
          description: wf.description,
          createdBy: wf.createdBy,
          createdAt: wf.createdAt,
          steps: wf.steps.map((step) => ({
            stepNumber: step.stepNumber,
            stepName: step.stepName,
            allowParallel: step.allowParallel,
            requiresDocument: step.requiresDocument,
            assignments: step.assignments.map((a) => ({
              assigneeType: a.assigneeType,
              assigneeIds: a.assigneeIds,
              actionType: a.actionType,
              accessTypes: a.accessTypes,
              direction: a.direction,
              allowParallel: a.allowParallel,
              selectedRoles: a.selectedRoles,
            })),
          })),
        })),
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to retrieve workflows" });
  }
};

export const create_template_document = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"].substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }
    const { extension, workflowId, templateName } = req.body;

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, name: true },
    });

    const templatePath = path.join(
      __dirname,
      STORAGE_PATH,
      workflow.name,
      "templates",
      `${templateName}.${extension}`
    );

    const dirPath = path.join(
      __dirname,
      STORAGE_PATH,
      workflow.name,
      "templates"
    );

    console.log("templatePath", templatePath);
    try {
      await fs.access(dirPath);
      console.log("Templates directory exists");
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("Templates directory does not exist, creating it...");

        // const templateDirectory = await prisma.document.findUnique({
        //   where: { name: "templates", path: `/${workflow.name}/templates` },
        // });

        // if (templateDirectory) {
        //   await fs.rmdir(dirPath, { recursive: true });
        // }
        await fs.mkdir(dirPath, { recursive: true });
        const templa = await prisma.document.create({
          data: {
            name: "templates",
            path: `/${workflow.name}/templates`,
            createdById: userData.id,
            type: "folder",
          },
        });

        await createUserPermissions(templa.id, userData.username, true);

        const parentPath = getParentPath(`../${workflow.name}/templates`);

        await storeChildIdInParentDocument(parentPath, templa.id);

        const parentDocument = await prisma.document.findFirst({
          where: { path: `${STORAGE_PATH}/${workflow.name}` },
        });

        if (parentDocument) {
          await prisma.document.update({
            where: { id: parentDocument.id },
            data: {
              children: {
                connect: { id: templa.id },
              },
            },
          });
        }
      } else {
        throw error; // Re-throw other errors (e.g., permission issues)
      }
    }

    // Validate extension
    if (!extension || typeof extension !== "string") {
      return res
        .status(400)
        .json({ error: "File extension is required and must be a string" });
    }

    // Sanitize extension (remove leading dot if present and convert to lowercase)
    const cleanExtension = extension.replace(/^\./, "").toLowerCase();

    // Define supported Office extensions
    const supportedExtensions = [
      "docx", // Word Document
      "xlsx", // Excel Workbook
      "pptx", // PowerPoint Presentation
      "docm", // Word Macro-Enabled Document
      "xlsm", // Excel Macro-Enabled Workbook
      "pptm", // PowerPoint Macro-Enabled Presentation
      "dotx", // Word Template
      "xltx", // Excel Template
      "potx", // PowerPoint Template
    ];

    // Check if extension is supported
    if (!supportedExtensions.includes(cleanExtension)) {
      return res.status(400).json({ error: "Unsupported file extension" });
    }

    // Generate a unique filename using timestamp
    // const filename = `document_${Date.now()}.${cleanExtension}`;
    // const __dirname = path.dirname(new URL(import.meta.url).pathname);

    // Create content based on extension
    if (["docx", "docm", "dotx"].includes(cleanExtension)) {
      // Create a blank Word document
      const doc = new Document({
        sections: [{ children: [new Paragraph("")] }],
      });

      // Generate buffer and write to file
      const buffer = await Packer.toBuffer(doc);
      await fs.writeFile(templatePath, buffer);
    } else if (["xlsx", "xlsm", "xltx"].includes(cleanExtension)) {
      // Create a blank Excel workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([]),
        "Sheet1"
      );

      // Write the workbook to a file (synchronous)
      XLSX.writeFile(workbook, templatePath, { bookType: cleanExtension });
    } else if (["pptx", "pptm", "potx"].includes(cleanExtension)) {
      // Create a blank PowerPoint presentation using officegen
      const pptx = officegen("pptx");

      // Create a new slide
      const slide = pptx.makeNewSlide();
      slide.addText("", { x: 0, y: 0, font_size: 18 }); // Add empty text to create a blank slide

      // Write the presentation to a file
      await new Promise((resolve, reject) => {
        const out = fsCB.createWriteStream(templatePath);
        pptx.generate(out);
        out.on("close", resolve);
        out.on("error", reject);
      });
    }

    const newTemplate = await prisma.document.create({
      data: {
        name: `${templateName}.${extension}`,
        path: `/${workflow.name}/templates/${templateName}.${extension}`,
        createdById: userData.id,
        type: "file",
      },
    });

    await createUserPermissions(newTemplate.id, userData.username, true);

    const parentPath = getParentPath(`../${templatePath}`);

    await storeChildIdInParentDocument(parentPath, newTemplate.id);

    const parentDocument = await prisma.document.findFirst({
      where: { path: `/${workflow.name}/templates` },
    });

    console.log("parent path", parentPath);
    if (parentDocument) {
      await prisma.document.update({
        where: { id: parentDocument.id },
        data: {
          children: {
            connect: { id: newTemplate.id },
          },
        },
      });
    }

    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        templateDocuments: {
          connect: { id: newTemplate.id },
        },
      },
    });
    return res.status(201).json({
      message: "Blank Office document created successfully",
      templateName,
      path: `/${workflow.name}/templates/${templateName}.${extension}`,
      documentId: newTemplate.id,
    });
  } catch (error) {
    console.error("Error creating document:", error);
    return res.status(500).json({ error: "Failed to create document" });
  }
};

export const get_workflow_templates = async (req, res) => {
  try {
    // Extract and verify access token
    const accessToken = req.headers["authorization"]?.substring(7);
    if (!accessToken) {
      return res
        .status(401)
        .json({ message: "Authorization token is required" });
    }
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // Extract workflowId from request body or query
    const workflowId = req.params.workflowId;
    if (!workflowId) {
      return res.status(400).json({ error: "workflowId is required" });
    }

    // Fetch workflow with associated template documents
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        templateDocuments: {
          select: {
            id: true,
            name: true,
            path: true,
          },
          where: {
            type: "file", // Ensure only file-type documents (templates) are returned
            isArchived: false, // Exclude archived documents
            inBin: false, // Exclude documents in bin
          },
        },
      },
    });

    // Check if workflow exists
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    // Return template details
    return res.status(200).json({
      message: "Templates retrieved successfully",
      templates: workflow.templateDocuments,
    });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return res.status(500).json({ error: "Failed to fetch templates" });
  }
};

export const upload_template_document = async (req, res) => {
  try {
    // Extract and validate authorization token
    const accessToken = req.headers["authorization"]?.substring(7);
    if (!accessToken) {
      return res.status(401).json({ message: "Authorization token missing" });
    }

    // Verify user
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // Extract workflowId and file from request
    const { workflowId, purpose } = req.body;
    const file = req.file; // Provided by Multer

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!workflowId) {
      return res.status(400).json({ error: "Workflow ID is required" });
    }

    if (purpose !== "template") {
      return res.status(400).json({ error: "Invalid purpose specified" });
    }

    // Fetch workflow details
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, name: true },
    });

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    // Validate file extension (redundant with Multer fileFilter, but kept for safety)
    const extension = path
      .extname(file.originalname)
      .toLowerCase()
      .replace(/^\./, "");
    const supportedExtensions = [
      "docx",
      "docm",
      "dotx",
      "xlsx",
      "xlsm",
      "xltx",
      "pptx",
      "pptm",
      "potx",
    ];

    if (!supportedExtensions.includes(extension)) {
      return res.status(400).json({ error: "Unsupported file extension" });
    }

    // Define paths
    const templateName = path.basename(file.originalname, `.${extension}`);
    const templatePath = path.join(
      __dirname,
      "../",
      STORAGE_PATH,
      workflow.name,
      "templates",
      `${templateName}.${extension}`
    );
    const dirPath = path.join(
      __dirname,
      "../",
      STORAGE_PATH,
      workflow.name,
      "templates"
    );

    console.log("first");
    // Ensure templates directory exists and is in database
    try {
      await fs.access(dirPath);
      console.log("Templates directory exists");
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("Templates directory does not exist, creating it...");
        await fs.mkdir(dirPath, { recursive: true });

        // Create folder record in database
        const templateDir = await prisma.document.create({
          data: {
            name: "templates",
            path: `/${workflow.name}/templates`,
            createdById: userData.id,
            type: "folder",
          },
        });

        // Assign permissions to the folder
        await createUserPermissions(templateDir.id, userData.username, true);

        // Link folder to parent document
        const parentPath = getParentPath(`../${workflow.name}/templates`);
        await storeChildIdInParentDocument(parentPath, templateDir.id);

        const parentDocument = await prisma.document.findFirst({
          where: { path: `/${workflow.name}` },
        });

        if (parentDocument) {
          await prisma.document.update({
            where: { id: parentDocument.id },
            data: {
              children: {
                connect: { id: templateDir.id },
              },
            },
          });
        }
      } else {
        throw error;
      }
    }

    // File is already saved by Multer; create document record in database
    const newTemplate = await prisma.document.create({
      data: {
        name: `${templateName}.${extension}`,
        path: `/${workflow.name}/templates/${templateName}.${extension}`,
        createdById: userData.id,
        type: "file",
      },
    });

    // Assign permissions to the document
    await createUserPermissions(newTemplate.id, userData.username, true);

    // Link document to parent folder
    const parentPath = getParentPath(
      `../${workflow.name}/templates/${templateName}.${extension}`
    );
    await storeChildIdInParentDocument(parentPath, newTemplate.id);

    const parentDocument = await prisma.document.findFirst({
      where: { path: `/${workflow.name}/templates` },
    });

    if (parentDocument) {
      await prisma.document.update({
        where: { id: parentDocument.id },
        data: {
          children: {
            connect: { id: newTemplate.id },
          },
        },
      });
    }

    // Connect document to workflow
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        templateDocuments: {
          connect: { id: newTemplate.id },
        },
      },
    });

    // Return success response
    return res.status(201).json({
      message: "Template document uploaded successfully",
      templateName: `${templateName}.${extension}`,
      path: `/${workflow.name}/templates/${templateName}.${extension}`,
      documentId: newTemplate.id,
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    return res.status(500).json({ error: "Failed to upload document" });
  }
};

export const use_template_document = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    if (!accessToken) {
      return res.status(401).json({ message: "Authorization token missing" });
    }

    // Verify user
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    let { templateId, workflowId } = req.body;

    templateId = parseInt(templateId, 10);

    const document = await prisma.document.findUnique({
      where: { id: templateId },
      select: { path: true, name: true },
    });

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true },
    });

    try {
      await fs.access(
        path.join(__dirname, STORAGE_PATH, workflow.name, "temp")
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        await createFolder(false, `../${workflow.name}/temp`, userData);
      } else {
        throw error; // Re-throw other errors (e.g., permission issues)
      }
    }

    const sourcePath = `./${document.path}`;
    const destinationPath = `../${workflow.name}/temp`;
    console.log("workflow id", workflowId);
    console.log("doc path", document);
    const name = await generateUniqueDocumentName({
      workflowId: workflowId,
      replacedDocId: null,
      extension: document.name.split(".").pop(),
    });

    const response = await new Promise((resolve, reject) => {
      file_copy(
        {
          headers: { authorization: `Bearer ${accessToken}` },
          body: { sourcePath, destinationPath, name },
        },
        {
          status: (code) => ({
            json: (data) => {
              if (code === 200) resolve(data);
              else reject(data);
            },
          }),
        }
      );
    });

    const generatedDocument = await prisma.document.findUnique({
      where: { id: response.documentId },
      select: { id: true, name: true, path: true },
    });

    return res.status(200).json({
      message: "Template document used successfully",
      documentId: generatedDocument.id,
      documentName: generatedDocument.name,
      documentPath: generatedDocument.path,
    });
  } catch (error) {
    console.log("Error using template document:", error);
    return res.status(500).json({ error: "Failed to use template document" });
  }
};

export const get_workflow_steps_with_assignments = async (req, res) => {
  try {
    const { workflowId } = req.params;

    // Verify user authorization
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    // Fetch workflow with all necessary relations in a single query
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        steps: {
          orderBy: { stepNumber: "asc" },
          include: {
            assignments: {
              include: {
                departmentRoles: {
                  include: {
                    department: true,
                    role: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    // Collect all IDs for batch queries
    const userIds = new Set();
    const roleIds = new Set();
    const departmentIds = new Set();
    const allRoleIdsForHierarchy = new Set();

    workflow.steps.forEach((step) => {
      step.assignments.forEach((assignment) => {
        // Collect assignee IDs based on type
        assignment.assigneeIds.forEach((id) => {
          switch (assignment.assigneeType) {
            case "USER":
              userIds.add(id);
              break;
            case "ROLE":
              roleIds.add(id);
              allRoleIdsForHierarchy.add(id);
              break;
            case "DEPARTMENT":
              departmentIds.add(id);
              break;
          }
        });

        // Collect role IDs from selectedRoles
        if (
          assignment.selectedRoles &&
          Array.isArray(assignment.selectedRoles)
        ) {
          assignment.selectedRoles.forEach((roleId) => {
            allRoleIdsForHierarchy.add(roleId);
          });
        }

        // Collect role IDs from departmentRoles
        assignment.departmentRoles.forEach((deptRole) => {
          allRoleIdsForHierarchy.add(deptRole.roleId);
        });
      });
    });

    // Batch fetch all related data
    const [
      users,
      roles,
      departments,
      userRoles,
      allRolesForHierarchy,
      roleHierarchies,
    ] = await Promise.all([
      // Fetch users with basic info
      prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, username: true },
      }),

      // Fetch roles for ROLE type assignments
      prisma.role.findMany({
        where: { id: { in: Array.from(roleIds) } },
        include: {
          branch: {
            select: { name: true },
          },
        },
      }),

      // Fetch departments
      prisma.department.findMany({
        where: { id: { in: Array.from(departmentIds) } },
      }),

      // Fetch user-role relationships for all users
      prisma.userRole.findMany({
        where: { userId: { in: Array.from(userIds) } },
        include: {
          role: {
            select: { role: true },
          },
        },
      }),

      // Fetch all roles needed for hierarchy building
      prisma.role.findMany({
        where: { id: { in: Array.from(allRoleIdsForHierarchy) } },
        select: {
          id: true,
          role: true,
          parentRoleId: true,
          departmentId: true,
        },
      }),

      // Fetch role hierarchies in bulk
      prisma.role.findMany({
        where: {
          OR: [
            { id: { in: Array.from(allRoleIdsForHierarchy) } },
            { parentRoleId: { in: Array.from(allRoleIdsForHierarchy) } },
          ],
        },
        select: { id: true, role: true, parentRoleId: true },
      }),
    ]);

    // Create lookup maps for efficient access
    const userMap = new Map(users.map((user) => [user.id, user]));
    const roleMap = new Map(roles.map((role) => [role.id, role]));
    const departmentMap = new Map(departments.map((dept) => [dept.id, dept]));
    const userRoleMap = new Map();

    // Organize user roles
    userRoles.forEach((ur) => {
      if (!userRoleMap.has(ur.userId)) {
        userRoleMap.set(ur.userId, []);
      }
      userRoleMap.get(ur.userId).push(ur.role.role);
    });

    // Build role hierarchy map
    const roleHierarchyMap = new Map();
    roleHierarchies.forEach((role) => {
      roleHierarchyMap.set(role.id, {
        id: role.id,
        name: role.role,
        children: [],
      });
    });

    // Build hierarchy trees
    roleHierarchies.forEach((role) => {
      if (role.parentRoleId && roleHierarchyMap.has(role.parentRoleId)) {
        roleHierarchyMap
          .get(role.parentRoleId)
          .children.push(roleHierarchyMap.get(role.id));
      }
    });

    // Get root roles (roles with no parent or where parent is not in our set)
    const rootRoles = Array.from(roleHierarchyMap.values()).filter((role) => {
      const roleData = allRolesForHierarchy.find((r) => r.id === role.id);
      return (
        !roleData?.parentRoleId || !roleHierarchyMap.has(roleData.parentRoleId)
      );
    });

    // Function to format assignee based on type
    const formatAssignee = (assigneeType, assigneeId) => {
      switch (assigneeType) {
        case "USER":
          const user = userMap.get(assigneeId);
          if (!user) return null;

          return {
            id: user.id,
            username: user.username,
            departments: [], // Add if you have user-department relationships
            roles: userRoleMap.get(user.id) || [],
          };

        case "ROLE":
          const role = roleMap.get(assigneeId);
          if (!role) return null;

          return {
            id: role.id,
            role: role.role,
            isRootLevel: role.isRootLevel,
            isDepartmentHead: role.isDepartmentHead,
            departmentId: role.departmentId,
            departmentName: role.branch?.name || null,
            createdAt: role.createdAt,
            updatedAt: role.updatedAt,
            status: role.status,
          };

        case "DEPARTMENT":
          const department = departmentMap.get(assigneeId);
          if (!department) return null;

          return {
            id: department.id,
            type: department.type,
            code: department.code,
            name: department.name,
            status: department.status,
            headId: department.headId,
            adminId: department.adminId,
            parentDepartmentId: department.parentDepartmentId,
            createdAt: department.createdAt,
            updatedAt: department.updatedAt,
            createdById: department.createdById,
          };

        default:
          return null;
      }
    };

    // Function to get role tree for a specific role ID
    const getRoleTree = (roleId) => {
      const roleData = allRolesForHierarchy.find((r) => r.id === roleId);
      if (!roleData) return null;

      // Find the role in our hierarchy map
      const roleInHierarchy = roleHierarchyMap.get(roleId);
      if (roleInHierarchy) {
        return {
          id: roleInHierarchy.id,
          name: roleInHierarchy.name,
          children: roleInHierarchy.children
            .map((child) => getRoleTree(child.id))
            .filter(Boolean),
        };
      }

      // If role not in hierarchy map, return basic info
      return {
        id: roleData.id,
        name: roleData.role,
        children: [],
      };
    };

    // Format the response
    const formattedSteps = workflow.steps.map((step) => {
      const formattedAssignments = step.assignments.map((assignment) => {
        // Format assigneeIds
        const formattedAssigneeIds = assignment.assigneeIds
          .map((id) => formatAssignee(assignment.assigneeType, id))
          .filter(Boolean);

        // Format selectedRoles
        let formattedSelectedRoles = [];

        if (assignment.assigneeType === "DEPARTMENT") {
          // For DEPARTMENT assignments, group by department
          const departmentRolesMap = new Map();

          assignment.departmentRoles.forEach((deptRole) => {
            if (!departmentRolesMap.has(deptRole.departmentId)) {
              departmentRolesMap.set(deptRole.departmentId, {
                department: deptRole.departmentId,
                roles: [],
                direction: assignment.direction,
              });
            }

            const roleTree = getRoleTree(deptRole.roleId);
            if (roleTree) {
              departmentRolesMap
                .get(deptRole.departmentId)
                .roles.push(roleTree);
            }
          });

          formattedSelectedRoles = Array.from(departmentRolesMap.values());
        } else if (
          assignment.selectedRoles &&
          assignment.selectedRoles.length > 0
        ) {
          // For other assignment types, format selectedRoles as flat array
          formattedSelectedRoles = assignment.selectedRoles
            .map((roleId) => {
              const role = allRolesForHierarchy.find((r) => r.id === roleId);
              return role
                ? {
                    id: role.id,
                    name: role.role,
                    children: [],
                  }
                : null;
            })
            .filter(Boolean);
        }

        return {
          assigneeType: assignment.assigneeType,
          actionType: assignment.actionType,
          assigneeIds: formattedAssigneeIds,
          direction: assignment.direction,
          selectedRoles: formattedSelectedRoles,
        };
      });

      return {
        stepName: step.stepName,
        assignments: formattedAssignments,
        id: step.id,
      };
    });

    return res.status(200).json(formattedSteps);
  } catch (error) {
    console.error("Error fetching workflow steps:", error);
    return res.status(500).json({ error: "Failed to fetch workflow steps" });
  }
};

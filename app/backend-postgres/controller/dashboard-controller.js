import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../utility/verifyUser.js";

const prisma = new PrismaClient();

// Helper function to validate date range
const validateDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) {
    throw new Error("Start date and end date are required");
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid date format");
  }
  if (start > end) {
    throw new Error("Start date must be before end date");
  }
  return { start, end };
};

// Helper function to format document path
const formatDocumentPath = (path) => {
  if (!path) return "";
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
};

const getDocType = (path) => {
  if (!path) return "";
  const parts = path.split(".");

  return parts[parts.length - 1].toLowerCase();
};

// Helper function to check if user is admin (has at least one role with isAdmin AND isRootLevel true)
const isUserAdmin = async (userId) => {
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!userWithRoles) return false;

  if (userWithRoles.isAdmin) {
    return true;
  }
  // Check if user has at least one role with isAdmin AND isRootLevel true
  return userWithRoles.roles.some(
    (userRole) => userRole.role.isAdmin || userRole.role.isRootLevel
  );
};

// Helper function to get allowed document IDs for a user
const getAllowedDocumentIds = async (userId, userRoles) => {
  // Get all document accesses for the user
  const userDocumentAccesses = await prisma.documentAccess.findMany({
    where: {
      OR: [
        { userId: userId },
        { roleId: { in: userRoles.map((r) => r.roleId) } },
      ],
    },
  });

  const allowedDocumentIds = new Set();

  // Helper function to get parent IDs
  const getParents = async (documentId) => {
    const parents = [];
    let currentDoc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, parentId: true },
    });

    while (currentDoc && currentDoc.parentId) {
      parents.push(currentDoc.parentId);
      currentDoc = await prisma.document.findUnique({
        where: { id: currentDoc.parentId },
        select: { id: true, parentId: true },
      });
    }
    return parents;
  };

  // Process each access
  for (const access of userDocumentAccesses) {
    if (access.accessLevel === "FULL") {
      // For FULL access, add the document and all its children
      allowedDocumentIds.add(access.documentId);

      // Get all children of this document
      const getAllChildren = async (parentId) => {
        const children = await prisma.document.findMany({
          where: { parentId: parentId },
          select: { id: true },
        });

        for (const child of children) {
          allowedDocumentIds.add(child.id);
          await getAllChildren(child.id);
        }
      };

      await getAllChildren(access.documentId);
    } else if (
      access.accessType.includes("READ") ||
      access.accessType.includes("DOWNLOAD") ||
      access.accessType.includes("EDIT")
    ) {
      // For STANDARD access with READ/DOWNLOAD/EDIT permission
      allowedDocumentIds.add(access.documentId);

      // Check if any parent has FULL access that grants access to this document
      const parents = await getParents(access.documentId);
      const hasFullAccessParent = userDocumentAccesses.some(
        (parentAccess) =>
          parentAccess.accessLevel === "FULL" &&
          parents.includes(parentAccess.documentId)
      );

      if (hasFullAccessParent) {
        allowedDocumentIds.add(access.documentId);
      }
    }
  }

  // Also add documents created by the user
  const userDocuments = await prisma.document.findMany({
    where: { createdById: userId },
    select: { id: true },
  });

  userDocuments.forEach((doc) => allowedDocumentIds.add(doc.id));

  return Array.from(allowedDocumentIds);
};

// Helper function to get allowed workflow IDs for a user
const getAllowedWorkflowIds = async (
  userId,
  userRoleIds,
  userDepartmentIds
) => {
  // Get workflow assignments where user is directly assigned
  const userAssignments = await prisma.workflowAssignment.findMany({
    where: {
      OR: [
        { assigneeType: "USER", assigneeIds: { has: userId } },
        { assigneeType: "ROLE", selectedRoles: { hasSome: userRoleIds } },
        {
          assigneeType: "DEPARTMENT",
          selectedRoles: { hasSome: userRoleIds },
        },
      ],
    },
    select: {
      step: {
        select: {
          workflowId: true,
        },
      },
    },
  });

  // Get unique workflow IDs
  const workflowIds = [
    ...new Set(userAssignments.map((a) => a.step.workflowId)),
  ];

  return workflowIds;
};

// Helper function to get allowed process IDs for a user
const getAllowedProcessIds = async (
  userId,
  userRoleIds,
  userDepartmentIds,
  allowedWorkflowIds
) => {
  // Get processes where user is initiator
  const initiatedProcesses = await prisma.processInstance.findMany({
    where: { initiatorId: userId },
    select: { id: true },
  });

  // Get processes where user is assigned in any step
  const assignedProcesses = await prisma.processStepInstance.findMany({
    where: {
      OR: [
        { assignedTo: userId },
        { roleId: { in: userRoleIds } },
        { departmentId: { in: userDepartmentIds } },
      ],
    },
    select: { processId: true },
  });

  // Get processes from allowed workflows
  const workflowProcesses = await prisma.processInstance.findMany({
    where: {
      workflowId: { in: allowedWorkflowIds },
    },
    select: { id: true },
  });

  // Combine all process IDs
  const processIds = new Set();

  initiatedProcesses.forEach((p) => processIds.add(p.id));
  assignedProcesses.forEach((p) => processIds.add(p.processId));
  workflowProcesses.forEach((p) => processIds.add(p.id));

  return Array.from(processIds);
};

// Helper function to get user roles and departments
const getUserRolesAndDepartments = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
      branches: true,
    },
  });

  const userRoles = user.roles;
  const userRoleIds = userRoles.map((r) => r.roleId);
  const userDepartmentIds = user.branches.map((b) => b.id);

  return { userRoles, userRoleIds, userDepartmentIds };
};

// 1. /getNumbers Endpoint
export const getNumbers = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { startDate, endDate } = req.query;
    const { start, end } = validateDateRange(startDate, endDate);

    const [
      totalWorkflows,
      activeWorkflows,
      completedProcesses,
      pendingProcesses,
      queries,
      signedDocuments,
      rejectedDocuments,
      replacedDocuments,
      avgStepCompletion,
    ] = await Promise.all([
      // Total workflows
      prisma.workflow.count({
        where: {
          createdAt: { gte: start, lte: end },
        },
      }),
      // Active workflows (with IN_PROGRESS processes)
      prisma.workflow.count({
        where: {
          createdAt: { gte: start, lte: end },
          processes: {
            some: { status: "IN_PROGRESS" },
          },
        },
      }),
      // Completed processes
      prisma.processInstance.count({
        where: {
          status: "COMPLETED",
          createdAt: { gte: start, lte: end },
        },
      }),
      // Pending processes
      prisma.processInstance.count({
        where: {
          status: "IN_PROGRESS",
          createdAt: { gte: start, lte: end },
        },
      }),
      // Queries raised and solved
      prisma.processQA
        .count({
          where: {
            createdAt: { gte: start, lte: end },
          },
        })
        .then(async (total) => ({
          total,
          solved: await prisma.processQA.count({
            where: {
              createdAt: { gte: start, lte: end },
              status: "RESOLVED",
            },
          }),
        })),
      // Signed documents
      prisma.documentSignature.count({
        where: {
          signedAt: { gte: start, lte: end },
        },
      }),
      // Rejected documents
      prisma.documentRejection.count({
        where: {
          rejectedAt: { gte: start, lte: end },
        },
      }),
      // Replaced documents
      prisma.documentHistory.count({
        where: {
          actionType: "REPLACED",
          createdAt: { gte: start, lte: end },
        },
      }),
      // Average step completion time (in hours)
      prisma.processStepInstance
        .findMany({
          where: {
            status: "APPROVED",
            createdAt: { gte: start, lte: end },
            decisionAt: { not: null },
          },
          select: {
            createdAt: true,
            decisionAt: true,
          },
        })
        .then((steps) => {
          if (steps.length === 0) return 0;
          const totalHours = steps.reduce((sum, step) => {
            const diffMs = new Date(step.decisionAt) - new Date(step.createdAt);
            return sum + diffMs / (1000 * 60 * 60); // Convert ms to hours
          }, 0);
          return (totalHours / steps.length).toFixed(2);
        }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalWorkflows,
        activeWorkflows,
        completedProcesses,
        pendingProcesses,
        queries: {
          total: queries.total,
          solved: queries.solved,
        },
        signedDocuments,
        rejectedDocuments,
        replacedDocuments,
        averageStepCompletionTimeHours: parseFloat(avgStepCompletion),
      },
    });
  } catch (error) {
    console.error("Error in getNumbers:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to retrieve numeric data",
        details: error.message,
        code: "NUMERIC_DATA_ERROR",
      },
    });
  }
};

// 2. /getDetails Endpoint
export const getDetails = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { startDate, endDate } = req.query;
    const { start, end } = validateDateRange(startDate, endDate);

    // First, check if user is admin
    const isAdmin = await isUserAdmin(userData.id);

    let allowedDocumentIds = null;
    let allowedWorkflowIds = null;
    let allowedProcessIds = null;

    if (!isAdmin) {
      // Only fetch access-controlled data if user is not admin
      const { userRoles, userRoleIds, userDepartmentIds } =
        await getUserRolesAndDepartments(userData.id);
      allowedDocumentIds = await getAllowedDocumentIds(userData.id, userRoles);
      allowedWorkflowIds = await getAllowedWorkflowIds(
        userData.id,
        userRoleIds,
        userDepartmentIds
      );
      allowedProcessIds = await getAllowedProcessIds(
        userData.id,
        userRoleIds,
        userDepartmentIds,
        allowedWorkflowIds
      );
    }

    const [
      workflows,
      activeWorkflows,
      completedProcesses,
      pendingProcesses,
      queries,
      signedDocuments,
      rejectedDocuments,
      replacedDocuments,
    ] = await Promise.all([
      // Workflows (only accessible ones unless admin)
      prisma.workflow
        .findMany({
          where: {
            ...(!isAdmin && allowedWorkflowIds
              ? { id: { in: allowedWorkflowIds } }
              : {}),
            createdAt: { gte: start, lte: end },
          },
          select: {
            id: true,
            name: true,
            version: true,
            description: true,
            createdAt: true,
          },
        })
        .then((workflows) =>
          workflows.map((w) => ({
            workflowId: w.id,
            name: w.name,
            version: w.version,
            description: w.description,
            createdAt: w.createdAt.toISOString(),
          }))
        ),
      // Active workflows (only accessible ones unless admin)
      prisma.workflow
        .findMany({
          where: {
            ...(!isAdmin && allowedWorkflowIds
              ? { id: { in: allowedWorkflowIds } }
              : {}),
            createdAt: { gte: start, lte: end },
            processes: {
              some: { status: "IN_PROGRESS" },
            },
          },
          select: {
            id: true,
            name: true,
            version: true,
            description: true,
            createdAt: true,
          },
        })
        .then((workflows) =>
          workflows.map((w) => ({
            workflowId: w.id,
            name: w.name,
            version: w.version,
            description: w.description,
            createdAt: w.createdAt.toISOString(),
          }))
        ),
      // Completed processes (only accessible ones unless admin)
      prisma.processInstance
        .findMany({
          where: {
            ...(!isAdmin && allowedProcessIds
              ? { id: { in: allowedProcessIds } }
              : {}),
            status: "COMPLETED",
            createdAt: { gte: start, lte: end },
          },
          select: {
            id: true,
            name: true,
            createdAt: true,
            initiator: { select: { username: true } },
          },
        })
        .then((processes) =>
          processes.map((p) => ({
            processId: p.id,
            processName: p.name,
            createdAt: p.createdAt.toISOString(),
            initiatorUsername: p.initiator.username,
          }))
        ),
      // Pending processes (only accessible ones unless admin)
      prisma.processInstance
        .findMany({
          where: {
            ...(!isAdmin && allowedProcessIds
              ? { id: { in: allowedProcessIds } }
              : {}),
            status: "IN_PROGRESS",
            createdAt: { gte: start, lte: end },
          },
          select: {
            id: true,
            name: true,
            createdAt: true,
            initiator: { select: { username: true } },
          },
        })
        .then((processes) =>
          processes.map((p) => ({
            processId: p.id,
            processName: p.name,
            createdAt: p.createdAt.toISOString(),
            initiatorUsername: p.initiator.username,
          }))
        ),
      // Queries (only from accessible processes unless admin)
      prisma.processQA
        .findMany({
          where: {
            ...(!isAdmin && allowedProcessIds
              ? { processId: { in: allowedProcessIds } }
              : {}),
            createdAt: { gte: start, lte: end },
          },
          include: {
            initiator: { select: { username: true } },
            process: { select: { id: true, name: true } },
          },
        })
        .then((queries) =>
          queries.map((q) => ({
            stepInstanceId: q.stepInstanceId,
            queryText: q.question,
            answerText: q.answer || null,
            initiatorName: q.initiator.username,
            createdAt: q.createdAt.toISOString(),
            answeredAt: q.answeredAt ? q.answeredAt.toISOString() : null,
            processId: q.process.id,
            processName: q.process.name,
            status: q.answer ? "RESOLVED" : "OPEN",
          }))
        ),
      // Signed documents (only accessible ones unless admin)
      prisma.documentSignature
        .findMany({
          where: {
            signedAt: { gte: start, lte: end },
            ...(!isAdmin && (allowedDocumentIds || allowedProcessIds)
              ? {
                  processDocument: {
                    ...(allowedDocumentIds
                      ? { document: { id: { in: allowedDocumentIds } } }
                      : {}),
                    ...(allowedProcessIds
                      ? { process: { id: { in: allowedProcessIds } } }
                      : {}),
                  },
                }
              : {}),
          },
          include: {
            processDocument: {
              include: {
                document: { select: { id: true, name: true, path: true } },
                process: { select: { id: true, name: true } },
              },
            },
          },
        })
        .then((signatures) => {
          const uniqueSignatures = [];
          const seenSignatures = new Set();

          return signatures
            .map((s) => ({
              signatureId: s.id,
              documentId: s.processDocument.document.id,
              documentName: s.processDocument.document.name,
              documentPath: formatDocumentPath(s.processDocument.document.path),
              documentType: getDocType(s.processDocument.document.path),
              processId: s.processDocument.process.id,
              processName: s.processDocument.process.name,
              signedAt: s.signedAt.toISOString(),
            }))
            .filter((signature) => {
              const uniqueKey = `${signature.documentId}-${signature.processId}-${signature.signedAt}`;
              if (!seenSignatures.has(uniqueKey)) {
                seenSignatures.add(uniqueKey);
                return true;
              }
              return false;
            });
        }),
      // Rejected documents (only accessible ones unless admin)
      prisma.documentRejection
        .findMany({
          where: {
            rejectedAt: { gte: start, lte: end },
            ...(!isAdmin && (allowedDocumentIds || allowedProcessIds)
              ? {
                  processDocument: {
                    ...(allowedDocumentIds
                      ? { document: { id: { in: allowedDocumentIds } } }
                      : {}),
                    ...(allowedProcessIds
                      ? { process: { id: { in: allowedProcessIds } } }
                      : {}),
                  },
                }
              : {}),
          },
          include: {
            processDocument: {
              include: {
                document: { select: { id: true, name: true, path: true } },
                process: { select: { id: true, name: true } },
              },
            },
          },
        })
        .then((rejections) => {
          const seenRejections = new Set();

          return rejections
            .map((r) => ({
              rejectionId: r.id,
              documentId: r.processDocument.document.id,
              documentName: r.processDocument.document.name,
              documentPath: formatDocumentPath(r.processDocument.document.path),
              documentType: getDocType(r.processDocument.document.path),
              processId: r.processDocument.process.id,
              processName: r.processDocument.process.name,
              rejectedAt: r.rejectedAt.toISOString(),
            }))
            .filter((rejection) => {
              const uniqueKey = `${rejection.documentId}-${rejection.processId}-${rejection.rejectedAt}`;
              if (!seenRejections.has(uniqueKey)) {
                seenRejections.add(uniqueKey);
                return true;
              }
              return false;
            });
        }),
      // Replaced documents (only accessible ones unless admin)
      prisma.documentHistory
        .findMany({
          where: {
            actionType: "REPLACED",
            createdAt: { gte: start, lte: end },
            ...(!isAdmin && allowedDocumentIds
              ? { document: { id: { in: allowedDocumentIds } } }
              : {}),
          },
          include: {
            document: { select: { id: true, name: true, path: true } },
            replacedDocument: { select: { id: true, name: true, path: true } },
            user: { select: { username: true } },
          },
        })
        .then((histories) => {
          const seenReplacements = new Set();

          return histories
            .map((h) => ({
              historyId: h.id,
              replacedDocumentId: h.document.id,
              replacedDocName: h.document.name,
              replacedDocumentPath: formatDocumentPath(h.document.path),
              replacedDocumentType: getDocType(h.document.path),
              replacesDocumentId: h.replacedDocument?.id || null,
              replacesDocumentName: h.replacedDocument?.name || null,
              replacesDocumentType: getDocType(h.replacedDocument?.path || ""),
              replacesDocumentPath: formatDocumentPath(
                h.replacedDocument?.path || ""
              ),
              replacedBy: h.user.username,
              replacedAt: h.createdAt.toISOString(),
            }))
            .filter((replacement) => {
              const uniqueKey = `${replacement.replacedDocumentId}-${replacement.replacesDocumentId}-${replacement.replacedAt}`;
              if (!seenReplacements.has(uniqueKey)) {
                seenReplacements.add(uniqueKey);
                return true;
              }
              return false;
            });
        }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        workflows,
        activeWorkflows,
        completedProcesses,
        pendingProcesses,
        queries: {
          total: queries.length,
          solved: queries.filter((q) => q.status === "RESOLVED").length,
          details: queries,
        },
        signedDocuments,
        rejectedDocuments,
        replacedDocuments,
      },
    });
  } catch (error) {
    console.error("Error in getDetails:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to retrieve detailed data",
        details: error.message,
        code: "DETAILED_DATA_ERROR",
      },
    });
  }
};

// 3. /getWorkflowAnalysis/:workflowId Endpoint
export const getWorkflowAnalysis = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { workflowId } = req.params;
    const { startDate, endDate } = req.query;
    const { start, end } = validateDateRange(startDate, endDate);

    // First, check if user is admin
    const isAdmin = await isUserAdmin(userData.id);

    let allowedDocumentIds = null;
    let allowedWorkflowIds = null;
    let allowedProcessIds = null;

    if (!isAdmin) {
      // Only fetch access-controlled data if user is not admin
      const { userRoles, userRoleIds, userDepartmentIds } =
        await getUserRolesAndDepartments(userData.id);
      allowedWorkflowIds = await getAllowedWorkflowIds(
        userData.id,
        userRoleIds,
        userDepartmentIds
      );

      // Check if user has access to this workflow
      if (!allowedWorkflowIds.includes(workflowId)) {
        return res.status(403).json({
          success: false,
          error: {
            message: "Access denied",
            details: "You don't have access to this workflow",
            code: "WORKFLOW_ACCESS_DENIED",
          },
        });
      }

      allowedDocumentIds = await getAllowedDocumentIds(userData.id, userRoles);
      allowedProcessIds = await getAllowedProcessIds(
        userData.id,
        userRoleIds,
        userDepartmentIds,
        [workflowId]
      );
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: {
        id: true,
        name: true,
        version: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        steps: {
          select: {
            id: true,
            stepName: true,
            stepNumber: true,
            stepType: true,
          },
        },
      },
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Workflow not found",
          details: "No workflow found with the specified ID",
          code: "WORKFLOW_NOT_FOUND",
        },
      });
    }

    const [
      stepCompletionTimes,
      pendingProcessesByStep,
      assigneeCompletionTimes,
      pendingProcesses,
      queries,
      signedDocuments,
      rejectedDocuments,
      replacedDocuments,
    ] = await Promise.all([
      // Step completion times (only from accessible processes unless admin)
      Promise.all(
        workflow.steps.map(async (step) => {
          const stepInstances = await prisma.processStepInstance.findMany({
            where: {
              stepId: step.id,
              status: "APPROVED",
              createdAt: { gte: start, lte: end },
              decisionAt: { not: null },
              ...(!isAdmin && allowedProcessIds
                ? { process: { id: { in: allowedProcessIds } } }
                : {}),
            },
            select: {
              createdAt: true,
              decisionAt: true,
            },
          });
          const avgTimeHours =
            stepInstances.length > 0
              ? stepInstances.reduce((sum, si) => {
                  if (si.decisionAt && si.createdAt) {
                    return (
                      sum +
                      (si.decisionAt.getTime() - si.createdAt.getTime()) /
                        (1000 * 60 * 60)
                    );
                  }
                  return sum;
                }, 0) / stepInstances.length
              : null;
          return {
            stepId: step.id,
            stepName: step.stepName,
            stepNumber: step.stepNumber,
            stepType: step.stepType,
            averageCompletionTimeHours: avgTimeHours
              ? avgTimeHours.toFixed(2)
              : null,
          };
        })
      ),
      // Pending processes by step (only accessible ones unless admin)
      Promise.all(
        workflow.steps.map(async (step) => {
          const processes = await prisma.processStepInstance.findMany({
            where: {
              stepId: step.id,
              status: "IN_PROGRESS",
              process: {
                workflowId: workflowId,
                ...(!isAdmin && allowedProcessIds
                  ? { id: { in: allowedProcessIds } }
                  : {}),
                createdAt: { gte: start, lte: end },
              },
            },
            include: {
              process: {
                select: {
                  id: true,
                  name: true,
                  createdAt: true,
                  initiator: { select: { username: true } },
                },
              },
            },
          });
          return {
            stepId: step.id,
            stepName: step.stepName,
            stepNumber: step.stepNumber,
            pendingCount: processes.length,
            processes: processes.map((p) => ({
              processId: p.process.id,
              processName: p.process.name,
              createdAt: p.process.createdAt.toISOString(),
              createdBy: p.process.initiator.username,
            })),
          };
        })
      ),
      // Assignee completion times (only from accessible processes unless admin)
      prisma.processStepInstance
        .findMany({
          where: {
            process: {
              workflowId: workflowId,
              ...(!isAdmin && allowedProcessIds
                ? { id: { in: allowedProcessIds } }
                : {}),
              createdAt: { gte: start, lte: end },
            },
            status: "APPROVED",
            decisionAt: { not: null },
          },
          select: {
            assignedTo: true,
            createdAt: true,
            decisionAt: true,
          },
        })
        .then(async (instances) => {
          // Group instances by assignedTo
          const groupedByAssignee = instances.reduce((acc, instance) => {
            const assigneeId = instance.assignedTo;
            if (!acc[assigneeId]) {
              acc[assigneeId] = [];
            }
            acc[assigneeId].push(instance);
            return acc;
          }, {});
          // Fetch all users in one query
          const assigneeIds = Object.keys(groupedByAssignee).map(Number);
          const users = await prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, username: true },
          });
          const userMap = new Map(users.map((u) => [u.id, u.username]));
          // Calculate average completion time per assignee
          return Object.entries(groupedByAssignee).map(
            ([assigneeId, instances]) => {
              const totalTimeHours = instances.reduce((sum, instance) => {
                if (instance.decisionAt && instance.createdAt) {
                  return (
                    sum +
                    (instance.decisionAt.getTime() -
                      instance.createdAt.getTime()) /
                      (1000 * 60 * 60)
                  );
                }
                return sum;
              }, 0);
              const avgTimeHours =
                instances.length > 0 ? totalTimeHours / instances.length : null;
              return {
                assigneeId: Number(assigneeId),
                assigneeUsername:
                  userMap.get(Number(assigneeId)) || "Unknown User",
                averageCompletionTimeHours: avgTimeHours
                  ? parseFloat(avgTimeHours.toFixed(2))
                  : null,
                totalTasks: instances.length,
              };
            }
          );
        }),
      // Pending processes (only accessible ones unless admin)
      prisma.processInstance
        .findMany({
          where: {
            workflowId: workflowId,
            ...(!isAdmin && allowedProcessIds
              ? { id: { in: allowedProcessIds } }
              : {}),
            status: "IN_PROGRESS",
            createdAt: { gte: start, lte: end },
          },
          select: {
            id: true,
            name: true,
            createdAt: true,
            initiator: { select: { username: true } },
          },
        })
        .then((processes) =>
          processes.map((p) => ({
            processId: p.id,
            processName: p.name,
            createdAt: p.createdAt.toISOString(),
            initiatorUsername: p.initiator.username,
          }))
        ),
      // Queries (only from accessible processes unless admin)
      prisma.processQA
        .findMany({
          where: {
            process: {
              workflowId: workflowId,
              ...(!isAdmin && allowedProcessIds
                ? { id: { in: allowedProcessIds } }
                : {}),
            },
            createdAt: { gte: start, lte: end },
          },
          include: {
            initiator: { select: { username: true } },
            process: { select: { id: true, name: true } },
          },
        })
        .then((queries) => {
          const formatted = queries.map((q) => ({
            id: q.id,
            stepInstanceId: q.stepInstanceId,
            queryText: q.question,
            answerText: q.answer || null,
            initiatorName: q.initiator.username,
            createdAt: q.createdAt.toISOString(),
            answeredAt: q.answeredAt?.toISOString() || null,
            processId: q.process.id,
            processName: q.process.name,
            status: q.status,
          }));
          return {
            total: queries.length,
            solved: queries.filter((q) => q.status === "RESOLVED").length,
            details: formatted,
          };
        }),
      // Signed documents (only accessible ones unless admin)
      prisma.documentSignature
        .findMany({
          where: {
            processDocument: {
              process: {
                workflowId: workflowId,
                ...(!isAdmin && allowedProcessIds
                  ? { id: { in: allowedProcessIds } }
                  : {}),
              },
              ...(!isAdmin && allowedDocumentIds
                ? { document: { id: { in: allowedDocumentIds } } }
                : {}),
            },
            signedAt: { gte: start, lte: end },
          },
          include: {
            processDocument: {
              include: {
                document: { select: { id: true, name: true, path: true } },
                process: { select: { id: true, name: true } },
              },
            },
          },
        })
        .then((signatures) =>
          signatures.map((s) => ({
            documentId: s.processDocument.document.id,
            documentName: s.processDocument.document.name,
            documentPath: formatDocumentPath(s.processDocument.document.path),
            documentType: getDocType(s.processDocument.document.path),
            processId: s.processDocument.process.id,
            processName: s.processDocument.process.name,
            signedAt: s.signedAt.toISOString(),
          }))
        ),
      // Rejected documents (only accessible ones unless admin)
      prisma.documentRejection
        .findMany({
          where: {
            processDocument: {
              process: {
                workflowId: workflowId,
                ...(!isAdmin && allowedProcessIds
                  ? { id: { in: allowedProcessIds } }
                  : {}),
              },
              ...(!isAdmin && allowedDocumentIds
                ? { document: { id: { in: allowedDocumentIds } } }
                : {}),
            },
            rejectedAt: { gte: start, lte: end },
          },
          include: {
            processDocument: {
              include: {
                document: { select: { id: true, name: true, path: true } },
                process: { select: { id: true, name: true } },
              },
            },
          },
        })
        .then((rejections) =>
          rejections.map((r) => ({
            documentId: r.processDocument.document.id,
            documentName: r.processDocument.document.name,
            documentPath: formatDocumentPath(r.processDocument.document.path),
            documentType: getDocType(r.processDocument.document.path),
            processId: r.processDocument.process.id,
            processName: r.processDocument.process.name,
            rejectedAt: r.rejectedAt.toISOString(),
          }))
        ),
      // Replaced documents (only accessible ones unless admin)
      prisma.documentHistory
        .findMany({
          where: {
            process: {
              workflowId: workflowId,
              ...(!isAdmin && allowedProcessIds
                ? { id: { in: allowedProcessIds } }
                : {}),
            },
            actionType: "REPLACED",
            createdAt: { gte: start, lte: end },
            ...(!isAdmin && allowedDocumentIds
              ? { document: { id: { in: allowedDocumentIds } } }
              : {}),
          },
          include: {
            document: { select: { id: true, name: true, path: true } },
            replacedDocument: { select: { id: true, name: true, path: true } },
            user: { select: { username: true } },
          },
        })
        .then((histories) =>
          histories.map((h) => ({
            replacedDocumentId: h.document.id,
            replacedDocName: h.document.name,
            replacedDocumentPath: formatDocumentPath(h.document.path),
            replacedDocumentId: h.replacedDocument?.id || null,
            replacedDocumentType: getDocType(h.replacedDocument?.path),
            replacedDocumentName: h.replacedDocument?.name || null,
            replacedDocumentPath: h.replacedDocument?.path
              ? formatDocumentPath(h.replacedDocument.path)
              : null,
            replacedBy: h.user.username,
          }))
        ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        workflow: {
          workflowId: workflow.id,
          name: workflow.name,
          version: workflow.version,
          description: workflow.description,
          createdAt: workflow.createdAt.toISOString(),
          updatedAt: workflow.updatedAt.toISOString(),
        },
        stepCompletionTimes,
        pendingProcessesByStep,
        assigneeCompletionTimes,
        pendingProcesses: {
          total: pendingProcesses.length,
          details: pendingProcesses,
        },
        queries,
        signedDocuments,
        rejectedDocuments,
        replacedDocuments,
      },
    });
  } catch (error) {
    console.error("Error in getWorkflowAnalysis:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to analyze workflow",
        details: error.message,
        code: "WORKFLOW_ANALYSIS_ERROR",
      },
    });
  }
};

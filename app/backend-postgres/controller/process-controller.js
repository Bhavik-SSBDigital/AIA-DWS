import { verifyUser } from "../utility/verifyUser.js";

import pkg from "@prisma/client";
import { file_copy, delete_file } from "./file-controller.js";
import { createFolder } from "./file-controller.js";
import { fileURLToPath } from "url";
import { dirname, join, normalize, extname } from "path";
import { file_delete } from "./file-controller.js";
import { watermarkDocument } from "./watermark.js";
import dotenv from "dotenv";
import { sendProcessNotification } from "../services/emailService.js";

dotenv.config();

import path from "path";

const STORAGE_PATH = process.env.STORAGE_PATH;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const {
  PrismaClient,
  AccessType,
  NotificationType,
  ProcessStatus,
  StepStatus,
} = pkg;

const prisma = new PrismaClient();

async function connectWithRetry(maxRetries = 5, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();

      return true;
    } catch (error) {
      if (
        error.message.includes("Engine is not yet connected") &&
        i < maxRetries - 1
      ) {
        console.warn(
          `Connection attempt ${i + 1} failed, retrying in ${delay}ms...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(2, i))
        ); // Exponential backoff
      } else {
        throw error; // Throw if max retries reached or different error
      }
    }
  }
}

connectWithRetry().catch((err) => {
  console.error("Failed to connect to Prisma client:", err);
  process.exit(1); // Exit process if connection fails
});

const checkUserProcessAssignment = async (processId, userId) => {
  try {
    // Validate input
    if (!processId || userId === undefined || userId === null) {
      return {
        success: false,
        hasAssignment: false,
        error: "processId and userId are required parameters",
      };
    }

    // Convert userId to number if it's a string
    const numericUserId =
      typeof userId === "string" ? parseInt(userId, 10) : userId;

    if (isNaN(numericUserId)) {
      return {
        success: false,
        hasAssignment: false,
        error: "userId must be a valid number",
      };
    }

    // Check if user has any step instance assigned in the process
    const stepInstance = await prisma.processStepInstance.findFirst({
      where: {
        processId: processId,
        assignedTo: numericUserId,
        status: {
          in: [
            "PENDING",
            "IN_PROGRESS",
            "FOR_RECIRCULATION",
            "FOR_RECOMMENDATION",
          ],
        },
      },
      select: {
        id: true,
      },
    });

    const hasAssignment = !!stepInstance;

    return hasAssignment;
  } catch (error) {
    console.error("Error checking user process assignment:", error);
    return {
      success: false,
      hasAssignment: false,
      error: error.message || "Internal server error",
    };
  }
};

async function checkDocumentAccess(userId, documentId, requiredAccess) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });

  const userDepartments = await prisma.department.findMany({
    where: { users: { some: { id: userId } } },
    select: { id: true },
  });

  return prisma.documentAccess.findFirst({
    where: {
      documentId,
      accessType: requiredAccess,
      stepInstance: {
        status: { in: ["IN_PROGRESS", "IN_PROGRESS"] },
        process: { status: "IN_PROGRESS" },
      },
      OR: [
        { userId },
        { roleId: { in: userRoles.map((r) => r.roleId) } },
        { departmentId: { in: userDepartments.map((d) => d.id) } },
      ],
    },
  });
}

export async function generateDocumentNameController(req, res) {
  try {
    const { workflowId, replacedDocId, extension } = req.body;

    if (!workflowId) {
      return res.status(400).json({ error: "workflowId is required" });
    }

    const documentName = await generateUniqueDocumentName({
      workflowId,
      replacedDocId,
      extension,
    });

    return res.json({ documentName });
  } catch (error) {
    console.error("Error in document name controller:", error);
    return res.status(500).json({ error: "Failed to generate document name" });
  }
}

export async function generateUniqueDocumentName({
  workflowId,
  replacedDocId,
  extension,
}) {
  try {
    // Fetch workflow details
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true, version: true },
    });

    if (!workflow) {
      throw new Error(`Workflow with ID ${workflowId} not found`);
    }

    const { name: workflowName, version: workflowVersion } = workflow;

    // Format date as YYYYMMDD
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    // Base name for documents
    const baseDocName = `${workflowName}_w${workflowVersion}_${dateStr}`;

    if (replacedDocId) {
      // Handle document replacement
      const existingDoc = await prisma.document.findFirst({
        where: { id: parseInt(replacedDocId) },
      });

      if (!existingDoc) {
        throw new Error(`Document with id ${replacedDocId} not found`);
      }

      // Extract version
      const parts = existingDoc.name.split("_");
      const versionPart = parts[parts.length - 1];
      const version = parseInt(versionPart.replace("v", ""), 10) || 1;
      const newVersion = version + 1;

      // Construct new name by replacing version
      const newDocName = `${parts
        .slice(0, -1)
        .join("_")}_v${newVersion}.${extension}`;

      // // Verify uniqueness
      // const existing = await prisma.document.findFirst({
      //   where: { name: newDocName },
      // });

      // if (existing) {
      //   throw new Error(`Document name ${newDocName} already exists`);
      // }

      return newDocName;
    } else {
      // Handle new document
      const existingDocs = await prisma.document.findMany({
        where: {},
        select: { name: true },
      });

      // Extract serial numbers
      const serialNumbers = existingDocs
        .map((doc) => {
          const parts = doc.name.split("_");
          const serial = parseInt(parts[parts.length - 2], 10) || 0;
          return serial;
        })
        .filter((num) => !isNaN(num));

      const nextSerialNumber =
        serialNumbers.length > 0 ? Math.max(...serialNumbers) + 1 : 1;

      const newDocName = `${baseDocName}_${nextSerialNumber
        .toString()
        .padStart(3, "0")}_v1`;

      // Verify uniqueness
      const existing = await prisma.document.findFirst({
        where: { name: newDocName },
      });

      if (existing) {
        throw new Error(`Document name ${newDocName} already exists`);
      }

      return `${newDocName}.${extension}`;
    }
  } catch (error) {
    console.error("Error generating unique document name:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

const generate_unique_process_name = async (workflowId) => {
  try {
    // Fetch workflow name and version
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true, version: true },
    });

    if (!workflow) {
      throw new Error(`Workflow with ID ${workflowId} not found`);
    }

    const { name: workflowName, version: workflowVersion } = workflow;

    // Format date as YYYYMMDD
    const today = new Date();
    const processCreationDate = today
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");

    // Base process name
    const baseProcessName = `${workflowName}_w${workflowVersion}_${processCreationDate}`;

    // Find existing processes with same base name
    const existingProcesses = await prisma.processInstance.findMany({
      where: {
        name: {
          startsWith: baseProcessName,
        },
      },
      select: { name: true },
    });

    // Extract serial numbers
    const serialNumbers = existingProcesses
      .map((process) => {
        const parts = process.name.split("_");
        const serial = parts[parts.length - 1];
        return parseInt(serial, 10) || 0;
      })
      .filter((num) => !isNaN(num));

    // Determine next serial number
    const nextSerialNumber =
      serialNumbers.length > 0 ? Math.max(...serialNumbers) + 1 : 1;

    // Construct unique process name with 3-digit serial number
    const uniqueProcessName = `${baseProcessName}_${nextSerialNumber
      .toString()
      .padStart(3, "0")}`;

    return uniqueProcessName;
  } catch (error) {
    console.error("Error generating unique process name:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

export const initiate_process = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { description, workflowId, issueNo } = req.body;

    const processName = await generate_unique_process_name(workflowId);

    const workflowDetails = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { name: true },
    });

    const workflowName = workflowDetails.name;

    await createFolder(false, `../${workflowName}/${processName}`, userData);

    let documentIds = req.body.documents?.map((item) => item.documentId) || [];

    const copiedDocumentIds = [];

    for (const documentId of documentIds) {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { path: true },
      });

      if (document) {
        const sourcePath = `./${document.path}`;
        const destinationPath = `../${workflowName}/${processName}`;
        const name = sourcePath.split("/").pop();

        try {
          const copyResult = await new Promise((resolve, reject) => {
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

          if (copyResult.documentId) {
            copiedDocumentIds.push(copyResult.documentId);
          }

          await new Promise((resolve, reject) => {
            delete_file(
              {
                headers: { authorization: `Bearer ${accessToken}` },
                body: { documentId },
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
        } catch (error) {
          console.error(`Error processing document ${documentId}:`, error);
        }
      }
    }

    documentIds = copiedDocumentIds;

    if (documentIds.length === 0) {
      return res.status(400).json({
        message: "Documents are required to initiate a process",
      });
    }

    const initiatorId = userData.id;

    const process = await prisma.$transaction(async (tx) => {
      const process_ = await tx.processInstance.create({
        data: {
          workflowId,
          initiatorId,
          name: processName,
          status: "IN_PROGRESS",
          description: description,
          issueNo: issueNo,
          currentStepId: null,
          reopenCycle: 0,
          storagePath: `../${workflowName}/${processName}`,
        },
      });

      const processDocumentData =
        req.body.documents?.map((item, index) => ({
          processId: process_.id,
          documentId: documentIds[index],
          reopenCycle: 0,
          SOPIssueNo: issueNo || null,
          preApproved: item.preApproved || false,
          tags: item.tags || [],
          partNumber: item.partNumber || null,
          description: item.description || null,
          issueNo: item.issueNo || null,
        })) || [];

      await tx.processDocument.createMany({
        data: processDocumentData,
      });

      const workflow = await tx.workflow.findUnique({
        where: { id: workflowId },
        include: { steps: { include: { assignments: true } } },
      });

      if (!workflow || !workflow.steps.length) {
        throw new Error("Workflow or steps not found");
      }

      const step = workflow.steps[0];

      for (const assignment of step.assignments) {
        await processAssignment(
          tx,
          process_,
          step,
          assignment,
          documentIds,
          false,
          true,
          workflowId
        );
      }

      await tx.processInstance.update({
        where: { id: process_.id },
        data: { currentStepId: step.id, status: "IN_PROGRESS" },
      });

      return process_;
    });

    // In the email sending part of initiate_process function
    try {
      const firstStepInstance = await prisma.processStepInstance.findFirst({
        where: {
          processId: process.id,
          status: "IN_PROGRESS",
        },
        include: {
          // CHANGE: Remove assignedToUser and include assignedTo relation properly
          process: {
            include: {
              initiator: {
                select: { id: true, username: true, name: true, email: true },
              },
            },
          },
        },
      });

      if (firstStepInstance && firstStepInstance.assignedTo) {
        // Get the assigned user separately
        const assignedUser = await prisma.user.findUnique({
          where: { id: firstStepInstance.assignedTo },
          select: { id: true, email: true, username: true, name: true },
        });

        // Get all process documents
        const processDocs = await prisma.processDocument.findMany({
          where: { processId: process.id },
          include: { document: true },
        });

        const documentIds = processDocs.map((pd) => pd.documentId);

        if (assignedUser) {
          await sendProcessNotification("stepAssigned", {
            params: [
              firstStepInstance.process,
              firstStepInstance,
              processDocs,
              assignedUser,
            ],
          });
        }
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
      // Don't fail the main request if email fails
    }

    return res.status(200).json({
      message: `Process with the name ${processName} initiated successfully`,
      processId: process.id,
    });
  } catch (error) {
    console.error("Error initiating the process", error);
    return res.status(500).json({
      message: "Error initiating the process",
      error: error.message,
    });
  }
};

async function ensureDocumentAccessWithParents(
  tx,
  {
    documentId,
    userId,
    stepInstanceId,
    processId,
    assignmentId,
    roleId = null,
    departmentId = null,
  }
) {
  const process = await tx.processInstance.findUnique({
    where: { id: processId },
    select: { reopenCycle: true },
  });

  // First get all parent folders up to root
  const parents = await getDocumentParentHierarchy(tx, documentId);

  // Check which parents the user doesn't already have access to
  const existingAccess = await tx.documentAccess.findMany({
    where: {
      documentId: { in: parents.map((p) => p.id) },
      userId: userId,
      processId: processId,
    },
    select: { documentId: true },
  });

  const existingAccessIds = new Set(existingAccess.map((a) => a.documentId));
  const parentsToCreate = parents.filter((p) => !existingAccessIds.has(p.id));

  if (parentsToCreate.length > 0) {
    await tx.documentAccess.createMany({
      data: parentsToCreate.map((parent) => ({
        documentId: parent.id,
        stepInstanceId: stepInstanceId,
        accessType: [AccessType.READ],
        processId: processId,
        assignmentId: assignmentId,
        userId: userId,
        roleId: roleId,
        departmentId: departmentId,
        reopenCycle: process.reopenCycle,
      })),
    });
  }

  // Now create access for the actual document
  await tx.documentAccess.create({
    data: {
      documentId: documentId,
      stepInstanceId: stepInstanceId,
      accessType: [AccessType.EDIT],
      processId: processId,
      assignmentId: assignmentId,
      userId: userId,
      roleId: roleId,
      departmentId: departmentId,
      reopenCycle: process.reopenCycle,
    },
  });
}

async function getDocumentParentHierarchy(tx, documentId) {
  const parents = [];
  let currentDocId = documentId;

  while (currentDocId) {
    const doc = await tx.document.findUnique({
      where: { id: currentDocId },
      select: { parentId: true },
    });

    if (!doc || !doc.parentId) break;

    parents.push({ id: doc.parentId });
    currentDocId = doc.parentId;
  }

  return parents;
}

async function processAssignment(
  tx,
  process_,
  step,
  assignment,
  documentIds,
  isRecirculated,
  fromInitiator,
  workflowId
) {
  let foundProgress = await tx.assignmentProgress.findFirst({
    where: {
      processId: process_.id,
      assignmentId: assignment.id,
    },
  });

  const progress = foundProgress
    ? foundProgress
    : await tx.assignmentProgress.create({
        data: {
          process: {
            connect: { id: process_.id },
          },
          workflowAssignment: {
            connect: { id: assignment.id },
          },
          roleHierarchy: assignment.allowParallel
            ? await buildRoleHierarchy(assignment)
            : null,
          completed: false,
        },
      });

  switch (assignment.assigneeType) {
    case "DEPARTMENT":
      await handleDepartmentAssignment(
        tx,
        assignment,
        progress,
        documentIds,
        step,
        fromInitiator,
        workflowId
      );
      break;
    case "ROLE":
      await handleRoleAssignment(
        tx,
        assignment,
        progress,
        documentIds,
        step,
        fromInitiator,
        workflowId
      );
      break;
    case "USER":
      await handleUserAssignment(
        tx,
        assignment,
        progress,
        documentIds,
        step,
        fromInitiator,
        workflowId
      );
      break;
  }

  return progress;
}

async function handleDepartmentAssignment(
  tx,
  assignment,
  progress,
  documentIds,
  step,
  fromInitiator,
  workflowId
) {
  const hierarchy = await buildRoleHierarchyForAssignment(
    assignment.direction,
    assignment.allowParallel,
    assignment.selectedRoles
  );

  for (const departmentId of assignment.assigneeIds) {
    let departmentProgress = await tx.departmentStepProgress.findFirst({
      where: {
        processId: progress.processId,
        stepId: step.id,
        departmentId: departmentId,
      },
    });

    if (!departmentProgress) {
      departmentProgress = await tx.departmentStepProgress.create({
        data: {
          processId: progress.processId,
          stepId: step.id,
          departmentId: departmentId,
          roleLevels: JSON.stringify(hierarchy),
          currentLevel: 0,
          direction: assignment.direction || "DOWNWARDS",
          requiredRoles: assignment.selectedRoles,
          completedRoles: [],
          assignmentProgressId: progress.id,
        },
      });
    }

    const currentLevel = departmentProgress.currentLevel;
    const roleLevels = JSON.parse(departmentProgress.roleLevels);
    const currentRoles = assignment.allowParallel
      ? assignment.selectedRoles
      : roleLevels[currentLevel] || [];

    const users = await tx.userRole.findMany({
      where: {
        roleId: { in: currentRoles },
        role: {
          departmentId: departmentId,
        },
      },
      select: {
        userId: true,
        roleId: true,
        role: {
          select: { departmentId: true },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    const usersByRole = new Map();
    users.forEach((user) => {
      if (!usersByRole.has(user.roleId)) {
        usersByRole.set(user.roleId, []);
      }
      usersByRole.get(user.roleId).push(user);
    });

    for (const roleId of currentRoles) {
      const roleUsers = usersByRole.get(roleId) || [];
      if (roleUsers.length === 0) continue;

      for (const user of roleUsers) {
        const hasAccess = await checkUserProcessAssignment(
          progress.processId,
          user.userId
        );

        let stepInstance;
        if (hasAccess) {
          continue;
        } else {
          stepInstance = fromInitiator
            ? await tx.processStepInstance.create({
                data: {
                  processId: progress.processId,
                  assignmentId: assignment.id,
                  progressId: progress.id,
                  assignedTo: user.userId,
                  roleId: roleId,
                  departmentId: departmentId,
                  status: "APPROVED",
                  stepId: step.id,
                },
              })
            : await tx.processStepInstance.create({
                data: {
                  processId: progress.processId,
                  assignmentId: assignment.id,
                  progressId: progress.id,
                  assignedTo: user.userId,
                  roleId: roleId,
                  departmentId: departmentId,
                  status: "IN_PROGRESS",
                  stepId: step.id,
                },
              });

          for (const docId of documentIds) {
            await ensureDocumentAccessWithParents(tx, {
              documentId: docId,
              userId: user.userId,
              stepInstanceId: stepInstance.id,
              processId: progress.processId,
              assignmentId: assignment.id,
              roleId: roleId,
              departmentId: departmentId,
            });
          }
        }
      }
    }
  }

  if (fromInitiator) {
    const process = await tx.processInstance.findUnique({
      where: { id: progress.processId },
    });

    const workflow = await tx.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { include: { assignments: true } } },
    });

    const nextStep = workflow.steps[1];
    for (const nextAssignment of nextStep.assignments) {
      await processAssignment(
        tx,
        process,
        nextStep,
        nextAssignment,
        documentIds,
        false,
        false,
        workflowId
      );
    }

    await tx.processInstance.update({
      where: { id: process.id },
      data: { currentStepId: nextStep.id, status: "IN_PROGRESS" },
    });
  }
}

async function handleUserAssignment(
  tx,
  assignment,
  progress,
  documentIds,
  step,
  fromInitiator,
  workflowId
) {
  for (const userId of assignment.assigneeIds) {
    const hasAccess = await checkUserProcessAssignment(
      progress.processId,
      userId
    );
    let stepInstance;

    if (hasAccess) {
      continue;
    } else {
      stepInstance = fromInitiator
        ? await tx.processStepInstance.create({
            data: {
              processId: progress.processId,
              assignmentId: assignment.id,
              progressId: progress.id,
              assignedTo: userId,
              status: "APPROVED",
              stepId: step.id,
            },
          })
        : await tx.processStepInstance.create({
            data: {
              processId: progress.processId,
              assignmentId: assignment.id,
              progressId: progress.id,
              assignedTo: userId,
              status: "IN_PROGRESS",
              stepId: step.id,
            },
          });

      for (const docId of documentIds) {
        await ensureDocumentAccessWithParents(tx, {
          documentId: docId,
          userId: userId,
          stepInstanceId: stepInstance.id,
          processId: progress.processId,
          assignmentId: assignment.id,
        });
      }
    }
  }

  if (fromInitiator) {
    const process = await tx.processInstance.findUnique({
      where: { id: progress.processId },
    });

    const workflow = await tx.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { include: { assignments: true } } },
    });

    const nextStep = workflow.steps[1];
    for (const nextAssignment of nextStep.assignments) {
      await processAssignment(
        tx,
        process,
        nextStep,
        nextAssignment,
        documentIds,
        false,
        false,
        workflowId
      );
    }

    await tx.processInstance.update({
      where: { id: process.id },
      data: { currentStepId: nextStep.id, status: "IN_PROGRESS" },
    });
  }
}
async function handleRoleAssignment(
  tx,
  assignment,
  progress,
  documentIds,
  step,
  fromInitiator,
  workflowId
) {
  const users = await tx.userRole.findMany({
    where: {
      roleId: { in: assignment.assigneeIds },
    },
    select: {
      userId: true,
      roleId: true,
      role: {
        select: {
          departmentId: true,
        },
      },
    },
  });

  for (const user of users) {
    const hasAccess = await checkUserProcessAssignment(
      progress.processId,
      user.userId
    );

    if (hasAccess) {
      continue;
    } else {
      const stepInstance = fromInitiator
        ? await tx.processStepInstance.create({
            data: {
              processId: progress.processId,
              assignmentId: assignment.id,
              progressId: progress.id,
              assignedTo: user.userId,
              roleId: user.roleId,
              departmentId: user.role.departmentId,
              status: "APPROVED",
              stepId: step.id,
            },
          })
        : await tx.processStepInstance.create({
            data: {
              processId: progress.processId,
              assignmentId: assignment.id,
              progressId: progress.id,
              assignedTo: user.userId,
              roleId: user.roleId,
              departmentId: user.role.departmentId,
              status: "IN_PROGRESS",
              stepId: step.id,
            },
          });

      for (const docId of documentIds) {
        await ensureDocumentAccessWithParents(tx, {
          documentId: docId,
          userId: user.userId,
          stepInstanceId: stepInstance.id,
          processId: progress.processId,
          assignmentId: assignment.id,
          roleId: user.roleId,
          departmentId: user.role.departmentId,
        });
      }
    }
  }

  if (fromInitiator) {
    const process = await tx.processInstance.findUnique({
      where: { id: progress.processId },
    });

    const workflow = await tx.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { include: { assignments: true } } },
    });

    const nextStep = workflow.steps[1];
    for (const nextAssignment of nextStep.assignments) {
      await processAssignment(
        tx,
        process,
        nextStep,
        nextAssignment,
        documentIds,
        false,
        false,
        workflowId
      );
    }

    await tx.processInstance.update({
      where: { id: process.id },
      data: { currentStepId: nextStep.id, status: "IN_PROGRESS" },
    });
  }
}

export const serializeBigInt = (obj) => {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
};

export const view_process_ = async (req, res) => {
  try {
    const { processId } = req.params;
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

    const retry = async (fn, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === retries - 1) throw error;
          console.warn(`Retry ${i + 1} for processId: ${processId}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };

    // Fetch ProcessInstance with minimal relations
    const process = await retry(() =>
      prisma.processInstance.findUnique({
        where: { id: processId },
        include: {
          initiator: {
            select: { id: true, username: true, name: true, email: true },
          },
          workflow: { select: { id: true, name: true, version: true } },
          currentStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
        },
      })
    );

    if (!process) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Process not found",
          details: "No process found with the specified ID.",
          code: "PROCESS_NOT_FOUND",
        },
      });
    }

    // Fetch documents separately
    const documents = await retry(() =>
      prisma.processDocument.findMany({
        where: { processId: process.id },
        include: {
          document: {
            select: { id: true, name: true, type: true, path: true },
          },
          signatures: {
            include: { user: { select: { id: true, username: true } } },
          },
          rejections: {
            include: { user: { select: { id: true, username: true } } },
          },
          documentHistory: {
            include: {
              user: { select: { id: true, name: true, username: true } },
              replacedDocument: {
                select: { id: true, name: true, path: true },
              },
            },
          },
        },
      })
    );

    // Fetch stepInstances separately
    const stepInstances = await retry(() =>
      prisma.processStepInstance.findMany({
        where: {
          processId: process.id,
          assignedTo: userData.id,
          status: {
            in: [
              "IN_PROGRESS",
              "FOR_RECIRCULATION",
              "APPROVED",
              "FOR_RECOMMENDATION",
            ],
          },
        },
        include: {
          workflowStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
            },
          },
          pickedBy: { select: { id: true, username: true } },
          processQA: {
            where: {
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
              status: "OPEN",
            },
            include: {
              initiator: { select: { id: true, name: true } },
              process: { select: { id: true, name: true } },
            },
          },
          recommendations: {
            include: {
              initiator: { select: { id: true, username: true } },
              recommender: { select: { id: true, username: true } },
            },
          },
        },
      })
    );

    process.documents = documents;
    process.stepInstances = stepInstances;
    const getAssigneeUserIds = async (process, prisma) => {
      const assigneeIds = (
        await Promise.all(
          process.stepInstances.flatMap(async (step) => {
            if (!step.workflowAssignment) {
              return step.assignedTo ? [step.assignedTo] : [];
            }

            const { assigneeType, assigneeIds, selectedRoles } =
              step.workflowAssignment;

            if (assigneeType === "USER") {
              // For USER type, return assigneeIds directly

              return assigneeIds || [];
            } else if (assigneeType === "ROLE") {
              // For ROLE type, find all users with these roles
              const userRoles = await prisma.userRole.findMany({
                where: {
                  roleId: { in: assigneeIds.map((id) => parseInt(id)) },
                },
                select: {
                  userId: true,
                },
              });

              return userRoles.map((ur) => ur.userId);
            } else if (assigneeType === "DEPARTMENT") {
              // For DEPARTMENT type, find users with roles from selectedRoles
              const userRoles = await prisma.userRole.findMany({
                where: {
                  roleId: { in: selectedRoles.map((id) => parseInt(id)) },
                },
                select: {
                  userId: true,
                },
              });

              return userRoles.map((ur) => ur.userId);
            }

            return [];
          })
        )
      ).flat(); // Flatten the array of arrays

      return [...new Set(assigneeIds)]; // Remove duplicates
    };

    const assigneeIds = await getAssigneeUserIds(process, prisma);

    const assignees = await prisma.user.findMany({
      where: {
        id: { in: assigneeIds },
      },
      select: {
        id: true,
        username: true,
      },
    });

    const assigneeMap = assignees.reduce((map, user) => {
      map[user.id] = user;
      return map;
    }, {});

    // Deduplicate steps and include username in stepName

    // Deduplicate steps and include username in stepName
    // Deduplicate steps and include only the latest step instance for stepNumber 1

    const firstStepInstances = await retry(() =>
      prisma.processStepInstance.findMany({
        where: {
          processId: process.id,
          status: {
            in: ["APPROVED"],
          },
          workflowStep: {
            stepNumber: 1,
          },
        },
        include: {
          workflowStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
            },
          },
          pickedBy: { select: { id: true, username: true } },
          processQA: {
            where: {
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
              status: "OPEN",
            },
            include: {
              initiator: { select: { id: true, name: true } },
              process: { select: { id: true, name: true } },
            },
          },
          recommendations: {
            include: {
              initiator: { select: { id: true, username: true } },
              recommender: { select: { id: true, username: true } },
            },
          },
        },
      })
    );
    const steps = await (async () => {
      // Filter step instances for stepNumber 1 and APPROVED status
      const stepNumberOneInstances = firstStepInstances.filter(
        (step) =>
          step.status === "APPROVED" &&
          (step.workflowAssignment?.step?.stepNumber === 1 ||
            step.workflowStep?.stepNumber === 1)
      );

      // If no step instances are found for stepNumber 1, return an empty array
      if (stepNumberOneInstances.length === 0) {
        return [];
      }

      // Find the latest step instance based on updatedAt or createdAt
      const latestStep = stepNumberOneInstances.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt;
        const bTime = b.updatedAt || b.createdAt;
        return bTime - aTime; // Sort descending to get the latest first
      })[0];

      const initiator = await prisma.user.findFirst({
        where: {
          id: latestStep.assignedTo,
        },
      });
      // Get step data from workflowAssignment or workflowStep
      const stepData =
        latestStep.workflowAssignment?.step ?? latestStep.workflowStep;

      const assigneeUsername = latestStep.assignedTo
        ? initiator.username
        : "Unknown User";

      // Return the single step in the required format
      return [
        {
          stepName: stepData
            ? `${stepData.stepName}_${assigneeUsername}`
            : `Unknown Step (${assigneeUsername})`,
          stepNumber: stepData?.stepNumber ?? 1,
          stepId: stepData?.id ?? null,
          stepType: stepData?.stepType ?? "UNKNOWN",
          assignees: [latestStep.assignedTo].map((id) => ({
            assigneeId: id,
            assigneeName: initiator.username ?? "Unknown User",
          })),
        },
      ];
    })();

    const processDocuments = await prisma.processDocument.findMany({
      where: { processId: process.id },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            createdOn: true,
          },
        },
        replacedDocument: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
      },
    });

    // Identify replaced and superseded document IDs
    const replacedDocumentIds = new Set(
      processDocuments
        .filter((pd) => pd.replacedDocumentId)
        .map((pd) => pd.replacedDocumentId)
    );

    const supersededDocumentIds = new Set(
      processDocuments
        .filter((pd) => pd.superseding)
        .map((pd) => pd.replacedDocumentId)
    );

    // Find the latest document (neither replaced nor superseded)
    let latestDocument = processDocuments.find(
      (pd) =>
        !replacedDocumentIds.has(pd.documentId) &&
        !supersededDocumentIds.has(pd.documentId)
    );

    // If no such document exists, take the latest non-replaced document
    if (!latestDocument) {
      latestDocument = processDocuments
        .filter((pd) => !replacedDocumentIds.has(pd.documentId))
        .sort((a, b) => b.document.id - a.document.id)[0];
    }

    // Build documentVersioning
    const documentVersioning = [];
    const allProcessDocuments = await prisma.processDocument.findMany({
      where: { processId: process.id },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            createdOn: true,
          },
        },
        replacedDocument: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
      },
    });

    // Create maps for quick lookups
    const docIdToProcessDoc = new Map(
      allProcessDocuments.map((d) => [d.documentId, d])
    );
    const replacedToReplacer = new Map(
      allProcessDocuments
        .filter((d) => d.replacedDocumentId)
        .map((d) => [d.replacedDocumentId, d.documentId])
    );

    // Find all terminal documents (not replaced by any other)
    const terminalDocumentIds = allProcessDocuments
      .filter((d) => !replacedToReplacer.has(d.documentId))
      .map((d) => d.documentId);

    // For each terminal document, build its complete chain

    for (const terminalDocId of terminalDocumentIds) {
      const versions = [];
      let currentDocId = terminalDocId;
      const visitedDocIds = new Set(); // Track visited document IDs to detect cycles

      while (currentDocId) {
        // Check for cycle
        if (visitedDocIds.has(currentDocId)) {
          console.warn(
            `Cycle detected at docId: ${currentDocId}. Breaking loop.`
          );
          break;
        }
        visitedDocIds.add(currentDocId);

        const processDoc = docIdToProcessDoc.get(currentDocId);

        if (!processDoc) {
          console.log("No processDoc found for docId:", currentDocId);
          break;
        }

        versions.unshift({
          id: processDoc.document.id,
          createdAt: processDoc.document.createdOn || null,
          name: processDoc.document.name,
          path: processDoc.document.path.split("/").slice(0, -1).join("/"),
          type: processDoc.document.type,
          issueNo: processDoc.issueNo || null,
          SOPIssueNo: processDoc.SOPIssueNo || null,
          tags: processDoc.tags,
          preApproved: processDoc.preApproved,
          reasonOfSupersed: processDoc.reasonOfSupersed,
          description: processDoc.description,
          partNumber: processDoc.partNumber,
          active: processDoc.document.id === latestDocument?.document?.id,
          isReplacement: processDoc.isReplacement,
          superseding: processDoc.superseding,
          reopenCycle: processDoc.reopenCycle,
        });

        currentDocId = processDoc.replacedDocumentId;
      }

      if (versions.length > 0) {
        documentVersioning.push({
          latestDocumentId: terminalDocId,
          versions: versions,
        });
      } else {
        console.log("No versions added for terminalDocId:", terminalDocId);
      }
    }

    // Handle any documents not included in chains
    const includedDocIds = new Set(
      documentVersioning.flatMap((chain) => chain.versions.map((v) => v.id))
    );
    const missingDocs = allProcessDocuments.filter(
      (d) => !includedDocIds.has(d.documentId)
    );

    for (const doc of missingDocs) {
      documentVersioning.push({
        latestDocumentId: doc.documentId,
        versions: [
          {
            id: doc.document.id,
            name: doc.document.name,
            createdAt: doc.document.createdOn || null,
            path: doc.document.path.split("/").slice(0, -1).join("/"),
            type: doc.document.type,
            tags: doc.document.tags,
            reasonOfSupersed: doc.reasonOfSupersed,
            description: doc.description,
            partNumber: doc.document.partNumber,
            active: doc.document.id === latestDocument?.document?.id,
            isReplacement: doc.isReplacement,
            superseding: doc.superseding,
            reopenCycle: doc.reopenCycle,
            preApproved: doc.preApproved,
            description: doc.description,
          },
        ],
      });
    }

    // Build sededDocuments
    const sededDocuments = [];

    if (processDocuments.length > 0) {
      // Sort all documents by ID to get chronological order
      const allDocsSorted = [...processDocuments].sort(
        (a, b) => a.document.id - b.document.id
      );

      // Find all documents with reopenCycle = 1
      const reopenCycle1Docs = allDocsSorted.filter(
        (doc) => doc.reopenCycle === 1
      );

      // Process each reopenCycle = 1 document
      reopenCycle1Docs.forEach((firstReopenCycle1Doc) => {
        // Find the document that was replaced by this reopenCycle=1 document
        const documentWhichSuperseded = allDocsSorted.find(
          (doc) => doc.documentId === firstReopenCycle1Doc.replacedDocumentId
        );

        const versions = [];
        let currentDoc = firstReopenCycle1Doc;
        let currentReopenCycle = 1;
        let lastDocBeforeCycleChange = null;
        const visitedDocIds = new Set(); // Track visited document IDs to prevent infinite loops

        // Build versions by finding documents just before reopenCycle increments
        while (currentDoc && !visitedDocIds.has(currentDoc.documentId)) {
          visitedDocIds.add(currentDoc.documentId); // Mark current document as visited

          if (currentDoc.reopenCycle > currentReopenCycle) {
            // Found a cycle change - add the last doc from previous cycle
            if (lastDocBeforeCycleChange) {
              versions.push({
                id: lastDocBeforeCycleChange.document.id,
                createdAt: lastDocBeforeCycleChange.document.createdOn || null,
                name: lastDocBeforeCycleChange.document.name,
                path: lastDocBeforeCycleChange.document.path
                  ? lastDocBeforeCycleChange.document.path
                      .split("/")
                      .slice(0, -1)
                      .join("/")
                  : "",
                issueNo: lastDocBeforeCycleChange.issueNo || null,
                SOPIssueNo: lastDocBeforeCycleChange.SOPIssueNo || null,
                type: lastDocBeforeCycleChange.document.type || "",
                tags: lastDocBeforeCycleChange.tags || [],
                reasonOfSupersed:
                  lastDocBeforeCycleChange.reasonOfSupersed || null,
                description: lastDocBeforeCycleChange.description || null,
                partNumber: lastDocBeforeCycleChange.partNumber || null,
                active:
                  lastDocBeforeCycleChange.document.id ===
                  (latestDocument?.document?.id || null),
                isReplacement: lastDocBeforeCycleChange.isReplacement || false,
                superseding: lastDocBeforeCycleChange.superseding || false,
                preApproved: lastDocBeforeCycleChange.preApproved || false,
                reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
              });
            }
            currentReopenCycle = currentDoc.reopenCycle;
          }

          // Track the last document we see for each reopenCycle
          lastDocBeforeCycleChange = currentDoc;

          // Move to next document in the chain
          currentDoc = allDocsSorted.find(
            (d) => d.replacedDocumentId === currentDoc.documentId
          );
        }

        // Add the last document if it wasn't added yet
        if (
          lastDocBeforeCycleChange &&
          !versions.some((v) => v.id === lastDocBeforeCycleChange.document.id)
        ) {
          versions.push({
            id: lastDocBeforeCycleChange.document.id,
            name: lastDocBeforeCycleChange.document.name,
            createdAt: lastDocBeforeCycleChange.document.createdOn || null,
            path: lastDocBeforeCycleChange.document.path
              ? lastDocBeforeCycleChange.document.path
                  .split("/")
                  .slice(0, -1)
                  .join("/")
              : "",
            type: lastDocBeforeCycleChange.document.type || "",
            issueNo: lastDocBeforeCycleChange.document.issueNo || null,
            tags: lastDocBeforeCycleChange.tags || [],
            active:
              lastDocBeforeCycleChange.document.id ===
              (latestDocument?.document?.id || null),
            isReplacement: lastDocBeforeCycleChange.isReplacement || false,
            superseding: lastDocBeforeCycleChange.superseding || false,
            reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
            preApproved: lastDocBeforeCycleChange.preApproved || false,
            reasonOfSupersed: lastDocBeforeCycleChange.reasonOfSupersed || null,
            description: lastDocBeforeCycleChange.description || null,
            partNumber: lastDocBeforeCycleChange.partNumber || null,
          });
        }

        // Add to sededDocuments if a superseded document was found
        if (documentWhichSuperseded) {
          sededDocuments.push({
            documentWhichSuperseded: {
              id: documentWhichSuperseded.document.id,
              name: documentWhichSuperseded.document.name,
              createdAt: documentWhichSuperseded.document.createdOn || null,
              path: documentWhichSuperseded.document.path
                ? documentWhichSuperseded.document.path
                    .split("/")
                    .slice(0, -1)
                    .join("/")
                : "",
              type: documentWhichSuperseded.document.type || "",
              description: documentWhichSuperseded.description || "",
              preApproved: documentWhichSuperseded.preApproved || false,
              tags: documentWhichSuperseded.tags || [],
              issueNo: documentWhichSuperseded.issueNo || null,
              SOPIssueNo: documentWhichSuperseded.SOPIssueNo || null,
              reasonOfSupersed:
                documentWhichSuperseded.reasonOfSupersed || null,
              description: documentWhichSuperseded.description || null,
              partNumber: documentWhichSuperseded.partNumber || null,
            },
            latestDocumentId: latestDocument
              ? latestDocument.document.id
              : null,
            versions: versions,
          });
        }
      });
    }

    // Transform documents for response
    const transformedDocuments = processDocuments
      .filter(
        (doc) =>
          (!replacedDocumentIds.has(doc.documentId) ||
            (doc.replacedDocument &&
              doc.document.id === doc.replacedDocument.id)) &&
          !supersededDocumentIds.has(doc.documentId)
      )
      .map((doc) => {
        const processDoc = process.documents.find(
          (d) => d.documentId === doc.documentId
        );
        const signedBy =
          processDoc?.signatures.map((sig) => ({
            signedBy: sig.user.username,
            signedAt: sig.signedAt ? sig.signedAt.toISOString() : null,
            remarks: sig.reason || null,
            byRecommender: sig.byRecommender,
            isAttachedWithRecommendation: sig.isAttachedWithRecommendation,
          })) || [];

        const rejectionDetails =
          processDoc?.rejections.length > 0
            ? {
                rejectedBy: processDoc.rejections[0].user.username,
                rejectionReason: processDoc.rejections[0].reason || null,
                rejectedAt: processDoc.rejections[0].rejectedAt
                  ? processDoc.rejections[0].rejectedAt.toISOString()
                  : null,
                byRecommender: processDoc.rejections[0].byRecommender,
                isAttachedWithRecommendation:
                  processDoc.rejections[0].isAttachedWithRecommendation,
              }
            : null;

        const parts = doc.document.path.split("/");
        parts.pop();
        const updatedPath = parts.join("/");
        return {
          id: doc.document.id,
          name: doc.document.name,
          createdAt: doc.document.createdOn || null,
          type: doc.document.type,
          path: updatedPath,
          tags: doc.tags,
          signedBy,
          rejectionDetails,
          isRecirculationTrigger:
            processDoc?.documentHistory.some(
              (history) => history.isRecirculationTrigger
            ) || false,
          approvalCount: signedBy.length,
          isReplacement: doc.isReplacement,
          superseding: doc.superseding,
          preApproved: doc.preApproved,
          reopenCycle: doc.reopenCycle,
          description: doc.description,
          reasonOfSupersed: doc.reasonOfSupersed,
          description: doc.description,
          partNumber: doc.partNumber,
          issueNo: doc.issueNo,
          SOPIssueNo: doc.SOPIssueNo,
          active: true,
        };
      });

    const queryStepInstances = await retry(() =>
      prisma.processStepInstance.findMany({
        where: {
          processId: process.id,
          status: {
            in: [
              "IN_PROGRESS",
              "FOR_RECIRCULATION",
              "APPROVED",
              "FOR_RECOMMENDATION",
            ],
          },
        },
        include: {
          workflowStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
            },
          },
          pickedBy: { select: { id: true, username: true } },
          processQA: {
            where: {
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
              status: "OPEN",
            },
            include: {
              initiator: { select: { id: true, name: true } },
              process: { select: { id: true, name: true } },
            },
          },
          recommendations: {
            include: {
              initiator: { select: { id: true, username: true } },
              recommender: { select: { id: true, username: true } },
            },
          },
        },
      })
    );

    const queryDetails = await Promise.all(
      queryStepInstances.flatMap((step) =>
        step.processQA.map(async (qa) => {
          const documentHistoryIds = [
            ...(qa.details?.documentChanges?.map(
              (dc) => dc.documentHistoryId
            ) || []),
            ...(qa.details?.documentSummaries?.map(
              (ds) => ds.documentHistoryId
            ) || []),
          ];

          const documentHistories =
            documentHistoryIds.length > 0
              ? await prisma.documentHistory.findMany({
                  where: { id: { in: documentHistoryIds } },
                  include: {
                    document: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        path: true,
                      },
                    },
                    replacedDocument: {
                      select: {
                        id: true,
                        name: true,
                        path: true,
                      },
                    },
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                      },
                    },
                  },
                })
              : [];

          return {
            stepInstanceId: step.id,
            stepName: step.workflowAssignment?.step?.stepName ?? null,
            stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
            status: step.status,
            taskType: qa.answer ? "RESOLVED" : "QUERY_UPLOAD",
            queryText: qa.question,
            answerText: qa.answer || null,
            initiatorName: qa.initiator.name,
            createdAt: qa.createdAt.toISOString(),
            answeredAt: qa.answeredAt ? qa.answeredAt.toISOString() : null,
            documentChanges:
              qa.details?.documentChanges?.map((dc) => {
                const history = documentHistories.find(
                  (h) => h.id === dc.documentHistoryId
                );
                return {
                  documentId: dc.documentId,
                  requiresApproval: dc.requiresApproval,
                  isReplacement: dc.isReplacement,
                  superseding: dc.superseding || false,
                  documentHistoryId: dc.documentHistoryId,
                  document: history?.document
                    ? {
                        id: history.document.id,
                        name: history.document.name,
                        type: history.document.type,
                        path: history.document.path,
                        tags: history.document.tags,
                      }
                    : null,
                  actionDetails: history?.actionDetails,
                  user: history?.user.name,
                  createdAt: history?.createdAt.toISOString(),
                  replacedDocument: history?.replacedDocument
                    ? {
                        id: history.replacedDocument.id,
                        name: history.replacedDocument.name,
                        path: history.replacedDocument.path,
                      }
                    : null,
                  reopenCycle: history?.actionDetails?.reopenCycle || 0,
                };
              }) || [],
            documentSummaries:
              qa.details?.documentSummaries?.map((ds) => {
                const history = documentHistories.find(
                  (h) => h.id === ds.documentHistoryId
                );
                return {
                  documentId: ds.documentId,
                  feedbackText: ds.feedbackText,
                  documentHistoryId: ds.documentHistoryId,
                  documentDetails: history?.document
                    ? {
                        id: history.document.id,
                        name: history.document.name,
                        path: history.document.path,
                      }
                    : null,
                  user: history?.user.username,
                  createdAt: history?.createdAt.toISOString(),
                  reopenCycle: history?.actionDetails?.reopenCycle || 0,
                };
              }) || [],
            assigneeDetails: qa.details?.assigneeDetails
              ? {
                  assignedStepName: qa.details.assigneeDetails.assignedStepName,
                  assignedAssigneeId:
                    qa.details.assigneeDetails.assignedAssigneeId,
                  assignedAssigneeName: qa.details.assigneeDetails
                    .assignedAssigneeId
                    ? (
                        await prisma.user.findUnique({
                          where: {
                            id: parseInt(
                              qa.details.assigneeDetails.assignedAssigneeId
                            ),
                          },
                          select: { username: true },
                        })
                      )?.username || null
                    : null,
                }
              : null,
          };
        })
      )
    );

    const recommendationDetails = await Promise.all(
      process.stepInstances.flatMap((step) =>
        step.recommendations.map(async (rec) => {
          const documentSummaries = rec.documentSummaries || [];
          const documentResponses = rec.details?.documentResponses || [];
          const documentIds = documentSummaries.map((ds) =>
            parseInt(ds.documentId)
          );
          const documents = documentIds.length
            ? await prisma.document.findMany({
                where: { id: { in: documentIds } },
                select: { id: true, name: true },
              })
            : [];

          const documentMap = documents.reduce((map, doc) => {
            map[doc.id] = doc.name;
            return map;
          }, {});

          const documentDetails = documentSummaries.map((ds) => {
            const response = documentResponses?.find(
              (dr) => parseInt(dr.documentId) === parseInt(ds.documentId)
            );
            return {
              documentId: ds.documentId,
              documentName: documentMap[ds.documentId] || "Unknown Document",
              queryText: ds.queryText,
              answerText: response?.answerText || null,
            };
          });

          return {
            recommendationId: rec.id,
            stepInstanceId: step.id,
            stepName: step.workflowAssignment?.step?.stepName ?? null,
            stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
            status: rec.status,
            recommendationText: rec.recommendationText,
            responseText: rec.responseText || null,
            initiatorName: rec.initiator.username,
            recommenderName: rec.recommender.username,
            createdAt: rec.createdAt.toISOString(),
            respondedAt: rec.respondedAt ? rec.respondedAt.toISOString() : null,
            documentDetails,
          };
        })
      )
    );

    const toBePicked = process.stepInstances.every(
      (step) => step.pickedById === null
    );

    const workflow = {
      id: process.workflow.id,
      name: process.workflow.name,
      version: process.workflow.version,
    };

    const processDocs = await prisma.processDocument.findMany({
      where: {
        processId,
      },
      select: {
        reopenCycle: true,
      },
      distinct: ["reopenCycle"],
    });

    // Map reopenCycle to version numbers (reopenCycle + 1) and ensure uniqueness
    const versions = [
      ...new Set(processDocs.map((doc) => doc.reopenCycle + 1)),
    ].sort((a, b) => a - b);

    // Find the current step instance to get stepNumber and stepType
    const currentStepInstance = process.stepInstances.find(
      (item) =>
        item.id ===
        process.stepInstances.filter((item) => item.status === "IN_PROGRESS")[0]
          ?.id
    );

    const responseData = {
      process: {
        processStoragePath: process.storagePath,
        description: process.description,
        processName: process.name,
        initiatorName: process.initiator.username,
        status: process.status,
        createdAt: process.createdAt,
        issueNo: process.issueNo,
        processId: process.id,
        reopenCycle: process.reopenCycle,
        versions: versions,
        processStepInstanceId:
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS"
          )[0]?.id || null,
        arrivedAt:
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS"
          )[0]?.updatedAt ||
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS"
          )[0]?.createdAt ||
          null,
        updatedAt: process.updatedAt,
        toBePicked,
        isRecirculated: process.isRecirculated,
        documents: transformedDocuments,
        steps,
        queryDetails,
        recommendationDetails,
        documentVersioning,
        sededDocuments,
        workflow,
        currentStepNumber:
          currentStepInstance?.workflowStep?.stepNumber || null,
        currentStepType:
          process.status === "COMPLETED" || process.initiator.id === userData.id
            ? "APPROVAL"
            : currentStepInstance?.workflowStep?.stepType,
      },
    };

    // Serialize BigInt values
    const serializedResponse = serializeBigInt(responseData);

    return res.status(200).json(serializedResponse);
  } catch (error) {
    console.error("Error getting process:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to view process",
        details: error.message,
        code: "PROCESS_VIEW_ERROR",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
};

export const view_process = async (req, res) => {
  try {
    const { processId } = req.params;
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

    const retry = async (fn, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === retries - 1) throw error;
          console.warn(`Retry ${i + 1} for processId: ${processId}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };

    // Fetch ProcessInstance with minimal relations
    const process = await retry(() =>
      prisma.processInstance.findUnique({
        where: { id: processId },
        include: {
          initiator: {
            select: { id: true, username: true, name: true, email: true },
          },
          workflow: { select: { id: true, name: true, version: true } },
          currentStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
        },
      })
    );

    if (!process) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Process not found",
          details: "No process found with the specified ID.",
          code: "PROCESS_NOT_FOUND",
        },
      });
    }

    // Fetch documents separately
    const documents = await retry(() =>
      prisma.processDocument.findMany({
        where: { processId: process.id },
        include: {
          document: {
            select: { id: true, name: true, type: true, path: true },
          },
          signatures: {
            include: { user: { select: { id: true, username: true } } },
          },
          rejections: {
            include: { user: { select: { id: true, username: true } } },
          },
          documentHistory: {
            include: {
              user: { select: { id: true, name: true, username: true } },
              replacedDocument: {
                select: { id: true, name: true, path: true },
              },
            },
          },
        },
      })
    );

    // Fetch stepInstances separately
    const stepInstances = await retry(() =>
      prisma.processStepInstance.findMany({
        where: {
          processId: process.id,
          assignedTo: userData.id,
          status: {
            in: [
              "IN_PROGRESS",
              "FOR_RECIRCULATION",
              "APPROVED",
              "FOR_RECOMMENDATION",
            ],
          },
        },
        include: {
          workflowStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
            },
          },
          pickedBy: { select: { id: true, username: true } },
          processQA: {
            where: {
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
              status: "OPEN",
            },
            include: {
              initiator: { select: { id: true, name: true } },
              process: { select: { id: true, name: true } },
            },
          },
          recommendations: {
            include: {
              initiator: { select: { id: true, username: true } },
              recommender: { select: { id: true, username: true } },
            },
          },
        },
      })
    );

    process.documents = documents;
    process.stepInstances = stepInstances;
    const getAssigneeUserIds = async (process, prisma) => {
      const assigneeIds = (
        await Promise.all(
          process.stepInstances.flatMap(async (step) => {
            if (!step.workflowAssignment) {
              return step.assignedTo ? [step.assignedTo] : [];
            }

            const { assigneeType, assigneeIds, selectedRoles } =
              step.workflowAssignment;

            if (assigneeType === "USER") {
              // For USER type, return assigneeIds directly

              return assigneeIds || [];
            } else if (assigneeType === "ROLE") {
              // For ROLE type, find all users with these roles
              const userRoles = await prisma.userRole.findMany({
                where: {
                  roleId: { in: assigneeIds.map((id) => parseInt(id)) },
                },
                select: {
                  userId: true,
                },
              });

              return userRoles.map((ur) => ur.userId);
            } else if (assigneeType === "DEPARTMENT") {
              // For DEPARTMENT type, find users with roles from selectedRoles
              const userRoles = await prisma.userRole.findMany({
                where: {
                  roleId: { in: selectedRoles.map((id) => parseInt(id)) },
                },
                select: {
                  userId: true,
                },
              });

              return userRoles.map((ur) => ur.userId);
            }

            return [];
          })
        )
      ).flat(); // Flatten the array of arrays

      return [...new Set(assigneeIds)]; // Remove duplicates
    };

    const assigneeIds = await getAssigneeUserIds(process, prisma);

    const assignees = await prisma.user.findMany({
      where: {
        id: { in: assigneeIds },
      },
      select: {
        id: true,
        username: true,
      },
    });

    const assigneeMap = assignees.reduce((map, user) => {
      map[user.id] = user;
      return map;
    }, {});

    // Deduplicate steps and include username in stepName

    // Deduplicate steps and include username in stepName
    // Deduplicate steps and include only the latest step instance for stepNumber 1

    const firstStepInstances = await retry(() =>
      prisma.processStepInstance.findMany({
        where: {
          processId: process.id,
          status: {
            in: ["APPROVED"],
          },
          workflowStep: {
            stepNumber: 1,
          },
        },
        include: {
          workflowStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
            },
          },
          pickedBy: { select: { id: true, username: true } },
          processQA: {
            where: {
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
              status: "OPEN",
            },
            include: {
              initiator: { select: { id: true, name: true } },
              process: { select: { id: true, name: true } },
            },
          },
          recommendations: {
            include: {
              initiator: { select: { id: true, username: true } },
              recommender: { select: { id: true, username: true } },
            },
          },
        },
      })
    );
    const steps = await (async () => {
      // Filter step instances for stepNumber 1 and APPROVED status
      const stepNumberOneInstances = firstStepInstances.filter(
        (step) =>
          step.status === "APPROVED" &&
          (step.workflowAssignment?.step?.stepNumber === 1 ||
            step.workflowStep?.stepNumber === 1)
      );

      // If no step instances are found for stepNumber 1, return an empty array
      if (stepNumberOneInstances.length === 0) {
        return [];
      }

      // Find the latest step instance based on updatedAt or createdAt
      const latestStep = stepNumberOneInstances.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt;
        const bTime = b.updatedAt || b.createdAt;
        return bTime - aTime; // Sort descending to get the latest first
      })[0];

      const initiator = await prisma.user.findFirst({
        where: {
          id: latestStep.assignedTo,
        },
      });
      // Get step data from workflowAssignment or workflowStep
      const stepData =
        latestStep.workflowAssignment?.step ?? latestStep.workflowStep;

      const assigneeUsername = latestStep.assignedTo
        ? initiator.username
        : "Unknown User";

      // Return the single step in the required format
      return [
        {
          stepName: stepData
            ? `${stepData.stepName}_${assigneeUsername}`
            : `Unknown Step (${assigneeUsername})`,
          stepNumber: stepData?.stepNumber ?? 1,
          stepId: stepData?.id ?? null,
          stepType: stepData?.stepType ?? "UNKNOWN",
          assignees: [latestStep.assignedTo].map((id) => ({
            assigneeId: id,
            assigneeName: initiator.username ?? "Unknown User",
          })),
        },
      ];
    })();

    const processDocuments = await prisma.processDocument.findMany({
      where: { processId: process.id },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            createdOn: true,
          },
        },
        replacedDocument: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
      },
    });

    // Identify replaced and superseded document IDs
    const replacedDocumentIds = new Set(
      processDocuments
        .filter((pd) => pd.replacedDocumentId)
        .map((pd) => pd.replacedDocumentId)
    );

    const supersededDocumentIds = new Set(
      processDocuments
        .filter((pd) => pd.superseding)
        .map((pd) => pd.replacedDocumentId)
    );

    // Find the latest document (neither replaced nor superseded)
    let latestDocument = processDocuments.find(
      (pd) =>
        !replacedDocumentIds.has(pd.documentId) &&
        !supersededDocumentIds.has(pd.documentId)
    );

    // If no such document exists, take the latest non-replaced document
    if (!latestDocument) {
      latestDocument = processDocuments
        .filter((pd) => !replacedDocumentIds.has(pd.documentId))
        .sort((a, b) => b.document.id - a.document.id)[0];
    }

    // Build documentVersioning
    // Build documentVersioning
    const documentVersioning = [];
    const allProcessDocuments = await prisma.processDocument.findMany({
      where: { processId: process.id },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            createdOn: true,
          },
        },
        replacedDocument: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
      },
    });

    // Create maps for quick lookups
    const docIdToProcessDoc = new Map(
      allProcessDocuments.map((d) => [d.documentId, d])
    );
    const replacedToReplacer = new Map(
      allProcessDocuments
        .filter((d) => d.replacedDocumentId)
        .map((d) => [d.replacedDocumentId, d.documentId])
    );

    // Find all terminal documents (not replaced by any other)
    const terminalDocumentIds = allProcessDocuments
      .filter((d) => !replacedToReplacer.has(d.documentId))
      .map((d) => d.documentId);

    // For each terminal document, build its complete chain
    for (const terminalDocId of terminalDocumentIds) {
      const versions = [];
      let currentDocId = terminalDocId;
      const visitedDocIds = new Set(); // Track visited document IDs to detect cycles

      while (currentDocId) {
        // Check for cycle
        if (visitedDocIds.has(currentDocId)) {
          console.warn(
            `Cycle detected at docId: ${currentDocId}. Breaking loop.`
          );
          break;
        }
        visitedDocIds.add(currentDocId);

        const processDoc = docIdToProcessDoc.get(currentDocId);

        if (!processDoc) {
          console.log("No processDoc found for docId:", currentDocId);
          break;
        }

        versions.unshift({
          id: processDoc.document.id,
          createdAt: processDoc.document.createdOn || null,
          name: processDoc.document.name,
          path: processDoc.document.path.split("/").slice(0, -1).join("/"),
          type: processDoc.document.type,
          issueNo: processDoc.issueNo || null,
          SOPIssueNo: processDoc.SOPIssueNo || null,
          tags: processDoc.tags,
          preApproved: processDoc.preApproved,
          reasonOfSupersed: processDoc.reasonOfSupersed,
          description: processDoc.description,
          partNumber: processDoc.partNumber,
          active: processDoc.document.id === latestDocument?.document?.id,
          isReplacement: processDoc.isReplacement,
          superseding: processDoc.superseding,
          reopenCycle: processDoc.reopenCycle,
        });

        currentDocId = processDoc.replacedDocumentId;
      }

      if (versions.length > 0) {
        documentVersioning.push({
          latestDocumentId: terminalDocId,
          versions: versions,
        });
      } else {
        console.log("No versions added for terminalDocId:", terminalDocId);
      }
    }

    // NEW: Handle documents that appear in newer reopen cycles without being replacements
    // These are documents that don't replace any existing document and aren't replaced by any document
    const standaloneDocs = allProcessDocuments.filter((doc) => {
      // Document doesn't replace any other document
      const isNotReplacement = !doc.replacedDocumentId;
      // Document isn't replaced by any other document (already covered by terminalDocIds)
      const isNotReplaced = !replacedToReplacer.has(doc.documentId);
      // Document isn't already included in any chain
      const isNotIncluded = !documentVersioning.some((chain) =>
        chain.versions.some((v) => v.id === doc.documentId)
      );

      return isNotReplacement && isNotReplaced && isNotIncluded;
    });

    // Add standalone documents as separate chains
    for (const standaloneDoc of standaloneDocs) {
      documentVersioning.push({
        latestDocumentId: standaloneDoc.documentId,
        versions: [
          {
            id: standaloneDoc.document.id,
            name: standaloneDoc.document.name,
            createdAt: standaloneDoc.document.createdOn || null,
            path: standaloneDoc.document.path.split("/").slice(0, -1).join("/"),
            type: standaloneDoc.document.type,
            tags: standaloneDoc.tags,
            reasonOfSupersed: standaloneDoc.reasonOfSupersed,
            description: standaloneDoc.description,
            partNumber: standaloneDoc.partNumber,
            active: standaloneDoc.document.id === latestDocument?.document?.id,
            isReplacement: standaloneDoc.isReplacement,
            superseding: standaloneDoc.superseding,
            reopenCycle: standaloneDoc.reopenCycle,
            issueNo: standaloneDoc.issueNo || null,
            SOPIssueNo: standaloneDoc.SOPIssueNo || null,
            preApproved: standaloneDoc.preApproved,
            description: standaloneDoc.description,
          },
        ],
      });
    }

    // Group document chains by reopenCycle
    const groupedDocumentVersioning = {};
    documentVersioning.forEach((chain) => {
      // Get the reopenCycle from the latest version
      const latestVersion = chain.versions[chain.versions.length - 1];
      const reopenCycle = latestVersion.reopenCycle || 0;

      if (!groupedDocumentVersioning[reopenCycle]) {
        groupedDocumentVersioning[reopenCycle] = [];
      }
      groupedDocumentVersioning[reopenCycle].push(chain);
    });

    // Transform to array format with reopenCycle info
    const finalDocumentVersioning = Object.entries(
      groupedDocumentVersioning
    ).map(([reopenCycle, chains]) => ({
      reopenCycle: parseInt(reopenCycle),
      chains: chains,
    }));

    // Sort by reopenCycle ascending
    finalDocumentVersioning.sort((a, b) => a.reopenCycle - b.reopenCycle);

    // Build sededDocuments
    const sededDocuments = [];

    if (processDocuments.length > 0) {
      // Sort all documents by ID to get chronological order
      const allDocsSorted = [...processDocuments].sort(
        (a, b) => a.document.id - b.document.id
      );

      // Find all documents with reopenCycle = 1
      const reopenCycle1Docs = allDocsSorted.filter(
        (doc) => doc.reopenCycle === 1
      );

      // Process each reopenCycle = 1 document
      reopenCycle1Docs.forEach((firstReopenCycle1Doc) => {
        // Find the document that was replaced by this reopenCycle=1 document
        const documentWhichSuperseded = allDocsSorted.find(
          (doc) => doc.documentId === firstReopenCycle1Doc.replacedDocumentId
        );

        const versions = [];
        let currentDoc = firstReopenCycle1Doc;
        let currentReopenCycle = 1;
        let lastDocBeforeCycleChange = null;
        const visitedDocIds = new Set(); // Track visited document IDs to prevent infinite loops

        // Build versions by finding documents just before reopenCycle increments
        while (currentDoc && !visitedDocIds.has(currentDoc.documentId)) {
          visitedDocIds.add(currentDoc.documentId); // Mark current document as visited

          if (currentDoc.reopenCycle > currentReopenCycle) {
            // Found a cycle change - add the last doc from previous cycle
            if (lastDocBeforeCycleChange) {
              versions.push({
                id: lastDocBeforeCycleChange.document.id,
                createdAt: lastDocBeforeCycleChange.document.createdOn || null,
                name: lastDocBeforeCycleChange.document.name,
                path: lastDocBeforeCycleChange.document.path
                  ? lastDocBeforeCycleChange.document.path
                      .split("/")
                      .slice(0, -1)
                      .join("/")
                  : "",
                issueNo: lastDocBeforeCycleChange.issueNo || null,
                SOPIssueNo: lastDocBeforeCycleChange.SOPIssueNo || null,
                type: lastDocBeforeCycleChange.document.type || "",
                tags: lastDocBeforeCycleChange.tags || [],
                reasonOfSupersed:
                  lastDocBeforeCycleChange.reasonOfSupersed || null,
                description: lastDocBeforeCycleChange.description || null,
                partNumber: lastDocBeforeCycleChange.partNumber || null,
                active:
                  lastDocBeforeCycleChange.document.id ===
                  (latestDocument?.document?.id || null),
                isReplacement: lastDocBeforeCycleChange.isReplacement || false,
                superseding: lastDocBeforeCycleChange.superseding || false,
                preApproved: lastDocBeforeCycleChange.preApproved || false,
                reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
              });
            }
            currentReopenCycle = currentDoc.reopenCycle;
          }

          // Track the last document we see for each reopenCycle
          lastDocBeforeCycleChange = currentDoc;

          // Move to next document in the chain
          currentDoc = allDocsSorted.find(
            (d) => d.replacedDocumentId === currentDoc.documentId
          );
        }

        // Add the last document if it wasn't added yet
        if (
          lastDocBeforeCycleChange &&
          !versions.some((v) => v.id === lastDocBeforeCycleChange.document.id)
        ) {
          versions.push({
            id: lastDocBeforeCycleChange.document.id,
            name: lastDocBeforeCycleChange.document.name,
            createdAt: lastDocBeforeCycleChange.document.createdOn || null,
            path: lastDocBeforeCycleChange.document.path
              ? lastDocBeforeCycleChange.document.path
                  .split("/")
                  .slice(0, -1)
                  .join("/")
              : "",
            type: lastDocBeforeCycleChange.document.type || "",
            issueNo: lastDocBeforeCycleChange.document.issueNo || null,
            tags: lastDocBeforeCycleChange.tags || [],
            active:
              lastDocBeforeCycleChange.document.id ===
              (latestDocument?.document?.id || null),
            isReplacement: lastDocBeforeCycleChange.isReplacement || false,
            superseding: lastDocBeforeCycleChange.superseding || false,
            reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
            preApproved: lastDocBeforeCycleChange.preApproved || false,
            reasonOfSupersed: lastDocBeforeCycleChange.reasonOfSupersed || null,
            description: lastDocBeforeCycleChange.description || null,
            partNumber: lastDocBeforeCycleChange.partNumber || null,
          });
        }

        // Add to sededDocuments if a superseded document was found
        if (documentWhichSuperseded) {
          sededDocuments.push({
            documentWhichSuperseded: {
              id: documentWhichSuperseded.document.id,
              name: documentWhichSuperseded.document.name,
              createdAt: documentWhichSuperseded.document.createdOn || null,
              path: documentWhichSuperseded.document.path
                ? documentWhichSuperseded.document.path
                    .split("/")
                    .slice(0, -1)
                    .join("/")
                : "",
              type: documentWhichSuperseded.document.type || "",
              description: documentWhichSuperseded.description || "",
              preApproved: documentWhichSuperseded.preApproved || false,
              tags: documentWhichSuperseded.tags || [],
              issueNo: documentWhichSuperseded.issueNo || null,
              SOPIssueNo: documentWhichSuperseded.SOPIssueNo || null,
              reasonOfSupersed:
                documentWhichSuperseded.reasonOfSupersed || null,
              description: documentWhichSuperseded.description || null,
              partNumber: documentWhichSuperseded.partNumber || null,
            },
            latestDocumentId: latestDocument
              ? latestDocument.document.id
              : null,
            versions: versions,
          });
        }
      });
    }

    // Transform documents for response
    const transformedDocuments = processDocuments
      .filter(
        (doc) =>
          (!replacedDocumentIds.has(doc.documentId) ||
            (doc.replacedDocument &&
              doc.document.id === doc.replacedDocument.id)) &&
          !supersededDocumentIds.has(doc.documentId)
      )
      .map((doc) => {
        const processDoc = process.documents.find(
          (d) => d.documentId === doc.documentId
        );
        const signedBy =
          processDoc?.signatures.map((sig) => ({
            signedBy: sig.user.username,
            signedAt: sig.signedAt ? sig.signedAt.toISOString() : null,
            remarks: sig.reason || null,
            byRecommender: sig.byRecommender,
            isAttachedWithRecommendation: sig.isAttachedWithRecommendation,
          })) || [];

        const rejectionDetails =
          processDoc?.rejections.length > 0
            ? {
                rejectedBy: processDoc.rejections[0].user.username,
                rejectionReason: processDoc.rejections[0].reason || null,
                rejectedAt: processDoc.rejections[0].rejectedAt
                  ? processDoc.rejections[0].rejectedAt.toISOString()
                  : null,
                byRecommender: processDoc.rejections[0].byRecommender,
                isAttachedWithRecommendation:
                  processDoc.rejections[0].isAttachedWithRecommendation,
              }
            : null;

        const parts = doc.document.path.split("/");
        parts.pop();
        const updatedPath = parts.join("/");
        return {
          id: doc.document.id,
          name: doc.document.name,
          createdAt: doc.document.createdOn || null,
          type: doc.document.type,
          path: updatedPath,
          tags: doc.tags,
          signedBy,
          rejectionDetails,
          isRecirculationTrigger:
            processDoc?.documentHistory.some(
              (history) => history.isRecirculationTrigger
            ) || false,
          approvalCount: signedBy.length,
          isReplacement: doc.isReplacement,
          superseding: doc.superseding,
          preApproved: doc.preApproved,
          reopenCycle: doc.reopenCycle,
          description: doc.description,
          reasonOfSupersed: doc.reasonOfSupersed,
          description: doc.description,
          partNumber: doc.partNumber,
          issueNo: doc.issueNo,
          SOPIssueNo: doc.SOPIssueNo,
          active: true,
        };
      });

    const queryStepInstances = await retry(() =>
      prisma.processStepInstance.findMany({
        where: {
          processId: process.id,
          status: {
            in: [
              "IN_PROGRESS",
              "FOR_RECIRCULATION",
              "APPROVED",
              "FOR_RECOMMENDATION",
            ],
          },
        },
        include: {
          workflowStep: {
            select: {
              id: true,
              stepName: true,
              stepNumber: true,
              stepType: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  stepName: true,
                  stepNumber: true,
                  stepType: true,
                },
              },
            },
          },
          pickedBy: { select: { id: true, username: true } },
          processQA: {
            where: {
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
              status: "OPEN",
            },
            include: {
              initiator: { select: { id: true, name: true } },
              process: { select: { id: true, name: true } },
            },
          },
          recommendations: {
            include: {
              initiator: { select: { id: true, username: true } },
              recommender: { select: { id: true, username: true } },
            },
          },
        },
      })
    );

    const queryDetails = await Promise.all(
      queryStepInstances.flatMap((step) =>
        step.processQA.map(async (qa) => {
          const documentHistoryIds = [
            ...(qa.details?.documentChanges?.map(
              (dc) => dc.documentHistoryId
            ) || []),
            ...(qa.details?.documentSummaries?.map(
              (ds) => ds.documentHistoryId
            ) || []),
          ];

          const documentHistories =
            documentHistoryIds.length > 0
              ? await prisma.documentHistory.findMany({
                  where: { id: { in: documentHistoryIds } },
                  include: {
                    document: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        path: true,
                      },
                    },
                    replacedDocument: {
                      select: {
                        id: true,
                        name: true,
                        path: true,
                      },
                    },
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                      },
                    },
                  },
                })
              : [];

          return {
            stepInstanceId: step.id,
            stepName: step.workflowAssignment?.step?.stepName ?? null,
            stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
            status: step.status,
            taskType: qa.answer ? "RESOLVED" : "QUERY_UPLOAD",
            queryText: qa.question,
            answerText: qa.answer || null,
            initiatorName: qa.initiator.name,
            createdAt: qa.createdAt.toISOString(),
            answeredAt: qa.answeredAt ? qa.answeredAt.toISOString() : null,
            documentChanges:
              qa.details?.documentChanges?.map((dc) => {
                const history = documentHistories.find(
                  (h) => h.id === dc.documentHistoryId
                );
                return {
                  documentId: dc.documentId,
                  requiresApproval: dc.requiresApproval,
                  isReplacement: dc.isReplacement,
                  superseding: dc.superseding || false,
                  documentHistoryId: dc.documentHistoryId,
                  document: history?.document
                    ? {
                        id: history.document.id,
                        name: history.document.name,
                        type: history.document.type,
                        path: history.document.path,
                        tags: history.document.tags,
                      }
                    : null,
                  actionDetails: history?.actionDetails,
                  user: history?.user.name,
                  createdAt: history?.createdAt.toISOString(),
                  replacedDocument: history?.replacedDocument
                    ? {
                        id: history.replacedDocument.id,
                        name: history.replacedDocument.name,
                        path: history.replacedDocument.path,
                      }
                    : null,
                  reopenCycle: history?.actionDetails?.reopenCycle || 0,
                };
              }) || [],
            documentSummaries:
              qa.details?.documentSummaries?.map((ds) => {
                const history = documentHistories.find(
                  (h) => h.id === ds.documentHistoryId
                );
                return {
                  documentId: ds.documentId,
                  feedbackText: ds.feedbackText,
                  documentHistoryId: ds.documentHistoryId,
                  documentDetails: history?.document
                    ? {
                        id: history.document.id,
                        name: history.document.name,
                        path: history.document.path,
                      }
                    : null,
                  user: history?.user.username,
                  createdAt: history?.createdAt.toISOString(),
                  reopenCycle: history?.actionDetails?.reopenCycle || 0,
                };
              }) || [],
            assigneeDetails: qa.details?.assigneeDetails
              ? {
                  assignedStepName: qa.details.assigneeDetails.assignedStepName,
                  assignedAssigneeId:
                    qa.details.assigneeDetails.assignedAssigneeId,
                  assignedAssigneeName: qa.details.assigneeDetails
                    .assignedAssigneeId
                    ? (
                        await prisma.user.findUnique({
                          where: {
                            id: parseInt(
                              qa.details.assigneeDetails.assignedAssigneeId
                            ),
                          },
                          select: { username: true },
                        })
                      )?.username || null
                    : null,
                }
              : null,
          };
        })
      )
    );

    const recommendationDetails = await Promise.all(
      process.stepInstances.flatMap((step) =>
        step.recommendations.map(async (rec) => {
          const documentSummaries = rec.documentSummaries || [];
          const documentResponses = rec.details?.documentResponses || [];
          const documentIds = documentSummaries.map((ds) =>
            parseInt(ds.documentId)
          );
          const documents = documentIds.length
            ? await prisma.document.findMany({
                where: { id: { in: documentIds } },
                select: { id: true, name: true },
              })
            : [];

          const documentMap = documents.reduce((map, doc) => {
            map[doc.id] = doc.name;
            return map;
          }, {});

          const documentDetails = documentSummaries.map((ds) => {
            const response = documentResponses?.find(
              (dr) => parseInt(dr.documentId) === parseInt(ds.documentId)
            );
            return {
              documentId: ds.documentId,
              documentName: documentMap[ds.documentId] || "Unknown Document",
              queryText: ds.queryText,
              answerText: response?.answerText || null,
            };
          });

          return {
            recommendationId: rec.id,
            stepInstanceId: step.id,
            stepName: step.workflowAssignment?.step?.stepName ?? null,
            stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
            status: rec.status,
            recommendationText: rec.recommendationText,
            responseText: rec.responseText || null,
            initiatorName: rec.initiator.username,
            recommenderName: rec.recommender.username,
            createdAt: rec.createdAt.toISOString(),
            respondedAt: rec.respondedAt ? rec.respondedAt.toISOString() : null,
            documentDetails,
          };
        })
      )
    );

    const toBePicked = process.stepInstances.every(
      (step) => step.pickedById === null
    );

    const workflow = {
      id: process.workflow.id,
      name: process.workflow.name,
      version: process.workflow.version,
    };

    const processDocs = await prisma.processDocument.findMany({
      where: {
        processId,
      },
      select: {
        reopenCycle: true,
      },
      distinct: ["reopenCycle"],
    });

    // Map reopenCycle to version numbers (reopenCycle + 1) and ensure uniqueness
    const versions = [
      ...new Set(processDocs.map((doc) => doc.reopenCycle + 1)),
    ].sort((a, b) => a - b);

    // Find the current step instance to get stepNumber and stepType
    const currentStepInstance = process.stepInstances.find(
      (item) =>
        item.id ===
        process.stepInstances.filter((item) => item.status === "IN_PROGRESS")[0]
          ?.id
    );

    const responseData = {
      process: {
        processStoragePath: process.storagePath,
        description: process.description,
        processName: process.name,
        initiatorName: process.initiator.username,
        status: process.status,
        createdAt: process.createdAt,
        issueNo: process.issueNo,
        processId: process.id,
        reopenCycle: process.reopenCycle,
        versions: versions,
        processStepInstanceId:
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS"
          )[0]?.id || null,
        arrivedAt:
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS"
          )[0]?.updatedAt ||
          process.stepInstances.filter(
            (item) => item.status === "IN_PROGRESS"
          )[0]?.createdAt ||
          null,
        updatedAt: process.updatedAt,
        toBePicked,
        isRecirculated: process.isRecirculated,
        documents: transformedDocuments,
        steps,
        queryDetails,
        recommendationDetails,
        documentVersioning,
        sededDocuments,
        workflow,
        currentStepNumber:
          currentStepInstance?.workflowStep?.stepNumber || null,
        currentStepType:
          process.status === "COMPLETED" || process.initiator.id === userData.id
            ? "APPROVAL"
            : currentStepInstance?.workflowStep?.stepType,
      },
    };

    // Serialize BigInt values
    const serializedResponse = serializeBigInt(responseData);

    return res.status(200).json(serializedResponse);
  } catch (error) {
    console.error("Error getting process:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to view process",
        details: error.message,
        code: "PROCESS_VIEW_ERROR",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
};

async function handleProcessClaim(userId, stepInstanceId) {
  return prisma.$transaction(async (tx) => {
    // 2. Claim the step
    const step = await tx.processStepInstance.update({
      where: {
        id: stepInstanceId,
        status: "IN_PROGRESS",
        assignedTo: userId,
      },
      data: {
        status: "APPROVED",
        claimedAt: new Date(),
        pickedById: userId,
      },
      include: {
        workflowAssignment: {
          include: { departmentRoles: true },
        },
        assignmentProgress: {
          include: {
            departmentStepProgress: true,
          },
        },
        process: {
          select: { id: true },
        },
      },
    });

    const processId = step.process.id;

    // 3. Handle Role assignments
    if (step.workflowAssignment.assigneeType === "ROLE") {
      await tx.processStepInstance.deleteMany({
        where: {
          assignmentId: step.assignmentId,
          status: "IN_PROGRESS",
          id: { not: step.id },
        },
      });

      await tx.processNotification.deleteMany({
        where: {
          stepInstanceId: {
            in: (
              await tx.processStepInstance.findMany({
                where: {
                  assignmentId: step.assignmentId,
                  status: "IN_PROGRESS",
                  id: { not: step.id },
                },
                select: { id: true },
              })
            ).map((si) => si.id),
          },
        },
      });

      await tx.assignmentProgress.update({
        where: { id: step.assignmentProgress.id },
        data: { completed: true },
      });
    }

    // 4. Handle department-specific tracking
    if (step.workflowAssignment.assigneeType === "DEPARTMENT") {
      if (step.workflowAssignment.allowParallel) {
        await tx.departmentStepProgress.update({
          where: {
            id: step.assignmentProgress.departmentStepProgress.id,
          },
          data: {
            completedRoles: { push: step.roleId },
          },
        });
      }
      await updateDepartmentProgress(tx, step);
    }

    // 5. Check assignment and process completion
    await checkAssignmentCompletion(tx, step.assignmentProgress.id);
    await checkProcessProgress(tx, processId);

    // 6. Notify about step completion
    await tx.processNotification.create({
      data: {
        stepId: step.id,
        userId: userId,
        type: NotificationType.STEP_ASSIGNMENT,
        status: "COMPLETED",
        metadata: { action: "Step claimed and approved" },
      },
    });

    return step;
  });
}

async function updateDepartmentProgress(tx, stepInstance, workflowId) {
  const departmentProgress = await tx.departmentStepProgress.findFirst({
    where: {
      processId: stepInstance.processId,
      stepId: stepInstance.stepId,
      departmentId: stepInstance.departmentId,
      assignmentProgressId: stepInstance.progressId,
    },
  });

  if (!departmentProgress) {
    throw new Error("Department step progress not found");
  }

  let roleLevels = departmentProgress.roleLevels;
  if (typeof roleLevels === "string") {
    roleLevels = JSON.parse(roleLevels);
  }

  const updatedCompletedRoles = [
    ...new Set([...departmentProgress.completedRoles, stepInstance.roleId]),
  ];

  const currentLevelRoles = roleLevels[departmentProgress.currentLevel] || [];

  const currentLevelComplete = currentLevelRoles.every((roleId) =>
    updatedCompletedRoles.includes(roleId)
  );

  await tx.departmentStepProgress.update({
    where: { id: departmentProgress.id },
    data: { completedRoles: updatedCompletedRoles },
  });

  if (currentLevelComplete) {
    if (departmentProgress.currentLevel + 1 < roleLevels.length) {
      const nextLevel = departmentProgress.currentLevel + 1;
      const nextLevelRoles = roleLevels[nextLevel];

      const process = await tx.processInstance.findUnique({
        where: { id: stepInstance.processId },
        include: { documents: true },
      });

      const documentIds = process.documents.map((doc) => doc.documentId);

      for (const roleId of nextLevelRoles) {
        const userRoles = await tx.userRole.findMany({
          where: {
            roleId: roleId,
            role: {
              departmentId: stepInstance.departmentId,
            },
          },
          include: {
            user: true,
          },
        });

        if (userRoles.length > 0) {
          const user = userRoles[0].user;

          const hasAccess = await checkUserProcessAssignment(
            stepInstance.processId,
            user.id
          );

          let newStepInstance;

          if (hasAccess) {
            continue;
          } else {
            newStepInstance = await tx.processStepInstance.create({
              data: {
                processId: stepInstance.processId,
                stepId: stepInstance.stepId,
                assignmentId: stepInstance.assignmentId,
                progressId: stepInstance.progressId,
                departmentId: stepInstance.departmentId,
                roleId: roleId,
                assignedTo: user.id,
                status: "IN_PROGRESS",
              },
            });

            for (const docId of documentIds) {
              await ensureDocumentAccessWithParents(tx, {
                documentId: docId,
                userId: user.id,
                stepInstanceId: newStepInstance.id,
                processId: stepInstance.processId,
                assignmentId: stepInstance.assignmentId,
                roleId: roleId,
                departmentId: stepInstance.departmentId,
              });
            }
          }
        }
      }

      await tx.departmentStepProgress.update({
        where: { id: departmentProgress.id },
        data: {
          currentLevel: nextLevel,
        },
      });
    } else {
      await tx.departmentStepProgress.update({
        where: { id: departmentProgress.id },
        data: {
          isCompleted: true,
        },
      });

      await tx.assignmentProgress.update({
        where: { id: stepInstance.progressId },
        data: { completed: true, completedAt: new Date() },
      });
    }
  }
}

async function checkAssignmentCompletion(tx, progressId, stepInstanceId) {
  const progress = await tx.assignmentProgress.findUnique({
    where: { id: progressId },
    include: { workflowAssignment: true },
  });

  if (!progress) return false;

  if (progress.completed) {
    return true;
  }

  if (progress.workflowAssignment.assigneeType === "DEPARTMENT") {
    const departmentProgresses = await tx.departmentStepProgress.findMany({
      where: { assignmentProgressId: progressId },
    });

    return departmentProgresses.every(
      (deptProgress) => deptProgress.isCompleted
    );
  }

  return false;
}

async function checkProcessProgress(tx, processId) {
  const process = await tx.processInstance.findUnique({
    where: { id: processId },
    include: {
      currentStep: true,
      workflow: {
        include: {
          steps: {
            include: { assignments: true },
          },
        },
      },
      queries: {
        where: { status: "RECIRCULATION_PENDING" },
      },
    },
  });

  if (process.queries.length > 0) {
    return;
  }

  // Check only non-recirculated step instances for completion
  const currentStepAssignments = await tx.assignmentProgress.findMany({
    where: {
      processId,
      workflowAssignment: {
        stepId: process.currentStepId,
      },
    },
    include: {
      stepInstances: {
        where: {
          isRecirculated: false, // Only consider original instances
          OR: [{ status: "APPROVED" }, { status: "IN_PROGRESS" }],
        },
      },
    },
  });

  const allCompleted = currentStepAssignments.every(
    (a) =>
      a.stepInstances.every((si) => si.status === "APPROVED") || a.completed
  );

  if (allCompleted) {
    const result = await advanceToNextStep(
      tx,
      processId,
      process.currentStepId
    );
    return result;
  }
}

async function advanceToNextStep(tx, processId, currentStepId) {
  const currentStep = await tx.workflowStep.findUnique({
    where: { id: currentStepId },
    select: { id: true, stepNumber: true, workflowId: true },
  });

  if (!currentStep) {
    throw new Error(`Current step with ID ${currentStepId} not found`);
  }

  const nextStep = await tx.workflowStep.findFirst({
    where: {
      workflowId: currentStep.workflowId,
      stepNumber: currentStep.stepNumber + 1,
    },
    orderBy: { stepNumber: "asc" },
    include: { assignments: true },
  });

  const openQueries = await tx.processQA.findMany({
    where: {
      processId,
      answer: null,
      status: "OPEN",
    },
  });

  if (openQueries.length > 0) {
    return {
      status: "WAITING_QUERIES",
      openQueriesCount: openQueries.length,
    };
  }

  if (nextStep) {
    const process = await tx.processInstance.findUnique({
      where: { id: processId },
      include: { documents: true },
    });

    if (!process) {
      throw new Error(`Process with ID ${processId} not found`);
    }

    const documentIds = process.documents.map((doc) => doc.documentId);

    // Check if there are recirculated instances for the next step
    const existingRecirculatedInstances = await tx.processStepInstance.findMany(
      {
        where: {
          processId,
          stepId: nextStep.id,
          isRecirculated: true,
          status: "IN_PROGRESS",
        },
      }
    );

    if (existingRecirculatedInstances.length > 0) {
      // Use existing recirculated instances
      await tx.processInstance.update({
        where: { id: processId },
        data: { currentStepId: nextStep.id },
      });

      return {
        status: "ADVANCED",
        nextStepId: nextStep.id,
        recirculated: true,
      };
    } else {
      // Create new instances as before
      for (const assignment of nextStep.assignments) {
        await processAssignment(
          tx,
          process,
          nextStep,
          assignment,
          documentIds,
          false,
          false,
          currentStep.workflowId
        );
      }

      await tx.processInstance.update({
        where: { id: processId },
        data: { currentStepId: nextStep.id },
      });

      return { status: "ADVANCED", nextStepId: nextStep.id };
    }
  } else {
    await tx.processInstance.update({
      where: { id: processId },
      data: { status: "COMPLETED", currentStepId: null },
    });
    return { status: "COMPLETED" };
  }
}

export async function buildRoleHierarchy(step, assignment) {
  const { allowParallel, direction } = assignment;
  const selectedRoles = step.selectedRoles;

  if (allowParallel) {
    return [selectedRoles];
  }

  if (selectedRoles.length === 0) {
    return [];
  }

  const roles = await prisma.role.findMany({
    where: { id: { in: selectedRoles } },
    include: { parentRole: true, childRoles: true },
  });

  // Create a map for quick lookup
  const roleMap = new Map();
  roles.forEach((role) => {
    roleMap.set(role.id, role);
  });

  // Find root roles (roles with no parent or parent not in selected roles)
  const rootRoles = roles.filter((role) => {
    return !role.parentRoleId || !selectedRoles.includes(role.parentRoleId);
  });

  // If no root roles found (all roles have parents within selection),
  // find the highest level roles (those whose parents are not in selection)
  if (rootRoles.length === 0) {
    const highestLevelRoles = roles.filter((role) => {
      return !role.parentRoleId || !selectedRoles.includes(role.parentRoleId);
    });

    if (highestLevelRoles.length > 0) {
      const result = [highestLevelRoles.map((r) => r.id)];
      return direction === "UPWARDS" ? result.reverse() : result;
    }

    // Fallback: if somehow still no roles found, return all as single level
    return [selectedRoles];
  }

  const levels = [];
  let currentLevel = rootRoles.map((role) => role.id);

  while (currentLevel.length > 0) {
    // Only include roles that are in our selected list
    const validRoles = currentLevel.filter((roleId) =>
      selectedRoles.includes(roleId)
    );
    if (validRoles.length > 0) {
      levels.push(validRoles);
    }

    const nextLevel = [];
    for (const roleId of currentLevel) {
      const role = roleMap.get(roleId);
      if (role && role.childRoles) {
        const childRoleIds = role.childRoles
          .filter((child) => selectedRoles.includes(child.id))
          .map((child) => child.id);
        nextLevel.push(...childRoleIds);
      }
    }
    currentLevel = nextLevel;
  }

  return direction === "UPWARDS" ? levels.reverse() : levels;
}

export async function buildRoleHierarchyForAssignment(
  direction,
  allowParallel,
  selectedRoles
) {
  if (allowParallel) {
    return [selectedRoles];
  }

  if (selectedRoles.length === 0) {
    return [];
  }

  const roles = await prisma.role.findMany({
    where: { id: { in: selectedRoles } },
    include: { parentRole: true },
  });

  // Calculate depth for each role
  const depthMap = new Map();

  const calculateDepth = (roleId, visited = new Set()) => {
    if (visited.has(roleId)) return 0; // Prevent cycles
    if (depthMap.has(roleId)) return depthMap.get(roleId);

    visited.add(roleId);
    const role = roles.find((r) => r.id === roleId);

    if (
      !role ||
      !role.parentRoleId ||
      !selectedRoles.includes(role.parentRoleId)
    ) {
      depthMap.set(roleId, 0);
      return 0;
    }

    const depth = calculateDepth(role.parentRoleId, visited) + 1;
    depthMap.set(roleId, depth);
    return depth;
  };

  // Calculate depth for all selected roles
  selectedRoles.forEach((roleId) => calculateDepth(roleId));

  // Group by depth
  const depthGroups = {};
  selectedRoles.forEach((roleId) => {
    const depth = depthMap.get(roleId) || 0;
    if (!depthGroups[depth]) {
      depthGroups[depth] = [];
    }
    depthGroups[depth].push(roleId);
  });

  // Convert to array of levels
  const levels = Object.keys(depthGroups)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((depth) => depthGroups[depth]);

  return direction === "UPWARDS" ? levels.reverse() : levels;
}

export const get_user_processes = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const userId = userData.id;

    const stepInstances = await prisma.processStepInstance.findMany({
      where: {
        assignedTo: userId,
        status: "IN_PROGRESS",
      },
      include: {
        process: {
          include: {
            workflow: {
              select: { name: true },
            },
            initiator: {
              select: { username: true },
            },
            // queries: {
            //   where: {
            //     OR: [
            //       { raisedById: userId },
            //       { recirculationApprovals: { some: { approverId: userId } } },
            //     ],
            //   },
            //   select: { id: true, queryText: true, status: true },
            // },
            // recommendations: {
            //   where: {
            //     OR: [{ requestedById: userId }, { recommendedToId: userId }],
            //     status: "IN_PROGRESS",
            //   },
            //   select: { id: true, remarks: true, status: true },
            // },
          },
        },
        workflowAssignment: {
          include: {
            step: {
              select: {
                stepType: true,
                stepName: true,
                escalationTime: true,
              },
            },
          },
        },
      },
    });

    const response = stepInstances.map((step) => {
      const escalationHours =
        step.workflowAssignment?.step?.escalationTime || 24;
      const assignedAt = step.deadline
        ? new Date(step.deadline.getTime() - escalationHours * 60 * 60 * 1000)
        : null;

      return {
        processId: step.process.id,
        processName: step.process?.name || "Unnamed Process",
        workflowName: step.process?.workflow?.name || "Unknown Workflow",
        initiatorUsername: step.process?.initiator?.username || "System User",
        createdAt: step.createdAt,
        actionType:
          process.initiatorId === userData.id
            ? "APPROVAL"
            : step.workflowAssignment?.step?.stepType || "GENERAL",
        stepName: step.workflowAssignment?.step?.stepName || "Pending Step",
        currentStepAssignedAt: assignedAt,
        assignmentId: step.assignmentId,
        deadline: step.deadline,
        stepInstanceId: step.id,
        // queries: step.process.queries.map((q) => ({
        //   id: q.id,
        //   queryText: q.queryText,
        //   status: q.status,
        // })),
        // recommendations: step.process.recommendations.map((r) => ({
        //   id: r.id,
        //   remarks: r.remarks,
        //   status: r.status,
        // })),
      };
    });

    return res.json(response);
  } catch (error) {
    console.error("Error in get_user_processes:", error);
    return res.status(500).json({
      message: "Failed to retrieve processes",
    });
  }
};

async function checkAllAssignmentsCompleted(tx, processId, stepId) {
  const assignments = await tx.workflowAssignment.findMany({
    where: { stepId },
  });

  for (const assignment of assignments) {
    const assignmentProgress = await tx.assignmentProgress.findFirst({
      where: {
        processId,
        assignmentId: assignment.id,
      },
    });

    if (!assignmentProgress || !assignmentProgress.completed) {
      return false;
    }
  }

  return true;
}

export const complete_process_step = async (req, res) => {
  try {
    const { stepInstanceId } = req.body;
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const stepInstance = await tx.processStepInstance.findUnique({
        where: {
          id: stepInstanceId,
          assignedTo: userData.id,
          status: "IN_PROGRESS",
        },
        include: {
          process: {
            select: {
              id: true,
              status: true,
              currentStepId: true,
              workflowId: true,
              reopenCycle: true,
            },
          },
          workflowAssignment: {
            include: {
              step: {
                select: {
                  id: true,
                  workflowId: true,
                  stepNumber: true,
                },
              },
            },
          },
          assignmentProgress: true,
        },
      });

      if (!stepInstance) {
        throw new Error("Invalid step instance or user not assigned");
      }

      if (!stepInstance.process) {
        throw new Error("Process not found for this step instance");
      }

      if (stepInstance.status === "FOR_RECIRCULATION") {
        throw new Error("Cannot complete step until recirculation is resolved");
      }

      const workflowId = stepInstance.process.workflowId;

      // Handle recirculated steps differently
      if (stepInstance.isRecirculated) {
        await tx.processStepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: "APPROVED",
            decisionAt: new Date(),
            pickedById: userData.id,
            claimedAt: new Date(),
          },
        });

        // For recirculated steps, check if all instances for this assignment are completed
        const pendingRecirculatedInstances =
          await tx.processStepInstance.findMany({
            where: {
              progressId: stepInstance.assignmentProgress.id,
              isRecirculated: true,
              status: "IN_PROGRESS",
            },
          });

        if (pendingRecirculatedInstances.length === 0) {
          await tx.assignmentProgress.update({
            where: { id: stepInstance.assignmentProgress.id },
            data: { completed: true, completedAt: new Date() },
          });
        }

        // Check if all assignments for the current step are completed
        const allAssignmentsCompleted = await checkAllAssignmentsCompleted(
          tx,
          stepInstance.processId,
          stepInstance.stepId
        );

        if (allAssignmentsCompleted) {
          const advanceResult = await advanceToNextStep(
            tx,
            stepInstance.processId,
            stepInstance.stepId,
            workflowId
          );

          return {
            message:
              "Recirculated step completed successfully and process advanced",
            advanceStatus: advanceResult.status,
            recirculated: true,
          };
        }

        return {
          message: "Recirculated step completed successfully",
          recirculated: true,
        };
      } else {
        // Original logic for non-recirculated steps
        await tx.processStepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: "APPROVED",
            decisionAt: new Date(),
            pickedById: userData.id,
            claimedAt: new Date(),
          },
        });

        if (stepInstance.workflowAssignment?.assigneeType === "DEPARTMENT") {
          await updateDepartmentProgress(tx, stepInstance, workflowId);
        }

        if (stepInstance.workflowAssignment?.assigneeType === "ROLE") {
          await tx.processStepInstance.deleteMany({
            where: {
              processId: stepInstance.processId,
              stepId: stepInstance.stepId,
              assignmentId: stepInstance.assignmentId,
              id: { not: stepInstanceId },
              status: "IN_PROGRESS",
            },
          });

          await tx.assignmentProgress.update({
            where: { id: stepInstance.assignmentProgress.id },
            data: { completed: true, completedAt: new Date() },
          });
        }

        const assignmentCompleted =
          stepInstance.workflowAssignment?.assigneeType !== "USER"
            ? await checkAssignmentCompletion(
                tx,
                stepInstance.assignmentProgress.id,
                stepInstance.id
              )
            : true;

        const openQueries = await tx.processQA.findMany({
          where: {
            processId: stepInstance.processId,
            answer: null,
            status: "OPEN",
          },
        });

        if (openQueries.length > 0) {
          return {
            message:
              "Step completed, but process is waiting for query resolution",
            openQueriesCount: openQueries.length,
          };
        }

        if (assignmentCompleted) {
          const allAssignmentsCompleted =
            stepInstance.workflowAssignment?.assigneeType !== "USER"
              ? await checkAllAssignmentsCompleted(
                  tx,
                  stepInstance.processId,
                  stepInstance.stepId
                )
              : true;

          const currentStep = await tx.workflowStep.findUnique({
            where: { id: stepInstance.stepId },
            select: { id: true, stepNumber: true, workflowId: true },
          });

          if (!currentStep) {
            throw new Error(
              `Current step with ID ${stepInstance.stepId} not found`
            );
          }

          const nextStep = await tx.workflowStep.findFirst({
            where: {
              workflowId: currentStep.workflowId,
              stepNumber: currentStep.stepNumber + 1,
            },
            orderBy: { stepNumber: "asc" },
            include: { assignments: true },
          });

          if (allAssignmentsCompleted && nextStep) {
            const advanceResult = await advanceToNextStep(
              tx,
              stepInstance.processId,
              stepInstance.stepId,
              workflowId
            );

            return {
              message: "Step completed successfully and process advanced",
              advanceStatus: advanceResult.status,
            };
          } else {
            await tx.processInstance.update({
              where: {
                id: stepInstance.processId,
              },
              data: { status: "COMPLETED" },
            });
          }
        }

        return {
          message: "Step completed successfully",
        };
      }
    });

    try {
      const stepInstance = await prisma.processStepInstance.findUnique({
        where: { id: stepInstanceId },
        include: {
          process: {
            include: {
              initiator: {
                select: { id: true, username: true, name: true, email: true },
              },
            },
          },
          workflowStep: true,
        },
      });

      if (stepInstance) {
        // Helper function to get next assignee
        const getNextAssignee = async (currentStepInstance) => {
          const currentStep = await prisma.workflowStep.findUnique({
            where: { id: currentStepInstance.stepId },
          });

          if (!currentStep) return null;

          const nextStep = await prisma.workflowStep.findFirst({
            where: {
              workflowId: currentStep.workflowId,
              stepNumber: currentStep.stepNumber + 1,
            },
          });

          if (!nextStep) return null;

          const nextInstance = await prisma.processStepInstance.findFirst({
            where: {
              processId: currentStepInstance.processId,
              stepId: nextStep.id,
              status: "IN_PROGRESS",
            },
            include: {
              assignedToUser: {
                select: { id: true, email: true, username: true, name: true },
              },
            },
          });

          return nextInstance?.assignedToUser || null;
        };

        const nextAssignee = await getNextAssignee(stepInstance);

        await sendProcessNotification("stepCompleted", {
          params: [stepInstance.process, stepInstance, userData, nextAssignee],
        });

        // If process is completed, send processCompleted notification
        const processStatus = await prisma.processInstance.findUnique({
          where: { id: stepInstance.processId },
          select: { status: true, initiatorId: true },
        });

        if (processStatus.status === "COMPLETED") {
          const initiator = await prisma.user.findUnique({
            where: { id: processStatus.initiatorId },
            select: { id: true, email: true, username: true, name: true },
          });

          if (initiator) {
            await sendProcessNotification("processCompleted", {
              params: [stepInstance.process, initiator],
            });
          }
        }
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error completing step:", error);
    return res.status(500).json({
      message: "Error completing step",
      error: error.message,
    });
  }
};

async function checkPendingQueries(tx, stepInstanceId) {
  const count = await tx.processQuery.count({
    where: {
      stepInstanceId,
      status: { in: ["OPEN", "RECIRCULATION_PENDING"] },
    },
  });
  return count > 0;
}

async function getUserRecommendations(tx, userId) {
  return await tx.processRecommendation.findMany({
    where: {
      OR: [{ requestedById: userId }, { recommendedToId: userId }],
      status: "IN_PROGRESS",
    },
    select: {
      id: true,
      processId: true,
      remarks: true,
      status: true,
    },
  });
}

async function copyAndDeleteSingleDocument(processId, documentId, accessToken) {
  try {
    // Fetch the ProcessInstance with related workflow data
    const processInstance = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        workflow: true,
      },
    });

    if (!processInstance) {
      throw new Error(`ProcessInstance with id ${processId} not found`);
    }

    // Fetch the document details
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { path: true },
    });

    if (!document) {
      throw new Error(`Document with id ${documentId} not found`);
    }

    // Extract workflowName and processName
    const workflowName = processInstance.workflow.name;
    const processName = processInstance.name;

    // Construct paths and name
    const sourcePath = `./${document.path}`;
    const destinationPath = `../${workflowName}/${processName}`;
    const name = sourcePath.split("/").pop();

    // Perform file copy operation
    const copyResult = await new Promise((resolve, reject) => {
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

    // Delete the original file
    await new Promise((resolve, reject) => {
      delete_file(
        {
          headers: { authorization: `Bearer ${accessToken}` },
          body: { documentId },
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

    // Return the copied documentId
    if (copyResult.documentId) {
      return copyResult.documentId;
    }

    throw new Error("Copy operation did not return a documentId");
  } catch (error) {
    console.error(
      `Error processing document ${documentId} for process ${processId}:`,
      error
    );
    throw error;
  }
}

export const createQuery = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const {
      processId,
      stepInstanceId,
      queryText,
      documentChanges = [],
      documentSummaries = [],
      assignedStepName,
      assignedAssigneeId,
      queryRaiserStepInstanceId,
    } = req.body;

    if (!processId || !stepInstanceId || !queryText) {
      return res.status(400).json({
        message:
          "Missing required fields: processId, stepInstanceId, queryText",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const stepInstance = await tx.processStepInstance.findUnique({
        where: {
          id: stepInstanceId,
          // assignedTo: userData.id,
          status: "IN_PROGRESS",
        },
        include: {
          process: true,
        },
      });

      if (!stepInstance) {
        throw new Error("Invalid step instance or user not assigned");
      }

      let isDelegatedTask;
      if (queryRaiserStepInstanceId) {
        isDelegatedTask = await tx.processQA.findFirst({
          where: {
            stepInstanceId: queryRaiserStepInstanceId,
            status: "OPEN",
          },
        });
      }

      const qaDetails = {
        documentChanges: [],
        documentSummaries: [],
        assigneeDetails:
          assignedStepName && assignedAssigneeId
            ? { assignedStepName, assignedAssigneeId }
            : null,
      };

      let processQA;
      if (!isDelegatedTask) {
        processQA = await tx.processQA.create({
          data: {
            processId,
            stepInstanceId,
            initiatorId: userData.id,
            entityId: parseInt(assignedAssigneeId) || userData.id,
            entityType: assignedAssigneeId
              ? "USER"
              : stepInstance.workflowAssignment.assigneeType,
            question: queryText,
            createdAt: new Date(),
            details: qaDetails,
          },
        });
      } else {
        processQA = await tx.processQA.update({
          where: { id: isDelegatedTask.id },
          data: {
            answer: queryText,
            answeredAt: new Date(),
            status: "RESOLVED",
            details: qaDetails,
          },
        });
      }

      const documentHistoryEntries = [];
      for (const change of documentChanges) {
        const {
          documentId,
          requiresApproval,
          isReplacement,
          replacesDocumentId,
          superseding = false,
        } = change;

        const document = await tx.document.findUnique({
          where: { id: parseInt(documentId) },
        });
        if (!document) {
          throw new Error(`Document ${documentId} not found`);
        }

        let replacedDocument = null;
        if (isReplacement) {
          if (!replacesDocumentId) {
            throw new Error(
              `replacesDocumentId is required when isReplacement is true for document ${documentId}`
            );
          }
          replacedDocument = await tx.document.findUnique({
            where: { id: parseInt(replacesDocumentId) },
          });
          if (!replacedDocument) {
            throw new Error(
              `Replaced document ${replacesDocumentId} not found`
            );
          }

          const oldDocPath = path.join(
            __dirname,
            STORAGE_PATH,
            replacedDocument.path
          );

          const record = await tx.processDocument.findUnique({
            where: {
              documentId_processId: {
                documentId: parseInt(replacesDocumentId),
                processId,
              },
            },
          });

          if (!record) {
            throw new Error("ProcessDocument not found");
          }

          const processDocument_ = await tx.processDocument.delete({
            where: {
              documentId_processId: {
                documentId: parseInt(replacesDocumentId),
                processId,
              },
            },
          });
        }

        const processDocument = await tx.processDocument.create({
          data: {
            processId,
            documentId: parseInt(documentId),
            isReplacement: false,
            superseding,
            replacedDocumentId: isReplacement
              ? parseInt(replacesDocumentId)
              : null,
            reopenCycle: stepInstance.process.reopenCycle,
          },
        });

        let history;

        if (!isReplacement) {
          history = await tx.documentHistory.create({
            data: {
              documentId: parseInt(documentId),
              processId,
              stepInstanceId,
              userId: userData.id,
              actionType: isReplacement ? "REPLACED" : "UPLOADED",
              actionDetails: {
                isReplacement,
                superseding,
                requiresApproval,
                originalDocumentId: isReplacement
                  ? parseInt(replacesDocumentId)
                  : null,
                reopenCycle: stepInstance.process.reopenCycle,
              },
              isRecirculationTrigger: true,
              createdAt: new Date(),
              processDocumentId: processDocument.id,
              replacedDocumentId: isReplacement
                ? parseInt(replacesDocumentId)
                : null,
            },
          });

          documentHistoryEntries.push(history);
        }
        qaDetails.documentChanges.push({
          documentId: parseInt(documentId),
          requiresApproval,
          isReplacement,
          superseding,
          replacesDocumentId: isReplacement
            ? parseInt(replacesDocumentId)
            : null,
          // documentHistoryId: history.id,
        });

        await ensureDocumentAccessWithParents(tx, {
          documentId: parseInt(documentId),
          userId: userData.id,
          stepInstanceId,
          processId,
          assignmentId: stepInstance.assignmentId,
          roleId: stepInstance.roleId,
          departmentId: stepInstance.departmentId,
        });

        if (isReplacement && replacedDocument) {
          await ensureDocumentAccessWithParents(tx, {
            documentId: parseInt(replacesDocumentId),
            userId: userData.id,
            stepInstanceId,
            processId,
            assignmentId: stepInstance.assignmentId,
            roleId: stepInstance.roleId,
            departmentId: stepInstance.departmentId,
          });
        }
      }

      for (const summary of documentSummaries) {
        const { documentId, feedbackText } = summary;
        const document = await tx.document.findUnique({
          where: { id: parseInt(documentId) },
        });
        if (!document) {
          throw new Error(`Document ${documentId} not found`);
        }

        const history = await tx.documentHistory.create({
          data: {
            documentId: parseInt(documentId),
            processId,
            stepInstanceId,
            userId: userData.id,
            actionType: "FEEDBACK",
            actionDetails: {
              feedbackText,
              reopenCycle: stepInstance.process.reopenCycle,
            },
            isRecirculationTrigger: true,
            createdAt: new Date(),
          },
        });

        qaDetails.documentSummaries.push({
          documentId,
          feedbackText,
          documentHistoryId: history.id,
        });
      }

      if (
        qaDetails.documentChanges.length > 0 ||
        qaDetails.documentSummaries.length > 0
      ) {
        await tx.processQA.update({
          where: { id: processQA.id },
          data: { details: qaDetails },
        });
      }

      if (isDelegatedTask && documentChanges.length > 0) {
        const firstStep = await tx.workflowStep.findFirst({
          where: {
            workflowId: stepInstance.process.workflowId,
            stepNumber: 2, // Directly target the second step
          },
          include: {
            assignments: true, // Include the assignments relation
          },
        });

        if (!firstStep) {
          throw new Error(
            `Workflow step with stepNumber 2 not found for workflowId ${stepInstance.process.workflowId}`
          );
        }

        const engagedStepInstances = await tx.processStepInstance.findMany({
          where: {
            processId,
            stepId: firstStep.id,
            OR: [
              { pickedById: { not: null } },
              { claimedAt: { not: null } },
              {
                status: {
                  in: ["APPROVED", "IN_PROGRESS", "FOR_RECIRCULATION"],
                },
              },
            ],
          },
        });

        for (const instance of engagedStepInstances) {
          const updatedInstance = await tx.processStepInstance.update({
            where: { id: instance.id },
            data: {
              status: "IN_PROGRESS",
              isRecirculated: true,
              recirculationReason: "Process reopened with superseded documents",
              claimedAt: null,
              pickedById: null,
              recirculationCycle: { increment: 1 },
            },
          });

          await tx.processNotification.create({
            data: {
              stepId: updatedInstance.id, // Changed from stepInstanceId to stepId
              userId: instance.assignedTo,
              type: "STEP_ASSIGNMENT",
              status: "ACTIVE",
              metadata: { processId, reason: "Process reopened" },
            },
          });
        }

        // 5. Create new step instances for first step assignments if no engaged instances exist
        if (engagedStepInstances.length === 0) {
          const documentIds = documentChanges.map((doc) =>
            parseInt(doc.replacesDocumentId)
          );
          for (const assignment of firstStep.assignments) {
            await processAssignment(
              tx,
              process,
              firstStep,
              assignment,
              documentIds,
              true,
              false,
              process.workflowId
            );
          }
        }

        await tx.processStepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: "APPROVED",
            decisionAt: new Date(),
            isRecirculated: true,
            recirculationReason: queryText,
          },
        });

        await tx.processInstance.update({
          where: { id: stepInstance.processId },
          data: {
            currentStepId: firstStep.id,
          },
        });
      } else {
        await tx.processStepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: "FOR_RECIRCULATION",
            recirculationReason: queryText,
            isRecirculated: true,
          },
        });
      }

      if (assignedStepName && assignedAssigneeId) {
        const workflowStep = await tx.workflowStep.findFirst({
          where: {
            workflowId: stepInstance.process.workflowId,
            stepName: assignedStepName.substring(
              0,
              assignedStepName.lastIndexOf("_")
            ),
          },
        });

        if (!workflowStep) {
          throw new Error(`Step ${assignedStepName} not found in workflow`);
        }

        const newStepInstance = await tx.processStepInstance.create({
          data: {
            processId,
            stepId: workflowStep.id,
            assignmentId: stepInstance.assignmentId,
            assignedTo: parseInt(assignedAssigneeId),
            status: "IN_PROGRESS",
            createdAt: new Date(),
            deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
          },
        });

        await tx.processNotification.create({
          data: {
            stepId: newStepInstance.id, // Fixed: Changed from stepInstanceId to stepId
            userId: parseInt(assignedAssigneeId),
            type: "DOCUMENT_QUERY",
            status: "ACTIVE",
            metadata: { queryText, processId },
          },
        });
      }

      return { processQA, documentHistoryEntries };
    });

    try {
      const processQA = await prisma.processQA.findUnique({
        where: { id: result.processQA.id },
        include: {
          stepInstance: {
            include: {
              process: true,
              workflowStep: true,
            },
          },
          initiator: {
            select: { id: true, email: true, username: true, name: true },
          },
        },
      });

      if (processQA) {
        // Get the user assigned to respond to the query
        const assignedToId =
          parseInt(assignedAssigneeId) || processQA.stepInstance.assignedTo;
        const assignedUser = await prisma.user.findUnique({
          where: { id: assignedToId },
          select: { id: true, email: true, username: true, name: true },
        });

        if (assignedUser) {
          await sendProcessNotification("queryRaised", {
            params: [
              processQA.stepInstance.process,
              processQA,
              userData,
              assignedUser,
            ],
          });
        }
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json({
      message: "Query submitted successfully, process set for recirculation",
      queryId: result.processQA.id,
    });
  } catch (error) {
    console.error("Error creating query:", error);
    return res.status(500).json({
      message: "Error creating query",
      error: error.message,
    });
  }
};

export const createRecommendation = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const {
      processId,
      stepInstanceId,
      recommendationText,
      documentSummaries = [],
      recommenderUsername,
    } = req.body;

    if (
      !processId ||
      !stepInstanceId ||
      !recommendationText ||
      !recommenderUsername
    ) {
      return res.status(400).json({
        message:
          "Missing required fields: processId, stepInstanceId, recommendationText, recommenderUsername",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate step instance and user access
      const stepInstance = await tx.processStepInstance.findUnique({
        where: {
          id: stepInstanceId,
          assignedTo: userData.id,
          status: "IN_PROGRESS",
        },
        include: {
          process: true,
        },
      });

      if (!stepInstance) {
        throw new Error("Invalid step instance or user not assigned");
      }

      // 2. Validate recommender
      const recommender = await tx.user.findUnique({
        where: { username: recommenderUsername },
        select: { id: true },
      });

      if (!recommender) {
        throw new Error(
          `Recommender with username ${recommenderUsername} not found`
        );
      }

      // 3. Validate document summaries
      for (const summary of documentSummaries) {
        const { documentId, queryText, requiresApproval } = summary;
        if (!documentId || !queryText || requiresApproval === undefined) {
          throw new Error(
            "Invalid document summary: documentId, queryText, and requiresApproval are required"
          );
        }
        const document = await tx.document.findUnique({
          where: { id: parseInt(documentId) },
        });
        if (!document) {
          throw new Error(
            `Document ${`One with ID ${documentId} not found`} not found`
          );
        }
      }

      // 4. Create Recommendation entry
      const recommendation = await tx.recommendation.create({
        data: {
          processId,
          stepInstanceId,
          initiatorId: userData.id,
          recommenderId: recommender.id,
          recommendationText,
          documentSummaries,
          status: "OPEN",
          createdAt: new Date(),
        },
      });

      // 5. Update step instance status to FOR_RECOMMENDATION
      await tx.processStepInstance.update({
        where: { id: stepInstanceId },
        data: {
          status: "FOR_RECOMMENDATION",
        },
      });

      // 6. Create notification for the recommender
      await tx.processNotification.create({
        data: {
          stepId: stepInstanceId,
          userId: recommender.id,
          type: "DOCUMENT_QUERY", // Reusing DOCUMENT_QUERY type for consistency
          status: "ACTIVE",
          metadata: { recommendationText, processId },
        },
      });

      return recommendation;
    });

    try {
      const recommendation = await prisma.recommendation.findUnique({
        where: { id: result.id },
        include: {
          process: true,
          stepInstance: {
            include: {
              workflowStep: true,
            },
          },
          initiator: {
            select: { id: true, username: true, name: true, email: true },
          },
          recommender: {
            select: { id: true, email: true, username: true, name: true },
          },
        },
      });

      if (recommendation && recommendation.recommender) {
        await sendProcessNotification("recommendationRequested", {
          params: [
            recommendation.process,
            recommendation,
            userData,
            recommendation.recommender,
          ],
        });
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json({
      message: "Recommendation request submitted successfully",
      recommendationId: result.id,
    });
  } catch (error) {
    console.error("Error creating recommendation:", error);
    return res.status(500).json({
      message: "Error creating recommendation",
      error: error.message,
    });
  }
};

export const signAsRecommender = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { recommendationId, documentId, reason } = req.body;

    if (!recommendationId || !documentId) {
      return res.status(400).json({
        message: "Missing required fields: recommendationId, documentId",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate recommendation and user
      const recommendation = await tx.recommendation.findUnique({
        where: { id: recommendationId },
        include: { process: true },
      });

      if (!recommendation) {
        throw new Error("Recommendation not found");
      }

      if (recommendation.recommenderId !== userData.id) {
        throw new Error("User is not the assigned recommender");
      }

      if (recommendation.status !== "OPEN") {
        throw new Error("Recommendation is not open for signing");
      }

      // 2. Validate document and ensure it requires approval
      const documentSummary = recommendation.documentSummaries?.find(
        (ds) =>
          parseInt(ds.documentId) === parseInt(documentId) &&
          ds.requiresApproval
      );

      if (!documentSummary) {
        throw new Error(
          `Document ${documentId} does not require approval or is not part of this recommendation`
        );
      }

      // 3. Find or create ProcessDocument
      let processDocument = await tx.processDocument.findFirst({
        where: {
          processId: recommendation.processId,
          documentId: parseInt(documentId),
        },
      });

      if (!processDocument) {
        processDocument = await tx.processDocument.create({
          data: {
            processId: recommendation.processId,
            documentId: parseInt(documentId),
          },
        });
      }

      // 4. Create DocumentSignature with recommender flags
      const signature = await tx.documentSignature.create({
        data: {
          processDocumentId: processDocument.id,
          userId: userData.id,
          reason: reason || "Signed as recommender",
          signedAt: new Date(),
          byRecommender: true,
          isAttachedWithRecommendation: false, // Will be updated to true in response
        },
      });

      // 5. Create DocumentHistory entry
      await tx.documentHistory.create({
        data: {
          documentId: parseInt(documentId),
          processId: recommendation.processId,
          stepInstanceId: recommendation.stepInstanceId,
          userId: userData.id,
          actionType: "SIGNED",
          actionDetails: {
            reason: reason || "Signed as recommender",
            byRecommender: true,
          },
          createdAt: new Date(),
          processDocumentId: processDocument.id,
        },
      });

      return signature;
    });

    return res.status(200).json({
      message: "Document signed successfully by recommender",
      signatureId: result.id,
    });
  } catch (error) {
    console.error("Error signing as recommender:", error);
    return res.status(500).json({
      message: "Error signing document",
      error: error.message,
    });
  }
};

export const submitRecommendationResponse = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { recommendationId, responseText, documentResponses = [] } = req.body;

    if (!recommendationId || !responseText) {
      return res.status(400).json({
        message: "Missing required fields: recommendationId, responseText",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate recommendation and user
      const recommendation = await tx.recommendation.findUnique({
        where: { id: recommendationId },
        include: { process: true, stepInstance: true },
      });

      if (!recommendation) {
        throw new Error("Recommendation not found");
      }

      if (recommendation.recommenderId !== userData.id) {
        throw new Error("User is not the assigned recommender");
      }

      if (recommendation.status !== "OPEN") {
        throw new Error("Recommendation is already resolved");
      }

      // 2. Validate document responses
      for (const response of documentResponses) {
        const { documentId, answerText } = response;
        if (!documentId || !answerText) {
          throw new Error(
            "Invalid document response: documentId and answerText are required"
          );
        }
        const documentSummary = recommendation.documentSummaries?.find(
          (ds) => parseInt(ds.documentId) === parseInt(documentId)
        );
        if (!documentSummary) {
          throw new Error(
            `Document ${documentId} is not part of this recommendation`
          );
        }
      }

      // 3. Find and attach signatures
      const signatures = await tx.documentSignature.findMany({
        where: {
          processDocument: {
            processId: recommendation.processId,
            documentId: {
              in: recommendation.documentSummaries.map((ds) =>
                parseInt(ds.documentId)
              ),
            },
          },
          userId: userData.id,
          byRecommender: true,
          isAttachedWithRecommendation: false,
        },
      });

      for (const signature of signatures) {
        await tx.documentSignature.update({
          where: { id: signature.id },
          data: { isAttachedWithRecommendation: true },
        });
      }

      // 4. Create document history for responses
      const documentHistoryEntries = [];
      for (const response of documentResponses) {
        const { documentId, answerText } = response;
        const history = await tx.documentHistory.create({
          data: {
            documentId: parseInt(documentId),
            processId: recommendation.processId,
            stepInstanceId: recommendation.stepInstanceId,
            userId: userData.id,
            actionType: "FEEDBACK",
            actionDetails: { answerText, byRecommender: true },
            createdAt: new Date(),
          },
        });
        documentHistoryEntries.push(history);
      }

      // 5. Update Recommendation with response
      const updatedRecommendation = await tx.recommendation.update({
        where: { id: recommendationId },
        data: {
          responseText,
          details: { documentResponses },
          status: "RESOLVED",
          respondedAt: new Date(),
        },
      });

      // 6. Unfreeze the step instance
      await tx.processStepInstance.update({
        where: { id: recommendation.stepInstanceId },
        data: { status: "IN_PROGRESS" },
      });

      // 7. Create notification for the initiator
      await tx.processNotification.create({
        data: {
          stepId: recommendation.stepInstanceId,
          userId: recommendation.initiatorId,
          type: "DOCUMENT_QUERY",
          status: "ACTIVE",
          metadata: { responseText, processId: recommendation.processId },
        },
      });

      return { recommendation: updatedRecommendation, documentHistoryEntries };
    });

    return res.status(200).json({
      message: "Recommendation response submitted successfully",
      recommendationId: result.recommendation.id,
    });
  } catch (error) {
    console.error("Error submitting recommendation response:", error);
    return res.status(500).json({
      message: "Error submitting recommendation response",
      error: error.message,
    });
  }
};

export const get_recommendations = async (req, res) => {
  try {
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

    const recommendations = await prisma.recommendation.findMany({
      where: {
        recommenderId: userData.id,
        status: "OPEN",
      },
      include: {
        process: {
          select: { id: true, name: true },
        },
        initiator: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedRecommendations = recommendations.map((rec) => ({
      recommendationId: rec.id,
      processId: rec.processId,
      processName: rec.process.name,
      initiatorUsername: rec.initiator.username,
      recommendationText: rec.recommendationText,
      createdAt: rec.createdAt.toISOString(),
    }));

    return res.status(200).json({
      success: true,
      recommendations: formattedRecommendations,
    });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to fetch recommendations",
        details: error.message,
        code: "RECOMMENDATIONS_FETCH_ERROR",
      },
    });
  }
};

export const get_recommendation = async (req, res) => {
  try {
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

    const { recommendationId } = req.params;

    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: {
        process: {
          select: { id: true, name: true },
        },
        initiator: {
          select: { id: true, username: true },
        },
      },
    });

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Recommendation not found",
          details: "No recommendation found with the specified ID.",
          code: "RECOMMENDATION_NOT_FOUND",
        },
      });
    }

    if (recommendation.recommenderId !== userData.id) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Forbidden",
          details: "User is not the assigned recommender.",
          code: "FORBIDDEN",
        },
      });
    }

    // Fetch document names for documentSummaries
    const documentSummaries = recommendation.documentSummaries || [];
    const documentIds = documentSummaries.map((ds) => parseInt(ds.documentId));
    const documents = documentIds.length
      ? await prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, name: true, path: true },
        })
      : [];

    const documentMap = documents.reduce((map, doc) => {
      map[doc.id] = { name: doc.name, path: doc.path };
      return map;
    }, {});

    const formattedDocumentSummaries = documentSummaries.map((ds) => ({
      documentId: ds.documentId,
      documentName: documentMap[ds.documentId]?.name || "Unknown Document",
      documentPath:
        documentMap[ds.documentId]?.path.substring(
          0,
          documentMap[ds.documentId]?.path.lastIndexOf("/")
        ) || "Unknown Path",
      queryText: ds.queryText,
      requiresApproval: ds.requiresApproval,
    }));

    return res.status(200).json({
      success: true,
      recommendation: {
        recommendationId: recommendation.id,
        processId: recommendation.processId,
        processName: recommendation.process.name,
        initiatorUsername: recommendation.initiator.username,
        recommendationText: recommendation.recommendationText,
        documentSummaries: formattedDocumentSummaries,
        status: recommendation.status,
        createdAt: recommendation.createdAt.toISOString(),
        responseText: recommendation.responseText || null,
        respondedAt: recommendation.respondedAt
          ? recommendation.respondedAt.toISOString()
          : null,
        documentResponses: recommendation.details?.documentResponses || [],
      },
    });
  } catch (error) {
    console.error("Error fetching recommendation:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to fetch recommendation",
        details: error.message,
        code: "RECOMMENDATION_FETCH_ERROR",
      },
    });
  }
};

export const reopen_process = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { processId, supersededDocuments } = req.body;

    const SOPIssueNo = req.body.issueNo;

    if (
      !processId ||
      !supersededDocuments ||
      !Array.isArray(supersededDocuments)
    ) {
      return res.status(400).json({
        message:
          "Missing required fields: processId, supersededDocuments (array)",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const process = await tx.processInstance.findUnique({
        where: { id: processId, initiatorId: userData.id },
        include: {
          workflow: {
            include: {
              steps: {
                include: {
                  assignments: true,
                },
              },
            },
          },
          documents: true,
        },
      });

      if (!process) {
        throw new Error(
          "Process not found, not completed, or user is not the initiator"
        );
      }

      // Update process status and increment reopen cycle
      const updatedProcess = await tx.processInstance.update({
        where: { id: processId },
        data: {
          status: "IN_PROGRESS",
          reopenCycle: { increment: 1 },
          isRecirculated: true,
        },
      });

      const documentIds = [];
      for (let {
        isNewDocument,
        preApproved,
        oldDocumentId,
        newDocumentId,
        reasonOfSupersed,
        issueNo,
        fileDescription,
        tags,
        partNumber,
      } of supersededDocuments) {
        const newDoc = await tx.document.findUnique({
          where: { id: parseInt(newDocumentId) },
        });

        if (!newDoc) {
          throw new Error(`New document not found: ${newDocumentId}`);
        }

        let oldDoc = null;

        if (!isNewDocument) {
          if (!oldDocumentId) {
            throw new Error(
              "oldDocumentId is required when isNewDocument is false"
            );
          }

          oldDoc = await tx.document.findUnique({
            where: { id: parseInt(oldDocumentId) },
          });

          if (!oldDoc) {
            throw new Error(`Old document not found: ${oldDocumentId}`);
          }
        }

        // Create process document
        const processDocument = await tx.processDocument.create({
          data: {
            processId,
            documentId: parseInt(newDocumentId),
            isReplacement: !isNewDocument,
            superseding: !isNewDocument,
            replacedDocumentId: !isNewDocument ? parseInt(oldDocumentId) : null,
            preApproved: !!preApproved,
            reasonOfSupersed: !isNewDocument
              ? reasonOfSupersed || "No reason provided"
              : null,
            SOPIssueNo: SOPIssueNo || null,
            issueNo: issueNo || null,
            description: fileDescription || null,
            tags: tags || [],
            partNumber: partNumber || null,
            reopenCycle: updatedProcess.reopenCycle,
          },
        });

        // Document history
        await tx.documentHistory.create({
          data: {
            documentId: parseInt(newDocumentId),
            processId,
            userId: userData.id,
            actionType: isNewDocument ? "UPLOADED" : "REPLACED",
            actionDetails: {
              isNewDocument,
              isReplacement: !isNewDocument,
              originalDocumentId: oldDoc ? oldDoc.id : null,
              reopenCycle: updatedProcess.reopenCycle,
            },
            isRecirculationTrigger: true,
            processDocumentId: processDocument.id,
            replacedDocumentId: oldDoc ? oldDoc.id : null,
          },
        });

        documentIds.push(parseInt(newDocumentId));

        // Ensure access for initiator
        await ensureDocumentAccessWithParents(tx, {
          documentId: parseInt(newDocumentId),
          userId: userData.id,
          processId,
          assignmentId: null,
          roleId: null,
          departmentId: null,
        });

        // Ensure access for old document (only if replacement)
        if (oldDoc) {
          await ensureDocumentAccessWithParents(tx, {
            documentId: oldDoc.id,
            userId: userData.id,
            processId,
            assignmentId: null,
            roleId: null,
            departmentId: null,
          });
        }
      }

      // Get all step instances that were engaged (APPROVED or IN_PROGRESS)
      const engagedStepInstances = await tx.processStepInstance.findMany({
        where: {
          processId,
          OR: [
            { status: "APPROVED" },
            { status: "IN_PROGRESS" },
            { pickedById: { not: null } },
          ],
        },
        include: {
          workflowAssignment: true,
        },
      });

      // Create new step instances for recirculation
      for (const oldStepInstance of engagedStepInstances) {
        const hasAccess = await checkUserProcessAssignment(
          processId,
          parseInt(oldStepInstance.assignedTo)
        );

        if (hasAccess) {
          continue;
        } else {
          const newStepInstance = await tx.processStepInstance.create({
            data: {
              processId,
              stepId: oldStepInstance.stepId,
              assignmentId: oldStepInstance.assignmentId,
              progressId: oldStepInstance.progressId,
              assignedTo: oldStepInstance.assignedTo,
              roleId: oldStepInstance.roleId,
              departmentId: oldStepInstance.departmentId,
              status: "IN_PROGRESS",
              isRecirculated: true,
              recirculationCycle: updatedProcess.reopenCycle,
              recirculationReason: "Process reopened with superseded documents",
              createdAt: new Date(),
              deadline: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours deadline
            },
          });

          // Ensure document access for the assigned user
          for (const docId of documentIds) {
            await ensureDocumentAccessWithParents(tx, {
              documentId: docId,
              userId: oldStepInstance.assignedTo,
              stepInstanceId: newStepInstance.id,
              processId,
              assignmentId: oldStepInstance.assignmentId,
              roleId: oldStepInstance.roleId,
              departmentId: oldStepInstance.departmentId,
            });
          }
        }
      }

      // Update current step to the first step that has recirculated instances
      const firstRecirculatedStep = await tx.processStepInstance.findFirst({
        where: {
          processId,
          isRecirculated: true,
          status: "IN_PROGRESS",
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          stepId: true,
        },
      });

      if (firstRecirculatedStep) {
        await tx.processInstance.update({
          where: { id: processId },
          data: { currentStepId: firstRecirculatedStep.stepId },
        });
      }

      return { process: updatedProcess };
    });

    try {
      const updatedProcess = await prisma.processInstance.findUnique({
        where: { id: processId },
        include: {
          initiator: {
            select: { id: true, username: true, name: true, email: true },
          },
          workflow: true,
        },
      });

      if (updatedProcess) {
        // Get all users who have step instances in this process
        const stepInstances = await prisma.processStepInstance.findMany({
          where: { processId: processId },
          distinct: ["assignedTo"],
          include: {
            assignedToUser: {
              select: { id: true, email: true, username: true, name: true },
            },
          },
        });

        // Send to all users involved in the process
        for (const stepInstance of stepInstances) {
          if (stepInstance.assignedToUser) {
            await sendProcessNotification("processReopened", {
              params: [
                updatedProcess,
                userData,
                "Process reopened with superseded documents",
              ],
            });
          }
        }
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return res.status(200).json({
      message: "Process reopened successfully with superseded documents",
      processId: result.process.id,
      reopenCycle: result.process.reopenCycle,
    });
  } catch (error) {
    console.error("Error reopening process:", error);
    return res.status(500).json({
      message: "Error reopening process",
      error: error.message,
    });
  }
};

export const get_completed_initiator_processes = async (req, res) => {
  try {
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

    const processes = await prisma.processInstance.findMany({
      where: {
        initiatorId: userData.id,
        // status: ProcessStatus.COMPLETED,
      },
      include: {
        initiator: {
          select: { id: true, username: true, name: true, email: true },
        },
        workflow: {
          select: {
            id: true,
            name: true,
            version: true,
          },
        },
        currentStep: {
          select: {
            id: true,
            stepName: true,
            stepNumber: true,
            stepType: true,
          },
        },
        documents: {
          include: {
            document: {
              select: {
                id: true,
                name: true,
                type: true,
                path: true,
              },
            },
            signatures: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
            rejections: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
            documentHistory: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
        stepInstances: {
          where: {
            status: {
              in: [
                "IN_PROGRESS",
                "FOR_RECIRCULATION",
                "APPROVED",
                "FOR_RECOMMENDATION",
              ],
            },
          },
          include: {
            workflowStep: {
              select: {
                id: true,
                stepName: true,
                stepNumber: true,
                stepType: true,
              },
            },
            workflowAssignment: {
              include: {
                step: {
                  select: {
                    id: true,
                    stepName: true,
                    stepNumber: true,
                    stepType: true,
                  },
                },
              },
            },
            pickedBy: {
              select: {
                id: true,
                username: true,
              },
            },
            processQA: {
              where: {
                OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
                status: "OPEN",
              },
              include: {
                initiator: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                process: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            recommendations: {
              include: {
                initiator: {
                  select: { id: true, username: true },
                },
                recommender: {
                  select: { id: true, username: true },
                },
              },
            },
          },
        },
      },
    });

    const transformedProcesses = await Promise.all(
      processes.map(async (process) => {
        const assigneeIds = [
          ...new Set(
            process.stepInstances.flatMap((step) =>
              step.workflowAssignment?.assigneeIds?.length
                ? step.workflowAssignment.assigneeIds
                : [step.assignedTo]
            )
          ),
        ];

        const assignees = await prisma.user.findMany({
          where: {
            id: { in: assigneeIds },
          },
          select: {
            id: true,
            username: true,
          },
        });

        const assigneeMap = assignees.reduce((map, user) => {
          map[user.id] = user;
          return map;
        }, {});

        const steps = process.stepInstances.map((step) => {
          const assigneeIds = step.workflowAssignment?.assigneeIds?.length
            ? step.workflowAssignment.assigneeIds
            : [step.assignedTo];

          return {
            stepName: step.workflowAssignment?.step?.stepName ?? "Unknown Step",
            stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
            stepId: step.workflowAssignment?.step?.id ?? null,
            stepType: step.workflowAssignment?.step?.stepType ?? "UNKNOWN",
            assignees: assigneeIds.map((id) => ({
              assigneeId: id,
              assigneeName: assigneeMap[id]?.username ?? "Unknown User",
            })),
          };
        });

        const transformedDocuments = process.documents.map((doc) => {
          const signedBy =
            doc.signatures?.map((sig) => ({
              signedBy: sig.user.username,
              signedAt: sig.signedAt ? sig.signedAt.toISOString() : null,
              remarks: sig.reason || null,
              byRecommender: sig.byRecommender,
              isAttachedWithRecommendation: sig.isAttachedWithRecommendation,
            })) || [];

          const rejectionDetails =
            doc.rejections?.length > 0
              ? {
                  rejectedBy: doc.rejections[0].user.username,
                  rejectionReason: doc.rejections[0].reason || null,
                  rejectedAt: doc.rejections[0].rejectedAt
                    ? doc.rejections[0].rejectedAt.toISOString()
                    : null,
                  byRecommender: doc.rejections[0].byRecommender,
                  isAttachedWithRecommendation:
                    doc.rejections[0].isAttachedWithRecommendation,
                }
              : null;

          const parts = doc.document.path.split("/");
          parts.pop();
          const updatedPath = parts.join("/");

          return {
            id: doc.document.id,
            name: doc.document.name,
            type: doc.document.type,
            path: updatedPath,
            tags: doc.document.tags,
            signedBy,
            rejectionDetails,
            isRecirculationTrigger:
              doc.documentHistory?.some(
                (history) => history.isRecirculationTrigger
              ) || false,
            approvalCount: signedBy.length,
            isReplacement: doc.isReplacement,
            superseding: doc.superseding,
            reopenCycle: doc.reopenCycle,
          };
        });

        const processDocuments = await prisma.processDocument.findMany({
          where: { processId: process.id },
          include: {
            document: {
              select: {
                id: true,
                name: true,
                path: true,
              },
            },
            replacedDocument: {
              select: {
                id: true,
                name: true,
                path: true,
              },
            },
          },
        });

        const documentVersioning = [];
        const replacedDocumentIds = new Set(
          processDocuments
            .filter((pd) => pd.replacedDocumentId)
            .map((pd) => pd.replacedDocumentId)
        );
        const latestDocuments = processDocuments.filter(
          (pd) => !replacedDocumentIds.has(pd.documentId)
        );

        for (const latestDoc of latestDocuments) {
          const versionChain = [];
          let currentDoc = latestDoc;

          versionChain.push({
            id: currentDoc.document.id,
            name: currentDoc.document.name,
            path: currentDoc.document.path,
            active: true,
            isReplacement: currentDoc.isReplacement,
            superseding: currentDoc.superseding,
            reopenCycle: currentDoc.reopenCycle,
          });

          while (currentDoc.replacedDocumentId) {
            const previousDoc = processDocuments.find(
              (pd) => pd.documentId === currentDoc.replacedDocumentId
            );
            if (previousDoc) {
              versionChain.push({
                id: previousDoc.document.id,
                name: previousDoc.document.name,
                path: previousDoc.document.path,
                active: false,
                isReplacement: previousDoc.isReplacement,
                superseding: previousDoc.superseding,
                reopenCycle: previousDoc.reopenCycle,
              });
              currentDoc = previousDoc;
            } else {
              break;
            }
          }

          documentVersioning.push({
            latestDocumentId: latestDoc.document.id,
            versions: versionChain.reverse(),
          });
        }

        const queryDetails = await Promise.all(
          process.stepInstances.flatMap((step) =>
            step.processQA.map(async (qa) => {
              const documentHistoryIds = [
                ...(qa.details?.documentChanges?.map(
                  (dc) => dc.documentHistoryId
                ) || []),
                ...(qa.details?.documentSummaries?.map(
                  (ds) => ds.documentHistoryId
                ) || []),
              ];

              const documentHistories =
                documentHistoryIds.length > 0
                  ? await prisma.documentHistory.findMany({
                      where: { id: { in: documentHistoryIds } },
                      include: {
                        document: {
                          select: {
                            id: true,
                            name: true,
                            type: true,
                            path: true,
                          },
                        },
                        replacedDocument: {
                          select: {
                            id: true,
                            name: true,
                            path: true,
                          },
                        },
                        user: {
                          select: {
                            id: true,
                            name: true,
                            username: true,
                          },
                        },
                      },
                    })
                  : [];

              return {
                stepInstanceId: step.id,
                stepName: step.workflowAssignment?.step?.stepName ?? null,
                stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
                status: step.status,
                taskType: qa.answer ? "RESOLVED" : "QUERY_UPLOAD",
                queryText: qa.question,
                answerText: qa.answer || null,
                initiatorName: qa.initiator.name,
                createdAt: qa.createdAt.toISOString(),
                answeredAt: qa.answeredAt ? qa.answeredAt.toISOString() : null,
                documentChanges:
                  qa.details?.documentChanges?.map((dc) => {
                    const history = documentHistories.find(
                      (h) => h.id === dc.documentHistoryId
                    );
                    return {
                      documentId: dc.documentId,
                      requiresApproval: dc.requiresApproval,
                      isReplacement: dc.isReplacement,
                      superseding: dc.superseding || false,
                      documentHistoryId: dc.documentHistoryId,
                      document: history?.document
                        ? {
                            id: history.document.id,
                            name: history.document.name,
                            type: history.document.type,
                            path: history.document.path,
                            tags: history.document.tags,
                          }
                        : null,
                      actionDetails: history?.actionDetails,
                      user: history?.user.name,
                      createdAt: history?.createdAt.toISOString(),
                      replacedDocument: history?.replacedDocument
                        ? {
                            id: history.replacedDocument.id,
                            name: history.replacedDocument.name,
                            path: history.replacedDocument.path,
                          }
                        : null,
                      reopenCycle: history?.actionDetails?.reopenCycle || 0,
                    };
                  }) || [],
                documentSummaries:
                  qa.details?.documentSummaries?.map((ds) => {
                    const history = documentHistories.find(
                      (h) => h.id === ds.documentHistoryId
                    );
                    return {
                      documentId: ds.documentId,
                      feedbackText: ds.feedbackText,
                      documentHistoryId: ds.documentHistoryId,
                      documentDetails: history?.document
                        ? {
                            id: history.document.id,
                            name: history.document.name,
                            path: history.document.path,
                          }
                        : null,
                      user: history?.user.username,
                      createdAt: history?.createdAt.toISOString(),
                      reopenCycle: history?.actionDetails?.reopenCycle || 0,
                    };
                  }) || [],
                assigneeDetails: qa.details?.assigneeDetails
                  ? {
                      assignedStepName:
                        qa.details.assigneeDetails.assignedStepName,
                      assignedAssigneeId:
                        qa.details.assigneeDetails.assignedAssigneeId,
                      assignedAssigneeName: qa.details.assigneeDetails
                        .assignedAssigneeId
                        ? (
                            await prisma.user.findUnique({
                              where: {
                                id: parseInt(
                                  qa.details.assigneeDetails.assignedAssigneeId
                                ),
                              },
                              select: { username: true },
                            })
                          )?.username || null
                        : null,
                    }
                  : null,
              };
            })
          )
        );

        const recommendationDetails = await Promise.all(
          process.stepInstances.flatMap((step) =>
            step.recommendations.map(async (rec) => {
              const documentSummaries = rec.documentSummaries || [];
              const documentResponses = rec.details?.documentResponses || [];
              const documentIds = documentSummaries.map((ds) =>
                parseInt(ds.documentId)
              );
              const documents = documentIds.length
                ? await prisma.document.findMany({
                    where: { id: { in: documentIds } },
                    select: { id: true, name: true },
                  })
                : [];

              const documentMap = documents.reduce((map, doc) => {
                map[doc.id] = doc.name;
                return map;
              }, {});

              const documentDetails = documentSummaries.map((ds) => {
                const response = rec.details?.documentResponses?.find(
                  (dr) => parseInt(dr.documentId) === parseInt(ds.documentId)
                );
                return {
                  documentId: ds.documentId,
                  documentName:
                    documentMap[ds.documentId] || "Unknown Document",
                  queryText: ds.queryText,
                  answerText: response?.answerText || null,
                };
              });

              return {
                recommendationId: rec.id,
                stepInstanceId: step.id,
                stepName: step.workflowAssignment?.step?.stepName ?? null,
                stepNumber: step.workflowAssignment?.step?.stepNumber ?? null,
                status: rec.status,
                recommendationText: rec.recommendationText,
                responseText: rec.responseText || null,
                initiatorName: rec.initiator.username,
                recommenderName: rec.recommender.username,
                createdAt: rec.createdAt.toISOString(),
                respondedAt: rec.respondedAt
                  ? rec.respondedAt.toISOString()
                  : null,
                documentDetails,
              };
            })
          )
        );

        const toBePicked = process.stepInstances.some(
          (step) =>
            step.assignedTo === userData.id && step.status === "IN_PROGRESS"
        );

        const workflow = {
          id: process.workflow.id,
          name: process.workflow.name,
          version: process.workflow.version,
        };

        return {
          processName: process.name,
          initiatorName: process.initiator.username,
          status: process.status,
          createdAt: process.createdAt,
          processId: process.id,
          processStepInstanceId:
            process.stepInstances.filter(
              (item) => item.status === "IN_PROGRESS"
            )[0]?.id || null,
          arrivedAt:
            process.stepInstances.filter(
              (item) => item.status === "IN_PROGRESS"
            )[0]?.updatedAt ||
            process.stepInstances.filter(
              (item) => item.status === "IN_PROGRESS"
            )[0]?.createdAt ||
            null,
          updatedAt: process.updatedAt,
          toBePicked,
          isRecirculated: process.isRecirculated,
          documents: transformedDocuments,
          steps,
          queryDetails,
          recommendationDetails,
          documentVersioning,
          workflow,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: transformedProcesses,
    });
  } catch (error) {
    console.error("Error getting completed initiator processes:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to retrieve completed initiator processes",
        details: error.message,
        code: "PROCESS_RETRIEVAL_ERROR",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
};

export const get_process_documents = async (req, res) => {
  try {
    const { processId, versionNumber } = req.params;
    const versionNum = parseInt(versionNumber);

    if (!processId || isNaN(versionNum) || versionNum < 1) {
      return res
        .status(400)
        .json({ error: "Invalid processId or versionNumber" });
    }

    // Fetch ProcessDocuments for the given processId and reopenCycle
    let processDocs = await prisma.processDocument.findMany({
      where: {
        processId,
        reopenCycle: versionNum - 1,
      },
      include: {
        document: true,
        replacedDocument: true,
      },
    });

    // Filter out replaced documents
    const filteredDocs = processDocs.filter((doc) => {
      const isReplaced = processDocs.some(
        (otherDoc) => otherDoc.replacedDocumentId === doc.documentId
      );
      return !isReplaced;
    });

    let result = filteredDocs.map((doc) => {
      const pathWithoutFileName = doc.document.path.substring(
        0,
        doc.document.path.lastIndexOf("/")
      );
      return {
        name: doc.document.name,
        path: pathWithoutFileName,
        id: doc.documentId,
        isNew: false,
      };
    });

    // If versionNumber > 1, compare with previous version
    if (versionNum > 1) {
      const prevVersionDocs = await prisma.processDocument.findMany({
        where: {
          processId,
          reopenCycle: versionNum - 2,
        },
        include: {
          document: true,
          replacedDocument: true,
        },
      });

      // Filter out replaced documents in previous version
      const filteredPrevDocs = prevVersionDocs.filter((doc) => {
        const isReplaced = prevVersionDocs.some(
          (otherDoc) => otherDoc.replacedDocumentId === doc.documentId
        );
        return !isReplaced;
      });

      // Mark documents as new if they don't exist in previous version
      result = result.map((doc) => {
        const existsInPrev = filteredPrevDocs.some(
          (prevDoc) => prevDoc.documentId === doc.documentId
        );
        return {
          ...doc,
          isNew: !existsInPrev,
        };
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching process documents:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    await prisma.$disconnect();
  }
};

export const upload_documents_in_process = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { processId, documents, issueNo } = req.body;

    if (!processId || !documents || !Array.isArray(documents)) {
      return res.status(400).json({
        message: "Missing required fields: processId and documents (array)",
      });
    }

    // Check if process exists and user has access
    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        workflow: { select: { name: true } },
        initiator: { select: { id: true } },
      },
    });

    if (!process) {
      return res.status(404).json({ message: "Process not found" });
    }

    // Check if user is initiator or has access to the process
    const hasAccess = await checkUserProcessAccess(
      process.initiatorId,
      userData.id
    );
    if (!hasAccess && process.initiator.id !== userData.id) {
      return res.status(403).json({
        message:
          "You don't have permission to upload documents to this process",
      });
    }

    const workflowName = process.workflow.name;
    const processName = process.name;

    let documentIds = documents.map((item) => item.documentId) || [];
    const copiedDocumentIds = [];

    // Copy documents to process folder (similar to initiate_process)
    for (const documentId of documentIds) {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { path: true, name: true, type: true },
      });

      if (document) {
        const sourcePath = `./${document.path}`;
        const destinationPath = `../${workflowName}/${processName}`;
        const name = sourcePath.split("/").pop();

        try {
          const copyResult = await new Promise((resolve, reject) => {
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

          if (copyResult.documentId) {
            copiedDocumentIds.push(copyResult.documentId);
          }

          // Delete original document from workspace
          await new Promise((resolve, reject) => {
            delete_file(
              {
                headers: { authorization: `Bearer ${accessToken}` },
                body: { documentId },
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
        } catch (error) {
          console.error(`Error processing document ${documentId}:`, error);
          // If copy fails, use original document ID
          copiedDocumentIds.push(documentId);
        }
      }
    }

    documentIds = copiedDocumentIds;

    if (documentIds.length === 0) {
      return res.status(400).json({
        message: "No documents were successfully uploaded",
      });
    }

    // Create processDocument entries
    const processDocumentData = documents.map((item, index) => ({
      processId: processId,
      documentId: documentIds[index],
      reopenCycle: process.reopenCycle || 0,
      SOPIssueNo: issueNo || null,
      preApproved: item.preApproved || false,
      tags: item.tags || [],
      partNumber: item.partNumber || null,
      description: item.description || null,
      issueNo: item.issueNo || null,
      isReplacement: item.isReplacement || false,
      superseding: item.superseding || false,
      reasonOfSupersed: item.reasonOfSupersed || null,
    }));

    await prisma.processDocument.createMany({
      data: processDocumentData,
    });

    // Create document history for uploaded documents
    for (let i = 0; i < documents.length; i++) {
      await prisma.documentHistory.create({
        data: {
          documentId: documentIds[i],
          processId: processId,
          userId: userData.id,
          actionType: "UPLOADED",
          actionDetails: {
            uploadType: "ADDITIONAL_DOCUMENT",
            reopenCycle: process.reopenCycle || 0,
          },
          createdAt: new Date(),
        },
      });
    }

    const COMPLETED_STATUSES = ["APPROVED", "SKIPPED"];

    // Users who have ONLY completed step instances in this process
    const usersWithIncompleteSteps = await prisma.processStepInstance.findMany({
      where: {
        processId,
        status: { notIn: COMPLETED_STATUSES },
      },
      select: { assignedTo: true },
    });

    const excludedUserIds = usersWithIncompleteSteps.map((u) => u.assignedTo);

    const eligibleUsers = await prisma.processStepInstance.findMany({
      where: {
        processId,
        status: { in: COMPLETED_STATUSES },
        assignedTo: { notIn: excludedUserIds },
      },
      distinct: ["assignedTo"],
      select: {
        assignedTo: true,
        roleId: true,
        departmentId: true,
      },
    });

    console.log("eligible users", eligibleUsers);

    if (eligibleUsers.length > 0) {
      await prisma.processStepInstance.createMany({
        data: eligibleUsers.map((user) => ({
          processId,
          assignedTo: user.assignedTo,
          roleId: user.roleId,
          departmentId: user.departmentId,
          status: "IN_PROGRESS",
          createdAt: new Date(),
        })),
      });
    }

    // Get updated document arrays (using the same logic as view_process)
    const { documentVersioning, sededDocuments, transformedDocuments } =
      await getProcessDocumentArrays(processId);

    return res.status(200).json({
      message: "Documents uploaded successfully to the process",
      documentVersioning,
      sededDocuments,
      documents: transformedDocuments,
    });
  } catch (error) {
    console.error("Error uploading documents to process:", error);
    return res.status(500).json({
      message: "Error uploading documents to process",
      error: error.message,
    });
  }
};

export const delete_document_in_process = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { processId, documentId } = req.body;

    if (!processId || !documentId) {
      return res.status(400).json({
        message: "Missing required fields: processId and documentId",
      });
    }

    // Check if process exists and user has access
    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        initiator: { select: { id: true } },
      },
    });

    if (!process) {
      return res.status(404).json({ message: "Process not found" });
    }

    // Check if user is initiator or has access to the process
    const hasAccess = await checkUserProcessAccess(processId, userData.id);
    if (!hasAccess && process.initiator.id !== userData.id) {
      return res.status(403).json({
        message:
          "You don't have permission to delete documents from this process",
      });
    }

    // Check if document exists in process
    const processDocument = await prisma.processDocument.findFirst({
      where: {
        processId: processId,
        documentId: parseInt(documentId),
      },
      include: {
        signatures: true,
        rejections: true,
        document: {
          select: {
            id: true,
            path: true,
            name: true,
          },
        },
      },
    });

    if (!processDocument) {
      return res.status(404).json({
        message: "Document not found in the specified process",
      });
    }

    // Check if document has signatures or rejections (prevent deletion if signed/rejected)
    if (
      processDocument.signatures.length > 0 ||
      processDocument.rejections.length > 0
    ) {
      return res.status(400).json({
        message: "Cannot delete document that has been signed or rejected",
      });
    }

    // Check if this document is referenced as a replaced document
    const isReferenced = await prisma.processDocument.findFirst({
      where: {
        replacedDocumentId: parseInt(documentId),
      },
    });

    if (isReferenced) {
      return res.status(400).json({
        message:
          "Cannot delete document that is referenced by other documents in version chain",
      });
    }

    // Delete the process document association
    await prisma.processDocument.delete({
      where: {
        id: processDocument.id,
      },
    });

    // Check if this is the last reference to the document, then delete the document completely
    const otherReferences = await prisma.processDocument.findFirst({
      where: {
        documentId: parseInt(documentId),
        id: { not: processDocument.id },
      },
    });

    if (!otherReferences) {
      // Use the file_delete function to permanently delete the file from drive
      try {
        await new Promise((resolve, reject) => {
          file_delete(
            {
              headers: { authorization: `Bearer ${accessToken}` },
              body: { documentId: parseInt(documentId) },
            },
            {
              status: (code) => ({
                json: (data) => {
                  if (code === 200) {
                    console.log(
                      `Document ${documentId} permanently deleted from drive`
                    );
                    resolve(data);
                  } else {
                    console.error(
                      `Failed to delete document from drive:`,
                      data
                    );
                    reject(
                      new Error(
                        data.message || "Failed to delete file from drive"
                      )
                    );
                  }
                },
              }),
            }
          );
        });
      } catch (fileDeleteError) {
        console.error(
          `Error deleting file from drive for document ${documentId}:`,
          fileDeleteError
        );
        // Even if file deletion fails, we continue since the process document association is already removed
      }
    } else {
      console.log(
        `Document ${documentId} not deleted from drive as it has other process references`
      );
    }

    // Get updated document arrays
    const { documentVersioning, sededDocuments, transformedDocuments } =
      await getProcessDocumentArrays(processId);

    return res.status(200).json({
      message: "Document deleted successfully from process",
      documentVersioning,
      sededDocuments,
      documents: transformedDocuments,
    });
  } catch (error) {
    console.error("Error deleting document from process:", error);
    return res.status(500).json({
      message: "Error deleting document from process",
      error: error.message,
    });
  }
};

// Helper function to get document arrays (extracted from view_process logic)
const getProcessDocumentArrays = async (processId) => {
  const processDocuments = await prisma.processDocument.findMany({
    where: { processId },
    include: {
      document: {
        select: {
          id: true,
          name: true,
          type: true,
          path: true,
        },
      },
      replacedDocument: {
        select: {
          id: true,
          name: true,
          path: true,
        },
      },
      signatures: {
        include: { user: { select: { id: true, username: true } } },
      },
      rejections: {
        include: { user: { select: { id: true, username: true } } },
      },
      documentHistory: {
        include: {
          user: { select: { id: true, name: true, username: true } },
          replacedDocument: {
            select: { id: true, name: true, path: true },
          },
        },
      },
    },
  });

  // Identify replaced and superseded document IDs
  const replacedDocumentIds = new Set(
    processDocuments
      .filter((pd) => pd.replacedDocumentId)
      .map((pd) => pd.replacedDocumentId)
  );

  const supersededDocumentIds = new Set(
    processDocuments
      .filter((pd) => pd.superseding)
      .map((pd) => pd.replacedDocumentId)
  );

  // Find the latest document
  let latestDocument = processDocuments.find(
    (pd) =>
      !replacedDocumentIds.has(pd.documentId) &&
      !supersededDocumentIds.has(pd.documentId)
  );

  if (!latestDocument) {
    latestDocument = processDocuments
      .filter((pd) => !replacedDocumentIds.has(pd.documentId))
      .sort((a, b) => b.document.id - a.document.id)[0];
  }

  // Build documentVersioning (same logic as view_process)
  const documentVersioning = [];
  const allProcessDocuments = processDocuments;

  const docIdToProcessDoc = new Map(
    allProcessDocuments.map((d) => [d.documentId, d])
  );
  const replacedToReplacer = new Map(
    allProcessDocuments
      .filter((d) => d.replacedDocumentId)
      .map((d) => [d.replacedDocumentId, d.documentId])
  );

  const terminalDocumentIds = allProcessDocuments
    .filter((d) => !replacedToReplacer.has(d.documentId))
    .map((d) => d.documentId);

  for (const terminalDocId of terminalDocumentIds) {
    const versions = [];
    let currentDocId = terminalDocId;
    const visitedDocIds = new Set();

    while (currentDocId) {
      if (visitedDocIds.has(currentDocId)) {
        console.warn(
          `Cycle detected at docId: ${currentDocId}. Breaking loop.`
        );
        break;
      }
      visitedDocIds.add(currentDocId);

      const processDoc = docIdToProcessDoc.get(currentDocId);
      if (!processDoc) break;

      versions.unshift({
        id: processDoc.document.id,
        name: processDoc.document.name,
        path: processDoc.document.path.split("/").slice(0, -1).join("/"),
        type: processDoc.document.type,
        issueNo: processDoc.issueNo || null,
        SOPIssueNo: processDoc.SOPIssueNo || null,
        tags: processDoc.tags,
        preApproved: processDoc.preApproved,
        reasonOfSupersed: processDoc.reasonOfSupersed,
        description: processDoc.description,
        partNumber: processDoc.partNumber,
        active: processDoc.document.id === latestDocument?.document?.id,
        isReplacement: processDoc.isReplacement,
        superseding: processDoc.superseding,
        reopenCycle: processDoc.reopenCycle,
      });

      currentDocId = processDoc.replacedDocumentId;
    }

    if (versions.length > 0) {
      documentVersioning.push({
        latestDocumentId: terminalDocId,
        versions: versions,
      });
    }
  }

  // Build sededDocuments (same logic as view_process)
  const sededDocuments = [];
  if (processDocuments.length > 0) {
    const allDocsSorted = [...processDocuments].sort(
      (a, b) => a.document.id - b.document.id
    );

    const reopenCycle1Docs = allDocsSorted.filter(
      (doc) => doc.reopenCycle === 1
    );

    reopenCycle1Docs.forEach((firstReopenCycle1Doc) => {
      const documentWhichSuperseded = allDocsSorted.find(
        (doc) => doc.documentId === firstReopenCycle1Doc.replacedDocumentId
      );

      const versions = [];
      let currentDoc = firstReopenCycle1Doc;
      let currentReopenCycle = 1;
      let lastDocBeforeCycleChange = null;
      const visitedDocIds = new Set();

      while (currentDoc && !visitedDocIds.has(currentDoc.documentId)) {
        visitedDocIds.add(currentDoc.documentId);

        if (currentDoc.reopenCycle > currentReopenCycle) {
          if (lastDocBeforeCycleChange) {
            versions.push({
              id: lastDocBeforeCycleChange.document.id,
              name: lastDocBeforeCycleChange.document.name,
              path: lastDocBeforeCycleChange.document.path
                ? lastDocBeforeCycleChange.document.path
                    .split("/")
                    .slice(0, -1)
                    .join("/")
                : "",
              issueNo: lastDocBeforeCycleChange.issueNo || null,
              SOPIssueNo: lastDocBeforeCycleChange.SOPIssueNo || null,
              type: lastDocBeforeCycleChange.document.type || "",
              tags: lastDocBeforeCycleChange.tags || [],
              reasonOfSupersed:
                lastDocBeforeCycleChange.reasonOfSupersed || null,
              description: lastDocBeforeCycleChange.description || null,
              partNumber: lastDocBeforeCycleChange.partNumber || null,
              active:
                lastDocBeforeCycleChange.document.id ===
                (latestDocument?.document?.id || null),
              isReplacement: lastDocBeforeCycleChange.isReplacement || false,
              superseding: lastDocBeforeCycleChange.superseding || false,
              preApproved: lastDocBeforeCycleChange.preApproved || false,
              reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
            });
          }
          currentReopenCycle = currentDoc.reopenCycle;
        }

        lastDocBeforeCycleChange = currentDoc;
        currentDoc = allDocsSorted.find(
          (d) => d.replacedDocumentId === currentDoc.documentId
        );
      }

      if (
        lastDocBeforeCycleChange &&
        !versions.some((v) => v.id === lastDocBeforeCycleChange.document.id)
      ) {
        versions.push({
          id: lastDocBeforeCycleChange.document.id,
          name: lastDocBeforeCycleChange.document.name,
          path: lastDocBeforeCycleChange.document.path
            ? lastDocBeforeCycleChange.document.path
                .split("/")
                .slice(0, -1)
                .join("/")
            : "",
          type: lastDocBeforeCycleChange.document.type || "",
          issueNo: lastDocBeforeCycleChange.document.issueNo || null,
          tags: lastDocBeforeCycleChange.tags || [],
          active:
            lastDocBeforeCycleChange.document.id ===
            (latestDocument?.document?.id || null),
          isReplacement: lastDocBeforeCycleChange.isReplacement || false,
          superseding: lastDocBeforeCycleChange.superseding || false,
          reopenCycle: lastDocBeforeCycleChange.reopenCycle || 0,
          preApproved: lastDocBeforeCycleChange.preApproved || false,
          reasonOfSupersed: lastDocBeforeCycleChange.reasonOfSupersed || null,
          description: lastDocBeforeCycleChange.description || null,
          partNumber: lastDocBeforeCycleChange.partNumber || null,
        });
      }

      if (documentWhichSuperseded) {
        sededDocuments.push({
          documentWhichSuperseded: {
            id: documentWhichSuperseded.document.id,
            name: documentWhichSuperseded.document.name,
            path: documentWhichSuperseded.document.path
              ? documentWhichSuperseded.document.path
                  .split("/")
                  .slice(0, -1)
                  .join("/")
              : "",
            type: documentWhichSuperseded.document.type || "",
            description: documentWhichSuperseded.description || "",
            preApproved: documentWhichSuperseded.preApproved || false,
            tags: documentWhichSuperseded.tags || [],
            issueNo: documentWhichSuperseded.issueNo || null,
            SOPIssueNo: documentWhichSuperseded.SOPIssueNo || null,
            reasonOfSupersed: documentWhichSuperseded.reasonOfSupersed || null,
            description: documentWhichSuperseded.description || null,
            partNumber: documentWhichSuperseded.partNumber || null,
          },
          latestDocumentId: latestDocument ? latestDocument.document.id : null,
          versions: versions,
        });
      }
    });
  }

  // Transform documents for response
  const transformedDocuments = processDocuments
    .filter(
      (doc) =>
        (!replacedDocumentIds.has(doc.documentId) ||
          (doc.replacedDocument &&
            doc.document.id === doc.replacedDocument.id)) &&
        !supersededDocumentIds.has(doc.documentId)
    )
    .map((doc) => {
      const signedBy =
        doc?.signatures.map((sig) => ({
          signedBy: sig.user.username,
          signedAt: sig.signedAt ? sig.signedAt.toISOString() : null,
          remarks: sig.reason || null,
          byRecommender: sig.byRecommender,
          isAttachedWithRecommendation: sig.isAttachedWithRecommendation,
        })) || [];

      const rejectionDetails =
        doc?.rejections.length > 0
          ? {
              rejectedBy: doc.rejections[0].user.username,
              rejectionReason: doc.rejections[0].reason || null,
              rejectedAt: doc.rejections[0].rejectedAt
                ? doc.rejections[0].rejectedAt.toISOString()
                : null,
              byRecommender: doc.rejections[0].byRecommender,
              isAttachedWithRecommendation:
                doc.rejections[0].isAttachedWithRecommendation,
            }
          : null;

      const parts = doc.document.path.split("/");
      parts.pop();
      const updatedPath = parts.join("/");

      return {
        id: doc.document.id,
        name: doc.document.name,
        type: doc.document.type,
        path: updatedPath,
        tags: doc.tags,
        signedBy,
        rejectionDetails,
        isRecirculationTrigger:
          doc?.documentHistory.some(
            (history) => history.isRecirculationTrigger
          ) || false,
        approvalCount: signedBy.length,
        isReplacement: doc.isReplacement,
        superseding: doc.superseding,
        preApproved: doc.preApproved,
        reopenCycle: doc.reopenCycle,
        description: doc.description,
        reasonOfSupersed: doc.reasonOfSupersed,
        partNumber: doc.partNumber,
        issueNo: doc.issueNo,
        SOPIssueNo: doc.SOPIssueNo,
        active: true,
      };
    });

  return { documentVersioning, sededDocuments, transformedDocuments };
};

// Helper to check user access to process
const checkUserProcessAccess = async (initiatorId, userId) => {
  return initiatorId === userId;
};

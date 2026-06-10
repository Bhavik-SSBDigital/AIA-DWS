import { verifyUser } from "../utility/verifyUser.js";

import prisma from "../config/prisma-config.js";

export const pick_process_step = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    const { stepInstanceId } = req.body;

    if (!stepInstanceId) {
      return res.status(400).json({ message: "stepInstanceId is required" });
    }

    // Execute all operations in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get the step instance with related workflow assignment and assignee type
      const stepInstance = await tx.processStepInstance.findUnique({
        where: { id: stepInstanceId },
        include: {
          workflowAssignment: {
            select: {
              assigneeType: true,
              id: true,
            },
          },
          process: {
            select: {
              id: true,
            },
          },
          workflowStep: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!stepInstance) {
        throw new Error("Step instance not found");
      }

      const assigneeType = stepInstance.workflowAssignment?.assigneeType;

      if (!assigneeType) {
        throw new Error("Assignee type not found for this step");
      }

      // Update the step instance with the current user's ID
      const updatedStepInstance = await tx.processStepInstance.update({
        where: { id: stepInstanceId },
        data: {
          pickedById: userData.id,
          claimedAt: new Date(),
          status: "IN_PROGRESS",
        },
      });

      // If assigneeType is USER, just return success
      if (assigneeType === "USER") {
        return { message: "Process picked successfully", assigneeType };
      }

      // If assigneeType is ROLE or DEPARTMENT, handle the logic
      if (assigneeType === "ROLE" || assigneeType === "DEPARTMENT") {
        // Get the roleId from the step instance
        if (!stepInstance.roleId) {
          throw new Error("Role ID not found for this step instance");
        }

        // Get all users with the same role (excluding current user)
        const usersWithSameRole = await tx.userRole.findMany({
          where: {
            roleId: stepInstance.roleId,
            userId: {
              not: userData.id, // Exclude current user
            },
          },
          select: {
            userId: true,
          },
        });

        const userIdsToDelete = usersWithSameRole.map((ur) => ur.userId);

        if (userIdsToDelete.length > 0) {
          // Delete process step instances for other users with the same criteria
          const deleteResult = await tx.processStepInstance.deleteMany({
            where: {
              AND: [
                { processId: stepInstance.processId },
                { assignedTo: { in: userIdsToDelete } },
                { roleId: stepInstance.roleId },
                { assignmentId: stepInstance.assignmentId }, // Use assignmentId instead of workflowAssignmentId
                { stepId: stepInstance.stepId }, // Match the same step
                { id: { not: stepInstanceId } }, // Exclude the current step instance
                { status: "IN_PROGRESS" }, // Only delete pending steps
              ],
            },
          });

          return {
            message:
              "Process picked successfully and other users' step instances removed",
            assigneeType,
            deletedCount: deleteResult.count,
          };
        }

        return {
          message: "Process picked successfully",
          assigneeType,
          deletedCount: 0,
        };
      }

      throw new Error("Unsupported assignee type");
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error claiming step:", error);

    if (error.message === "Step instance not found") {
      return res.status(404).json({ message: error.message });
    }
    if (
      error.message === "Assignee type not found for this step" ||
      error.message === "Role ID not found for this step instance" ||
      error.message === "Unsupported assignee type"
    ) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: "Error claiming step" });
  }
};

async function handleRolePickup(tx, step) {
  const pendingSteps = await tx.processStepInstance.findMany({
    where: {
      assignmentId: step.assignmentId,
      status: "IN_PROGRESS",
    },
  });

  const stepIdsToDelete = pendingSteps
    .map((s) => s.id)
    .filter((id) => id !== step.id);

  await tx.processNotification.deleteMany({
    where: { stepId: { in: stepIdsToDelete } },
  });

  await tx.processStepInstance.deleteMany({
    where: { id: { in: stepIdsToDelete } },
  });
}

async function handleDepartmentPickup(tx, step) {
  const progress = step.assignmentProgress;
  const assignment = step.workflowAssignment;
  const dp = progress.departmentStepProgress;

  if (assignment.allowParallel) {
    const updated = await tx.departmentStepProgress.update({
      where: { id: dp.id },
      data: { completedRoles: { push: step.roleId } },
      select: { completedRoles: true, requiredRoles: true },
    });

    if (
      updated.requiredRoles.every((r) => updated.completedRoles.includes(r))
    ) {
      await tx.assignmentProgress.update({
        where: { id: progress.id },
        data: { completed: true, completedAt: new Date() },
      });
    }
  } else {
    const hierarchy = JSON.parse(progress.roleHierarchy);
    const nextLevel = progress.currentLevel + 1;

    if (nextLevel < hierarchy.length) {
      const departments = await getAssignmentDepartments(assignment.id);
      const nextRoles = hierarchy[nextLevel];

      await createRoleSteps(tx, {
        processId: step.processId,
        assignmentId: assignment.id,
        progressId: progress.id,
        departments,
        roles: nextRoles,
      });

      await tx.assignmentProgress.update({
        where: { id: progress.id },
        data: { currentLevel: nextLevel },
      });
    } else {
      await tx.assignmentProgress.update({
        where: { id: progress.id },
        data: { completed: true, completedAt: new Date() },
      });
    }
  }
}

async function cleanupNotifications(tx, step) {
  await tx.processNotification.updateMany({
    where: { stepId: step.id },
    data: { status: "CLAIMED" },
  });
}

async function createRoleSteps(tx, params) {
  const users = await tx.userRole.findMany({
    where: {
      roleId: { in: params.roles },
      departmentId: { in: params.departments },
    },
    distinct: ["userId"],
  });

  return Promise.all(
    users.map((user) =>
      tx.processStepInstance.create({
        data: {
          processId: params.processId,
          assignmentId: params.assignmentId,
          progressId: params.progressId,
          assignedTo: user.userId,
          roleId: user.roleId,
          departmentId: user.departmentId,
          status: "IN_PROGRESS",
          deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      }),
    ),
  );
}

async function getAssignmentDepartments(assignmentId) {
  const assignment = await prisma.workflowAssignment.findUnique({
    where: { id: assignmentId },
    select: { assigneeIds: true },
  });
  return assignment?.assigneeIds || [];
}

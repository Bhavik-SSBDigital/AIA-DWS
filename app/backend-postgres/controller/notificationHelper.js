import pkg from "@prisma/client";
const { NotificationType } = pkg;

import prisma from "../config/prisma-config.js";

export async function createNotification(tx, data) {
  const notification = await tx.processNotification.create({
    data: {
      type: data.type,
      userId: data.userId,
      processId: data.processId,
      queryId: data.queryId,
      doubtId: data.doubtId,
      recommendationId: data.recommendationId,
      metadata: data.metadata,
      status: "ACTIVE",
    },
  });

  return notification;
}

export async function createQueryNotifications(
  tx,
  queryId,
  processId,
  stepInstanceId,
  recirculateFromStepId,
) {
  const query = await tx.processQuery.findUnique({
    where: { id: queryId },
    include: {
      process: {
        include: {
          currentStep: true,
          workflow: true,
        },
      },
    },
  });

  // Notify process initiator about the query
  await createNotification(tx, {
    type: "QUERY",
    userId: query.process.initiatorId,
    processId,
    queryId,
    metadata: {
      processName: query.process.name,
      workflowName: query.process.workflow.name,
      stepName: query.process.currentStep?.stepName || "Unknown Step",
    },
  });

  // Additional notifications for recirculation if needed
  if (recirculateFromStepId) {
    const recirculationStep = await tx.workflowStep.findUnique({
      where: { id: recirculateFromStepId },
      include: {
        assignments: {
          include: {
            departmentRoles: true,
          },
        },
      },
    });

    for (const assignment of recirculationStep.assignments) {
      for (const userId of assignment.assigneeIds) {
        await createNotification(tx, {
          type: "RECIRCULATION_REQUEST",
          userId,
          processId,
          queryId,
          metadata: {
            processName: query.process.name,
            stepName: recirculationStep.stepName,
          },
        });
      }
    }
  }
}
export async function createRecommendationNotifications(
  tx,
  recommendationId,
  processId,
  stepInstanceId,
) {
  const recommendation = await tx.processRecommendation.findUnique({
    where: { id: recommendationId },
    include: {
      process: {
        include: {
          currentStep: true,
          workflow: true,
        },
      },
    },
  });

  // Notify process initiator about the recommendation
  await createNotification(tx, {
    type: "RECOMMENDATION",
    userId: recommendation.process.initiatorId,
    processId,
    recommendationId,
    metadata: {
      processName: recommendation.process.name,
      workflowName: recommendation.process.workflow.name,
      stepName: recommendation.process.currentStep?.stepName || "Unknown Step",
    },
  });
}

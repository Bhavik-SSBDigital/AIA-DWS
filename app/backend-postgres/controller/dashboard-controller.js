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
      // Workflows
      prisma.workflow
        .findMany({
          where: {
            createdAt: { gte: start, lte: end },
          },
          select: {
            id: true,
            name: true,
            version: true,
            description: true,
            createdAt: true,
            // decisionAt: true,
          },
        })
        .then((workflows) =>
          workflows.map((w) => ({
            workflowId: w.id,
            name: w.name,
            version: w.version,
            description: w.description,
            createdAt: w.createdAt.toISOString(),
            // decisionAt: w.decisionAt.toISOString(),
          }))
        ),
      // Active workflows
      prisma.workflow
        .findMany({
          where: {
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
            // decisionAt: true,
          },
        })
        .then((workflows) =>
          workflows.map((w) => ({
            workflowId: w.id,
            name: w.name,
            version: w.version,
            description: w.description,
            createdAt: w.createdAt.toISOString(),
            // decisionAt: w.decisionAt.toISOString(),
          }))
        ),
      // Completed processes
      prisma.processInstance
        .findMany({
          where: {
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
      // Pending processes
      prisma.processInstance
        .findMany({
          where: {
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
      // Queries
      prisma.processQA
        .findMany({
          where: {
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
      // Signed documents
      prisma.documentSignature
        .findMany({
          where: {
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
        .then((signatures) => {
          const uniqueSignatures = [];
          const seenSignatures = new Set();

          return signatures
            .map((s) => ({
              signatureId: s.id, // Add signature ID for uniqueness
              documentId: s.processDocument.document.id,
              documentName: s.processDocument.document.name,
              documentPath: formatDocumentPath(s.processDocument.document.path),
              documentType: getDocType(s.processDocument.document.path),
              processId: s.processDocument.process.id,
              processName: s.processDocument.process.name,
              signedAt: s.signedAt.toISOString(),
            }))
            .filter((signature) => {
              // Create a unique key combining documentId, processId, and signedAt
              const uniqueKey = `${signature.documentId}-${signature.processId}-${signature.signedAt}`;
              if (!seenSignatures.has(uniqueKey)) {
                seenSignatures.add(uniqueKey);
                return true;
              }
              return false;
            });
        }),
      // Rejected documents
      prisma.documentRejection
        .findMany({
          where: {
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
        .then((rejections) => {
          const seenRejections = new Set();

          return rejections
            .map((r) => ({
              rejectionId: r.id, // Add rejection ID for uniqueness
              documentId: r.processDocument.document.id,
              documentName: r.processDocument.document.name,
              documentPath: formatDocumentPath(r.processDocument.document.path),
              documentType: getDocType(r.processDocument.document.path),
              processId: r.processDocument.process.id,
              processName: r.processDocument.process.name,
              rejectedAt: r.rejectedAt.toISOString(),
            }))
            .filter((rejection) => {
              // Create a unique key combining documentId, processId, and rejectedAt
              const uniqueKey = `${rejection.documentId}-${rejection.processId}-${rejection.rejectedAt}`;
              if (!seenRejections.has(uniqueKey)) {
                seenRejections.add(uniqueKey);
                return true;
              }
              return false;
            });
        }),
      // Replaced documents
      prisma.documentHistory
        .findMany({
          where: {
            actionType: "REPLACED",
            createdAt: { gte: start, lte: end },
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
              historyId: h.id, // Add history ID for uniqueness
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
              replacedAt: h.createdAt.toISOString(), // Added for better uniqueness
            }))
            .filter((replacement) => {
              // Create a unique key combining replacedDocumentId, replacesDocumentId, and replacedAt
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
// export const getWorkflowAnalysis = async (req, res) => {
//   try {
//     const accessToken = req.headers["authorization"]?.substring(7);
//     const userData = await verifyUser(accessToken);
//     if (userData === "Unauthorized") {
//       return res.status(401).json({ message: "Unauthorized request" });
//     }

//     const { workflowId } = req.params;
//     const { startDate, endDate } = req.query;
//     const { start, end } = validateDateRange(startDate, endDate);

//     const workflow = await prisma.workflow.findUnique({
//       where: { id: workflowId },
//       select: {
//         id: true,
//         name: true,
//         version: true,
//         description: true,
//         createdAt: true,
//         updatedAt: true,
//         steps: {
//           select: {
//             id: true,
//             stepName: true,
//             stepNumber: true,
//             stepType: true,
//           },
//         },
//       },
//     });

//     if (!workflow) {
//       return res.status(404).json({
//         success: false,
//         error: {
//           message: "Workflow not found",
//           details: "No workflow found with the specified ID",
//           code: "WORKFLOW_NOT_FOUND",
//         },
//       });
//     }

//     const [
//       stepCompletionTimes,
//       pendingProcessesByStep,
//       assigneeCompletionTimes,
//       pendingProcesses,
//       queries,
//       signedDocuments,
//       rejectedDocuments,
//       replacedDocuments,
//     ] = await Promise.all([
//       // Step completion times
//       Promise.all(
//         workflow.steps.map(async (step) => {
//           const stepInstances = await prisma.processStepInstance.findMany({
//             where: {
//               stepId: step.id,
//               status: "APPROVED",
//               createdAt: { gte: start, lte: end },
//               decisionAt: { not: null },
//             },
//             select: {
//               createdAt: true,
//               decisionAt: true,
//             },
//           });
//           const avgTimeHours =
//             stepInstances.length > 0
//               ? stepInstances.reduce(
//                   (sum, si) =>
//                     sum + (si.decisionAt - si.createdAt) / (1000 * 60 * 60),
//                   0
//                 ) / stepInstances.length
//               : 0;
//           return {
//             stepId: step.id,
//             stepName: step.stepName,
//             stepNumber: step.stepNumber,
//             stepType: step.stepType,
//             averageCompletionTimeHours: avgTimeHours.toFixed(2),
//           };
//         })
//       ),
//       // Pending processes by step
//       Promise.all(
//         workflow.steps.map(async (step) => {
//           const processes = await prisma.processStepInstance.findMany({
//             where: {
//               stepId: step.id,
//               status: "IN_PROGRESS",
//               process: {
//                 workflowId,
//                 createdAt: { gte: start, lte: end },
//               },
//             },
//             include: {
//               process: {
//                 select: {
//                   id: true,
//                   name: true,
//                   createdAt: true,
//                   initiator: { select: { username: true } },
//                 },
//               },
//             },
//           });
//           return {
//             stepId: step.id,
//             stepName: step.stepName,
//             stepNumber: step.stepNumber,
//             pendingCount: processes.length,
//             processes: processes.map((p) => ({
//               processId: p.process.id,
//               processName: p.process.name,
//               createdAt: p.process.createdAt.toISOString(),
//               createdBy: p.process.initiator.username,
//             })),
//           };
//         })
//       ),
//       // Assignee completion times
//       prisma.processStepInstance
//         .groupBy({
//           by: ["assignedTo"],
//           where: {
//             process: { workflowId, createdAt: { gte: start, lte: end } },
//             status: "APPROVED",
//             decisionAt: { not: null },
//           },
//           _avg: {
//             decisionAt: true,
//             createdAt: true,
//           },
//           _count: {
//             id: true,
//           },
//         })
//         .then(async (results) => {
//           const assigneeDetails = await Promise.all(
//             results.map(async (r) => {
//               const user = await prisma.user.findUnique({
//                 where: { id: r.assignedTo },
//                 select: { username: true },
//               });
//               const avgTimeHours =
//                 r._count.id > 0
//                   ? (
//                       (new Date(r._avg.decisionAt) -
//                         new Date(r._avg.createdAt)) /
//                       (1000 * 60 * 60)
//                     ).toFixed(2)
//                   : 0;
//               return {
//                 assigneeId: r.assignedTo,
//                 assigneeUsername: user?.username || "Unknown User",
//                 averageCompletionTimeHours: parseFloat(avgTimeHours),
//                 totalTasks: r._count.id,
//               };
//             })
//           );
//           return assigneeDetails;
//         }),
//       // Pending processes
//       prisma.processInstance
//         .findMany({
//           where: {
//             workflowId: { id: workflowId },
//             status: "IN_PROGRESS",
//             createdAt: { gte: start, lte: end },
//           },
//           select: {
//             id: true,
//             name: true,
//             createdAt: true,
//             initiator: { select: { username: true } },
//           },
//         })
//         .then((processes) =>
//           processes.map((p) => ({
//             processId: p.id,
//             processName: p.name,
//             createdAt: p.createdAt.toISOString(),
//             initiatorUsername: p.initiator.username,
//           }))
//         ),
//       // Queries
//       prisma.processQA
//         .findMany({
//           where: {
//             process: { workflowId: { id: workflowId } },
//             createdAt: { gte: start, lte: end },
//           },
//           include: {
//             initiator: { select: { username: true } },
//             process: { select: { id: true, name: true } },
//           },
//         })
//         .then((queries) => {
//           const formatted = queries.map((q) => ({
//             id: q.id,
//             stepInstanceId: q.stepInstanceId,
//             queryText: q.question,
//             answerText: q.answer || null,
//             initiatorName: q.initiator.username,
//             createdAt: q.createdAt.toISOString(),
//             answeredAt: q.answeredAt?.toISOString() || null,
//             processId: q.process.id,
//             processName: q.process.name,
//             status: q.answer ? "RESOLVED" : "OPEN",
//           }));
//           return {
//             total: queries.length,
//             solved: queries.filter((q) => q.answer).length,
//             details: formatted,
//           };
//         }),
//       // Signed documents
//       prisma.documentSignature
//         .findMany({
//           where: {
//             processDocument: {
//               process: { workflowId: { id: workflowId } },
//               createdAt: { gte: start, lte: end },
//             },
//           },
//           include: {
//             processDocument: {
//               include: {
//                 document: { select: { id: true, name: true, path: true } },
//                 process: { select: { id: true, name: true } },
//               },
//             },
//           },
//         })
//         .then((signatures) =>
//           signatures.map((s) => ({
//             documentId: s.processDocument.document.id,
//             documentName: s.processDocument.document.name,
//             documentPath: formatDocumentPath(s.processDocument.document.path),
//             processId: s.processDocument.process.id,
//             processName: s.processDocument.process.name,
//             signedAt: s.createdAt.toISOString(),
//           }))
//         ),
//       // Rejected documents
//       prisma.documentRejection
//         .findMany({
//           where: {
//             processDocument: {
//               process: { workflowId: { id: workflowId } },
//               createdAt: { gte: start, lte: end },
//             },
//           },
//           include: {
//             processDocument: {
//               include: {
//                 document: { id: true, name: true, path: true },
//                 process: { id: true, name: true },
//               },
//             },
//           },
//         })
//         .then((rejections) =>
//           rejections.map((r) => ({
//             documentId: r.processDocument.document.id,
//             documentName: r.processDocument.document.name,
//             documentPath: formatDocumentPath(r.processDocument.document.path),
//             processId: r.processDocument.process.id,
//             processName: r.processDocument.process.name,
//             rejectedAt: r.createdAt.toISOString(),
//           }))
//         ),
//       // Replaced documents
//       prisma.documentHistory
//         .findMany({
//           where: {
//             processId: { workflowId: { id: workflowId } },
//             actionType: "REPLACED",
//             createdAt: { gte: start, lte: end },
//           },
//           include: {
//             document: { select: { id: true, name: true, path: true } },
//             replacedDocument: { select: { id: true, name: true, path: true } },
//             user: { select: { username: true } },
//           },
//         })
//         .then((histories) =>
//           histories.map((h) => ({
//             replacedDocumentId: h.document.id,
//             replacedDocName: h.document.name,
//             replacedDocumentPath: formatDocumentPath(h.document.path),
//             replacesDocumentId: h.replacedDocument?.id || null,
//             replacesDocumentName: h.replacedDocument?.name || null,
//             replacesDocumentPath: formatDocumentPath(
//               h.replacedDocument?.path || ""
//             ),
//             replacedBy: h.user.username,
//           }))
//         ),
//     ]);

//     return res.status(200).json({
//       success: true,
//       data: {
//         workflow: {
//           workflowId: workflow.id,
//           name: workflow.name,
//           version: workflow.version,
//           description: workflow.description,
//           createdAt: workflow.createdAt.toISOString(),
//           updatedAt: workflow.updatedAt.toISOString(),
//         },
//         stepCompletionTimes,
//         pendingProcessesByStep,
//         assigneeCompletionTimes,
//         pendingProcesses: {
//           total: pendingProcesses.length,
//           details: pendingProcesses,
//         },
//         queries,
//         signedDocuments,
//         rejectedDocuments,
//         replacedDocuments,
//       },
//     });
//   } catch (error) {
//     console.error("Error in getWorkflowAnalysis:", error);
//     return res.status(500).json({
//       success: false,
//       error: {
//         message: "Failed to analyze workflow",
//         details: error.message,
//         code: "WORKFLOW_ANALYSIS_ERROR",
//       },
//     });
//   }
// };

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
      // Step completion times
      Promise.all(
        workflow.steps.map(async (step) => {
          const stepInstances = await prisma.processStepInstance.findMany({
            where: {
              stepId: step.id,
              status: "APPROVED",
              createdAt: { gte: start, lte: end },
              decisionAt: { not: null },
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
      // Pending processes by step
      Promise.all(
        workflow.steps.map(async (step) => {
          const processes = await prisma.processStepInstance.findMany({
            where: {
              stepId: step.id,
              status: "IN_PROGRESS",
              process: {
                workflowId: workflowId,
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
      // Assignee completion times
      prisma.processStepInstance
        .findMany({
          where: {
            process: {
              workflowId: workflowId,
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
      // Pending processes
      prisma.processInstance
        .findMany({
          where: {
            workflowId: workflowId,
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
      // Queries
      prisma.processQA
        .findMany({
          where: {
            process: { workflowId: workflowId },
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
      // Signed documents
      prisma.documentSignature
        .findMany({
          where: {
            processDocument: {
              process: { workflowId: workflowId },
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
      // Rejected documents
      prisma.documentRejection
        .findMany({
          where: {
            processDocument: {
              process: { workflowId: workflowId },
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
      // Replaced documents
      prisma.documentHistory
        .findMany({
          where: {
            process: { workflowId: workflowId },
            actionType: "REPLACED",
            createdAt: { gte: start, lte: end },
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

import {
  createNotification,
  createQueryNotifications,
} from "./notificationHelper.js";

import { AccessType } from "@prisma/client";

import prisma from "../config/prisma-config.js";

async function updateHighlightsWithContext(
  tx,
  processInstanceId,
  tempContextType,
  contextId,
  contextField,
) {
  await tx.documentHighlight.updateMany({
    where: {
      processInstanceId,
      tempContextType,
      [contextField]: null,
    },
    data: {
      [contextField]: contextId,
      processInstanceId: null,
      tempContextType: null,
    },
  });
}

export const createQuery = async (req, res) => {
  try {
    const {
      processId,
      stepInstanceId,
      queryText,
      documentChanges,
      recirculateFromStepId,
      documentSummaries = [],
      processSummary,
    } = req.body;

    const userData = req.user;

    const query = await prisma.$transaction(async (tx) => {
      const newQuery = await tx.processQuery.create({
        data: {
          processId,
          stepInstanceId,
          raisedById: userData.id,
          queryText,
          status: "OPEN",
          recirculationFromStepId: recirculateFromStepId || null,
        },
        include: {
          process: {
            select: {
              name: true,
              workflow: { select: { name: true } },
            },
          },
        },
      });

      // Update highlights associated with this query
      await updateHighlightsWithContext(
        tx,
        processId,
        "query",
        newQuery.id,
        "queryId",
      );

      if (documentSummaries.length > 0) {
        await tx.queryDocumentSummary.createMany({
          data: documentSummaries.map((summary) => ({
            queryId: newQuery.id,
            documentId: summary.documentId,
            summaryText: summary.summaryText,
          })),
        });
      }

      if (processSummary) {
        await tx.processQuerySummary.create({
          data: {
            queryId: newQuery.id,
            summaryText: processSummary,
          },
        });
      }

      if (documentChanges?.length) {
        await Promise.all(
          documentChanges.map(async (change) => {
            const doc = await tx.processQueryDocument.create({
              data: {
                queryId: newQuery.id,
                documentId: change.documentId,
                uploadedById: userData.id,
                requiresApproval: change.requiresApproval !== false,
                isReplacement: change.isReplacement || false,
                replacesDocumentId: change.replacesDocumentId || null,
              },
            });

            if (doc.requiresApproval) {
              const approvers = await getDocumentApprovers(
                tx,
                processId,
                change.documentId,
                change.replacesDocumentId,
              );
              await tx.queryDocumentApproval.createMany({
                data: approvers.map((approverId) => ({
                  queryDocumentId: doc.id,
                  approverId,
                  approved: false,
                })),
              });
            }
          }),
        );
      }

      if (recirculateFromStepId) {
        const approvers = await getRecirculationApprovers(
          tx,
          processId,
          recirculateFromStepId,
        );
        await tx.queryRecirculationApproval.createMany({
          data: approvers.map((approverId) => ({
            queryId: newQuery.id,
            approverId,
            approved: false,
          })),
        });

        await tx.processQuery.update({
          where: { id: newQuery.id },
          data: { status: "RECIRCULATION_PENDING" },
        });
      }

      await createQueryNotifications(
        tx,
        newQuery.id,
        processId,
        stepInstanceId,
        recirculateFromStepId,
      );

      return await tx.processQuery.findUnique({
        where: { id: newQuery.id },
        include: {
          raisedBy: {
            select: {
              id: true,
              name: true,
              username: true,
              signaturePicFileName: true,
            },
          },
          process: {
            select: {
              id: true,
              name: true,
              workflow: { select: { name: true } },
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
              approvals: {
                include: {
                  approver: {
                    select: {
                      id: true,
                      name: true,
                      username: true,
                    },
                  },
                },
              },
              uploadedBy: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          },
          recirculationApprovals: {
            include: {
              approver: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          },
          documentSummaries: {
            include: {
              document: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          processSummary: true,
          highlights: {
            include: {
              document: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  path: true,
                },
              },
            },
          },
        },
      });
    });

    res.status(201).json({
      success: true,
      data: {
        query,
        message: "Query created successfully",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Query creation failed",
        details: error.message,
        code: "QUERY_CREATION_ERROR",
      },
    });
  }
};

export const createQueryDoubt = async (req, res) => {
  try {
    const { queryId } = req.params;
    const { doubtText } = req.body;
    const userData = req.user;

    const doubt = await prisma.$transaction(async (tx) => {
      const query = await tx.processQuery.findUnique({
        where: { id: queryId, status: "OPEN" },
      });

      if (!query) {
        throw new Error("Query not found or not open");
      }

      const newDoubt = await tx.queryDoubt.create({
        data: {
          queryId,
          raisedById: userData.id,
          doubtText,
        },
        include: {
          raisedBy: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          query: {
            select: {
              raisedBy: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  email: true,
                },
              },
              processId: true,
            },
          },
        },
      });

      // Update highlights associated with this query doubt
      await updateHighlightsWithContext(
        tx,
        query.processId,
        "queryDoubt",
        newDoubt.id,
        "queryDoubtId",
      );

      await createNotification(tx, {
        type: "QUERY_DOUBT",
        userId: query.raisedById,
        queryId,
        doubtId: newDoubt.id,
        metadata: {
          raisedBy: {
            id: userData.id,
            name: userData.name,
            username: userData.username,
          },
          doubtText,
        },
      });

      return newDoubt;
    });

    res.status(201).json({
      success: true,
      data: doubt,
      message: "Query doubt raised successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Failed to raise query doubt",
        details: error.message,
        code: "QUERY_DOUBT_ERROR",
      },
    });
  }
};

export const respondToQueryDoubt = async (req, res) => {
  try {
    const { doubtId } = req.params;
    const { responseText } = req.body;
    const userData = req.user;

    const response = await prisma.$transaction(async (tx) => {
      const doubt = await tx.queryDoubt.findUnique({
        where: { id: doubtId },
        include: {
          raisedBy: true,
          query: {
            select: {
              processId: true,
              raisedById: true,
            },
          },
        },
      });

      if (!doubt) {
        throw new Error("Doubt not found");
      }

      const newResponse = await tx.queryDoubtResponse.create({
        data: {
          doubtId,
          respondedById: userData.id,
          responseText,
        },
        include: {
          respondedBy: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      });

      // Update highlights associated with this query doubt response
      await updateHighlightsWithContext(
        tx,
        doubt.query.processId,
        "queryDoubtResponse",
        newResponse.id,
        "queryDoubtResponseId",
      );

      const notificationRecipient =
        userData.id === doubt.query.raisedById
          ? doubt.raisedById
          : doubt.query.raisedById;

      await createNotification(tx, {
        type: "QUERY_DOUBT_RESPONSE",
        userId: notificationRecipient,
        doubtId,
        responseId: newResponse.id,
        metadata: {
          respondedBy: {
            id: userData.id,
            name: userData.name,
            username: userData.username,
          },
          responseText,
        },
      });

      return newResponse;
    });

    res.status(201).json({
      success: true,
      data: response,
      message: "Doubt response submitted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Failed to respond to doubt",
        details: error.message,
        code: "DOUBT_RESPONSE_ERROR",
      },
    });
  }
};

export const getProcessQueries = async (req, res) => {
  try {
    const { processId } = req.params;
    const userData = req.user;

    const hasAccess = await checkProcessAccess(processId, userData.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Access to process denied",
          code: "PROCESS_ACCESS_DENIED",
        },
      });
    }

    const queries = await prisma.processQuery.findMany({
      where: { processId },
      include: {
        raisedBy: {
          select: {
            id: true,
            name: true,
            username: true,
            signaturePicFileName: true,
          },
        },
        stepInstance: {
          select: {
            id: true,
            workflowStep: {
              select: {
                stepName: true,
                stepNumber: true,
              },
            },
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
            approvals: {
              include: {
                approver: {
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
        responses: {
          include: {
            respondedBy: {
              select: {
                id: true,
                name: true,
                username: true,
                signaturePicFileName: true,
              },
            },
            documentRefs: {
              include: {
                document: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                  },
                },
              },
            },
            highlights: {
              include: {
                document: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    path: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        recirculationApprovals: {
          include: {
            approver: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
          },
        },
        highlights: {
          include: {
            document: {
              select: {
                id: true,
                name: true,
                type: true,
                path: true,
              },
            },
          },
        },
        doubts: {
          include: {
            raisedBy: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
            responses: {
              include: {
                respondedBy: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                  },
                },
                highlights: {
                  include: {
                    document: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        path: true,
                      },
                    },
                  },
                },
              },
            },
            highlights: {
              include: {
                document: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    path: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: {
        queries,
        count: queries.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Failed to get process queries",
        details: error.message,
        code: "QUERY_FETCH_ERROR",
      },
    });
  }
};

export const respondToQuery = async (req, res) => {
  try {
    const { queryId } = req.params;
    const { responseText, documentReferences } = req.body;
    const userData = req.user;

    const response = await prisma.$transaction(async (tx) => {
      const query = await tx.processQuery.findUnique({
        where: { id: queryId },
        include: {
          raisedBy: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
            },
          },
          process: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!query) {
        throw new Error("Query not found");
      }

      const newResponse = await tx.processQueryResponse.create({
        data: {
          queryId,
          respondedById: userData.id,
          responseText,
        },
      });

      // Update highlights associated with this query response
      await updateHighlightsWithContext(
        tx,
        query.process.id,
        "queryResponse",
        newResponse.id,
        "queryResponseId",
      );

      if (documentReferences?.length) {
        await tx.queryDocumentReference.createMany({
          data: documentReferences.map((ref) => ({
            responseId: newResponse.id,
            documentId: ref.documentId,
            pageNumber: ref.pageNumber,
            coordinates: ref.coordinates,
            comments: ref.comments || null,
          })),
        });
      }

      await createNotification(tx, {
        type: "QUERY_RESPONSE",
        userId: query.raisedBy.id,
        queryId,
        metadata: {
          processId: query.process.id,
          processName: query.process.name,
          respondedBy: {
            id: userData.id,
            name: userData.name,
            username: userData.username,
          },
        },
      });

      return await tx.processQueryResponse.findUnique({
        where: { id: newResponse.id },
        include: {
          respondedBy: {
            select: {
              id: true,
              name: true,
              username: true,
              signaturePicFileName: true,
            },
          },
          documentRefs: {
            include: {
              document: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  path: true,
                },
              },
            },
          },
          highlights: {
            include: {
              document: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  path: true,
                },
              },
            },
          },
        },
      });
    });

    res.status(201).json({
      success: true,
      data: {
        response,
        message: "Query response submitted successfully",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Query response failed",
        details: error.message,
        code: "QUERY_RESPONSE_ERROR",
      },
    });
  }
};

export const approveQueryDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { approved, comments } = req.body;
    const userData = req.user;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update approval status
      const approval = await tx.queryDocumentApproval.update({
        where: {
          queryDocumentId_approverId: {
            queryDocumentId: documentId,
            approverId: userData.id,
          },
        },
        data: {
          approved,
          comments: comments || null,
          approvedAt: new Date(),
        },
        include: {
          queryDocument: {
            include: {
              query: {
                select: {
                  processId: true,
                },
              },
            },
          },
        },
      });

      // 2. Check if all approvals are complete
      const doc = await tx.processQueryDocument.findUnique({
        where: { id: documentId },
        include: {
          approvals: true,
          query: true,
        },
      });

      if (doc.approvals.every((a) => a.approved)) {
        // 3. Handle document update based on type
        if (doc.isReplacement && doc.replacesDocumentId) {
          // Replace existing document
          await tx.processDocument.updateMany({
            where: {
              processId: doc.query.processId,
              documentId: doc.replacesDocumentId,
            },
            data: {
              documentId: doc.documentId,
            },
          });

          // Update all signatures to new document
          await tx.documentSignature.updateMany({
            where: {
              processDocument: {
                processId: doc.query.processId,
                documentId: doc.replacesDocumentId,
              },
            },
            data: {
              processDocumentId: (
                await tx.processDocument.findFirst({
                  where: {
                    processId: doc.query.processId,
                    documentId: doc.documentId,
                  },
                  select: { id: true },
                })
              ).id,
            },
          });
        } else {
          // Add new document to process
          await tx.processDocument.create({
            data: {
              processId: doc.query.processId,
              documentId: doc.documentId,
            },
          });
        }

        // 4. Notify document uploader
        await createNotification(tx, {
          type: "DOCUMENT_APPROVAL",
          userId: doc.uploadedById,
          queryId: doc.queryId,
          metadata: {
            documentId: doc.documentId,
            approved: true,
            approvedBy: {
              id: userData.id,
              name: userData.name,
              username: userData.username,
            },
          },
        });
      }

      return approval;
    });

    res.status(200).json({
      success: true,
      data: {
        approval: result,
        message: "Document approval status updated",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Document approval failed",
        details: error.message,
        code: "DOCUMENT_APPROVAL_ERROR",
      },
    });
  }
};

export const approveRecirculation = async (req, res) => {
  try {
    const { queryId } = req.params;
    const { approved, comments } = req.body;
    const userData = req.user;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update approval status
      const approval = await tx.queryRecirculationApproval.update({
        where: {
          queryId_approverId: {
            queryId,
            approverId: userData.id,
          },
        },
        data: {
          approved,
          comments: comments || null,
          approvedAt: new Date(),
        },
        include: {
          query: {
            select: {
              processId: true,
              recirculationFromStepId: true,
            },
          },
        },
      });

      // 2. Check if all approvals are complete
      const query = await tx.processQuery.findUnique({
        where: { id: queryId },
        include: {
          recirculationApprovals: true,
        },
      });

      if (query.recirculationApprovals.every((a) => a.approved)) {
        // 3. Initiate recirculation
        await initiateRecirculation(tx, query);
      }

      return approval;
    });

    res.status(200).json({
      success: true,
      data: {
        approval: result,
        message: "Recirculation approval status updated",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Recirculation approval failed",
        details: error.message,
        code: "RECIRCULATION_APPROVAL_ERROR",
      },
    });
  }
};

// Helper function to initiate recirculation
async function initiateRecirculation(tx, query) {
  // 1. Update query status
  await tx.processQuery.update({
    where: { id: query.id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });

  // 2. Get process details
  const process = await tx.processInstance.findUnique({
    where: { id: query.processId },
    include: {
      workflow: {
        include: {
          steps: {
            include: { assignments: true },
            orderBy: { stepNumber: "asc" },
          },
        },
      },
      documents: true,
    },
  });

  const documentIds = process.documents.map((d) => d.documentId);
  const step = process.workflow.steps.find(
    (s) => s.id === query.recirculationFromStepId,
  );

  // 3. Create new step instances for recirculation
  for (const assignment of step.assignments) {
    await processAssignment(
      tx,
      process,
      step,
      assignment,
      documentIds,
      true,
      query.id,
    );
  }

  // 4. Update process current step
  await tx.processInstance.update({
    where: { id: query.processId },
    data: {
      currentStepId: step.id,
      status: "IN_PROGRESS",
    },
  });

  // 5. Create notifications
  await createRecirculationNotifications(tx, query.processId, step.id);
}

// Helper function to check process access
async function checkProcessAccess(processId, userId) {
  return (
    (await prisma.processStepInstance.count({
      where: {
        processId,
        assignedTo: userId,
      },
    })) > 0
  );
}

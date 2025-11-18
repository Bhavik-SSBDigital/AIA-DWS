import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../utility/verifyUser.js";
const prisma = new PrismaClient();

// Helper function to format timestamp
const formatDate = (date) => {
  return new Date(date).toLocaleString("en-US", { timeZone: "UTC" });
};

// Helper function to get assignment details for a process step instance
async function getAssignmentDetails(stepInstanceId, processId) {
  try {
    // Fetch the ProcessInstance to get the workflow
    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        workflow: { select: { name: true } },
      },
    });

    if (!process) {
      return {
        workflow: "Unknown",
        assignmentType: "Unknown",
        role: "N/A",
        department: "N/A",
      };
    }

    let assignmentType = "Unknown";
    let role = "N/A";
    let department = "N/A";

    let stepInstance = null;
    if (stepInstanceId) {
      stepInstance = await prisma.processStepInstance.findUnique({
        where: { id: stepInstanceId },
        include: {
          workflowAssignment: {
            include: {
              departmentRoles: {
                include: {
                  department: { select: { name: true } },
                  role: { select: { role: true } },
                },
              },
            },
          },
          workflowStep: { select: { stepName: true } },
        },
      });

      console.log("step instance", stepInstance);
    } else {
      // Find the earliest ProcessStepInstance for the process
      stepInstance = await prisma.processStepInstance.findFirst({
        where: { processId },
        include: {
          workflowAssignment: {
            include: {
              departmentRoles: {
                include: {
                  department: { select: { name: true } },
                  role: { select: { role: true } },
                },
              },
            },
          },
          workflowStep: { select: { stepName: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }

    if (stepInstance?.workflowAssignment) {
      assignmentType = stepInstance.workflowAssignment.assigneeType;
      if (assignmentType === "DEPARTMENT") {
        department =
          stepInstance.workflowAssignment.departmentRoles[0]?.department
            ?.name || "N/A";
      } else if (assignmentType === "ROLE") {
        role =
          stepInstance.workflowAssignment.departmentRoles[0]?.role?.role ||
          "N/A";
      } else if (assignmentType === "USER") {
        const user = await prisma.user.findUnique({
          where: { id: stepInstance.assignedTo },
          select: { username: true },
        });
        console.log("user", user);
        role = user?.username || "N/A";
      }
    }

    return {
      workflow: process.workflow?.name || "Unknown",
      assignmentType,
      role,
      department,
    };
  } catch (error) {
    console.error("Error in getAssignmentDetails:", error);
    return {
      workflow: "Unknown",
      assignmentType: "Unknown",
      role: "N/A",
      department: "N/A",
    };
  }
}

// Helper function to get user details
const getUserDetails = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true },
    });
    return user
      ? `${user.name || user.username} (${user.username})`
      : "Unknown User";
  } catch (error) {
    console.error("Error fetching user details:", error);
    return "Unknown User";
  }
};

// Helper function to get document details
const getDocumentDetails = async (documentId) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { name: true, type: true, path: true, tags: true },
    });
    return document
      ? {
          name: document.name,
          type: document.type,
          path: document.path,
          tags: document.tags,
        }
      : { name: "Unknown", type: "Unknown", path: "N/A", tags: [] };
  } catch (error) {
    console.error("Error fetching document details:", error);
    return { name: "Unknown", type: "Unknown", path: "N/A", tags: [] };
  }
};

// Helper function to format path
export const make_path = (path_) => {
  const parts = path_.split("/");
  parts.pop();
  const updatedPath = parts.join("/");
  return updatedPath;
};

export const get_user_activity_log = async (req, res) => {
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

    const { processId, stepInstanceId } = req.params;

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      select: {
        id: true,
        name: true,
        initiatorId: true,
        workflowId: true,
        workflow: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!process) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Process not found",
          details: "Invalid process ID.",
          code: "NOT_FOUND",
        },
      });
    }

    // Helper function to get document versioning (similar to view_process)
    const getDocumentVersioning = async (processId) => {
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
      const allProcessDocuments = processDocuments;

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
              path: doc.document.path.split("/").slice(0, -1).join("/"),
              type: doc.document.type,
              tags: doc.tags,
              reasonOfSupersed: doc.reasonOfSupersed,
              description: doc.description,
              partNumber: doc.partNumber,
              active: doc.document.id === latestDocument?.document?.id,
              isReplacement: doc.isReplacement,
              superseding: doc.superseding,
              reopenCycle: doc.reopenCycle,
              preApproved: doc.preApproved,
            },
          ],
        });
      }

      return documentVersioning;
    };

    // Helper function to get transformed documents (similar to view_process)
    const getTransformedDocuments = async (processId) => {
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

      return transformedDocuments;
    };

    // Get document versioning and transformed documents
    const [documentVersioning, documents] = await Promise.all([
      getDocumentVersioning(processId),
      getTransformedDocuments(processId),
    ]);

    // Fetch workflow details
    const workflow = await prisma.workflow.findUnique({
      where: { id: process.workflowId },
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
    });

    // Collect assignee IDs and role IDs for enrichment
    const departmentIds = new Set();
    const roleIds = new Set();
    const userIds = new Set();
    const selectedRoleIds = new Set();

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
        assignment.selectedRoles.forEach((roleId) =>
          selectedRoleIds.add(roleId)
        );
      });
    });

    // Fetch related entities
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

    // Enrich workflow data
    const enrichedWorkflow = {
      id: workflow.id,
      version: workflow.version,
      description: workflow.description,
      createdBy: workflow.createdBy,
      createdAt: workflow.createdAt,
      steps: workflow.steps.map((step) => ({
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        allowParallel: step.allowParallel,
        requiresDocument: step.requiresDocument,
        assignments: step.assignments.map((a) => ({
          assigneeType: a.assigneeType,
          assigneeIds: a.assigneeIds.map((id) => {
            let name = "Unknown";
            switch (a.assigneeType) {
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
          actionType: a.actionType,
          accessTypes: a.accessTypes,
          direction: a.direction,
          allowParallel: a.allowParallel,
          selectedRoles: a.selectedRoles.map((roleId) => ({
            id: roleId,
            name: selectedRoleMap.get(roleId) || "Unknown Role",
          })),
        })),
      })),
    };

    let stepInstance = null;
    let timeStart = new Date(0);
    let timeEnd = new Date();

    if (stepInstanceId) {
      stepInstance = await prisma.processStepInstance.findUnique({
        where: { id: stepInstanceId },
        include: {
          process: { select: { id: true } },
          workflowStep: { select: { stepName: true, stepNumber: true } },
        },
      });

      if (!stepInstance || stepInstance.process.id !== processId) {
        return res.status(404).json({
          success: false,
          error: {
            message: "Step instance not found",
            details: "Invalid step instance ID or process ID.",
            code: "NOT_FOUND",
          },
        });
      }

      timeStart = stepInstance.createdAt;
      timeEnd = stepInstance.decisionAt || new Date();
    }

    const allStepInstances = await prisma.processStepInstance.findMany({
      where: { processId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        decisionAt: true,
        assignedTo: true,
        workflowStep: {
          select: {
            stepName: true,
            stepNumber: true,
          },
        },
      },
    });

    const findStepForTime = (timestamp) => {
      const time = new Date(timestamp);
      for (let i = 0; i < allStepInstances.length; i++) {
        const step = allStepInstances[i];
        const start = new Date(step.createdAt);
        const nextStart = allStepInstances[i + 1]
          ? new Date(allStepInstances[i + 1].createdAt)
          : new Date();
        const end = step.decisionAt ? new Date(step.decisionAt) : nextStart;
        if (start <= time && time < end) {
          return {
            stepInstanceId: step.id,
            stepName: step.workflowStep.stepName,
            stepNumber: step.workflowStep.stepNumber,
          };
        }
      }
      return {
        stepInstanceId: null,
        stepName: "N/A",
        stepNumber: null,
      };
    };

    const userStepInstances = await prisma.processStepInstance.findMany({
      where: {
        processId,
        assignedTo: userData.id,
      },
      select: {
        id: true,
        createdAt: true,
        decisionAt: true,
        status: true,
        workflowStep: { select: { stepName: true, stepNumber: true } },
      },
    });

    const [
      documentSignatures,
      documentRejections,
      processDocuments,
      processQAs,
      recommendations,
      processInstance,
    ] = await Promise.all([
      prisma.documentSignature.findMany({
        where: {
          processDocument: { processId },
          userId: userData.id,
          signedAt: { gte: timeStart, lte: timeEnd },
        },
        include: {
          processDocument: {
            include: {
              document: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  path: true,
                  tags: true,
                },
              },
            },
          },
          user: { select: { id: true, username: true } },
          processStepInstance: {
            select: {
              workflowStep: { select: { stepName: true, stepNumber: true } },
            },
          },
        },
      }),
      prisma.documentRejection.findMany({
        where: {
          processDocument: { processId },
          userId: userData.id,
          rejectedAt: { gte: timeStart, lte: timeEnd },
        },
        include: {
          processDocument: {
            include: {
              document: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  path: true,
                  tags: true,
                },
              },
            },
          },
          user: { select: { id: true, username: true } },
          processStepInstance: {
            select: {
              workflowStep: { select: { stepName: true, stepNumber: true } },
            },
          },
        },
      }),
      prisma.processDocument.findMany({
        where: {
          processId,
          document: {
            createdById: userData.id,
            createdOn: { gte: timeStart, lte: timeEnd },
          },
        },
        include: {
          document: {
            select: {
              id: true,
              name: true,
              type: true,
              path: true,
              tags: true,
              createdById: true,
              createdOn: true,
            },
          },
        },
      }),
      prisma.processQA.findMany({
        where: {
          processId,
          createdAt: { gte: timeStart, lte: timeEnd },
        },
        include: {
          initiator: { select: { id: true, name: true } },
          stepInstance: {
            include: {
              workflowStep: { select: { stepName: true, stepNumber: true } },
            },
          },
        },
      }),
      prisma.recommendation.findMany({
        where: {
          processId,
          createdAt: { gte: timeStart, lte: timeEnd },
        },
        include: {
          initiator: { select: { id: true, username: true } },
          recommender: { select: { id: true, username: true } },
          process: { select: { id: true, name: true } },
          stepInstance: {
            include: {
              workflowStep: { select: { stepName: true, stepNumber: true } },
            },
          },
        },
      }),
      prisma.processInstance.findFirst({
        where: { id: processId, initiatorId: userData.id },
        select: {
          id: true,
          name: true,
          createdAt: true,
          initiator: { select: { username: true, id: true } },
        },
      }),
    ]);

    const activities = [].concat(
      ...(processInstance
        ? [
            {
              actionType: "PROCESS_INITIATED",
              description: `You initiated the process "${processInstance.name}"`,
              createdAt: processInstance.createdAt.toISOString(),
              details: {
                processId: processInstance.id,
                processName: processInstance.name,
                initiatorName: await getUserDetails(
                  processInstance.initiator.id
                ),
                workflow: process.workflow?.name || "N/A",
                assignmentType: "N/A",
                role: "N/A",
                department: "N/A",
                stepInstanceId: null,
                stepName: "Process Initiation",
                stepNumber: null,
              },
            },
          ]
        : []),
      ...(await Promise.all(
        processDocuments.map(async (pd) => {
          const documentDetails = await getDocumentDetails(pd.documentId);
          const stepInfo = findStepForTime(pd.document.createdOn);
          const assignmentDetails = await getAssignmentDetails(
            stepInfo.stepInstanceId,
            pd.processId
          );
          return {
            actionType: "DOCUMENT_UPLOADED",
            description: `You uploaded the document "${documentDetails.name}"`,
            createdAt: pd.document.createdOn.toISOString(),
            details: {
              documentId: pd.documentId,
              name: documentDetails.name,
              type: documentDetails.type,
              path: make_path(documentDetails.path),
              tags: documentDetails.tags,
              uploadedBy: await getUserDetails(pd.document.createdById),
              stepInstanceId: stepInfo.stepInstanceId,
              stepName: stepInfo.stepName || "N/A",
              stepNumber: stepInfo.stepNumber || null,
              workflow: assignmentDetails.workflow || "N/A",
              assignmentType: assignmentDetails.assignmentType || "N/A",
              role: assignmentDetails.role || "N/A",
              department: assignmentDetails.department || "N/A",
            },
          };
        })
      )),
      ...(await Promise.all(
        documentSignatures.map(async (sig) => {
          const documentDetails = await getDocumentDetails(
            sig.processDocument.documentId
          );
          const assignmentDetails = await getAssignmentDetails(
            sig.processStepInstanceId,
            sig.processDocument.processId
          );
          return {
            actionType: "DOCUMENT_SIGNED",
            description: `You signed the document "${
              documentDetails.name
            }" during step "${
              sig.processStepInstance?.workflowStep?.stepName || "N/A"
            }"`,
            createdAt: sig.signedAt.toISOString(),
            details: {
              documentId: sig.processDocument.documentId,
              name: documentDetails.name,
              type: documentDetails.type,
              path: make_path(documentDetails.path),
              tags: documentDetails.tags,
              signedBy: await getUserDetails(sig.userId),
              signedAt: sig.signedAt.toISOString(),
              remarks: sig.reason || null,
              byRecommender: sig.byRecommender,
              isAttachedWithRecommendation: sig.isAttachedWithRecommendation,
              stepInstanceId: sig.processStepInstanceId || null,
              stepName:
                sig.processStepInstance?.workflowStep?.stepName || "N/A",
              stepNumber:
                sig.processStepInstance?.workflowStep?.stepNumber || null,
              workflow: assignmentDetails.workflow || "N/A",
              assignmentType: assignmentDetails.assignmentType || "N/A",
              role: assignmentDetails.role || "N/A",
              department: assignmentDetails.department || "N/A",
            },
          };
        })
      )),
      ...(await Promise.all(
        documentRejections.map(async (dr) => {
          const documentDetails = await getDocumentDetails(
            dr.processDocument.documentId
          );
          const assignmentDetails = await getAssignmentDetails(
            dr.processStepInstanceId,
            dr.processDocument.processId
          );
          return {
            actionType: "DOCUMENT_REJECTED",
            description: `You rejected the document "${
              documentDetails.name
            }" during step "${
              dr.processStepInstance?.workflowStep?.stepName || "N/A"
            }" with reason: "${dr.reason || "No reason provided"}"`,
            createdAt: dr.rejectedAt.toISOString(),
            details: {
              documentId: dr.processDocument.documentId,
              name: documentDetails.name,
              type: documentDetails.type,
              path: make_path(documentDetails.path),
              tags: documentDetails.tags,
              rejectedBy: await getUserDetails(dr.userId),
              rejectionReason: dr.reason || null,
              rejectedAt: dr.rejectedAt.toISOString(),
              byRecommender: dr.byRecommender,
              isAttachedWithRecommendation: dr.isAttachedWithRecommendation,
              stepInstanceId: dr.processStepInstanceId || null,
              stepName: dr.processStepInstance?.workflowStep?.stepName || "N/A",
              stepNumber:
                dr.processStepInstance?.workflowStep?.stepNumber || null,
              workflow: assignmentDetails.workflow || "N/A",
              assignmentType: assignmentDetails.assignmentType || "N/A",
              role: assignmentDetails.role || "N/A",
              department: assignmentDetails.department || "N/A",
            },
          };
        })
      )),
      ...(
        await Promise.all(
          processQAs.map(async (qa) => {
            const assignmentDetails = await getAssignmentDetails(
              qa.stepInstanceId,
              qa.processId
            );
            const initiatorDetails = await getUserDetails(qa.initiatorId);
            const entityDetails = await getUserDetails(qa.entityId);
            const actions = [];

            if (qa.initiatorId === userData.id) {
              actions.push({
                actionType: "QUERY_RAISED",
                description: `You raised a query: "${
                  qa.question
                }" during step "${
                  qa.stepInstance?.workflowStep?.stepName || "N/A"
                }"`,
                createdAt: qa.createdAt.toISOString(),
                details: {
                  stepInstanceId: qa.stepInstanceId || null,
                  stepName: qa.stepInstance?.workflowStep?.stepName || "N/A",
                  stepNumber: qa.stepInstance?.workflowStep?.stepNumber || null,
                  status: qa.status,
                  queryText: qa.question,
                  initiatorName: initiatorDetails,
                  entityName: entityDetails,
                  createdAt: qa.createdAt.toISOString(),
                  workflow: assignmentDetails.workflow || "N/A",
                  assignmentType: assignmentDetails.assignmentType || "N/A",
                  role: assignmentDetails.role || "N/A",
                  department: assignmentDetails.department || "N/A",
                },
              });
            }

            if (qa.entityId === userData.id && qa.status === "RESOLVED") {
              actions.push({
                actionType: "QUERY_RESOLVED",
                description: `You resolved the query: "${
                  qa.question
                }" during step "${
                  qa.stepInstance?.workflowStep?.stepName || "N/A"
                }" with answer: "${qa.answer || "No answer provided"}"`,
                createdAt:
                  qa.answeredAt?.toISOString() || qa.createdAt.toISOString(),
                details: {
                  stepInstanceId: qa.stepInstanceId || null,
                  stepName: qa.stepInstance?.workflowStep?.stepName || "N/A",
                  stepNumber: qa.stepInstance?.workflowStep?.stepNumber || null,
                  status: qa.status,
                  queryText: qa.question,
                  initiatorName: initiatorDetails,
                  entityName: entityDetails,
                  createdAt: qa.createdAt.toISOString(),
                  answerText: qa.answer || null,
                  answeredAt: qa.answeredAt?.toISOString() || null,
                  workflow: assignmentDetails.workflow || "N/A",
                  assignmentType: assignmentDetails.assignmentType || "N/A",
                  role: assignmentDetails.role || "N/A",
                  department: assignmentDetails.department || "N/A",
                },
              });
            }

            return actions;
          })
        )
      ).flat(),
      ...(
        await Promise.all(
          recommendations.map(async (rec) => {
            const assignmentDetails = await getAssignmentDetails(
              rec.stepInstanceId,
              rec.processId
            );
            const initiatorDetails = await getUserDetails(rec.initiatorId);
            const recommenderDetails = await getUserDetails(rec.recommenderId);
            const documentSummaries = rec.documentSummaries || [];
            const documentResponses = rec.details?.documentResponses || [];
            const documentIds = documentSummaries.map((ds) =>
              parseInt(ds.documentId)
            );
            const documents = documentIds.length
              ? await prisma.document.findMany({
                  where: { id: { in: documentIds } },
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    path: true,
                    tags: true,
                  },
                })
              : [];

            const documentMap = documents.reduce((map, doc) => {
              map[doc.id] = {
                name: doc.name,
                type: doc.type,
                path: make_path(doc.path),
                tags: doc.tags,
              };
              return map;
            }, {});

            const documentDetails = documentSummaries.map((ds) => {
              const response = documentResponses.find(
                (dr) => dr.documentId === parseInt(ds.documentId)
              );
              return {
                documentId: ds.documentId,
                documentName:
                  documentMap[ds.documentId]?.name || "Unknown Document",
                documentType: documentMap[ds.documentId]?.type || "Unknown",
                documentPath: documentMap[ds.documentId]?.path || "N/A",
                tags: documentMap[ds.documentId]?.tags || [],
                queryText: ds.queryText,
                answerText: response?.answerText || null,
                requiresApproval: ds.requiresApproval,
              };
            });

            const actions = [];

            if (rec.initiatorId === userData.id) {
              actions.push({
                actionType: "RECOMMENDATION_REQUESTED",
                description: `You requested a recommendation: "${
                  rec.recommendationText
                }" during step "${
                  rec.stepInstance?.workflowStep?.stepName || "N/A"
                }"`,
                createdAt: rec.createdAt.toISOString(),
                details: {
                  recommendationId: rec.id,
                  processId: rec.processId,
                  processName: rec.process.name,
                  stepInstanceId: rec.stepInstanceId || null,
                  stepName: rec.stepInstance?.workflowStep?.stepName || "N/A",
                  stepNumber:
                    rec.stepInstance?.workflowStep?.stepNumber || null,
                  status: rec.status,
                  recommendationText: rec.recommendationText,
                  initiatorName: initiatorDetails,
                  recommenderName: recommenderDetails,
                  createdAt: rec.createdAt.toISOString(),
                  responseText: rec.responseText || null,
                  respondedAt: rec.respondedAt
                    ? rec.respondedAt.toISOString()
                    : null,
                  documentDetails,
                  documentResponses: documentResponses || [],
                  workflow: assignmentDetails.workflow || "N/A",
                  assignmentType: assignmentDetails.assignmentType || "N/A",
                  role: assignmentDetails.role || "N/A",
                  department: assignmentDetails.department || "N/A",
                },
              });
            }

            if (
              rec.recommenderId === userData.id &&
              rec.status === "RESOLVED"
            ) {
              actions.push({
                actionType: "RECOMMENDATION_PROVIDED",
                description: `You provided a recommendation: "${
                  rec.responseText || "No response provided"
                }" during step "${
                  rec.stepInstance?.workflowStep?.stepName || "N/A"
                }"`,
                createdAt:
                  rec.respondedAt?.toISOString() || rec.createdAt.toISOString(),
                details: {
                  recommendationId: rec.id,
                  processId: rec.processId,
                  processName: rec.process.name,
                  stepInstanceId: rec.stepInstanceId || null,
                  stepName: rec.stepInstance?.workflowStep?.stepName || "N/A",
                  stepNumber:
                    rec.stepInstance?.workflowStep?.stepNumber || null,
                  status: rec.status,
                  recommendationText: rec.recommendationText,
                  initiatorName: initiatorDetails,
                  recommenderName: recommenderDetails,
                  createdAt: rec.createdAt.toISOString(),
                  responseText: rec.responseText || null,
                  respondedAt: rec.respondedAt
                    ? rec.respondedAt.toISOString()
                    : null,
                  documentDetails,
                  documentResponses: documentResponses || [],
                  workflow: assignmentDetails.workflow || "N/A",
                  assignmentType: assignmentDetails.assignmentType || "N/A",
                  role: assignmentDetails.role || "N/A",
                  department: assignmentDetails.department || "N/A",
                },
              });
            }

            return actions;
          })
        )
      ).flat(),
      ...(
        await Promise.all(
          userStepInstances.map(async (step) => {
            if (step.decisionAt) {
              const assignmentDetails = await getAssignmentDetails(
                step.id,
                processId
              );
              return {
                actionType: "STEP_COMPLETED",
                description: `You completed the step "${
                  step.workflowStep?.stepName || "Unknown"
                }" with status "${step.status}"`,
                createdAt: step.decisionAt.toISOString(),
                details: {
                  stepInstanceId: step.id,
                  stepName: step.workflowStep?.stepName || "Unknown",
                  stepNumber: step.workflowStep?.stepNumber || null,
                  completedBy: await getUserDetails(userData.id),
                  status: step.status,
                  decisionComment: step.decisionComment || null,
                  workflow: assignmentDetails.workflow || "N/A",
                  assignmentType: assignmentDetails.assignmentType || "N/A",
                  role: assignmentDetails.role || "N/A",
                  department: assignmentDetails.department || "N/A",
                },
              };
            }
            return null;
          })
        )
      ).filter(Boolean)
    );

    const sortedActivities = activities
      .filter(Boolean)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (sortedActivities.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: "No activities found",
          details: "User has no recorded actions in this process or step.",
          code: "NO_ACTIVITIES",
        },
      });
    }

    return res.status(200).json({
      success: true,
      process: {
        processId,
        processName: process.name,
        processStepInstanceId: stepInstanceId || null,
        stepName: stepInstance?.workflowStep?.stepName || null,
        recirculationCycle: stepInstance?.recirculationCycle || 0,
        workflow: enrichedWorkflow,
        activities: sortedActivities,
        isInitiator: process.initiatorId === userData.id,
        documentVersioning,
        documents,
      },
    });
  } catch (error) {
    console.error("Error in get_user_activity_log:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to fetch user activity log",
        details: error.message,
        code: "ACTIVITY_LOG_ERROR",
      },
    });
  }
};

export const get_user_activity_logs = async (req, res) => {
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

    const [
      stepInstances,
      recommenderProcesses,
      queryProcesses,
      initiatedProcesses,
    ] = await Promise.all([
      prisma.processStepInstance.findMany({
        where: {
          assignedTo: userData.id,
        },
        include: {
          process: { select: { id: true, name: true } },
          workflowStep: { select: { stepName: true, stepNumber: true } },
        },
      }),
      prisma.recommendation.findMany({
        where: {
          OR: [{ initiatorId: userData.id }, { recommenderId: userData.id }],
        },
        select: {
          processId: true,
          process: { select: { id: true, name: true } },
        },
      }),
      prisma.processQA.findMany({
        where: {
          OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
        },
        select: {
          processId: true,
          process: { select: { id: true, name: true } },
        },
      }),
      prisma.processInstance.findMany({
        where: { initiatorId: userData.id },
        select: { id: true, name: true },
      }),
    ]);

    const allProcessIds = [
      ...new Set([
        ...stepInstances.map((s) => s.processId),
        ...recommenderProcesses.map((r) => r.processId),
        ...queryProcesses.map((q) => q.processId),
        ...initiatedProcesses.map((p) => p.id),
      ]),
    ];

    const logs = await Promise.all(
      allProcessIds.map(async (processId) => {
        const process = await prisma.processInstance.findUnique({
          where: { id: processId },
          select: {
            id: true,
            name: true,
            createdAt: true,
            initiator: { select: { username: true } },
            workflow: { select: { name: true } },
          },
        });

        if (!process) return null;

        const userSteps = stepInstances.filter(
          (s) => s.processId === processId
        );

        const [
          signatureCount,
          rejectionCount,
          documentCount,
          queryCount,
          recommendationCount,
          initiated,
        ] = await Promise.all([
          prisma.documentSignature.count({
            where: {
              processDocument: { processId },
              userId: userData.id,
            },
          }),
          prisma.documentRejection.count({
            where: {
              processDocument: { processId },
              userId: userData.id,
            },
          }),
          prisma.processDocument.count({
            where: {
              processId,
              document: {
                createdById: userData.id,
              },
            },
          }),
          prisma.processQA.count({
            where: {
              processId,
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
            },
          }),
          prisma.recommendation.count({
            where: {
              processId,
              OR: [
                { initiatorId: userData.id },
                { recommenderId: userData.id },
              ],
            },
          }),
          prisma.processInstance.findFirst({
            where: { id: processId, initiatorId: userData.id },
            select: { id: true },
          }),
        ]);

        const hasActivity =
          signatureCount > 0 ||
          rejectionCount > 0 ||
          documentCount > 0 ||
          queryCount > 0 ||
          recommendationCount > 0 ||
          initiated ||
          userSteps.length > 0;

        if (!hasActivity) return null;

        const steps = userSteps.length
          ? await Promise.all(
              userSteps.map(async (s) => {
                const assignmentDetails = await getAssignmentDetails(
                  s.id,
                  processId
                );
                return {
                  stepInstanceId: s.id,
                  stepName: s.workflowStep?.stepName || "Unknown Step",
                  stepNumber: s.workflowStep?.stepNumber || 0,
                  recirculationCycle: s.recirculationCycle || 0,
                  status: s.status,
                  workflow: assignmentDetails.workflow || "Unknown Workflow",
                  assignmentType: assignmentDetails.assignmentType || "Unknown",
                  role: assignmentDetails.role || "Unknown",
                  department: assignmentDetails.department || "Unknown",
                };
              })
            )
          : [];

        const lastActivities = await Promise.all([
          prisma.documentSignature.findFirst({
            where: {
              processDocument: { processId },
              userId: userData.id,
            },
            orderBy: { signedAt: "desc" },
            select: { signedAt: true },
          }),
          prisma.documentRejection.findFirst({
            where: {
              processDocument: { processId },
              userId: userData.id,
            },
            orderBy: { rejectedAt: "desc" },
            select: { rejectedAt: true },
          }),
          prisma.processDocument.findFirst({
            where: {
              processId,
              document: { createdById: userData.id },
            },
            orderBy: { document: { createdOn: "desc" } },
            select: { document: { select: { createdOn: true } } },
          }),
          prisma.processQA.findFirst({
            where: {
              processId,
              OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
            },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
          prisma.recommendation.findFirst({
            where: {
              processId,
              OR: [
                { initiatorId: userData.id },
                { recommenderId: userData.id },
              ],
            },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
          prisma.processInstance.findFirst({
            where: {
              id: processId,
              initiatorId: userData.id,
            },
            select: { createdAt: true },
          }),
        ]);

        const timestamps = lastActivities
          .flatMap((activity) => {
            if (!activity) return [];
            return [
              activity.signedAt ||
                activity.rejectedAt ||
                (activity.document
                  ? activity.document.createdOn
                  : activity.createdAt),
            ].filter(Boolean);
          })
          .map((date) => new Date(date));

        const lastActivityAt =
          timestamps.length > 0
            ? new Date(Math.max(...timestamps)).toISOString()
            : process.createdAt.toISOString();

        return {
          processId: process.id,
          processName: process.name,
          initiatorName: process.initiator.username || "Unknown",
          createdAt: process.createdAt.toISOString(),
          steps,
          actionSummary: {
            signatures: signatureCount,
            rejections: rejectionCount,
            documents: documentCount,
            queries: queryCount,
            recommendations: recommendationCount,
            initiated: initiated ? 1 : 0,
          },
          lastActivityAt,
        };
      })
    );

    const validLogs = logs
      .filter((log) => log !== null)
      .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));

    if (validLogs.length === 0) {
      return res.status(200).json({
        success: true,
        logs: [],
        message: "No activity logs found for the user",
      });
    }

    return res.status(200).json({
      success: true,
      logs: validLogs,
    });
  } catch (error) {
    console.error("Error fetching user activity logs:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to fetch user activity logs",
        details: error.message,
        code: "ACTIVITY_LOGS_ERROR",
      },
    });
  }
};

export const get_process_activity_logs = async (req, res) => {
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

    const { processId, stepInstanceId } = req.params;

    const process = await prisma.processInstance.findUnique({
      where: { id: processId },
      include: {
        workflow: { select: { name: true } },
        initiator: true,
      },
    });

    if (!process) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Process not found",
          details: "Invalid process ID.",
          code: "NOT_FOUND",
        },
      });
    }

    // Fetch workflow details
    const workflow = await prisma.workflow.findUnique({
      where: { id: process.workflowId },
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
    });

    // Collect assignee IDs and role IDs for enrichment
    const departmentIds = new Set();
    const roleIds = new Set();
    const userIds = new Set();
    const selectedRoleIds = new Set();

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
        assignment.selectedRoles.forEach((roleId) =>
          selectedRoleIds.add(roleId)
        );
      });
    });

    // Fetch related entities
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
        select: { id: true, username: true, name: true },
      }),
      prisma.role.findMany({
        where: { id: { in: Array.from(selectedRoleIds) } },
        select: { id: true, role: true },
      }),
    ]);

    // Create lookup maps
    const departmentMap = new Map(departments.map((d) => [d.id, d.name]));
    const roleMap = new Map(roles.map((r) => [r.id, r.role]));
    const userMap = new Map(
      users.map((u) => [u.id, { username: u.username, name: u.name }])
    );
    const selectedRoleMap = new Map(selectedRoles.map((r) => [r.id, r.role]));

    // Enrich workflow data
    const enrichedWorkflow = {
      id: workflow.id,
      version: workflow.version,
      description: workflow.description,
      createdBy: workflow.createdBy,
      createdAt: workflow.createdAt,
      steps: workflow.steps.map((step) => ({
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        allowParallel: step.allowParallel,
        requiresDocument: step.requiresDocument,
        assignments: step.assignments.map((a) => ({
          assigneeType: a.assigneeType,
          assigneeIds: a.assigneeIds.map((id) => {
            let name = "Unknown";
            switch (a.assigneeType) {
              case "DEPARTMENT":
                name = departmentMap.get(id) || "Unknown Department";
                break;
              case "ROLE":
                name = roleMap.get(id) || "Unknown Role";
                break;
              case "USER":
                const user = userMap.get(id);
                name = user
                  ? user.name || user.username || "Unknown User"
                  : "Unknown User";
                break;
            }
            return { id, name };
          }),
          actionType: a.actionType,
          accessTypes: a.accessTypes,
          direction: a.direction,
          allowParallel: a.allowParallel,
          selectedRoles: a.selectedRoles.map((roleId) => ({
            id: roleId,
            name: selectedRoleMap.get(roleId) || "Unknown Role",
          })),
        })),
      })),
    };

    let stepInstance = null;
    let timeStart = new Date(0);
    let timeEnd = new Date();

    if (stepInstanceId) {
      stepInstance = await prisma.processStepInstance.findUnique({
        where: { id: stepInstanceId },
        include: {
          process: { select: { id: true } },
          workflowStep: { select: { stepName: true, stepNumber: true } },
        },
      });

      if (!stepInstance || stepInstance.processId !== processId) {
        return res.status(404).json({
          success: false,
          error: {
            message: "Step instance not found",
            details: "Invalid step instance ID or process ID.",
            code: "NOT_FOUND",
          },
        });
      }

      timeStart = stepInstance.createdAt;
      timeEnd = stepInstance.decisionAt || new Date();
    }

    const allStepInstances = await prisma.processStepInstance.findMany({
      where: { processId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        decisionAt: true,
        assignedTo: true,
        workflowStep: {
          select: {
            stepName: true,
            stepNumber: true,
          },
        },
      },
    });

    const findStepForTime = (timestamp) => {
      const time = new Date(timestamp);
      for (let i = 0; i < allStepInstances.length; i++) {
        const step = allStepInstances[i];
        const start = new Date(step.createdAt);
        const nextStart = allStepInstances[i + 1]
          ? new Date(allStepInstances[i + 1].createdAt)
          : new Date();
        const end = step.decisionAt ? new Date(step.decisionAt) : nextStart;
        if (start <= time && time < end) {
          return {
            stepInstanceId: step.id,
            stepName: step.workflowStep.stepName,
            stepNumber: step.workflowStep.stepNumber,
          };
        }
      }
      return {
        stepInstanceId: null,
        stepName: "N/A",
        stepNumber: null,
      };
    };

    const stepInstancesAll = await prisma.processStepInstance.findMany({
      where: { processId },
      select: {
        id: true,
        createdAt: true,
        decisionAt: true,
        status: true,
        workflowStep: { select: { stepName: true, stepNumber: true } },
        assignedTo: true,
      },
    });

    // Pre-fetch all users that might be needed
    const allUserIds = new Set();

    // Add initiator
    if (process.initiatorId) allUserIds.add(process.initiatorId);

    // Add assigned users from step instances
    stepInstancesAll.forEach((step) => {
      if (step.assignedTo) allUserIds.add(step.assignedTo);
    });

    const allUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(allUserIds) } },
      select: { id: true, username: true, name: true },
    });

    const allUserMap = new Map(allUsers.map((u) => [u.id, u]));

    // Helper function to get user details (maintaining original format)
    const getUserDetails = async (userId) => {
      if (!userId) return "Unknown User";

      const user = allUserMap.get(userId);
      if (user) {
        return user.name ? `${user.name} (${user.username})` : user.username;
      }

      // Fallback: fetch user if not in pre-fetched map
      try {
        const fetchedUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, name: true },
        });

        if (fetchedUser) {
          allUserMap.set(userId, fetchedUser);
          return fetchedUser.name
            ? `${fetchedUser.name} (${fetchedUser.username})`
            : fetchedUser.username;
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }

      return "Unknown User";
    };

    // Helper function to get document details
    const getDocumentDetails = async (documentId) => {
      try {
        const document = await prisma.document.findUnique({
          where: { id: documentId },
          select: { id: true, name: true, type: true, path: true, tags: true },
        });
        return (
          document || {
            id: documentId,
            name: "Unknown Document",
            type: "unknown",
            path: "",
            tags: [],
          }
        );
      } catch (error) {
        console.error("Error fetching document:", error);
        return {
          id: documentId,
          name: "Unknown Document",
          type: "unknown",
          path: "",
          tags: [],
        };
      }
    };

    // Helper function to get assignment details
    const getAssignmentDetails = async (stepInstanceId, processId) => {
      if (!stepInstanceId) {
        return {
          workflow: process.workflow?.name || "N/A",
          assignmentType: "N/A",
          role: "N/A",
          department: "N/A",
        };
      }

      try {
        const stepInstance = await prisma.processStepInstance.findUnique({
          where: { id: stepInstanceId },
          include: {
            workflowStep: {
              select: { stepName: true },
            },
            workflowAssignment: {
              select: {
                assigneeType: true,
                assigneeIds: true,
              },
            },
          },
        });

        if (!stepInstance) {
          return {
            workflow: process.workflow?.name || "N/A",
            assignmentType: "N/A",
            role: "N/A",
            department: "N/A",
          };
        }

        let assignmentType =
          stepInstance.workflowAssignment?.assigneeType || "N/A";
        let role = "N/A";
        let department = "N/A";

        if (
          assignmentType === "USER" &&
          stepInstance.workflowAssignment?.assigneeIds?.length > 0
        ) {
          const userId = stepInstance.workflowAssignment.assigneeIds[0];
          role = await getUserDetails(userId);
        } else if (
          assignmentType === "ROLE" &&
          stepInstance.workflowAssignment?.assigneeIds?.length > 0
        ) {
          const roleId = stepInstance.workflowAssignment.assigneeIds[0];
          try {
            const roleData = await prisma.role.findUnique({
              where: { id: roleId },
              select: { role: true },
            });
            role = roleData?.role || "Unknown Role";
          } catch (error) {
            role = "Unknown Role";
          }
        } else if (
          assignmentType === "DEPARTMENT" &&
          stepInstance.workflowAssignment?.assigneeIds?.length > 0
        ) {
          const deptId = stepInstance.workflowAssignment.assigneeIds[0];
          try {
            const deptData = await prisma.department.findUnique({
              where: { id: deptId },
              select: { name: true },
            });
            department = deptData?.name || "Unknown Department";
          } catch (error) {
            department = "Unknown Department";
          }
        }

        return {
          workflow: process.workflow?.name || "N/A",
          assignmentType,
          role,
          department,
        };
      } catch (error) {
        console.error("Error fetching assignment details:", error);
        return {
          workflow: process.workflow?.name || "N/A",
          assignmentType: "N/A",
          role: "N/A",
          department: "N/A",
        };
      }
    };

    const [
      documentSignatures,
      documentRejections,
      processDocuments,
      processQAs,
      recommendations,
      processInstanceData,
    ] = await Promise.all([
      prisma.documentSignature.findMany({
        where: {
          processDocument: { processId },
          signedAt: { gte: timeStart, lte: timeEnd },
        },
        include: {
          processDocument: {
            include: {
              document: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  path: true,
                  tags: true,
                },
              },
            },
          },
          user: { select: { id: true, username: true, name: true } },
          processStepInstance: {
            include: {
              workflowStep: { select: { stepName: true, stepNumber: true } },
            },
          },
        },
      }),
      prisma.documentRejection.findMany({
        where: {
          processDocument: { processId },
          rejectedAt: { gte: timeStart, lte: timeEnd },
        },
        include: {
          processDocument: {
            include: {
              document: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  path: true,
                  tags: true,
                },
              },
            },
          },
          user: { select: { id: true, username: true, name: true } },
          processStepInstance: {
            include: {
              workflowStep: { select: { stepName: true, stepNumber: true } },
            },
          },
        },
      }),
      prisma.processDocument.findMany({
        where: {
          processId,
          document: { createdOn: { gte: timeStart, lte: timeEnd } },
        },
        include: {
          document: {
            select: {
              id: true,
              name: true,
              type: true,
              path: true,
              tags: true,
              createdById: true,
              createdOn: true,
            },
          },
          rejectedBy: { select: { id: true, username: true, name: true } },
        },
      }),
      prisma.processQA.findMany({
        where: {
          processId,
          createdAt: { gte: timeStart, lte: timeEnd },
        },
        include: {
          initiator: { select: { id: true, username: true, name: true } },
          stepInstance: {
            include: {
              workflowStep: { select: { stepName: true, stepNumber: true } },
            },
          },
        },
      }),
      prisma.recommendation.findMany({
        where: {
          processId,
          createdAt: { gte: timeStart, lte: timeEnd },
        },
        include: {
          initiator: { select: { id: true, username: true, name: true } },
          recommender: { select: { id: true, username: true, name: true } },
          process: { select: { id: true, name: true } },
          stepInstance: {
            include: {
              workflowStep: { select: { stepName: true, stepNumber: true } },
            },
          },
        },
      }),
      prisma.processInstance.findFirst({
        where: { id: processId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          initiator: { select: { id: true, username: true, name: true } },
        },
      }),
    ]);

    const activities = [].concat(
      ...(processInstanceData
        ? [
            {
              actionType: "PROCESS_INITIATED",
              description: `Process "${
                processInstanceData.name
              }" was initiated by ${
                processInstanceData.initiator.name ||
                processInstanceData.initiator.username ||
                "Unknown User"
              }`,
              createdAt: processInstanceData.createdAt.toISOString(),
              details: {
                processId: processInstanceData.id,
                processName: processInstanceData.name,
                initiatorName: await getUserDetails(
                  processInstanceData.initiator.id
                ),
                workflow: process.workflow?.name || "N/A",
                assignmentType: "N/A",
                role: "N/A",
                department: "N/A",
                stepInstanceId: null,
                stepName: "Process Initiation",
                stepNumber: null,
              },
            },
          ]
        : []),
      ...(await Promise.all(
        processDocuments.map(async (pd) => {
          const documentDetails = await getDocumentDetails(pd.documentId);
          const stepInfo = findStepForTime(pd.document.createdOn);
          const assignmentDetails = await getAssignmentDetails(
            stepInfo.stepInstanceId,
            pd.processId
          );
          const uploadedByDetails = await getUserDetails(
            pd.document.createdById
          );
          return {
            actionType: "DOCUMENT_UPLOADED",
            description: `${uploadedByDetails} uploaded the document "${documentDetails.name}""`,
            createdAt: pd.document.createdOn.toISOString(),
            details: {
              documentId: pd.documentId,
              name: documentDetails.name,
              type: documentDetails.type,
              path: make_path(documentDetails.path),
              tags: documentDetails.tags,
              uploadedBy: uploadedByDetails,
              stepInstanceId: stepInfo.stepInstanceId,
              stepName: stepInfo.stepName || "N/A",
              stepNumber: stepInfo.stepNumber || null,
              workflow: assignmentDetails.workflow || "N/A",
              assignmentType: assignmentDetails.assignmentType || "N/A",
              role: assignmentDetails.role || "N/A",
              department: assignmentDetails.department || "N/A",
            },
          };
        })
      )),
      ...(await Promise.all(
        documentSignatures.map(async (sig) => {
          const documentDetails = await getDocumentDetails(
            sig.processDocument.documentId
          );
          const assignmentDetails = await getAssignmentDetails(
            sig.processStepInstanceId,
            sig.processDocument.processId
          );
          const signedByDetails = await getUserDetails(sig.userId);
          return {
            actionType: "DOCUMENT_SIGNED",
            description: `${signedByDetails} signed the document "${
              documentDetails.name
            }" during step "${
              sig.processStepInstance?.workflowStep?.stepName || "N/A"
            }"`,
            createdAt: sig.signedAt.toISOString(),
            details: {
              documentId: sig.processDocument.documentId,
              name: documentDetails.name,
              type: documentDetails.type,
              path: make_path(documentDetails.path),
              tags: documentDetails.tags,
              signedBy: signedByDetails,
              signedAt: sig.signedAt.toISOString(),
              remarks: sig.reason || null,
              byRecommender: sig.byRecommender,
              isAttachedWithRecommendation: sig.isAttachedWithRecommendation,
              stepInstanceId: sig.processStepInstanceId || null,
              stepName:
                sig.processStepInstance?.workflowStep?.stepName || "N/A",
              stepNumber:
                sig.processStepInstance?.workflowStep?.stepNumber || null,
              workflow: assignmentDetails.workflow || "N/A",
              assignmentType: assignmentDetails.assignmentType || "N/A",
              role: assignmentDetails.role || "N/A",
              department: assignmentDetails.department || "N/A",
            },
          };
        })
      )),
      ...(await Promise.all(
        documentRejections.map(async (dr) => {
          const documentDetails = await getDocumentDetails(
            dr.processDocument.documentId
          );
          const assignmentDetails = await getAssignmentDetails(
            dr.processStepInstanceId,
            dr.processDocument.processId
          );
          const rejectedByDetails = await getUserDetails(dr.userId);
          return {
            actionType: "DOCUMENT_REJECTED",
            description: `${rejectedByDetails} rejected the document "${
              documentDetails.name
            }" during step "${
              dr.processStepInstance?.workflowStep?.stepName || "N/A"
            }" with reason: "${dr.reason || "No reason provided"}"`,
            createdAt: dr.rejectedAt.toISOString(),
            details: {
              documentId: dr.processDocument.documentId,
              name: documentDetails.name,
              type: documentDetails.type,
              path: make_path(documentDetails.path),
              tags: documentDetails.tags,
              rejectedBy: rejectedByDetails,
              rejectionReason: dr.reason || null,
              rejectedAt: dr.rejectedAt.toISOString(),
              byRecommender: dr.byRecommender,
              isAttachedWithRecommendation: dr.isAttachedWithRecommendation,
              stepInstanceId: dr.processStepInstanceId || null,
              stepName: dr.processStepInstance?.workflowStep?.stepName || "N/A",
              stepNumber:
                dr.processStepInstance?.workflowStep?.stepNumber || null,
              workflow: assignmentDetails.workflow || "N/A",
              assignmentType: assignmentDetails.assignmentType || "N/A",
              role: assignmentDetails.role || "N/A",
              department: assignmentDetails.department || "N/A",
            },
          };
        })
      )),
      ...(
        await Promise.all(
          processQAs.map(async (qa) => {
            const assignmentDetails = await getAssignmentDetails(
              qa.stepInstanceId,
              qa.processId
            );
            const initiatorDetails = await getUserDetails(qa.initiatorId);
            const entityDetails = await getUserDetails(qa.entityId);
            const actions = [];
            actions.push({
              actionType: "QUERY_RAISED",
              description: `${initiatorDetails} raised a query: "${
                qa.question
              }" to ${entityDetails} during step "${
                qa.stepInstance?.workflowStep?.stepName || "N/A"
              }"`,
              createdAt: qa.createdAt.toISOString(),
              details: {
                stepInstanceId: qa.stepInstanceId || null,
                stepName: qa.stepInstance?.workflowStep?.stepName || "N/A",
                stepNumber: qa.stepInstance?.workflowStep?.stepNumber || null,
                status: qa.status,
                queryText: qa.question,
                initiatorName: initiatorDetails,
                entityName: entityDetails,
                createdAt: qa.createdAt.toISOString(),
                workflow: assignmentDetails.workflow || "N/A",
                assignmentType: assignmentDetails.assignmentType || "N/A",
                role: assignmentDetails.role || "N/A",
                department: assignmentDetails.department || "N/A",
              },
            });
            if (qa.status === "RESOLVED") {
              actions.push({
                actionType: "QUERY_RESOLVED",
                description: `${entityDetails} resolved the query: "${
                  qa.question
                }" during step "${
                  qa.stepInstance?.workflowStep?.stepName || "N/A"
                }" with answer: "${qa.answer || "No answer provided"}"`,
                createdAt:
                  qa.answeredAt?.toISOString() || qa.createdAt.toISOString(),
                details: {
                  stepInstanceId: qa.stepInstanceId || null,
                  stepName: qa.stepInstance?.workflowStep?.stepName || "N/A",
                  stepNumber: qa.stepInstance?.workflowStep?.stepNumber || null,
                  status: qa.status,
                  queryText: qa.question,
                  initiatorName: initiatorDetails,
                  entityName: entityDetails,
                  createdAt: qa.createdAt.toISOString(),
                  answerText: qa.answer || null,
                  answeredAt: qa.answeredAt?.toISOString() || null,
                  workflow: assignmentDetails.workflow || "N/A",
                  assignmentType: assignmentDetails.assignmentType || "N/A",
                  role: assignmentDetails.role || "N/A",
                  department: assignmentDetails.department || "N/A",
                },
              });
            }
            return actions;
          })
        )
      ).flat(),
      ...(
        await Promise.all(
          recommendations.map(async (rec) => {
            const assignmentDetails = await getAssignmentDetails(
              rec.stepInstanceId,
              rec.processId
            );
            const initiatorDetails = await getUserDetails(rec.initiatorId);
            const recommenderDetails = await getUserDetails(rec.recommenderId);
            const documentSummaries = rec.documentSummaries || [];
            const documentResponses = rec.details?.documentResponses || [];
            const documentIds = documentSummaries.map((ds) =>
              parseInt(ds.documentId)
            );
            const documents = documentIds.length
              ? await prisma.document.findMany({
                  where: { id: { in: documentIds } },
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    path: true,
                    tags: true,
                  },
                })
              : [];

            const documentMap = documents.reduce((map, doc) => {
              map[doc.id] = {
                name: doc.name,
                type: doc.type,
                path: make_path(doc.path),
                tags: doc.tags,
              };
              return map;
            }, {});

            const documentDetails = documentSummaries.map((ds) => {
              const response = documentResponses.find(
                (dr) => dr.documentId === parseInt(ds.documentId)
              );
              return {
                documentId: ds.documentId,
                documentName:
                  documentMap[ds.documentId]?.name || "Unknown Document",
                documentType: documentMap[ds.documentId]?.type || "Unknown",
                documentPath: documentMap[ds.documentId]?.path || "N/A",
                tags: documentMap[ds.documentId]?.tags || [],
                queryText: ds.queryText,
                answerText: response?.answerText || null,
                requiresApproval: ds.requiresApproval,
              };
            });

            const actions = [];
            actions.push({
              actionType: "RECOMMENDATION_REQUESTED",
              description: `${initiatorDetails} requested a recommendation: "${
                rec.recommendationText
              }" from ${recommenderDetails} during step "${
                rec.stepInstance?.workflowStep?.stepName || "N/A"
              }"`,
              createdAt: rec.createdAt.toISOString(),
              details: {
                recommendationId: rec.id,
                processId: rec.processId,
                processName: rec.process.name,
                stepInstanceId: rec.stepInstanceId || null,
                stepName: rec.stepInstance?.workflowStep?.stepName || "N/A",
                stepNumber: rec.stepInstance?.workflowStep?.stepNumber || null,
                status: rec.status,
                recommendationText: rec.recommendationText,
                initiatorName: initiatorDetails,
                recommenderName: recommenderDetails,
                createdAt: rec.createdAt.toISOString(),
                responseText: rec.responseText || null,
                respondedAt: rec.respondedAt
                  ? rec.respondedAt.toISOString()
                  : null,
                documentDetails,
                documentResponses: documentResponses || [],
                workflow: assignmentDetails.workflow || "N/A",
                assignmentType: assignmentDetails.assignmentType || "N/A",
                role: assignmentDetails.role || "N/A",
                department: assignmentDetails.department || "N/A",
              },
            });
            if (rec.status === "RESOLVED") {
              actions.push({
                actionType: "RECOMMENDATION_PROVIDED",
                description: `${recommenderDetails} provided a recommendation: "${
                  rec.responseText || "No response provided"
                }" during step "${
                  rec.stepInstance?.workflowStep?.stepName || "N/A"
                }"`,
                createdAt:
                  rec.respondedAt?.toISOString() || rec.createdAt.toISOString(),
                details: {
                  recommendationId: rec.id,
                  processId: rec.processId,
                  processName: rec.process.name,
                  stepInstanceId: rec.stepInstanceId || null,
                  stepName: rec.stepInstance?.workflowStep?.stepName || "N/A",
                  stepNumber:
                    rec.stepInstance?.workflowStep?.stepNumber || null,
                  status: rec.status,
                  recommendationText: rec.recommendationText,
                  initiatorName: initiatorDetails,
                  recommenderName: recommenderDetails,
                  createdAt: rec.createdAt.toISOString(),
                  responseText: rec.responseText || null,
                  respondedAt: rec.respondedAt
                    ? rec.respondedAt.toISOString()
                    : null,
                  documentDetails,
                  documentResponses: documentResponses || [],
                  workflow: assignmentDetails.workflow || "N/A",
                  assignmentType: assignmentDetails.assignmentType || "N/A",
                  role: assignmentDetails.role || "N/A",
                  department: assignmentDetails.department || "N/A",
                },
              });
            }
            return actions;
          })
        )
      ).flat(),
      ...(
        await Promise.all(
          stepInstancesAll.map(async (step) => {
            if (step.decisionAt) {
              const assignmentDetails = await getAssignmentDetails(
                step.id,
                processId
              );
              const completedByDetails = await getUserDetails(step.assignedTo);
              return {
                actionType: "STEP_COMPLETED",
                description: `${completedByDetails} completed the step "${
                  step.workflowStep?.stepName || "Unknown"
                }" with status "${step.status}"`,
                createdAt: step.decisionAt.toISOString(),
                details: {
                  stepInstanceId: step.id,
                  stepName: step.workflowStep?.stepName || "Unknown",
                  stepNumber: step.workflowStep?.stepNumber || null,
                  completedBy: completedByDetails,
                  status: step.status,
                  decisionComment: step.decisionComment || null,
                  workflow: assignmentDetails.workflow || "N/A",
                  assignmentType: assignmentDetails.assignmentType || "N/A",
                  role: assignmentDetails.role || "N/A",
                  department: assignmentDetails.department || "N/A",
                },
              };
            }
            return null;
          })
        )
      ).filter((action) => action !== null)
    );

    const sortedActivities = activities
      .filter(Boolean)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (sortedActivities.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: "No activities found",
          details: "No recorded actions in this process or step.",
          code: "NO_ACTIVITIES",
        },
      });
    }

    return res.status(200).json({
      success: true,
      process: {
        processId,
        processName: process.name,
        processStepInstanceId: stepInstanceId || null,
        stepName: stepInstance?.workflowStep?.stepName || "All Steps",
        recirculationCycle: stepInstance?.recirculationCycle || 0,
        processStoragePath: process.processStoragePath || "N/A",
        workflow: enrichedWorkflow,
        activities: sortedActivities,
      },
    });
  } catch (error) {
    console.error("Error fetching process activity logs:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to fetch process activity logs",
        details: error.message,
        code: "ACTIVITY_LOG_ERROR",
      },
    });
  }
};

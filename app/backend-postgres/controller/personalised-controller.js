import { verifyUser } from "../utility/verifyUser.js";

import prisma from "../config/prisma-config.js";

// ---------- Helper: consistent date range (local time, end of day) ----------
const buildDateRange = (startDate, endDate) => {
  let start = startDate
    ? new Date(startDate)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  let end = endDate ? new Date(endDate) : new Date();
  // set to beginning of day for start, end of day for end
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

// ---------- Admin check helper ----------
const isUserAdmin = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) return false;
  return (
    user.isAdmin ||
    user.isRootLevel ||
    user.roles.some((ur) => ur.role.isAdmin || ur.role.isRootLevel)
  );
};

// ═══════════════════════════════════════════════════════════════════════
// GET /personalized  — Main Dashboard (Filters Fixed)
// ═══════════════════════════════════════════════════════════════════════
export const getPersonalizedDashboard = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const userId = userData.id;
    const { startDate, endDate } = req.query;
    const { start, end } = buildDateRange(startDate, endDate);

    const isAdmin = await isUserAdmin(userId);
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const TAKE_LIMIT = 20;

    const userProfilePromise = prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              select: {
                id: true,
                role: true,
                isAdmin: true,
                isRootLevel: true,
              },
            },
          },
        },
        branches: { select: { id: true, name: true, code: true } },
      },
    });

    // ── 1. EXACT METRICS WITH STRICT DATE FILTERING ───────────────────────
    const [
      pendingTasksCount,
      overdueTasksCount,
      completedTasksCount,
      initiatedTotalCount,
      initiatedCompletedCount,
      initiatedActiveCount,
      signedDocsCount,
      openQueriesCount,
    ] = await Promise.all([
      prisma.processStepInstance.count({
        where: {
          assignedTo: userId,
          status: "IN_PROGRESS",
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.processStepInstance.count({
        where: {
          assignedTo: userId,
          status: "IN_PROGRESS",
          createdAt: { gte: start, lte: end, lt: fortyEightHoursAgo },
        },
      }),
      prisma.processStepInstance.count({
        where: {
          assignedTo: userId,
          status: "APPROVED",
          decisionAt: { gte: start, lte: end },
        },
      }),
      prisma.processInstance.count({
        where: { initiatorId: userId, createdAt: { gte: start, lte: end } },
      }),
      prisma.processInstance.count({
        where: {
          initiatorId: userId,
          status: "COMPLETED",
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.processInstance.count({
        where: {
          initiatorId: userId,
          status: "IN_PROGRESS",
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.documentSignature.count({
        where: { userId: userId, signedAt: { gte: start, lte: end } },
      }),
      prisma.processQA.count({
        where: {
          OR: [
            { initiatorId: userId, status: "OPEN" },
            { entityId: userId, status: "OPEN" },
          ],
          createdAt: { gte: start, lte: end },
        },
      }),
    ]);

    // ── 2. PREVIEW ARRAYS WITH STRICT DATE FILTERING ─────────────────────────
    const [
      userProfile,
      initiatedProcesses,
      pendingStepInstances,
      completedSteps,
      signedDocuments,
      openQueries,
      recentActivity,
    ] = await Promise.all([
      userProfilePromise,
      prisma.processInstance.findMany({
        where: { initiatorId: userId, createdAt: { gte: start, lte: end } },
        take: TAKE_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          workflow: { select: { id: true, name: true, version: true } },
          currentStep: { select: { stepName: true, stepNumber: true } },
          tags: true,
          poNumbers: true,
          issueNo: true,
        },
      }),
      prisma.processStepInstance.findMany({
        where: {
          assignedTo: userId,
          status: "IN_PROGRESS",
          createdAt: { gte: start, lte: end },
        },
        take: TAKE_LIMIT,
        orderBy: { createdAt: "asc" },
        include: {
          process: {
            select: {
              id: true,
              name: true,
              status: true,
              issueNo: true,
              tags: true,
              workflow: { select: { id: true, name: true } },
              initiator: { select: { id: true, username: true, name: true } },
              createdAt: true,
            },
          },
          workflowStep: {
            select: { stepName: true, stepNumber: true, stepType: true },
          },
        },
      }),
      prisma.processStepInstance.findMany({
        where: {
          assignedTo: userId,
          status: "APPROVED",
          decisionAt: { gte: start, lte: end },
        },
        take: TAKE_LIMIT,
        orderBy: { decisionAt: "desc" },
        include: {
          process: {
            select: {
              id: true,
              name: true,
              workflow: { select: { name: true } },
            },
          },
          workflowStep: { select: { stepName: true, stepNumber: true } },
        },
      }),
      prisma.documentSignature.findMany({
        where: { userId: userId, signedAt: { gte: start, lte: end } },
        take: TAKE_LIMIT,
        orderBy: { signedAt: "desc" },
        include: {
          processDocument: {
            include: {
              document: { select: { id: true, name: true, path: true } },
              process: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.processQA.findMany({
        where: {
          OR: [
            { initiatorId: userId, status: "OPEN" },
            { entityId: userId, status: "OPEN" },
          ],
          createdAt: { gte: start, lte: end },
        },
        take: TAKE_LIMIT,
        orderBy: { createdAt: "desc" },
        include: {
          process: {
            select: {
              id: true,
              name: true,
              workflow: { select: { name: true } },
            },
          },
          initiator: { select: { id: true, username: true } },
        },
      }),
      prisma.processStepInstance.findMany({
        where: { assignedTo: userId, createdAt: { gte: start, lte: end } },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          process: {
            select: {
              id: true,
              name: true,
              status: true,
              workflow: { select: { name: true } },
            },
          },
          workflowStep: { select: { stepName: true, stepNumber: true } },
        },
      }),
    ]);

    // Average Calc
    const completedForAvg = await prisma.processStepInstance.findMany({
      where: {
        assignedTo: userId,
        status: "APPROVED",
        decisionAt: { not: null },
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true, decisionAt: true },
      take: 100,
    });
    const avgCompletionHours =
      completedForAvg.length > 0
        ? parseFloat(
            (
              completedForAvg.reduce(
                (sum, s) =>
                  sum + (s.decisionAt - s.createdAt) / (1000 * 60 * 60),
                0,
              ) / completedForAvg.length
            ).toFixed(2),
          )
        : 0;

    const involvedWorkflowIds = [
      ...new Set([
        ...initiatedProcesses.map((p) => p.workflow?.id).filter(Boolean),
        ...pendingStepInstances
          .map((s) => s.process?.workflow?.id)
          .filter(Boolean),
      ]),
    ];

    const workflowStats = await Promise.all(
      involvedWorkflowIds.map(async (wfId) => {
        const [total, active, completed] = await Promise.all([
          prisma.processInstance.count({
            where: { workflowId: wfId, createdAt: { gte: start, lte: end } },
          }),
          prisma.processInstance.count({
            where: {
              workflowId: wfId,
              status: "IN_PROGRESS",
              createdAt: { gte: start, lte: end },
            },
          }),
          prisma.processInstance.count({
            where: {
              workflowId: wfId,
              status: "COMPLETED",
              createdAt: { gte: start, lte: end },
            },
          }),
        ]);
        const wf =
          initiatedProcesses.find((p) => p.workflow?.id === wfId)?.workflow ||
          pendingStepInstances.find((s) => s.process?.workflow?.id === wfId)
            ?.process?.workflow;
        return {
          workflowId: wfId,
          name: wf?.name || "Unknown",
          version: wf?.version || 1,
          total,
          active,
          completed,
          completionRate:
            total > 0 ? +((completed / total) * 100).toFixed(1) : 0,
        };
      }),
    );

    const now = Date.now();

    return res.status(200).json({
      success: true,
      data: {
        profile: {
          id: userProfile.id,
          username: userProfile.username,
          name: userProfile.name,
          email: userProfile.email,
          isAdmin,
          roles: userProfile.roles.map((ur) => ({
            id: ur.role.id,
            name: ur.role.role,
            isAdmin: ur.role.isAdmin,
            isRootLevel: ur.role.isRootLevel,
          })),
          departments: userProfile.branches.map((b) => ({
            id: b.id,
            name: b.name,
            code: b.code,
          })),
        },
        metrics: {
          initiatedTotal: initiatedTotalCount,
          initiatedCompleted: initiatedCompletedCount,
          initiatedActive: initiatedActiveCount,
          pendingTasks: pendingTasksCount,
          overdueTasks: overdueTasksCount,
          completedTasks: completedTasksCount,
          signedDocuments: signedDocsCount,
          openQueries: openQueriesCount,
          avgCompletionHours,
        },
        pendingTasks: pendingStepInstances.map((s) => ({
          id: s.id,
          processId: s.process.id,
          processName: s.process.name,
          workflowName: s.process.workflow?.name || "—",
          stepName: s.workflowStep?.stepName || "—",
          initiatorName:
            s.process.initiator?.name || s.process.initiator?.username || "—",
          hoursOld: Math.floor(
            (now - new Date(s.createdAt).getTime()) / (1000 * 60 * 60),
          ),
          isOverdue: now - new Date(s.createdAt).getTime() > 48 * 36e5,
          createdAt: s.createdAt,
        })),
        initiatedProcesses: initiatedProcesses.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          workflowName: p.workflow?.name || "—",
          currentStep: p.currentStep?.stepName || null,
          tags: p.tags || [],
          poNumbers: p.poNumbers || [],
          createdAt: p.createdAt,
        })),
        completedTasks: completedSteps.map((s) => ({
          id: s.id,
          processId: s.process.id,
          processName: s.process.name,
          workflowName: s.process.workflow?.name || "—",
          stepName: s.workflowStep?.stepName || "—",
          stepNumber: s.workflowStep?.stepNumber,
          decisionAt: s.decisionAt,
        })),
        signedDocuments: signedDocuments.map((sig) => ({
          id: sig.id,
          documentName: sig.processDocument?.document?.name || "—",
          processId: sig.processDocument?.process?.id,
          processName: sig.processDocument?.process?.name || "—",
          signedAt: sig.signedAt,
          reason: sig.reason,
        })),
        openQueries: openQueries.map((q) => ({
          id: q.id,
          processId: q.process.id,
          processName: q.process.name,
          workflowName: q.process.workflow?.name || "—",
          question: q.question,
          initiatorName: q.initiator?.username || "—",
          isRaiser: q.initiatorId === userId,
          createdAt: q.createdAt,
          status: q.status,
        })),
        workflowStats,
        recentActivity: recentActivity.map((a) => ({
          id: a.id,
          processId: a.process.id,
          processName: a.process.name,
          workflowName: a.process.workflow?.name || "—",
          stepName: a.workflowStep?.stepName || "—",
          status: a.status,
          createdAt: a.createdAt,
          decisionAt: a.decisionAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error in getPersonalizedDashboard:", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to load personalized dashboard",
        code: "DASHBOARD_ERROR",
      },
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// DRILL DOWNS WITH SERVER-SIDE PAGINATION AND CONSISTENT DATES
// ═══════════════════════════════════════════════════════════════════════

export const getPendingTasksDrillDown = async (req, res) => {
  try {
    const userData = await verifyUser(
      req.headers["authorization"]?.substring(7),
    );
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const {
      startDate,
      endDate,
      workflowId,
      isOverdue,
      page = 1,
      limit = 10,
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const { start, end } = buildDateRange(startDate, endDate);

    const where = {
      assignedTo: userData.id,
      status: "IN_PROGRESS",
      createdAt: { gte: start, lte: end },
    };
    if (workflowId) where.process = { workflowId };
    if (isOverdue === "true") {
      where.createdAt = {
        gte: start,
        lte: end,
        lt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      };
    }

    const [total, tasks] = await Promise.all([
      prisma.processStepInstance.count({ where }),
      prisma.processStepInstance.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: "asc" },
        include: {
          process: {
            include: {
              workflow: { select: { id: true, name: true } },
              initiator: { select: { id: true, username: true, name: true } },
              documents: {
                include: {
                  document: {
                    select: { id: true, name: true, type: true, path: true },
                  },
                  signatures: {
                    include: { user: { select: { id: true, username: true } } },
                  },
                },
              },
              currentStep: { select: { stepName: true } },
            },
          },
          workflowStep: {
            select: { stepName: true, stepNumber: true, stepType: true },
          },
        },
      }),
    ]);

    const filtered = tasks.map((s) => ({
      id: s.id,
      processId: s.process.id,
      processName: s.process.name,
      workflowName: s.process.workflow?.name || "—",
      stepName: s.workflowStep?.stepName || "—",
      initiatorName:
        s.process.initiator?.name || s.process.initiator?.username || "—",
      currentStep: s.process.currentStep?.stepName,
      tags: s.process.tags || [],
      documents: s.process.documents.map((pd) => ({
        id: pd.document.id,
        name: pd.document.name,
        type: pd.document.type,
        path: pd.document.path.split("/").slice(0, -1).join("/"),
        signedBy: pd.signatures.map((sig) => sig.user.username),
      })),
      createdAt: s.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: filtered,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: "Failed to load pending tasks" });
  }
};

export const getCompletedTasksDrillDown = async (req, res) => {
  try {
    const userData = await verifyUser(
      req.headers["authorization"]?.substring(7),
    );
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const { start, end } = buildDateRange(startDate, endDate);

    const where = {
      assignedTo: userData.id,
      status: "APPROVED",
      decisionAt: { gte: start, lte: end },
    };

    const [total, tasks] = await Promise.all([
      prisma.processStepInstance.count({ where }),
      prisma.processStepInstance.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { decisionAt: "desc" },
        include: {
          process: {
            select: {
              id: true,
              name: true,
              workflow: { select: { name: true } },
            },
          },
          workflowStep: { select: { stepName: true, stepNumber: true } },
        },
      }),
    ]);

    const mapped = tasks.map((t) => ({
      id: t.id,
      processId: t.process.id,
      processName: t.process.name,
      workflowName: t.process.workflow?.name || "—",
      stepName: t.workflowStep?.stepName || "—",
      stepNumber: t.workflowStep?.stepNumber,
      decisionAt: t.decisionAt,
    }));

    return res.status(200).json({
      success: true,
      total,
      data: mapped,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: "Failed to load completed tasks" });
  }
};

export const getInitiatedProcessesDrillDown = async (req, res) => {
  try {
    const userData = await verifyUser(
      req.headers["authorization"]?.substring(7),
    );
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const {
      startDate,
      endDate,
      status,
      workflowId,
      page = 1,
      limit = 10,
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const { start, end } = buildDateRange(startDate, endDate);

    const where = {
      initiatorId: userData.id,
      createdAt: { gte: start, lte: end },
    };
    if (status && status !== "All") where.status = status;
    if (workflowId) where.workflowId = workflowId;

    const [total, processes] = await Promise.all([
      prisma.processInstance.count({ where }),
      prisma.processInstance.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          workflow: { select: { id: true, name: true, version: true } },
          currentStep: { select: { stepName: true } },
          documents: {
            include: {
              document: {
                select: { id: true, name: true, type: true, path: true },
              },
              signatures: { include: { user: { select: { username: true } } } },
              rejections: { include: { user: { select: { username: true } } } },
            },
          },
          stepInstances: {
            where: { status: "IN_PROGRESS" },
            select: {
              assignedTo: true,
              workflowStep: { select: { stepName: true } },
            },
            take: 5,
          },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: processes.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        workflowName: p.workflow?.name || "—",
        currentStep: p.currentStep?.stepName || null,
        tags: p.tags || [],
        poNumbers: p.poNumbers || [],
        createdAt: p.createdAt,
        documents: p.documents.map((pd) => ({
          id: pd.document.id,
          name: pd.document.name,
          type: pd.document.type,
          path: pd.document.path.split("/").slice(0, -1).join("/"),
          signedBy: pd.signatures.map((s) => s.user.username),
          rejected: pd.rejections.length > 0,
        })),
        pendingAt: p.stepInstances.map((si) => ({
          assignedTo: si.assignedTo,
          stepName: si.workflowStep?.stepName,
        })),
      })),
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: "Failed to load initiated processes" });
  }
};

export const getSignedDocumentsDrillDown = async (req, res) => {
  try {
    const userData = await verifyUser(
      req.headers["authorization"]?.substring(7),
    );
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const { start, end } = buildDateRange(startDate, endDate);

    const where = { userId: userData.id, signedAt: { gte: start, lte: end } };

    const [total, signatures] = await Promise.all([
      prisma.documentSignature.count({ where }),
      prisma.documentSignature.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { signedAt: "desc" },
        include: {
          processDocument: {
            include: {
              document: {
                select: { id: true, name: true, type: true, path: true },
              },
              process: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  workflow: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: signatures.map((sig) => ({
        id: sig.id,
        documentId: sig.processDocument?.document?.id,
        documentName: sig.processDocument?.document?.name || "—",
        documentPath: sig.processDocument?.document?.path
          ? sig.processDocument.document.path.split("/").slice(0, -1).join("/")
          : "",
        processId: sig.processDocument?.process?.id,
        processName: sig.processDocument?.process?.name || "—",
        workflowName: sig.processDocument?.process?.workflow?.name || "—",
        processStatus: sig.processDocument?.process?.status,
        signedAt: sig.signedAt,
        reason: sig.reason,
      })),
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: "Failed to load signed documents" });
  }
};

export const getOpenQueriesDrillDown = async (req, res) => {
  try {
    const userData = await verifyUser(
      req.headers["authorization"]?.substring(7),
    );
    if (userData === "Unauthorized")
      return res.status(401).json({ message: "Unauthorized request" });

    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const { start, end } = buildDateRange(startDate, endDate);

    const where = {
      OR: [{ initiatorId: userData.id }, { entityId: userData.id }],
      createdAt: { gte: start, lte: end },
    };

    const [total, queries] = await Promise.all([
      prisma.processQA.count({ where }),
      prisma.processQA.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          process: {
            select: {
              id: true,
              name: true,
              status: true,
              workflow: { select: { name: true } },
            },
          },
          initiator: { select: { id: true, username: true, name: true } },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: queries.map((q) => ({
        id: q.id,
        processId: q.process.id,
        processName: q.process.name,
        workflowName: q.process.workflow?.name || "—",
        processStatus: q.process.status,
        question: q.question,
        answer: q.answer,
        initiatorName: q.initiator?.name || q.initiator?.username || "—",
        isRaiser: q.initiatorId === userData.id,
        status: q.status,
        createdAt: q.createdAt,
      })),
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: "Failed to load open queries" });
  }
};

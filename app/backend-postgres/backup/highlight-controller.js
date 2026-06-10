import { verifyUser } from "../utility/verifyUser.js";

import prisma from "../config/prisma-config.js";

export const postHighlight = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const {
      remark,
      coordinates,
      documentId,
      processInstanceId,
      tempContextType,
      contextFlag,
      context,
    } = req.body;

    // Define valid context types
    const contextTypes = [
      "queryId",
      "queryResponseId",
      "queryDoubtId",
      "queryDoubtResponseId",
      "recommendationId",
      "recommendationResponseId",
      "recommendationDoubtId",
      "recommendationDoubtResponseId",
    ];

    // Validate context if provided
    let contextField, contextValue;
    if (context) {
      const providedContexts = contextTypes.filter((type) => context[type]);
      if (providedContexts.length > 1) {
        return res.status(400).json({
          error: "Only one context type can be provided",
        });
      }
      contextField = providedContexts[0];
      contextValue = context[contextField];
    }

    // Validate tempContextType
    const validTempContextTypes = [
      "query",
      "queryResponse",
      "queryDoubt",
      "queryDoubtResponse",
      "recommendation",
      "recommendationResponse",
      "recommendationDoubt",
      "recommendationDoubtResponse",
    ];
    if (tempContextType && !validTempContextTypes.includes(tempContextType)) {
      return res.status(400).json({
        error: "Invalid tempContextType",
      });
    }

    // Validate contextFlag for recommendation-related highlights
    if (
      tempContextType &&
      tempContextType.includes("recommendation") &&
      contextFlag &&
      !["doubt", "response"].includes(contextFlag)
    ) {
      return res.status(400).json({
        error:
          "Invalid contextFlag. Must be 'doubt' or 'response' for recommendation-related highlights",
      });
    }

    // Ensure at least one of context or (processInstanceId + tempContextType) is provided
    if (!contextField && (!processInstanceId || !tempContextType)) {
      return res.status(400).json({
        error:
          "Must provide either context or both processInstanceId and tempContextType",
      });
    }

    const highlightData = {
      documentId,
      coordinates,
      remark,
      createdById: userData.id,
      processInstanceId: processInstanceId || null,
      tempContextType: tempContextType || null,
      contextFlag: contextFlag || null,
    };

    if (contextField) {
      highlightData[contextField] = contextValue;
    }

    const highlight = await prisma.documentHighlight.create({
      data: highlightData,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: highlight,
      message: "Highlight added successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Failed to add highlight",
        details: error.message,
        code: "HIGHLIGHT_CREATION_ERROR",
      },
    });
  }
};

export const getHighlights = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const { documentId } = req.params;
    const {
      action, // e.g., query_submission, recommendation_response_submission
      contextId, // Specific ID (e.g., queryId, recommendationId)
      tempContextType, // e.g., query, recommendationResponse
      contextFlag, // e.g., doubt, response (for recommendation-related)
    } = req.query;

    // Validate action
    const validActions = [
      "query_submission",
      "query_response_submission",
      "query_doubt_submission",
      "query_doubt_response_submission",
      "recommendation_submission",
      "recommendation_response_submission",
      "recommendation_doubt_submission",
      "recommendation_doubt_response_submission",
    ];

    if (action && !validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Invalid action type",
          code: "INVALID_ACTION",
        },
      });
    }

    let whereClause = { documentId: parseInt(documentId) };

    // Filter highlights based on action
    if (action) {
      switch (action) {
        case "query_submission":
        case "query_response_submission":
          whereClause = {
            ...whereClause,
            OR: [
              { queryId: contextId ? parseInt(contextId) : { not: null } },
              {
                tempContextType: "query",
                processInstanceId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
            ],
          };
          break;
        case "query_doubt_submission":
          whereClause = {
            ...whereClause,
            OR: [
              { queryDoubtId: contextId ? parseInt(contextId) : { not: null } },
              {
                tempContextType: "queryDoubt",
                processInstanceId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
            ],
          };
          break;
        case "query_doubt_response_submission":
          whereClause = {
            ...whereClause,
            OR: [
              {
                queryDoubtResponseId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
              {
                tempContextType: "queryDoubtResponse",
                processInstanceId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
            ],
          };
          break;
        case "recommendation_submission":
          whereClause = {
            ...whereClause,
            OR: [
              {
                recommendationId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
              {
                tempContextType: "recommendation",
                processInstanceId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
            ],
          };
          break;
        case "recommendation_response_submission":
          whereClause = {
            ...whereClause,
            OR: [
              {
                recommendationResponseId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
              {
                tempContextType: "recommendationResponse",
                contextFlag: "response",
                processInstanceId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
            ],
          };
          break;
        case "recommendation_doubt_submission":
          whereClause = {
            ...whereClause,
            OR: [
              {
                recommendationDoubtId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
              {
                tempContextType: "recommendationDoubt",
                contextFlag: "doubt",
                processInstanceId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
            ],
          };
          break;
        case "recommendation_doubt_response_submission":
          whereClause = {
            ...whereClause,
            OR: [
              {
                recommendationDoubtResponseId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
              {
                tempContextType: "recommendationDoubtResponse",
                contextFlag: "response",
                processInstanceId: contextId
                  ? parseInt(contextId)
                  : { not: null },
              },
            ],
          };
          break;
      }
    } else if (contextId && tempContextType) {
      // Fallback for generic context-based filtering
      whereClause = {
        ...whereClause,
        processInstanceId: contextId ? parseInt(contextId) : undefined,
        tempContextType,
        contextFlag: contextFlag || undefined,
      };
    }

    const highlights = await prisma.documentHighlight.findMany({
      where: whereClause,
      include: {
        createdBy: {
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
              },
            },
          },
        },
        queryResponse: {
          select: {
            respondedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        queryDoubt: {
          select: {
            raisedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        queryDoubtResponse: {
          select: {
            respondedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        recommendation: {
          select: {
            requestedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        recommendationResponse: {
          select: {
            respondedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        recommendationDoubt: {
          select: {
            raisedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        recommendationDoubtResponse: {
          select: {
            respondedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const formattedHighlights = highlights.map((highlight) => {
      let contextInfo = {};

      if (highlight.queryId) {
        contextInfo = {
          type: "query",
          author: highlight.query?.raisedBy?.name || "Unknown",
        };
      } else if (highlight.queryResponseId) {
        contextInfo = {
          type: "queryResponse",
          author: highlight.queryResponse?.respondedBy?.name || "Unknown",
        };
      } else if (highlight.queryDoubtId) {
        contextInfo = {
          type: "queryDoubt",
          author: highlight.queryDoubt?.raisedBy?.name || "Unknown",
        };
      } else if (highlight.queryDoubtResponseId) {
        contextInfo = {
          type: "queryDoubtResponse",
          author: highlight.queryDoubtResponse?.respondedBy?.name || "Unknown",
        };
      } else if (highlight.recommendationId) {
        contextInfo = {
          type: "recommendation",
          author: highlight.recommendation?.requestedBy?.name || "Unknown",
        };
      } else if (highlight.recommendationResponseId) {
        contextInfo = {
          type: "recommendationResponse",
          author:
            highlight.recommendationResponse?.respondedBy?.name || "Unknown",
        };
      } else if (highlight.recommendationDoubtId) {
        contextInfo = {
          type: "recommendationDoubt",
          author: highlight.recommendationDoubt?.raisedBy?.name || "Unknown",
        };
      } else if (highlight.recommendationDoubtResponseId) {
        contextInfo = {
          type: "recommendationDoubtResponse",
          author:
            highlight.recommendationDoubtResponse?.respondedBy?.name ||
            "Unknown",
        };
      } else if (highlight.tempContextType) {
        contextInfo = {
          type: highlight.tempContextType,
          author: highlight.createdBy.name,
          temp: true,
        };
      }

      return {
        ...highlight,
        contextInfo,
      };
    });

    res.status(200).json({
      success: true,
      data: formattedHighlights,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Failed to retrieve highlights",
        details: error.message,
        code: "HIGHLIGHT_FETCH_ERROR",
      },
    });
  }
};

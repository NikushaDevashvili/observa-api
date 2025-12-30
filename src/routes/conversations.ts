import { Router, Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { ConversationService } from "../services/conversationService.js";
import { query } from "../db/client.js";

const router = Router();

/**
 * GET /api/v1/conversations
 * List conversations for the authenticated user
 * Query params: projectId, userId, limit, offset, hasIssues
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    // Get query parameters
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const projectId = req.query.projectId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const hasIssues =
      req.query.hasIssues === "true"
        ? true
        : req.query.hasIssues === "false"
        ? false
        : undefined;

    // Get conversations
    const result = await ConversationService.listConversations({
      tenantId: user.tenantId,
      projectId,
      userId,
      limit,
      offset,
      hasIssues,
    });

    return res.status(200).json({
      success: true,
      conversations: result.conversations,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/conversations/:conversationId
 * Get conversation details
 */
router.get("/:conversationId", async (req: Request, res: Response) => {
  try {
    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    const { conversationId } = req.params;

    // Get conversation
    const conversation = await ConversationService.getConversation(
      conversationId,
      user.tenantId
    );

    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
      });
    }

    return res.status(200).json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/conversations/:conversationId/messages
 * Get all messages in a conversation
 * Query params: limit, offset
 */
router.get("/:conversationId/messages", async (req: Request, res: Response) => {
  try {
    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Verify conversation exists and belongs to tenant
    const conversation = await ConversationService.getConversation(
      conversationId,
      user.tenantId
    );

    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
      });
    }

    // Get messages
    const messages = await ConversationService.getConversationMessages(
      conversationId,
      user.tenantId,
      limit,
      offset
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM analysis_results 
       WHERE conversation_id = $1 AND tenant_id = $2`,
      [conversationId, user.tenantId]
    );
    const total = parseInt(countResult[0].total, 10);
    
    // Debug: Get all trace_ids and message_indexes for this conversation
    const debugQuery = await query(
      `SELECT trace_id, message_index, query, timestamp 
       FROM analysis_results 
       WHERE conversation_id = $1 AND tenant_id = $2
       ORDER BY message_index ASC, timestamp ASC`,
      [conversationId, user.tenantId]
    );
    
    console.log(
      `[Conversations API] Returning ${messages.length} messages for conversation ${conversationId?.substring(0, 20)}... (total in DB: ${total})`
    );
    console.log(
      `[Conversations API] All traces in DB for this conversation:`,
      debugQuery.map((r: any) => ({
        traceId: r.trace_id?.substring(0, 20),
        messageIndex: r.message_index,
        query: r.query?.substring(0, 50),
        timestamp: r.timestamp
      }))
    );

    return res.status(200).json({
      success: true,
      messages,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching conversation messages:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/conversations/:conversationId/analytics
 * Get conversation-level analytics
 */
router.get("/:conversationId/analytics", async (req: Request, res: Response) => {
  try {
    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    const { conversationId } = req.params;

    // Get analytics
    const analytics = await ConversationService.getConversationAnalytics(
      conversationId,
      user.tenantId
    );

    return res.status(200).json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error("Error fetching conversation analytics:", error);
    if (error instanceof Error && error.message === "Conversation not found") {
      return res.status(404).json({
        error: "Conversation not found",
      });
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;


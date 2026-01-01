import { Router, Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { ConversationService } from "../services/conversationService.js";
import { query } from "../db/client.js";

const router = Router();

/**
 * GET /api/v1/sessions
 * List sessions for the authenticated user
 * Query params: projectId, userId, limit, offset, activeOnly
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
    const activeOnly =
      req.query.activeOnly === "true"
        ? true
        : req.query.activeOnly === "false"
        ? false
        : undefined;

    // Get sessions
    const result = await ConversationService.listSessions({
      tenantId: user.tenantId,
      projectId,
      userId,
      limit,
      offset,
      activeOnly,
    });

    return res.status(200).json({
      success: true,
      sessions: result.sessions,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/sessions/:sessionId
 * Get session details
 */
router.get("/:sessionId", async (req: Request, res: Response) => {
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

    const { sessionId } = req.params;

    // Get session
    const session = await ConversationService.getSession(
      sessionId,
      user.tenantId
    );

    if (!session) {
      return res.status(404).json({
        error: "Session not found",
      });
    }

    return res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/sessions/:sessionId/traces
 * Get all traces/messages in a session
 * Query params: limit, offset
 */
router.get("/:sessionId/traces", async (req: Request, res: Response) => {
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

    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Verify session exists and belongs to tenant
    const session = await ConversationService.getSession(
      sessionId,
      user.tenantId
    );

    if (!session) {
      return res.status(404).json({
        error: "Session not found",
      });
    }

    // Get traces/messages
    const traces = await ConversationService.getSessionMessages(
      sessionId,
      user.tenantId,
      limit,
      offset
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM analysis_results 
       WHERE session_id = $1 AND tenant_id = $2`,
      [sessionId, user.tenantId]
    );
    const total = parseInt(countResult[0].total, 10);

    return res.status(200).json({
      success: true,
      traces,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching session traces:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/sessions/:sessionId/analytics
 * Get session-level analytics
 */
router.get("/:sessionId/analytics", async (req: Request, res: Response) => {
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

    const { sessionId } = req.params;

    // Get analytics
    const analytics = await ConversationService.getSessionAnalytics(
      sessionId,
      user.tenantId
    );

    return res.status(200).json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error("Error fetching session analytics:", error);
    if (error instanceof Error && error.message === "Session not found") {
      return res.status(404).json({
        error: "Session not found",
      });
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;


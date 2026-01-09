/**
 * Users Routes
 * 
 * Endpoints for listing users from AI application (user_id from traces)
 */

import { Router, Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { UsersService } from "../services/usersService.js";

const router = Router();

/**
 * GET /api/v1/users
 * List users from AI application
 * Query params: projectId, days, startTime, endTime, limit, offset
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
        },
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired session",
        },
      });
    }

    // Get query parameters
    const projectId = req.query.projectId as string | undefined;
    const days = parseInt(req.query.days as string) || 30;
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Calculate time range
    let start: string | undefined;
    let end: string | undefined;
    if (startTime && endTime) {
      start = startTime;
      end = endTime;
    } else {
      end = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      start = startDate.toISOString();
    }

    // Get users
    const result = await UsersService.listUsers({
      tenantId: user.tenantId,
      projectId,
      startTime: start,
      endTime: end,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
        days: startTime && endTime ? undefined : days,
      },
      users: result.users,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        has_more: result.hasMore,
      },
    });
  } catch (error) {
    console.error("[Users API] Error fetching users:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: errorMessage,
      },
    });
  }
});

export default router;





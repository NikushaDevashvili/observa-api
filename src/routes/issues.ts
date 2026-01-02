/**
 * Issues Routes
 * 
 * SOTA: Endpoints for issues timeline view
 * Returns signals/issues with filtering and grouping options
 */

import { Router, Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { SignalsQueryService } from "../services/signalsQueryService.js";

const router = Router();

/**
 * GET /api/v1/issues
 * Get issues timeline (signals) with filtering
 * 
 * Query params:
 * - severity: high | medium | low
 * - signalNames: comma-separated list of signal names
 * - startTime: ISO 8601 timestamp
 * - endTime: ISO 8601 timestamp
 * - route: filter by route
 * - model: filter by model
 * - limit: number of results (default: 50)
 * - offset: pagination offset (default: 0)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
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

    const projectId = req.query.projectId as string | undefined;
    const severity = req.query.severity as "high" | "medium" | "low" | undefined;
    const signalNamesParam = req.query.signalNames as string | undefined;
    const signalNames = signalNamesParam
      ? signalNamesParam.split(",").map((s) => s.trim())
      : undefined;
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Default to last 24 hours if no time range specified
    let start: string;
    let end: string;
    if (startTime && endTime) {
      start = startTime;
      end = endTime;
    } else {
      end = new Date().toISOString();
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - 24);
      start = startDate.toISOString();
    }

    // Query signals
    const signals = await SignalsQueryService.querySignals({
      tenantId: user.tenantId,
      projectId: projectId || null,
      signalNames,
      severity,
      startTime: start,
      endTime: end,
      limit,
      offset,
    });

    // Transform signals to issues format
    const issues = signals.map((signal) => ({
      timestamp: signal.timestamp,
      issue_type: signal.signal_name,
      severity: signal.signal_severity,
      trace_id: signal.trace_id,
      span_id: signal.span_id,
      details: signal.metadata || {},
      signal_value: signal.signal_value,
      signal_type: signal.signal_type,
    }));

    // Get total count (approximate - we'd need a count query for exact)
    // For now, if we got limit results, there might be more
    const hasMore = signals.length === limit;

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
      },
      issues,
      pagination: {
        limit,
        offset,
        has_more: hasMore,
      },
      filters: {
        severity: severity || "all",
        signal_names: signalNames || "all",
      },
    });
  } catch (error) {
    console.error("[Issues API] Error fetching issues:", error);
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

/**
 * GET /api/v1/issues/summary
 * Get issues summary (aggregated by signal type)
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
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

    const projectId = req.query.projectId as string | undefined;
    const days = parseInt(req.query.days as string) || 1;

    const end = new Date().toISOString();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const start = startDate.toISOString();

    const summary = await SignalsQueryService.getSignalSummary(
      user.tenantId,
      projectId || null,
      start,
      end
    );

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
        days,
      },
      summary,
    });
  } catch (error) {
    console.error("[Issues API] Error fetching summary:", error);
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



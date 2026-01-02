import { Router, Request, Response } from "express";
import { query } from "../db/client.js";
import { AuthService } from "../services/authService.js";
import { DashboardMetricsService } from "../services/dashboardMetricsService.js";

const router = Router();

/**
 * GET /api/v1/metrics
 * System metrics endpoint (admin/system-level)
 * Returns key performance and usage metrics
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Get tenant count
    const tenantCountResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM tenants"
    );
    const tenantCount = parseInt(tenantCountResult[0]?.count || "0", 10);

    // Get project count
    const projectCountResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM projects"
    );
    const projectCount = parseInt(projectCountResult[0]?.count || "0", 10);

    // Get analysis results count
    const analysisCountResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM analysis_results"
    );
    const analysisCount = parseInt(analysisCountResult[0]?.count || "0", 10);

    // Get recent analysis results (last 24 hours)
    const recentAnalysisResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analysis_results 
       WHERE analyzed_at > NOW() - INTERVAL '24 hours'`
    );
    const recentAnalysis = parseInt(recentAnalysisResult[0]?.count || "0", 10);

    // Get hallucination rate (from analysis results)
    const hallucinationResult = await query<{
      total: string;
      hallucinations: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_hallucination = true) as hallucinations
       FROM analysis_results`
    );
    const total = parseInt(hallucinationResult[0]?.total || "0", 10);
    const hallucinations = parseInt(
      hallucinationResult[0]?.hallucinations || "0",
      10
    );
    const hallucinationRate = total > 0 ? (hallucinations / total) * 100 : 0;

    res.json({
      timestamp: new Date().toISOString(),
      tenants: {
        total: tenantCount,
      },
      projects: {
        total: projectCount,
      },
      analysis: {
        total: analysisCount,
        last24Hours: recentAnalysis,
        hallucinationRate: parseFloat(hallucinationRate.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({
      error: "Failed to fetch metrics",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

/**
 * GET /api/v1/metrics/latency
 * Get latency metrics by route or model
 *
 * Query params:
 * - groupBy: route | model (default: none)
 * - startTime: ISO 8601 timestamp
 * - endTime: ISO 8601 timestamp
 * - days: number of days (default: 30)
 */
router.get("/latency", async (req: Request, res: Response) => {
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
    const groupBy = req.query.groupBy as "route" | "model" | undefined;
    const days = parseInt(req.query.days as string) || 30;
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;

    // Calculate time range
    let start: string;
    let end: string;
    if (startTime && endTime) {
      start = startTime;
      end = endTime;
    } else {
      end = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      start = startDate.toISOString();
    }

    const metrics = await DashboardMetricsService.getLatencyMetrics(
      user.tenantId,
      projectId || null,
      start,
      end,
      groupBy
    );

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
        days,
      },
      group_by: groupBy || "none",
      metrics,
    });
  } catch (error) {
    console.error("[Metrics API] Error fetching latency metrics:", error);
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
 * GET /api/v1/metrics/error-rates
 * Get error rates by tool or model/version
 *
 * Query params:
 * - groupBy: tool | model (default: tool)
 * - startTime: ISO 8601 timestamp
 * - endTime: ISO 8601 timestamp
 * - days: number of days (default: 30)
 */
router.get("/error-rates", async (req: Request, res: Response) => {
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
    const days = parseInt(req.query.days as string) || 30;
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;

    // Calculate time range
    let start: string;
    let end: string;
    if (startTime && endTime) {
      start = startTime;
      end = endTime;
    } else {
      end = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      start = startDate.toISOString();
    }

    const errorMetrics = await DashboardMetricsService.getErrorRateMetrics(
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
      error_rates: {
        total: errorMetrics.total,
        errors: errorMetrics.errors,
        error_rate: parseFloat(errorMetrics.error_rate.toFixed(2)),
        error_types: errorMetrics.error_types,
      },
    });
  } catch (error) {
    console.error("[Metrics API] Error fetching error rates:", error);
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

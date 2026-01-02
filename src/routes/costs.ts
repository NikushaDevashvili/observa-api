/**
 * Costs Routes
 *
 * SOTA: Endpoints for cost analytics and breakdowns
 * Following the Trace-First plan: "Cost dashboards: total cost over time, cost by model, top routes, top users/sessions"
 */

import { Router, Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { DashboardMetricsService } from "../services/dashboardMetricsService.js";

const router = Router();

/**
 * GET /api/v1/costs/overview
 * Get cost overview with breakdowns
 *
 * Returns:
 * - Total cost (period)
 * - Average cost per trace
 * - Cost by model
 * - Cost by route
 * - Cost over time (if time range specified)
 */
router.get("/overview", async (req: Request, res: Response) => {
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

    const costMetrics = await DashboardMetricsService.getCostMetrics(
      user.tenantId,
      projectId || null,
      start,
      end
    );

    // Sort cost_by_model and cost_by_route by value (descending) for "top" lists
    const costByModel = Object.entries(costMetrics.cost_by_model)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, number>);

    const costByRoute = Object.entries(costMetrics.cost_by_route)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, number>);

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
        days,
      },
      costs: {
        total: parseFloat(costMetrics.total_cost.toFixed(4)),
        avg_per_trace: parseFloat(costMetrics.avg_cost_per_trace.toFixed(4)),
        by_model: costByModel,
        by_route: costByRoute,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Costs API] Error fetching cost overview:", error);
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

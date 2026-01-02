/**
 * Dashboard Routes
 * 
 * SOTA: Endpoints for dashboard overview, metrics, and alerts
 * Following the Trace-First plan architecture
 */

import { Router, Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { DashboardMetricsService } from "../services/dashboardMetricsService.js";
import { SignalsQueryService } from "../services/signalsQueryService.js";

const router = Router();

/**
 * GET /api/v1/dashboard/overview
 * Get dashboard overview with key metrics
 * 
 * Returns:
 * - Error rate
 * - P95/P99 latency
 * - Cost metrics
 * - Active issues count
 * - Token usage
 * - Success rate
 */
router.get("/overview", async (req: Request, res: Response) => {
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
    const days = parseInt(req.query.days as string) || 1; // Default: last 24 hours
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

    // Get all metrics in parallel
    const [
      latencyMetrics,
      errorRateMetrics,
      costMetrics,
      tokenMetrics,
      traceCount,
      signalCounts,
    ] = await Promise.all([
      DashboardMetricsService.getLatencyMetrics(
        user.tenantId,
        projectId || null,
        start,
        end
      ),
      DashboardMetricsService.getErrorRateMetrics(
        user.tenantId,
        projectId || null,
        start,
        end
      ),
      DashboardMetricsService.getCostMetrics(
        user.tenantId,
        projectId || null,
        start,
        end
      ),
      DashboardMetricsService.getTokenMetrics(
        user.tenantId,
        projectId || null,
        start,
        end
      ),
      DashboardMetricsService.getTraceCount(
        user.tenantId,
        projectId || null,
        start,
        end
      ),
      SignalsQueryService.getSignalCountsBySeverity(
        user.tenantId,
        projectId || null,
        start,
        end
      ),
    ]);

    // Calculate success rate (1 - error rate)
    const successRate =
      errorRateMetrics.total > 0
        ? ((errorRateMetrics.total - errorRateMetrics.errors) /
            errorRateMetrics.total) *
          100
        : 100;

    const latency = latencyMetrics as any; // Cast since we're not grouping

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
        days,
      },
      metrics: {
        error_rate: {
          rate: parseFloat(errorRateMetrics.error_rate.toFixed(2)),
          total: errorRateMetrics.total,
          errors: errorRateMetrics.errors,
          error_types: errorRateMetrics.error_types,
        },
        latency: {
          p50: parseFloat((latency.p50 || 0).toFixed(2)),
          p95: parseFloat((latency.p95 || 0).toFixed(2)),
          p99: parseFloat((latency.p99 || 0).toFixed(2)),
          avg: parseFloat((latency.avg || 0).toFixed(2)),
          min: latency.min || 0,
          max: latency.max || 0,
        },
        cost: {
          total: parseFloat(costMetrics.total_cost.toFixed(4)),
          avg_per_trace: parseFloat(costMetrics.avg_cost_per_trace.toFixed(4)),
          by_model: costMetrics.cost_by_model,
          by_route: costMetrics.cost_by_route,
        },
        active_issues: {
          high: signalCounts.high,
          medium: signalCounts.medium,
          low: signalCounts.low,
          total: signalCounts.high + signalCounts.medium + signalCounts.low,
        },
        tokens: {
          total: tokenMetrics.total_tokens,
          avg_per_trace: parseFloat(
            tokenMetrics.avg_tokens_per_trace.toFixed(2)
          ),
          input: tokenMetrics.input_tokens,
          output: tokenMetrics.output_tokens,
          by_model: tokenMetrics.tokens_by_model,
        },
        success_rate: parseFloat(successRate.toFixed(2)),
        trace_count: traceCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Dashboard API] Error fetching overview:", error);
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
 * GET /api/v1/dashboard/alerts
 * Get active alerts (high-severity signals)
 * 
 * Returns alerts for the last 1-24 hours (configurable)
 */
router.get("/alerts", async (req: Request, res: Response) => {
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
    const hours = parseInt(req.query.hours as string) || 24;
    const severity = (req.query.severity as "high" | "medium") || "high";

    // Calculate time range
    const end = new Date().toISOString();
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);
    const start = startDate.toISOString();

    // Get high-severity signals
    const signals = await SignalsQueryService.querySignals({
      tenantId: user.tenantId,
      projectId: projectId || null,
      severity,
      startTime: start,
      endTime: end,
      limit: 1000,
    });

    // Group alerts by signal type
    const alerts: Record<
      string,
      {
        signal_name: string;
        severity: "high" | "medium" | "low";
        count: number;
        latest_timestamp: string;
        trace_ids: string[];
        metadata_sample: any;
      }
    > = {};

    for (const signal of signals) {
      const key = signal.signal_name;
      if (!alerts[key]) {
        alerts[key] = {
          signal_name: signal.signal_name,
          severity: signal.signal_severity,
          count: 0,
          latest_timestamp: signal.timestamp,
          trace_ids: [],
          metadata_sample: signal.metadata,
        };
      }

      alerts[key].count++;
      if (signal.timestamp > alerts[key].latest_timestamp) {
        alerts[key].latest_timestamp = signal.timestamp;
      }
      // Keep sample of trace IDs (max 10)
      if (
        alerts[key].trace_ids.length < 10 &&
        !alerts[key].trace_ids.includes(signal.trace_id)
      ) {
        alerts[key].trace_ids.push(signal.trace_id);
      }
    }

    // Convert to array and sort by count
    const alertsArray = Object.values(alerts).sort((a, b) => b.count - a.count);

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
        hours,
      },
      alerts: alertsArray,
      total: signals.length,
    });
  } catch (error) {
    console.error("[Dashboard API] Error fetching alerts:", error);
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


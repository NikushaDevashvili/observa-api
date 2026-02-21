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

// Secure dashboard cache: key = cacheKey, value = { data, expires, tenantId }
// Cache key includes tenant_id FIRST to prevent cross-tenant access
const dashboardCache = new Map<
  string,
  {
    data: any;
    expires: number;
    tenantId: string; // Store tenant for validation
  }
>();

const CACHE_TTL = 60 * 1000; // 1 minute cache TTL

// Cache cleanup interval (runs every 5 minutes)
let cacheCleanupInterval: NodeJS.Timeout | null = null;

function initializeCacheCleanup(): void {
  if (cacheCleanupInterval) return;

  // Clean up expired cache entries every 5 minutes
  cacheCleanupInterval = setInterval(
    () => {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, value] of dashboardCache.entries()) {
        if (value.expires <= now) {
          dashboardCache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[Dashboard] Cleaned up ${cleaned} expired cache entries`);
      }
    },
    5 * 60 * 1000,
  );
}

// Initialize cache cleanup on module load
initializeCacheCleanup();

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
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;

    // Default to last 7 days if no time range provided
    let start: string;
    let end: string;

    if (startTime && endTime) {
      // Explicit time range provided
      start = startTime;
      end = endTime;
      console.log(
        `[Dashboard] Querying metrics for explicit time range: ${start} to ${end}`,
      );
    } else {
      // Default to last 7 days
      end = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      start = startDate.toISOString();
      console.log(
        `[Dashboard] Querying metrics for default time range (last 7 days): ${start} to ${end}`,
      );
    }

    // Build cache key with tenant_id FIRST to prevent cross-tenant access
    const cacheKey = `dashboard:${user.tenantId}:${
      projectId || "all"
    }:${start}:${end}`;

    // Check cache
    const cached = dashboardCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      // Security check: verify tenant matches (defense in depth)
      if (cached.tenantId === user.tenantId) {
        console.log(`[Dashboard] Cache hit for tenant ${user.tenantId}`);
        return res.status(200).json(cached.data);
      } else {
        // Security violation detected - remove bad cache entry
        dashboardCache.delete(cacheKey);
        console.error(
          `[Dashboard] Security: Cache tenant mismatch detected for key: ${cacheKey}`,
        );
      }
    }

    // Cache miss or expired - fetch data
    console.log(
      `[Dashboard] Cache miss - fetching metrics for tenant ${
        user.tenantId
      }, project ${projectId || "all"}`,
    );

    const [
      latencyMetrics,
      errorRateMetrics,
      costMetrics,
      tokenMetrics,
      traceCount,
      signalCounts,
      signalSummary,
      feedbackMetrics,
    ] = await Promise.all([
      DashboardMetricsService.getLatencyMetrics(
        user.tenantId,
        projectId || null,
        start,
        end,
      ),
      DashboardMetricsService.getErrorRateMetrics(
        user.tenantId,
        projectId || null,
        start,
        end,
      ),
      DashboardMetricsService.getCostMetrics(
        user.tenantId,
        projectId || null,
        start,
        end,
      ),
      DashboardMetricsService.getTokenMetrics(
        user.tenantId,
        projectId || null,
        start,
        end,
      ),
      DashboardMetricsService.getTraceCount(
        user.tenantId,
        projectId || null,
        start,
        end,
      ),
      SignalsQueryService.getSignalCountsBySeverity(
        user.tenantId,
        projectId || null,
        start,
        end,
      ),
      SignalsQueryService.getSignalSummary(
        user.tenantId,
        projectId || null,
        start,
        end,
      ),
      DashboardMetricsService.getFeedbackMetrics(
        user.tenantId,
        projectId || null,
        start,
        end,
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

    // Calculate health indicators
    const healthIndicators = {
      error_rate: {
        status:
          errorRateMetrics.error_rate < 1
            ? "healthy"
            : errorRateMetrics.error_rate < 5
              ? "warning"
              : "critical",
        threshold: 5.0,
        value: errorRateMetrics.error_rate,
      },
      latency: {
        status:
          latency.p95 < 1000
            ? "healthy"
            : latency.p95 < 5000
              ? "warning"
              : "critical",
        threshold: 5000,
        value: latency.p95,
      },
      active_issues: {
        status:
          signalCounts.high === 0
            ? "healthy"
            : signalCounts.high < 10
              ? "warning"
              : "critical",
        threshold: 10,
        value: signalCounts.high,
      },
    };

    // Determine overall health
    const overallHealth =
      healthIndicators.error_rate.status === "critical" ||
      healthIndicators.latency.status === "critical" ||
      healthIndicators.active_issues.status === "critical"
        ? "critical"
        : healthIndicators.error_rate.status === "warning" ||
            healthIndicators.latency.status === "warning" ||
            healthIndicators.active_issues.status === "warning"
          ? "warning"
          : "healthy";

    // Get top 5 issues
    const topIssues = signalSummary.slice(0, 5).map((issue) => ({
      signal_name: issue.signal_name,
      count: issue.count,
      severity: issue.severity,
      latest_timestamp: issue.latest_timestamp,
    }));

    // Get top models by usage (trace count)
    const topModels = Object.entries(tokenMetrics.tokens_by_model)
      .map(([model, data]) => {
        // Estimate trace count from token metrics (approximate)
        const traceCountEstimate = Math.round(data.total / (data.avg || 1));
        return {
          model,
          trace_count: traceCountEstimate,
          cost: costMetrics.cost_by_model[model] || 0,
          tokens: data.total,
        };
      })
      .sort((a, b) => b.trace_count - a.trace_count)
      .slice(0, 5);

    // Log results for debugging
    console.log(`[Dashboard] Metrics fetched:`);
    console.log(`  - Trace count: ${traceCount}`);
    console.log(
      `  - Error rate: ${errorRateMetrics.error_rate}% (${errorRateMetrics.errors}/${errorRateMetrics.total})`,
    );
    console.log(`  - Latency P95: ${latency.p95}ms`);
    console.log(`  - Cost: $${costMetrics.total_cost}`);
    console.log(`  - Tokens: ${tokenMetrics.total_tokens}`);
    console.log(
      `  - Active issues: ${
        signalCounts.high + signalCounts.medium + signalCounts.low
      }`,
    );
    console.log(
      `  - Feedback: ${feedbackMetrics.total} total (${feedbackMetrics.likes} likes, ${feedbackMetrics.dislikes} dislikes, ${feedbackMetrics.feedback_rate}% rate)`,
    );
    console.log(`  - Overall health: ${overallHealth}`);

    const responseData = {
      success: true,
      period: {
        start: start,
        end: end,
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
            tokenMetrics.avg_tokens_per_trace.toFixed(2),
          ),
          input: tokenMetrics.input_tokens,
          output: tokenMetrics.output_tokens,
          by_model: tokenMetrics.tokens_by_model,
        },
        success_rate: parseFloat(successRate.toFixed(2)),
        trace_count: traceCount,
        feedback: {
          total: feedbackMetrics.total,
          likes: feedbackMetrics.likes,
          dislikes: feedbackMetrics.dislikes,
          ratings: feedbackMetrics.ratings,
          corrections: feedbackMetrics.corrections,
          feedback_rate: feedbackMetrics.feedback_rate,
          avg_rating: feedbackMetrics.avg_rating,
          with_comments: feedbackMetrics.with_comments,
          by_outcome: feedbackMetrics.by_outcome,
          by_type: feedbackMetrics.by_type,
        },
      },
      health: {
        overall: overallHealth,
        indicators: healthIndicators,
      },
      top_issues: topIssues,
      top_models: topModels,
      timestamp: new Date().toISOString(),
    };

    // Store in cache with tenant validation
    dashboardCache.set(cacheKey, {
      data: responseData,
      expires: Date.now() + CACHE_TTL,
      tenantId: user.tenantId, // Store tenant for validation
    });

    return res.status(200).json(responseData);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[Dashboard API] ❌ Error fetching overview:", errorMessage);
    if (errorStack) {
      console.error("[Dashboard API] Stack trace:", errorStack);
    }

    // Log the full error object for debugging
    console.error("[Dashboard API] Full error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: errorMessage,
        details:
          process.env.NODE_ENV === "development"
            ? { stack: errorStack }
            : undefined,
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

/**
 * GET /api/v1/dashboard/overview/time-series
 * Get time-series metrics for chart visualization
 *
 * Returns metrics aggregated by time intervals (hourly/daily/weekly)
 */
router.get("/overview/time-series", async (req: Request, res: Response) => {
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
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;
    const interval = (req.query.interval as "hour" | "day" | "week") || "hour";

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: {
          code: "INVALID_PAYLOAD",
          message: "startTime and endTime are required",
        },
      });
    }

    // Auto-select interval based on time range
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    let selectedInterval: "hour" | "day" | "week" = interval;
    if (interval === "hour" && durationHours > 168) {
      // > 7 days, use day
      selectedInterval = "day";
    } else if (interval === "day" && durationHours > 720) {
      // > 30 days, use week
      selectedInterval = "week";
    }

    const series = await DashboardMetricsService.getTimeSeriesMetrics(
      user.tenantId,
      projectId || null,
      startTime,
      endTime,
      selectedInterval,
    );

    return res.status(200).json({
      success: true,
      period: {
        start: startTime,
        end: endTime,
      },
      interval: selectedInterval,
      series,
    });
  } catch (error) {
    console.error("[Dashboard API] Error fetching time-series:", error);
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
 * GET /api/v1/dashboard/overview/comparison
 * Get metrics comparison between current period and previous period
 *
 * Returns percentage changes for trend indicators
 */
router.get("/overview/comparison", async (req: Request, res: Response) => {
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
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: {
          code: "INVALID_PAYLOAD",
          message: "startTime and endTime are required",
        },
      });
    }

    const comparison = await DashboardMetricsService.getMetricsComparison(
      user.tenantId,
      projectId || null,
      startTime,
      endTime,
    );

    return res.status(200).json({
      success: true,
      period: {
        current: { start: startTime, end: endTime },
        previous: {
          start: new Date(
            new Date(startTime).getTime() -
              (new Date(endTime).getTime() - new Date(startTime).getTime()),
          ).toISOString(),
          end: startTime,
        },
      },
      comparison,
    });
  } catch (error) {
    console.error("[Dashboard API] Error fetching comparison:", error);
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
 * GET /api/v1/dashboard/metrics/breakdown
 * Get detailed metrics breakdowns
 *
 * Returns error types, latency distribution, cost by model, token usage by model
 */
router.get("/metrics/breakdown", async (req: Request, res: Response) => {
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
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;

    // Default to last 7 days if no time range provided
    let start: string;
    let end: string;
    if (startTime && endTime) {
      start = startTime;
      end = endTime;
    } else {
      end = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      start = startDate.toISOString();
    }

    const breakdown = await DashboardMetricsService.getMetricsBreakdown(
      user.tenantId,
      projectId || null,
      start,
      end,
    );

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
      },
      breakdown,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Dashboard API] Error fetching breakdown:", error);
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
 * GET /api/v1/dashboard/feedback
 * Get detailed feedback metrics and analytics
 *
 * Returns comprehensive feedback data including likes, dislikes, ratings, and comments
 */
// Debug endpoint to inspect raw feedback data
router.get("/feedback/debug", async (req: Request, res: Response) => {
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

    const { projectId, days = 1 } = req.query; // Default to 1 day to get recent events
    const end = new Date();
    const start = new Date(
      end.getTime() - parseInt(days as string) * 24 * 60 * 60 * 1000,
    );

    // Get raw feedback events from Tinybird
    const escapedTenantId = user.tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId
      ? (projectId as string).replace(/'/g, "''")
      : null;

    let whereClause = `WHERE tenant_id = '${escapedTenantId}' AND event_type = 'feedback'`;
    if (escapedProjectId) {
      whereClause += ` AND project_id = '${escapedProjectId}'`;
    }
    whereClause += ` AND timestamp >= parseDateTime64BestEffort('${start.toISOString()}', 3)`;
    whereClause += ` AND timestamp <= parseDateTime64BestEffort('${end.toISOString()}', 3)`;

    // Select all columns in the order expected by TSV parser
    // The TSV parser expects: tenant_id, project_id, environment, trace_id, span_id, parent_span_id, timestamp, event_type, conversation_id, session_id, user_id, attributes_json
    const sql = `SELECT tenant_id, project_id, environment, trace_id, span_id, parent_span_id, timestamp, event_type, conversation_id, session_id, user_id, attributes_json FROM canonical_events ${whereClause} ORDER BY timestamp DESC LIMIT 10`;

    const { TinybirdRepository } =
      await import("../services/tinybirdRepository.js");
    const result = await TinybirdRepository.rawQuery(sql, {
      tenantId: user.tenantId,
      projectId: projectId as string | null | undefined,
    });

    const results = Array.isArray(result) ? result : result?.data || [];

    const samples = results.map((row: any, index: number) => {
      let parsed = null;
      let feedback = null;
      try {
        const raw = row.attributes_json;
        if (typeof raw === "string") {
          parsed = JSON.parse(raw);
        } else {
          parsed = raw;
        }
        feedback = parsed?.feedback || null;
      } catch (e) {
        // ignore
      }
      return {
        index,
        timestamp: row.timestamp,
        attributes_json_type: typeof row.attributes_json,
        attributes_json_raw: String(row.attributes_json).substring(0, 300),
        parsed_keys: parsed ? Object.keys(parsed) : [],
        has_feedback: !!feedback,
        feedback: feedback,
      };
    });

    return res.json({
      success: true,
      total_samples: results.length,
      samples,
    });
  } catch (error) {
    console.error("[Dashboard] Error in feedback debug endpoint:", error);
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
});

router.get("/feedback", async (req: Request, res: Response) => {
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
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;

    // Default to last 7 days if no time range provided
    let start: string;
    let end: string;
    if (startTime && endTime) {
      start = startTime;
      end = endTime;
    } else {
      end = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      start = startDate.toISOString();
    }

    const feedbackMetrics = await DashboardMetricsService.getFeedbackMetrics(
      user.tenantId,
      projectId || null,
      start,
      end,
    );

    // Calculate additional insights
    const likeDislikeRatio =
      feedbackMetrics.dislikes > 0
        ? parseFloat(
            (feedbackMetrics.likes / feedbackMetrics.dislikes).toFixed(2),
          )
        : feedbackMetrics.likes > 0
          ? 999
          : 0;

    const satisfactionScore =
      feedbackMetrics.total > 0
        ? parseFloat(
            (
              ((feedbackMetrics.likes +
                feedbackMetrics.ratings * (feedbackMetrics.avg_rating / 5)) /
                feedbackMetrics.total) *
              100
            ).toFixed(2),
          )
        : 0;

    return res.status(200).json({
      success: true,
      period: {
        start,
        end,
      },
      metrics: feedbackMetrics,
      insights: {
        like_dislike_ratio: likeDislikeRatio,
        satisfaction_score: satisfactionScore,
        negative_feedback_rate:
          feedbackMetrics.total > 0
            ? parseFloat(
                (
                  (feedbackMetrics.dislikes / feedbackMetrics.total) *
                  100
                ).toFixed(2),
              )
            : 0,
        positive_feedback_rate:
          feedbackMetrics.total > 0
            ? parseFloat(
                ((feedbackMetrics.likes / feedbackMetrics.total) * 100).toFixed(
                  2,
                ),
              )
            : 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Dashboard API] Error fetching feedback metrics:", error);
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
 * GET /api/v1/dashboard/health
 * Diagnostic endpoint to test Tinybird connection and data access
 */
router.get("/health", async (req: Request, res: Response) => {
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

    // Test basic query
    const end = new Date().toISOString();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const start = startDate.toISOString();

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      tenant_id: user.tenantId,
      project_id: projectId || "all",
      time_range: { start, end },
      tests: {},
    };

    // Test 1: Trace count
    try {
      const traceCount = await DashboardMetricsService.getTraceCount(
        user.tenantId,
        projectId || null,
        start,
        end,
      );
      diagnostics.tests.trace_count = { success: true, value: traceCount };
    } catch (error) {
      diagnostics.tests.trace_count = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test 2: Latency metrics
    try {
      const latency = await DashboardMetricsService.getLatencyMetrics(
        user.tenantId,
        projectId || null,
        start,
        end,
      );
      diagnostics.tests.latency = { success: true, value: latency };
    } catch (error) {
      diagnostics.tests.latency = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test 3: Error rate
    try {
      const errorRate = await DashboardMetricsService.getErrorRateMetrics(
        user.tenantId,
        projectId || null,
        start,
        end,
      );
      diagnostics.tests.error_rate = { success: true, value: errorRate };
    } catch (error) {
      diagnostics.tests.error_rate = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test 4: Check Tinybird token
    diagnostics.tinybird_token = {
      configured: !!process.env.TINYBIRD_ADMIN_TOKEN,
      token_length: process.env.TINYBIRD_ADMIN_TOKEN?.length || 0,
      token_prefix:
        process.env.TINYBIRD_ADMIN_TOKEN?.substring(0, 10) || "not set",
    };

    return res.status(200).json({
      success: true,
      diagnostics,
    });
  } catch (error) {
    console.error("[Dashboard API] Health check error:", error);
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
});

export default router;

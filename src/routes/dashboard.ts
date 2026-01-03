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
const dashboardCache = new Map<string, { 
  data: any; 
  expires: number;
  tenantId: string; // Store tenant for validation
}>();

const CACHE_TTL = 60 * 1000; // 1 minute cache TTL

// Cache cleanup interval (runs every 5 minutes)
let cacheCleanupInterval: NodeJS.Timeout | null = null;

function initializeCacheCleanup(): void {
  if (cacheCleanupInterval) return;
  
  // Clean up expired cache entries every 5 minutes
  cacheCleanupInterval = setInterval(() => {
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
  }, 5 * 60 * 1000);
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

    // If no time filter provided, show all data (no time restriction)
    let start: string | undefined;
    let end: string | undefined;
    
    if (startTime && endTime) {
      // Explicit time range provided
      start = startTime;
      end = endTime;
      console.log(`[Dashboard] Querying metrics for explicit time range: ${start} to ${end}`);
    } else {
      // No time filter - show all data
      console.log(`[Dashboard] Querying metrics for all time (no time filter)`);
    }

    // Build cache key with tenant_id FIRST to prevent cross-tenant access
    const cacheKey = `dashboard:${user.tenantId}:${projectId || 'all'}:${start || 'all'}:${end || 'all'}`;
    
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
        console.error(`[Dashboard] Security: Cache tenant mismatch detected for key: ${cacheKey}`);
      }
    }

    // Cache miss or expired - fetch data
    console.log(`[Dashboard] Cache miss - fetching metrics for tenant ${user.tenantId}, project ${projectId || "all"}`);
    
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

    // Log results for debugging
    console.log(`[Dashboard] Metrics fetched:`);
    console.log(`  - Trace count: ${traceCount}`);
    console.log(`  - Error rate: ${errorRateMetrics.error_rate}% (${errorRateMetrics.errors}/${errorRateMetrics.total})`);
    console.log(`  - Latency P95: ${latency.p95}ms`);
    console.log(`  - Cost: $${costMetrics.total_cost}`);
    console.log(`  - Tokens: ${tokenMetrics.total_tokens}`);
    console.log(`  - Active issues: ${signalCounts.high + signalCounts.medium + signalCounts.low}`);

    const responseData = {
      success: true,
      period: {
        start: start || null,
        end: end || null,
        all_time: !start && !end,
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
    };

    // Store in cache with tenant validation
    dashboardCache.set(cacheKey, {
      data: responseData,
      expires: Date.now() + CACHE_TTL,
      tenantId: user.tenantId // Store tenant for validation
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
        details: process.env.NODE_ENV === "development" ? { stack: errorStack } : undefined,
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
        end
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
        end
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
        end
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
      token_prefix: process.env.TINYBIRD_ADMIN_TOKEN?.substring(0, 10) || "not set",
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



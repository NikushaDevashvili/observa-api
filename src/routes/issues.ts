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

    // Query signals from Tinybird
    let signals: any[] = [];
    try {
      signals = await SignalsQueryService.querySignals({
        tenantId: user.tenantId,
        projectId: projectId || null,
        signalNames,
        severity,
        startTime: start,
        endTime: end,
        limit,
        offset,
      });
    } catch (error) {
      console.warn("[Issues API] Failed to query signals from Tinybird:", error);
      // Fall through to PostgreSQL fallback
    }

    // If no signals found, fallback to PostgreSQL (basic issue detection)
    if (signals.length === 0) {
      console.log("[Issues API] No signals found in Tinybird, querying PostgreSQL for basic issues...");
      const { query } = await import("../db/client.js");
      
      let whereClause = `WHERE tenant_id = $1`;
      const params: any[] = [user.tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      // Filter by time range - use COALESCE for timestamp as it might be null
      if (start) {
        whereClause += ` AND COALESCE(timestamp, analyzed_at) >= $${paramIndex}`;
        params.push(new Date(start));
        paramIndex++;
      }
      if (end) {
        whereClause += ` AND COALESCE(timestamp, analyzed_at) <= $${paramIndex}`;
        params.push(new Date(end));
        paramIndex++;
      }

      // Only get traces with issues - check actual column flags or status >= 400
      whereClause += ` AND (
        status >= 400 
        OR is_hallucination = true 
        OR has_context_drop = true 
        OR has_faithfulness_issue = true 
        OR has_model_drift = true 
        OR has_cost_anomaly = true
      )`;

      // Filter by severity if specified
      if (severity === "high") {
        whereClause += ` AND (status >= 500 OR is_hallucination = true)`;
      } else if (severity === "medium") {
        whereClause += ` AND (status >= 400 AND status < 500 OR has_faithfulness_issue = true OR has_context_drop = true)`;
      } else if (severity === "low") {
        whereClause += ` AND (has_model_drift = true OR has_cost_anomaly = true)`;
      }

      const rows = await query(
        `SELECT 
          trace_id,
          span_id,
          COALESCE(timestamp, analyzed_at) as timestamp,
          status,
          status_text,
          is_hallucination,
          has_context_drop,
          has_faithfulness_issue,
          has_model_drift,
          has_cost_anomaly,
          model,
          query
        FROM analysis_results
        ${whereClause}
        ORDER BY COALESCE(timestamp, analyzed_at) DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      // Transform PostgreSQL issues to issues format
      for (const row of rows) {
        // Create issues based on actual column flags
        
        // HTTP errors (status >= 500 = high, 400-499 = medium)
        if (row.status >= 500) {
          signals.push({
            tenant_id: user.tenantId,
            project_id: projectId || null,
            trace_id: row.trace_id,
            span_id: row.span_id || null,
            signal_name: "http_error",
            signal_type: "error",
            signal_value: row.status,
            signal_severity: "high",
            metadata: { status: row.status, status_text: row.status_text || "Server Error" },
            timestamp: row.timestamp,
          });
        } else if (row.status >= 400) {
          signals.push({
            tenant_id: user.tenantId,
            project_id: projectId || null,
            trace_id: row.trace_id,
            span_id: row.span_id || null,
            signal_name: "http_error",
            signal_type: "error",
            signal_value: row.status,
            signal_severity: "medium",
            metadata: { status: row.status, status_text: row.status_text || "Client Error" },
            timestamp: row.timestamp,
          });
        }
        
        // Hallucination detection
        if (row.is_hallucination) {
          signals.push({
            tenant_id: user.tenantId,
            project_id: projectId || null,
            trace_id: row.trace_id,
            span_id: row.span_id || null,
            signal_name: "hallucination",
            signal_type: "quality",
            signal_value: true,
            signal_severity: "high",
            metadata: { model: row.model },
            timestamp: row.timestamp,
          });
        }
        
        // Context drop
        if (row.has_context_drop) {
          signals.push({
            tenant_id: user.tenantId,
            project_id: projectId || null,
            trace_id: row.trace_id,
            span_id: row.span_id || null,
            signal_name: "context_drop",
            signal_type: "quality",
            signal_value: true,
            signal_severity: "medium",
            metadata: { model: row.model },
            timestamp: row.timestamp,
          });
        }
        
        // Faithfulness issue
        if (row.has_faithfulness_issue) {
          signals.push({
            tenant_id: user.tenantId,
            project_id: projectId || null,
            trace_id: row.trace_id,
            span_id: row.span_id || null,
            signal_name: "faithfulness_issue",
            signal_type: "quality",
            signal_value: true,
            signal_severity: "medium",
            metadata: { model: row.model },
            timestamp: row.timestamp,
          });
        }
        
        // Model drift
        if (row.has_model_drift) {
          signals.push({
            tenant_id: user.tenantId,
            project_id: projectId || null,
            trace_id: row.trace_id,
            span_id: row.span_id || null,
            signal_name: "model_drift",
            signal_type: "quality",
            signal_value: true,
            signal_severity: "low",
            metadata: { model: row.model },
            timestamp: row.timestamp,
          });
        }
        
        // Cost anomaly
        if (row.has_cost_anomaly) {
          signals.push({
            tenant_id: user.tenantId,
            project_id: projectId || null,
            trace_id: row.trace_id,
            span_id: row.span_id || null,
            signal_name: "cost_anomaly",
            signal_type: "cost",
            signal_value: true,
            signal_severity: "low",
            metadata: { model: row.model },
            timestamp: row.timestamp,
          });
        }
      }

      if (signals.length > 0) {
        console.log(`[Issues API] Found ${signals.length} issues from PostgreSQL fallback`);
      }
    }

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



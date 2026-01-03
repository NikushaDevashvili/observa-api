/**
 * Dashboard Metrics Service
 *
 * SOTA: Aggregates metrics from Tinybird canonical_events (OLAP data plane) for dashboard display
 * Provides latency percentiles, error rates, cost metrics, etc.
 */

import { SignalsQueryService } from "./signalsQueryService.js";
import { TinybirdRepository } from "./tinybirdRepository.js";

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  count: number;
}

export interface ErrorRateMetrics {
  total: number;
  errors: number;
  error_rate: number;
  error_types: Record<string, number>;
}

export interface CostMetrics {
  total_cost: number;
  avg_cost_per_trace: number;
  cost_by_model: Record<string, number>;
  cost_by_route: Record<string, number>;
}

export interface TokenMetrics {
  total_tokens: number;
  avg_tokens_per_trace: number;
  input_tokens: number;
  output_tokens: number;
  tokens_by_model: Record<string, { total: number; avg: number }>;
}

export class DashboardMetricsService {
  /**
   * Get latency metrics (P50, P95, P99) from Tinybird canonical_events
   * SOTA: Query from OLAP data plane (Tinybird) instead of PostgreSQL
   */
  static async getLatencyMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string,
    groupBy?: "route" | "model"
  ): Promise<LatencyMetrics | Record<string, LatencyMetrics>> {
    // SECURITY: Validate tenantId format (UUID) to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format: must be a valid UUID");
    }
    
    // SECURITY: Validate projectId format if provided
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format: must be a valid UUID");
    }
    
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    // Build WHERE clause for Tinybird
    let whereClause = `WHERE tenant_id = '${escapedTenantId}' AND event_type = 'llm_call'`;

    if (escapedProjectId) {
      whereClause += ` AND project_id = '${escapedProjectId}'`;
    }

    if (startTime) {
      // Tinybird/ClickHouse: parse ISO 8601 (including milliseconds + Z) safely into DateTime64(3)
      whereClause += ` AND timestamp >= parseDateTime64BestEffort('${startTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    if (endTime) {
      // Tinybird/ClickHouse: parse ISO 8601 (including milliseconds + Z) safely into DateTime64(3)
      whereClause += ` AND timestamp <= parseDateTime64BestEffort('${endTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    // Extract latency_ms from attributes_json.llm_call.latency_ms
    // Use toFloat64OrNull to avoid query failure when the value is missing/empty/non-numeric.
    const latencyExpr = `toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))`;

    if (groupBy === "model") {
      // Grouped query by model
      const modelExpr = `JSONExtractString(attributes_json, '$.llm_call.model')`;
      const sql = `
        SELECT 
          ${modelExpr} as model,
          quantile(0.5)(${latencyExpr}) as p50,
          quantile(0.95)(${latencyExpr}) as p95,
          quantile(0.99)(${latencyExpr}) as p99,
          avg(${latencyExpr}) as avg,
          min(${latencyExpr}) as min,
          max(${latencyExpr}) as max,
          count(*) as count
        FROM canonical_events
        ${whereClause}
          AND ${latencyExpr} IS NOT NULL
          AND ${latencyExpr} > 0
        GROUP BY model
      `;

      try {
        const result = await TinybirdRepository.rawQuery(sql, {
          tenantId,
          projectId: projectId || undefined,
        });
        const results = Array.isArray(result) ? result : result?.data || [];

        const grouped: Record<string, LatencyMetrics> = {};
        for (const row of results) {
          const key = row.model || "unknown";
          grouped[key] = {
            p50: parseFloat(row.p50) || 0,
            p95: parseFloat(row.p95) || 0,
            p99: parseFloat(row.p99) || 0,
            avg: parseFloat(row.avg) || 0,
            min: parseFloat(row.min) || 0,
            max: parseFloat(row.max) || 0,
            count: parseInt(row.count) || 0,
          };
        }
        return grouped;
      } catch (error) {
        console.error(
          "[DashboardMetricsService] Failed to get latency metrics:",
          error
        );
        return {};
      }
    }

    // Ungrouped query
    const sql = `
      SELECT 
        quantile(0.5)(${latencyExpr}) as p50,
        quantile(0.95)(${latencyExpr}) as p95,
        quantile(0.99)(${latencyExpr}) as p99,
        avg(${latencyExpr}) as avg,
        min(${latencyExpr}) as min,
        max(${latencyExpr}) as max,
        count(*) as count
      FROM canonical_events
      ${whereClause}
        AND ${latencyExpr} IS NOT NULL
        AND ${latencyExpr} > 0
    `;

    try {
      const result = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });
      const results = Array.isArray(result) ? result : result?.data || [];
      const row = results[0] || {};

      return {
        p50: parseFloat(row.p50) || 0,
        p95: parseFloat(row.p95) || 0,
        p99: parseFloat(row.p99) || 0,
        avg: parseFloat(row.avg) || 0,
        min: parseFloat(row.min) || 0,
        max: parseFloat(row.max) || 0,
        count: parseInt(row.count) || 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get latency metrics:",
        errorMessage
      );
      
      // If it's a permission error, log it clearly
      if (errorMessage.includes("permissions") || errorMessage.includes("403")) {
        console.error(
          "[DashboardMetricsService] ⚠️  Tinybird token missing DATASOURCES:READ:canonical_events permission"
        );
      }
      
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        avg: 0,
        min: 0,
        max: 0,
        count: 0,
      };
    }
  }

  /**
   * Get error rate metrics from Tinybird canonical_events
   * Errors are events with event_type='error'
   */
  static async getErrorRateMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<ErrorRateMetrics> {
    // SECURITY: Validate tenantId format (UUID) to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format: must be a valid UUID");
    }
    
    // SECURITY: Validate projectId format if provided
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format: must be a valid UUID");
    }
    
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    // Build WHERE clause for Tinybird
    let baseWhereClause = `WHERE tenant_id = '${escapedTenantId}'`;

    if (escapedProjectId) {
      baseWhereClause += ` AND project_id = '${escapedProjectId}'`;
    }

    if (startTime) {
      baseWhereClause += ` AND timestamp >= parseDateTime64BestEffort('${startTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    if (endTime) {
      baseWhereClause += ` AND timestamp <= parseDateTime64BestEffort('${endTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    try {
      // Get total count of traces (count distinct trace_id from trace_start or llm_call events)
      const totalSql = `
        SELECT count(DISTINCT trace_id) as total
        FROM canonical_events
        ${baseWhereClause}
          AND event_type IN ('trace_start', 'llm_call')
      `;
      const totalResult = await TinybirdRepository.rawQuery(totalSql, {
        tenantId,
        projectId: projectId || undefined,
      });
      const totalResults = Array.isArray(totalResult)
        ? totalResult
        : totalResult?.data || [];
      const total = parseInt(totalResults[0]?.total || "0", 10);

      // Get error count - errors are events with event_type='error'
      const errorSql = `
        SELECT count(DISTINCT trace_id) as error_count
        FROM canonical_events
        ${baseWhereClause}
          AND event_type = 'error'
      `;
      const errorResult = await TinybirdRepository.rawQuery(errorSql, {
        tenantId,
        projectId: projectId || undefined,
      });
      const errorResults = Array.isArray(errorResult)
        ? errorResult
        : errorResult?.data || [];
      const errors = parseInt(errorResults[0]?.error_count || "0", 10);

      // Get error types from attributes_json.error.error_type
      const errorTypes: Record<string, number> = {};
      const errorTypeSql = `
        SELECT 
          JSONExtractString(attributes_json, '$.error.error_type') as error_type,
          count(*) as count
        FROM canonical_events
        ${baseWhereClause}
          AND event_type = 'error'
        GROUP BY error_type
      `;

      try {
        const errorTypeResult = await TinybirdRepository.rawQuery(
          errorTypeSql,
          {
            tenantId,
            projectId: projectId || undefined,
          }
        );
        const errorTypeResults = Array.isArray(errorTypeResult)
          ? errorTypeResult
          : errorTypeResult?.data || [];
        for (const row of errorTypeResults) {
          const errorType = row.error_type || "unknown_error";
          errorTypes[errorType] = parseInt(row.count) || 0;
        }
      } catch (err) {
        console.warn(
          "[DashboardMetricsService] Failed to get error types:",
          err
        );
      }

      return {
        total,
        errors,
        error_rate: total > 0 ? (errors / total) * 100 : 0,
        error_types: errorTypes,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get error rate metrics:",
        errorMessage
      );
      
      // If it's a permission error, log it clearly
      if (errorMessage.includes("permissions") || errorMessage.includes("403")) {
        console.error(
          "[DashboardMetricsService] ⚠️  Tinybird token missing DATASOURCES:READ:canonical_events permission"
        );
      }
      
      return {
        total: 0,
        errors: 0,
        error_rate: 0,
        error_types: {},
      };
    }
  }

  /**
   * Get cost metrics from Tinybird canonical_events
   * Cost is stored in attributes_json.llm_call.cost
   */
  static async getCostMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<CostMetrics> {
    // SECURITY: Validate tenantId format (UUID) to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format: must be a valid UUID");
    }
    
    // SECURITY: Validate projectId format if provided
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format: must be a valid UUID");
    }
    
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    // Build WHERE clause for Tinybird
    let whereClause = `WHERE tenant_id = '${escapedTenantId}' AND event_type = 'llm_call'`;

    if (escapedProjectId) {
      whereClause += ` AND project_id = '${escapedProjectId}'`;
    }

    if (startTime) {
      // Tinybird/ClickHouse: parse ISO 8601 (including milliseconds + Z) safely into DateTime64(3)
      whereClause += ` AND timestamp >= parseDateTime64BestEffort('${startTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    if (endTime) {
      // Tinybird/ClickHouse: parse ISO 8601 (including milliseconds + Z) safely into DateTime64(3)
      whereClause += ` AND timestamp <= parseDateTime64BestEffort('${endTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    // Extract cost from attributes_json.llm_call.cost
    // Use toFloat64OrNull to avoid query failure when the value is missing/empty/non-numeric.
    const costExpr = `toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.cost'))`;
    const modelExpr = `JSONExtractString(attributes_json, '$.llm_call.model')`;

    try {
      // Get total cost and cost by model
      const sql = `
        SELECT 
          ${modelExpr} as model,
          sum(${costExpr}) as total_cost,
          count(DISTINCT trace_id) as trace_count
        FROM canonical_events
        ${whereClause}
          AND ${costExpr} IS NOT NULL
          AND ${costExpr} > 0
        GROUP BY model
      `;

      const result = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });
      const results = Array.isArray(result) ? result : result?.data || [];

      let totalCost = 0;
      let totalTraces = 0;
      const costByModel: Record<string, number> = {};

      for (const row of results) {
        const cost = parseFloat(row.total_cost) || 0;
        const traces = parseInt(row.trace_count) || 0;
        const model = row.model || "unknown";

        totalCost += cost;
        totalTraces += traces;
        costByModel[model] = cost;
      }

      return {
        total_cost: totalCost,
        avg_cost_per_trace: totalTraces > 0 ? totalCost / totalTraces : 0,
        cost_by_model: costByModel,
        cost_by_route: {}, // Route not available in current schema
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get cost metrics:",
        errorMessage
      );
      
      // If it's a permission error, log it clearly
      if (errorMessage.includes("permissions") || errorMessage.includes("403")) {
        console.error(
          "[DashboardMetricsService] ⚠️  Tinybird token missing DATASOURCES:READ:canonical_events permission"
        );
      }
      
      return {
        total_cost: 0,
        avg_cost_per_trace: 0,
        cost_by_model: {},
        cost_by_route: {},
      };
    }
  }

  /**
   * Get token metrics from Tinybird canonical_events
   * Tokens are stored in attributes_json.llm_call
   */
  static async getTokenMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<TokenMetrics> {
    // SECURITY: Validate tenantId format (UUID) to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format: must be a valid UUID");
    }
    
    // SECURITY: Validate projectId format if provided
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format: must be a valid UUID");
    }
    
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    // Build WHERE clause for Tinybird
    let whereClause = `WHERE tenant_id = '${escapedTenantId}' AND event_type = 'llm_call'`;

    if (escapedProjectId) {
      whereClause += ` AND project_id = '${escapedProjectId}'`;
    }

    if (startTime) {
      // Tinybird/ClickHouse: parse ISO 8601 (including milliseconds + Z) safely into DateTime64(3)
      whereClause += ` AND timestamp >= parseDateTime64BestEffort('${startTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    if (endTime) {
      // Tinybird/ClickHouse: parse ISO 8601 (including milliseconds + Z) safely into DateTime64(3)
      whereClause += ` AND timestamp <= parseDateTime64BestEffort('${endTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    // Extract token fields from attributes_json.llm_call
    // Use toInt64OrNull to avoid query failure when the value is missing/empty/non-numeric.
    const totalTokensExpr = `toInt64OrNull(JSONExtractString(attributes_json, '$.llm_call.total_tokens'))`;
    const inputTokensExpr = `toInt64OrNull(JSONExtractString(attributes_json, '$.llm_call.input_tokens'))`;
    const outputTokensExpr = `toInt64OrNull(JSONExtractString(attributes_json, '$.llm_call.output_tokens'))`;
    const modelExpr = `JSONExtractString(attributes_json, '$.llm_call.model')`;

    const sql = `
      SELECT 
        ${modelExpr} as model,
        sum(${totalTokensExpr}) as total_tokens,
        sum(${inputTokensExpr}) as input_tokens,
        sum(${outputTokensExpr}) as output_tokens,
        avg(${totalTokensExpr}) as avg_tokens,
        count(DISTINCT trace_id) as trace_count
      FROM canonical_events
      ${whereClause}
        AND ${totalTokensExpr} IS NOT NULL
        AND ${totalTokensExpr} > 0
      GROUP BY model
    `;

    try {
      const result = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });
      const results = Array.isArray(result) ? result : result?.data || [];

      let totalTokens = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalTraces = 0;
      const tokensByModel: Record<string, { total: number; avg: number }> = {};

      for (const row of results) {
        const tokens = parseInt(row.total_tokens) || 0;
        const inputTokens = parseInt(row.input_tokens) || 0;
        const outputTokens = parseInt(row.output_tokens) || 0;
        const traces = parseInt(row.trace_count) || 0;
        const model = row.model || "unknown";
        const avgTokens = parseFloat(row.avg_tokens) || 0;

        totalTokens += tokens;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalTraces += traces;
        tokensByModel[model] = {
          total: tokens,
          avg: avgTokens,
        };
      }

      return {
        total_tokens: totalTokens,
        avg_tokens_per_trace: totalTraces > 0 ? totalTokens / totalTraces : 0,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        tokens_by_model: tokensByModel,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get token metrics:",
        errorMessage
      );
      
      // If it's a permission error, log it clearly
      if (errorMessage.includes("permissions") || errorMessage.includes("403")) {
        console.error(
          "[DashboardMetricsService] ⚠️  Tinybird token missing DATASOURCES:READ:canonical_events permission"
        );
      }
      
      return {
        total_tokens: 0,
        avg_tokens_per_trace: 0,
        input_tokens: 0,
        output_tokens: 0,
        tokens_by_model: {},
      };
    }
  }

  /**
   * Get trace count for a time period from Tinybird canonical_events
   */
  static async getTraceCount(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<number> {
    // SECURITY: Validate tenantId format (UUID) to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format: must be a valid UUID");
    }
    
    // SECURITY: Validate projectId format if provided
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format: must be a valid UUID");
    }
    
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    let sql = `
      SELECT count(DISTINCT trace_id) as count
      FROM canonical_events
      WHERE tenant_id = '${escapedTenantId}'
        AND event_type IN ('trace_start', 'llm_call')
        ${escapedProjectId ? `AND project_id = '${escapedProjectId}'` : ""}
        ${
          startTime
            ? `AND timestamp >= parseDateTime64BestEffort('${startTime.replace(
                /'/g,
                "''"
              )}', 3)`
            : ""
        }
        ${
          endTime
            ? `AND timestamp <= parseDateTime64BestEffort('${endTime.replace(
                /'/g,
                "''"
              )}', 3)`
            : ""
        }
    `;

    try {
      const result = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });
      // Handle Tinybird response format
      const results = Array.isArray(result) ? result : result?.data || [];
      return parseInt(results[0]?.count || "0", 10);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get trace count:",
        errorMessage
      );
      
      // If it's a permission error, log it clearly
      if (errorMessage.includes("permissions") || errorMessage.includes("403")) {
        console.error(
          "[DashboardMetricsService] ⚠️  Tinybird token missing DATASOURCES:READ:canonical_events permission"
        );
      }
      
      return 0;
    }
  }

  /**
   * Get time-series metrics aggregated by time intervals (hourly/daily/weekly)
   * Returns metrics for chart visualization
   */
  static async getTimeSeriesMetrics(
    tenantId: string,
    projectId: string | null | undefined,
    startTime: string | undefined,
    endTime: string | undefined,
    interval: "hour" | "day" | "week" = "hour"
  ): Promise<Array<{
    timestamp: string;
    latency: { p50: number; p95: number; p99: number };
    error_rate: number;
    cost: number;
    tokens: number;
    trace_count: number;
  }>> {
    // SECURITY: Validate tenantId format (UUID) to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format: must be a valid UUID");
    }
    
    // SECURITY: Validate projectId format if provided
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format: must be a valid UUID");
    }
    
    if (!startTime || !endTime) {
      throw new Error("startTime and endTime are required for time-series metrics");
    }

    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    // Determine time grouping function based on interval
    let timeGroupExpr: string;
    switch (interval) {
      case "hour":
        timeGroupExpr = "toStartOfHour(timestamp)";
        break;
      case "day":
        timeGroupExpr = "toStartOfDay(timestamp)";
        break;
      case "week":
        timeGroupExpr = "toStartOfWeek(timestamp)";
        break;
      default:
        timeGroupExpr = "toStartOfHour(timestamp)";
    }

    // Build WHERE clause
    let whereClause = `WHERE tenant_id = '${escapedTenantId}'`;
    if (escapedProjectId) {
      whereClause += ` AND project_id = '${escapedProjectId}'`;
    }
    whereClause += ` AND timestamp >= parseDateTime64BestEffort('${startTime.replace(/'/g, "''")}', 3)`;
    whereClause += ` AND timestamp <= parseDateTime64BestEffort('${endTime.replace(/'/g, "''")}', 3)`;

    // Extract expressions
    const latencyExpr = `toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))`;
    const costExpr = `toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.cost'))`;
    const totalTokensExpr = `toInt64OrNull(JSONExtractString(attributes_json, '$.llm_call.total_tokens'))`;

    try {
      // Query for latency metrics by time bucket
      const latencySql = `
        SELECT 
          ${timeGroupExpr} as time_bucket,
          quantile(0.5)(${latencyExpr}) as p50,
          quantile(0.95)(${latencyExpr}) as p95,
          quantile(0.99)(${latencyExpr}) as p99
        FROM canonical_events
        ${whereClause}
          AND event_type = 'llm_call'
          AND ${latencyExpr} IS NOT NULL
          AND ${latencyExpr} > 0
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
      `;

      // Query for error rate by time bucket
      const errorRateSql = `
        SELECT 
          ${timeGroupExpr} as time_bucket,
          count(DISTINCT CASE WHEN event_type = 'error' THEN trace_id END) as errors,
          count(DISTINCT CASE WHEN event_type IN ('trace_start', 'llm_call') THEN trace_id END) as total
        FROM canonical_events
        ${whereClause}
          AND event_type IN ('trace_start', 'llm_call', 'error')
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
      `;

      // Query for cost by time bucket
      const costSql = `
        SELECT 
          ${timeGroupExpr} as time_bucket,
          sum(${costExpr}) as cost
        FROM canonical_events
        ${whereClause}
          AND event_type = 'llm_call'
          AND ${costExpr} IS NOT NULL
          AND ${costExpr} > 0
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
      `;

      // Query for tokens by time bucket
      const tokensSql = `
        SELECT 
          ${timeGroupExpr} as time_bucket,
          sum(${totalTokensExpr}) as tokens
        FROM canonical_events
        ${whereClause}
          AND event_type = 'llm_call'
          AND ${totalTokensExpr} IS NOT NULL
          AND ${totalTokensExpr} > 0
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
      `;

      // Query for trace count by time bucket
      const traceCountSql = `
        SELECT 
          ${timeGroupExpr} as time_bucket,
          count(DISTINCT trace_id) as trace_count
        FROM canonical_events
        ${whereClause}
          AND event_type IN ('trace_start', 'llm_call')
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
      `;

      // Execute all queries in parallel
      const [latencyResult, errorRateResult, costResult, tokensResult, traceCountResult] = await Promise.all([
        TinybirdRepository.rawQuery(latencySql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(errorRateSql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(costSql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(tokensSql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(traceCountSql, { tenantId, projectId: projectId || undefined }),
      ]);

      // Parse results
      const latencyData = Array.isArray(latencyResult) ? latencyResult : latencyResult?.data || [];
      const errorRateData = Array.isArray(errorRateResult) ? errorRateResult : errorRateResult?.data || [];
      const costData = Array.isArray(costResult) ? costResult : costResult?.data || [];
      const tokensData = Array.isArray(tokensResult) ? tokensResult : tokensResult?.data || [];
      const traceCountData = Array.isArray(traceCountResult) ? traceCountResult : traceCountResult?.data || [];

      // Create maps for quick lookup
      const latencyMap = new Map<string, { p50: number; p95: number; p99: number }>();
      for (const row of latencyData) {
        const bucket = row.time_bucket;
        latencyMap.set(bucket, {
          p50: parseFloat(row.p50) || 0,
          p95: parseFloat(row.p95) || 0,
          p99: parseFloat(row.p99) || 0,
        });
      }

      const errorRateMap = new Map<string, number>();
      for (const row of errorRateData) {
        const bucket = row.time_bucket;
        const total = parseInt(row.total) || 0;
        const errors = parseInt(row.errors) || 0;
        errorRateMap.set(bucket, total > 0 ? (errors / total) * 100 : 0);
      }

      const costMap = new Map<string, number>();
      for (const row of costData) {
        costMap.set(row.time_bucket, parseFloat(row.cost) || 0);
      }

      const tokensMap = new Map<string, number>();
      for (const row of tokensData) {
        tokensMap.set(row.time_bucket, parseInt(row.tokens) || 0);
      }

      const traceCountMap = new Map<string, number>();
      for (const row of traceCountData) {
        traceCountMap.set(row.time_bucket, parseInt(row.trace_count) || 0);
      }

      // Get all unique time buckets
      const allBuckets = new Set<string>();
      latencyData.forEach((r: any) => allBuckets.add(r.time_bucket));
      errorRateData.forEach((r: any) => allBuckets.add(r.time_bucket));
      costData.forEach((r: any) => allBuckets.add(r.time_bucket));
      tokensData.forEach((r: any) => allBuckets.add(r.time_bucket));
      traceCountData.forEach((r: any) => allBuckets.add(r.time_bucket));

      // Combine into time series array
      const series = Array.from(allBuckets)
        .sort()
        .map((bucket) => ({
          timestamp: bucket,
          latency: latencyMap.get(bucket) || { p50: 0, p95: 0, p99: 0 },
          error_rate: errorRateMap.get(bucket) || 0,
          cost: costMap.get(bucket) || 0,
          tokens: tokensMap.get(bucket) || 0,
          trace_count: traceCountMap.get(bucket) || 0,
        }));

      return series;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get time-series metrics:",
        errorMessage
      );
      return [];
    }
  }

  /**
   * Get metrics comparison between current period and previous period
   * Returns percentage changes for trend indicators
   */
  static async getMetricsComparison(
    tenantId: string,
    projectId: string | null | undefined,
    startTime: string | undefined,
    endTime: string | undefined
  ): Promise<{
    trace_count: { current: number; previous: number; change: number; change_percent: number };
    error_rate: { current: number; previous: number; change: number; change_percent: number };
    latency_p95: { current: number; previous: number; change: number; change_percent: number };
    cost: { current: number; previous: number; change: number; change_percent: number };
    tokens: { current: number; previous: number; change: number; change_percent: number };
  }> {
    // SECURITY: Validate tenantId format (UUID) to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format: must be a valid UUID");
    }
    
    // SECURITY: Validate projectId format if provided
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format: must be a valid UUID");
    }

    if (!startTime || !endTime) {
      throw new Error("startTime and endTime are required for metrics comparison");
    }

    try {
      // Calculate previous period (same duration before startTime)
      const start = new Date(startTime);
      const end = new Date(endTime);
      const duration = end.getTime() - start.getTime();
      const previousEnd = new Date(start);
      const previousStart = new Date(previousEnd.getTime() - duration);

      const previousStartTime = previousStart.toISOString();
      const previousEndTime = previousEnd.toISOString();

      // Get current period metrics
      const [
        currentTraceCount,
        currentErrorRate,
        currentLatency,
        currentCost,
        currentTokens,
      ] = await Promise.all([
        this.getTraceCount(tenantId, projectId, startTime, endTime),
        this.getErrorRateMetrics(tenantId, projectId, startTime, endTime),
        this.getLatencyMetrics(tenantId, projectId, startTime, endTime),
        this.getCostMetrics(tenantId, projectId, startTime, endTime),
        this.getTokenMetrics(tenantId, projectId, startTime, endTime),
      ]);

      // Get previous period metrics
      const [
        previousTraceCount,
        previousErrorRate,
        previousLatency,
        previousCost,
        previousTokens,
      ] = await Promise.all([
        this.getTraceCount(tenantId, projectId, previousStartTime, previousEndTime),
        this.getErrorRateMetrics(tenantId, projectId, previousStartTime, previousEndTime),
        this.getLatencyMetrics(tenantId, projectId, previousStartTime, previousEndTime),
        this.getCostMetrics(tenantId, projectId, previousStartTime, previousEndTime),
        this.getTokenMetrics(tenantId, projectId, previousStartTime, previousEndTime),
      ]);

      const currentLatencyMetrics = currentLatency as LatencyMetrics;
      const previousLatencyMetrics = previousLatency as LatencyMetrics;

      // Helper function to calculate change
      const calculateChange = (current: number, previous: number) => {
        const change = current - previous;
        const changePercent = previous > 0 ? (change / previous) * 100 : (current > 0 ? 100 : 0);
        return { change, change_percent: parseFloat(changePercent.toFixed(2)) };
      };

      return {
        trace_count: {
          current: currentTraceCount,
          previous: previousTraceCount,
          ...calculateChange(currentTraceCount, previousTraceCount),
        },
        error_rate: {
          current: currentErrorRate.error_rate,
          previous: previousErrorRate.error_rate,
          ...calculateChange(currentErrorRate.error_rate, previousErrorRate.error_rate),
        },
        latency_p95: {
          current: currentLatencyMetrics.p95,
          previous: previousLatencyMetrics.p95,
          ...calculateChange(currentLatencyMetrics.p95, previousLatencyMetrics.p95),
        },
        cost: {
          current: currentCost.total_cost,
          previous: previousCost.total_cost,
          ...calculateChange(currentCost.total_cost, previousCost.total_cost),
        },
        tokens: {
          current: currentTokens.total_tokens,
          previous: previousTokens.total_tokens,
          ...calculateChange(currentTokens.total_tokens, previousTokens.total_tokens),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get metrics comparison:",
        errorMessage
      );
      throw error;
    }
  }

  /**
   * Get detailed metrics breakdowns
   * Returns error types, latency distribution, cost by model, token usage by model
   */
  static async getMetricsBreakdown(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<{
    error_types: Array<{ type: string; count: number; percentage: number }>;
    latency_distribution: Array<{ bucket: string; count: number; percentage: number }>;
    cost_by_model: Array<{ model: string; cost: number; percentage: number }>;
    tokens_by_model: Array<{ model: string; tokens: number; percentage: number }>;
  }> {
    // SECURITY: Validate tenantId format (UUID) to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format: must be a valid UUID");
    }
    
    // SECURITY: Validate projectId format if provided
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format: must be a valid UUID");
    }

    try {
      // Get error rate metrics (includes error_types)
      const errorRateMetrics = await this.getErrorRateMetrics(
        tenantId,
        projectId,
        startTime,
        endTime
      );

      // Get cost metrics (includes cost_by_model)
      const costMetrics = await this.getCostMetrics(
        tenantId,
        projectId,
        startTime,
        endTime
      );

      // Get token metrics (includes tokens_by_model)
      const tokenMetrics = await this.getTokenMetrics(
        tenantId,
        projectId,
        startTime,
        endTime
      );

      // Get latency distribution (histogram buckets)
      const latencyDistribution = await this.getLatencyDistribution(
        tenantId,
        projectId,
        startTime,
        endTime
      );

      // Calculate percentages for error types
      const totalErrors = Object.values(errorRateMetrics.error_types).reduce((sum, count) => sum + count, 0);
      const errorTypes = Object.entries(errorRateMetrics.error_types)
        .map(([type, count]) => ({
          type,
          count,
          percentage: totalErrors > 0 ? parseFloat(((count / totalErrors) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Calculate percentages for cost by model
      const costByModel = Object.entries(costMetrics.cost_by_model)
        .map(([model, cost]) => ({
          model,
          cost: parseFloat(cost.toFixed(4)),
          percentage: costMetrics.total_cost > 0
            ? parseFloat(((cost / costMetrics.total_cost) * 100).toFixed(2))
            : 0,
        }))
        .sort((a, b) => b.cost - a.cost);

      // Calculate percentages for tokens by model
      const tokensByModel = Object.entries(tokenMetrics.tokens_by_model)
        .map(([model, data]) => ({
          model,
          tokens: data.total,
          percentage: tokenMetrics.total_tokens > 0
            ? parseFloat(((data.total / tokenMetrics.total_tokens) * 100).toFixed(2))
            : 0,
        }))
        .sort((a, b) => b.tokens - a.tokens);

      return {
        error_types: errorTypes,
        latency_distribution: latencyDistribution,
        cost_by_model: costByModel,
        tokens_by_model: tokensByModel,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get metrics breakdown:",
        errorMessage
      );
      throw error;
    }
  }

  /**
   * Get latency distribution (histogram buckets)
   * Helper method for getMetricsBreakdown
   */
  private static async getLatencyDistribution(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<Array<{ bucket: string; count: number; percentage: number }>> {
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    let whereClause = `WHERE tenant_id = '${escapedTenantId}' AND event_type = 'llm_call'`;
    if (escapedProjectId) {
      whereClause += ` AND project_id = '${escapedProjectId}'`;
    }
    if (startTime) {
      whereClause += ` AND timestamp >= parseDateTime64BestEffort('${startTime.replace(/'/g, "''")}', 3)`;
    }
    if (endTime) {
      whereClause += ` AND timestamp <= parseDateTime64BestEffort('${endTime.replace(/'/g, "''")}', 3)`;
    }

    const latencyExpr = `toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))`;

    // Create latency buckets: <100ms, 100-500ms, 500ms-1s, 1s-5s, >5s
    const sql = `
      SELECT 
        CASE
          WHEN ${latencyExpr} < 100 THEN '<100ms'
          WHEN ${latencyExpr} < 500 THEN '100-500ms'
          WHEN ${latencyExpr} < 1000 THEN '500ms-1s'
          WHEN ${latencyExpr} < 5000 THEN '1s-5s'
          ELSE '>5s'
        END as bucket,
        count(*) as count
      FROM canonical_events
      ${whereClause}
        AND ${latencyExpr} IS NOT NULL
        AND ${latencyExpr} > 0
      GROUP BY bucket
      ORDER BY 
        CASE bucket
          WHEN '<100ms' THEN 1
          WHEN '100-500ms' THEN 2
          WHEN '500ms-1s' THEN 3
          WHEN '1s-5s' THEN 4
          WHEN '>5s' THEN 5
        END
    `;

    try {
      const result = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });
      const results = Array.isArray(result) ? result : result?.data || [];

      const total = results.reduce((sum: number, row: any) => sum + parseInt(row.count || 0), 0);

      return results.map((row: any) => ({
        bucket: row.bucket || "unknown",
        count: parseInt(row.count) || 0,
        percentage: total > 0 ? parseFloat((((parseInt(row.count) || 0) / total) * 100).toFixed(2)) : 0,
      }));
    } catch (error) {
      console.error(
        "[DashboardMetricsService] Failed to get latency distribution:",
        error
      );
      return [];
    }
  }
}

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
      console.error(
        "[DashboardMetricsService] Failed to get latency metrics:",
        error
      );
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
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    // Build WHERE clause for Tinybird
    let baseWhereClause = `WHERE tenant_id = '${escapedTenantId}'`;

    if (escapedProjectId) {
      baseWhereClause += ` AND project_id = '${escapedProjectId}'`;
    }

    if (startTime) {
      baseWhereClause += ` AND timestamp >= '${startTime.replace(/'/g, "''")}'`;
    }

    if (endTime) {
      baseWhereClause += ` AND timestamp <= '${endTime.replace(/'/g, "''")}'`;
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
      console.error(
        "[DashboardMetricsService] Failed to get error rate metrics:",
        error
      );
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
      console.error(
        "[DashboardMetricsService] Failed to get cost metrics:",
        error
      );
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
      console.error(
        "[DashboardMetricsService] Failed to get token metrics:",
        error
      );
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
      console.error(
        "[DashboardMetricsService] Failed to get trace count:",
        error
      );
      return 0;
    }
  }
}

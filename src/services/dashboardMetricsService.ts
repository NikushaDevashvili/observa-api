/**
 * Dashboard Metrics Service
 *
 * SOTA: Aggregates metrics from Tinybird canonical_events (OLAP data plane) for dashboard display
 * Provides latency percentiles, error rates, cost metrics, etc.
 * Falls back to PostgreSQL analysis_results when Tinybird returns no data.
 */

import { SignalsQueryService } from "./signalsQueryService.js";
import { TinybirdRepository } from "./tinybirdRepository.js";
import { query } from "../db/client.js";

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

export interface FeedbackMetrics {
  total: number;
  likes: number;
  dislikes: number;
  ratings: number;
  corrections: number;
  feedback_rate: number; // Percentage of traces with feedback
  avg_rating: number; // Average rating (1-5 scale)
  with_comments: number; // Feedback with comments
  by_outcome: {
    success: number;
    failure: number;
    partial: number;
    unknown: number;
  };
  by_type: {
    like: number;
    dislike: number;
    rating: number;
    correction: number;
  };
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
      
      const count = parseInt(row.count) || 0;
      
      // If Tinybird returns 0 count, fall back to PostgreSQL
      if (count === 0) {
        console.log("[DashboardMetricsService] Tinybird latency count is 0, falling back to PostgreSQL");
        return await this.getLatencyFromPostgres(tenantId, projectId, startTime, endTime);
      }

      return {
        p50: parseFloat(row.p50) || 0,
        p95: parseFloat(row.p95) || 0,
        p99: parseFloat(row.p99) || 0,
        avg: parseFloat(row.avg) || 0,
        min: parseFloat(row.min) || 0,
        max: parseFloat(row.max) || 0,
        count: count,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get latency metrics from Tinybird:",
        errorMessage
      );
      
      // Fallback to PostgreSQL
      console.log("[DashboardMetricsService] Falling back to PostgreSQL for latency metrics");
      return await this.getLatencyFromPostgres(tenantId, projectId, startTime, endTime);
    }
  }

  /**
   * Get latency metrics from PostgreSQL analysis_results (fallback)
   */
  private static async getLatencyFromPostgres(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<LatencyMetrics> {
    try {
      let whereClause = "WHERE tenant_id = $1 AND latency_ms IS NOT NULL AND latency_ms > 0";
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      if (startTime) {
        whereClause += ` AND timestamp >= $${paramIndex}`;
        params.push(new Date(startTime));
        paramIndex++;
      }

      if (endTime) {
        whereClause += ` AND timestamp <= $${paramIndex}`;
        params.push(new Date(endTime));
        paramIndex++;
      }

      const result = await query<{
        p50: string;
        p95: string;
        p99: string;
        avg: string;
        min: string;
        max: string;
        count: string;
      }>(
        `SELECT 
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
          AVG(latency_ms) as avg,
          MIN(latency_ms) as min,
          MAX(latency_ms) as max,
          COUNT(*) as count
        FROM analysis_results ${whereClause}`,
        params
      );
      
      const row = result[0] || {};
      console.log(`[DashboardMetricsService] PostgreSQL latency: p50=${row.p50}, p95=${row.p95}, count=${row.count}`);
      
      return {
        p50: parseFloat(row.p50 || "0"),
        p95: parseFloat(row.p95 || "0"),
        p99: parseFloat(row.p99 || "0"),
        avg: parseFloat(row.avg || "0"),
        min: parseFloat(row.min || "0"),
        max: parseFloat(row.max || "0"),
        count: parseInt(row.count || "0", 10),
      };
    } catch (error) {
      console.error("[DashboardMetricsService] PostgreSQL latency fallback failed:", error);
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

      // If Tinybird returns 0 total, try PostgreSQL fallback
      if (total === 0) {
        console.log("[DashboardMetricsService] Tinybird returned 0 for error rate, falling back to PostgreSQL");
        return await this.getErrorRateFromPostgres(tenantId, projectId, startTime, endTime);
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
        "[DashboardMetricsService] Failed to get error rate metrics from Tinybird:",
        errorMessage
      );
      
      // Fallback to PostgreSQL
      console.log("[DashboardMetricsService] Falling back to PostgreSQL for error rate");
      return await this.getErrorRateFromPostgres(tenantId, projectId, startTime, endTime);
    }
  }

  /**
   * Get error rate from PostgreSQL analysis_results (fallback)
   */
  private static async getErrorRateFromPostgres(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<ErrorRateMetrics> {
    try {
      let whereClause = "WHERE tenant_id = $1";
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      if (startTime) {
        whereClause += ` AND timestamp >= $${paramIndex}`;
        params.push(new Date(startTime));
        paramIndex++;
      }

      if (endTime) {
        whereClause += ` AND timestamp <= $${paramIndex}`;
        params.push(new Date(endTime));
        paramIndex++;
      }

      const result = await query<{ total: string; errors: string }>(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status >= 400) as errors
        FROM analysis_results ${whereClause}`,
        params
      );
      
      const total = parseInt(result[0]?.total || "0", 10);
      const errors = parseInt(result[0]?.errors || "0", 10);
      
      console.log(`[DashboardMetricsService] PostgreSQL error rate: ${errors}/${total}`);
      
      return {
        total,
        errors,
        error_rate: total > 0 ? (errors / total) * 100 : 0,
        error_types: {},
      };
    } catch (error) {
      console.error("[DashboardMetricsService] PostgreSQL error rate fallback failed:", error);
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

      // If Tinybird returns 0, try PostgreSQL fallback
      if (totalCost === 0) {
        console.log("[DashboardMetricsService] Tinybird returned 0 for cost, falling back to PostgreSQL");
        return await this.getCostFromPostgres(tenantId, projectId, startTime, endTime);
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
        "[DashboardMetricsService] Failed to get cost metrics from Tinybird:",
        errorMessage
      );
      
      // Fallback to PostgreSQL
      console.log("[DashboardMetricsService] Falling back to PostgreSQL for cost metrics");
      return await this.getCostFromPostgres(tenantId, projectId, startTime, endTime);
    }
  }

  /**
   * Get cost metrics from PostgreSQL analysis_results (fallback)
   * Uses estimated cost calculation based on tokens and model
   */
  private static async getCostFromPostgres(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<CostMetrics> {
    try {
      let whereClause = "WHERE tenant_id = $1";
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      if (startTime) {
        whereClause += ` AND timestamp >= $${paramIndex}`;
        params.push(new Date(startTime));
        paramIndex++;
      }

      if (endTime) {
        whereClause += ` AND timestamp <= $${paramIndex}`;
        params.push(new Date(endTime));
        paramIndex++;
      }

      // Estimate cost based on tokens (rough estimate: $0.002 per 1K tokens)
      const result = await query<{
        total_cost: string;
        trace_count: string;
        model: string;
      }>(
        `SELECT 
          model,
          SUM(COALESCE(tokens_total, 0) * 0.000002) as total_cost,
          COUNT(*) as trace_count
        FROM analysis_results 
        ${whereClause}
        GROUP BY model`,
        params
      );
      
      let totalCost = 0;
      let totalTraces = 0;
      const costByModel: Record<string, number> = {};

      for (const row of result) {
        const cost = parseFloat(row.total_cost || "0");
        const traces = parseInt(row.trace_count || "0", 10);
        const model = row.model || "unknown";

        totalCost += cost;
        totalTraces += traces;
        if (model !== "unknown") {
          costByModel[model] = cost;
        }
      }
      
      console.log(`[DashboardMetricsService] PostgreSQL cost: $${totalCost.toFixed(4)}, ${totalTraces} traces`);
      
      return {
        total_cost: totalCost,
        avg_cost_per_trace: totalTraces > 0 ? totalCost / totalTraces : 0,
        cost_by_model: costByModel,
        cost_by_route: {},
      };
    } catch (error) {
      console.error("[DashboardMetricsService] PostgreSQL cost fallback failed:", error);
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

      // If Tinybird returns 0, try PostgreSQL fallback
      if (totalTokens === 0) {
        console.log("[DashboardMetricsService] Tinybird returned 0 for tokens, falling back to PostgreSQL");
        return await this.getTokensFromPostgres(tenantId, projectId, startTime, endTime);
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
        "[DashboardMetricsService] Failed to get token metrics from Tinybird:",
        errorMessage
      );
      
      // Fallback to PostgreSQL
      console.log("[DashboardMetricsService] Falling back to PostgreSQL for token metrics");
      return await this.getTokensFromPostgres(tenantId, projectId, startTime, endTime);
    }
  }

  /**
   * Get token metrics from PostgreSQL analysis_results (fallback)
   */
  private static async getTokensFromPostgres(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<TokenMetrics> {
    try {
      let whereClause = "WHERE tenant_id = $1";
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      if (startTime) {
        whereClause += ` AND timestamp >= $${paramIndex}`;
        params.push(new Date(startTime));
        paramIndex++;
      }

      if (endTime) {
        whereClause += ` AND timestamp <= $${paramIndex}`;
        params.push(new Date(endTime));
        paramIndex++;
      }

      const result = await query<{
        model: string;
        total_tokens: string;
        input_tokens: string;
        output_tokens: string;
        avg_tokens: string;
        trace_count: string;
      }>(
        `SELECT 
          model,
          SUM(COALESCE(tokens_total, 0)) as total_tokens,
          SUM(COALESCE(tokens_prompt, 0)) as input_tokens,
          SUM(COALESCE(tokens_completion, 0)) as output_tokens,
          AVG(COALESCE(tokens_total, 0)) as avg_tokens,
          COUNT(*) as trace_count
        FROM analysis_results 
        ${whereClause}
        GROUP BY model`,
        params
      );
      
      let totalTokens = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalTraces = 0;
      const tokensByModel: Record<string, { total: number; avg: number }> = {};

      for (const row of result) {
        const tokens = parseInt(row.total_tokens || "0", 10);
        const inputTokens = parseInt(row.input_tokens || "0", 10);
        const outputTokens = parseInt(row.output_tokens || "0", 10);
        const traces = parseInt(row.trace_count || "0", 10);
        const model = row.model || "unknown";
        const avgTokens = parseFloat(row.avg_tokens || "0");

        totalTokens += tokens;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalTraces += traces;
        if (model !== "unknown") {
          tokensByModel[model] = {
            total: tokens,
            avg: avgTokens,
          };
        }
      }
      
      console.log(`[DashboardMetricsService] PostgreSQL tokens: ${totalTokens} total, ${totalTraces} traces`);
      
      return {
        total_tokens: totalTokens,
        avg_tokens_per_trace: totalTraces > 0 ? totalTokens / totalTraces : 0,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        tokens_by_model: tokensByModel,
      };
    } catch (error) {
      console.error("[DashboardMetricsService] PostgreSQL token fallback failed:", error);
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
   * Get feedback metrics from Tinybird canonical_events
   * Feedback events have event_type='feedback' with data in attributes_json.feedback
   */
  static async getFeedbackMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<FeedbackMetrics> {
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
    let whereClause = `WHERE tenant_id = '${escapedTenantId}' AND event_type = 'feedback'`;

    if (escapedProjectId) {
      whereClause += ` AND project_id = '${escapedProjectId}'`;
    }

    if (startTime) {
      whereClause += ` AND timestamp >= parseDateTime64BestEffort('${startTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    if (endTime) {
      whereClause += ` AND timestamp <= parseDateTime64BestEffort('${endTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    // Extract feedback fields from attributes_json.feedback
    const feedbackTypeExpr = `JSONExtractString(attributes_json, '$.feedback.type')`;
    const feedbackRatingExpr = `toFloat64OrNull(JSONExtractString(attributes_json, '$.feedback.rating'))`;
    const feedbackOutcomeExpr = `JSONExtractString(attributes_json, '$.feedback.outcome')`;
    const feedbackCommentExpr = `JSONExtractString(attributes_json, '$.feedback.comment')`;

    try {
      // Get all feedback events (we'll aggregate in memory for better flexibility)
      const feedbackSql = `
        SELECT 
          ${feedbackTypeExpr} as type,
          ${feedbackOutcomeExpr} as outcome,
          ${feedbackRatingExpr} as rating,
          ${feedbackCommentExpr} as comment
        FROM canonical_events
        ${whereClause}
      `;

      const result = await TinybirdRepository.rawQuery(feedbackSql, {
        tenantId,
        projectId: projectId || undefined,
      });
      const results = Array.isArray(result) ? result : result?.data || [];

      // Initialize counters
      let total = 0;
      let likes = 0;
      let dislikes = 0;
      let ratings = 0;
      let corrections = 0;
      let withComments = 0;
      let ratingSum = 0;
      let ratingCount = 0;
      const byOutcome = {
        success: 0,
        failure: 0,
        partial: 0,
        unknown: 0,
      };
      const byType = {
        like: 0,
        dislike: 0,
        rating: 0,
        correction: 0,
      };

      // Aggregate results
      for (const row of results) {
        total += 1;
        
        const type = (row.type || "").toLowerCase();
        const outcome = (row.outcome || "unknown").toLowerCase();
        const rating = parseFloat(row.rating) || null;
        const comment = row.comment || "";
        const hasComment = comment && comment.trim() !== "" && comment.toLowerCase() !== "null";

        // Count by type
        if (type === "like") {
          likes += 1;
          byType.like += 1;
        } else if (type === "dislike") {
          dislikes += 1;
          byType.dislike += 1;
        } else if (type === "rating") {
          ratings += 1;
          byType.rating += 1;
          if (rating !== null && !isNaN(rating)) {
            ratingSum += rating;
            ratingCount += 1;
          }
        } else if (type === "correction") {
          corrections += 1;
          byType.correction += 1;
        }

        // Count by outcome
        if (outcome === "success") {
          byOutcome.success += 1;
        } else if (outcome === "failure") {
          byOutcome.failure += 1;
        } else if (outcome === "partial") {
          byOutcome.partial += 1;
        } else {
          byOutcome.unknown += 1;
        }

        // Count feedback with comments
        if (hasComment) {
          withComments += 1;
        }
      }

      // Get total trace count to calculate feedback rate
      const traceCount = await this.getTraceCount(tenantId, projectId, startTime, endTime);
      const feedbackRate = traceCount > 0 ? (total / traceCount) * 100 : 0;

      // Calculate average rating
      const avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

      // If Tinybird returns 0, try PostgreSQL fallback
      if (total === 0 && traceCount > 0) {
        console.log("[DashboardMetricsService] Tinybird returned 0 for feedback, falling back to PostgreSQL");
        return await this.getFeedbackFromPostgres(tenantId, projectId, startTime, endTime, traceCount);
      }

      return {
        total,
        likes,
        dislikes,
        ratings,
        corrections,
        feedback_rate: parseFloat(feedbackRate.toFixed(2)),
        avg_rating: parseFloat(avgRating.toFixed(2)),
        with_comments: withComments,
        by_outcome: byOutcome,
        by_type: byType,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get feedback metrics from Tinybird:",
        errorMessage
      );
      
      // Fallback to PostgreSQL
      console.log("[DashboardMetricsService] Falling back to PostgreSQL for feedback metrics");
      const traceCount = await this.getTraceCount(tenantId, projectId, startTime, endTime);
      return await this.getFeedbackFromPostgres(tenantId, projectId, startTime, endTime, traceCount);
    }
  }

  /**
   * Get feedback metrics from PostgreSQL (fallback)
   * Note: PostgreSQL doesn't store feedback events directly, so this returns empty metrics
   */
  private static async getFeedbackFromPostgres(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string,
    traceCount: number = 0
  ): Promise<FeedbackMetrics> {
    // PostgreSQL doesn't store feedback events in analysis_results
    // This is a placeholder for future implementation if needed
    console.log("[DashboardMetricsService] PostgreSQL feedback fallback - no feedback data in PostgreSQL");
    return {
      total: 0,
      likes: 0,
      dislikes: 0,
      ratings: 0,
      corrections: 0,
      feedback_rate: 0,
      avg_rating: 0,
      with_comments: 0,
      by_outcome: {
        success: 0,
        failure: 0,
        partial: 0,
        unknown: 0,
      },
      by_type: {
        like: 0,
        dislike: 0,
        rating: 0,
        correction: 0,
      },
    };
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
      const tinybirdCount = parseInt(results[0]?.count || "0", 10);
      
      // If Tinybird returns 0, try PostgreSQL fallback
      if (tinybirdCount === 0) {
        console.log("[DashboardMetricsService] Tinybird returned 0, falling back to PostgreSQL");
        return await this.getTraceCountFromPostgres(tenantId, projectId, startTime, endTime);
      }
      
      return tinybirdCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get trace count from Tinybird:",
        errorMessage
      );
      
      // Fallback to PostgreSQL
      console.log("[DashboardMetricsService] Falling back to PostgreSQL for trace count");
      return await this.getTraceCountFromPostgres(tenantId, projectId, startTime, endTime);
    }
  }

  /**
   * Get trace count from PostgreSQL analysis_results (fallback)
   */
  private static async getTraceCountFromPostgres(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<number> {
    try {
      let whereClause = "WHERE tenant_id = $1";
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      if (startTime) {
        whereClause += ` AND timestamp >= $${paramIndex}`;
        params.push(new Date(startTime));
        paramIndex++;
      }

      if (endTime) {
        whereClause += ` AND timestamp <= $${paramIndex}`;
        params.push(new Date(endTime));
        paramIndex++;
      }

      const result = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM analysis_results ${whereClause}`,
        params
      );
      
      const count = parseInt(result[0]?.count || "0", 10);
      console.log(`[DashboardMetricsService] PostgreSQL trace count: ${count}`);
      return count;
    } catch (error) {
      console.error("[DashboardMetricsService] PostgreSQL fallback failed:", error);
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
    feedback: { total: number; likes: number; dislikes: number; feedback_rate: number };
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

      // Query for feedback by time bucket
      const feedbackTypeExpr = `JSONExtractString(attributes_json, '$.feedback.type')`;
      const feedbackSql = `
        SELECT 
          ${timeGroupExpr} as time_bucket,
          count(*) as total,
          sum(CASE WHEN ${feedbackTypeExpr} = 'like' THEN 1 ELSE 0 END) as likes,
          sum(CASE WHEN ${feedbackTypeExpr} = 'dislike' THEN 1 ELSE 0 END) as dislikes
        FROM canonical_events
        ${whereClause}
          AND event_type = 'feedback'
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
      `;

      // Execute all queries in parallel
      const [latencyResult, errorRateResult, costResult, tokensResult, traceCountResult, feedbackResult] = await Promise.all([
        TinybirdRepository.rawQuery(latencySql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(errorRateSql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(costSql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(tokensSql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(traceCountSql, { tenantId, projectId: projectId || undefined }),
        TinybirdRepository.rawQuery(feedbackSql, { tenantId, projectId: projectId || undefined }),
      ]);

      // Parse results
      const latencyData = Array.isArray(latencyResult) ? latencyResult : latencyResult?.data || [];
      const errorRateData = Array.isArray(errorRateResult) ? errorRateResult : errorRateResult?.data || [];
      const costData = Array.isArray(costResult) ? costResult : costResult?.data || [];
      const tokensData = Array.isArray(tokensResult) ? tokensResult : tokensResult?.data || [];
      const traceCountData = Array.isArray(traceCountResult) ? traceCountResult : traceCountResult?.data || [];
      const feedbackData = Array.isArray(feedbackResult) ? feedbackResult : feedbackResult?.data || [];

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

      const feedbackMap = new Map<string, { total: number; likes: number; dislikes: number }>();
      for (const row of feedbackData) {
        const total = parseInt(row.total) || 0;
        const likes = parseInt(row.likes) || 0;
        const dislikes = parseInt(row.dislikes) || 0;
        feedbackMap.set(row.time_bucket, { total, likes, dislikes });
      }

      // Get all unique time buckets
      const allBuckets = new Set<string>();
      latencyData.forEach((r: any) => allBuckets.add(r.time_bucket));
      errorRateData.forEach((r: any) => allBuckets.add(r.time_bucket));
      costData.forEach((r: any) => allBuckets.add(r.time_bucket));
      tokensData.forEach((r: any) => allBuckets.add(r.time_bucket));
      traceCountData.forEach((r: any) => allBuckets.add(r.time_bucket));
      feedbackData.forEach((r: any) => allBuckets.add(r.time_bucket));

      // Combine into time series array
      const series = Array.from(allBuckets)
        .filter((bucket) => bucket && bucket.trim() !== '') // Filter out empty buckets
        .sort()
        .map((bucket) => {
          const feedback = feedbackMap.get(bucket) || { total: 0, likes: 0, dislikes: 0 };
          const traceCount = traceCountMap.get(bucket) || 0;
          const feedbackRate = traceCount > 0 ? (feedback.total / traceCount) * 100 : 0;
          
          return {
            timestamp: bucket,
            latency: latencyMap.get(bucket) || { p50: 0, p95: 0, p99: 0 },
            error_rate: errorRateMap.get(bucket) || 0,
            cost: costMap.get(bucket) || 0,
            tokens: tokensMap.get(bucket) || 0,
            trace_count: traceCount,
            feedback: {
              total: feedback.total,
              likes: feedback.likes,
              dislikes: feedback.dislikes,
              feedback_rate: parseFloat(feedbackRate.toFixed(2)),
            },
          };
        });

      // If Tinybird returns empty or all zeros, fall back to PostgreSQL
      const totalTraceCount = series.reduce((sum, item) => sum + item.trace_count, 0);
      if (series.length === 0 || totalTraceCount === 0) {
        console.log("[DashboardMetricsService] Tinybird time-series empty or no traces, falling back to PostgreSQL");
        return await this.getTimeSeriesFromPostgres(tenantId, projectId, startTime, endTime, interval);
      }

      return series;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[DashboardMetricsService] Failed to get time-series metrics from Tinybird:",
        errorMessage
      );
      // Fallback to PostgreSQL
      console.log("[DashboardMetricsService] Falling back to PostgreSQL for time-series");
      return await this.getTimeSeriesFromPostgres(tenantId, projectId, startTime, endTime, interval);
    }
  }

  /**
   * Get time-series metrics from PostgreSQL analysis_results (fallback)
   */
  private static async getTimeSeriesFromPostgres(
    tenantId: string,
    projectId: string | null | undefined,
    startTime: string,
    endTime: string,
    interval: "hour" | "day" | "week" = "day"
  ): Promise<Array<{
    timestamp: string;
    latency: { p50: number; p95: number; p99: number };
    error_rate: number;
    cost: number;
    tokens: number;
    trace_count: number;
    feedback: { total: number; likes: number; dislikes: number; feedback_rate: number };
  }>> {
    try {
      let whereClause = "WHERE tenant_id = $1";
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      // Use COALESCE to handle NULL timestamps, falling back to analyzed_at
      whereClause += ` AND COALESCE(timestamp, analyzed_at) >= $${paramIndex}`;
      params.push(new Date(startTime));
      paramIndex++;

      whereClause += ` AND COALESCE(timestamp, analyzed_at) <= $${paramIndex}`;
      params.push(new Date(endTime));
      paramIndex++;

      // Determine time grouping based on interval
      // Use COALESCE to handle NULL timestamps
      let dateGroup: string;
      switch (interval) {
        case "hour":
          dateGroup = "DATE_TRUNC('hour', COALESCE(timestamp, analyzed_at))";
          break;
        case "week":
          dateGroup = "DATE_TRUNC('week', COALESCE(timestamp, analyzed_at))";
          break;
        case "day":
        default:
          dateGroup = "DATE_TRUNC('day', COALESCE(timestamp, analyzed_at))";
      }

      const result = await query<{
        time_bucket: string;
        trace_count: string;
        p50: string;
        p95: string;
        p99: string;
        total_tokens: string;
        error_count: string;
      }>(
        `SELECT 
          ${dateGroup} as time_bucket,
          COUNT(*) as trace_count,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) as p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) as p99,
          SUM(COALESCE(tokens_total, 0)) as total_tokens,
          COUNT(*) FILTER (WHERE status >= 400) as error_count
        FROM analysis_results
        ${whereClause}
        GROUP BY time_bucket
        ORDER BY time_bucket ASC`,
        params
      );

      const series = result.map((row) => {
        const traceCount = parseInt(row.trace_count || "0", 10);
        const errorCount = parseInt(row.error_count || "0", 10);
        const tokens = parseInt(row.total_tokens || "0", 10);
        
        return {
          timestamp: new Date(row.time_bucket).toISOString(),
          latency: {
            p50: parseFloat(row.p50 || "0"),
            p95: parseFloat(row.p95 || "0"),
            p99: parseFloat(row.p99 || "0"),
          },
          error_rate: traceCount > 0 ? (errorCount / traceCount) * 100 : 0,
          cost: tokens * 0.000002, // Estimated cost
          tokens: tokens,
          trace_count: traceCount,
          feedback: {
            total: 0,
            likes: 0,
            dislikes: 0,
            feedback_rate: 0,
          },
        };
      });

      console.log(`[DashboardMetricsService] PostgreSQL time-series: ${series.length} buckets`);
      return series;
    } catch (error) {
      console.error("[DashboardMetricsService] PostgreSQL time-series fallback failed:", error);
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

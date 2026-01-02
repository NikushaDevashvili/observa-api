/**
 * Dashboard Metrics Service
 * 
 * SOTA: Aggregates metrics from PostgreSQL analysis_results for dashboard display
 * Provides latency percentiles, error rates, cost metrics, etc.
 */

import { query } from "../db/client.js";
import { SignalsQueryService } from "./signalsQueryService.js";

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
   * Get latency metrics (P50, P95, P99) from analysis_results
   */
  static async getLatencyMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string,
    groupBy?: "route" | "model"
  ): Promise<LatencyMetrics | Record<string, LatencyMetrics>> {
    const params: any[] = [tenantId];
    let paramIndex = 1;

    // Build WHERE clause
    let whereClause = "WHERE tenant_id = $1";
    
    if (projectId) {
      paramIndex++;
      params.push(projectId);
      whereClause += ` AND project_id = $${paramIndex}`;
    }

    if (startTime) {
      paramIndex++;
      params.push(startTime);
      whereClause += ` AND COALESCE(timestamp, analyzed_at) >= $${paramIndex}`;
    }

    if (endTime) {
      paramIndex++;
      params.push(endTime);
      whereClause += ` AND COALESCE(timestamp, analyzed_at) <= $${paramIndex}`;
    }

    whereClause += " AND latency_ms IS NOT NULL AND latency_ms > 0";

    if (groupBy) {
      // Only support grouping by "model" for now (route column doesn't exist in analysis_results)
      if (groupBy !== "model") {
        console.warn(`[DashboardMetricsService] Grouping by "${groupBy}" is not supported, falling back to ungrouped query`);
        // Fall through to ungrouped query below
      } else {
        // Grouped query by model
        const sql = `
          SELECT 
            model,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
            percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
            AVG(latency_ms) as avg,
            MIN(latency_ms) as min,
            MAX(latency_ms) as max,
            COUNT(*) as count
          FROM analysis_results
          ${whereClause}
          GROUP BY model
        `;

        try {
          const results = await query(sql, params);

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
          console.error("[DashboardMetricsService] Failed to get latency metrics:", error);
          return {};
        }
      }
    }

    // Ungrouped query (or fallback for unsupported groupBy)
    // Single metrics query
    const sql = `
        SELECT 
          percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
          AVG(latency_ms) as avg,
          MIN(latency_ms) as min,
          MAX(latency_ms) as max,
          COUNT(*) as count
        FROM analysis_results
        ${whereClause}
      `;

    try {
      const results = await query(sql, params);
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
      console.error("[DashboardMetricsService] Failed to get latency metrics:", error);
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
   * Get error rate metrics
   */
  static async getErrorRateMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<ErrorRateMetrics> {
    const params: any[] = [tenantId];
    let paramIndex = 1;

    // Build WHERE clause
    let whereClause = "WHERE tenant_id = $1";
    
    if (projectId) {
      paramIndex++;
      params.push(projectId);
      whereClause += ` AND project_id = $${paramIndex}`;
    }

    if (startTime) {
      paramIndex++;
      params.push(startTime);
      whereClause += ` AND COALESCE(timestamp, analyzed_at) >= $${paramIndex}`;
    }

    if (endTime) {
      paramIndex++;
      params.push(endTime);
      whereClause += ` AND COALESCE(timestamp, analyzed_at) <= $${paramIndex}`;
    }

    try {
      // Get total count
      const totalSql = `SELECT COUNT(*) as total FROM analysis_results ${whereClause}`;
      const totalResult = await query<{ total: string }>(totalSql, params);
      const total = parseInt(totalResult[0]?.total || "0", 10);

      // Get error count - errors are traces where status is not 200 (or not in 200-299 range)
      // Also count traces with error-related status_text
      const errorSql = `
        SELECT COUNT(*) as error_count
        FROM analysis_results
        ${whereClause}
        AND (
          (status IS NOT NULL AND (status < 200 OR status >= 300))
          OR (status_text IS NOT NULL AND LOWER(status_text) LIKE '%error%')
        )
      `;
      const errorResult = await query<{ error_count: string }>(errorSql, params);
      const errors = parseInt(errorResult[0]?.error_count || "0", 10);

      // For error types, we can use status codes or status_text patterns
      // This is simplified - in a real system, you might want to parse status_text more carefully
      const errorTypes: Record<string, number> = {};
      
      // Count by status code ranges
      const errorTypeSql = `
        SELECT 
          CASE 
            WHEN status >= 500 THEN 'server_error'
            WHEN status >= 400 THEN 'client_error'
            WHEN status_text IS NOT NULL AND LOWER(status_text) LIKE '%error%' THEN 'error_event'
            ELSE 'unknown_error'
          END as error_type,
          COUNT(*) as count
        FROM analysis_results
        ${whereClause}
        AND (
          (status IS NOT NULL AND (status < 200 OR status >= 300))
          OR (status_text IS NOT NULL AND LOWER(status_text) LIKE '%error%')
        )
        GROUP BY error_type
      `;
      
      try {
        const errorTypeResults = await query<{ error_type: string; count: string }>(errorTypeSql, params);
        for (const row of errorTypeResults) {
          errorTypes[row.error_type] = parseInt(row.count) || 0;
        }
      } catch (err) {
        console.warn("[DashboardMetricsService] Failed to get error types:", err);
      }

      return {
        total,
        errors,
        error_rate: total > 0 ? (errors / total) * 100 : 0,
        error_types: errorTypes,
      };
    } catch (error) {
      console.error("[DashboardMetricsService] Failed to get error rate metrics:", error);
      return {
        total: 0,
        errors: 0,
        error_rate: 0,
        error_types: {},
      };
    }
  }

  /**
   * Get cost metrics
   * Note: Cost data is not stored in analysis_results table
   * This returns empty/zero values for now
   */
  static async getCostMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<CostMetrics> {
    // Cost data is not available in analysis_results table
    // Return empty metrics for now
    // TODO: Calculate cost from tokens and model pricing if needed
    return {
      total_cost: 0,
      avg_cost_per_trace: 0,
      cost_by_model: {},
      cost_by_route: {},
    };
  }

  /**
   * Get token metrics
   */
  static async getTokenMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<TokenMetrics> {
    const params: any[] = [tenantId];
    let paramIndex = 1;

    // Build WHERE clause
    let whereClause = "WHERE tenant_id = $1";
    
    if (projectId) {
      paramIndex++;
      params.push(projectId);
      whereClause += ` AND project_id = $${paramIndex}`;
    }

    if (startTime) {
      paramIndex++;
      params.push(startTime);
      whereClause += ` AND COALESCE(timestamp, analyzed_at) >= $${paramIndex}`;
    }

    if (endTime) {
      paramIndex++;
      params.push(endTime);
      whereClause += ` AND COALESCE(timestamp, analyzed_at) <= $${paramIndex}`;
    }

    whereClause += " AND tokens_total IS NOT NULL";

    const sql = `
      SELECT 
        SUM(tokens_total) as total_tokens,
        SUM(tokens_prompt) as input_tokens,
        SUM(tokens_completion) as output_tokens,
        AVG(tokens_total) as avg_tokens,
        model,
        COUNT(DISTINCT trace_id) as trace_count
      FROM analysis_results
      ${whereClause}
      GROUP BY model
    `;

    try {
      const results = await query(sql, params);

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
      console.error("[DashboardMetricsService] Failed to get token metrics:", error);
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
   * Get trace count for a time period
   */
  static async getTraceCount(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<number> {
    const params: any[] = [tenantId];
    let paramIndex = 1;

    // Build WHERE clause
    let whereClause = "WHERE tenant_id = $1";
    
    if (projectId) {
      paramIndex++;
      params.push(projectId);
      whereClause += ` AND project_id = $${paramIndex}`;
    }

    if (startTime) {
      paramIndex++;
      params.push(startTime);
      whereClause += ` AND COALESCE(timestamp, analyzed_at) >= $${paramIndex}`;
    }

    if (endTime) {
      paramIndex++;
      params.push(endTime);
      whereClause += ` AND COALESCE(timestamp, analyzed_at) <= $${paramIndex}`;
    }

    const sql = `SELECT COUNT(DISTINCT trace_id) as count FROM analysis_results ${whereClause}`;

    try {
      const result = await query<{ count: string }>(sql, params);
      return parseInt(result[0]?.count || "0", 10);
    } catch (error) {
      console.error("[DashboardMetricsService] Failed to get trace count:", error);
      return 0;
    }
  }
}

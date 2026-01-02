/**
 * Dashboard Metrics Service
 * 
 * SOTA: Aggregates metrics from Tinybird canonical_events for dashboard display
 * Provides latency percentiles, error rates, cost metrics, etc.
 */

import { TinybirdRepository } from "./tinybirdRepository.js";
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
   * Get latency metrics (P50, P95, P99) from canonical events
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

    let sql = `
      SELECT 
        ${groupBy || "NULL"} as group_key,
        quantile(0.5)(latency_ms) as p50,
        quantile(0.95)(latency_ms) as p95,
        quantile(0.99)(latency_ms) as p99,
        avg(latency_ms) as avg,
        min(latency_ms) as min,
        max(latency_ms) as max,
        count() as count
      FROM (
        SELECT 
          trace_id,
          ${groupBy ? `${groupBy},` : ""}
          CAST(JSON_EXTRACT_STRING(attributes_json, '$.llm_call.latency_ms') AS Float64) as latency_ms
        FROM canonical_events
        WHERE tenant_id = '${escapedTenantId}'
          AND event_type = 'llm_call'
          ${escapedProjectId ? `AND project_id = '${escapedProjectId}'` : ""}
          ${startTime ? `AND timestamp >= '${startTime.replace(/'/g, "''")}'` : ""}
          ${endTime ? `AND timestamp <= '${endTime.replace(/'/g, "''")}'` : ""}
          AND attributes_json LIKE '%"latency_ms"%'
      )
      WHERE latency_ms > 0
      ${groupBy ? "GROUP BY group_key" : ""}
    `;

    try {
      const results = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });

      if (groupBy) {
        // Return grouped metrics
        const grouped: Record<string, LatencyMetrics> = {};
        for (const row of results) {
          const key = row.group_key || "unknown";
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
      } else {
        // Return single metrics object
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
      }
    } catch (error) {
      console.error("[DashboardMetricsService] Failed to get latency metrics:", error);
      // Return empty metrics on error
      if (groupBy) {
        return {};
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
   * Get error rate metrics
   */
  static async getErrorRateMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<ErrorRateMetrics> {
    // Get error signals count
    const errorSignals = await SignalsQueryService.querySignals({
      tenantId,
      projectId,
      signalNames: ["tool_error", "tool_timeout", "error_event"],
      startTime,
      endTime,
      limit: 10000,
    });

    // Count errors by type
    const errorTypes: Record<string, number> = {};
    let totalErrors = 0;

    for (const signal of errorSignals) {
      totalErrors++;
      const errorType = signal.signal_name;
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    }

    // Get total trace count (approximate - count unique trace_ids from events)
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    let sql = `
      SELECT count(DISTINCT trace_id) as total
      FROM canonical_events
      WHERE tenant_id = '${escapedTenantId}'
        AND event_type IN ('trace_start', 'llm_call')
        ${escapedProjectId ? `AND project_id = '${escapedProjectId}'` : ""}
        ${startTime ? `AND timestamp >= '${startTime.replace(/'/g, "''")}'` : ""}
        ${endTime ? `AND timestamp <= '${endTime.replace(/'/g, "''")}'` : ""}
    `;

    try {
      const results = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });
      const total = parseInt(results[0]?.total || "0", 10);

      return {
        total,
        errors: totalErrors,
        error_rate: total > 0 ? (totalErrors / total) * 100 : 0,
        error_types: errorTypes,
      };
    } catch (error) {
      console.error("[DashboardMetricsService] Failed to get error rate metrics:", error);
      return {
        total: 0,
        errors: totalErrors,
        error_rate: 0,
        error_types: errorTypes,
      };
    }
  }

  /**
   * Get cost metrics
   */
  static async getCostMetrics(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<CostMetrics> {
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    let sql = `
      SELECT 
        sum(CAST(JSON_EXTRACT_STRING(attributes_json, '$.llm_call.cost') AS Float64)) as total_cost,
        avg(CAST(JSON_EXTRACT_STRING(attributes_json, '$.llm_call.cost') AS Float64)) as avg_cost,
        JSON_EXTRACT_STRING(attributes_json, '$.llm_call.model') as model,
        route,
        count(DISTINCT trace_id) as trace_count
      FROM canonical_events
      WHERE tenant_id = '${escapedTenantId}'
        AND event_type = 'llm_call'
        ${escapedProjectId ? `AND project_id = '${escapedProjectId}'` : ""}
        ${startTime ? `AND timestamp >= '${startTime.replace(/'/g, "''")}'` : ""}
        ${endTime ? `AND timestamp <= '${endTime.replace(/'/g, "''")}'` : ""}
        AND attributes_json LIKE '%"cost"%'
      GROUP BY model, route
    `;

    try {
      const results = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });

      let totalCost = 0;
      let totalTraces = 0;
      const costByModel: Record<string, number> = {};
      const costByRoute: Record<string, number> = {};

      for (const row of results) {
        const cost = parseFloat(row.total_cost) || 0;
        const traces = parseInt(row.trace_count) || 0;
        const model = row.model || "unknown";
        const route = row.route || "unknown";

        totalCost += cost;
        totalTraces += traces;
        costByModel[model] = (costByModel[model] || 0) + cost;
        costByRoute[route] = (costByRoute[route] || 0) + cost;
      }

      return {
        total_cost: totalCost,
        avg_cost_per_trace: totalTraces > 0 ? totalCost / totalTraces : 0,
        cost_by_model: costByModel,
        cost_by_route: costByRoute,
      };
    } catch (error) {
      console.error("[DashboardMetricsService] Failed to get cost metrics:", error);
      return {
        total_cost: 0,
        avg_cost_per_trace: 0,
        cost_by_model: {},
        cost_by_route: {},
      };
    }
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
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    let sql = `
      SELECT 
        sum(CAST(JSON_EXTRACT_STRING(attributes_json, '$.llm_call.total_tokens') AS Int64)) as total_tokens,
        sum(CAST(JSON_EXTRACT_STRING(attributes_json, '$.llm_call.input_tokens') AS Int64)) as input_tokens,
        sum(CAST(JSON_EXTRACT_STRING(attributes_json, '$.llm_call.output_tokens') AS Int64)) as output_tokens,
        avg(CAST(JSON_EXTRACT_STRING(attributes_json, '$.llm_call.total_tokens') AS Float64)) as avg_tokens,
        JSON_EXTRACT_STRING(attributes_json, '$.llm_call.model') as model,
        count(DISTINCT trace_id) as trace_count
      FROM canonical_events
      WHERE tenant_id = '${escapedTenantId}'
        AND event_type = 'llm_call'
        ${escapedProjectId ? `AND project_id = '${escapedProjectId}'` : ""}
        ${startTime ? `AND timestamp >= '${startTime.replace(/'/g, "''")}'` : ""}
        ${endTime ? `AND timestamp <= '${endTime.replace(/'/g, "''")}'` : ""}
        AND attributes_json LIKE '%"total_tokens"%'
      GROUP BY model
    `;

    try {
      const results = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });

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
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    let sql = `
      SELECT count(DISTINCT trace_id) as count
      FROM canonical_events
      WHERE tenant_id = '${escapedTenantId}'
        AND event_type IN ('trace_start', 'llm_call')
        ${escapedProjectId ? `AND project_id = '${escapedProjectId}'` : ""}
        ${startTime ? `AND timestamp >= '${startTime.replace(/'/g, "''")}'` : ""}
        ${endTime ? `AND timestamp <= '${endTime.replace(/'/g, "''")}'` : ""}
    `;

    try {
      const results = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });
      return parseInt(results[0]?.count || "0", 10);
    } catch (error) {
      console.error("[DashboardMetricsService] Failed to get trace count:", error);
      return 0;
    }
  }
}


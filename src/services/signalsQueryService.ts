/**
 * Signals Query Service
 * 
 * SOTA: Query signals from Tinybird for dashboard display
 * Signals are stored as canonical events with event_type="error" and signal metadata in attributes_json
 */

import { TinybirdRepository } from "./tinybirdRepository.js";
import { Signal } from "./signalsService.js";

export interface SignalQuery {
  tenantId: string;
  projectId?: string | null;
  traceId?: string;
  signalNames?: string[];
  severity?: "high" | "medium" | "low";
  startTime?: string; // ISO 8601
  endTime?: string; // ISO 8601
  limit?: number;
  offset?: number;
}

export interface SignalSummary {
  signal_name: string;
  severity: "high" | "medium" | "low";
  count: number;
  latest_timestamp: string;
  trace_ids: string[]; // Sample of trace IDs
}

export class SignalsQueryService {
  /**
   * Query signals from Tinybird
   * Signals are stored as events with event_type="error" and signal data in attributes_json
   */
  static async querySignals(query: SignalQuery): Promise<Signal[]> {
    const { tenantId, projectId, traceId, signalNames, severity, startTime, endTime, limit = 1000, offset = 0 } = query;

    // Validate tenantId
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format");
    }

    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;
    const escapedTraceId = traceId ? traceId.replace(/'/g, "''") : null;

    // Build SQL query to extract signals from canonical_events
    // Signals are stored as event_type="error" with signal data in attributes_json.signal
    let sql = `
      SELECT 
        tenant_id,
        project_id,
        environment,
        trace_id,
        span_id,
        timestamp,
        attributes_json
      FROM canonical_events
      WHERE tenant_id = '${escapedTenantId}'
        AND event_type = 'error'
        AND attributes_json LIKE '%"signal"%'
    `;

    if (escapedProjectId) {
      sql += ` AND project_id = '${escapedProjectId}'`;
    }

    if (escapedTraceId) {
      sql += ` AND trace_id = '${escapedTraceId}'`;
    }

    if (startTime) {
      // Tinybird/ClickHouse: parse ISO 8601 (including milliseconds + Z) safely into DateTime64(3)
      sql += ` AND timestamp >= parseDateTime64BestEffort('${startTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    if (endTime) {
      // Tinybird/ClickHouse: parse ISO 8601 (including milliseconds + Z) safely into DateTime64(3)
      sql += ` AND timestamp <= parseDateTime64BestEffort('${endTime.replace(
        /'/g,
        "''"
      )}', 3)`;
    }

    sql += ` ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;

    try {
      const result = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });
      // Handle Tinybird response format: could be array or { data: [...], meta: [...] }
      const events = Array.isArray(result) ? result : (result?.data || []);

      // Parse signals from events
      const signals: Signal[] = [];
      for (const event of events) {
        try {
          const raw = (event as any)?.attributes_json;
          if (raw === null || raw === undefined) {
            continue;
          }
          // Tinybird can return NULLs depending on query/output mode; be defensive.
          const rawStr = typeof raw === "string" ? raw : String(raw);
          let attributes: any;
          try {
            attributes = JSON.parse(rawStr);
          } catch {
            // Skip invalid JSON silently (avoid log spam in prod)
            continue;
          }

          const signalData = attributes?.signal;
          if (signalData && typeof signalData === "object") {

            // Filter by signal name if specified
            if (signalNames && signalNames.length > 0 && !signalNames.includes(signalData.signal_name)) {
              continue;
            }

            // Filter by severity if specified
            if (severity && signalData.signal_severity !== severity) {
              continue;
            }

            signals.push({
              tenant_id: event.tenant_id,
              project_id: event.project_id,
              trace_id: event.trace_id,
              span_id: event.span_id,
              signal_name: signalData.signal_name,
              signal_type: signalData.signal_type,
              signal_value: signalData.signal_value,
              signal_severity: signalData.signal_severity,
              metadata: signalData.metadata || {},
              timestamp: event.timestamp,
            });
          }
        } catch (parseError) {
          // Skip malformed rows (avoid log spam in prod)
          continue;
        }
      }

      return signals;
    } catch (error) {
      console.error("[SignalsQueryService] Failed to query signals from Tinybird:", error);
      // Return empty array instead of throwing - fallback to PostgreSQL will be attempted by caller
      return [];
    }
  }

  /**
   * Get signal summary/aggregation
   * Returns counts and summaries by signal name and severity
   */
  static async getSignalSummary(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<SignalSummary[]> {
    let signals: Signal[] = [];
    
    try {
      signals = await this.querySignals({
        tenantId,
        projectId,
        startTime,
        endTime,
        limit: 10000, // Get more to aggregate
      });
    } catch (error) {
      console.error("[SignalsQueryService] Failed to get signals for summary:", error);
      // Return empty array on error
      return [];
    }

    // Aggregate signals
    const summaryMap = new Map<string, SignalSummary>();

    for (const signal of signals) {
      const key = `${signal.signal_name}:${signal.signal_severity}`;
      const existing = summaryMap.get(key);

      if (existing) {
        existing.count++;
        if (signal.timestamp > existing.latest_timestamp) {
          existing.latest_timestamp = signal.timestamp;
        }
        // Keep sample of trace IDs (max 10)
        if (existing.trace_ids.length < 10 && !existing.trace_ids.includes(signal.trace_id)) {
          existing.trace_ids.push(signal.trace_id);
        }
      } else {
        summaryMap.set(key, {
          signal_name: signal.signal_name,
          severity: signal.signal_severity,
          count: 1,
          latest_timestamp: signal.timestamp,
          trace_ids: [signal.trace_id],
        });
      }
    }

    return Array.from(summaryMap.values()).sort((a, b) => {
      // Sort by severity (high > medium > low) then by count
      const severityOrder = { high: 3, medium: 2, low: 1 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[b.severity] - severityOrder[a.severity];
      }
      return b.count - a.count;
    });
  }

  /**
   * Get signal counts by severity for a time period
   */
  static async getSignalCountsBySeverity(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<{ high: number; medium: number; low: number }> {
    let signals: Signal[] = [];
    
    try {
      signals = await this.querySignals({
        tenantId,
        projectId,
        startTime,
        endTime,
        limit: 10000,
      });
    } catch (error) {
      console.warn("[SignalsQueryService] Tinybird query failed, falling back to PostgreSQL:", error);
    }

    // If Tinybird returns no signals, fall back to PostgreSQL issue detection
    if (signals.length === 0) {
      console.log("[SignalsQueryService] No signals from Tinybird, using PostgreSQL issue counts");
      return await this.getIssueCountsFromPostgres(tenantId, projectId, startTime, endTime);
    }

    const counts = { high: 0, medium: 0, low: 0 };
    for (const signal of signals) {
      counts[signal.signal_severity]++;
    }

    return counts;
  }

  /**
   * Get issue counts from PostgreSQL analysis_results (fallback)
   * Counts based on issue flags like is_hallucination, has_context_drop, etc.
   */
  private static async getIssueCountsFromPostgres(
    tenantId: string,
    projectId?: string | null,
    startTime?: string,
    endTime?: string
  ): Promise<{ high: number; medium: number; low: number }> {
    try {
      const { query } = await import("../db/client.js");
      
      let whereClause = `WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      if (startTime) {
        whereClause += ` AND COALESCE(timestamp, analyzed_at) >= $${paramIndex}`;
        params.push(new Date(startTime));
        paramIndex++;
      }

      if (endTime) {
        whereClause += ` AND COALESCE(timestamp, analyzed_at) <= $${paramIndex}`;
        params.push(new Date(endTime));
        paramIndex++;
      }

      // Count issues by severity
      // High severity: hallucination, prompt_injection, critical errors (status >= 500)
      // Medium severity: context_drop, faithfulness_issue, model_drift, cost_anomaly, latency_anomaly
      // Low severity: quality_degradation, context_overflow
      const result = await query<{
        high_count: string;
        medium_count: string;
        low_count: string;
      }>(
        `SELECT 
          COUNT(*) FILTER (WHERE is_hallucination = TRUE OR has_prompt_injection = TRUE OR status >= 500) as high_count,
          COUNT(*) FILTER (WHERE has_context_drop = TRUE OR has_faithfulness_issue = TRUE OR has_model_drift = TRUE OR has_cost_anomaly = TRUE OR has_latency_anomaly = TRUE) as medium_count,
          COUNT(*) FILTER (WHERE has_quality_degradation = TRUE OR has_context_overflow = TRUE) as low_count
        FROM analysis_results ${whereClause}`,
        params
      );

      const high = parseInt(result[0]?.high_count || "0", 10);
      const medium = parseInt(result[0]?.medium_count || "0", 10);
      const low = parseInt(result[0]?.low_count || "0", 10);

      console.log(`[SignalsQueryService] PostgreSQL issue counts: high=${high}, medium=${medium}, low=${low}`);

      return { high, medium, low };
    } catch (error) {
      console.error("[SignalsQueryService] PostgreSQL issue count fallback failed:", error);
      return { high: 0, medium: 0, low: 0 };
    }
  }

  /**
   * Get signals for a specific trace
   */
  static async getTraceSignals(
    traceId: string,
    tenantId: string,
    projectId?: string | null
  ): Promise<Signal[]> {
    return this.querySignals({
      tenantId,
      projectId,
      traceId,
      limit: 1000,
    });
  }
}


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
      sql += ` AND timestamp >= '${startTime.replace(/'/g, "''")}'`;
    }

    if (endTime) {
      sql += ` AND timestamp <= '${endTime.replace(/'/g, "''")}'`;
    }

    sql += ` ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;

    try {
      const events = await TinybirdRepository.rawQuery(sql, {
        tenantId,
        projectId: projectId || undefined,
      });

      // Parse signals from events
      const signals: Signal[] = [];
      for (const event of events) {
        try {
          const attributes = JSON.parse(event.attributes_json);
          if (attributes.signal) {
            const signalData = attributes.signal;

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
          // Skip events with invalid JSON
          console.warn(`[SignalsQueryService] Failed to parse signal from event:`, parseError);
          continue;
        }
      }

      return signals;
    } catch (error) {
      console.error("[SignalsQueryService] Failed to query signals:", error);
      throw error;
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
    const signals = await this.querySignals({
      tenantId,
      projectId,
      startTime,
      endTime,
      limit: 10000, // Get more to aggregate
    });

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
    const signals = await this.querySignals({
      tenantId,
      projectId,
      startTime,
      endTime,
      limit: 10000,
    });

    const counts = { high: 0, medium: 0, low: 0 };
    for (const signal of signals) {
      counts[signal.signal_severity]++;
    }

    return counts;
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


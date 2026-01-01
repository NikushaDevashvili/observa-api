/**
 * Deletion Service
 * 
 * Handles GDPR-compliant soft delete strategy:
 * - Writes tombstone events to OLAP (Tinybird)
 * - Updates trace_index in Postgres for fast filtering
 * - Supports TTL-based hard deletion
 */

import { query } from "../db/client.js";
import { CanonicalEventService } from "./canonicalEventService.js";
import { TinybirdCanonicalEvent } from "../types/events.js";
import { EventType } from "../types/events.js";

export class DeletionService {
  /**
   * Soft delete a trace (GDPR compliant)
   */
  static async softDeleteTrace(params: {
    traceId: string;
    tenantId: string;
    userId?: string | null;
  }): Promise<void> {
    // 1. Insert/update trace_index with is_deleted=true
    await query(
      `INSERT INTO trace_index (trace_id, tenant_id, is_deleted, deleted_at, deleted_by_user_id)
       VALUES ($1, $2, TRUE, NOW(), $3)
       ON CONFLICT (trace_id) DO UPDATE SET
         is_deleted = TRUE,
         deleted_at = NOW(),
         deleted_by_user_id = EXCLUDED.deleted_by_user_id,
         updated_at = NOW()`,
      [params.traceId, params.tenantId, params.userId || null]
    );

    // 2. Insert tombstone event into Tinybird (for OLAP consistency)
    const tombstoneEvent: TinybirdCanonicalEvent = {
      tenant_id: params.tenantId,
      project_id: "", // Will be filled from trace data if available
      environment: "dev",
      trace_id: params.traceId,
      span_id: params.traceId, // Use trace_id as span_id for tombstone
      parent_span_id: null,
      timestamp: new Date().toISOString(),
      event_type: "trace_end" as EventType, // Use trace_end as tombstone marker
      conversation_id: null,
      session_id: null,
      user_id: params.userId || null,
      agent_name: null,
      version: null,
      route: null,
      attributes_json: JSON.stringify({
        trace_end: {
          outcome: "deleted",
          deleted: true,
          deleted_at: new Date().toISOString(),
        },
      }),
    };

    try {
      await CanonicalEventService.forwardSingleEvent(tombstoneEvent);
    } catch (error) {
      console.error("[DeletionService] Failed to write tombstone event (non-fatal):", error);
      // Don't throw - Postgres update is the source of truth
    }
  }

  /**
   * Check if a trace is deleted
   */
  static async isTraceDeleted(
    traceId: string,
    tenantId: string
  ): Promise<boolean> {
    const result = await query<{ is_deleted: boolean }>(
      `SELECT is_deleted FROM trace_index 
       WHERE trace_id = $1 AND tenant_id = $2`,
      [traceId, tenantId]
    );

    if (result.length === 0) {
      // If not in index, assume not deleted (backward compatibility)
      return false;
    }

    return result[0].is_deleted || false;
  }

  /**
   * Get deleted trace IDs for a tenant (for cleanup/TTL processing)
   */
  static async getDeletedTraces(
    tenantId: string,
    olderThan?: Date
  ): Promise<string[]> {
    let sql = `SELECT trace_id FROM trace_index 
                WHERE tenant_id = $1 AND is_deleted = TRUE`;
    const params: any[] = [tenantId];

    if (olderThan) {
      sql += ` AND deleted_at < $2`;
      params.push(olderThan);
    }

    const result = await query<{ trace_id: string }>(sql, params);
    return result.map((row) => row.trace_id);
  }

  /**
   * Restore a deleted trace (undo soft delete)
   */
  static async restoreTrace(params: {
    traceId: string;
    tenantId: string;
  }): Promise<void> {
    await query(
      `UPDATE trace_index 
       SET is_deleted = FALSE, deleted_at = NULL, deleted_by_user_id = NULL, updated_at = NOW()
       WHERE trace_id = $1 AND tenant_id = $2`,
      [params.traceId, params.tenantId]
    );
  }
}


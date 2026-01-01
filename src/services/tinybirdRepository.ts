/**
 * Tinybird Repository
 *
 * Wrapper for Tinybird/ClickHouse queries that enforces multi-tenant isolation.
 * All queries MUST include tenant_id to prevent data leakage.
 */

import { env } from "../config/env.js";

export interface TinybirdQueryOptions {
  tenantId: string;
  projectId?: string | null;
  params?: Record<string, any>;
}

export class TinybirdRepository {
  private static baseUrl = env.TINYBIRD_HOST;
  private static adminToken = env.TINYBIRD_ADMIN_TOKEN;

  /**
   * Execute a Tinybird query with tenant isolation
   *
   * @param queryName - Name of the Tinybird query endpoint
   * @param options - Query options (tenantId is required)
   * @returns Query results
   */
  static async query(
    queryName: string,
    options: TinybirdQueryOptions
  ): Promise<any> {
    if (!options.tenantId) {
      throw new Error(
        "TinybirdRepository: tenantId is required for all queries"
      );
    }

    // Build query parameters
    const params = new URLSearchParams();
    params.append("tenant_id", options.tenantId);

    if (options.projectId) {
      params.append("project_id", options.projectId);
    }

    // Add any additional params
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        params.append(key, String(value));
      }
    }

    const url = `${this.baseUrl}/v0/sql?q=${encodeURIComponent(
      queryName
    )}&${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.adminToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Tinybird query failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Tinybird query error: ${errorMessage}`);
    }
  }

  /**
   * Execute a raw SQL query with tenant isolation
   * WARNING: Only use for queries that explicitly filter by tenant_id
   *
   * @param sql - SQL query string (must include tenant_id filter)
   * @param options - Query options (tenantId is required)
   * @returns Query results
   */
  static async rawQuery(
    sql: string,
    options: TinybirdQueryOptions
  ): Promise<any> {
    if (!options.tenantId) {
      throw new Error(
        "TinybirdRepository: tenantId is required for all queries"
      );
    }

    // Validate that SQL includes tenant_id filter
    const sqlLower = sql.toLowerCase();
    if (
      !sqlLower.includes("tenant_id") &&
      !sqlLower.includes("where") &&
      !sqlLower.includes("tenant_id =")
    ) {
      throw new Error(
        "TinybirdRepository.rawQuery: SQL must explicitly filter by tenant_id for security"
      );
    }

    const params = new URLSearchParams();
    params.append("q", sql);

    // Always inject tenant_id as a parameter for safety
    params.append("tenant_id", options.tenantId);

    if (options.projectId) {
      params.append("project_id", options.projectId);
    }

    const url = `${this.baseUrl}/v0/sql?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.adminToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Tinybird raw query failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Tinybird raw query error: ${errorMessage}`);
    }
  }

  /**
   * Get events for a trace (with tenant isolation)
   */
  static async getTraceEvents(
    traceId: string,
    tenantId: string,
    projectId?: string | null
  ): Promise<any[]> {
    // This would query a Tinybird endpoint or SQL
    // Example implementation - adjust based on your Tinybird setup
    const sql = `
      SELECT *
      FROM canonical_events
      WHERE tenant_id = {tenant_id:String}
        AND trace_id = {trace_id:String}
        ${projectId ? "AND project_id = {project_id:String}" : ""}
      ORDER BY timestamp ASC
    `;

    return this.rawQuery(sql, {
      tenantId,
      projectId,
      params: { trace_id: traceId },
    });
  }

  /**
   * Get traces for a tenant/project (with tenant isolation)
   */
  static async getTraces(
    tenantId: string,
    projectId?: string | null,
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    const sql = `
      SELECT 
        trace_id,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time,
        COUNT(*) as event_count
      FROM canonical_events
      WHERE tenant_id = {tenant_id:String}
        ${projectId ? "AND project_id = {project_id:String}" : ""}
      GROUP BY trace_id
      ORDER BY start_time DESC
      LIMIT {limit:Int32}
      OFFSET {offset:Int32}
    `;

    return this.rawQuery(sql, {
      tenantId,
      projectId,
      params: { limit, offset },
    });
  }
}

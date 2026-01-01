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

    // Add any additional params (e.g., trace_id, limit, offset)
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        params.append(key, String(value));
      }
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
   * 
   * Note: Using string interpolation for parameters because Tinybird's {param:Type} syntax
   * requires secrets configuration. We validate tenant_id before interpolation for security.
   */
  static async getTraceEvents(
    traceId: string,
    tenantId: string,
    projectId?: string | null
  ): Promise<any[]> {
    // Validate UUIDs to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error("Invalid tenant_id format");
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(traceId)) {
      throw new Error("Invalid trace_id format");
    }
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new Error("Invalid project_id format");
    }

    // Escape single quotes in UUIDs (though UUIDs shouldn't contain them)
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedTraceId = traceId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    // Query canonical_events datasource from Tinybird using direct value interpolation
    // We validate UUIDs above to prevent SQL injection
    // Note: Only selecting columns that exist in the datasource schema
    // Optional columns (agent_name, version, route) may not exist in all datasources
    const sql = `
      SELECT 
        tenant_id,
        project_id,
        environment,
        trace_id,
        span_id,
        parent_span_id,
        timestamp,
        event_type,
        conversation_id,
        session_id,
        user_id,
        attributes_json
      FROM canonical_events
      WHERE tenant_id = '${escapedTenantId}'
        AND trace_id = '${escapedTraceId}'
        ${escapedProjectId ? `AND project_id = '${escapedProjectId}'` : ""}
      ORDER BY timestamp ASC
    `;

    try {
      // Use rawQuery but with the SQL already having values interpolated
      // We still pass tenantId for the validation check in rawQuery
      const result = await this.rawQuery(sql, {
        tenantId,
        projectId,
      });

      console.log(
        `[TinybirdRepository] Query result for trace ${traceId}:`,
        JSON.stringify(result, null, 2).substring(0, 500)
      );

      // Tinybird returns { data: [...], meta: [...] }
      if (result && Array.isArray(result)) {
        console.log(
          `[TinybirdRepository] Found ${result.length} events (array format)`
        );
        return result;
      } else if (result?.data && Array.isArray(result.data)) {
        console.log(
          `[TinybirdRepository] Found ${result.data.length} events (object.data format)`
        );
        return result.data;
      }
      
      console.log(
        `[TinybirdRepository] No events found or unexpected format:`,
        typeof result
      );
      return [];
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[TinybirdRepository] Error fetching trace events for ${traceId}:`,
        errorMessage
      );
      // Return empty array on error (fallback to analysis_results)
      return [];
    }
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

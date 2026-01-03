/**
 * Users Service
 * 
 * Manages user information from AI application (user_id from traces)
 * Queries from Tinybird canonical_events with PostgreSQL fallback
 */

import { TinybirdRepository } from "./tinybirdRepository.js";
import { query } from "../db/client.js";

export interface UserInfo {
  user_id: string;
  first_seen: string;
  last_seen: string;
  trace_count: number;
  total_cost: number;
  total_tokens: number;
}

export interface UsersListResult {
  users: UserInfo[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export class UsersService {
  /**
   * List users from AI application
   * Queries from Tinybird canonical_events, falls back to PostgreSQL analysis_results
   */
  static async listUsers(params: {
    tenantId: string;
    projectId?: string | null;
    startTime?: string;
    endTime?: string;
    limit: number;
    offset: number;
  }): Promise<UsersListResult> {
    const { tenantId, projectId, startTime, endTime, limit, offset } = params;

    // Try Tinybird first
    try {
      const users = await this.queryUsersFromTinybird(
        tenantId,
        projectId,
        startTime,
        endTime,
        limit,
        offset
      );
      return users;
    } catch (error) {
      console.warn(
        "[UsersService] Failed to query users from Tinybird, falling back to PostgreSQL:",
        error
      );
      // Fallback to PostgreSQL
      return this.queryUsersFromPostgreSQL(
        tenantId,
        projectId,
        startTime,
        endTime,
        limit,
        offset
      );
    }
  }

  /**
   * Query users from Tinybird canonical_events
   */
  private static async queryUsersFromTinybird(
    tenantId: string,
    projectId: string | null | undefined,
    startTime: string | undefined,
    endTime: string | undefined,
    limit: number,
    offset: number
  ): Promise<UsersListResult> {
    const escapedTenantId = tenantId.replace(/'/g, "''");
    const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

    // Build WHERE clause
    let whereClause = `WHERE tenant_id = '${escapedTenantId}' AND user_id != '' AND user_id IS NOT NULL`;

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

    // Query to get user statistics
    const sql = `
      SELECT 
        user_id,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        count(DISTINCT trace_id) as trace_count,
        sum(toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.cost'))) as total_cost,
        sum(toInt64OrNull(JSONExtractString(attributes_json, '$.llm_call.tokens_total'))) as total_tokens
      FROM canonical_events
      ${whereClause}
      GROUP BY user_id
      ORDER BY last_seen DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Get total count
    const countSql = `
      SELECT count(DISTINCT user_id) as total
      FROM canonical_events
      ${whereClause}
    `;

    try {
      const [usersResult, countResult] = await Promise.all([
        TinybirdRepository.rawQuery(sql, {
          tenantId,
          projectId: projectId || undefined,
        }),
        TinybirdRepository.rawQuery(countSql, {
          tenantId,
          projectId: projectId || undefined,
        }),
      ]);

      const users = Array.isArray(usersResult)
        ? usersResult
        : usersResult?.data || [];
      const countData = Array.isArray(countResult)
        ? countResult
        : countResult?.data || [];
      const total = parseInt(countData[0]?.total || "0", 10);

      return {
        users: users.map((u: any) => ({
          user_id: u.user_id || "",
          first_seen: u.first_seen || new Date().toISOString(),
          last_seen: u.last_seen || new Date().toISOString(),
          trace_count: parseInt(u.trace_count || "0", 10),
          total_cost: parseFloat(u.total_cost || "0"),
          total_tokens: parseInt(u.total_tokens || "0", 10),
        })),
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      throw new Error(
        `Failed to query users from Tinybird: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Query users from PostgreSQL analysis_results (fallback)
   */
  private static async queryUsersFromPostgreSQL(
    tenantId: string,
    projectId: string | null | undefined,
    startTime: string | undefined,
    endTime: string | undefined,
    limit: number,
    offset: number
  ): Promise<UsersListResult> {
    let whereClause = `WHERE tenant_id = $1 AND user_id IS NOT NULL AND user_id != ''`;
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

    // Get user statistics
    const usersSql = `
      SELECT 
        user_id,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        count(DISTINCT trace_id) as trace_count,
        sum(COALESCE(tokens_total, 0)) as total_tokens,
        sum(COALESCE((tokens_total::numeric / 1000) * 0.03, 0)) as total_cost
      FROM analysis_results
      ${whereClause}
      GROUP BY user_id
      ORDER BY max(timestamp) DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Get total count
    const countSql = `
      SELECT count(DISTINCT user_id) as total
      FROM analysis_results
      ${whereClause}
    `;

    const [usersRows, countRows] = await Promise.all([
      query(usersSql, [...params, limit, offset]),
      query(countSql, params),
    ]);

    const total = parseInt(countRows[0]?.total || "0", 10);

    return {
      users: usersRows.map((row: any) => ({
        user_id: row.user_id || "",
        first_seen: row.first_seen
          ? new Date(row.first_seen).toISOString()
          : new Date().toISOString(),
        last_seen: row.last_seen
          ? new Date(row.last_seen).toISOString()
          : new Date().toISOString(),
        trace_count: parseInt(row.trace_count || "0", 10),
        total_cost: parseFloat(row.total_cost || "0"),
        total_tokens: parseInt(row.total_tokens || "0", 10),
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }
}


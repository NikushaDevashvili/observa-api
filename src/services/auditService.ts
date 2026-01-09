/**
 * Audit Service
 * 
 * Logs critical operations for security and compliance:
 * - API key usage
 * - Authentication events
 * - Token operations
 * - Sensitive operations
 */

import { query } from "../db/client.js";

export interface AuditLog {
  id: string;
  tenant_id: string;
  project_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export class AuditService {
  /**
   * Log an audit event
   */
  static async log(params: {
    tenantId: string;
    projectId?: string | null;
    userId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, any> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const {
      tenantId,
      projectId,
      userId,
      action,
      resourceType,
      resourceId,
      metadata,
      ipAddress,
      userAgent,
    } = params;

    try {
      await query(
        `INSERT INTO audit_logs (
          tenant_id, project_id, user_id, action, resource_type, 
          resource_id, metadata_json, ip_address, user_agent, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          tenantId,
          projectId || null,
          userId || null,
          action,
          resourceType,
          resourceId || null,
          metadata ? JSON.stringify(metadata) : null,
          ipAddress || null,
          userAgent || null,
        ]
      );
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error("[AuditService] Failed to log audit event:", error);
    }
  }

  /**
   * Log API key usage
   */
  static async logApiKeyUsage(params: {
    tenantId: string;
    projectId?: string | null;
    apiKeyId: string;
    endpoint: string;
    method: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.log({
      tenantId: params.tenantId,
      projectId: params.projectId,
      action: "api_key_used",
      resourceType: "api_key",
      resourceId: params.apiKeyId,
      metadata: {
        endpoint: params.endpoint,
        method: params.method,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  /**
   * Log authentication event
   */
  static async logAuthEvent(params: {
    tenantId: string;
    userId: string;
    action: "login" | "logout" | "token_created" | "token_revoked";
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.log({
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      resourceType: "auth",
      resourceId: params.userId,
      metadata: params.metadata || null,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  /**
   * Log token operation
   */
  static async logTokenOperation(params: {
    tenantId: string;
    projectId?: string | null;
    action: "token_created" | "token_revoked" | "token_rotated";
    tokenType: "api_key" | "session" | "tinybird";
    resourceId?: string | null;
    userId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.log({
      tenantId: params.tenantId,
      projectId: params.projectId,
      userId: params.userId,
      action: params.action,
      resourceType: params.tokenType,
      resourceId: params.resourceId,
      metadata: {
        token_type: params.tokenType,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  /**
   * Get audit logs for a tenant
   */
  static async getAuditLogs(params: {
    tenantId: string;
    projectId?: string | null;
    action?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const {
      tenantId,
      projectId,
      action,
      startTime,
      endTime,
      limit = 100,
      offset = 0,
    } = params;

    let whereClause = "WHERE tenant_id = $1";
    const queryParams: any[] = [tenantId];
    let paramIndex = 2;

    if (projectId) {
      whereClause += ` AND project_id = $${paramIndex}`;
      queryParams.push(projectId);
      paramIndex++;
    }

    if (action) {
      whereClause += ` AND action = $${paramIndex}`;
      queryParams.push(action);
      paramIndex++;
    }

    if (startTime) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      queryParams.push(startTime);
      paramIndex++;
    }

    if (endTime) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      queryParams.push(endTime);
      paramIndex++;
    }

    // Get logs
    const logsSql = `
      SELECT 
        id, tenant_id, project_id, user_id, action, resource_type,
        resource_id, metadata_json, ip_address, user_agent, created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Get total count
    const countSql = `
      SELECT COUNT(*) as total
      FROM audit_logs
      ${whereClause}
    `;

    const [logsRows, countRows] = await Promise.all([
      query(logsSql, [...queryParams, limit, offset]),
      query(countSql, queryParams),
    ]);

    const total = parseInt(countRows[0]?.total || "0", 10);

    return {
      logs: logsRows.map((row: any) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        project_id: row.project_id,
        user_id: row.user_id,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        metadata: row.metadata_json
          ? JSON.parse(row.metadata_json)
          : null,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        created_at: row.created_at,
      })),
      total,
    };
  }
}





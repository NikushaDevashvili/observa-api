/**
 * Quota Service
 * 
 * Manages monthly event quotas per project.
 */

import { query } from "../db/client.js";

export interface QuotaCheckResult {
  allowed: boolean;
  quota: number;
  used: number;
  remaining: number;
  resetAt: Date;
}

export class QuotaService {
  /**
   * Check if project has quota remaining
   */
  static async checkQuota(
    tenantId: string,
    projectId: string
  ): Promise<QuotaCheckResult> {
    const result = await query<{
      monthly_event_quota: number;
      monthly_event_count: number;
      quota_period_start: Date;
    }>(
      `SELECT monthly_event_quota, monthly_event_count, quota_period_start
       FROM projects
       WHERE id = $1 AND tenant_id = $2`,
      [projectId, tenantId]
    );

    if (result.length === 0) {
      throw new Error("Project not found");
    }

    const project = result[0];
    const quota = project.monthly_event_quota || 10000000; // Default 10M
    let used = project.monthly_event_count || 0;
    const periodStart = new Date(project.quota_period_start || new Date());

    // Check if period has reset (new month)
    const now = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (now >= periodEnd) {
      // Reset quota for new month
      await this.resetQuota(tenantId, projectId);
      used = 0;
    }

    const remaining = Math.max(0, quota - used);
    const resetAt = periodEnd;

    return {
      allowed: remaining > 0,
      quota,
      used,
      remaining,
      resetAt,
    };
  }

  /**
   * Increment quota usage (call after successful ingestion)
   */
  static async incrementUsage(
    tenantId: string,
    projectId: string | null,
    count: number = 1
  ): Promise<void> {
    if (!projectId) {
      // No project-level quota tracking if projectId is null
      // In future, we could track tenant-level quotas separately
      console.warn("[QuotaService] No projectId provided, skipping quota increment");
      return;
    }
    
    // First check if we need to reset (new month)
    const quotaCheck = await this.checkQuota(tenantId, projectId);

    if (!quotaCheck.allowed && quotaCheck.used === 0) {
      // Quota was just reset, increment from 0
      await query(
        `UPDATE projects 
         SET monthly_event_count = $1,
             quota_period_start = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [count, projectId, tenantId]
      );
    } else {
      // Increment existing count
      await query(
        `UPDATE projects 
         SET monthly_event_count = monthly_event_count + $1
         WHERE id = $2 AND tenant_id = $3`,
        [count, projectId, tenantId]
      );
    }
  }

  /**
   * Reset quota for new period (called when period expires)
   */
  private static async resetQuota(
    tenantId: string,
    projectId: string
  ): Promise<void> {
    await query(
      `UPDATE projects 
       SET monthly_event_count = 0,
           quota_period_start = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [projectId, tenantId]
    );
  }
}


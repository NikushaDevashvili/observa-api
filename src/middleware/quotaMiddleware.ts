/**
 * Quota Middleware
 * 
 * Enforces monthly event quota limits per project
 */

import { Request, Response, NextFunction } from "express";
import { QuotaService } from "../services/quotaService.js";

export async function quotaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tenantId = (req as any).tenantId;
  const projectId = (req as any).projectId;

  if (!tenantId || !projectId) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Project context required for quota check",
      },
    });
    return;
  }

  try {
    const quotaCheck = await QuotaService.checkQuota(tenantId, projectId);

    if (!quotaCheck.allowed) {
      res.status(429).json({
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Monthly event quota has been exceeded",
          details: {
            quota: quotaCheck.quota,
            used: quotaCheck.used,
            reset_at: quotaCheck.resetAt.toISOString(),
            upgrade_url: "https://app.observa.ai/settings/billing",
          },
        },
      });
      return;
    }

    // Store quota info in request for later use
    (req as any).quotaInfo = quotaCheck;

    next();
  } catch (error) {
    console.error("[QuotaMiddleware] Error checking quota:", error);
    // On error, allow request to proceed (fail open)
    // In production, you might want to fail closed
    next();
  }
}


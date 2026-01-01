/**
 * Rate Limiting Middleware
 *
 * Enforces rate limits on ingestion endpoints by tenant_id/project_id
 */

import { Request, Response, NextFunction } from "express";
import { RateLimitService } from "../services/rateLimitService.js";

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Extract tenant_id and project_id from request (should be set by auth middleware)
  const tenantId = (req as any).tenantId;
  const projectId = (req as any).projectId;

  if (!tenantId) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Tenant context required for rate limiting",
      },
    });
    return;
  }

  // Create rate limit key (tenant:project or just tenant)
  const key = projectId ? `${tenantId}:${projectId}` : tenantId;

  // Check rate limit (1000 events per minute default)
  const result = RateLimitService.checkRateLimit(key);

  // Set rate limit headers
  res.setHeader("X-RateLimit-Limit", "1000");
  res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
  res.setHeader("X-RateLimit-Reset", new Date(result.resetAt).toISOString());

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    res.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Rate limit exceeded. Please retry after the specified time.",
        details: {
          limit: 1000,
          window_seconds: 60,
          retry_after: retryAfter,
        },
      },
    });
    return;
  }

  next();
}

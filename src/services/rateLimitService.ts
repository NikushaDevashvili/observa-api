/**
 * Rate Limiting Service
 * 
 * Sliding window rate limiting by tenant_id/project_id.
 * Uses in-memory store (can be extended to Redis for distributed systems).
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store (in production, use Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number; // Window size in milliseconds (e.g., 60000 for 1 minute)
  maxRequests: number; // Max requests per window (e.g., 1000)
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 1000, // 1000 events per minute
};

export class RateLimitService {
  /**
   * Check if request should be rate limited
   * @param key - Rate limit key (e.g., tenant_id or tenant_id:project_id)
   * @param config - Rate limit configuration
   * @returns { allowed: boolean, remaining: number, resetAt: number }
   */
  static checkRateLimit(
    key: string,
    config: RateLimitConfig = DEFAULT_CONFIG
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart >= config.windowMs) {
      // Start new window
      rateLimitStore.set(key, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt: now + config.windowMs,
      };
    }

    // Check if within limit
    if (entry.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.windowStart + config.windowMs,
      };
    }

    // Increment counter
    entry.count++;
    rateLimitStore.set(key, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.windowStart + config.windowMs,
    };
  }

  /**
   * Clean up old entries (call periodically)
   */
  static cleanup(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.windowStart > maxAge) {
        rateLimitStore.delete(key);
      }
    }
  }
}

// Cleanup old entries every 10 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    RateLimitService.cleanup();
  }, 10 * 60 * 1000);
}


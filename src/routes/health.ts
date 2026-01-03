/**
 * Health Check Routes
 * 
 * Provides health check endpoints for monitoring and load balancers
 */

import { Router, Request, Response } from "express";
import { testConnection } from "../db/client.js";
import { env } from "../config/env.js";
import { TinybirdRepository } from "../services/tinybirdRepository.js";

const router = Router();

/**
 * GET /health
 * Basic health check (already exists in index.ts, but keeping for consistency)
 */
router.get("/", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/detailed
 * Detailed health check with dependency status
 */
router.get("/detailed", async (req: Request, res: Response) => {
  const health: {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    services: {
      database: { status: "healthy" | "unhealthy"; latency_ms?: number };
      tinybird: { status: "healthy" | "unhealthy"; latency_ms?: number };
      redis?: { status: "healthy" | "unhealthy"; latency_ms?: number };
      analysis_service?: {
        status: "healthy" | "unhealthy";
        latency_ms?: number;
      };
    };
  } = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: { status: "unhealthy" },
      tinybird: { status: "unhealthy" },
    },
  };

  // Check database
  try {
    const dbStart = Date.now();
    await testConnection();
    const dbLatency = Date.now() - dbStart;
    health.services.database = {
      status: "healthy",
      latency_ms: dbLatency,
    };
  } catch (error) {
    health.services.database = { status: "unhealthy" };
    health.status = "unhealthy";
  }

  // Check Tinybird
  try {
    const tinybirdStart = Date.now();
    // Simple query to test connectivity
    await TinybirdRepository.rawQuery(
      "SELECT 1 as test",
      { tenantId: "00000000-0000-0000-0000-000000000000" } // Dummy tenant for health check
    );
    const tinybirdLatency = Date.now() - tinybirdStart;
    health.services.tinybird = {
      status: "healthy",
      latency_ms: tinybirdLatency,
    };
  } catch (error) {
    health.services.tinybird = { status: "unhealthy" };
    // Don't mark as unhealthy if Tinybird is down (it's optional for some operations)
    if (health.status === "healthy") {
      health.status = "degraded";
    }
  }

  // Check Redis (if configured)
  if (env.REDIS_URL || env.UPSTASH_REDIS_URL) {
    try {
      const redisStart = Date.now();
      // Try to import and test Redis connection
      const Redis = (await import("ioredis")).default;
      const redisUrl = env.REDIS_URL || env.UPSTASH_REDIS_URL;
      if (redisUrl) {
        const redis = new Redis(redisUrl);
        await redis.ping();
        await redis.quit();
        const redisLatency = Date.now() - redisStart;
        health.services.redis = {
          status: "healthy",
          latency_ms: redisLatency,
        };
      }
    } catch (error) {
      health.services.redis = { status: "unhealthy" };
      // Redis is optional, so don't mark as unhealthy
      if (health.status === "healthy") {
        health.status = "degraded";
      }
    }
  }

  // Check Analysis Service (if configured)
  if (env.ANALYSIS_SERVICE_URL) {
    try {
      const analysisStart = Date.now();
      const response = await fetch(`${env.ANALYSIS_SERVICE_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      const analysisLatency = Date.now() - analysisStart;
      if (response.ok) {
        health.services.analysis_service = {
          status: "healthy",
          latency_ms: analysisLatency,
        };
      } else {
        health.services.analysis_service = { status: "unhealthy" };
        if (health.status === "healthy") {
          health.status = "degraded";
        }
      }
    } catch (error) {
      health.services.analysis_service = { status: "unhealthy" };
      // Analysis service is optional, so don't mark as unhealthy
      if (health.status === "healthy") {
        health.status = "degraded";
      }
    }
  }

  // Return appropriate status code
  const statusCode =
    health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  res.status(statusCode).json(health);
});

export default router;


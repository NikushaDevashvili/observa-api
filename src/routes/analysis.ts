/**
 * Analysis Routes
 * 
 * API endpoints for explicit analysis requests and queue monitoring
 */

import { Router, Request, Response } from "express";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware.js";
import {
  queueAnalysisForExplicitRequest,
  getQueueStats,
} from "../services/analysisDispatcher.js";
import { TraceQueryService } from "../services/traceQueryService.js";

const router = Router();

/**
 * POST /api/v1/analysis/analyze
 * Explicitly request analysis for a trace
 * 
 * Headers:
 *   Authorization: Bearer <API_KEY>
 * 
 * Body:
 *   {
 *     "trace_id": "uuid",
 *     "layers": ["layer3", "layer4"] // Optional, defaults to ["layer4"]
 *   }
 */
router.post(
  "/analyze",
  apiKeyMiddleware("query"), // Require query scope for explicit requests
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const projectId = (req as any).projectId;
      const { trace_id, layers } = req.body;

      if (!trace_id) {
        return res.status(400).json({
          error: {
            code: "INVALID_PAYLOAD",
            message: "trace_id is required",
          },
        });
      }

      // Get trace data for analysis
      const trace = await TraceQueryService.getTraceDetail(
        trace_id,
        tenantId,
        projectId
      );

      if (!trace) {
        return res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Trace not found",
          },
        });
      }

      // Default to Layer 4 if not specified
      const analysisLayers: ("layer3" | "layer4")[] =
        layers && Array.isArray(layers)
          ? layers.filter((l) => l === "layer3" || l === "layer4")
          : ["layer4"];

      if (analysisLayers.length === 0) {
        return res.status(400).json({
          error: {
            code: "INVALID_PAYLOAD",
            message: "layers must include 'layer3' and/or 'layer4'",
          },
        });
      }

      // Queue analysis job
      const queued = await queueAnalysisForExplicitRequest(
        trace_id,
        tenantId,
        projectId,
        analysisLayers,
        {
          span_id: trace.span_id || undefined,
          conversation_id: trace.conversation_id || undefined,
          query: trace.query || undefined,
          context: trace.context || undefined,
          response: trace.response || undefined,
          model: trace.model || undefined,
          tokens_total: trace.tokens_total || undefined,
          latency_ms: trace.latency_ms || undefined,
          cost: trace.total_cost || undefined,
        }
      );

      if (!queued) {
        return res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Analysis queue is not available",
            details: {
              hint: "Redis may not be configured. Check REDIS_URL or UPSTASH_REDIS_URL environment variable.",
            },
          },
        });
      }

      return res.status(202).json({
        success: true,
        message: "Analysis job queued successfully",
        trace_id,
        layers: analysisLayers,
        status: "queued",
      });
    } catch (error) {
      console.error("[Analysis API] Error queuing analysis:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: errorMessage,
        },
      });
    }
  }
);

/**
 * GET /api/v1/analysis/queue/stats
 * Get analysis queue statistics
 * 
 * Headers:
 *   Authorization: Bearer <API_KEY>
 */
router.get(
  "/queue/stats",
  apiKeyMiddleware("query"),
  async (req: Request, res: Response) => {
    try {
      const stats = await getQueueStats();

      if (!stats) {
        return res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Analysis queue is not available",
            details: {
              hint: "Redis may not be configured. Check REDIS_URL or UPSTASH_REDIS_URL environment variable.",
            },
          },
        });
      }

      return res.status(200).json({
        success: true,
        queue: {
          waiting: stats.waiting,
          active: stats.active,
          completed: stats.completed,
          failed: stats.failed,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Analysis API] Error getting queue stats:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: errorMessage,
        },
      });
    }
  }
);

export default router;


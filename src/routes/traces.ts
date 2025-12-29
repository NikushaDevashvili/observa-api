import { Router, Request, Response } from "express";
import { TokenService } from "../services/tokenService.js";
import { TraceService } from "../services/traceService.js";
import { AnalysisService } from "../services/analysisService.js";
import { AuthService } from "../services/authService.js";
import { TraceEvent } from "../types.js";
import { traceEventSchema } from "../validation/schemas.js";
import { query } from "../db/client.js";

const router = Router();

/**
 * POST /api/v1/traces/ingest
 * Trace ingestion endpoint
 *
 * Validates JWT token and forwards trace data to Tinybird
 *
 * Headers:
 *   Authorization: Bearer <JWT_TOKEN>
 *
 * Body: TraceEvent (JSON)
 *
 * Response: 200 OK on success
 */
router.post("/ingest", async (req: Request, res: Response) => {
  console.log(`[Observa API] Received trace ingestion request`);
  try {
    // Extract JWT token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error(`[Observa API] Missing or invalid Authorization header`);
      return res.status(401).json({
        error:
          "Missing or invalid Authorization header. Expected: Bearer <token>",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Validate JWT token
    const payload = TokenService.validateToken(token);
    if (!payload) {
      console.error(`[Observa API] Invalid or expired JWT token`);
      return res.status(401).json({
        error: "Invalid or expired JWT token",
      });
    }

    // Extract tenant context from JWT
    const tenantId = payload.tenantId;
    const projectId = payload.projectId;
    const environment = payload.environment ?? "dev";

    if (!tenantId || !projectId) {
      return res.status(401).json({
        error: "JWT token missing tenantId or projectId",
      });
    }

    // Validate trace data structure with Zod
    const traceData = req.body;
    const validationResult = traceEventSchema.safeParse(traceData);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid trace data structure",
        details: validationResult.error.issues,
      });
    }

    // Override tenant/project from JWT (security: prevent token spoofing)
    const validatedData = validationResult.data;
    const trace: TraceEvent = {
      ...validatedData,
      tenantId,
      projectId,
      environment,
      headers: validatedData.headers as Record<string, string> | undefined,
    };

    // Forward to Tinybird
    console.log(
      `[Observa API] Forwarding trace to Tinybird - TraceID: ${trace.traceId}, Tenant: ${tenantId}, Project: ${projectId}`
    );
    await TraceService.forwardToTinybird(trace);
    console.log(
      `[Observa API] Successfully forwarded trace to Tinybird - TraceID: ${trace.traceId}`
    );

    // Trigger ML analysis asynchronously (don't block response)
    AnalysisService.analyzeTrace(trace).catch((error) => {
      console.error(
        `[Analysis] Failed to analyze trace ${trace.traceId}:`,
        error
      );
    });

    // Log success (in dev mode)
    if (process.env.NODE_ENV !== "production") {
      console.log(`POST /api/v1/traces/ingest`);
      console.log(`JWT validation successful`);
      console.log(`Tenant: ${tenantId}, Project: ${projectId}`);
      console.log(`Forwarding to Tinybird...`);
      console.log(`Trace ID: ${trace.traceId}`);
    }

    return res.status(200).json({
      success: true,
      traceId: trace.traceId,
      message: "Trace ingested successfully",
    });
  } catch (error) {
    console.error("Error during trace ingestion:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({
      error: errorMessage,
    });
  }
});

/**
 * GET /api/v1/traces
 * Get traces for the authenticated user
 * Includes analysis results if available
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    // Get query parameters
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const issueType = req.query.issueType as string | undefined;
    const projectId = req.query.projectId as string | undefined;

    // Build query
    let whereClause = `WHERE ar.tenant_id = $1`;
    const params: any[] = [user.tenantId];
    let paramIndex = 2;

    if (projectId) {
      whereClause += ` AND ar.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    // Filter by issue type
    if (issueType) {
      switch (issueType) {
        case "hallucination":
          whereClause += ` AND ar.is_hallucination = true`;
          break;
        case "context_drop":
          whereClause += ` AND ar.has_context_drop = true`;
          break;
        case "faithfulness":
          whereClause += ` AND ar.has_faithfulness_issue = true`;
          break;
        case "drift":
          whereClause += ` AND ar.has_model_drift = true`;
          break;
        case "cost_anomaly":
          whereClause += ` AND ar.has_cost_anomaly = true`;
          break;
      }
    }

    // Get traces with analysis results from Tinybird (via analysis_results table)
    // Note: In production, you'd join with actual traces from Tinybird
    // For now, we'll return analysis results which reference trace_ids
    const traces = await query(
      `SELECT 
        ar.trace_id,
        ar.tenant_id,
        ar.project_id,
        ar.analyzed_at,
        ar.is_hallucination,
        ar.hallucination_confidence,
        ar.quality_score,
        ar.has_context_drop,
        ar.has_model_drift,
        ar.has_faithfulness_issue,
        ar.has_cost_anomaly,
        ar.context_relevance_score,
        ar.answer_faithfulness_score,
        ar.drift_score,
        ar.anomaly_score
       FROM analysis_results ar
       ${whereClause}
       ORDER BY ar.analyzed_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analysis_results ar ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    res.json({
      success: true,
      traces,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching traces:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/traces/:traceId
 * Get a specific trace with full analysis results
 */
router.get("/:traceId", async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;

    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    // Get analysis results
    const analysisResult = await AnalysisService.getAnalysisResults(traceId);

    if (!analysisResult) {
      return res.status(404).json({
        error: "Trace not found",
      });
    }

    // Verify tenant ownership
    if (analysisResult.tenant_id !== user.tenantId) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    res.json({
      success: true,
      trace: {
        traceId: analysisResult.trace_id,
        tenantId: analysisResult.tenant_id,
        projectId: analysisResult.project_id,
        analyzedAt: analysisResult.analyzed_at,
        analysis: {
          isHallucination: analysisResult.is_hallucination,
          hallucinationConfidence: analysisResult.hallucination_confidence,
          hallucinationReasoning: analysisResult.hallucination_reasoning,
          qualityScore: analysisResult.quality_score,
          coherenceScore: analysisResult.coherence_score,
          relevanceScore: analysisResult.relevance_score,
          helpfulnessScore: analysisResult.helpfulness_score,
          hasContextDrop: analysisResult.has_context_drop,
          hasModelDrift: analysisResult.has_model_drift,
          hasPromptInjection: analysisResult.has_prompt_injection,
          hasContextOverflow: analysisResult.has_context_overflow,
          hasFaithfulnessIssue: analysisResult.has_faithfulness_issue,
          hasCostAnomaly: analysisResult.has_cost_anomaly,
          hasLatencyAnomaly: analysisResult.has_latency_anomaly,
          hasQualityDegradation: analysisResult.has_quality_degradation,
          contextRelevanceScore: analysisResult.context_relevance_score,
          answerFaithfulnessScore: analysisResult.answer_faithfulness_score,
          driftScore: analysisResult.drift_score,
          anomalyScore: analysisResult.anomaly_score,
          analysisModel: analysisResult.analysis_model,
          analysisVersion: analysisResult.analysis_version,
          processingTimeMs: analysisResult.processing_time_ms,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching trace:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;

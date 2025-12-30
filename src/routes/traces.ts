import { Router, Request, Response } from "express";
import { TokenService } from "../services/tokenService.js";
import { TraceService } from "../services/traceService.js";
import { AnalysisService } from "../services/analysisService.js";
import { AuthService } from "../services/authService.js";
import { TraceEvent } from "../types.js";
import { traceEventSchema } from "../validation/schemas.js";
import { query } from "../db/client.js";

/**
 * Calculate cost based on tokens and model (simplified)
 * In production, use actual pricing from model provider
 */
function calculateCost(tokensTotal: number, model: string): number {
  // Simplified cost calculation - adjust based on actual model pricing
  // Example: GPT-4 is ~$0.03 per 1K tokens, GPT-3.5 is ~$0.002 per 1K tokens
  const modelPricing: Record<string, number> = {
    "gpt-4": 0.03,
    "gpt-4-turbo": 0.01,
    "gpt-3.5-turbo": 0.002,
    "gpt-3.5": 0.002,
  };

  const pricePer1K = modelPricing[model.toLowerCase()] || 0.002;
  return (tokensTotal / 1000) * pricePer1K;
}

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
  console.log(`[Observa API] Request method: ${req.method}, URL: ${req.url}`);
  console.log(`[Observa API] Request headers:`, {
    authorization: req.headers.authorization ? "present" : "missing",
    contentType: req.headers["content-type"],
  });

  try {
    // Extract JWT token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error(`[Observa API] Missing or invalid Authorization header`);
      console.error(`[Observa API] Auth header value:`, authHeader);
      return res.status(401).json({
        error:
          "Missing or invalid Authorization header. Expected: Bearer <token>",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    console.log(`[Observa API] Extracted token (length: ${token.length})`);

    // Validate JWT token
    const payload = TokenService.validateToken(token);
    if (!payload) {
      console.error(`[Observa API] Invalid or expired JWT token`);
      return res.status(401).json({
        error: "Invalid or expired JWT token",
      });
    }

    console.log(
      `[Observa API] JWT validated - Tenant: ${payload.tenantId}, Project: ${payload.projectId}`
    );

    // Extract tenant context from JWT
    const tenantId = payload.tenantId;
    const projectId = payload.projectId;
    const environment = payload.environment ?? "dev";

    if (!tenantId || !projectId) {
      console.error(
        `[Observa API] JWT missing tenantId or projectId - tenantId: ${tenantId}, projectId: ${projectId}`
      );
      return res.status(401).json({
        error: "JWT token missing tenantId or projectId",
      });
    }

    // Validate trace data structure with Zod
    const traceData = req.body;
    console.log(
      `[Observa API] Received trace data - traceId: ${
        traceData?.traceId
      }, query length: ${traceData?.query?.length || 0}`
    );
    console.log(
      `[Observa API] Trace data keys:`,
      traceData ? Object.keys(traceData) : "null"
    );
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'traces.ts:100',message:'Trace ingestion received',data:{traceId:traceData?.traceId,conversationId:traceData?.conversationId,messageIndex:traceData?.messageIndex,queryLength:traceData?.query?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
    // #endregion

    const validationResult = traceEventSchema.safeParse(traceData);
    if (!validationResult.success) {
      console.error(
        `[Observa API] Validation failed:`,
        JSON.stringify(validationResult.error.issues, null, 2)
      );
      return res.status(400).json({
        error: "Invalid trace data structure",
        details: validationResult.error.issues,
      });
    }

    console.log(`[Observa API] Trace data validation passed`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'traces.ts:118',message:'Trace validated, creating TraceEvent',data:{traceId:validationResult.data?.traceId,conversationId:validationResult.data?.conversationId,messageIndex:validationResult.data?.messageIndex,tenantId,projectId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
    // #endregion

    // Override tenant/project from JWT (security: prevent token spoofing)
    const validatedData = validationResult.data;
    const trace: TraceEvent = {
      ...validatedData,
      tenantId,
      projectId,
      environment,
      headers: validatedData.headers as Record<string, string> | undefined,
    };

    // Handle conversation/session tracking (if provided)
    if (trace.conversationId) {
      const { ConversationService } = await import(
        "../services/conversationService.js"
      );

      try {
        // Get or create conversation
        const conversation = await ConversationService.getOrCreate({
          conversationId: trace.conversationId,
          tenantId: trace.tenantId,
          projectId: trace.projectId,
          userId: trace.userId,
        });

        // Update conversation metrics
        await ConversationService.updateConversationMetrics({
          conversationId: trace.conversationId,
          tenantId: trace.tenantId,
          tokensTotal: trace.tokensTotal,
          // Calculate cost if model and tokens are available (simplified)
          cost:
            trace.tokensTotal && trace.model
              ? calculateCost(trace.tokensTotal, trace.model)
              : undefined,
          hasIssues: false, // Will be updated after analysis
        });

        console.log(
          `[Observa API] Updated conversation ${trace.conversationId} - TraceID: ${trace.traceId}`
        );
      } catch (error) {
        console.error(
          `[Observa API] Failed to update conversation (non-fatal):`,
          error
        );
        // Don't throw - conversation tracking failure shouldn't break trace ingestion
      }
    }

    // Handle session tracking (if provided)
    if (trace.sessionId) {
      const { ConversationService } = await import(
        "../services/conversationService.js"
      );

      try {
        await ConversationService.getOrCreateSession({
          sessionId: trace.sessionId,
          tenantId: trace.tenantId,
          projectId: trace.projectId,
          userId: trace.userId,
          conversationId: trace.conversationId,
        });

        await ConversationService.updateSessionMetrics({
          sessionId: trace.sessionId,
          tenantId: trace.tenantId,
        });

        console.log(
          `[Observa API] Updated session ${trace.sessionId} - TraceID: ${trace.traceId}`
        );
      } catch (error) {
        console.error(
          `[Observa API] Failed to update session (non-fatal):`,
          error
        );
        // Don't throw - session tracking failure shouldn't break trace ingestion
      }
    }

    // SOTA Architecture: Store trace data immediately in PostgreSQL (HTAP pattern)
    // This ensures data is available for operational queries while Tinybird handles analytics
    console.log(
      `[Observa API] Storing trace data in PostgreSQL - TraceID: ${
        trace.traceId
      }, Query: ${trace.query?.substring(0, 50)}...`
    );
    try {
      await TraceService.storeTraceData(trace);
      console.log(
        `[Observa API] ✅ Successfully stored trace data in PostgreSQL - TraceID: ${trace.traceId}`
      );
    } catch (storeError) {
      console.error(
        `[Observa API] ❌ Failed to store trace data in PostgreSQL - TraceID: ${trace.traceId}`,
        storeError
      );
      // Don't throw - continue to try Tinybird forwarding
    }

    // Forward to Tinybird for analytical workloads (async, can retry if fails)
    console.log(
      `[Observa API] Forwarding trace to Tinybird - TraceID: ${trace.traceId}, Tenant: ${tenantId}, Project: ${projectId}`
    );
    TraceService.forwardToTinybird(trace)
      .then(() => {
        console.log(
          `[Observa API] ✅ Successfully forwarded trace to Tinybird - TraceID: ${trace.traceId}`
        );
      })
      .catch((error) => {
        console.error(
          `[Observa API] ❌ Failed to forward trace to Tinybird (non-fatal) - TraceID: ${trace.traceId}:`,
          error
        );
        // Don't throw - Tinybird failure shouldn't break trace ingestion
      });

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

    console.log(
      `[Observa API] ✅ Trace ingestion completed successfully - TraceID: ${trace.traceId}`
    );
    return res.status(200).json({
      success: true,
      traceId: trace.traceId,
      message: "Trace ingested successfully",
    });
  } catch (error) {
    console.error("[Observa API] ❌ Error during trace ingestion:", error);
    if (error instanceof Error) {
      console.error("[Observa API] Error message:", error.message);
      console.error("[Observa API] Error stack:", error.stack);
    }
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

    // Get traces with analysis results from analysis_results table
    // Include all trace data so traces are visible even before analysis completes
    // Order by timestamp (when trace was created) since analyzed_at might be NULL for new traces
    console.log(
      `[Traces API] Fetching traces for tenant ${user.tenantId}, limit: ${limit}, offset: ${offset}`
    );
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'traces.ts:346',message:'Before querying traces',data:{tenantId:user.tenantId,limit,offset,whereClause,paramCount:params.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const traces = await query(
      `SELECT 
        ar.trace_id,
        ar.tenant_id,
        ar.project_id,
        ar.analyzed_at,
        ar.timestamp,
        ar.query,
        ar.response,
        ar.model,
        ar.tokens_total,
        ar.latency_ms,
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
        ar.anomaly_score,
        ar.conversation_id,
        ar.message_index
       FROM analysis_results ar
       ${whereClause}
       ORDER BY COALESCE(ar.timestamp, ar.analyzed_at) DESC NULLS LAST
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    console.log(
      `[Traces API] Found ${traces.length} traces for tenant ${user.tenantId}`
    );
    // Log detailed trace information for debugging
    if (traces.length > 0) {
      console.log(`[Traces API] Sample traces:`, traces.slice(0, 5).map((t: any) => ({
        traceId: t.trace_id?.substring(0, 20),
        conversationId: t.conversation_id?.substring(0, 20),
        messageIndex: t.message_index,
        query: t.query?.substring(0, 50),
        timestamp: t.timestamp
      })));
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'traces.ts:390',message:'After query, traces returned',data:{traceCount:traces.length,traceIds:traces.map((t:any)=>t.trace_id),conversationIds:traces.map((t:any)=>t.conversation_id),messageIndexes:traces.map((t:any)=>t.message_index),queries:traces.map((t:any)=>t.query?.substring(0,30))},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analysis_results ar ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.count || "0", 10);
    
    // Debug: Count traces per conversation to see if multiple traces exist
    const conversationCounts = await query<{ conversation_id: string; count: string }>(
      `SELECT conversation_id, COUNT(*) as count 
       FROM analysis_results ar 
       ${whereClause} 
       GROUP BY conversation_id 
       ORDER BY count DESC 
       LIMIT 10`,
      params
    );
    console.log(`[Traces API] Traces per conversation:`, conversationCounts.map((c: any) => ({
      conversationId: c.conversation_id?.substring(0, 20),
      count: c.count
    })));

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
        // ALL original trace data - every field
        spanId: analysisResult.span_id,
        parentSpanId: analysisResult.parent_span_id,
        query: analysisResult.query,
        context: analysisResult.context,
        response: analysisResult.response,
        model: analysisResult.model,
        tokensPrompt: analysisResult.tokens_prompt,
        tokensCompletion: analysisResult.tokens_completion,
        tokensTotal: analysisResult.tokens_total,
        latencyMs: analysisResult.latency_ms,
        timeToFirstTokenMs: analysisResult.time_to_first_token_ms,
        streamingDurationMs: analysisResult.streaming_duration_ms,
        responseLength: analysisResult.response_length,
        status: analysisResult.status,
        statusText: analysisResult.status_text,
        finishReason: analysisResult.finish_reason,
        responseId: analysisResult.response_id,
        systemFingerprint: analysisResult.system_fingerprint,
        metadata: analysisResult.metadata_json
          ? JSON.parse(analysisResult.metadata_json)
          : null,
        headers: analysisResult.headers_json
          ? JSON.parse(analysisResult.headers_json)
          : null,
        timestamp: analysisResult.timestamp,
        environment: analysisResult.environment,
        // Analysis results
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

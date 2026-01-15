import { Router, Request, Response } from "express";
import { TokenService } from "../services/tokenService.js";
import { TraceService } from "../services/traceService.js";
// AnalysisService no longer used - analysis is now event-driven via SignalsService
// import { AnalysisService } from "../services/analysisService.js";
import { AuthService } from "../services/authService.js";
import { TraceQueryService } from "../services/traceQueryService.js";
import { AgentPrismAdapterService } from "../services/agentPrismAdapter.js";
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
    "gpt-4o": 0.015,
    "gpt-4o-mini": 0.003,
    "gpt-3.5-turbo": 0.002,
    "gpt-3.5": 0.002,
    "claude-3-opus": 0.03,
    "claude-3-sonnet": 0.012,
    "claude-3-haiku": 0.0025,
  };

  const pricePer1K = modelPricing[model.toLowerCase()] || 0.002;
  return (tokensTotal / 1000) * pricePer1K;
}

const router = Router();

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseBool(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  const v = String(value).toLowerCase().trim();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => String(v).split(","))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function performanceBadgeFromLatency(
  latencyMs: unknown
): "fast" | "medium" | "slow" | null {
  const ms = typeof latencyMs === "number" ? latencyMs : null;
  if (ms === null) return null;
  if (ms < 500) return "fast";
  if (ms < 2000) return "medium";
  return "slow";
}

function scrubLlmMessages(target: any): void {
  if (!target || typeof target !== "object") return;
  if ("input_messages" in target) delete target.input_messages;
  if ("output_messages" in target) delete target.output_messages;
  if ("system_instructions" in target) delete target.system_instructions;
}

function scrubTraceMessages(trace: any): void {
  if (!trace || typeof trace !== "object") return;

  const seen = new Set<any>();
  const scrubSpan = (span: any) => {
    if (!span || typeof span !== "object" || seen.has(span)) return;
    seen.add(span);

    scrubLlmMessages(span.llm_call);
    scrubLlmMessages(span.details);

    if (Array.isArray(span.events)) {
      for (const event of span.events) {
        if (event?.attributes?.llm_call) {
          scrubLlmMessages(event.attributes.llm_call);
        }
      }
    }

    if (Array.isArray(span.children)) {
      for (const child of span.children) {
        scrubSpan(child);
      }
    }
  };

  const allSpans = Array.isArray(trace.allSpans) ? trace.allSpans : null;
  const spans = Array.isArray(trace.spans) ? trace.spans : null;

  if (allSpans) {
    for (const span of allSpans) scrubSpan(span);
  } else if (spans) {
    for (const span of spans) scrubSpan(span);
  }

  if (trace.spansById && typeof trace.spansById === "object") {
    for (const span of Object.values(trace.spansById)) {
      scrubSpan(span);
    }
  }
}

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
      }, query length: ${traceData?.query?.length || 0}, conversationId: ${
        traceData?.conversationId?.substring(0, 20) || "none"
      }, messageIndex: ${traceData?.messageIndex || "none"}`
    );
    console.log(
      `[Observa API] Trace data keys:`,
      traceData ? Object.keys(traceData) : "null"
    );
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "traces.ts:100",
        message: "Trace ingestion received",
        data: {
          traceId: traceData?.traceId?.substring(0, 20),
          conversationId: traceData?.conversationId?.substring(0, 20),
          messageIndex: traceData?.messageIndex,
          queryLength: traceData?.query?.length,
          query: traceData?.query?.substring(0, 30),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run3",
        hypothesisId: "A,B,C",
      }),
    }).catch(() => {});
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
    fetch("http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "traces.ts:118",
        message: "Trace validated, creating TraceEvent",
        data: {
          traceId: validationResult.data?.traceId,
          conversationId: validationResult.data?.conversationId,
          messageIndex: validationResult.data?.messageIndex,
          tenantId,
          projectId,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A,B,C",
      }),
    }).catch(() => {});
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

    // SOTA: Analysis is now event-driven via SignalsService
    // Analysis jobs are queued when high-severity signals are detected
    // No direct analysis calls here - let signals trigger analysis

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
 * Uses TraceQueryService for consistent querying (currently uses analysis_results table)
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

    // Get query parameters (Phase 1/2: advanced filtering + sorting + stats)
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const issueType = req.query.issueType as string | undefined;
    const projectId = req.query.projectId as string | undefined;

    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const models =
      parseStringList(req.query.models ?? req.query.model) || undefined;
    const userIds =
      parseStringList(req.query.userIds ?? req.query.userId) || undefined;
    const environments =
      parseStringList(req.query.environments ?? req.query.environment) ||
      undefined;
    const conversationId = req.query.conversationId as string | undefined;
    const minCost = parseNumber(req.query.minCost);
    const maxCost = parseNumber(req.query.maxCost);
    const minLatencyMs = parseNumber(req.query.minLatencyMs);
    const maxLatencyMs = parseNumber(req.query.maxLatencyMs);
    const minQualityScore = parseNumber(req.query.minQualityScore);
    const maxQualityScore = parseNumber(req.query.maxQualityScore);
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as any) || undefined;
    const sortOrder = (req.query.sortOrder as any) || undefined;
    const includeStats = parseBool(req.query.includeStats) ?? true;

    console.log(
      `[Traces API] Fetching traces for tenant ${
        user.tenantId
      }, limit: ${limit}, offset: ${offset}, issueType: ${issueType || "all"}`
    );

    // Use TraceQueryService for consistent querying
    const result = await TraceQueryService.getTracesV2(user.tenantId, {
      projectId: projectId || null,
      limit,
      offset,
      issueType,
      startDate,
      endDate,
      models,
      userIds,
      environments,
      conversationId,
      minCost,
      maxCost,
      minLatencyMs,
      maxLatencyMs,
      minQualityScore,
      maxQualityScore,
      search,
      sortBy,
      sortOrder,
      includeStats,
    });

    // Transform to match frontend expectations (snake_case to camelCase where needed)
    const traces = result.traces.map((trace) => ({
      trace_id: trace.trace_id,
      tenant_id: trace.tenant_id,
      project_id: trace.project_id,
      analyzed_at: trace.analyzed_at,
      timestamp: trace.timestamp,
      model: trace.model,
      query: trace.query,
      response: trace.response,
      tokens_total: trace.tokens_total,
      tokens_prompt: trace.tokens_prompt,
      tokens_completion: trace.tokens_completion,
      latency_ms: trace.latency_ms,
      time_to_first_token_ms: trace.time_to_first_token_ms,
      response_length: trace.response_length,
      status: trace.status,
      status_text: trace.status_text,
      quality_score: trace.quality_score,
      estimated_cost_usd: trace.estimated_cost_usd,
      issue_count: trace.issue_count,
      performance_badge: performanceBadgeFromLatency(trace.latency_ms),
      conversation_id: trace.conversation_id,
      session_id: trace.session_id,
      user_id: trace.user_id,
      message_index: trace.message_index,
      environment: trace.environment,
      is_hallucination: trace.is_hallucination,
      hallucination_confidence: trace.hallucination_confidence,
      has_context_drop: trace.has_context_drop,
      has_faithfulness_issue: trace.has_faithfulness_issue,
      has_model_drift: trace.has_model_drift,
      has_cost_anomaly: trace.has_cost_anomaly,
      context_relevance_score: trace.context_relevance_score,
      answer_faithfulness_score: trace.answer_faithfulness_score,
    }));

    console.log(
      `[Traces API] Found ${traces.length} traces (total: ${result.total})`
    );

    res.json({
      success: true,
      traces,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + limit < result.total,
      },
      stats: result.stats || undefined,
    });
  } catch (error) {
    console.error("Error fetching traces:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/traces/models
 * List available models (distinct) for the authenticated tenant (with counts)
 *
 * Query params:
 * - projectId (optional)
 * - environment (optional)
 * - startDate/endDate (optional)
 * - limit (optional, default 50, max 200)
 */
router.get("/models", async (req: Request, res: Response) => {
  try {
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

    const projectId = (req.query.projectId as string | undefined) || null;
    const environment = (req.query.environment as string | undefined) || null;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const models = await TraceQueryService.getAvailableModels({
      tenantId: user.tenantId,
      projectId,
      environment,
      startDate,
      endDate,
      limit,
    });

    return res.status(200).json({
      success: true,
      models,
    });
  } catch (error) {
    console.error("Error fetching available models:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/traces/export
 * Export traces for the authenticated user (CSV or JSON)
 *
 * Query params:
 * - format=csv|json (default: json)
 * - supports same filters as GET /api/v1/traces
 */
router.get("/export", async (req: Request, res: Response) => {
  try {
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

    const format = String(req.query.format || "json").toLowerCase();
    const projectId = req.query.projectId as string | undefined;

    const limitRaw = parseInt(req.query.limit as string) || 1000;
    const limit = Math.min(Math.max(limitRaw, 1), 5000);
    const offset = parseInt(req.query.offset as string) || 0;

    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const issueType = req.query.issueType as string | undefined;
    const models =
      parseStringList(req.query.models ?? req.query.model) || undefined;
    const userIds =
      parseStringList(req.query.userIds ?? req.query.userId) || undefined;
    const environments =
      parseStringList(req.query.environments ?? req.query.environment) ||
      undefined;
    const conversationId = req.query.conversationId as string | undefined;
    const minCost = parseNumber(req.query.minCost);
    const maxCost = parseNumber(req.query.maxCost);
    const minLatencyMs = parseNumber(req.query.minLatencyMs);
    const maxLatencyMs = parseNumber(req.query.maxLatencyMs);
    const minQualityScore = parseNumber(req.query.minQualityScore);
    const maxQualityScore = parseNumber(req.query.maxQualityScore);
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as any) || undefined;
    const sortOrder = (req.query.sortOrder as any) || undefined;

    const result = await TraceQueryService.getTracesV2(user.tenantId, {
      projectId: projectId || null,
      limit,
      offset,
      issueType,
      startDate,
      endDate,
      models,
      userIds,
      environments,
      conversationId,
      minCost,
      maxCost,
      minLatencyMs,
      maxLatencyMs,
      minQualityScore,
      maxQualityScore,
      search,
      sortBy,
      sortOrder,
      includeStats: false,
    });

    if (format === "csv") {
      const headers = [
        "trace_id",
        "timestamp",
        "analyzed_at",
        "project_id",
        "environment",
        "model",
        "latency_ms",
        "tokens_total",
        "estimated_cost_usd",
        "quality_score",
        "issue_count",
        "status",
        "conversation_id",
        "session_id",
        "user_id",
        "message_index",
      ];

      const escape = (v: any) => {
        const s = v === null || v === undefined ? "" : String(v);
        if (s.includes('"') || s.includes(",") || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const rows = result.traces.map((t: any) => [
        t.trace_id,
        t.timestamp,
        t.analyzed_at,
        t.project_id,
        t.environment,
        t.model,
        t.latency_ms,
        t.tokens_total,
        t.estimated_cost_usd,
        t.quality_score,
        t.issue_count,
        t.status,
        t.conversation_id,
        t.session_id,
        t.user_id,
        t.message_index,
      ]);

      const csv = [
        headers.join(","),
        ...rows.map((r) => r.map(escape).join(",")),
      ].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="traces-export.csv"`
      );
      return res.status(200).send(csv);
    }

    return res.status(200).json({
      success: true,
      traces: result.traces,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + limit < result.total,
      },
    });
  } catch (error) {
    console.error("Error exporting traces:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/traces/:traceId/export
 * Export a single trace detail as JSON or Markdown
 *
 * Query params:
 * - format=json|md (default: json)
 * - projectId=...
 */
router.get("/:traceId/export", async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;
    const format = String(req.query.format || "json").toLowerCase();
    const includeMessages = parseBool(req.query.includeMessages) ?? false;

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

    const projectId = (req.query.projectId as string | undefined) || null;
    const traceTree = await TraceQueryService.getTraceDetailTree(
      traceId,
      user.tenantId,
      projectId
    );

    if (!traceTree) {
      return res.status(404).json({
        error: "Trace not found",
      });
    }

    if (!includeMessages) {
      scrubTraceMessages(traceTree);
    }

    let conversation: any = null;
    const conversationId = traceTree?.summary?.conversation_id;
    if (conversationId) {
      try {
        conversation = await TraceQueryService.getConversationContext({
          tenantId: user.tenantId,
          projectId,
          conversationId,
          traceId,
        });
      } catch (e) {
        // Non-fatal
        conversation = null;
      }
    }

    if (format === "md" || format === "markdown") {
      const s = traceTree.summary || {};
      const md = [
        `# Trace ${s.trace_id || traceId}`,
        ``,
        `## Summary`,
        `- **Project**: ${s.project_id || "n/a"}`,
        `- **Environment**: ${s.environment || "n/a"}`,
        `- **Model**: ${s.model || "n/a"}`,
        `- **Start**: ${s.start_time || "n/a"}`,
        `- **End**: ${s.end_time || "n/a"}`,
        `- **Total latency (ms)**: ${s.total_latency_ms ?? "n/a"}`,
        `- **Total tokens**: ${s.total_tokens ?? "n/a"}`,
        `- **Total cost (USD)**: ${
          s.total_cost ?? traceTree?.costBreakdown?.totalCostUsd ?? "n/a"
        }`,
        ``,
        `## Signals`,
        ...(Array.isArray(traceTree.signals) && traceTree.signals.length > 0
          ? traceTree.signals.map((sig: any) =>
              `- **${sig.signal_type}** (${sig.severity}) ${
                sig.score ?? sig.confidence ?? ""
              }`.trim()
            )
          : [`- None`]),
        ``,
        `## Performance`,
        `- **Bottleneck span**: ${
          traceTree?.performanceAnalysis?.bottleneckSpanId || "n/a"
        }`,
        `- **Bottleneck duration (ms)**: ${
          traceTree?.performanceAnalysis?.bottleneckDurationMs ?? "n/a"
        }`,
        ...(Array.isArray(traceTree?.performanceAnalysis?.suggestions) &&
        traceTree.performanceAnalysis.suggestions.length > 0
          ? [
              ``,
              `### Suggestions`,
              ...traceTree.performanceAnalysis.suggestions.map(
                (x: string) => `- ${x}`
              ),
            ]
          : []),
        ``,
        `## Cost Breakdown`,
        `- **Total (USD)**: ${traceTree?.costBreakdown?.totalCostUsd ?? "n/a"}`,
        ...(traceTree?.costBreakdown?.topSpans?.length
          ? [
              ``,
              `### Top Spans`,
              ...traceTree.costBreakdown.topSpans.map(
                (x: any) => `- ${x.name} (${x.spanId}): $${x.costUsd}`
              ),
            ]
          : [`- n/a`]),
        ``,
        `## Token Efficiency`,
        `- **Tokens/char**: ${
          traceTree?.tokenEfficiency?.tokensPerCharacter ?? "n/a"
        }`,
        `- **Benchmark**: ${
          traceTree?.tokenEfficiency?.benchmarkComparison ?? "n/a"
        }`,
        ``,
        conversation
          ? `## Conversation\n- **Conversation ID**: ${
              conversation.id
            }\n- **Message**: ${conversation.messageIndex ?? "n/a"} of ${
              conversation.totalMessages
            }\n- **Prev**: ${
              conversation.previousTraceId ?? "n/a"
            }\n- **Next**: ${conversation.nextTraceId ?? "n/a"}\n`
          : `## Conversation\n- None\n`,
      ].join("\n");

      return res.status(200).json({
        success: true,
        markdown: md,
      });
    }

    return res.status(200).json({
      success: true,
      trace: traceTree,
      conversation: conversation || undefined,
    });
  } catch (error) {
    console.error("Error exporting trace:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/traces/:traceId
 * Get a specific trace with full analysis results
 * Uses TraceQueryService for consistent querying
 */
router.get("/:traceId", async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;
    const format = String(req.query.format || "tree").toLowerCase(); // default to tree
    const includeMessages = parseBool(req.query.includeMessages) ?? false;

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

    // If format=agent-prism requested, return agent-prism formatted data
    if (format === "agent-prism") {
      const traceTree = await TraceQueryService.getTraceDetailTree(
        traceId,
        user.tenantId,
        (req.query.projectId as string | undefined) || null
      );

      if (!traceTree) {
        return res.status(404).json({
          error: "Trace not found",
        });
      }

      // Transform to agent-prism format
      const agentPrismData = AgentPrismAdapterService.adapt(traceTree);
      if (!includeMessages) {
        scrubTraceMessages(agentPrismData);
      }

      let conversation: any = null;
      const conversationId = traceTree?.summary?.conversation_id;
      if (conversationId) {
        try {
          conversation = await TraceQueryService.getConversationContext({
            tenantId: user.tenantId,
            projectId: (req.query.projectId as string | undefined) || null,
            conversationId,
            traceId,
          });
        } catch {
          conversation = null;
        }
      }

      return res.json({
        success: true,
        trace: agentPrismData,
        conversation: conversation || undefined,
      });
    }

    // If format=tree requested (or default), return new tree structure
    if (format === "tree") {
      const traceTree = await TraceQueryService.getTraceDetailTree(
        traceId,
        user.tenantId,
        (req.query.projectId as string | undefined) || null
      );

      if (!traceTree) {
        return res.status(404).json({
          error: "Trace not found",
        });
      }

      if (!includeMessages) {
        scrubTraceMessages(traceTree);
      }

      let conversation: any = null;
      const conversationId = traceTree?.summary?.conversation_id;
      if (conversationId) {
        try {
          conversation = await TraceQueryService.getConversationContext({
            tenantId: user.tenantId,
            projectId: (req.query.projectId as string | undefined) || null,
            conversationId,
            traceId,
          });
        } catch {
          conversation = null;
        }
      }

      return res.json({
        success: true,
        trace: traceTree,
        conversation: conversation || undefined,
      });
    }

    // Legacy format (backward compatibility)
    // Use ?format=legacy explicitly when older clients rely on flat fields
    const analysisResult = await TraceQueryService.getTraceDetail(
      traceId,
      user.tenantId,
      (req.query.projectId as string | undefined) || null
    );

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

    // Transform to match frontend expectations
    const estimatedCostUsd =
      analysisResult.tokens_total && analysisResult.model
        ? calculateCost(analysisResult.tokens_total, analysisResult.model)
        : null;

    // Phase 2: lightweight explanations/efficiency for legacy format too
    const totalChars =
      (analysisResult.query ? String(analysisResult.query).length : 0) +
      (analysisResult.response ? String(analysisResult.response).length : 0);
    const tokensPerCharacter =
      analysisResult.tokens_total && totalChars > 0
        ? analysisResult.tokens_total / totalChars
        : null;

    const qualityExplanation = (() => {
      const coherence = analysisResult.coherence_score;
      const relevance = analysisResult.relevance_score;
      const helpfulness = analysisResult.helpfulness_score;
      const mk = (label: string, score: any) => {
        if (typeof score !== "number")
          return { score: null, explanation: `${label} score not available.` };
        if (score < 0.5)
          return {
            score,
            explanation: `${label} is low; users may perceive this response as weak.`,
          };
        if (score < 0.7)
          return {
            score,
            explanation: `${label} is moderate; there is room to improve.`,
          };
        return { score, explanation: `${label} is strong.` };
      };
      const improvements: string[] = [];
      if (analysisResult.has_context_drop)
        improvements.push(
          "Improve retrieval quality and ensure relevant context is included."
        );
      if (analysisResult.has_faithfulness_issue)
        improvements.push(
          "Add citations/grounding and tighten instructions to avoid unsupported claims."
        );
      if (analysisResult.has_prompt_injection)
        improvements.push(
          "Add prompt-injection guardrails and input sanitization."
        );
      if (analysisResult.has_context_overflow)
        improvements.push(
          "Reduce prompt size with summarization or better chunk selection."
        );
      if (analysisResult.has_latency_anomaly)
        improvements.push(
          "Optimize slow spans and add caching where possible."
        );
      if (analysisResult.has_cost_anomaly)
        improvements.push(
          "Consider cheaper models, shorter prompts, and token budgeting."
        );
      return {
        overallScore:
          typeof analysisResult.quality_score === "number"
            ? analysisResult.quality_score
            : null,
        breakdown: {
          coherence: mk("Coherence", coherence),
          relevance: mk("Relevance", relevance),
          helpfulness: mk("Helpfulness", helpfulness),
        },
        improvements,
      };
    })();

    let conversation: any = null;
    if (analysisResult.conversation_id) {
      try {
        conversation = await TraceQueryService.getConversationContext({
          tenantId: user.tenantId,
          projectId: (req.query.projectId as string | undefined) || null,
          conversationId: analysisResult.conversation_id,
          traceId,
        });
      } catch {
        conversation = null;
      }
    }

    res.json({
      success: true,
      trace: {
        traceId: analysisResult.trace_id,
        tenantId: analysisResult.tenant_id,
        projectId: analysisResult.project_id,
        analyzedAt: analysisResult.analyzed_at,
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
        estimatedCostUsd,
        metadata: analysisResult.metadata_json
          ? JSON.parse(analysisResult.metadata_json)
          : null,
        headers: analysisResult.headers_json
          ? JSON.parse(analysisResult.headers_json)
          : null,
        timestamp:
          analysisResult.timestamp?.toISOString() || analysisResult.timestamp,
        environment: analysisResult.environment,
        tokenEfficiency: {
          tokensPerCharacter,
          benchmarkComparison:
            tokensPerCharacter === null
              ? "average"
              : tokensPerCharacter > 1.2
              ? "below_average"
              : tokensPerCharacter < 0.6
              ? "above_average"
              : "average",
        },
        qualityExplanation,
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
      conversation: conversation || undefined,
    });
  } catch (error) {
    console.error("Error fetching trace:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;

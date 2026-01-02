/**
 * Events Routes
 *
 * New canonical event ingestion endpoint: /api/v1/events/ingest
 */

import { Router, Request, Response } from "express";
import express from "express";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware.js";
import { rateLimitMiddleware } from "../middleware/rateLimitMiddleware.js";
import { quotaMiddleware } from "../middleware/quotaMiddleware.js";
import {
  payloadLimitMiddleware,
  validateEventSize,
} from "../middleware/payloadLimitMiddleware.js";
import { CanonicalEventService } from "../services/canonicalEventService.js";
import { EventTranslationService } from "../services/eventTranslationService.js";
import { QuotaService } from "../services/quotaService.js";
import { SecretsScrubbingService } from "../services/secretsScrubbingService.js";
import { SignalsService } from "../services/signalsService.js";
import { TraceService } from "../services/traceService.js";
import { ConversationService } from "../services/conversationService.js";
import {
  canonicalEventSchema,
  batchEventsSchema,
} from "../validation/schemas.js";
import { TinybirdCanonicalEvent, CanonicalEvent } from "../types/events.js";
import { isValidUUIDv4 } from "../utils/uuidValidation.js";
import { TraceEvent } from "../types.js";

const router = Router();

// Parse NDJSON bodies as text, JSON bodies as JSON
router.use((req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/x-ndjson")) {
    express.text({ limit: "5mb", type: "application/x-ndjson" })(
      req,
      res,
      next
    );
  } else {
    express.json({ limit: "5mb" })(req, res, next);
  }
});

/**
 * POST /api/v1/events/ingest
 * Batch ingestion of canonical events (NDJSON or JSON array)
 *
 * Accepts:
 * - Content-Type: application/x-ndjson (NDJSON format, one event per line)
 * - Content-Type: application/json (JSON array of events)
 *
 * Headers:
 *   Authorization: Bearer <API_KEY> (sk_ or pk_)
 *
 * Body: NDJSON or JSON array of CanonicalEvent
 *
 * Response: 200 OK with event_count
 */
router.post(
  "/ingest",
  apiKeyMiddleware("ingest"), // Validate API key
  payloadLimitMiddleware, // Check batch size
  rateLimitMiddleware, // Rate limit by tenant/project
  quotaMiddleware, // Check monthly quota
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const projectId = (req as any).projectId;
      const contentType = req.headers["content-type"] || "";

      let events: any[];

      // Parse request body based on content type
      if (contentType.includes("application/x-ndjson")) {
        // NDJSON format (one event per line)
        // For NDJSON, body should be a Buffer or string
        const bodyText = Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);
        const lines = bodyText
          .split("\n")
          .filter((line: string) => line.trim());

        events = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Validate line size
          const lineSize = Buffer.byteLength(line, "utf8");
          const sizeCheck = validateEventSize(lineSize, i);
          if (!sizeCheck.valid) {
            return res.status(413).json(sizeCheck.error);
          }

          try {
            const event = JSON.parse(line);
            events.push(event);
          } catch (parseError) {
            return res.status(400).json({
              error: {
                code: "INVALID_PAYLOAD",
                message: "Invalid NDJSON format",
                details: {
                  validation_errors: [
                    {
                      field: `line_${i + 1}`,
                      message:
                        "Invalid JSON: " +
                        (parseError instanceof Error
                          ? parseError.message
                          : "Unknown error"),
                    },
                  ],
                },
              },
            });
          }
        }
      } else {
        // JSON array format
        if (!Array.isArray(req.body)) {
          return res.status(400).json({
            error: {
              code: "INVALID_PAYLOAD",
              message: "Request body must be an array of events",
              details: {
                hint: "Send JSON array or NDJSON format (application/x-ndjson)",
              },
            },
          });
        }

        events = req.body;

        // Validate each event size
        for (let i = 0; i < events.length; i++) {
          const eventSize = Buffer.byteLength(
            JSON.stringify(events[i]),
            "utf8"
          );
          const sizeCheck = validateEventSize(eventSize, i);
          if (!sizeCheck.valid) {
            return res.status(413).json(sizeCheck.error);
          }
        }
      }

      if (events.length === 0) {
        return res.status(400).json({
          error: {
            code: "INVALID_PAYLOAD",
            message: "Empty event batch",
            details: {
              hint: "Send at least one event",
            },
          },
        });
      }

      // Validate events with Zod schema
      const validationResult = batchEventsSchema.safeParse(events);
      if (!validationResult.success) {
        return res.status(422).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: {
              validation_errors: validationResult.error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
              })),
            },
          },
        });
      }

      let validatedEvents = validationResult.data;

      // Scrub secrets from event attributes before storage
      const scrubbedEvents = validatedEvents.map((event) => {
        const scrubbingResult = SecretsScrubbingService.scrubEventAttributes(
          event.attributes
        );

        // Store scrubbing metadata in event (will be used to emit signal)
        (event as any)._scrubbing_metadata = {
          contains_secrets: scrubbingResult.containsSecrets,
          secret_types: scrubbingResult.secretTypes,
        };

        return {
          ...event,
          attributes: scrubbingResult.attributes,
        };
      });

      validatedEvents = scrubbedEvents;

      // Validate UUIDs for tenant/project/trace IDs
      for (let i = 0; i < validatedEvents.length; i++) {
        const event = validatedEvents[i];

        // Validate that tenant_id and project_id match the API key context
        if (event.tenant_id !== tenantId) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Event tenant_id does not match API key tenant",
              details: {
                event_index: i,
                event_tenant_id: event.tenant_id,
                key_tenant_id: tenantId,
              },
            },
          });
        }

        // If API key has a project_id, events must match it
        // If API key has no project_id (tenant-level key), events can have any project_id in that tenant
        if (projectId && event.project_id !== projectId) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Event project_id does not match API key project",
              details: {
                event_index: i,
                event_project_id: event.project_id,
                key_project_id: projectId,
              },
            },
          });
        }

        // Validate UUID format
        if (!isValidUUIDv4(event.trace_id) || !isValidUUIDv4(event.span_id)) {
          return res.status(400).json({
            error: {
              code: "INVALID_PAYLOAD",
              message: "Invalid UUID format",
              details: {
                validation_errors: [
                  {
                    field: `events[${i}].trace_id or span_id`,
                    message: "must be a valid UUIDv4",
                  },
                ],
              },
            },
          });
        }
      }

      // Convert to Tinybird format
      // Use utility function to handle nullable field formatting for strict type checking
      const { formatTinybirdEvents, cleanNullValues } = await import(
        "../utils/tinybirdEventFormatter.js"
      );
      const tinybirdEvents: TinybirdCanonicalEvent[] = validatedEvents.map(
        (event) => {
          // Preserve actual values when they exist, only use empty string as fallback
          // This ensures we track which conversation/session/user each event belongs to
          const conversationId =
            event.conversation_id && event.conversation_id.trim() !== ""
              ? event.conversation_id
              : "";
          const sessionId =
            event.session_id && event.session_id.trim() !== ""
              ? event.session_id
              : "";
          const userId =
            event.user_id && event.user_id.trim() !== "" ? event.user_id : "";

          return {
            tenant_id: event.tenant_id,
            project_id: event.project_id,
            environment: event.environment,
            trace_id: event.trace_id,
            span_id: event.span_id,
            parent_span_id: event.parent_span_id ?? null,
            timestamp: event.timestamp,
            event_type: event.event_type,
            // CRITICAL: conversation_id, session_id, and user_id are REQUIRED (not nullable) in Tinybird
            // Preserve actual values when available, use empty string only as fallback
            conversation_id: conversationId,
            session_id: sessionId,
            user_id: userId,
            agent_name: event.agent_name ?? null,
            version: event.version ?? null,
            route: event.route ?? null,
            // Clean null values from attributes before stringifying (for Tinybird strict type checking)
            attributes_json: JSON.stringify(cleanNullValues(event.attributes)),
          };
        }
      );

      // Format events to omit null fields and ensure required fields are present (for Tinybird strict type checking)
      const formattedEvents = formatTinybirdEvents(tinybirdEvents);

      // Forward to Tinybird (use formatted events, not raw tinybirdEvents)
      await CanonicalEventService.forwardToTinybird(formattedEvents);

      // Store trace summaries in analysis_results for dashboard compatibility
      // Extract llm_call events and create trace summaries
      await storeTraceSummaries(validatedEvents, tenantId, projectId).catch(
        (error) => {
          console.error(
            "[Events API] Failed to store trace summaries (non-fatal):",
            error
          );
          // Don't fail the request if trace summary storage fails
        }
      );

      // Generate Layer 2 signals (async, non-blocking)
      SignalsService.processEvents(tinybirdEvents).catch((error) => {
        console.error(
          "[Events API] Failed to process signals (non-fatal):",
          error
        );
      });

      // Increment quota usage (use projectId if available, otherwise tenantId)
      try {
        await QuotaService.incrementUsage(
          tenantId,
          projectId,
          validatedEvents.length
        );
      } catch (quotaError) {
        console.error(
          "[Events API] Failed to increment quota (non-fatal):",
          quotaError
        );
        // Don't fail the request if quota increment fails
      }

      return res.status(200).json({
        success: true,
        event_count: validatedEvents.length,
        message: "Events ingested successfully",
      });
    } catch (error) {
      console.error("[Events API] Error during event ingestion:", error);
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
 * Calculate cost based on tokens and model (simplified)
 * In production, use actual pricing from model provider
 */
function calculateCost(
  tokensTotal: number | null,
  model: string | null
): number {
  if (!tokensTotal || !model) return 0;

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

/**
 * Store trace summaries in analysis_results table for dashboard compatibility
 * Extracts llm_call events and creates summary records
 */
async function storeTraceSummaries(
  events: CanonicalEvent[],
  tenantId: string,
  projectId: string | null
): Promise<void> {
  const { query } = await import("../db/client.js");

  // Group events by trace_id
  const tracesByTraceId = new Map<string, CanonicalEvent[]>();
  for (const event of events) {
    if (!tracesByTraceId.has(event.trace_id)) {
      tracesByTraceId.set(event.trace_id, []);
    }
    tracesByTraceId.get(event.trace_id)!.push(event);
  }

  // Process each trace
  for (const [traceId, traceEvents] of tracesByTraceId) {
    // Find llm_call event (main event for trace summary)
    const llmCallEvent = traceEvents.find((e) => e.event_type === "llm_call");
    const outputEvent = traceEvents.find((e) => e.event_type === "output");
    const traceStartEvent = traceEvents.find(
      (e) => e.event_type === "trace_start"
    );
    const traceEndEvent = traceEvents.find((e) => e.event_type === "trace_end");

    // Skip if no llm_call event (can't create meaningful summary)
    if (!llmCallEvent) {
      continue;
    }

    const llmAttrs = llmCallEvent.attributes.llm_call;
    if (!llmAttrs) {
      continue;
    }

    // Extract data from events
    const rootSpanId = llmCallEvent.span_id;
    const parentSpanId = llmCallEvent.parent_span_id;
    const timestamp =
      traceStartEvent?.timestamp ||
      llmCallEvent.timestamp ||
      new Date().toISOString();
    const environment = llmCallEvent.environment;
    const conversationId = llmCallEvent.conversation_id;
    const sessionId = llmCallEvent.session_id;
    const userId = llmCallEvent.user_id;

    // --- Basic "issues" detection (10-minute dashboard path) ---
    // We compute a minimal issues summary from canonical events and store it into Postgres
    // so the dashboard can show non-zero counts even if Tinybird signals/queries lag.
    const errorEvents = traceEvents.filter((e) => e.event_type === "error");
    const errorTypes: Record<string, number> = {};
    for (const e of errorEvents) {
      const t = e.attributes?.error?.error_type || "error";
      errorTypes[t] = (errorTypes[t] || 0) + 1;
    }

    const toolCalls = traceEvents.filter((e) => e.event_type === "tool_call");
    const toolFailures = toolCalls.filter(
      (e) =>
        e.attributes?.tool_call?.result_status &&
        e.attributes.tool_call.result_status !== "success"
    );
    const toolTimeouts = toolCalls.filter(
      (e) => e.attributes?.tool_call?.result_status === "timeout"
    );

    const hasIssues =
      errorEvents.length > 0 || toolFailures.length > 0 || toolTimeouts.length > 0;
    const derivedStatus = hasIssues ? 500 : 200;
    const derivedStatusText = hasIssues
      ? `error:${Object.keys(errorTypes)[0] || "unknown"}`
      : "OK";

    // Get message index from trace_start metadata if available
    let messageIndex: number | null = null;
    if (
      traceStartEvent?.attributes.trace_start?.metadata?.message_index !==
      undefined
    ) {
      messageIndex = traceStartEvent.attributes.trace_start.metadata
        .message_index as number;
    }

    // Calculate total latency from trace_end if available
    let latencyMs = llmAttrs.latency_ms || 0;
    if (traceEndEvent?.attributes.trace_end?.total_latency_ms) {
      latencyMs = traceEndEvent.attributes.trace_end.total_latency_ms;
    }

    // Create TraceEvent-like object for storage
    const traceData: TraceEvent = {
      traceId,
      spanId: rootSpanId,
      parentSpanId: parentSpanId || null,
      timestamp,
      tenantId,
      projectId: projectId || "",
      environment: environment as "dev" | "prod",
      query: llmAttrs.input || "",
      response:
        llmAttrs.output || outputEvent?.attributes.output?.final_output || "",
      responseLength:
        llmAttrs.output?.length ||
        outputEvent?.attributes.output?.output_length ||
        0,
      model: llmAttrs.model || "",
      tokensPrompt: llmAttrs.input_tokens || null,
      tokensCompletion: llmAttrs.output_tokens || null,
      tokensTotal: llmAttrs.total_tokens || null,
      latencyMs,
      timeToFirstTokenMs: null, // Not available in canonical events
      streamingDurationMs: null, // Not available in canonical events
      status: derivedStatus,
      statusText: derivedStatusText,
      finishReason: llmAttrs.finish_reason || null,
      responseId: llmAttrs.response_id || null,
      systemFingerprint: llmAttrs.system_fingerprint || null,
      metadata: {
        issues: {
          has_issues: hasIssues,
          error_events: errorEvents.length,
          error_types: errorTypes,
          tool_failures: toolFailures.length,
          tool_timeouts: toolTimeouts.length,
        },
      },
      conversationId: conversationId || undefined,
      sessionId: sessionId || undefined,
      userId: userId || undefined,
      messageIndex: messageIndex || undefined,
    };

    // Store in analysis_results using TraceService
    await TraceService.storeTraceData(traceData);
    console.log(
      `[Events API] Stored trace summary for ${traceId} in analysis_results`
    );

    // Handle conversation tracking (if provided)
    if (conversationId && projectId) {
      try {
        // Get or create conversation
        const conversation = await ConversationService.getOrCreate({
          conversationId,
          tenantId,
          projectId,
          userId: userId || undefined,
        });

        // Update conversation metrics
        await ConversationService.updateConversationMetrics({
          conversationId,
          tenantId,
          tokensTotal: traceData.tokensTotal ?? null,
          cost: calculateCost(
            traceData.tokensTotal ?? null,
            traceData.model || null
          ),
          hasIssues, // Basic detection from canonical events
        });

        console.log(
          `[Events API] Updated conversation ${conversationId} - TraceID: ${traceId}`
        );
      } catch (error) {
        console.error(
          `[Events API] Failed to update conversation (non-fatal):`,
          error
        );
        // Don't throw - conversation tracking failure shouldn't break event ingestion
      }
    }

    // Handle session tracking (if provided)
    if (sessionId && projectId) {
      try {
        await ConversationService.getOrCreateSession({
          sessionId,
          tenantId,
          projectId,
          userId: userId || undefined,
          conversationId: conversationId || undefined,
        });

        await ConversationService.updateSessionMetrics({
          sessionId,
          tenantId,
        });

        console.log(
          `[Events API] Updated session ${sessionId} - TraceID: ${traceId}`
        );
      } catch (error) {
        console.error(
          `[Events API] Failed to update session (non-fatal):`,
          error
        );
        // Don't throw - session tracking failure shouldn't break event ingestion
      }
    }
  }
}

export default router;

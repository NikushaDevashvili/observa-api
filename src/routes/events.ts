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
import {
  canonicalEventSchema,
  batchEventsSchema,
} from "../validation/schemas.js";
import { TinybirdCanonicalEvent } from "../types/events.js";
import { isValidUUIDv4 } from "../utils/uuidValidation.js";

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
      const tinybirdEvents: TinybirdCanonicalEvent[] = validatedEvents.map(
        (event) => ({
          tenant_id: event.tenant_id,
          project_id: event.project_id,
          environment: event.environment,
          trace_id: event.trace_id,
          span_id: event.span_id,
          parent_span_id: event.parent_span_id ?? null,
          timestamp: event.timestamp,
          event_type: event.event_type,
          conversation_id: event.conversation_id ?? null,
          session_id: event.session_id ?? null,
          user_id: event.user_id ?? null,
          agent_name: event.agent_name ?? null,
          version: event.version ?? null,
          route: event.route ?? null,
          attributes_json: JSON.stringify(event.attributes),
        })
      );

      // Forward to Tinybird
      await CanonicalEventService.forwardToTinybird(tinybirdEvents);

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

export default router;

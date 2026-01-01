import { z } from "zod";

/**
 * Validation schemas for API endpoints
 */

export const signupSchema = z.object({
  email: z.string().email("Invalid email format"),
  companyName: z
    .string()
    .min(1, "Company name is required")
    .max(100, "Company name too long"),
  plan: z.enum(["free", "pro", "enterprise"]).optional().default("free"),
});

export const tenantIdSchema = z.object({
  tenantId: z.string().min(1, "tenantId is required"),
});

export const traceEventSchema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().nullable().optional(),
  timestamp: z.string(),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  environment: z.enum(["dev", "prod"]),
  query: z.string(),
  context: z.string().optional(),
  model: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  response: z.string(),
  responseLength: z.number().int().positive(),
  tokensPrompt: z.number().int().nullable().optional(),
  tokensCompletion: z.number().int().nullable().optional(),
  tokensTotal: z.number().int().nullable().optional(),
  latencyMs: z.number().int().nonnegative(),
  timeToFirstTokenMs: z.number().int().nullable().optional(),
  streamingDurationMs: z.number().int().nullable().optional(),
  status: z.number().int().nullable().optional(),
  statusText: z.string().nullable().optional(),
  finishReason: z.string().nullable().optional(),
  responseId: z.string().nullable().optional(),
  systemFingerprint: z.string().nullable().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  // Conversation tracking fields
  conversationId: z.string().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  messageIndex: z.number().int().positive().optional(),
  parentMessageId: z.string().optional(),
});

/**
 * Canonical event validation schema
 */
export const eventTypeSchema = z.enum([
  "llm_call",
  "tool_call",
  "retrieval",
  "error",
  "feedback",
  "output",
  "trace_start",
  "trace_end",
]);

export const canonicalEventSchema = z.object({
  tenant_id: z.string().uuid(),
  project_id: z.string().uuid(),
  environment: z.enum(["dev", "prod"]),
  trace_id: z.string().uuid(),
  span_id: z.string().uuid(),
  parent_span_id: z.string().uuid().nullable(),
  timestamp: z.string(), // ISO 8601
  event_type: eventTypeSchema,
  conversation_id: z.string().uuid().nullable().optional(),
  session_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  route: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.any()), // Flexible JSON object
});

/**
 * Batch events schema (array of canonical events)
 */
export const batchEventsSchema = z.array(canonicalEventSchema).min(1).max(1000);

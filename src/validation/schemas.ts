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
});

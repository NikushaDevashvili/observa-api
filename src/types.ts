// Tenant and token types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  environment: "dev" | "prod";
  createdAt: Date;
}

export interface JWTPayload {
  tenantId: string;
  projectId: string;
  environment?: "dev" | "prod";
  iat?: number;
  exp?: number;
}

export interface TenantToken {
  tenantId: string;
  jwtSecret: string; // Secret used to sign JWTs for this tenant
  tinybirdToken: string; // Tinybird token scoped to this tenant
  tinybirdTokenId?: string; // Tinybird token ID for revocation
  createdAt: Date;
}

// Trace ingestion types
export interface TraceEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  timestamp: string;
  tenantId: string;
  projectId: string;
  environment: "dev" | "prod";
  query: string;
  context?: string;
  model?: string;
  metadata?: Record<string, any>;
  response: string;
  responseLength: number;
  tokensPrompt?: number | null;
  tokensCompletion?: number | null;
  tokensTotal?: number | null;
  latencyMs: number;
  timeToFirstTokenMs?: number | null;
  streamingDurationMs?: number | null;
  status?: number | null;
  statusText?: string | null;
  finishReason?: string | null;
  responseId?: string | null;
  systemFingerprint?: string | null;
  headers?: Record<string, string>;
  // Conversation tracking fields
  conversationId?: string;  // Long-lived conversation identifier
  sessionId?: string;       // Short-lived session identifier
  userId?: string;          // End-user identifier
  messageIndex?: number;    // Position in conversation (1, 2, 3...)
  parentMessageId?: string;  // For threaded conversations
}

export interface TinybirdEvent {
  tenant_id: string;
  project_id: string;
  environment: "dev" | "prod";
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  timestamp: string;
  model: string;
  query: string;
  context: string;
  response: string;
  response_length: number;
  latency_ms: number;
  ttfb_ms: number | null;
  streaming_ms: number | null;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  tokens_total: number | null;
  status: number | null;
  status_text: string | null;
  finish_reason: string | null;
  response_id: string | null;
  system_fingerprint: string | null;
  metadata_json: string;
  headers_json: string;
}


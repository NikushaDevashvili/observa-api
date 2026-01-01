/**
 * Canonical Event Envelope
 * 
 * Single unified event format for all observability events (LLM calls, tool calls, retrieval, errors, feedback).
 * This replaces the legacy "one trace row" model with a flexible event-based architecture.
 */

export type EventType = 
  | "llm_call"
  | "tool_call" 
  | "retrieval"
  | "error"
  | "feedback"
  | "output"
  | "trace_start"
  | "trace_end";

/**
 * Base canonical event envelope - all events share these fields
 */
export interface CanonicalEvent {
  // Required fields (must be present in all events)
  tenant_id: string;
  project_id: string;
  environment: "dev" | "prod";
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  timestamp: string; // ISO 8601 format
  event_type: EventType;
  
  // Strongly recommended fields (present in most events)
  conversation_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  agent_name?: string | null;
  version?: string | null;
  route?: string | null;
  
  // Event-specific attributes (JSON field for extensibility)
  attributes: EventAttributes;
}

/**
 * Event-specific attributes based on event_type
 */
export interface EventAttributes {
  // LLM call attributes
  llm_call?: {
    model: string;
    prompt_template_id?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
    latency_ms: number;
    cost?: number | null;
    temperature?: number | null;
    max_tokens?: number | null;
    finish_reason?: string | null;
    response_id?: string | null;
    system_fingerprint?: string | null;
    // Input/output (redacted/hashed in production)
    input?: string | null;
    output?: string | null;
    input_hash?: string | null;
    output_hash?: string | null;
  };
  
  // Tool call attributes
  tool_call?: {
    tool_name: string;
    args_hash?: string | null;
    args?: Record<string, any> | null; // Full args (may be redacted)
    result_status: "success" | "error" | "timeout";
    result?: any | null;
    latency_ms: number;
    error_message?: string | null;
  };
  
  // Retrieval attributes
  retrieval?: {
    retrieval_context_ids?: string[] | null;
    retrieval_context_hashes?: string[] | null;
    k?: number | null;
    latency_ms: number;
    top_k?: number | null;
    similarity_scores?: number[] | null;
  };
  
  // Error attributes
  error?: {
    error_type: string;
    error_message: string;
    stack_trace?: string | null;
    context?: Record<string, any> | null;
  };
  
  // Feedback attributes
  feedback?: {
    type: "like" | "dislike" | "rating" | "correction";
    rating?: number | null; // 1-5 scale for rating type
    comment?: string | null;
    outcome?: "success" | "failure" | "partial" | null;
  };
  
  // Output attributes (final output event)
  output?: {
    final_output?: string | null;
    final_output_hash?: string | null;
    output_length?: number | null;
  };
  
  // Trace lifecycle attributes
  trace_start?: {
    name?: string | null;
    metadata?: Record<string, any> | null;
  };
  
  trace_end?: {
    total_latency_ms?: number | null;
    total_cost?: number | null;
    total_tokens?: number | null;
    outcome?: "success" | "error" | "timeout" | null;
  };
}

/**
 * Tinybird/ClickHouse canonical event format (snake_case for OLAP)
 */
export interface TinybirdCanonicalEvent {
  tenant_id: string;
  project_id: string;
  environment: "dev" | "prod";
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  timestamp: string;
  event_type: EventType;
  conversation_id: string | null;
  session_id: string | null;
  user_id: string | null;
  agent_name: string | null;
  version: string | null;
  route: string | null;
  attributes_json: string; // JSON string of EventAttributes
}


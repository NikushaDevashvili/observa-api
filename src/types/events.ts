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
  | "trace_end"
  | "embedding"
  | "vector_db_operation"
  | "cache_operation"
  | "agent_create";

/**
 * Langfuse-style observation types for span display
 * Optional; maps event_type when not provided
 */
export type ObservationType =
  | "span"
  | "generation"
  | "tool"
  | "agent"
  | "chain"
  | "retriever"
  | "embedding"
  | "evaluator"
  | "guardrail";

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

  // PHASE 3: Optional observation type (Langfuse parity)
  observation_type?: ObservationType | null;

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
    // TIER 1: OTEL Semantic Conventions
    operation_name?:
      | "chat"
      | "text_completion"
      | "generate_content"
      | string
      | null; // gen_ai.operation.name
    provider_name?: string | null; // gen_ai.provider.name (e.g., "openai", "anthropic", "gcp.vertex_ai")
    response_model?: string | null; // gen_ai.response.model (actual model used vs requested)
    // TIER 2: Sampling parameters
    top_k?: number | null;
    top_p?: number | null;
    frequency_penalty?: number | null;
    presence_penalty?: number | null;
    stop_sequences?: string[] | null;
    seed?: number | null;
    // TIER 2: Structured cost tracking
    input_cost?: number | null; // gen_ai.usage.input_cost
    output_cost?: number | null; // gen_ai.usage.output_cost
    // TIER 1: Structured message objects (OTEL opt-in)
    input_messages?: Array<{
      role: string;
      content?: string | any;
      parts?: Array<{ type: string; content: any }>;
    }> | null; // gen_ai.input.messages
    output_messages?: Array<{
      role: string;
      content?: string | any;
      parts?: Array<{ type: string; content: any }>;
      finish_reason?: string;
    }> | null; // gen_ai.output.messages
    system_instructions?: Array<{
      type: string;
      content: string | any;
    }> | null; // gen_ai.system_instructions
    // Tool definitions sent with the LLM request (provider schema)
    tool_definitions?: Array<Record<string, any>> | null;
    tools?: Array<Record<string, any>> | null;
    // TIER 2: Server metadata
    server_address?: string | null; // server.address
    server_port?: number | null; // server.port
    // TIER 2: Conversation grouping
    conversation_id_otel?: string | null; // gen_ai.conversation.id (OTEL format)
    // TIER 2: Request metadata
    choice_count?: number | null; // gen_ai.request.choice.count
    time_to_first_token_ms?: number | null;
    streaming_duration_ms?: number | null;
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
    // TIER 2: OTEL Tool Standardization
    operation_name?: "execute_tool" | string | null; // gen_ai.operation.name
    tool_type?: "function" | "extension" | "datastore" | string | null; // gen_ai.tool.type
    tool_description?: string | null; // gen_ai.tool.description
    tool_call_id?: string | null; // gen_ai.tool.call.id (correlate with LLM request)
    // TIER 2: Structured error classification
    error_type?: string | null; // error.type
    error_category?: string | null; // error.category
  };

  // Retrieval attributes
  retrieval?: {
    retrieval_context_ids?: string[] | null;
    retrieval_context_hashes?: string[] | null;
    k?: number | null;
    latency_ms: number;
    top_k?: number | null;
    similarity_scores?: number[] | null;
    // TIER 2: Retrieval enrichment
    retrieval_context?: string | null; // Actual context text (if available)
    embedding_model?: string | null; // Model used for embeddings
    embedding_dimensions?: number | null; // Vector dimensions
    vector_metric?: "cosine" | "euclidean" | "dot_product" | string | null; // Similarity metric
    rerank_score?: number | null; // If using reranker
    fusion_method?: string | null; // If combining multiple sources
    deduplication_removed_count?: number | null; // Chunks filtered
    quality_score?: number | null; // Overall retrieval quality
  };

  // Error attributes
  error?: {
    error_type: string;
    error_message: string;
    stack_trace?: string | null;
    context?: Record<string, any> | null;
    // TIER 2: Structured error classification
    error_category?: string | null; // error.category
    error_code?: string | null; // error.code
  };

  // TIER 1: Embedding attributes
  embedding?: {
    model: string; // gen_ai.request.model
    dimension_count?: number | null; // gen_ai.embeddings.dimension.count
    encoding_formats?: string[] | null; // gen_ai.request.encoding_formats
    input_tokens?: number | null; // gen_ai.usage.input_tokens
    output_tokens?: number | null; // gen_ai.usage.output_tokens (dimensions count)
    latency_ms: number;
    cost?: number | null;
    input_text?: string | null; // Input text (may be redacted)
    input_hash?: string | null;
    embeddings?: number[][] | null; // Actual embeddings (may be redacted)
    embeddings_hash?: string | null;
    operation_name?: "embeddings" | string | null; // gen_ai.operation.name
    provider_name?: string | null; // gen_ai.provider.name
  };

  // TIER 3: Vector DB operation attributes
  vector_db_operation?: {
    operation_type: "vector_search" | "index_upsert" | "delete" | string;
    index_name?: string | null;
    index_version?: string | null;
    vector_dimensions?: number | null;
    vector_metric?: "cosine" | "euclidean" | "dot_product" | string | null;
    results_count?: number | null;
    scores?: number[] | null;
    latency_ms: number;
    cost?: number | null; // Query units consumed
    api_version?: string | null;
    provider_name?: string | null; // e.g., "pinecone", "weaviate", "qdrant"
  };

  // TIER 3: Cache operation attributes
  cache_operation?: {
    cache_backend?: "redis" | "in_memory" | "memcached" | string | null;
    cache_key?: string | null;
    cache_namespace?: string | null;
    hit_status: "hit" | "miss";
    latency_ms: number;
    saved_cost?: number | null; // Cost saved from cache hit
    ttl?: number | null; // Time to live
    eviction_info?: Record<string, any> | null;
  };

  // TIER 3: Agent creation attributes
  agent_create?: {
    agent_name: string;
    agent_config?: Record<string, any> | null;
    tools_bound?: string[] | null;
    model_config?: Record<string, any> | null;
    operation_name?: "create_agent" | string | null; // gen_ai.operation.name
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

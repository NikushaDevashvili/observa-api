/**
 * Agent-Prism Adapter Service
 *
 * Transforms Observa trace data format into agent-prism compatible format.
 * This allows the frontend to use agent-prism components for trace visualization.
 *
 * Agent-Prism format reference:
 * - TraceRecord: { id, name, spansCount, durationMs, agentDescription }
 * - TraceSpan: { id, parentId, name, startTime, endTime, duration, attributes, children? }
 */

/**
 * Observa trace data format (from TraceQueryService.getTraceDetailTree)
 */
export interface ObservaTraceData {
  summary: {
    trace_id: string;
    tenant_id: string;
    project_id: string;
    start_time: string; // ISO string
    end_time: string; // ISO string
    total_latency_ms: number | null;
    total_tokens: number | null;
    model?: string | null;
    query?: string | null;
    response?: string | null;
    finish_reason?: string | null;
    conversation_id?: string | null;
    session_id?: string | null;
    user_id?: string | null;
    environment?: string | null;
    attempt_count?: number;
    failure_count?: number;
  };
  treeView?: {
    summary: { attempts: number; failures: number; environment?: string };
    children?: any[];
  };
  spans: ObservaSpan[];
  allSpans?: ObservaSpan[];
  spansById?: Record<string, ObservaSpan>;
  signals?: any[];
  analysis?: any;
}

/**
 * Observa span format (from TraceQueryService)
 */
export interface ObservaSpan {
  id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string; // ISO string
  end_time: string; // ISO string
  duration_ms: number;
  events?: any[];
  children?: ObservaSpan[];
  metadata?: Record<string, any>;
  // PHASE 1: Explicit input/output for Langfuse parity (Trace Start, Output span, root)
  input?: string | null;
  final_output?: string | null;
  // PHASE 3: Optional observation type (Langfuse parity)
  observation_type?: string | null;
  // Type-specific flattened data
  llm_call?: {
    model?: string;
    input?: string | null;
    output?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
    latency_ms?: number | null;
    finish_reason?: string | null;
    cost?: number | null;
    time_to_first_token_ms?: number | null;
    streaming_duration_ms?: number | null;
    response_id?: string | null;
    system_fingerprint?: string | null;
    temperature?: number | null;
    max_tokens?: number | null;
    // TIER 1: OTEL Semantic Conventions
    operation_name?: string | null; // gen_ai.operation.name
    provider_name?: string | null; // gen_ai.provider.name
    response_model?: string | null; // gen_ai.response.model
    // TIER 2: Sampling parameters
    top_k?: number | null;
    top_p?: number | null;
    frequency_penalty?: number | null;
    presence_penalty?: number | null;
    stop_sequences?: string[] | null;
    seed?: number | null;
    // TIER 2: Structured cost tracking
    input_cost?: number | null;
    output_cost?: number | null;
    // TIER 1: Structured message objects
    input_messages?: Array<any> | null;
    output_messages?: Array<any> | null;
    system_instructions?: Array<any> | null;
    tool_definitions?: Array<any> | null;
    tools?: Array<any> | null;
    // TIER 2: Server metadata
    server_address?: string | null;
    server_port?: number | null;
    // TIER 2: Conversation grouping
    conversation_id_otel?: string | null;
    choice_count?: number | null;
  };
  available_tools?: Array<any> | null;
  executed_tools?: Array<any> | null;
  attempted_tool_calls?: Array<{
    tool_name: string;
    tool_call_id?: string | null;
    function_name?: string | null;
    arguments?: any;
  }> | null;
  tool_call?: {
    tool_name?: string;
    args?: any;
    result?: any;
    latency_ms?: number | null;
    result_status?: string;
    error_message?: string | null;
    // TIER 2: OTEL Tool Standardization
    operation_name?: string | null;
    tool_type?: string | null;
    tool_description?: string | null;
    tool_call_id?: string | null;
    error_type?: string | null;
    error_category?: string | null;
  };
  retrieval?: {
    k?: number | null;
    top_k?: number | null;
    latency_ms?: number | null;
    retrieval_context_ids?: string[] | null;
    similarity_scores?: number[] | null;
    retrieval_context?: string | null;
    // TIER 2: Retrieval enrichment
    embedding_model?: string | null;
    embedding_dimensions?: number | null;
    vector_metric?: string | null;
    rerank_score?: number | null;
    fusion_method?: string | null;
    deduplication_removed_count?: number | null;
    quality_score?: number | null;
  };
  embedding?: {
    model?: string;
    dimension_count?: number | null;
    encoding_formats?: string[] | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    latency_ms?: number | null;
    cost?: number | null;
    input_text?: string | null;
    input_hash?: string | null;
    embeddings?: number[][] | null;
    embeddings_hash?: string | null;
    operation_name?: string | null;
    provider_name?: string | null;
  };
  vector_db_operation?: {
    operation_type?: string;
    index_name?: string | null;
    index_version?: string | null;
    vector_dimensions?: number | null;
    vector_metric?: string | null;
    results_count?: number | null;
    scores?: number[] | null;
    latency_ms?: number | null;
    cost?: number | null;
    api_version?: string | null;
    provider_name?: string | null;
  };
  cache_operation?: {
    cache_backend?: string | null;
    cache_key?: string | null;
    cache_namespace?: string | null;
    hit_status?: "hit" | "miss";
    latency_ms?: number | null;
    saved_cost?: number | null;
    ttl?: number | null;
    eviction_info?: Record<string, any> | null;
  };
  agent_create?: {
    agent_name?: string;
    agent_config?: Record<string, any> | null;
    tools_bound?: string[] | null;
    model_config?: Record<string, any> | null;
    operation_name?: string | null;
  };
  output?: {
    final_output?: string | null;
    output_length?: number | null;
  };
  trace_start?: {
    name?: string | null;
    metadata?: Record<string, any> | null;
    chain_type?: string | null;
    num_prompts?: number | null;
    created_at?: string | null;
  };
  trace_end?: {
    total_latency_ms?: number | null;
    total_tokens?: number | null;
  };
  feedback?: {
    type?: string;
    outcome?: string;
    rating?: number | null;
    comment?: string | null;
  };
  feedback_metadata?: {
    type?: string;
    outcome?: string;
    rating?: number | null;
    has_comment?: boolean;
    comment?: string | null;
  };
  feedback_type?: string;
  feedback_outcome?: string;
  feedback_rating?: number | null;
  feedback_comment?: string | null;
  error?: {
    error_type?: string | null;
    error_message?: string | null;
    stack_trace?: string | null;
    context?: Record<string, any> | null;
    error_category?: string | null;
    error_code?: string | null;
  };
  type?: string;
  event_type?: string;
  isRootTrace?: boolean; // Flag set by TraceQueryService to identify main trace span
}

/**
 * Agent-Prism TraceRecord format
 */
export interface AgentPrismTraceRecord {
  id: string;
  name: string;
  spansCount: number;
  durationMs: number;
  agentDescription?: string;
  // PHASE 4: Trace-level input/output (Langfuse parity)
  input?: string | null;
  output?: string | null;
  // PHASE 2: Context header (Langfuse-style)
  session_id?: string | null;
  user_id?: string | null;
  environment?: string | null;
}

/**
 * Agent-Prism TraceSpan Attribute format
 * Attributes must be an array with key-value structure
 */
export interface AgentPrismTraceSpanAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: number;
    doubleValue?: number;
    boolValue?: boolean;
    // For complex objects/arrays, use stringValue with JSON string
  };
}

/**
 * Error information for a span
 */
export interface SpanErrorInfo {
  type: string;
  message: string;
  fullMessage: string;
  stackTrace?: string;
  context?: Record<string, any>;
  timestamp?: string;
  errorCode?: string; // Error code from SDK (e.g., 'invalid_api_key', 'rate_limit_exceeded')

  // SOTA: Comprehensive error context
  operation?: {
    tool_name?: string;
    operation_type?: string;
    endpoint?: string;
    method?: string;
    args?: any;
  };
  request?: {
    url?: string;
    headers?: Record<string, string>;
    body?: any;
    timeout_ms?: number;
    retry_count?: number;
    max_retries?: number;
  };
  timing?: {
    started_at?: string;
    timeout_at?: string;
    elapsed_ms?: number;
    timeout_threshold_ms?: number;
    retry_attempts?: number;
  };
  network?: {
    error_category?: string;
    dns_resolved?: boolean;
    connection_established?: boolean;
    bytes_sent?: number;
    bytes_received?: number;
    partial_response?: any;
  };
  relatedContext?: {
    parent_operation?: string;
    previous_operations?: string[];
    affected_operations?: string[];
    related_errors_in_trace?: number;
  };
  suggestedFixes?: string[];
  classification?: {
    category?: string;
    severity?: "low" | "medium" | "high" | "critical";
    impact?: string;
    known_issue?: boolean;
    similar_errors_count?: number;
  };
}

/**
 * Agent-Prism TraceSpan format
 * Note: Components use 'title' not 'name', and accept startTime/endTime as numbers
 */
export interface AgentPrismTraceSpan {
  id: string;
  parentId: string | null;
  name: string; // Keep for compatibility
  title: string; // Components use this field
  startTime: number; // Unix timestamp in milliseconds (components accept this)
  endTime: number; // Unix timestamp in milliseconds (components accept this)
  duration: number; // Duration in milliseconds
  attributes: AgentPrismTraceSpanAttribute[]; // Array format required by DetailsViewAttributesTab
  type:
    | "llm_call"
    | "tool_execution"
    | "agent_invocation"
    | "chain_operation"
    | "retrieval"
    | "embedding"
    | "create_agent"
    | "span"
    | "event"
    | "guardrail"
    | "unknown"; // TraceSpanCategory for SpanBadge
  status?: "success" | "error" | "pending" | "warning"; // Status for status badge
  tokensCount?: number; // Optional tokens count for TokensBadge
  cost?: number; // Optional cost for PriceBadge
  input?: string; // Input data for In/Out tab (JSON string or plain string)
  output?: string; // Output data for In/Out tab (JSON string or plain string)
  raw: string; // Raw JSON representation of span for RAW tab
  children?: AgentPrismTraceSpan[];
  errorInfo?: SpanErrorInfo; // Error information for this span
  errorCount?: number; // Number of errors in this span and its children
  // Additional fields for frontend access
  llm_call?: any; // LLM call data for direct access
  system_instructions?: Array<any> | null; // System instructions for display
  available_tools?: Array<any> | null; // Available tools for display
  executed_tools?: Array<any> | null; // Executed tools for display
  attempted_tool_calls?: Array<{
    tool_name: string;
    tool_call_id?: string | null;
    function_name?: string | null;
    arguments?: any;
  }> | null; // Attempted tool calls for display
}

/**
 * Error summary for a trace
 */
export interface ErrorSummary {
  totalErrors: number;
  errorTypes: Record<string, number>;
  errorSpans: string[];
  hasErrors: boolean;
}

/**
 * Agent-Prism formatted trace data
 */
export interface AgentPrismTraceData {
  traceRecord: AgentPrismTraceRecord;
  spans: AgentPrismTraceSpan[];
  badges?: Array<{
    label: string;
    variant?:
      | "default"
      | "secondary"
      | "destructive"
      | "outline"
      | "warning"
      | "error";
  }>;
  errorSummary?: ErrorSummary;
}

/**
 * Convert ISO timestamp string to Unix milliseconds
 */
function isoToUnixMs(isoString: string): number {
  try {
    return new Date(isoString).getTime();
  } catch (error) {
    console.warn(
      `[AgentPrismAdapter] Failed to parse timestamp: ${isoString}`,
      error,
    );
    return Date.now();
  }
}

/**
 * Convert attributes object to agent-prism attribute array format
 * Transforms Record<string, any> to AgentPrismTraceSpanAttribute[]
 */
function convertAttributesToArray(
  attributesObj: Record<string, any>,
): AgentPrismTraceSpanAttribute[] {
  return Object.entries(attributesObj).map(([key, value]) => {
    // Determine the value type and structure
    if (value === null || value === undefined) {
      return {
        key,
        value: { stringValue: "null" },
      };
    }

    // Handle different value types
    if (typeof value === "string") {
      return {
        key,
        value: { stringValue: value },
      };
    } else if (typeof value === "number") {
      // Check if it's an integer or float
      if (Number.isInteger(value)) {
        return {
          key,
          value: { intValue: value },
        };
      } else {
        return {
          key,
          value: { doubleValue: value },
        };
      }
    } else if (typeof value === "boolean") {
      return {
        key,
        value: { boolValue: value },
      };
    } else {
      // For objects, arrays, and other complex types, stringify as JSON
      return {
        key,
        value: {
          stringValue: JSON.stringify(value, null, 2),
        },
      };
    }
  });
}

/**
 * Generate suggested fixes based on error type and context (SOTA practice)
 */
function generateSuggestedFixes(
  errorType: string,
  errorMessage: string,
  context: any,
  span?: ObservaSpan,
): string[] {
  const fixes: string[] = [];
  const errorLower = errorType.toLowerCase();
  const messageLower = errorMessage.toLowerCase();

  // Timeout errors
  if (errorLower.includes("timeout") || messageLower.includes("timeout")) {
    fixes.push("Check if the API endpoint/service is reachable and responding");
    fixes.push("Verify network connectivity to the target service");
    if (context?.timeout_ms || context?.timeout) {
      fixes.push(
        `Consider increasing timeout threshold (current: ${
          context.timeout_ms || context.timeout
        }ms)`,
      );
    } else {
      fixes.push("Consider increasing timeout threshold for this operation");
    }
    fixes.push("Check API service status page or health endpoints");
    fixes.push("Review retry policy and implement exponential backoff");
    fixes.push(
      "Check for network congestion or firewall rules blocking the connection",
    );
  }

  // Connection errors
  if (
    errorLower.includes("connection") ||
    messageLower.includes("connection")
  ) {
    if (messageLower.includes("refused")) {
      fixes.push(
        "Verify the service is running and listening on the expected port",
      );
      fixes.push("Check firewall rules and network security groups");
    } else if (messageLower.includes("reset")) {
      fixes.push("Server closed the connection - check server logs for issues");
      fixes.push("Verify the service is handling requests correctly");
    } else {
      fixes.push("Check network connectivity and DNS resolution");
      fixes.push("Verify the endpoint URL is correct");
      fixes.push("Check if the service is behind a load balancer or proxy");
    }
  }

  // HTTP errors
  if (errorLower.includes("http") || messageLower.includes("http")) {
    if (messageLower.includes("404")) {
      fixes.push("Verify the endpoint URL and path are correct");
      fixes.push("Check if the resource exists on the server");
    } else if (messageLower.includes("401") || messageLower.includes("403")) {
      fixes.push("Verify authentication credentials are valid and not expired");
      fixes.push("Check API key permissions and scope");
      fixes.push("Review authorization policies");
    } else if (
      messageLower.includes("500") ||
      messageLower.includes("502") ||
      messageLower.includes("503")
    ) {
      fixes.push("Server error - check server logs for details");
      fixes.push("Verify the service is healthy and not overloaded");
      fixes.push("Check if dependencies (databases, APIs) are available");
    } else if (messageLower.includes("429")) {
      fixes.push("Rate limit exceeded - implement exponential backoff");
      fixes.push("Reduce request frequency or upgrade rate limits");
      fixes.push("Check if retry logic is causing rate limit violations");
    }
  }

  // DNS errors
  if (
    errorLower.includes("dns") ||
    messageLower.includes("dns") ||
    messageLower.includes("eai_again")
  ) {
    fixes.push("Check DNS resolution - verify domain name is correct");
    fixes.push("Verify DNS server is reachable");
    fixes.push("Check network DNS configuration");
  }

  // Tool-specific errors
  if (context?.tool_name || span?.tool_call?.tool_name) {
    const toolName = context?.tool_name || span?.tool_call?.tool_name || "";
    if (
      toolName.includes("fetch") ||
      toolName.includes("http") ||
      toolName.includes("api")
    ) {
      fixes.push(`Verify ${toolName} service is available and responding`);
      fixes.push("Check API documentation for expected request format");
      fixes.push("Review request headers and authentication");
    } else if (
      toolName.includes("database") ||
      toolName.includes("db") ||
      toolName.includes("query")
    ) {
      fixes.push("Check database connection pool status");
      fixes.push("Verify database server is running and accessible");
      fixes.push("Review query performance and indexes");
      fixes.push("Check for database locks or long-running transactions");
    } else if (toolName.includes("search") || toolName.includes("retrieval")) {
      fixes.push("Check search/index service availability");
      fixes.push("Verify search query parameters are valid");
      fixes.push("Review index status and update frequency");
    }
  }

  // Generic suggestions if no specific fixes
  if (fixes.length === 0) {
    fixes.push(
      "Review error message and stack trace for specific failure point",
    );
    fixes.push("Check application logs for additional context");
    fixes.push("Verify all required parameters and configuration are correct");
    fixes.push("Check if this is a transient issue by retrying the operation");
  }

  return fixes;
}

/**
 * Classify error category (SOTA practice)
 */
function classifyErrorCategory(
  errorType: string,
  errorMessage: string,
  context: any,
): string {
  const errorLower = errorType.toLowerCase();
  const messageLower = errorMessage.toLowerCase();

  if (errorLower.includes("timeout") || messageLower.includes("timeout")) {
    return "network_timeout";
  }
  if (
    errorLower.includes("connection") ||
    messageLower.includes("connection") ||
    messageLower.includes("econn")
  ) {
    return "network_connection";
  }
  if (
    errorLower.includes("dns") ||
    messageLower.includes("dns") ||
    messageLower.includes("eai_again")
  ) {
    return "dns_resolution";
  }
  if (
    errorLower.includes("http") ||
    messageLower.includes("http") ||
    messageLower.includes("status")
  ) {
    return "http_error";
  }
  if (
    errorLower.includes("auth") ||
    messageLower.includes("unauthorized") ||
    messageLower.includes("forbidden")
  ) {
    return "authentication_error";
  }
  if (
    errorLower.includes("permission") ||
    messageLower.includes("permission denied")
  ) {
    return "permission_error";
  }
  if (
    errorLower.includes("database") ||
    errorLower.includes("db") ||
    messageLower.includes("sql")
  ) {
    return "database_error";
  }
  if (
    errorLower.includes("validation") ||
    messageLower.includes("invalid") ||
    messageLower.includes("malformed")
  ) {
    return "validation_error";
  }
  if (errorLower.includes("tool") || errorLower.includes("function")) {
    return "tool_execution_error";
  }
  if (errorLower.includes("llm") || errorLower.includes("model")) {
    return "llm_error";
  }

  return "unknown_error";
}

/**
 * Classify error severity (SOTA practice)
 */
function classifySeverity(
  errorType: string,
  errorMessage: string,
): "low" | "medium" | "high" | "critical" {
  const errorLower = errorType.toLowerCase();
  const messageLower = errorMessage.toLowerCase();

  // Critical: System failures, data loss, security issues
  if (
    errorLower.includes("critical") ||
    messageLower.includes("data loss") ||
    messageLower.includes("security") ||
    messageLower.includes("unauthorized access")
  ) {
    return "critical";
  }

  // High: Timeouts on critical operations, connection failures
  if (
    errorLower.includes("timeout") ||
    errorLower.includes("connection") ||
    messageLower.includes("unavailable") ||
    messageLower.includes("down")
  ) {
    return "high";
  }

  // Medium: HTTP errors, validation errors, tool failures
  if (
    errorLower.includes("http") ||
    errorLower.includes("validation") ||
    errorLower.includes("tool") ||
    errorLower.includes("error")
  ) {
    return "medium";
  }

  // Low: Warnings, non-critical issues
  return "low";
}

/**
 * Determine impact of error (SOTA practice)
 */
function determineImpact(
  span: ObservaSpan | undefined,
  errorType: string,
): string {
  if (!span) return "unknown";

  // Check if error blocks the main flow
  const isRootOperation = !span.parent_span_id;
  const isCriticalTool =
    span.tool_call?.tool_name &&
    (span.tool_call.tool_name.includes("payment") ||
      span.tool_call.tool_name.includes("auth") ||
      span.tool_call.tool_name.includes("checkout"));

  if (isRootOperation || isCriticalTool) {
    return "blocks_user_request";
  }

  if (errorType.includes("timeout") || errorType.includes("connection")) {
    return "degrades_functionality";
  }

  return "minimal_impact";
}

/**
 * Transform a single Observa span to Agent-Prism TraceSpan
 */
function transformSpan(span: ObservaSpan): AgentPrismTraceSpan {
  let startTime = isoToUnixMs(span.start_time);
  let endTime = isoToUnixMs(span.end_time);
  // Agent-prism uses endTime - startTime for bar width; ensure correct duration when we have it
  if (
    span.duration_ms != null &&
    span.duration_ms > 0 &&
    (endTime <= startTime || !Number.isFinite(endTime))
  ) {
    endTime = startTime + span.duration_ms;
  }

  // Start with metadata as base attributes
  const attributes: Record<string, any> = {
    ...(span.metadata || {}),
    span_id: span.span_id,
    duration_ms: span.duration_ms,
    event_type: span.event_type || span.type,
  };

  // Add LLM call attributes (map to OpenTelemetry semantic conventions)
  if (span.llm_call) {
    const llm = span.llm_call;

    // TIER 1: OTEL Required Discriminators
    if (llm.operation_name) {
      attributes["gen_ai.operation.name"] = llm.operation_name;
    } else {
      // Infer from context if not provided
      attributes["gen_ai.operation.name"] = "chat"; // Default, can be overridden
    }
    if (llm.provider_name) {
      attributes["gen_ai.provider.name"] = llm.provider_name;
    } else if (llm.model) {
      // Infer provider from model name
      const modelLower = llm.model.toLowerCase();
      if (modelLower.includes("gpt") || modelLower.includes("openai")) {
        attributes["gen_ai.provider.name"] = "openai";
      } else if (
        modelLower.includes("claude") ||
        modelLower.includes("anthropic")
      ) {
        attributes["gen_ai.provider.name"] = "anthropic";
      } else if (
        modelLower.includes("gemini") ||
        modelLower.includes("google")
      ) {
        attributes["gen_ai.provider.name"] = "google";
      } else if (modelLower.includes("vertex")) {
        attributes["gen_ai.provider.name"] = "gcp.vertex_ai";
      } else if (modelLower.includes("bedrock") || modelLower.includes("aws")) {
        attributes["gen_ai.provider.name"] = "aws.bedrock";
      }
    }

    // OpenTelemetry GenAI semantic conventions - Core
    if (llm.model) attributes["gen_ai.request.model"] = llm.model;
    if (llm.response_model) {
      attributes["gen_ai.response.model"] = llm.response_model;
    }
    if (llm.input_tokens !== null && llm.input_tokens !== undefined) {
      attributes["gen_ai.usage.input_tokens"] = llm.input_tokens;
    }
    if (llm.output_tokens !== null && llm.output_tokens !== undefined) {
      attributes["gen_ai.usage.output_tokens"] = llm.output_tokens;
    }
    if (llm.total_tokens !== null && llm.total_tokens !== undefined) {
      attributes["gen_ai.usage.total_tokens"] = llm.total_tokens;
    }
    if (llm.finish_reason) {
      // OTEL uses array format
      attributes["gen_ai.response.finish_reasons"] = Array.isArray(
        llm.finish_reason,
      )
        ? llm.finish_reason
        : [llm.finish_reason];
    }
    if (llm.cost !== null && llm.cost !== undefined) {
      attributes["gen_ai.usage.cost"] = llm.cost;
    }
    if (llm.temperature !== null && llm.temperature !== undefined) {
      attributes["gen_ai.request.temperature"] = llm.temperature;
    }
    if (llm.max_tokens !== null && llm.max_tokens !== undefined) {
      attributes["gen_ai.request.max_tokens"] = llm.max_tokens;
    }

    // TIER 2: Sampling Parameters
    if (llm.top_k !== null && llm.top_k !== undefined) {
      attributes["gen_ai.request.top_k"] = llm.top_k;
    }
    if (llm.top_p !== null && llm.top_p !== undefined) {
      attributes["gen_ai.request.top_p"] = llm.top_p;
    }
    if (llm.frequency_penalty !== null && llm.frequency_penalty !== undefined) {
      attributes["gen_ai.request.frequency_penalty"] = llm.frequency_penalty;
    }
    if (llm.presence_penalty !== null && llm.presence_penalty !== undefined) {
      attributes["gen_ai.request.presence_penalty"] = llm.presence_penalty;
    }
    if (llm.stop_sequences && llm.stop_sequences.length > 0) {
      attributes["gen_ai.request.stop_sequences"] = llm.stop_sequences;
    }
    if (llm.seed !== null && llm.seed !== undefined) {
      attributes["gen_ai.request.seed"] = llm.seed;
    }

    // TIER 2: Structured Cost Tracking
    if (llm.input_cost !== null && llm.input_cost !== undefined) {
      attributes["gen_ai.usage.input_cost"] = llm.input_cost;
    }
    if (llm.output_cost !== null && llm.output_cost !== undefined) {
      attributes["gen_ai.usage.output_cost"] = llm.output_cost;
    }
    if (llm.input_cost !== null && llm.output_cost !== null) {
      attributes["gen_ai.usage.total_cost"] =
        (llm.input_cost || 0) + (llm.output_cost || 0);
    }

    // TIER 1: Structured Message Objects (OTEL opt-in)
    if (llm.input_messages && llm.input_messages.length > 0) {
      attributes["gen_ai.input.messages"] = llm.input_messages;
    }
    if (llm.output_messages && llm.output_messages.length > 0) {
      attributes["gen_ai.output.messages"] = llm.output_messages;
    }
    if (llm.system_instructions && llm.system_instructions.length > 0) {
      attributes["gen_ai.system_instructions"] = llm.system_instructions;
    }
    if (llm.tool_definitions && llm.tool_definitions.length > 0) {
      attributes["gen_ai.request.tools"] = llm.tool_definitions;
    } else if (llm.tools && llm.tools.length > 0) {
      attributes["gen_ai.request.tools"] = llm.tools;
    }

    // TIER 2: Server Metadata
    if (llm.server_address) {
      attributes["server.address"] = llm.server_address;
    }
    if (llm.server_port !== null && llm.server_port !== undefined) {
      attributes["server.port"] = llm.server_port;
    }

    // TIER 2: Conversation Grouping
    if (llm.conversation_id_otel) {
      attributes["gen_ai.conversation.id"] = llm.conversation_id_otel;
    } else if (span.metadata?.conversation_id) {
      attributes["gen_ai.conversation.id"] = span.metadata.conversation_id;
    }

    // TIER 2: Request Metadata
    if (llm.choice_count !== null && llm.choice_count !== undefined) {
      attributes["gen_ai.request.choice.count"] = llm.choice_count;
    }

    // Also keep original structure for compatibility
    attributes["llm_call.model"] = llm.model;
    attributes["llm_call.input"] = llm.input;
    attributes["llm_call.output"] = llm.output;
    attributes["llm_call.input_tokens"] = llm.input_tokens;
    attributes["llm_call.output_tokens"] = llm.output_tokens;
    attributes["llm_call.total_tokens"] = llm.total_tokens;
    attributes["llm_call.latency_ms"] = llm.latency_ms;
    attributes["llm_call.finish_reason"] = llm.finish_reason;
    attributes["llm_call.cost"] = llm.cost;
    attributes["llm_call.time_to_first_token_ms"] = llm.time_to_first_token_ms;
    attributes["llm_call.streaming_duration_ms"] = llm.streaming_duration_ms;
    attributes["llm_call.response_id"] = llm.response_id;
    attributes["llm_call.system_fingerprint"] = llm.system_fingerprint;
    if (llm.tool_definitions && llm.tool_definitions.length > 0) {
      attributes["llm_call.tool_definitions"] = llm.tool_definitions;
    } else if (llm.tools && llm.tools.length > 0) {
      attributes["llm_call.tool_definitions"] = llm.tools;
    }
    if (span.available_tools && span.available_tools.length > 0) {
      attributes["observa.available_tools"] = span.available_tools;
    }
    if (span.executed_tools && span.executed_tools.length > 0) {
      attributes["observa.executed_tools"] = span.executed_tools;
    }
    if (span.attempted_tool_calls && span.attempted_tool_calls.length > 0) {
      attributes["observa.attempted_tool_calls"] = span.attempted_tool_calls;
    }
  }

  // Add tool call attributes (TIER 2: OTEL Tool Standardization)
  if (span.tool_call) {
    const tool = span.tool_call;

    // TIER 2: OTEL Required
    if (tool.operation_name) {
      attributes["gen_ai.operation.name"] = tool.operation_name;
    } else {
      attributes["gen_ai.operation.name"] = "execute_tool";
    }

    // OTEL Tool Attributes
    if (tool.tool_name) {
      attributes["gen_ai.tool.name"] = tool.tool_name;
      attributes["tool.call.name"] = tool.tool_name; // Keep for compatibility
    }
    if (tool.tool_type) {
      attributes["gen_ai.tool.type"] = tool.tool_type;
    }
    if (tool.tool_description) {
      attributes["gen_ai.tool.description"] = tool.tool_description;
    }
    if (tool.tool_call_id) {
      attributes["gen_ai.tool.call.id"] = tool.tool_call_id;
    }

    // Tool Call Data
    if (tool.args !== undefined) {
      attributes["gen_ai.tool.call.arguments"] = tool.args;
      attributes["tool.call.args"] = tool.args; // Keep for compatibility
    }
    if (tool.result !== undefined) {
      attributes["gen_ai.tool.call.result"] = tool.result;
      attributes["tool.call.result"] = tool.result; // Keep for compatibility
    }
    if (tool.latency_ms !== null && tool.latency_ms !== undefined) {
      attributes["tool.call.latency_ms"] = tool.latency_ms;
    }
    if (tool.result_status) {
      attributes["tool.call.result_status"] = tool.result_status;
    }

    // TIER 2: Structured Error Classification
    if (tool.error_message) {
      attributes["tool.call.error_message"] = tool.error_message;
    }
    if (tool.error_type) {
      attributes["error.type"] = tool.error_type;
    }
    if (tool.error_category) {
      attributes["error.category"] = tool.error_category;
    }
  }

  // Add retrieval attributes (TIER 2: Enriched with vector metadata)
  if (span.retrieval) {
    const retrieval = span.retrieval;
    const topK = retrieval.top_k || retrieval.k;
    if (topK !== null && topK !== undefined) {
      attributes["retrieval.top_k"] = topK;
    }
    if (retrieval.latency_ms !== null && retrieval.latency_ms !== undefined) {
      attributes["retrieval.latency_ms"] = retrieval.latency_ms;
    }
    if (retrieval.retrieval_context_ids) {
      attributes["retrieval.context_ids"] = retrieval.retrieval_context_ids;
    }
    if (retrieval.similarity_scores) {
      attributes["retrieval.similarity_scores"] = retrieval.similarity_scores;
    }
    if (retrieval.retrieval_context) {
      attributes["retrieval.context"] = retrieval.retrieval_context;
    }

    // TIER 2: Vector Metadata
    if (retrieval.embedding_model) {
      attributes["retrieval.embedding_model"] = retrieval.embedding_model;
    }
    if (
      retrieval.embedding_dimensions !== null &&
      retrieval.embedding_dimensions !== undefined
    ) {
      attributes["retrieval.embedding_dimensions"] =
        retrieval.embedding_dimensions;
    }
    if (retrieval.vector_metric) {
      attributes["retrieval.vector_metric"] = retrieval.vector_metric;
    }
    if (
      retrieval.rerank_score !== null &&
      retrieval.rerank_score !== undefined
    ) {
      attributes["retrieval.rerank_score"] = retrieval.rerank_score;
    }
    if (retrieval.fusion_method) {
      attributes["retrieval.fusion_method"] = retrieval.fusion_method;
    }
    if (
      retrieval.deduplication_removed_count !== null &&
      retrieval.deduplication_removed_count !== undefined
    ) {
      attributes["retrieval.deduplication_removed_count"] =
        retrieval.deduplication_removed_count;
    }
    if (
      retrieval.quality_score !== null &&
      retrieval.quality_score !== undefined
    ) {
      attributes["retrieval.quality_score"] = retrieval.quality_score;
    }
  }

  // TIER 1: Embedding span attributes
  if (span.embedding) {
    const embedding = span.embedding;

    // OTEL Required
    if (embedding.operation_name) {
      attributes["gen_ai.operation.name"] = embedding.operation_name;
    } else {
      attributes["gen_ai.operation.name"] = "embeddings";
    }
    if (embedding.provider_name) {
      attributes["gen_ai.provider.name"] = embedding.provider_name;
    }

    // OTEL Embedding Attributes
    if (embedding.model) {
      attributes["gen_ai.request.model"] = embedding.model;
    }
    if (
      embedding.dimension_count !== null &&
      embedding.dimension_count !== undefined
    ) {
      attributes["gen_ai.embeddings.dimension.count"] =
        embedding.dimension_count;
    }
    if (embedding.encoding_formats && embedding.encoding_formats.length > 0) {
      attributes["gen_ai.request.encoding_formats"] =
        embedding.encoding_formats;
    }
    if (
      embedding.input_tokens !== null &&
      embedding.input_tokens !== undefined
    ) {
      attributes["gen_ai.usage.input_tokens"] = embedding.input_tokens;
    }
    if (
      embedding.output_tokens !== null &&
      embedding.output_tokens !== undefined
    ) {
      attributes["gen_ai.usage.output_tokens"] = embedding.output_tokens;
    }
    if (embedding.latency_ms !== null && embedding.latency_ms !== undefined) {
      attributes["embedding.latency_ms"] = embedding.latency_ms;
    }
    if (embedding.cost !== null && embedding.cost !== undefined) {
      attributes["gen_ai.usage.cost"] = embedding.cost;
    }
    if (embedding.input_text) {
      attributes["embedding.input_text"] = embedding.input_text;
    }
    if (embedding.embeddings) {
      attributes["embedding.embeddings"] = embedding.embeddings;
    }
  }

  // TIER 3: Vector DB operation attributes
  if (span.vector_db_operation) {
    const vdb = span.vector_db_operation;
    if (vdb.operation_type) {
      attributes["vector_db.operation_type"] = vdb.operation_type;
    }
    if (vdb.index_name) {
      attributes["vector_db.index_name"] = vdb.index_name;
    }
    if (vdb.index_version) {
      attributes["vector_db.index_version"] = vdb.index_version;
    }
    if (vdb.vector_dimensions !== null && vdb.vector_dimensions !== undefined) {
      attributes["vector_db.vector_dimensions"] = vdb.vector_dimensions;
    }
    if (vdb.vector_metric) {
      attributes["vector_db.vector_metric"] = vdb.vector_metric;
    }
    if (vdb.results_count !== null && vdb.results_count !== undefined) {
      attributes["vector_db.results_count"] = vdb.results_count;
    }
    if (vdb.scores) {
      attributes["vector_db.scores"] = vdb.scores;
    }
    if (vdb.latency_ms !== null && vdb.latency_ms !== undefined) {
      attributes["vector_db.latency_ms"] = vdb.latency_ms;
    }
    if (vdb.cost !== null && vdb.cost !== undefined) {
      attributes["vector_db.cost"] = vdb.cost;
    }
    if (vdb.provider_name) {
      attributes["vector_db.provider_name"] = vdb.provider_name;
    }
  }

  // TIER 3: Cache operation attributes
  if (span.cache_operation) {
    const cache = span.cache_operation;
    if (cache.cache_backend) {
      attributes["cache.backend"] = cache.cache_backend;
    }
    if (cache.cache_key) {
      attributes["cache.key"] = cache.cache_key;
    }
    if (cache.cache_namespace) {
      attributes["cache.namespace"] = cache.cache_namespace;
    }
    if (cache.hit_status) {
      attributes["cache.hit_status"] = cache.hit_status;
    }
    if (cache.latency_ms !== null && cache.latency_ms !== undefined) {
      attributes["cache.latency_ms"] = cache.latency_ms;
    }
    if (cache.saved_cost !== null && cache.saved_cost !== undefined) {
      attributes["cache.saved_cost"] = cache.saved_cost;
    }
    if (cache.ttl !== null && cache.ttl !== undefined) {
      attributes["cache.ttl"] = cache.ttl;
    }
  }

  // TIER 3: Agent creation attributes
  if (span.agent_create) {
    const agent = span.agent_create;
    if (agent.operation_name) {
      attributes["gen_ai.operation.name"] = agent.operation_name;
    } else {
      attributes["gen_ai.operation.name"] = "create_agent";
    }
    if (agent.agent_name) {
      attributes["agent.name"] = agent.agent_name;
    }
    if (agent.agent_config) {
      attributes["agent.config"] = agent.agent_config;
    }
    if (agent.tools_bound) {
      attributes["agent.tools_bound"] = agent.tools_bound;
    }
    if (agent.model_config) {
      attributes["agent.model_config"] = agent.model_config;
    }
  }

  // Add output attributes
  if (span.output) {
    if (
      span.output.final_output !== null &&
      span.output.final_output !== undefined
    ) {
      attributes["output.final_output"] = span.output.final_output;
    }
    if (
      span.output.output_length !== null &&
      span.output.output_length !== undefined
    ) {
      attributes["output.output_length"] = span.output.output_length;
    }
  }

  // Add trace_start attributes
  if (span.trace_start) {
    const traceStart = span.trace_start;
    if (traceStart.name) {
      attributes["trace_start.name"] = traceStart.name;
    }
    if (traceStart.chain_type) {
      attributes["trace_start.chain_type"] = traceStart.chain_type;
    }
    if (
      traceStart.num_prompts !== null &&
      traceStart.num_prompts !== undefined
    ) {
      attributes["trace_start.num_prompts"] = traceStart.num_prompts;
    }
    if (traceStart.created_at) {
      attributes["trace_start.created_at"] = traceStart.created_at;
    }
    if (traceStart.metadata) {
      attributes["trace_start.metadata"] = traceStart.metadata;
    }
  }

  // Add trace_end attributes
  if (span.trace_end) {
    const traceEnd = span.trace_end;
    if (
      traceEnd.total_latency_ms !== null &&
      traceEnd.total_latency_ms !== undefined
    ) {
      attributes["trace_end.total_latency_ms"] = traceEnd.total_latency_ms;
    }
    if (traceEnd.total_tokens !== null && traceEnd.total_tokens !== undefined) {
      attributes["trace_end.total_tokens"] = traceEnd.total_tokens;
    }
  }

  // Add feedback attributes
  if (span.feedback || span.feedback_metadata || span.feedback_type) {
    const feedback = span.feedback || {
      type: span.feedback_metadata?.type || span.feedback_type,
      outcome: span.feedback_metadata?.outcome || span.feedback_outcome,
      rating: span.feedback_metadata?.rating || span.feedback_rating,
      comment: span.feedback_metadata?.comment || span.feedback_comment,
    };

    if (feedback.type) attributes["feedback.type"] = feedback.type;
    if (feedback.outcome) attributes["feedback.outcome"] = feedback.outcome;
    if (feedback.rating !== null && feedback.rating !== undefined) {
      attributes["feedback.rating"] = feedback.rating;
    }
    if (feedback.comment) attributes["feedback.comment"] = feedback.comment;
    attributes["feedback.has_comment"] = !!feedback.comment;
  }

  // Map our span types to agent-prism TraceSpanCategory
  // Valid categories: llm_call, tool_execution, agent_invocation, chain_operation,
  // retrieval, embedding, create_agent, span, event, guardrail, unknown
  // IMPORTANT: Must match exactly - case sensitive!
  let category:
    | "llm_call"
    | "tool_execution"
    | "agent_invocation"
    | "chain_operation"
    | "retrieval"
    | "embedding"
    | "create_agent"
    | "span"
    | "event"
    | "guardrail"
    | "unknown" = "unknown";

  // PHASE 3: Use observation_type when present (Langfuse parity)
  const obsType = span.observation_type?.toLowerCase();
  if (obsType) {
    const obsMap: Record<
      string,
      | "llm_call"
      | "tool_execution"
      | "agent_invocation"
      | "chain_operation"
      | "retrieval"
      | "embedding"
      | "create_agent"
      | "span"
      | "event"
      | "guardrail"
    > = {
      generation: "llm_call",
      tool: "tool_execution",
      agent: "agent_invocation",
      chain: "chain_operation",
      retriever: "retrieval",
      embedding: "embedding",
      evaluator: "event",
      guardrail: "guardrail",
      span: "span",
    };
    if (obsMap[obsType]) category = obsMap[obsType];
  }

  const spanName = span.name || "";
  const spanNameLower = spanName.toLowerCase();

  // Check in priority order (most specific first) - only if category not set from observation_type
  if (category === "unknown") {
    if (
      span.llm_call ||
      span.event_type === "llm_call" ||
      span.type === "llm_call"
    ) {
      category = "llm_call";
    } else if (
      span.tool_call ||
      span.event_type === "tool_call" ||
      span.type === "tool_call"
    ) {
      category = "tool_execution"; // Note: tool_call maps to tool_execution
    } else if (
      span.embedding ||
      span.event_type === "embedding" ||
      span.type === "embedding" ||
      spanNameLower.includes("embedding")
    ) {
      category = "embedding";
    } else if (
      span.agent_create ||
      span.event_type === "agent_create" ||
      span.type === "agent_create" ||
      spanNameLower.includes("create_agent") ||
      spanNameLower.includes("agent create")
    ) {
      category = "create_agent";
    } else if (
      span.retrieval ||
      span.event_type === "retrieval" ||
      span.type === "retrieval"
    ) {
      category = "retrieval";
    } else if (
      span.feedback ||
      span.feedback_metadata ||
      span.feedback_type ||
      span.event_type === "feedback" ||
      span.type === "feedback" ||
      spanNameLower.includes("feedback")
    ) {
      category = "event"; // Feedback events map to "event" category
    } else if (
      span.output ||
      span.event_type === "output" ||
      span.type === "output"
    ) {
      category = "event"; // Output events map to "event"
    } else if (
      span.type === "trace" ||
      span.name === "Trace" ||
      spanNameLower === "trace"
    ) {
      category = "span"; // Root trace spans
    } else {
      // Try to detect category from span name patterns (common in LangChain/LangGraph)
      if (
        spanNameLower.includes("runnablesequence") ||
        spanNameLower.includes("sequence") ||
        spanNameLower.includes("chain") ||
        spanNameLower.startsWith("runnable")
      ) {
        category = "chain_operation";
      } else if (
        spanNameLower.includes("agent") ||
        spanNameLower.includes("agentexecutor") ||
        spanNameLower.includes("runnableassign") ||
        spanNameLower.includes("openaitoolsagent") ||
        spanNameLower.includes("toolagent") ||
        spanNameLower.includes("planandexecute")
      ) {
        category = "agent_invocation";
      }
    }
  }

  // Determine status from span data and extract error information
  let status: "success" | "error" | "pending" | "warning" = "success";
  let errorInfo: SpanErrorInfo | undefined;

  // Check for error events associated with this span
  const errorEvent = span.events?.find((e: any) => e.event_type === "error");
  const hasErrorEvent = !!errorEvent;

  // Extract error information with comprehensive SOTA context
  if (span.error || errorEvent) {
    status = "error";
    const errorData = span.error || errorEvent?.attributes?.error;

    if (errorData) {
      const errorMessage = errorData.error_message || "Unknown error";
      const errorType = errorData.error_type || "error";
      const errorContext = errorData.context || {};

      // CRITICAL FIX: Extract error_category and error_code directly from errorData
      // Use SDK-provided values if available, otherwise classify
      const errorCategoryFromSDK =
        errorData.error_category || errorContext.error_category;
      const errorCodeFromSDK = errorData.error_code || errorContext.error_code;

      // Use SDK-provided category if available, otherwise classify
      const errorCategory =
        errorCategoryFromSDK ||
        classifyErrorCategory(errorType, errorMessage, errorContext);

      // Build comprehensive error info
      errorInfo = {
        type: errorType,
        message:
          errorMessage.length > 100
            ? errorMessage.substring(0, 100) + "..."
            : errorMessage,
        fullMessage: errorMessage,
        stackTrace: errorData.stack_trace || undefined,
        context: errorContext,
        timestamp: errorEvent?.timestamp || span.start_time || undefined,

        // SOTA: Operation context
        operation: {
          tool_name:
            span.tool_call?.tool_name || errorContext.tool_name || span.name,
          operation_type:
            errorContext.operation_type ||
            (span.tool_call ? "tool_call" : "unknown"),
          endpoint: errorContext.endpoint || errorContext.url,
          method: errorContext.method || errorContext.http_method,
          args: span.tool_call?.args || errorContext.args,
        },

        // SOTA: Request details
        request: {
          url:
            errorContext.url ||
            errorContext.endpoint ||
            errorContext.request_url,
          headers: errorContext.headers || errorContext.request_headers,
          body: errorContext.body || errorContext.request_body,
          timeout_ms:
            errorContext.timeout_ms ||
            errorContext.timeout ||
            span.tool_call?.latency_ms,
          retry_count: errorContext.retry_count || errorContext.attempt || 0,
          max_retries: errorContext.max_retries || errorContext.max_attempts,
        },

        // SOTA: Timing context
        timing: {
          started_at: span.start_time,
          timeout_at: span.end_time || errorEvent?.timestamp,
          elapsed_ms: span.duration_ms ?? errorContext.elapsed_ms ?? undefined,
          timeout_threshold_ms:
            errorContext.timeout_ms ?? errorContext.timeout ?? 30000,
          retry_attempts: errorContext.retry_count ?? errorContext.attempt ?? 0,
        },

        // SOTA: Network/infrastructure context
        network: {
          error_category:
            errorCategoryFromSDK ||
            errorContext.network_error_type ||
            (errorType.includes("timeout")
              ? "connection_timeout"
              : errorType.includes("connection")
                ? "connection_error"
                : "unknown"),
          dns_resolved: errorContext.dns_resolved,
          connection_established:
            errorContext.connection_established || errorContext.connected,
          bytes_sent: errorContext.bytes_sent ?? undefined,
          bytes_received: errorContext.bytes_received ?? undefined,
          partial_response:
            errorContext.partial_response || errorContext.response,
        },

        // SOTA: Related context
        relatedContext: {
          parent_operation: span.parent_span_id
            ? `Parent span: ${span.parent_span_id}`
            : "Root operation",
          ...(span.metadata?.conversation_id && {
            conversation_id: span.metadata.conversation_id,
          }),
          ...(span.metadata?.session_id && {
            session_id: span.metadata.session_id,
          }),
        },

        // SOTA: Suggested fixes based on error type
        suggestedFixes: generateSuggestedFixes(
          errorType,
          errorMessage,
          errorContext,
          span,
        ),

        // SOTA: Error classification - USE SDK-PROVIDED VALUES
        classification: {
          category: errorCategory,
          severity: classifySeverity(errorType, errorMessage),
          impact: determineImpact(span, errorType),
          known_issue: errorContext.known_issue || false,
        },
        // Store error code separately in context for frontend access
        errorCode: errorCodeFromSDK || undefined,
      };
    }
  }

  // CRITICAL FIX: Also check for error events on LLM call spans
  // If an error event exists but span.error is not set, still mark as error
  if (!status && hasErrorEvent && span.llm_call) {
    status = "error";
  } else if (
    span.tool_call?.result_status === "error" ||
    span.tool_call?.result_status === "timeout"
  ) {
    status = "error";
    const errorMessage =
      span.tool_call.error_message ||
      `Tool call failed with status: ${span.tool_call.result_status}`;
    const isTimeout = span.tool_call.result_status === "timeout";

    // Extract args for operation context
    const toolArgs = span.tool_call.args || {};
    const toolName = span.tool_call.tool_name || span.name;

    // Try to extract URL/endpoint from args or context
    let endpoint: string | undefined;
    if (typeof toolArgs === "object" && toolArgs !== null) {
      endpoint =
        toolArgs.url || toolArgs.endpoint || toolArgs.uri || toolArgs.path;
    }

    errorInfo = {
      type: isTimeout ? "timeout_error" : "tool_error",
      message:
        errorMessage.length > 100
          ? errorMessage.substring(0, 100) + "..."
          : errorMessage,
      fullMessage: errorMessage,
      timestamp: span.start_time,

      // SOTA: Operation context from tool call
      operation: {
        tool_name: toolName,
        operation_type: "tool_call",
        endpoint: endpoint,
        method:
          toolArgs.method ||
          toolArgs.http_method ||
          (toolArgs.url ? "GET" : undefined),
        args: toolArgs,
      },

      // SOTA: Request details
      request: {
        url: endpoint || toolArgs.url || toolArgs.endpoint,
        headers: toolArgs.headers || toolArgs.request_headers,
        body: toolArgs.body || toolArgs.payload || toolArgs.data,
        timeout_ms:
          toolArgs.timeout || toolArgs.timeout_ms || span.tool_call.latency_ms,
        retry_count: toolArgs.retry_count || toolArgs.attempt || 0,
        max_retries: toolArgs.max_retries || toolArgs.max_attempts,
      },

      // SOTA: Timing context
      timing: {
        started_at: span.start_time,
        timeout_at: span.end_time,
        elapsed_ms: span.duration_ms ?? span.tool_call?.latency_ms ?? undefined,
        timeout_threshold_ms: toolArgs.timeout ?? toolArgs.timeout_ms ?? 30000,
        retry_attempts: toolArgs.retry_count ?? toolArgs.attempt ?? 0,
      },

      // SOTA: Network context
      network: {
        error_category: isTimeout
          ? "connection_timeout"
          : "tool_execution_error",
        connection_established: !isTimeout, // Timeout implies connection wasn't established
      },

      // SOTA: Related context
      relatedContext: {
        parent_operation: span.parent_span_id
          ? `Parent span: ${span.parent_span_id}`
          : "Root operation",
        ...(span.metadata?.conversation_id && {
          conversation_id: span.metadata.conversation_id,
        }),
        ...(span.metadata?.session_id && {
          session_id: span.metadata.session_id,
        }),
      },

      // SOTA: Suggested fixes
      suggestedFixes: generateSuggestedFixes(
        isTimeout ? "timeout_error" : "tool_error",
        errorMessage,
        toolArgs,
        span,
      ),

      // SOTA: Error classification
      classification: {
        category: classifyErrorCategory(
          isTimeout ? "timeout_error" : "tool_error",
          errorMessage,
          toolArgs,
        ),
        severity: classifySeverity(
          isTimeout ? "timeout_error" : "tool_error",
          errorMessage,
        ),
        impact: determineImpact(
          span,
          isTimeout ? "timeout_error" : "tool_error",
        ),
      },
    };
  } else if (span.tool_call?.error_message) {
    status = "error";
    const errorMessage = span.tool_call.error_message;
    const toolArgs = span.tool_call.args || {};
    const toolName = span.tool_call.tool_name || span.name;

    errorInfo = {
      type: "tool_error",
      message:
        errorMessage.length > 100
          ? errorMessage.substring(0, 100) + "..."
          : errorMessage,
      fullMessage: errorMessage,
      timestamp: span.start_time,

      // SOTA: Basic operation context
      operation: {
        tool_name: toolName,
        operation_type: "tool_call",
        args: toolArgs,
      },

      suggestedFixes: generateSuggestedFixes(
        "tool_error",
        errorMessage,
        toolArgs,
        span,
      ),
      classification: {
        category: classifyErrorCategory("tool_error", errorMessage, toolArgs),
        severity: classifySeverity("tool_error", errorMessage),
      },
    };
  } else if (span.llm_call?.finish_reason === "error") {
    status = "error";
    errorInfo = {
      type: "llm_error",
      message: "LLM call finished with error",
      fullMessage: "LLM call finished with error status",
      timestamp: span.start_time,
    };
  } else if (
    span.metadata?.status &&
    (span.metadata.status < 200 || span.metadata.status >= 400)
  ) {
    // Check HTTP status codes for errors (if stored in metadata)
    status = "error";
    errorInfo = {
      type: "http_error",
      message: `HTTP ${span.metadata.status} error`,
      fullMessage: `HTTP error with status code: ${span.metadata.status}`,
      timestamp: span.start_time,
    };
  } else if (!errorInfo && (span as any).signals?.length > 0) {
    // TRACE_TREE_VIEW_SPEC: Use span.signals (e.g. tool_error, medium_latency) for errorInfo so they show in ErrorSummaryBanner and SpanCard
    const firstSignal = (span as any).signals[0];
    const signalType =
      firstSignal.signal_type || firstSignal.signal_name || "error";
    const message =
      firstSignal.message || firstSignal.signal_name || signalType;
    status =
      firstSignal.signal_severity === "high" || signalType === "tool_error"
        ? "error"
        : "warning";
    errorInfo = {
      type: signalType,
      message:
        message.length > 100 ? message.substring(0, 100) + "..." : message,
      fullMessage: message,
      timestamp: span.start_time,
    };
  }

  // Extract tokensCount and cost for badges
  const tokensCount = span.llm_call?.total_tokens || null;
  const cost = span.llm_call?.cost || null;

  // Extract input/output for In/Out tab
  // PHASE 1: Prefer explicitly set span.input/span.output from backend (Langfuse parity)
  // Root trace = user question + final answer; Trace Start = question only; Output = answer only
  let input: string | undefined;
  let output: string | undefined;

  if (span.isRootTrace && (span.input != null || span.output != null)) {
    // Root trace span: input = user query, output = final answer
    input =
      span.input != null
        ? typeof span.input === "string"
          ? span.input
          : JSON.stringify(span.input, null, 2)
        : undefined;
    output =
      span.output != null
        ? typeof span.output === "string"
          ? span.output
          : JSON.stringify(span.output, null, 2)
        : undefined;
  } else if (span.trace_start && span.input != null) {
    // Trace Start span: input = user query, output = null
    input =
      typeof span.input === "string"
        ? span.input
        : JSON.stringify(span.input, null, 2);
    output = undefined;
  } else if (span.type === "output" && span.input === null) {
    // Output span: input = null, output = final_output only
    input = undefined;
    const outputObj = span.output as
      | { final_output?: string | null }
      | undefined;
    const fo = span.final_output ?? outputObj?.final_output;
    output =
      fo != null
        ? typeof fo === "string"
          ? fo
          : JSON.stringify(fo, null, 2)
        : undefined;
  } else if (span.llm_call) {
    if (span.llm_call.input !== null && span.llm_call.input !== undefined) {
      input =
        typeof span.llm_call.input === "string"
          ? span.llm_call.input
          : JSON.stringify(span.llm_call.input, null, 2);
    }
    // CRITICAL: Extract output from multiple sources
    // 1. First try direct output field
    if (span.llm_call.output !== null && span.llm_call.output !== undefined) {
      output =
        typeof span.llm_call.output === "string"
          ? span.llm_call.output
          : JSON.stringify(span.llm_call.output, null, 2);
    }
    // 2. If output is missing, try to extract from output_messages
    else if (
      Array.isArray(span.llm_call.output_messages) &&
      span.llm_call.output_messages.length > 0
    ) {
      const outputTexts = span.llm_call.output_messages
        .map((msg: any) => {
          // Handle different message formats
          if (typeof msg === "string") return msg;
          if (typeof msg.content === "string") return msg.content;
          if (Array.isArray(msg.content)) {
            return msg.content
              .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
              .filter(Boolean)
              .join("\n");
          }
          if (msg.text) return msg.text;
          if (msg.message?.content) {
            return typeof msg.message.content === "string"
              ? msg.message.content
              : JSON.stringify(msg.message.content);
          }
          return "";
        })
        .filter(Boolean);

      if (outputTexts.length > 0) {
        output = outputTexts.join("\n");
      }
    }
    // 3. If still no output, try input_messages (sometimes output is in input_messages for assistant messages)
    else if (
      Array.isArray(span.llm_call.input_messages) &&
      span.llm_call.input_messages.length > 0
    ) {
      // Look for assistant messages in input_messages
      const assistantMessages = span.llm_call.input_messages.filter(
        (msg: any) => msg.role === "assistant" || msg.role === "ai",
      );
      if (assistantMessages.length > 0) {
        const outputTexts = assistantMessages
          .map((msg: any) => {
            if (typeof msg.content === "string") return msg.content;
            if (Array.isArray(msg.content)) {
              return msg.content
                .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
                .filter(Boolean)
                .join("\n");
            }
            return msg.text || "";
          })
          .filter(Boolean);

        if (outputTexts.length > 0) {
          output = outputTexts.join("\n");
        }
      }
    }
  } else if (span.tool_call) {
    // CRITICAL: Comprehensive tool call display - SOTA practices
    // Input: Show all arguments with enhanced formatting
    if (span.tool_call.args !== null && span.tool_call.args !== undefined) {
      const toolInput: any = {
        tool_name: span.tool_call.tool_name,
        ...(typeof span.tool_call.args === "object" &&
        span.tool_call.args !== null
          ? span.tool_call.args
          : { args: span.tool_call.args }),
      };

      // Add any additional metadata that might be in args
      if (
        typeof span.tool_call.args === "object" &&
        span.tool_call.args !== null
      ) {
        // Preserve all fields from args
        Object.assign(toolInput, span.tool_call.args);
      }

      input = JSON.stringify(toolInput, null, 2);
    } else {
      // Still show tool name even if args are missing
      input = JSON.stringify({ tool_name: span.tool_call.tool_name }, null, 2);
    }

    // Output: Comprehensive result display with all metadata
    if (span.tool_call.result !== null && span.tool_call.result !== undefined) {
      const toolOutput: any = {};

      // For web_search and similar tools, ensure all results are shown
      if (
        span.tool_call.tool_name === "web_search" ||
        span.tool_call.tool_name?.includes("search")
      ) {
        const result = span.tool_call.result;

        // If result is already an object with results array, preserve structure
        if (typeof result === "object" && result !== null) {
          // Preserve all fields
          Object.assign(toolOutput, result);

          // Ensure results array is fully expanded (not just summaries)
          if (result.results && Array.isArray(result.results)) {
            toolOutput.results = result.results;
            toolOutput.total_results = result.results.length;
          }

          // If result has items/items_found, preserve those too
          if (result.items_found !== undefined) {
            toolOutput.items_found = result.items_found;
          }
          if (result.data !== undefined) {
            toolOutput.data = result.data;
          }

          // Add metadata if present
          if (result.metadata) {
            toolOutput.metadata = result.metadata;
          }
          if (result.query !== undefined) {
            toolOutput.query = result.query;
          }
          if (result.urls !== undefined) {
            toolOutput.urls = result.urls;
          }
          if (result.snippets !== undefined) {
            toolOutput.snippets = result.snippets;
          }
        } else {
          // If result is a string or other format, include it
          toolOutput.result = result;
        }

        // Add execution metadata
        toolOutput.execution = {
          status: span.tool_call.result_status,
          latency_ms: span.tool_call.latency_ms,
          ...(span.tool_call.error_message && {
            error_message: span.tool_call.error_message,
          }),
        };
      } else {
        // For other tools, show complete result with metadata
        if (
          typeof span.tool_call.result === "object" &&
          span.tool_call.result !== null
        ) {
          Object.assign(toolOutput, span.tool_call.result);
        } else {
          toolOutput.result = span.tool_call.result;
        }

        // Always include execution metadata
        toolOutput.execution = {
          status: span.tool_call.result_status,
          latency_ms: span.tool_call.latency_ms,
          ...(span.tool_call.error_message && {
            error_message: span.tool_call.error_message,
          }),
        };
      }

      output = JSON.stringify(toolOutput, null, 2);
    } else {
      // Even if no result, show execution metadata (especially for errors/timeouts)
      const errorOutput: any = {
        execution: {
          status: span.tool_call.result_status,
          latency_ms: span.tool_call.latency_ms,
          ...(span.tool_call.error_message && {
            error_message: span.tool_call.error_message,
          }),
        },
      };

      if (
        span.tool_call.result_status === "error" ||
        span.tool_call.result_status === "timeout"
      ) {
        errorOutput.error = {
          status: span.tool_call.result_status,
          message: span.tool_call.error_message || "No result returned",
        };
      }

      output = JSON.stringify(errorOutput, null, 2);
    }
  } else if (span.retrieval) {
    // For retrieval spans, create a formatted summary as input (query/metadata)
    const retrievalInput: any = {};
    if (span.retrieval.k !== null && span.retrieval.k !== undefined) {
      retrievalInput.k = span.retrieval.k;
    }
    if (span.retrieval.top_k !== null && span.retrieval.top_k !== undefined) {
      retrievalInput.top_k = span.retrieval.top_k;
    }
    if (Object.keys(retrievalInput).length > 0) {
      input = JSON.stringify(retrievalInput, null, 2);
    }

    // For retrieval spans, show retrieval context or formatted summary as output
    if (span.retrieval.retrieval_context) {
      // If we have the actual context text, use it
      output =
        typeof span.retrieval.retrieval_context === "string"
          ? span.retrieval.retrieval_context
          : JSON.stringify(span.retrieval.retrieval_context, null, 2);
    } else {
      // Otherwise, create a formatted summary with context IDs, similarity scores, etc.
      const retrievalOutput: any = {};
      if (
        span.retrieval.retrieval_context_ids &&
        span.retrieval.retrieval_context_ids.length > 0
      ) {
        retrievalOutput.retrieved_documents =
          span.retrieval.retrieval_context_ids;
        retrievalOutput.document_count =
          span.retrieval.retrieval_context_ids.length;
      }
      if (
        span.retrieval.similarity_scores &&
        span.retrieval.similarity_scores.length > 0
      ) {
        retrievalOutput.similarity_scores = span.retrieval.similarity_scores;
        retrievalOutput.avg_similarity =
          span.retrieval.similarity_scores.reduce(
            (a: number, b: number) => a + b,
            0,
          ) / span.retrieval.similarity_scores.length;
        retrievalOutput.max_similarity = Math.max(
          ...span.retrieval.similarity_scores,
        );
        retrievalOutput.min_similarity = Math.min(
          ...span.retrieval.similarity_scores,
        );
      }
      if (
        span.retrieval.latency_ms !== null &&
        span.retrieval.latency_ms !== undefined
      ) {
        retrievalOutput.latency_ms = span.retrieval.latency_ms;
      }
      if (Object.keys(retrievalOutput).length > 0) {
        output = JSON.stringify(retrievalOutput, null, 2);
      } else {
        // Fallback: Show basic metadata
        output = JSON.stringify(
          {
            type: "retrieval",
            latency_ms: span.retrieval.latency_ms,
            k: span.retrieval.k || span.retrieval.top_k,
          },
          null,
          2,
        );
      }
    }
  } else if (span.embedding) {
    // Input: Embedding input text or metadata
    const embeddingInput: any = {
      model: span.embedding.model,
    };
    if (span.embedding.input_text) {
      embeddingInput.input_text = span.embedding.input_text;
    } else if (span.embedding.input_hash) {
      embeddingInput.input_hash = span.embedding.input_hash;
    }
    if (span.embedding.encoding_formats) {
      embeddingInput.encoding_formats = span.embedding.encoding_formats;
    }
    input = JSON.stringify(embeddingInput, null, 2);

    // Output: Embedding results
    const embeddingOutput: any = {
      dimension_count: span.embedding.dimension_count,
      input_tokens: span.embedding.input_tokens,
      output_tokens: span.embedding.output_tokens,
      latency_ms: span.embedding.latency_ms,
    };
    if (span.embedding.cost !== null && span.embedding.cost !== undefined) {
      embeddingOutput.cost = span.embedding.cost;
    }
    if (span.embedding.embeddings) {
      // Show summary if embeddings are available
      embeddingOutput.embeddings_count = span.embedding.embeddings.length;
      embeddingOutput.embeddings_preview = span.embedding.embeddings
        .slice(0, 3)
        .map(
          (emb: number[]) =>
            `[${emb.slice(0, 5).join(", ")}, ...] (${emb.length} dims)`,
        );
    } else if (span.embedding.embeddings_hash) {
      embeddingOutput.embeddings_hash = span.embedding.embeddings_hash;
    }
    output = JSON.stringify(embeddingOutput, null, 2);
  } else if (span.output) {
    if (
      span.output.final_output !== null &&
      span.output.final_output !== undefined
    ) {
      output =
        typeof span.output.final_output === "string"
          ? span.output.final_output
          : JSON.stringify(span.output.final_output, null, 2);
    }
  }

  // Create raw JSON representation of the span (for RAW tab)
  // Include all span data in a clean format
  const rawSpanData = {
    id: span.span_id || span.id,
    parentId: span.parent_span_id,
    name: span.name,
    startTime: span.start_time,
    endTime: span.end_time,
    duration_ms: span.duration_ms,
    type: category,
    status,
    ...(span.llm_call && { llm_call: span.llm_call }),
    ...(span.tool_call && { tool_call: span.tool_call }),
    ...(span.retrieval && { retrieval: span.retrieval }),
    ...(span.output && { output: span.output }),
    ...(span.trace_start && { trace_start: span.trace_start }),
    ...(span.trace_end && { trace_end: span.trace_end }),
    ...(span.metadata && { metadata: span.metadata }),
    attributes,
  };
  const raw = JSON.stringify(rawSpanData, null, 2);

  // Convert attributes object to array format (required by DetailsViewAttributesTab)
  const attributesArray = convertAttributesToArray(attributes);

  // Recursively transform children first to calculate error count
  const transformedChildren = span.children?.map(transformSpan) || [];

  // Calculate error count (errors in this span + errors in children)
  let errorCount = errorInfo ? 1 : 0;
  for (const child of transformedChildren) {
    if (child.errorCount) {
      errorCount += child.errorCount;
    } else if (child.errorInfo) {
      errorCount += 1;
    }
  }

  // Add error attributes to attributes for backward compatibility
  if (errorInfo) {
    attributes["error.type"] = errorInfo.type;
    attributes["error.message"] = errorInfo.fullMessage;
    if (errorInfo.stackTrace) {
      attributes["error.stack_trace"] = errorInfo.stackTrace;
    }
    if (errorInfo.context) {
      attributes["error.context"] = errorInfo.context;
    }
  }

  // Reconvert attributes array since we added error fields
  const finalAttributesArray = convertAttributesToArray(attributes);

  // CRITICAL FIX: Enhance title for LLM calls with model name
  // If span name is "LLM Call: unknown" or similar, extract model from llm_call
  let enhancedTitle = span.name;
  if (
    span.llm_call &&
    (span.name.includes("unknown") ||
      !span.name.includes(span.llm_call.model || ""))
  ) {
    const modelName =
      span.llm_call.model || span.llm_call.response_model || "unknown";
    enhancedTitle = `LLM Call: ${modelName}`;
  }

  // Enhance title for feedback spans with icons
  // CRITICAL FIX: Only replace title if this is a pure feedback span
  // If span has other data (like LLM call), append feedback info instead
  if (span.feedback || span.feedback_metadata || span.feedback_type) {
    const feedback = span.feedback || {
      type: span.feedback_metadata?.type || span.feedback_type,
      outcome: span.feedback_metadata?.outcome || span.feedback_outcome,
      rating: span.feedback_metadata?.rating || span.feedback_rating,
      comment: span.feedback_metadata?.comment || span.feedback_comment,
    };

    const feedbackType = feedback.type || "unknown";
    const feedbackTypeLabel =
      feedbackType.charAt(0).toUpperCase() + feedbackType.slice(1);

    // Add emoji icon based on feedback type
    let icon = "";
    if (feedbackType === "like") {
      icon = "👍 ";
    } else if (feedbackType === "dislike") {
      icon = "👎 ";
    } else if (feedbackType === "rating") {
      icon = "⭐ ";
    } else if (feedbackType === "correction") {
      icon = "✏️ ";
    }

    // Check if this is a pure feedback span or has other data (like LLM call, tool call, etc.)
    const isPureFeedbackSpan =
      (span.type === "feedback" || span.event_type === "feedback") &&
      !span.llm_call &&
      !span.tool_call &&
      !span.retrieval &&
      !span.embedding;

    if (isPureFeedbackSpan) {
      // Pure feedback span: replace title
      enhancedTitle = `${icon}${feedbackTypeLabel} Feedback`;
      if (feedback.comment) {
        enhancedTitle += " 💬";
      }
      if (feedback.rating !== null && feedback.rating !== undefined) {
        enhancedTitle += ` (${feedback.rating}/5)`;
      }
    } else {
      // Span has other data (LLM call, tool call, etc.): append feedback info
      let feedbackSuffix = ` ${icon}`;
      if (feedback.comment) {
        feedbackSuffix += " 💬";
      }
      if (feedback.rating !== null && feedback.rating !== undefined) {
        feedbackSuffix += ` ${feedback.rating}/5`;
      }
      enhancedTitle = `${enhancedTitle}${feedbackSuffix}`;
    }
  }

  // Build TraceSpan object
  // Note: Agent-prism components expect 'title' not 'name', and startTime/endTime as numbers
  const traceSpan: AgentPrismTraceSpan = {
    id: span.span_id || span.id,
    parentId: span.parent_span_id,
    name: enhancedTitle, // Use enhanced title (includes model name for LLM calls)
    title: enhancedTitle, // Components use this field - enhanced with icons for feedback and model names
    startTime, // Number (Unix ms) - components accept this format
    endTime, // Number (Unix ms) - components accept this format
    duration: span.duration_ms,
    attributes: finalAttributesArray, // Array format required by DetailsViewAttributesTab
    type: category, // Set the type field for SpanBadge (valid TraceSpanCategory)
    status, // Status for status badge
    tokensCount: tokensCount !== null ? tokensCount : undefined, // Optional tokens count
    cost: cost !== null ? cost : undefined, // Optional cost
    input, // Input for In/Out tab
    output, // Output for In/Out tab
    raw, // Raw JSON representation for RAW tab
    errorInfo, // Error information for this span
    errorCount: errorCount > 0 ? errorCount : undefined, // Error count including children
    children: transformedChildren,
    // Add direct fields for frontend access (in addition to attributes)
    ...(span.llm_call && {
      llm_call: span.llm_call,
      system_instructions: span.llm_call.system_instructions || null,
    }),
    ...(span.available_tools && { available_tools: span.available_tools }),
    ...(span.executed_tools && { executed_tools: span.executed_tools }),
    ...(span.attempted_tool_calls && {
      attempted_tool_calls: span.attempted_tool_calls,
    }),
    // TRACE_TREE_VIEW_SPEC: Pass through signals for observa-app to show (e.g. medium_latency, tool_error)
    ...((span as any).signals && (span as any).signals.length > 0
      ? { signals: (span as any).signals }
      : {}),
  };

  return traceSpan;
}

/**
 * PHASE 2: Transform treeView attempt node to AgentPrismTraceSpan (Langfuse-style attempt grouping)
 */
function transformAttemptNodeToSpan(attemptNode: {
  id: string;
  name: string;
  status?: "failed" | "success";
  start_time?: string;
  end_time?: string;
  duration_ms?: number;
  children?: ObservaSpan[];
}): AgentPrismTraceSpan {
  const startTime = attemptNode.start_time
    ? new Date(attemptNode.start_time).getTime()
    : Date.now();
  const endTime = attemptNode.end_time
    ? new Date(attemptNode.end_time).getTime()
    : startTime;
  const duration =
    attemptNode.duration_ms ?? (endTime > startTime ? endTime - startTime : 0);
  const children = (attemptNode.children || []).map(transformSpan);
  const isFailed = attemptNode.status === "failed";

  return {
    id: attemptNode.id,
    parentId: null,
    name: attemptNode.name,
    title: attemptNode.name,
    startTime,
    endTime,
    duration,
    attributes: [],
    type: "span",
    status: isFailed ? "error" : "success",
    input: undefined,
    output: undefined,
    raw: JSON.stringify(
      { attempt: attemptNode.name, status: attemptNode.status },
      null,
      2,
    ),
    children,
    ...(isFailed && {
      errorInfo: {
        type: "attempt_failed",
        message: "This attempt failed",
        fullMessage: attemptNode.name,
      },
    }),
  };
}

/**
 * Convert signals to badges for agent-prism
 */
function signalsToBadges(signals?: any[]): Array<{
  label: string;
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "warning"
    | "error";
}> {
  if (!signals || signals.length === 0) {
    return [];
  }

  return signals.map((signal) => {
    const severity = signal.severity || "medium";
    let variant:
      | "default"
      | "secondary"
      | "destructive"
      | "outline"
      | "warning"
      | "error" = "default";

    // Map severity to badge variant
    if (severity === "high") {
      variant = "error";
    } else if (severity === "medium") {
      variant = "warning";
    } else if (severity === "low") {
      variant = "secondary";
    }

    return {
      label: signal.signal_type || "Issue",
      variant,
    };
  });
}

/**
 * Count all spans recursively (including nested children)
 */
function countAllSpansRecursively(spans: AgentPrismTraceSpan[]): number {
  let count = spans.length;
  for (const span of spans) {
    if (span.children && span.children.length > 0) {
      count += countAllSpansRecursively(span.children);
    }
  }
  return count;
}

/**
 * Calculate error summary from spans recursively
 */
function calculateErrorSummary(spans: AgentPrismTraceSpan[]): ErrorSummary {
  const errorTypes: Record<string, number> = {};
  const errorSpans: string[] = [];

  function traverseSpans(spans: AgentPrismTraceSpan[]) {
    for (const span of spans) {
      // Count spans with errorInfo OR status="error"
      // This ensures we catch all errors even if errorInfo wasn't set for some reason
      if (span.errorInfo || span.status === "error") {
        errorSpans.push(span.id);
        if (span.errorInfo) {
          const errorType = span.errorInfo.type || "error";
          errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
        } else {
          // If status is error but no errorInfo, use a default type
          errorTypes["error"] = (errorTypes["error"] || 0) + 1;
        }
      }

      if (span.children && span.children.length > 0) {
        traverseSpans(span.children);
      }
    }
  }

  traverseSpans(spans);

  const totalErrors = errorSpans.length;

  return {
    totalErrors,
    errorTypes,
    errorSpans,
    hasErrors: totalErrors > 0,
  };
}

/**
 * Main adapter function: Convert Observa trace format to Agent-Prism format
 *
 * @param observaTrace - Trace data from TraceQueryService.getTraceDetailTree
 * @returns Agent-Prism formatted trace data
 */
export function adaptObservaTraceToAgentPrism(
  observaTrace: ObservaTraceData,
): AgentPrismTraceData {
  const { summary, spans, signals } = observaTrace;

  // Filter to only show the main trace span (isRootTrace = true) if it exists
  // This prevents orphaned spans or multiple root spans from appearing at the top level
  let mainSpans = spans;
  const rootTraceSpan = spans.find(
    (span) => (span as any).isRootTrace === true,
  );

  if (rootTraceSpan) {
    // Only show the main trace span
    mainSpans = [rootTraceSpan];
  } else if (spans.length > 1) {
    // If no isRootTrace flag, use the span with the longest duration as the main trace
    // This handles cases where the flag wasn't set but we still want a single root
    const rootSpans = spans.filter((span) => !span.parent_span_id);
    if (rootSpans.length > 0) {
      // Find the span with the longest duration (most likely the main trace)
      const mainSpan = rootSpans.reduce((prev, current) =>
        current.duration_ms > prev.duration_ms ? current : prev,
      );
      mainSpans = [mainSpan];
    }
  }

  // PHASE 2: Use treeView when multiple attempts exist (Langfuse-style attempt grouping)
  const treeView = (observaTrace as ObservaTraceData).treeView;
  let transformedSpans: AgentPrismTraceSpan[];
  if (
    treeView?.children &&
    Array.isArray(treeView.children) &&
    treeView.children.length > 1
  ) {
    transformedSpans = treeView.children.map((attemptNode: any) =>
      transformAttemptNodeToSpan(attemptNode),
    );
  } else {
    transformedSpans = mainSpans.map(transformSpan);
  }

  // PHASE 2: Inject trace context (session_id, user_id, environment) into root span for context header
  const rootSpan = transformedSpans[0];
  if (rootSpan && observaTrace.summary) {
    const ctxAttrs: AgentPrismTraceSpanAttribute[] = [];
    if (observaTrace.summary.session_id) {
      ctxAttrs.push({
        key: "observa.session_id",
        value: { stringValue: observaTrace.summary.session_id },
      });
    }
    if (observaTrace.summary.user_id) {
      ctxAttrs.push({
        key: "observa.user_id",
        value: { stringValue: observaTrace.summary.user_id },
      });
    }
    if (observaTrace.summary.environment) {
      ctxAttrs.push({
        key: "observa.environment",
        value: { stringValue: observaTrace.summary.environment },
      });
    }
    if (ctxAttrs.length > 0) {
      rootSpan.attributes = [...(rootSpan.attributes || []), ...ctxAttrs];
    }
  }

  // Count all spans recursively (including nested children)
  const totalSpansCount = countAllSpansRecursively(transformedSpans);

  // Calculate error summary
  const errorSummary = calculateErrorSummary(transformedSpans);

  // Transform summary to TraceRecord
  const traceRecord: AgentPrismTraceRecord = {
    id: summary.trace_id,
    name: summary.query || "Trace", // Use query as trace name
    spansCount: totalSpansCount, // Count all spans including nested children
    durationMs: summary.total_latency_ms || 0,
    agentDescription: summary.model || "", // Model name as agent description
    input: summary.query ?? null,
    output: summary.response ?? null,
    session_id: summary.session_id ?? null,
    user_id: summary.user_id ?? null,
    environment: summary.environment ?? null,
  };

  // Convert signals to badges
  let badges = signalsToBadges(signals);

  // TRACE_TREE_VIEW_SPEC: Add attempt/failure badges from treeView for problem-first UX
  const attemptCount =
    observaTrace.summary?.attempt_count ?? treeView?.summary?.attempts;
  const failureCount =
    observaTrace.summary?.failure_count ?? treeView?.summary?.failures;
  if (typeof attemptCount === "number" && attemptCount > 0) {
    badges = [
      ...badges,
      {
        label: `${attemptCount} attempt${attemptCount !== 1 ? "s" : ""}`,
        variant: "default" as const,
      },
    ];
  }
  if (typeof failureCount === "number" && failureCount > 0) {
    badges = [
      ...badges,
      {
        label: `${failureCount} failure${failureCount !== 1 ? "s" : ""}`,
        variant: "destructive" as const,
      },
    ];
  }
  // When trace had failures but produced output, clarify that retry succeeded
  if (
    typeof failureCount === "number" &&
    failureCount > 0 &&
    (observaTrace.summary?.response ?? traceRecord.output)
  ) {
    badges = [
      ...badges,
      {
        label: "Succeeded after retry",
        variant: "default" as const,
      },
    ];
  }

  return {
    traceRecord,
    spans: transformedSpans,
    badges: badges.length > 0 ? badges : undefined,
    errorSummary: errorSummary.hasErrors ? errorSummary : undefined,
  };
}

/**
 * Service class for agent-prism adapter operations
 */
export class AgentPrismAdapterService {
  /**
   * Transform Observa trace data to agent-prism format
   */
  static adapt(observaTrace: ObservaTraceData): AgentPrismTraceData {
    return adaptObservaTraceToAgentPrism(observaTrace);
  }

  /**
   * Transform multiple traces (for trace list view)
   */
  static adaptTraces(traces: ObservaTraceData[]): AgentPrismTraceData[] {
    return traces.map(adaptObservaTraceToAgentPrism);
  }
}

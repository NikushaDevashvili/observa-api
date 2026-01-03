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
  };
  tool_call?: {
    tool_name?: string;
    args?: any;
    result?: any;
    latency_ms?: number | null;
    result_status?: string;
    error_message?: string | null;
  };
  retrieval?: {
    k?: number | null;
    top_k?: number | null;
    latency_ms?: number | null;
    retrieval_context_ids?: string[] | null;
    similarity_scores?: number[] | null;
    retrieval_context?: string | null;
  };
  output?: {
    final_output?: string | null;
    output_length?: number | null;
  };
  error?: {
    error_type?: string | null;
    error_message?: string | null;
    stack_trace?: string | null;
    context?: Record<string, any> | null;
  };
  type?: string;
  event_type?: string;
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
      error
    );
    return Date.now();
  }
}

/**
 * Convert attributes object to agent-prism attribute array format
 * Transforms Record<string, any> to AgentPrismTraceSpanAttribute[]
 */
function convertAttributesToArray(
  attributesObj: Record<string, any>
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
 * Transform a single Observa span to Agent-Prism TraceSpan
 */
function transformSpan(span: ObservaSpan): AgentPrismTraceSpan {
  const startTime = isoToUnixMs(span.start_time);
  const endTime = isoToUnixMs(span.end_time);

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

    // OpenTelemetry GenAI semantic conventions
    if (llm.model) attributes["gen_ai.request.model"] = llm.model;
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
      attributes["gen_ai.response.finish_reasons"] = llm.finish_reason;
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
  }

  // Add tool call attributes
  if (span.tool_call) {
    const tool = span.tool_call;
    if (tool.tool_name) attributes["tool.call.name"] = tool.tool_name;
    if (tool.args !== undefined) attributes["tool.call.args"] = tool.args;
    if (tool.result !== undefined) attributes["tool.call.result"] = tool.result;
    if (tool.latency_ms !== null && tool.latency_ms !== undefined) {
      attributes["tool.call.latency_ms"] = tool.latency_ms;
    }
    if (tool.result_status) {
      attributes["tool.call.result_status"] = tool.result_status;
    }
    if (tool.error_message) {
      attributes["tool.call.error_message"] = tool.error_message;
    }
  }

  // Add retrieval attributes
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

  const spanName = span.name || "";
  const spanNameLower = spanName.toLowerCase();

  // Check in priority order (most specific first)
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
    span.retrieval ||
    span.event_type === "retrieval" ||
    span.type === "retrieval"
  ) {
    category = "retrieval";
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

  // Determine status from span data and extract error information
  let status: "success" | "error" | "pending" | "warning" = "success";
  let errorInfo: SpanErrorInfo | undefined;
  
  // Check for error events associated with this span
  const errorEvent = span.events?.find((e: any) => e.event_type === "error");
  const hasErrorEvent = !!errorEvent;
  
  // Extract error information
  if (span.error || errorEvent) {
    status = "error";
    const errorData = span.error || errorEvent?.attributes?.error;
    
    if (errorData) {
      const errorMessage = errorData.error_message || "Unknown error";
      const errorType = errorData.error_type || "error";
      
      errorInfo = {
        type: errorType,
        message: errorMessage.length > 100 ? errorMessage.substring(0, 100) + "..." : errorMessage,
        fullMessage: errorMessage,
        stackTrace: errorData.stack_trace || undefined,
        context: errorData.context || undefined,
        timestamp: errorEvent?.timestamp || span.start_time || undefined,
      };
    }
  } else if (span.tool_call?.result_status === "error" || span.tool_call?.result_status === "timeout") {
    status = "error";
    const errorMessage = span.tool_call.error_message || `Tool call failed with status: ${span.tool_call.result_status}`;
    errorInfo = {
      type: span.tool_call.result_status === "timeout" ? "timeout_error" : "tool_error",
      message: errorMessage.length > 100 ? errorMessage.substring(0, 100) + "..." : errorMessage,
      fullMessage: errorMessage,
      timestamp: span.start_time,
    };
  } else if (span.tool_call?.error_message) {
    status = "error";
    const errorMessage = span.tool_call.error_message;
    errorInfo = {
      type: "tool_error",
      message: errorMessage.length > 100 ? errorMessage.substring(0, 100) + "..." : errorMessage,
      fullMessage: errorMessage,
      timestamp: span.start_time,
    };
  } else if (span.llm_call?.finish_reason === "error") {
    status = "error";
    errorInfo = {
      type: "llm_error",
      message: "LLM call finished with error",
      fullMessage: "LLM call finished with error status",
      timestamp: span.start_time,
    };
  } else if (span.metadata?.status && (span.metadata.status < 200 || span.metadata.status >= 400)) {
    // Check HTTP status codes for errors (if stored in metadata)
    status = "error";
    errorInfo = {
      type: "http_error",
      message: `HTTP ${span.metadata.status} error`,
      fullMessage: `HTTP error with status code: ${span.metadata.status}`,
      timestamp: span.start_time,
    };
  }

  // Extract tokensCount and cost for badges
  const tokensCount = span.llm_call?.total_tokens || null;
  const cost = span.llm_call?.cost || null;

  // Extract input/output for In/Out tab
  // For LLM calls, use llm_call input/output
  // For tool calls, use tool_call args/result
  // For other spans, use attributes or metadata
  let input: string | undefined;
  let output: string | undefined;

  if (span.llm_call) {
    if (span.llm_call.input !== null && span.llm_call.input !== undefined) {
      input =
        typeof span.llm_call.input === "string"
          ? span.llm_call.input
          : JSON.stringify(span.llm_call.input, null, 2);
    }
    if (span.llm_call.output !== null && span.llm_call.output !== undefined) {
      output =
        typeof span.llm_call.output === "string"
          ? span.llm_call.output
          : JSON.stringify(span.llm_call.output, null, 2);
    }
  } else if (span.tool_call) {
    if (span.tool_call.args !== null && span.tool_call.args !== undefined) {
      input =
        typeof span.tool_call.args === "string"
          ? span.tool_call.args
          : JSON.stringify(span.tool_call.args, null, 2);
    }
    if (span.tool_call.result !== null && span.tool_call.result !== undefined) {
      output =
        typeof span.tool_call.result === "string"
          ? span.tool_call.result
          : JSON.stringify(span.tool_call.result, null, 2);
    }
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
  
  // Build TraceSpan object
  // Note: Agent-prism components expect 'title' not 'name', and startTime/endTime as numbers
  const traceSpan: AgentPrismTraceSpan = {
    id: span.span_id || span.id,
    parentId: span.parent_span_id,
    name: span.name, // Keep name for compatibility
    title: span.name, // Components use this field
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
  };

  return traceSpan;
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
  observaTrace: ObservaTraceData
): AgentPrismTraceData {
  const { summary, spans, signals } = observaTrace;

  // Transform all spans (recursive transformation handles children)
  const transformedSpans = spans.map(transformSpan);

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
  };

  // Convert signals to badges
  const badges = signalsToBadges(signals);

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

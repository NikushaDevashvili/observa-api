/**
 * Trace Query Service
 *
 * Handles querying traces using the new canonical events architecture.
 * Queries canonical events from Tinybird and merges with analysis results from Postgres.
 */

import { TinybirdRepository } from "./tinybirdRepository.js";
import { query } from "../db/client.js";
import { CanonicalEvent } from "../types/events.js";

export interface TraceSummary {
  trace_id: string;
  tenant_id: string;
  project_id: string;
  timestamp: string;
  analyzed_at?: string | null;

  // Aggregated from events
  model?: string | null;
  latency_ms?: number | null;
  tokens_total?: number | null;
  tokens_prompt?: number | null;
  tokens_completion?: number | null;

  // From analysis_results (if available)
  is_hallucination?: boolean | null;
  hallucination_confidence?: number | null;
  has_context_drop?: boolean;
  has_faithfulness_issue?: boolean;
  has_model_drift?: boolean;
  has_cost_anomaly?: boolean;
  context_relevance_score?: string | null;
  answer_faithfulness_score?: number | null;

  // Metadata
  conversation_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  environment?: string | null;
}

export class TraceQueryService {
  /**
   * Get trace summaries for a tenant/project
   *
   * NOTE: Currently falls back to analysis_results table for backward compatibility.
   * TODO: Migrate to canonical events from Tinybird once data migration is complete.
   */
  static async getTraces(
    tenantId: string,
    projectId?: string | null,
    limit: number = 50,
    offset: number = 0,
    issueType?: string
  ): Promise<{ traces: TraceSummary[]; total: number }> {
    try {
      // For now, query from analysis_results table (backward compatibility)
      // TODO: Once canonical events migration is complete, query from Tinybird instead
      let whereClause = `WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      // Filter by issue type
      if (issueType) {
        switch (issueType) {
          case "hallucination":
            whereClause += ` AND is_hallucination = true`;
            break;
          case "context_drop":
            whereClause += ` AND has_context_drop = true`;
            break;
          case "faithfulness":
            whereClause += ` AND has_faithfulness_issue = true`;
            break;
          case "drift":
            whereClause += ` AND has_model_drift = true`;
            break;
          case "cost_anomaly":
            whereClause += ` AND has_cost_anomaly = true`;
            break;
        }
      }

      // Get traces from analysis_results
      const traces = await query(
        `SELECT 
          trace_id,
          tenant_id,
          project_id,
          analyzed_at,
          timestamp,
          model,
          tokens_total,
          tokens_prompt,
          tokens_completion,
          latency_ms,
          is_hallucination,
          hallucination_confidence,
          has_context_drop,
          has_faithfulness_issue,
          has_model_drift,
          has_cost_anomaly,
          context_relevance_score,
          answer_faithfulness_score,
          conversation_id,
          session_id,
          user_id,
          environment
        FROM analysis_results
        ${whereClause}
        ORDER BY COALESCE(timestamp, analyzed_at) DESC NULLS LAST
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      // Get total count
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM analysis_results ${whereClause}`,
        params
      );
      const total = parseInt(countResult[0]?.count || "0", 10);

      return {
        traces: traces.map((t: any) => ({
          trace_id: t.trace_id,
          tenant_id: t.tenant_id,
          project_id: t.project_id,
          timestamp: t.timestamp?.toISOString() || new Date().toISOString(),
          analyzed_at: t.analyzed_at?.toISOString() || null,
          model: t.model,
          latency_ms: t.latency_ms,
          tokens_total: t.tokens_total,
          tokens_prompt: t.tokens_prompt,
          tokens_completion: t.tokens_completion,
          is_hallucination: t.is_hallucination,
          hallucination_confidence: t.hallucination_confidence,
          has_context_drop: t.has_context_drop || false,
          has_faithfulness_issue: t.has_faithfulness_issue || false,
          has_model_drift: t.has_model_drift || false,
          has_cost_anomaly: t.has_cost_anomaly || false,
          context_relevance_score: t.context_relevance_score,
          answer_faithfulness_score: t.answer_faithfulness_score,
          conversation_id: t.conversation_id,
          session_id: t.session_id,
          user_id: t.user_id,
          environment: t.environment,
        })) as TraceSummary[],
        total,
      };
    } catch (error) {
      console.error("[TraceQueryService] Error querying traces:", error);
      throw error;
    }
  }

  /**
   * Get a single trace detail
   *
   * NOTE: Currently queries from analysis_results table for backward compatibility.
   * TODO: Migrate to canonical events from Tinybird once data migration is complete.
   */
  static async getTraceDetail(
    traceId: string,
    tenantId: string,
    projectId?: string | null
  ): Promise<any | null> {
    try {
      let whereClause = `WHERE trace_id = $1 AND tenant_id = $2`;
      const params: any[] = [traceId, tenantId];

      if (projectId) {
        whereClause += ` AND project_id = $3`;
        params.push(projectId);
      }

      const rows = await query(
        `SELECT * FROM analysis_results ${whereClause} LIMIT 1`,
        params
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      console.error("[TraceQueryService] Error querying trace detail:", error);
      throw error;
    }
  }

  /**
   * Get trace detail with tree structure (spans and events)
   * Returns structured data for waterfall/timeline view
   * 
   * First tries to get canonical events from Tinybird for full hierarchical structure.
   * Falls back to analysis_results for backward compatibility.
   */
  static async getTraceDetailTree(
    traceId: string,
    tenantId: string,
    projectId?: string | null
  ): Promise<any | null> {
    try {
      // Try to get canonical events from Tinybird first
      const { TinybirdRepository } = await import("./tinybirdRepository.js");
      
      let canonicalEvents: any[] = [];
      try {
        const eventsData: any = await TinybirdRepository.getTraceEvents(
          traceId,
          tenantId,
          projectId || null
        );
        
        // Tinybird returns data in format: { data: [...], meta: [...] }
        if (eventsData && Array.isArray(eventsData)) {
          canonicalEvents = eventsData;
        } else if (eventsData && typeof eventsData === 'object' && Array.isArray(eventsData.data)) {
          canonicalEvents = eventsData.data;
        }
        
        if (canonicalEvents.length > 0) {
          console.log(
            `[TraceQueryService] ✅ Found ${canonicalEvents.length} canonical events for trace ${traceId}`
          );
        } else {
          console.log(
            `[TraceQueryService] ⚠️  No canonical events found in Tinybird for trace ${traceId}, falling back to analysis_results`
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[TraceQueryService] ❌ Error fetching canonical events from Tinybird for trace ${traceId}:`,
          errorMessage
        );
        console.log(
          `[TraceQueryService] Falling back to analysis_results table`
        );
      }

      // If we have canonical events, build tree from them
      if (canonicalEvents.length > 0) {
        return await this.buildTreeFromCanonicalEvents(
          canonicalEvents,
          traceId,
          tenantId,
          projectId || null
        );
      }

      // Fallback: Build from analysis_results (backward compatibility)
      let traceData = await this.getTraceDetail(traceId, tenantId, projectId);
      
      if (!traceData) {
        return null;
      }

      // Build tree structure from the trace data
      // For now, we have one span (the main trace), but structure supports multiple spans
      const rootSpan = {
        span_id: traceData.span_id || traceData.trace_id,
        parent_span_id: traceData.parent_span_id || null,
        name: traceData.query ? "LLM Call" : "Trace",
        start_time: traceData.timestamp || traceData.analyzed_at,
        end_time: traceData.timestamp ? 
          new Date(new Date(traceData.timestamp).getTime() + (traceData.latency_ms || 0)).toISOString() :
          traceData.analyzed_at,
        duration_ms: traceData.latency_ms || 0,
        events: [] as any[],
        metadata: {
          model: traceData.model,
          environment: traceData.environment,
          conversation_id: traceData.conversation_id,
          session_id: traceData.session_id,
          user_id: traceData.user_id,
          message_index: traceData.message_index,
          status: traceData.status,
          status_text: traceData.status_text,
          finish_reason: traceData.finish_reason,
          response_id: traceData.response_id,
          system_fingerprint: traceData.system_fingerprint,
          metadata: traceData.metadata_json ? JSON.parse(traceData.metadata_json) : null,
          headers: traceData.headers_json ? JSON.parse(traceData.headers_json) : null,
        },
      };

      // Add LLM call event if model/query/response present
      if (traceData.model || traceData.query || traceData.response) {
        rootSpan.events.push({
          event_type: "llm_call",
          timestamp: traceData.timestamp || traceData.analyzed_at,
          attributes: {
            llm_call: {
              model: traceData.model,
              input: traceData.query,
              output: traceData.response,
              input_tokens: traceData.tokens_prompt,
              output_tokens: traceData.tokens_completion,
              total_tokens: traceData.tokens_total,
              latency_ms: traceData.latency_ms,
              time_to_first_token_ms: traceData.time_to_first_token_ms,
              streaming_duration_ms: traceData.streaming_duration_ms,
              finish_reason: traceData.finish_reason,
              response_id: traceData.response_id,
              system_fingerprint: traceData.system_fingerprint,
              // Include context if available
              context: traceData.context || null,
            },
          },
        });
      }

      // Add retrieval event if context present
      if (traceData.context) {
        rootSpan.events.push({
          event_type: "retrieval",
          timestamp: traceData.timestamp || traceData.analyzed_at,
          attributes: {
            retrieval: {
              retrieval_context_ids: null,
              retrieval_context: traceData.context, // Include actual context
              context_length: traceData.context.length,
              latency_ms: 0, // Unknown from analysis_results
            },
          },
        });
      }

      // Add output event if response present
      if (traceData.response) {
        rootSpan.events.push({
          event_type: "output",
          timestamp: traceData.timestamp || traceData.analyzed_at,
          attributes: {
            output: {
              final_output: traceData.response,
              output_length: traceData.response_length,
            },
          },
        });
      }

      // Build summary metadata
      const summary = {
        trace_id: traceData.trace_id,
        tenant_id: traceData.tenant_id,
        project_id: traceData.project_id,
        environment: traceData.environment,
        conversation_id: traceData.conversation_id,
        session_id: traceData.session_id,
        user_id: traceData.user_id,
        message_index: traceData.message_index,
        start_time: traceData.timestamp || traceData.analyzed_at,
        end_time: traceData.timestamp ?
          new Date(new Date(traceData.timestamp).getTime() + (traceData.latency_ms || 0)).toISOString() :
          traceData.analyzed_at,
        total_latency_ms: traceData.latency_ms || 0,
        total_tokens: traceData.tokens_total || 0,
        total_cost: null, // Not in analysis_results
        model: traceData.model,
        status: traceData.status,
        status_text: traceData.status_text,
        finish_reason: traceData.finish_reason,
        response_length: traceData.response_length,
        time_to_first_token_ms: traceData.time_to_first_token_ms,
        streaming_duration_ms: traceData.streaming_duration_ms,
        analyzed_at: traceData.analyzed_at?.toISOString() || null,
      };

      // Build analysis/signals
      const signals = [];
      if (traceData.is_hallucination === true) {
        signals.push({
          signal_type: "hallucination",
          severity: "high",
          confidence: traceData.hallucination_confidence,
          reasoning: traceData.hallucination_reasoning,
        });
      }
      if (traceData.has_context_drop) {
        signals.push({
          signal_type: "context_drop",
          severity: "medium",
          score: traceData.context_relevance_score,
        });
      }
      if (traceData.has_faithfulness_issue) {
        signals.push({
          signal_type: "faithfulness",
          severity: "medium",
          score: traceData.answer_faithfulness_score,
        });
      }
      if (traceData.has_model_drift) {
        signals.push({
          signal_type: "model_drift",
          severity: "low",
          score: traceData.drift_score,
        });
      }
      if (traceData.has_cost_anomaly) {
        signals.push({
          signal_type: "cost_anomaly",
          severity: "medium",
          score: traceData.anomaly_score,
        });
      }

      return {
        summary,
        spans: [rootSpan],
        signals,
        // Legacy analysis data for backward compatibility
        analysis: {
          isHallucination: traceData.is_hallucination,
          hallucinationConfidence: traceData.hallucination_confidence,
          hallucinationReasoning: traceData.hallucination_reasoning,
          qualityScore: traceData.quality_score,
          coherenceScore: traceData.coherence_score,
          relevanceScore: traceData.relevance_score,
          helpfulnessScore: traceData.helpfulness_score,
          hasContextDrop: traceData.has_context_drop,
          hasModelDrift: traceData.has_model_drift,
          hasPromptInjection: traceData.has_prompt_injection,
          hasContextOverflow: traceData.has_context_overflow,
          hasFaithfulnessIssue: traceData.has_faithfulness_issue,
          hasCostAnomaly: traceData.has_cost_anomaly,
          hasLatencyAnomaly: traceData.has_latency_anomaly,
          hasQualityDegradation: traceData.has_quality_degradation,
          contextRelevanceScore: traceData.context_relevance_score,
          answerFaithfulnessScore: traceData.answer_faithfulness_score,
          driftScore: traceData.drift_score,
          anomalyScore: traceData.anomaly_score,
          analysisModel: traceData.analysis_model,
          analysisVersion: traceData.analysis_version,
          processingTimeMs: traceData.processing_time_ms,
        },
      };
    } catch (error) {
      console.error("[TraceQueryService] Error querying trace detail tree:", error);
      throw error;
    }
  }

  /**
   * Build hierarchical tree structure from canonical events
   * Creates spans with parent-child relationships and attaches events to spans
   */
  private static async buildTreeFromCanonicalEvents(
    events: any[],
    traceId: string,
    tenantId: string,
    projectId: string | null
  ): Promise<any> {
    if (events.length === 0) {
      return null;
    }

    // Parse events and extract attributes
    const parsedEvents = events.map((event: any) => {
      let attributes = {};
      try {
        if (typeof event.attributes_json === 'string') {
          attributes = JSON.parse(event.attributes_json);
        } else if (event.attributes) {
          attributes = event.attributes;
        }
      } catch (e) {
        console.warn(`[TraceQueryService] Failed to parse attributes for event:`, e);
      }

      return {
        ...event,
        attributes,
      };
    });

    // Find trace_start and trace_end for summary
    const traceStart = parsedEvents.find((e: any) => e.event_type === 'trace_start');
    const traceEnd = parsedEvents.find((e: any) => e.event_type === 'trace_end');
    const llmCall = parsedEvents.find((e: any) => e.event_type === 'llm_call');
    const firstEvent = parsedEvents[0];
    const lastEvent = parsedEvents[parsedEvents.length - 1];

    // Build spans map (span_id -> span object)
    const spansMap = new Map<string, any>();
    const spanEventsMap = new Map<string, any[]>();

    // First pass: create all spans
    // For root span events (parent_span_id === null), create separate spans for each event type
    // This allows the frontend to display and click on each event type separately
    for (const event of parsedEvents) {
      let spanId = event.span_id;
      let parentSpanId = event.parent_span_id;
      
      // If this is a root span event (parent_span_id === null), create a unique span for each event type
      // This makes each event type (retrieval, llm_call, output, etc.) a separate clickable node
      if (event.parent_span_id === null && 
          (event.event_type === 'retrieval' || 
           event.event_type === 'llm_call' || 
           event.event_type === 'tool_call' || 
           event.event_type === 'output')) {
        // Create a unique span ID for this event type
        spanId = `${event.span_id}-${event.event_type}`;
        parentSpanId = event.span_id; // Make the original span_id the parent
      }
      
      if (!spansMap.has(spanId)) {
        // Determine span name based on event type
        let spanName = 'Span';
        if (event.event_type === 'llm_call') {
          const model = event.attributes?.llm_call?.model || 'unknown';
          spanName = `LLM Call: ${model}`;
        } else if (event.event_type === 'tool_call') {
          const toolName = event.attributes?.tool_call?.tool_name || 'unknown';
          spanName = `Tool: ${toolName}`;
        } else if (event.event_type === 'retrieval') {
          spanName = 'Retrieval';
        } else if (event.event_type === 'output') {
          spanName = 'Output';
        } else if (event.parent_span_id === null) {
          spanName = 'Trace';
        }

        spansMap.set(spanId, {
          id: spanId, // Add id field for frontend compatibility
          span_id: spanId,
          parent_span_id: parentSpanId,
          name: spanName,
          start_time: event.timestamp,
          end_time: event.timestamp,
          duration_ms: 0,
          events: [],
          children: [],
          metadata: {
            environment: event.environment,
            conversation_id: event.conversation_id,
            session_id: event.session_id,
            user_id: event.user_id,
          },
        });
        spanEventsMap.set(spanId, []);
      }

      // Add event to span with unique ID
      const eventId = `${spanId}-${event.event_type}-${event.timestamp}`;
      spanEventsMap.get(spanId)!.push({
        id: eventId, // Add unique id for each event
        event_type: event.event_type,
        timestamp: event.timestamp,
        attributes: event.attributes,
        span_id: event.span_id, // Include original span_id for reference
      });
    }

    // Second pass: calculate span durations, attach events, and extract detailed information
    for (const [spanId, span] of spansMap.entries()) {
      const spanEvents = spanEventsMap.get(spanId)!;
      
      // Sort events by timestamp
      spanEvents.sort((a: any, b: any) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Attach events to span with full details
      span.events = spanEvents;

      // Extract detailed information from events based on type
      const llmCallEvent = spanEvents.find((e: any) => e.event_type === 'llm_call');
      const toolCallEvent = spanEvents.find((e: any) => e.event_type === 'tool_call');
      const retrievalEvent = spanEvents.find((e: any) => e.event_type === 'retrieval');
      const outputEvent = spanEvents.find((e: any) => e.event_type === 'output');
      const traceStartEvent = spanEvents.find((e: any) => e.event_type === 'trace_start');
      const traceEndEvent = spanEvents.find((e: any) => e.event_type === 'trace_end');

      // Extract LLM call details
      if (llmCallEvent?.attributes?.llm_call) {
        const llmAttrs = llmCallEvent.attributes.llm_call;
        span.llm_call = {
          model: llmAttrs.model,
          input: llmAttrs.input || null,
          output: llmAttrs.output || null,
          input_tokens: llmAttrs.input_tokens || null,
          output_tokens: llmAttrs.output_tokens || null,
          total_tokens: llmAttrs.total_tokens || null,
          latency_ms: llmAttrs.latency_ms || null,
          time_to_first_token_ms: llmAttrs.time_to_first_token_ms || null,
          streaming_duration_ms: llmAttrs.streaming_duration_ms || null,
          finish_reason: llmAttrs.finish_reason || null,
          response_id: llmAttrs.response_id || null,
          system_fingerprint: llmAttrs.system_fingerprint || null,
          temperature: llmAttrs.temperature || null,
          max_tokens: llmAttrs.max_tokens || null,
          cost: llmAttrs.cost || null,
        };
      }

      // Extract tool call details
      if (toolCallEvent?.attributes?.tool_call) {
        const toolAttrs = toolCallEvent.attributes.tool_call;
        span.tool_call = {
          tool_name: toolAttrs.tool_name,
          args: toolAttrs.args || null,
          result: toolAttrs.result || null,
          result_status: toolAttrs.result_status,
          latency_ms: toolAttrs.latency_ms || null,
          error_message: toolAttrs.error_message || null,
        };
      }

      // Extract retrieval details
      if (retrievalEvent?.attributes?.retrieval) {
        const retrievalAttrs = retrievalEvent.attributes.retrieval;
        span.retrieval = {
          k: retrievalAttrs.k || retrievalAttrs.top_k || null,
          top_k: retrievalAttrs.top_k || retrievalAttrs.k || null,
          latency_ms: retrievalAttrs.latency_ms || null,
          retrieval_context_ids: retrievalAttrs.retrieval_context_ids || null,
          similarity_scores: retrievalAttrs.similarity_scores || null,
          // Note: retrieval_context might be in a different field or redacted
          retrieval_context: retrievalAttrs.retrieval_context || null,
        };
      }

      // Extract output details
      if (outputEvent?.attributes?.output) {
        const outputAttrs = outputEvent.attributes.output;
        span.output = {
          final_output: outputAttrs.final_output || null,
          output_length: outputAttrs.output_length || null,
        };
      }

      // Extract trace lifecycle details
      if (traceStartEvent?.attributes?.trace_start) {
        span.trace_start = {
          name: traceStartEvent.attributes.trace_start.name || null,
          metadata: traceStartEvent.attributes.trace_start.metadata || null,
        };
      }

      if (traceEndEvent?.attributes?.trace_end) {
        span.trace_end = {
          total_latency_ms: traceEndEvent.attributes.trace_end.total_latency_ms || null,
          total_tokens: traceEndEvent.attributes.trace_end.total_tokens || null,
        };
      }

      // Calculate span duration from events
      if (spanEvents.length > 0) {
        const startTime = new Date(spanEvents[0].timestamp);
        const endTime = new Date(spanEvents[spanEvents.length - 1].timestamp);
        
        // For tool_call events, use latency from attributes
        if (toolCallEvent?.attributes?.tool_call?.latency_ms) {
          span.duration_ms = toolCallEvent.attributes.tool_call.latency_ms;
          span.end_time = new Date(startTime.getTime() + span.duration_ms).toISOString();
        } else if (llmCallEvent?.attributes?.llm_call?.latency_ms) {
          span.duration_ms = llmCallEvent.attributes.llm_call.latency_ms;
          span.end_time = new Date(startTime.getTime() + span.duration_ms).toISOString();
        } else if (retrievalEvent?.attributes?.retrieval?.latency_ms) {
          span.duration_ms = retrievalEvent.attributes.retrieval.latency_ms;
          span.end_time = new Date(startTime.getTime() + span.duration_ms).toISOString();
        } else {
          span.duration_ms = endTime.getTime() - startTime.getTime();
          span.end_time = endTime.toISOString();
        }

        span.start_time = startTime.toISOString();
      }

      // Add all event timestamps for timeline visualization
      span.event_timestamps = spanEvents.map((e: any) => ({
        id: e.id,
        event_type: e.event_type,
        timestamp: e.timestamp,
        relative_time_ms: new Date(e.timestamp).getTime() - new Date(span.start_time).getTime(),
      }));

      // Langfuse-style: Flatten ALL data to top level of span for direct access
      // This ensures frontend can access everything directly like span.model, span.input, etc.
      span.hasDetails = true;
      span.selectable = true;
      
      if (span.llm_call) {
        span.type = 'llm_call';
        // Flatten ALL LLM call data to top level (Langfuse approach)
        span.model = span.llm_call.model;
        span.input = span.llm_call.input;
        span.output = span.llm_call.output;
        span.input_tokens = span.llm_call.input_tokens;
        span.output_tokens = span.llm_call.output_tokens;
        span.total_tokens = span.llm_call.total_tokens;
        span.latency_ms = span.llm_call.latency_ms;
        span.time_to_first_token_ms = span.llm_call.time_to_first_token_ms;
        span.streaming_duration_ms = span.llm_call.streaming_duration_ms;
        span.finish_reason = span.llm_call.finish_reason;
        span.response_id = span.llm_call.response_id;
        span.system_fingerprint = span.llm_call.system_fingerprint;
        span.temperature = span.llm_call.temperature;
        span.max_tokens = span.llm_call.max_tokens;
        span.cost = span.llm_call.cost;
        // Keep nested structure for compatibility
        span.details = span.llm_call;
        span.hasInput = !!span.llm_call.input;
        span.hasOutput = !!span.llm_call.output;
      } else if (span.tool_call) {
        span.type = 'tool_call';
        // Flatten ALL tool call data to top level
        span.tool_name = span.tool_call.tool_name;
        span.tool_args = span.tool_call.args;
        span.tool_result = span.tool_call.result;
        span.tool_status = span.tool_call.result_status;
        span.latency_ms = span.tool_call.latency_ms;
        span.error_message = span.tool_call.error_message;
        // Keep nested structure for compatibility
        span.details = span.tool_call;
        span.hasArgs = !!span.tool_call.args;
        span.hasResult = !!span.tool_call.result;
      } else if (span.retrieval) {
        span.type = 'retrieval';
        // Flatten ALL retrieval data to top level
        span.top_k = span.retrieval.top_k;
        span.k = span.retrieval.k;
        span.retrieval_context = span.retrieval.retrieval_context;
        span.retrieval_context_ids = span.retrieval.retrieval_context_ids;
        span.similarity_scores = span.retrieval.similarity_scores;
        span.latency_ms = span.retrieval.latency_ms;
        // Keep nested structure for compatibility
        span.details = span.retrieval;
        span.hasContext = !!span.retrieval.retrieval_context;
      } else if (span.output) {
        span.type = 'output';
        // Flatten ALL output data to top level
        span.final_output = span.output.final_output;
        span.output_length = span.output.output_length;
        // Keep nested structure for compatibility
        span.details = span.output;
        span.hasOutput = !!span.output.final_output;
      } else {
        span.type = 'trace';
        span.details = span.metadata;
        span.hasDetails = span.children && span.children.length > 0;
      }
      
      // Ensure events array has full attribute data for frontend that reads from events
      // Many frontends look for data in span.events[0].attributes.eventType
      span.events = spanEvents.map((e: any) => ({
        ...e,
        // Include full attributes for each event type at top level
        llm_call: e.event_type === 'llm_call' ? e.attributes?.llm_call : undefined,
        tool_call: e.event_type === 'tool_call' ? e.attributes?.tool_call : undefined,
        retrieval: e.event_type === 'retrieval' ? e.attributes?.retrieval : undefined,
        output: e.event_type === 'output' ? e.attributes?.output : undefined,
        // Keep original attributes structure for compatibility
        attributes: e.attributes,
      }));
      
      // For frontends that read from the first event, ensure it has the data
      if (spanEvents.length > 0 && span.events.length > 0) {
        const firstEvent = span.events[0];
        // If this span has type-specific data, ensure first event has it too
        if (span.llm_call && firstEvent.event_type === 'llm_call') {
          firstEvent.llm_call = span.llm_call;
        }
        if (span.tool_call && firstEvent.event_type === 'tool_call') {
          firstEvent.tool_call = span.tool_call;
        }
        if (span.retrieval && firstEvent.event_type === 'retrieval') {
          firstEvent.retrieval = span.retrieval;
        }
        if (span.output && firstEvent.event_type === 'output') {
          firstEvent.output = span.output;
        }
      }
    }

    // Third pass: build parent-child relationships
    // First, ensure we have a root "Trace" span if events had parent_span_id === null
    const originalRootSpanId = parsedEvents.find((e: any) => e.parent_span_id === null)?.span_id;
    if (originalRootSpanId && !spansMap.has(originalRootSpanId)) {
      // Create root trace span
      const firstEvent = parsedEvents[0];
      spansMap.set(originalRootSpanId, {
        id: originalRootSpanId,
        span_id: originalRootSpanId,
        parent_span_id: null,
        name: 'Trace',
        start_time: firstEvent?.timestamp || new Date().toISOString(),
        end_time: parsedEvents[parsedEvents.length - 1]?.timestamp || new Date().toISOString(),
        duration_ms: 0,
        events: [],
        children: [],
        metadata: {
          environment: firstEvent?.environment,
          conversation_id: firstEvent?.conversation_id,
          session_id: firstEvent?.session_id,
          user_id: firstEvent?.user_id,
        },
        type: 'trace',
        details: {},
      });
    }

    const rootSpans: any[] = [];
    for (const [spanId, span] of spansMap.entries()) {
      if (span.parent_span_id === null) {
        rootSpans.push(span);
      } else {
        const parentSpan = spansMap.get(span.parent_span_id);
        if (parentSpan) {
          if (!parentSpan.children) {
            parentSpan.children = [];
          }
          parentSpan.children.push(span);
        } else {
          // Parent not found, treat as root
          rootSpans.push(span);
        }
      }
    }

    // Build summary from events
    const llmAttrs = llmCall?.attributes?.llm_call;
    const traceEndAttrs = traceEnd?.attributes?.trace_end;
    const summary = {
      trace_id: traceId,
      tenant_id: tenantId,
      project_id: projectId || firstEvent?.project_id || '',
      environment: firstEvent?.environment || 'prod',
      conversation_id: firstEvent?.conversation_id || null,
      session_id: firstEvent?.session_id || null,
      user_id: firstEvent?.user_id || null,
      start_time: traceStart?.timestamp || firstEvent?.timestamp || new Date().toISOString(),
      end_time: traceEnd?.timestamp || lastEvent?.timestamp || new Date().toISOString(),
      total_latency_ms: traceEndAttrs?.total_latency_ms || 
        (traceStart && traceEnd ? 
          new Date(traceEnd.timestamp).getTime() - new Date(traceStart.timestamp).getTime() : 
          0),
      total_tokens: traceEndAttrs?.total_tokens || llmAttrs?.total_tokens || 0,
      total_cost: null,
      model: llmAttrs?.model || null,
    };

    // Get analysis results if available
    let analysisData: any = {};
    try {
      const traceData = await this.getTraceDetail(traceId, tenantId, projectId);
      if (traceData) {
        analysisData = {
          isHallucination: traceData.is_hallucination,
          hallucinationConfidence: traceData.hallucination_confidence,
          hallucinationReasoning: traceData.hallucination_reasoning,
          qualityScore: traceData.quality_score,
          coherenceScore: traceData.coherence_score,
          relevanceScore: traceData.relevance_score,
          helpfulnessScore: traceData.helpfulness_score,
          hasContextDrop: traceData.has_context_drop,
          hasModelDrift: traceData.has_model_drift,
          hasPromptInjection: traceData.has_prompt_injection,
          hasContextOverflow: traceData.has_context_overflow,
          hasFaithfulnessIssue: traceData.has_faithfulness_issue,
          hasCostAnomaly: traceData.has_cost_anomaly,
          hasLatencyAnomaly: traceData.has_latency_anomaly,
          hasQualityDegradation: traceData.has_quality_degradation,
          contextRelevanceScore: traceData.context_relevance_score,
          answerFaithfulnessScore: traceData.answer_faithfulness_score,
          driftScore: traceData.drift_score,
          anomalyScore: traceData.anomaly_score,
          analysisModel: traceData.analysis_model,
          analysisVersion: traceData.analysis_version,
          processingTimeMs: traceData.processing_time_ms,
        };
      }
    } catch (error) {
      console.warn('[TraceQueryService] Could not fetch analysis results:', error);
    }

    // Build signals from analysis
    const signals: any[] = [];
    if (analysisData.isHallucination === true) {
      signals.push({
        signal_type: 'hallucination',
        severity: 'high',
        confidence: analysisData.hallucinationConfidence,
        reasoning: analysisData.hallucinationReasoning,
      });
    }
    if (analysisData.hasContextDrop) {
      signals.push({
        signal_type: 'context_drop',
        severity: 'medium',
        score: analysisData.contextRelevanceScore,
      });
    }
    if (analysisData.hasFaithfulnessIssue) {
      signals.push({
        signal_type: 'faithfulness',
        severity: 'medium',
        score: analysisData.answerFaithfulnessScore,
      });
    }

    return {
      summary,
      spans: rootSpans.length > 0 ? rootSpans : Array.from(spansMap.values()),
      signals,
      analysis: analysisData,
    };
  }

  /**
   * Aggregate canonical events into a trace summary
   */
  private static aggregateEventsToTrace(
    events: any[],
    traceId: string,
    tenantId: string,
    projectId: string | null
  ): Partial<TraceSummary> {
    if (events.length === 0) {
      return {
        trace_id: traceId,
        tenant_id: tenantId,
        project_id: projectId || "",
      };
    }

    // Find trace_start event for metadata
    const traceStartEvent = events.find(
      (e: any) => e.event_type === "trace_start"
    );

    // Find LLM call events
    const llmEvents = events.filter((e: any) => e.event_type === "llm_call");

    // Aggregate LLM call data
    let model: string | null = null;
    let totalLatency = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;

    llmEvents.forEach((event: any) => {
      const attrs = event.attributes?.llm_call || {};
      if (attrs.model && !model) {
        model = attrs.model;
      }
      if (attrs.latency_ms) {
        totalLatency += attrs.latency_ms;
      }
      if (attrs.input_tokens) {
        totalInputTokens += attrs.input_tokens;
      }
      if (attrs.output_tokens) {
        totalOutputTokens += attrs.output_tokens;
      }
      if (attrs.total_tokens) {
        totalTokens += attrs.total_tokens;
      }
    });

    // Get earliest timestamp
    const timestamps = events.map((e: any) => e.timestamp).sort();
    const timestamp = timestamps[0] || new Date().toISOString();

    // Extract metadata from trace_start or first event
    const firstEvent = traceStartEvent || events[0];
    const metadata = firstEvent || {};

    return {
      trace_id: traceId,
      tenant_id: tenantId,
      project_id: projectId || metadata.project_id || "",
      timestamp,
      model,
      latency_ms: totalLatency > 0 ? totalLatency : null,
      tokens_total: totalTokens > 0 ? totalTokens : null,
      tokens_prompt: totalInputTokens > 0 ? totalInputTokens : null,
      tokens_completion: totalOutputTokens > 0 ? totalOutputTokens : null,
      conversation_id: metadata.conversation_id || null,
      session_id: metadata.session_id || null,
      user_id: metadata.user_id || null,
      environment: metadata.environment || null,
    };
  }

  /**
   * Get analysis results from Postgres for given trace IDs
   */
  private static async getAnalysisResults(
    tenantId: string,
    traceIds: string[],
    projectId?: string | null
  ): Promise<any[]> {
    if (traceIds.length === 0) {
      return [];
    }

    const placeholders = traceIds.map((_, i) => `$${i + 2}`).join(", ");
    let whereClause = `WHERE tenant_id = $1 AND trace_id IN (${placeholders})`;
    const params: any[] = [tenantId, ...traceIds];

    if (projectId) {
      whereClause += ` AND project_id = $${params.length + 1}`;
      params.push(projectId);
    }

    const results = await query(
      `SELECT 
        trace_id,
        analyzed_at,
        is_hallucination,
        hallucination_confidence,
        has_context_drop,
        has_faithfulness_issue,
        has_model_drift,
        has_cost_anomaly,
        context_relevance_score,
        answer_faithfulness_score
      FROM analysis_results
      ${whereClause}`,
      params
    );

    return results;
  }

  /**
   * Filter traces by issue type
   */
  private static filterByIssueType(
    traces: TraceSummary[],
    issueType: string
  ): TraceSummary[] {
    switch (issueType) {
      case "hallucination":
        return traces.filter((t) => t.is_hallucination === true);
      case "context_drop":
        return traces.filter((t) => t.has_context_drop === true);
      case "faithfulness":
        return traces.filter((t) => t.has_faithfulness_issue === true);
      case "drift":
        return traces.filter((t) => t.has_model_drift === true);
      case "cost_anomaly":
        return traces.filter((t) => t.has_cost_anomaly === true);
      default:
        return traces;
    }
  }
}

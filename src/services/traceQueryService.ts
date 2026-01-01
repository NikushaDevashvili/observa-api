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
   */
  static async getTraceDetailTree(
    traceId: string,
    tenantId: string,
    projectId?: string | null
  ): Promise<any | null> {
    try {
      // First, try to get events from Tinybird (if available)
      // For now, fall back to analysis_results for backward compatibility
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
        start_time: traceData.timestamp || traceData.analyzed_at,
        end_time: traceData.timestamp ?
          new Date(new Date(traceData.timestamp).getTime() + (traceData.latency_ms || 0)).toISOString() :
          traceData.analyzed_at,
        total_latency_ms: traceData.latency_ms || 0,
        total_tokens: traceData.tokens_total || 0,
        total_cost: null, // Not in analysis_results
        model: traceData.model,
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

import { env } from "../config/env.js";
import { TraceEvent, TinybirdEvent } from "../types.js";

/**
 * Trace Service
 * Handles forwarding trace data to Tinybird
 */
export class TraceService {
  /**
   * Convert TraceEvent to TinybirdEvent format
   */
  private static toTinybirdEvent(trace: TraceEvent): TinybirdEvent {
    return {
      tenant_id: trace.tenantId,
      project_id: trace.projectId,
      environment: trace.environment,
      trace_id: trace.traceId,
      span_id: trace.spanId,
      parent_span_id: trace.parentSpanId ?? null,
      timestamp: trace.timestamp,
      model: trace.model ?? "",
      query: trace.query,
      context: trace.context ?? "",
      response: trace.response,
      response_length: trace.responseLength,
      latency_ms: trace.latencyMs,
      ttfb_ms: trace.timeToFirstTokenMs ?? null,
      streaming_ms: trace.streamingDurationMs ?? null,
      tokens_prompt: trace.tokensPrompt ?? null,
      tokens_completion: trace.tokensCompletion ?? null,
      tokens_total: trace.tokensTotal ?? null,
      status: trace.status ?? null,
      status_text: trace.statusText ?? null,
      finish_reason: trace.finishReason ?? null,
      response_id: trace.responseId ?? null,
      system_fingerprint: trace.systemFingerprint ?? null,
      metadata_json: trace.metadata ? JSON.stringify(trace.metadata) : "",
      headers_json: trace.headers ? JSON.stringify(trace.headers) : "",
    };
  }

  /**
   * Convert TinybirdEvent to NDJSON format
   */
  private static toNdjson(event: TinybirdEvent): string {
    return JSON.stringify(event) + "\n";
  }

  /**
   * Forward trace to Tinybird Events API
   *
   * @param trace - The trace event to forward
   * @param tinybirdToken - The Tinybird token to use (defaults to admin token)
   * @returns Success status
   * @throws Error if forwarding fails
   */
  static async forwardToTinybird(
    trace: TraceEvent,
    tinybirdToken?: string
  ): Promise<void> {
    const event = this.toTinybirdEvent(trace);
    const url = `${env.TINYBIRD_HOST}/v0/events?name=${encodeURIComponent(
      env.TINYBIRD_DATASOURCE_NAME
    )}&format=ndjson`;

    // Use provided token or fall back to admin token
    const token = tinybirdToken || env.TINYBIRD_ADMIN_TOKEN;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-ndjson",
        },
        body: this.toNdjson(event),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Tinybird API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to forward trace to Tinybird: ${errorMessage}`);
    }
  }

  /**
   * Store trace data immediately in PostgreSQL (SOTA: HTAP pattern)
   * This ensures trace data is available for operational queries
   * while Tinybird handles analytical workloads
   */
  static async storeTraceData(trace: TraceEvent): Promise<void> {
    const { query } = await import("../db/client.js");

    // Check if conversation columns exist, if not use fallback query
    let hasConversationColumns = false;
    try {
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'analysis_results' 
        AND column_name = 'conversation_id'
      `);
      hasConversationColumns = columnCheck.length > 0;
    } catch (err) {
      console.warn("[TraceService] Could not check for conversation columns, assuming they don't exist:", err);
    }

    if (hasConversationColumns) {
      // Full query with conversation tracking
      await query(
        `INSERT INTO analysis_results (
          trace_id, tenant_id, project_id, analyzed_at,
          span_id, parent_span_id, query, context, response, model,
          tokens_prompt, tokens_completion, tokens_total,
          latency_ms, time_to_first_token_ms, streaming_duration_ms,
          response_length, status, status_text, finish_reason,
          response_id, system_fingerprint, metadata_json, headers_json,
          timestamp, environment,
          conversation_id, session_id, user_id, message_index
        ) VALUES (
          $1, $2, $3, NOW(),
          $4, $5, $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25,
          $26, $27, $28, $29
        )
        ON CONFLICT (trace_id) DO UPDATE SET
          span_id = EXCLUDED.span_id,
          parent_span_id = EXCLUDED.parent_span_id,
          query = EXCLUDED.query,
          context = EXCLUDED.context,
          response = EXCLUDED.response,
          model = EXCLUDED.model,
          tokens_prompt = EXCLUDED.tokens_prompt,
          tokens_completion = EXCLUDED.tokens_completion,
          tokens_total = EXCLUDED.tokens_total,
          latency_ms = EXCLUDED.latency_ms,
          time_to_first_token_ms = EXCLUDED.time_to_first_token_ms,
          streaming_duration_ms = EXCLUDED.streaming_duration_ms,
          response_length = EXCLUDED.response_length,
          status = EXCLUDED.status,
          status_text = EXCLUDED.status_text,
          finish_reason = EXCLUDED.finish_reason,
          response_id = EXCLUDED.response_id,
          system_fingerprint = EXCLUDED.system_fingerprint,
          metadata_json = EXCLUDED.metadata_json,
          headers_json = EXCLUDED.headers_json,
          timestamp = EXCLUDED.timestamp,
          environment = EXCLUDED.environment,
          conversation_id = EXCLUDED.conversation_id,
          session_id = EXCLUDED.session_id,
          user_id = EXCLUDED.user_id,
          message_index = EXCLUDED.message_index`,
      [
        trace.traceId,
        trace.tenantId,
        trace.projectId,
        trace.spanId || null,
        trace.parentSpanId || null,
        trace.query || null,
        trace.context || null,
        trace.response || null,
        trace.model || null,
        trace.tokensPrompt || null,
        trace.tokensCompletion || null,
        trace.tokensTotal || null,
        trace.latencyMs || null,
        trace.timeToFirstTokenMs || null,
        trace.streamingDurationMs || null,
        trace.responseLength || null,
        trace.status || null,
        trace.statusText || null,
        trace.finishReason || null,
        trace.responseId || null,
        trace.systemFingerprint || null,
        trace.metadata ? JSON.stringify(trace.metadata) : null,
        trace.headers ? JSON.stringify(trace.headers) : null,
        trace.timestamp ? new Date(trace.timestamp) : null,
        trace.environment || null,
        trace.conversationId || null,
        trace.sessionId || null,
        trace.userId || null,
        trace.messageIndex || null,
      ]
    );
    } else {
      // Fallback query without conversation columns (for databases that haven't migrated yet)
      console.warn("[TraceService] Conversation columns not found, using fallback INSERT (without conversation tracking)");
      await query(
        `INSERT INTO analysis_results (
          trace_id, tenant_id, project_id, analyzed_at,
          span_id, parent_span_id, query, context, response, model,
          tokens_prompt, tokens_completion, tokens_total,
          latency_ms, time_to_first_token_ms, streaming_duration_ms,
          response_length, status, status_text, finish_reason,
          response_id, system_fingerprint, metadata_json, headers_json,
          timestamp, environment
        ) VALUES (
          $1, $2, $3, NOW(),
          $4, $5, $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25
        )
        ON CONFLICT (trace_id) DO UPDATE SET
          span_id = EXCLUDED.span_id,
          parent_span_id = EXCLUDED.parent_span_id,
          query = EXCLUDED.query,
          context = EXCLUDED.context,
          response = EXCLUDED.response,
          model = EXCLUDED.model,
          tokens_prompt = EXCLUDED.tokens_prompt,
          tokens_completion = EXCLUDED.tokens_completion,
          tokens_total = EXCLUDED.tokens_total,
          latency_ms = EXCLUDED.latency_ms,
          time_to_first_token_ms = EXCLUDED.time_to_first_token_ms,
          streaming_duration_ms = EXCLUDED.streaming_duration_ms,
          response_length = EXCLUDED.response_length,
          status = EXCLUDED.status,
          status_text = EXCLUDED.status_text,
          finish_reason = EXCLUDED.finish_reason,
          response_id = EXCLUDED.response_id,
          system_fingerprint = EXCLUDED.system_fingerprint,
          metadata_json = EXCLUDED.metadata_json,
          headers_json = EXCLUDED.headers_json,
          timestamp = EXCLUDED.timestamp,
          environment = EXCLUDED.environment`,
        [
          trace.traceId,
          trace.tenantId,
          trace.projectId,
          trace.spanId || null,
          trace.parentSpanId || null,
          trace.query || null,
          trace.context || null,
          trace.response || null,
          trace.model || null,
          trace.tokensPrompt || null,
          trace.tokensCompletion || null,
          trace.tokensTotal || null,
          trace.latencyMs || null,
          trace.timeToFirstTokenMs || null,
          trace.streamingDurationMs || null,
          trace.responseLength || null,
          trace.status || null,
          trace.statusText || null,
          trace.finishReason || null,
          trace.responseId || null,
          trace.systemFingerprint || null,
          trace.metadata ? JSON.stringify(trace.metadata) : null,
          trace.headers ? JSON.stringify(trace.headers) : null,
          trace.timestamp ? new Date(trace.timestamp) : null,
          trace.environment || null,
        ]
      );
    }
  }
}

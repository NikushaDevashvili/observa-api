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
      // Conversation tracking fields
      conversation_id: trace.conversationId ?? null,
      session_id: trace.sessionId ?? null,
      user_id: trace.userId ?? null,
      message_index: trace.messageIndex ?? null,
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

    if (!token) {
      throw new Error("Tinybird token is required but not configured");
    }

    try {
      console.log(
        `[TraceService] Forwarding to Tinybird - TraceID: ${
          trace.traceId
        }, Conversation: ${trace.conversationId || "none"}`
      );
      console.log(
        `[TraceService] Tinybird URL: ${url}, Token present: ${!!token}`
      );

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
        console.error(
          `[TraceService] Tinybird API error: ${response.status} ${response.statusText} - ${errorText}`
        );
        throw new Error(
          `Tinybird API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const responseText = await response.text().catch(() => "");
      console.log(
        `[TraceService] Successfully forwarded to Tinybird - TraceID: ${trace.traceId}, Response: ${responseText}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[TraceService] Failed to forward trace to Tinybird - TraceID: ${trace.traceId}, Error: ${errorMessage}`
      );
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
      console.log(
        `[TraceService] Conversation columns check: ${
          hasConversationColumns ? "found" : "not found"
        }`
      );
    } catch (err) {
      console.error(
        "[TraceService] Error checking for conversation columns:",
        err
      );
      // Assume columns exist if check fails (safer default)
      hasConversationColumns = true;
    }

    if (hasConversationColumns) {
      // Full query with conversation tracking
      console.log(
        `[TraceService] Storing trace with conversation tracking - TraceID: ${
          trace.traceId
        }, ConversationID: ${trace.conversationId || "none"}, MessageIndex: ${
          trace.messageIndex || "none"
        }`
      );
      // #region agent log
      fetch(
        "http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "traceService.ts:162",
            message: "Before INSERT with ON CONFLICT",
            data: {
              traceId: trace.traceId,
              conversationId: trace.conversationId,
              messageIndex: trace.messageIndex,
              willOverwrite: "ON CONFLICT will update if trace_id exists",
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "C",
          }),
        }
      ).catch(() => {});
      // #endregion
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
          span_id = COALESCE(EXCLUDED.span_id, analysis_results.span_id),
          parent_span_id = COALESCE(EXCLUDED.parent_span_id, analysis_results.parent_span_id),
          query = COALESCE(NULLIF(EXCLUDED.query, ''), analysis_results.query),
          context = COALESCE(EXCLUDED.context, analysis_results.context),
          response = COALESCE(NULLIF(EXCLUDED.response, ''), analysis_results.response),
          model = COALESCE(EXCLUDED.model, analysis_results.model),
          tokens_prompt = COALESCE(EXCLUDED.tokens_prompt, analysis_results.tokens_prompt),
          tokens_completion = COALESCE(EXCLUDED.tokens_completion, analysis_results.tokens_completion),
          tokens_total = COALESCE(EXCLUDED.tokens_total, analysis_results.tokens_total),
          latency_ms = COALESCE(EXCLUDED.latency_ms, analysis_results.latency_ms),
          time_to_first_token_ms = COALESCE(EXCLUDED.time_to_first_token_ms, analysis_results.time_to_first_token_ms),
          streaming_duration_ms = COALESCE(EXCLUDED.streaming_duration_ms, analysis_results.streaming_duration_ms),
          response_length = COALESCE(EXCLUDED.response_length, analysis_results.response_length),
          status = COALESCE(EXCLUDED.status, analysis_results.status),
          status_text = COALESCE(EXCLUDED.status_text, analysis_results.status_text),
          finish_reason = COALESCE(EXCLUDED.finish_reason, analysis_results.finish_reason),
          response_id = COALESCE(EXCLUDED.response_id, analysis_results.response_id),
          system_fingerprint = COALESCE(EXCLUDED.system_fingerprint, analysis_results.system_fingerprint),
          metadata_json = COALESCE(EXCLUDED.metadata_json, analysis_results.metadata_json),
          headers_json = COALESCE(EXCLUDED.headers_json, analysis_results.headers_json),
          timestamp = COALESCE(EXCLUDED.timestamp, analysis_results.timestamp),
          environment = COALESCE(EXCLUDED.environment, analysis_results.environment),
          conversation_id = COALESCE(EXCLUDED.conversation_id, analysis_results.conversation_id),
          session_id = COALESCE(EXCLUDED.session_id, analysis_results.session_id),
          user_id = COALESCE(EXCLUDED.user_id, analysis_results.user_id),
          message_index = COALESCE(EXCLUDED.message_index, analysis_results.message_index)`,
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
      // #region agent log
      fetch(
        "http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "traceService.ts:244",
            message: "After INSERT completed",
            data: {
              traceId: trace.traceId?.substring(0, 20),
              conversationId: trace.conversationId?.substring(0, 20),
              messageIndex: trace.messageIndex,
              query: trace.query?.substring(0, 30),
              inserted: "Row inserted or updated",
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run2",
            hypothesisId: "C",
          }),
        }
      ).catch(() => {});
      // #endregion
    } else {
      // Fallback query without conversation columns (for databases that haven't migrated yet)
      console.warn(
        "[TraceService] Conversation columns not found, using fallback INSERT (without conversation tracking)"
      );
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
          span_id = COALESCE(EXCLUDED.span_id, analysis_results.span_id),
          parent_span_id = COALESCE(EXCLUDED.parent_span_id, analysis_results.parent_span_id),
          query = COALESCE(NULLIF(EXCLUDED.query, ''), analysis_results.query),
          context = COALESCE(EXCLUDED.context, analysis_results.context),
          response = COALESCE(NULLIF(EXCLUDED.response, ''), analysis_results.response),
          model = COALESCE(EXCLUDED.model, analysis_results.model),
          tokens_prompt = COALESCE(EXCLUDED.tokens_prompt, analysis_results.tokens_prompt),
          tokens_completion = COALESCE(EXCLUDED.tokens_completion, analysis_results.tokens_completion),
          tokens_total = COALESCE(EXCLUDED.tokens_total, analysis_results.tokens_total),
          latency_ms = COALESCE(EXCLUDED.latency_ms, analysis_results.latency_ms),
          time_to_first_token_ms = COALESCE(EXCLUDED.time_to_first_token_ms, analysis_results.time_to_first_token_ms),
          streaming_duration_ms = COALESCE(EXCLUDED.streaming_duration_ms, analysis_results.streaming_duration_ms),
          response_length = COALESCE(EXCLUDED.response_length, analysis_results.response_length),
          status = COALESCE(EXCLUDED.status, analysis_results.status),
          status_text = COALESCE(EXCLUDED.status_text, analysis_results.status_text),
          finish_reason = COALESCE(EXCLUDED.finish_reason, analysis_results.finish_reason),
          response_id = COALESCE(EXCLUDED.response_id, analysis_results.response_id),
          system_fingerprint = COALESCE(EXCLUDED.system_fingerprint, analysis_results.system_fingerprint),
          metadata_json = COALESCE(EXCLUDED.metadata_json, analysis_results.metadata_json),
          headers_json = COALESCE(EXCLUDED.headers_json, analysis_results.headers_json),
          timestamp = COALESCE(EXCLUDED.timestamp, analysis_results.timestamp),
          environment = COALESCE(EXCLUDED.environment, analysis_results.environment)`,
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

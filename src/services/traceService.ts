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
}


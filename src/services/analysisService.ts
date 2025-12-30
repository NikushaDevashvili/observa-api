import { env } from "../config/env.js";
import { query } from "../db/client.js";
import { TraceEvent } from "../types.js";

/**
 * Analysis Service
 * Orchestrates ML analysis by calling the Python analysis service
 * and storing results in the database
 */
export class AnalysisService {
  private static analysisServiceUrl: string =
    process.env.ANALYSIS_SERVICE_URL || "http://localhost:8000";

  /**
   * Analyze a trace asynchronously
   * This should be called after trace ingestion (non-blocking)
   */
  static async analyzeTrace(trace: TraceEvent): Promise<void> {
    try {
      // Check if analysis service is configured
      if (!process.env.ANALYSIS_SERVICE_URL) {
        console.log(
          "[Analysis] ANALYSIS_SERVICE_URL not set, skipping analysis"
        );
        return;
      }

      // Call Python analysis service
      const analysisResult = await this.callAnalysisService(trace);

      // Store results in database
      await this.storeAnalysisResults(trace, analysisResult);
    } catch (error) {
      console.error(
        `[Analysis] Failed to analyze trace ${trace.traceId}:`,
        error
      );
      // Don't throw - analysis failures shouldn't break trace ingestion
    }
  }

  /**
   * Call the Python analysis service with timeout and retry logic
   */
  private static async callAnalysisService(trace: TraceEvent): Promise<any> {
    const url = `${this.analysisServiceUrl}/analyze`;
    const timeout = 60000; // 60 seconds timeout
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay for exponential backoff

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              trace_id: trace.traceId,
              tenant_id: trace.tenantId,
              project_id: trace.projectId,
              query: trace.query,
              context: trace.context || "",
              response: trace.response,
              model: trace.model || "",
              tokens_prompt: trace.tokensPrompt || null,
              tokens_completion: trace.tokensCompletion || null,
              tokens_total: trace.tokensTotal || null,
              latency_ms: trace.latencyMs,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Handle 503 (service not ready) with retry
          if (response.status === 503) {
            if (attempt < maxRetries - 1) {
              const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
              console.log(
                `[Analysis] Service not ready (503), retrying in ${delay}ms (attempt ${
                  attempt + 1
                }/${maxRetries})`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            } else {
              throw new Error(
                `Analysis service not ready after ${maxRetries} attempts`
              );
            }
          }

          if (!response.ok) {
            throw new Error(
              `Analysis service returned ${response.status}: ${response.statusText}`
            );
          }

          return await response.json();
        } catch (fetchError: any) {
          clearTimeout(timeoutId);

          // Handle timeout
          if (fetchError.name === "AbortError") {
            if (attempt < maxRetries - 1) {
              const delay = baseDelay * Math.pow(2, attempt);
              console.log(
                `[Analysis] Request timeout, retrying in ${delay}ms (attempt ${
                  attempt + 1
                }/${maxRetries})`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            } else {
              throw new Error(
                `Analysis service request timed out after ${maxRetries} attempts`
              );
            }
          }

          // Handle other errors
          throw fetchError;
        }
      } catch (error: any) {
        // If this is the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          if (error.message) {
            throw error;
          }
          throw new Error(
            `Analysis service call failed after ${maxRetries} attempts: ${error}`
          );
        }

        // Otherwise, wait and retry
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(
          `[Analysis] Error on attempt ${attempt + 1}, retrying in ${delay}ms:`,
          error.message || error
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error("Analysis service call failed");
  }

  /**
   * Store analysis results in database
   */
  private static async storeAnalysisResults(
    trace: TraceEvent,
    analysisResult: any
  ): Promise<void> {
    await query(
      `INSERT INTO analysis_results (
        trace_id, tenant_id, project_id, analyzed_at,
        is_hallucination, hallucination_confidence, hallucination_reasoning,
        quality_score, coherence_score, relevance_score, helpfulness_score,
        has_context_drop, has_model_drift, has_prompt_injection,
        has_context_overflow, has_faithfulness_issue, has_cost_anomaly,
        has_latency_anomaly, has_quality_degradation,
        context_relevance_score, answer_faithfulness_score,
        drift_score, anomaly_score,
        analysis_model, analysis_version, processing_time_ms,
        span_id, parent_span_id, query, context, response, model,
        tokens_prompt, tokens_completion, tokens_total,
        latency_ms, time_to_first_token_ms, streaming_duration_ms,
        response_length, status, status_text, finish_reason,
        response_id, system_fingerprint, metadata_json, headers_json,
        timestamp, environment
      ) VALUES (
        $1, $2, $3, NOW(),
        $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18,
        $19, $20,
        $21, $22,
        $23, $24, $25,
        $26, $27, $28, $29, $30, $31,
        $32, $33, $34,
        $35, $36, $37,
        $38, $39, $40, $41,
        $42, $43, $44, $45,
        $46, $47
      )
      ON CONFLICT (trace_id) DO UPDATE SET
        analyzed_at = NOW(),
        is_hallucination = EXCLUDED.is_hallucination,
        hallucination_confidence = EXCLUDED.hallucination_confidence,
        hallucination_reasoning = EXCLUDED.hallucination_reasoning,
        quality_score = EXCLUDED.quality_score,
        coherence_score = EXCLUDED.coherence_score,
        relevance_score = EXCLUDED.relevance_score,
        helpfulness_score = EXCLUDED.helpfulness_score,
        has_context_drop = EXCLUDED.has_context_drop,
        has_model_drift = EXCLUDED.has_model_drift,
        has_prompt_injection = EXCLUDED.has_prompt_injection,
        has_context_overflow = EXCLUDED.has_context_overflow,
        has_faithfulness_issue = EXCLUDED.has_faithfulness_issue,
        has_cost_anomaly = EXCLUDED.has_cost_anomaly,
        has_latency_anomaly = EXCLUDED.has_latency_anomaly,
        has_quality_degradation = EXCLUDED.has_quality_degradation,
        context_relevance_score = EXCLUDED.context_relevance_score,
        answer_faithfulness_score = EXCLUDED.answer_faithfulness_score,
        drift_score = EXCLUDED.drift_score,
        anomaly_score = EXCLUDED.anomaly_score,
        analysis_model = EXCLUDED.analysis_model,
        analysis_version = EXCLUDED.analysis_version,
        processing_time_ms = EXCLUDED.processing_time_ms`,
      [
        trace.traceId,
        trace.tenantId,
        trace.projectId,
        analysisResult.is_hallucination || false,
        analysisResult.hallucination_confidence || null,
        analysisResult.hallucination_reasoning || null,
        analysisResult.quality_score || null,
        analysisResult.coherence_score || null,
        analysisResult.relevance_score || null,
        analysisResult.helpfulness_score || null,
        analysisResult.has_context_drop || false,
        analysisResult.has_model_drift || false,
        analysisResult.has_prompt_injection || false,
        analysisResult.has_context_overflow || false,
        analysisResult.has_faithfulness_issue || false,
        analysisResult.has_cost_anomaly || false,
        analysisResult.has_latency_anomaly || false,
        analysisResult.has_quality_degradation || false,
        analysisResult.context_relevance_score || null,
        analysisResult.answer_faithfulness_score || null,
        analysisResult.drift_score || null,
        analysisResult.anomaly_score || null,
        analysisResult.analysis_model || null,
        analysisResult.analysis_version || "0.1.0",
        analysisResult.processing_time_ms || null,
        // Trace data (already stored, but update if needed)
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

  /**
   * Get analysis results for a trace
   */
  static async getAnalysisResults(traceId: string): Promise<any | null> {
    const rows = await query(
      `SELECT * FROM analysis_results WHERE trace_id = $1`,
      [traceId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  }

  /**
   * Get analysis results for multiple traces
   */
  static async getAnalysisResultsBatch(
    traceIds: string[]
  ): Promise<Record<string, any>> {
    if (traceIds.length === 0) {
      return {};
    }

    const placeholders = traceIds.map((_, i) => `$${i + 1}`).join(",");
    const rows = await query(
      `SELECT * FROM analysis_results WHERE trace_id IN (${placeholders})`,
      traceIds
    );

    const results: Record<string, any> = {};
    for (const row of rows) {
      results[row.trace_id] = row;
    }

    return results;
  }
}

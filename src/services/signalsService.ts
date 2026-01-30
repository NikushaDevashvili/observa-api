/**
 * Signals Service
 *
 * Layer 2: Deterministic/free signals (run on 100% of events)
 * - Latency thresholds (p95/p99 by route/model)
 * - Error rate by tool/model/version
 * - Loop detection
 * - Token/cost spikes
 */

import { CanonicalEvent, EventType } from "../types/events.js";
import { TinybirdCanonicalEvent } from "../types/events.js";
import { CanonicalEventService } from "./canonicalEventService.js";

export interface Signal {
  tenant_id: string;
  project_id: string;
  trace_id: string;
  span_id: string;
  signal_name: string;
  signal_type: "threshold" | "error" | "loop" | "spike" | "mismatch";
  signal_value: number | boolean | string;
  signal_severity: "low" | "medium" | "high";
  metadata?: Record<string, any>;
  timestamp: string;
}

/**
 * Layer 2 Signals Service
 * Generates deterministic signals from events
 */
export class SignalsService {
  /**
   * Process events and generate Layer 2 signals
   */
  static async processEvents(events: TinybirdCanonicalEvent[]): Promise<void> {
    const signals: Signal[] = [];
    let parseErrors = 0;

    for (const event of events) {
      // Safely parse attributes_json - skip events with invalid JSON
      let attributes: any;
      try {
        if (
          typeof event.attributes_json === "string" &&
          event.attributes_json.trim()
        ) {
          attributes = JSON.parse(event.attributes_json);
        } else {
          // Skip events without valid attributes_json
          continue;
        }
      } catch (e) {
        parseErrors++;
        // Log first few errors for debugging, then skip silently
        if (parseErrors <= 3) {
          console.warn(
            `[SignalsService] Failed to parse attributes_json for event ${event.event_type} (trace: ${event.trace_id}):`,
            e instanceof Error ? e.message : String(e),
          );
        }
        // Skip this event and continue processing others
        continue;
      }

      const eventTimestamp = new Date(event.timestamp).toISOString();

      // Process LLM call events
      if (event.event_type === "llm_call" && attributes.llm_call) {
        const llmCall = attributes.llm_call;

        // Latency threshold check (p95/p99)
        if (llmCall.latency_ms) {
          // Simple threshold: >5s is high, >2s is medium
          if (llmCall.latency_ms > 5000) {
            signals.push({
              tenant_id: event.tenant_id,
              project_id: event.project_id,
              trace_id: event.trace_id,
              span_id: event.span_id,
              signal_name: "high_latency",
              signal_type: "threshold",
              signal_value: llmCall.latency_ms,
              signal_severity: "high",
              metadata: {
                model: llmCall.model,
                threshold_ms: 5000,
              },
              timestamp: eventTimestamp,
            });
          } else if (llmCall.latency_ms > 2000) {
            signals.push({
              tenant_id: event.tenant_id,
              project_id: event.project_id,
              trace_id: event.trace_id,
              span_id: event.span_id,
              signal_name: "medium_latency",
              signal_type: "threshold",
              signal_value: llmCall.latency_ms,
              signal_severity: "medium",
              metadata: {
                model: llmCall.model,
                threshold_ms: 2000,
              },
              timestamp: eventTimestamp,
            });
          }
        }

        // Token/cost spike detection
        if (llmCall.total_tokens) {
          // Simple threshold: >100k tokens is a spike
          if (llmCall.total_tokens > 100000) {
            signals.push({
              tenant_id: event.tenant_id,
              project_id: event.project_id,
              trace_id: event.trace_id,
              span_id: event.span_id,
              signal_name: "token_spike",
              signal_type: "spike",
              signal_value: llmCall.total_tokens,
              signal_severity: "high",
              metadata: {
                model: llmCall.model,
                input_tokens: llmCall.input_tokens,
                output_tokens: llmCall.output_tokens,
              },
              timestamp: eventTimestamp,
            });
          }
        }

        // Cost spike detection
        if (llmCall.cost && llmCall.cost > 10) {
          // $10+ per call is a spike
          signals.push({
            tenant_id: event.tenant_id,
            project_id: event.project_id,
            trace_id: event.trace_id,
            span_id: event.span_id,
            signal_name: "cost_spike",
            signal_type: "spike",
            signal_value: llmCall.cost,
            signal_severity: "high",
            metadata: {
              model: llmCall.model,
              tokens: llmCall.total_tokens,
            },
            timestamp: eventTimestamp,
          });
        }
      }

      // Process tool call events
      if (event.event_type === "tool_call" && attributes.tool_call) {
        const toolCall = attributes.tool_call;

        // Error detection
        if (toolCall.result_status === "error") {
          signals.push({
            tenant_id: event.tenant_id,
            project_id: event.project_id,
            trace_id: event.trace_id,
            span_id: event.span_id,
            signal_name: "tool_error",
            signal_type: "error",
            signal_value: true,
            signal_severity: "high",
            metadata: {
              tool_name: toolCall.tool_name,
              error_message: toolCall.error_message,
            },
            timestamp: eventTimestamp,
          });
        }

        // Timeout detection
        if (toolCall.result_status === "timeout") {
          signals.push({
            tenant_id: event.tenant_id,
            project_id: event.project_id,
            trace_id: event.trace_id,
            span_id: event.span_id,
            signal_name: "tool_timeout",
            signal_type: "error",
            signal_value: true,
            signal_severity: "high",
            metadata: {
              tool_name: toolCall.tool_name,
              latency_ms: toolCall.latency_ms,
            },
            timestamp: eventTimestamp,
          });
        }

        // High latency for tool calls
        if (toolCall.latency_ms > 5000) {
          signals.push({
            tenant_id: event.tenant_id,
            project_id: event.project_id,
            trace_id: event.trace_id,
            span_id: event.span_id,
            signal_name: "tool_latency",
            signal_type: "threshold",
            signal_value: toolCall.latency_ms,
            signal_severity: "medium",
            metadata: {
              tool_name: toolCall.tool_name,
            },
            timestamp: eventTimestamp,
          });
        }
      }

      // Process error events
      if (event.event_type === "error" && attributes.error) {
        signals.push({
          tenant_id: event.tenant_id,
          project_id: event.project_id,
          trace_id: event.trace_id,
          span_id: event.span_id,
          signal_name: "error_event",
          signal_type: "error",
          signal_value: true,
          signal_severity: "high",
          metadata: {
            error_type: attributes.error.error_type,
            error_message: attributes.error.error_message,
          },
          timestamp: eventTimestamp,
        });
      }

      // Check for secrets (from scrubbing metadata)
      if ((event as any)._scrubbing_metadata?.contains_secrets) {
        signals.push({
          tenant_id: event.tenant_id,
          project_id: event.project_id,
          trace_id: event.trace_id,
          span_id: event.span_id,
          signal_name: "contains_secrets",
          signal_type: "threshold",
          signal_value: true,
          signal_severity: "high",
          metadata: {
            secret_types: (event as any)._scrubbing_metadata.secret_types,
          },
          timestamp: eventTimestamp,
        });
      }
    }

    // Store signals as canonical events
    // Note: Signals are stored as separate events with signal metadata in attributes
    // In a full implementation, you might want a dedicated "signal" event_type
    // For now, we'll use a metadata approach or store as error events with signal attributes
    if (signals.length > 0) {
      // Get environment from first event (all events in batch should have same env)
      const environment = events.length > 0 ? events[0].environment : "prod";

      // Create a map to look up original events by trace_id + span_id
      // This allows signals to inherit conversation_id, session_id, and user_id from source events
      const eventMap = new Map<string, TinybirdCanonicalEvent>();
      for (const event of events) {
        const key = `${event.trace_id}:${event.span_id}`;
        // Use the first event with this key (prefer events with non-empty conversation/session/user IDs)
        if (!eventMap.has(key)) {
          eventMap.set(key, event);
        } else {
          // Prefer events with actual conversation/session/user IDs over empty strings
          const existing = eventMap.get(key)!;
          const hasExistingValues =
            (existing.conversation_id &&
              existing.conversation_id.trim() !== "") ||
            (existing.session_id && existing.session_id.trim() !== "") ||
            (existing.user_id && existing.user_id.trim() !== "");
          const hasNewValues =
            (event.conversation_id && event.conversation_id.trim() !== "") ||
            (event.session_id && event.session_id.trim() !== "") ||
            (event.user_id && event.user_id.trim() !== "");
          if (!hasExistingValues && hasNewValues) {
            eventMap.set(key, event);
          }
        }
      }

      const signalEvents: TinybirdCanonicalEvent[] = signals.map((signal) => {
        // Find the original event that generated this signal
        const key = `${signal.trace_id}:${signal.span_id}`;
        const sourceEvent = eventMap.get(key);

        // Inherit conversation_id, session_id, user_id from source event
        // Use empty string only if source event doesn't have them
        // CRITICAL: These fields are REQUIRED (not nullable) in Tinybird
        const conversationId =
          sourceEvent?.conversation_id &&
          sourceEvent.conversation_id.trim() !== ""
            ? sourceEvent.conversation_id
            : "";
        const sessionId =
          sourceEvent?.session_id && sourceEvent.session_id.trim() !== ""
            ? sourceEvent.session_id
            : "";
        const userId =
          sourceEvent?.user_id && sourceEvent.user_id.trim() !== ""
            ? sourceEvent.user_id
            : "";

        // CRITICAL: Inherit parent_span_id from source event so signal doesn't create a false "second attempt"
        // (Signals with parent_span_id null were being counted as separate roots → bogus "2 attempts")
        const parentSpanId = sourceEvent?.parent_span_id ?? null;

        return {
          tenant_id: signal.tenant_id,
          project_id: signal.project_id,
          environment: environment,
          trace_id: signal.trace_id,
          span_id: signal.span_id,
          parent_span_id: parentSpanId,
          timestamp: signal.timestamp,
          event_type: "error" as EventType, // Use error type as placeholder for signals
          // Inherit conversation/session/user IDs from source event (required fields)
          conversation_id: conversationId,
          session_id: sessionId,
          user_id: userId,
          agent_name: null,
          version: null,
          route: null,
          attributes_json: JSON.stringify({
            signal: {
              signal_name: signal.signal_name,
              signal_type: signal.signal_type,
              signal_value: signal.signal_value,
              signal_severity: signal.signal_severity,
              metadata: signal.metadata,
            },
          }),
        };
      });

      // Format signals before forwarding (ensures required fields are present)
      const { formatTinybirdEvents } =
        await import("../utils/tinybirdEventFormatter.js");
      const formattedSignalEvents = formatTinybirdEvents(signalEvents);

      // Forward signals to Tinybird
      try {
        await CanonicalEventService.forwardToTinybird(formattedSignalEvents);
        console.log(
          `[SignalsService] ✅ Stored ${signals.length} signals to Tinybird (${signals.filter((s) => s.signal_severity === "high").length} high-severity)`,
        );
      } catch (error) {
        console.error("[SignalsService] ❌ Failed to store signals:", error);
        // Don't throw - signal storage failure shouldn't break ingestion
      }

      // SOTA: Trigger Layer 3/4 analysis for high-severity signals
      // This is the event-driven approach - analysis only runs when needed
      const highSeveritySignals = signals.filter(
        (s) => s.signal_severity === "high",
      );
      const mediumSeveritySignals = signals.filter(
        (s) => s.signal_severity === "medium",
      );

      if (highSeveritySignals.length > 0 || mediumSeveritySignals.length > 0) {
        // Get trace data from events (find LLM call or output event)
        const traceEvent = events.find(
          (e) => e.event_type === "llm_call" || e.event_type === "output",
        );

        if (traceEvent) {
          const attributes = JSON.parse(traceEvent.attributes_json);
          const llmCall = attributes.llm_call || attributes.output;

          // Queue analysis job for high-severity signals
          try {
            const { queueAnalysisForHighSeveritySignal } =
              await import("./analysisDispatcher.js");

            const signalNames = [
              ...highSeveritySignals,
              ...mediumSeveritySignals,
            ].map((s) => s.signal_name);

            await queueAnalysisForHighSeveritySignal(
              traceEvent.trace_id,
              traceEvent.tenant_id,
              traceEvent.project_id,
              signalNames,
              highSeveritySignals.length > 0 ? "high" : "medium",
              {
                span_id: traceEvent.span_id || undefined,
                conversation_id: traceEvent.conversation_id || undefined,
                session_id: traceEvent.session_id || undefined,
                user_id: traceEvent.user_id || undefined,
                query: llmCall?.input || undefined,
                context: undefined, // TODO: Extract from retrieval events
                response: llmCall?.output || llmCall?.final_output || undefined,
                model: llmCall?.model || undefined,
                tokens_total: llmCall?.total_tokens || undefined,
                latency_ms: llmCall?.latency_ms || undefined,
                cost: llmCall?.cost || undefined,
                environment: traceEvent.environment,
                route: traceEvent.route || undefined,
                agent_name: traceEvent.agent_name || undefined,
                version: traceEvent.version || undefined,
              },
            );
          } catch (error) {
            console.error(
              "[SignalsService] Failed to queue analysis job (non-fatal):",
              error,
            );
            // Don't throw - analysis queue failure shouldn't break ingestion
          }
        }
      }
    } else {
      // Log if we had parse errors but no signals generated
      if (parseErrors > 0) {
        console.warn(
          `[SignalsService] ⚠️  Skipped ${parseErrors} events due to JSON parsing errors (no signals generated)`,
        );
      }
    }
  }
}

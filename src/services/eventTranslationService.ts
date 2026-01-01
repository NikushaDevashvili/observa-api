/**
 * Event Translation Service
 * 
 * Translates legacy TraceEvent format to canonical event format.
 * Supports backward compatibility by converting old trace structure
 * into multiple canonical events (llm_call, output, etc.)
 */

import { TraceEvent } from "../types.js";
import { CanonicalEvent, TinybirdCanonicalEvent, EventType } from "../types/events.js";

export class EventTranslationService {
  /**
   * Convert legacy TraceEvent to canonical events
   * 
   * A single TraceEvent may produce multiple canonical events:
   * 1. An llm_call event (if model/query/response present)
   * 2. An output event (final output)
   * 
   * @param traceEvent - Legacy TraceEvent
   * @returns Array of canonical events
   */
  static traceEventToCanonicalEvents(traceEvent: TraceEvent): CanonicalEvent[] {
    const events: CanonicalEvent[] = [];
    
    const baseEvent: Partial<CanonicalEvent> = {
      tenant_id: traceEvent.tenantId,
      project_id: traceEvent.projectId,
      environment: traceEvent.environment,
      trace_id: traceEvent.traceId,
      span_id: traceEvent.spanId,
      parent_span_id: traceEvent.parentSpanId ?? null,
      timestamp: traceEvent.timestamp,
      conversation_id: traceEvent.conversationId ?? null,
      session_id: traceEvent.sessionId ?? null,
      user_id: traceEvent.userId ?? null,
    };
    
    // Create LLM call event if model/query/response present
    if (traceEvent.model && traceEvent.query !== undefined) {
      events.push({
        ...baseEvent,
        event_type: "llm_call",
        attributes: {
          llm_call: {
            model: traceEvent.model,
            input_tokens: traceEvent.tokensPrompt ?? null,
            output_tokens: traceEvent.tokensCompletion ?? null,
            total_tokens: traceEvent.tokensTotal ?? null,
            latency_ms: traceEvent.latencyMs,
            finish_reason: traceEvent.finishReason ?? null,
            response_id: traceEvent.responseId ?? null,
            system_fingerprint: traceEvent.systemFingerprint ?? null,
            input: traceEvent.query || null,
            output: traceEvent.response || null,
            // Note: cost calculation should be done in signals layer
            cost: null,
          },
        },
      } as CanonicalEvent);
    }
    
    // Create output event (final output)
    if (traceEvent.response !== undefined) {
      events.push({
        ...baseEvent,
        event_type: "output",
        attributes: {
          output: {
            final_output: traceEvent.response || null,
            output_length: traceEvent.responseLength || null,
          },
        },
      } as CanonicalEvent);
    }
    
    // If no events created (edge case), create a minimal trace_start event
    if (events.length === 0) {
      events.push({
        ...baseEvent,
        event_type: "trace_start",
        attributes: {
          trace_start: {
            metadata: traceEvent.metadata || null,
          },
        },
      } as CanonicalEvent);
    }
    
    return events;
  }
  
  /**
   * Convert canonical event to Tinybird format (snake_case)
   */
  static canonicalEventToTinybird(event: CanonicalEvent): TinybirdCanonicalEvent {
    return {
      tenant_id: event.tenant_id,
      project_id: event.project_id,
      environment: event.environment,
      trace_id: event.trace_id,
      span_id: event.span_id,
      parent_span_id: event.parent_span_id,
      timestamp: event.timestamp,
      event_type: event.event_type,
      conversation_id: event.conversation_id ?? null,
      session_id: event.session_id ?? null,
      user_id: event.user_id ?? null,
      agent_name: event.agent_name ?? null,
      version: event.version ?? null,
      route: event.route ?? null,
      attributes_json: JSON.stringify(event.attributes),
    };
  }
  
  /**
   * Batch convert canonical events to Tinybird format
   */
  static canonicalEventsToTinybird(events: CanonicalEvent[]): TinybirdCanonicalEvent[] {
    return events.map(event => this.canonicalEventToTinybird(event));
  }
}


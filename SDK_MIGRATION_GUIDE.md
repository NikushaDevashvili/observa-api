# SDK Migration Guide: Legacy TraceEvent to Canonical Events

This guide explains how to update the Observa SDK to use the new canonical event format, enabling full observability including tool calls, retrievals, errors, and hierarchical spans.

## Overview

**Current State (Legacy):**
- SDK sends a single `TraceEvent` to `/api/v1/traces/ingest`
- Only captures LLM call information (query, response, tokens, latency)
- Missing: tool calls, retrievals, errors, hierarchical spans
- Limited to one event per trace

**Target State (Canonical Events):**
- SDK sends multiple canonical events to `/api/v1/events/ingest`
- Captures all operations: LLM calls, tool calls, retrievals, errors, feedback
- Supports hierarchical span relationships
- Batch sends events at trace completion

## Why Migrate?

The canonical event format enables:

1. **Complete Observability**: Capture tool calls, retrievals, web searches, database queries
2. **Error Tracking**: Track errors at each operation level
3. **Hierarchical Spans**: Represent nested operations (e.g., tool calls within LLM calls)
4. **Agentic Workflows**: Support multiple LLM calls in a single trace
5. **Better Debugging**: See the full execution flow, not just final inputs/outputs

## Migration Steps

### Step 1: Update SDK Architecture

The SDK needs to accumulate events during trace execution and batch-send them when the trace completes.

**Before (Legacy):**
```javascript
// SDK sends one TraceEvent at the end
const trace = {
  traceId: "...",
  query: userQuery,
  response: llmResponse,
  model: "gpt-4",
  tokensTotal: 150,
  latencyMs: 1200
};

await fetch("/api/v1/traces/ingest", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(trace)
});
```

**After (Canonical Events):**
```javascript
// SDK accumulates events during execution
const events = [];

// When trace starts
events.push({
  event_type: "trace_start",
  // ... canonical event structure
});

// When retrieval happens
events.push({
  event_type: "retrieval",
  // ... canonical event structure
});

// When tool is called
events.push({
  event_type: "tool_call",
  // ... canonical event structure
});

// When LLM is called
events.push({
  event_type: "llm_call",
  // ... canonical event structure
});

// When trace completes
events.push({
  event_type: "trace_end",
  // ... canonical event structure
});

// Batch send all events
await fetch("/api/v1/events/ingest", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(events)
});
```

### Step 2: Update Event Structure

Use the canonical event format. See `SDK_CANONICAL_EVENTS_REFERENCE.md` for complete examples.

**Key Changes:**
- Events use `event_type` field instead of implicit structure
- Each event has `span_id` and `parent_span_id` for hierarchy
- Attributes are nested under event-type-specific keys (`llm_call`, `tool_call`, etc.)
- All events share common fields: `tenant_id`, `project_id`, `environment`, `trace_id`, `timestamp`

### Step 3: Instrument Operations

The SDK must hook into application operations to capture events:

```javascript
class ObservaSDK {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.events = [];
    this.currentTraceId = null;
    this.spanStack = []; // For tracking parent-child relationships
  }

  // Start a new trace
  startTrace(options = {}) {
    this.currentTraceId = generateUUID();
    const rootSpanId = generateUUID();
    
    this.events.push({
      tenant_id: this.tenantId,
      project_id: this.projectId,
      environment: this.environment,
      trace_id: this.currentTraceId,
      span_id: rootSpanId,
      parent_span_id: null,
      timestamp: new Date().toISOString(),
      event_type: "trace_start",
      attributes: {
        trace_start: {
          name: options.name || null,
          metadata: options.metadata || null
        }
      }
    });

    this.spanStack = [rootSpanId];
    return this.currentTraceId;
  }

  // Track an LLM call
  trackLLMCall(options) {
    const spanId = generateUUID();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.events.push({
      tenant_id: this.tenantId,
      project_id: this.projectId,
      environment: this.environment,
      trace_id: this.currentTraceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      timestamp: options.startTime || new Date().toISOString(),
      event_type: "llm_call",
      attributes: {
        llm_call: {
          model: options.model,
          input: options.input,
          output: options.output,
          input_tokens: options.inputTokens,
          output_tokens: options.outputTokens,
          total_tokens: options.totalTokens,
          latency_ms: options.latencyMs,
          finish_reason: options.finishReason,
          response_id: options.responseId,
          system_fingerprint: options.systemFingerprint,
          time_to_first_token_ms: options.timeToFirstTokenMs,
          streaming_duration_ms: options.streamingDurationMs,
          cost: options.cost
        }
      }
    });

    return spanId;
  }

  // Track a tool call
  trackToolCall(options) {
    const spanId = generateUUID();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.events.push({
      tenant_id: this.tenantId,
      project_id: this.projectId,
      environment: this.environment,
      trace_id: this.currentTraceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      timestamp: options.startTime || new Date().toISOString(),
      event_type: "tool_call",
      attributes: {
        tool_call: {
          tool_name: options.toolName,
          args: options.args,
          result: options.result,
          result_status: options.resultStatus || "success",
          latency_ms: options.latencyMs,
          error_message: options.errorMessage || null
        }
      }
    });

    return spanId;
  }

  // Track a retrieval
  trackRetrieval(options) {
    const spanId = generateUUID();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.events.push({
      tenant_id: this.tenantId,
      project_id: this.projectId,
      environment: this.environment,
      trace_id: this.currentTraceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      timestamp: options.timestamp || new Date().toISOString(),
      event_type: "retrieval",
      attributes: {
        retrieval: {
          retrieval_context_ids: options.contextIds,
          retrieval_context_hashes: options.contextHashes,
          k: options.k,
          top_k: options.k,
          similarity_scores: options.similarityScores,
          latency_ms: options.latencyMs
        }
      }
    });

    return spanId;
  }

  // Track an error
  trackError(options) {
    const spanId = generateUUID();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.events.push({
      tenant_id: this.tenantId,
      project_id: this.projectId,
      environment: this.environment,
      trace_id: this.currentTraceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      timestamp: options.timestamp || new Date().toISOString(),
      event_type: "error",
      attributes: {
        error: {
          error_type: options.errorType,
          error_message: options.errorMessage,
          stack_trace: options.stackTrace || null,
          context: options.context || null
        }
      }
    });

    return spanId;
  }

  // End trace and send events
  async endTrace(options = {}) {
    if (!this.currentTraceId) {
      throw new Error("No active trace. Call startTrace() first.");
    }

    const rootSpanId = this.spanStack[0];

    // Calculate totals
    const llmEvents = this.events.filter(e => e.event_type === "llm_call");
    const totalTokens = llmEvents.reduce((sum, e) => 
      sum + (e.attributes.llm_call?.total_tokens || 0), 0
    );
    const totalCost = llmEvents.reduce((sum, e) => 
      sum + (e.attributes.llm_call?.cost || 0), 0
    );
    const totalLatency = calculateTotalLatency(this.events);

    // Add trace_end event
    this.events.push({
      tenant_id: this.tenantId,
      project_id: this.projectId,
      environment: this.environment,
      trace_id: this.currentTraceId,
      span_id: rootSpanId,
      parent_span_id: null,
      timestamp: new Date().toISOString(),
      event_type: "trace_end",
      attributes: {
        trace_end: {
          total_latency_ms: totalLatency,
          total_tokens: totalTokens,
          total_cost: totalCost,
          outcome: options.outcome || "success"
        }
      }
    });

    // Send all events
    await this.sendEvents(this.events);

    // Reset for next trace
    const traceId = this.currentTraceId;
    this.currentTraceId = null;
    this.events = [];
    this.spanStack = [];

    return traceId;
  }

  // Send events to API
  async sendEvents(events) {
    const response = await fetch(`${this.apiUrl}/api/v1/events/ingest`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(events)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Unknown error" }));
      throw new Error(`Failed to send events: ${error.message || response.statusText}`);
    }

    return response.json();
  }
}
```

### Step 4: Update API Endpoint

Change from `/api/v1/traces/ingest` to `/api/v1/events/ingest`:

```javascript
// OLD
const endpoint = "/api/v1/traces/ingest";

// NEW
const endpoint = "/api/v1/events/ingest";
```

### Step 5: Handle Authentication

The authentication remains the same - use Bearer token with API key:

```javascript
headers: {
  "Authorization": `Bearer ${apiKey}`,
  "Content-Type": "application/json"
}
```

## API Endpoint Details

### POST /api/v1/events/ingest

**URL:** `https://observa-api.vercel.app/api/v1/events/ingest`

**Method:** POST

**Headers:**
- `Authorization: Bearer <API_KEY>` (required)
- `Content-Type: application/json` (for JSON array)
- `Content-Type: application/x-ndjson` (for NDJSON streaming)

**Request Body:**

Option 1: JSON Array (Recommended for most cases)
```json
[
  {
    "tenant_id": "...",
    "project_id": "...",
    "environment": "prod",
    "trace_id": "...",
    "span_id": "...",
    "parent_span_id": null,
    "timestamp": "2024-01-01T00:00:00Z",
    "event_type": "trace_start",
    "attributes": { ... }
  },
  {
    "event_type": "llm_call",
    "attributes": { ... }
  }
]
```

Option 2: NDJSON (For streaming/large traces)
```
{"event_type":"trace_start","trace_id":"...","span_id":"...",...}
{"event_type":"llm_call","trace_id":"...","span_id":"...",...}
{"event_type":"trace_end","trace_id":"...","span_id":"...",...}
```

**Response:**
```json
{
  "success": true,
  "event_count": 5,
  "message": "Events ingested successfully"
}
```

**Error Responses:**

400 Bad Request:
```json
{
  "error": {
    "code": "INVALID_PAYLOAD",
    "message": "Request validation failed",
    "details": {
      "validation_errors": [...]
    }
  }
}
```

403 Forbidden:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Event tenant_id does not match API key tenant"
  }
}
```

## Complete Example

See `SDK_IMPLEMENTATION_EXAMPLE.md` for a complete working example.

## Migration Checklist

- [ ] Update SDK to accumulate events instead of single TraceEvent
- [ ] Add methods for tracking tool calls (`trackToolCall`)
- [ ] Add methods for tracking retrievals (`trackRetrieval`)
- [ ] Add methods for tracking errors (`trackError`)
- [ ] Update LLM tracking to use canonical event format
- [ ] Implement span hierarchy tracking (parent_span_id)
- [ ] Change API endpoint from `/traces/ingest` to `/events/ingest`
- [ ] Update event structure to match canonical format
- [ ] Test with all event types (llm_call, tool_call, retrieval, error, output, trace_start, trace_end)
- [ ] Verify events appear correctly in dashboard

## Backward Compatibility

The legacy `/api/v1/traces/ingest` endpoint will continue to work for existing SDK versions. However, it only captures basic LLM call information and doesn't support tool calls, retrievals, or hierarchical spans.

**Recommendation:** Migrate as soon as possible to unlock full observability features.

## Support

For questions or issues during migration:
1. Review `SDK_CANONICAL_EVENTS_REFERENCE.md` for event format details
2. Check `SDK_IMPLEMENTATION_EXAMPLE.md` for code examples
3. Test with the simulation script: `scripts/load-simulation-events.js`


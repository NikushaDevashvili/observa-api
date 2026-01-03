# SDK Migration Guide

Complete guide for migrating from legacy TraceEvent format to canonical events.

> **See also**: [SDK Installation](./installation.md) | [Event Reference](./events-reference.md)

## Overview

**Current State (Legacy):**
- SDK sends a single `TraceEvent` to `/api/v1/traces/ingest`
- Only captures LLM call information
- Missing: tool calls, retrievals, errors, hierarchical spans

**Target State (Canonical Events):**
- SDK sends multiple canonical events to `/api/v1/events/ingest`
- Captures all operations: LLM calls, tool calls, retrievals, errors
- Supports hierarchical span relationships
- Batch sends events at trace completion

## Why Migrate?

1. **Complete Observability**: Capture tool calls, retrievals, web searches
2. **Error Tracking**: Track errors at each operation level
3. **Hierarchical Spans**: Represent nested operations
4. **Agentic Workflows**: Support multiple LLM calls in a single trace
5. **Better Debugging**: See the full execution flow

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

// When LLM is called
events.push({
  event_type: "llm_call",
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

Use the canonical event format. See [Event Reference](./events-reference.md) for complete examples.

**Key Changes:**
- Events use `event_type` field
- Each event has `span_id` and `parent_span_id` for hierarchy
- Attributes are nested under event-type-specific keys
- All events share common fields: `tenant_id`, `project_id`, `environment`, `trace_id`, `timestamp`

### Step 3: Update API Endpoint

Change from `/api/v1/traces/ingest` to `/api/v1/events/ingest`:

```javascript
// OLD
const endpoint = "/api/v1/traces/ingest";

// NEW
const endpoint = "/api/v1/events/ingest";
```

## Complete Example

See [SDK Implementation Examples](./examples.md) for complete working examples.

## Migration Checklist

- [ ] Update SDK to accumulate events instead of single TraceEvent
- [ ] Change endpoint from `/api/v1/traces/ingest` to `/api/v1/events/ingest`
- [ ] Update event structure to canonical format
- [ ] Add support for tool calls, retrievals, errors
- [ ] Implement span hierarchy (parent_span_id)
- [ ] Test with sample traces
- [ ] Verify events appear in dashboard

## Related Documentation

- [Event Reference](./events-reference.md) - Complete event format reference
- [SDK Examples](./examples.md) - Working code examples
- [API Endpoints](../api/endpoints.md) - API documentation

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md) or contact support.


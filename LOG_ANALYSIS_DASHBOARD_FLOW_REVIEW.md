# Log Analysis & Dashboard Flow - Complete Review

This document provides a comprehensive review of the entire process from SDK sending data to dashboard display, including all architectural decisions and their rationale.

---

## 🚀 Complete Flow: From SDK to Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│          STEP 0: SDK/CLIENT GENERATES EVENTS                    │
│                                                                 │
│  Application Code:                                              │
│    const traceId = observa.startTrace({...});                  │
│    observa.llmCall({model: "gpt-4", input: "...", ...});      │
│    observa.toolCall({tool_name: "web_search", ...});          │
│    observa.endTrace();                                         │
│                                                                 │
│  SDK accumulates events in memory during trace execution        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│          STEP 1: SDK SENDS EVENTS TO API                        │
│                                                                 │
│  POST /api/v1/events/ingest                                     │
│  Headers: Authorization: Bearer <API_KEY>                       │
│  Body: JSON array or NDJSON of canonical events                │
│                                                                 │
│  Events sent:                                                   │
│  [                                                              │
│    {event_type: "trace_start", ...},                           │
│    {event_type: "llm_call", ...},                              │
│    {event_type: "tool_call", ...},                             │
│    {event_type: "error", ...},                                 │
│    {event_type: "trace_end", ...}                              │
│  ]                                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   1. LOG INGESTION                              │
│  POST /api/v1/events/ingest (Canonical Events)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   2. VALIDATION & PROCESSING                   │
│  • API Key validation                                           │
│  • Rate limiting & quota checks                                 │
│  • Payload validation (Zod schemas)                              │
│  • Secrets scrubbing                                            │
│  • UUID validation                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   3. DUAL STORAGE (HTAP Pattern)               │
│                                                                 │
│  ┌──────────────────────────┐    ┌──────────────────────────┐  │
│  │   A. Tinybird (OLAP)     │    │  B. PostgreSQL (OLTP)   │  │
│  │                          │    │                          │  │
│  │  • All canonical events  │    │  • Trace summaries only  │  │
│  │  • Event-by-event        │    │  • One row per trace     │  │
│  │  • Analytical queries    │    │  • Operational queries   │  │
│  │  • Aggregations          │    │  • Fast lookups          │  │
│  └──────────────────────────┘    └──────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   4. SIGNAL GENERATION (Layer 2)              │
│  • Deterministic signals (latency, errors, spikes)             │
│  • Stored as canonical events (event_type="error")             │
│  • Forwarded to Tinybird                                        │
│  • Triggers Layer 3/4 analysis for high-severity signals        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   5. TRACE SUMMARY STORAGE                      │
│  • Extract llm_call events                                      │
│  • Compute basic issues detection                               │
│  • Store in PostgreSQL analysis_results                         │
│  • Update conversation/session metrics                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   6. DASHBOARD QUERIES                          │
│                                                                 │
│  ┌──────────────────────────┐    ┌──────────────────────────┐  │
│  │   A. Metrics (Tinybird)   │    │  B. Traces (PostgreSQL)  │  │
│  │                          │    │                          │  │
│  │  • Latency (P50/P95/P99) │    │  • Trace list             │  │
│  │  • Error rates           │    │  • Trace details         │  │
│  │  • Cost metrics          │    │  • Issues count           │  │
│  │  • Token usage           │    │  • Fast availability     │  │
│  │  • Signal counts         │    │                          │  │
│  └──────────────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Flow Breakdown

### Phase 0: SDK/Client Sending Data

**Location:** SDK (client-side code)

**Process:**

1. **SDK Initialization**:

   ```typescript
   const observa = new ObservaSDK({
     apiKey: "sk_...", // API key (contains tenant_id, project_id)
     environment: "prod", // dev or prod
     agentName: "my-app", // Optional: agent/service name
     version: "1.0.0", // Optional: version
   });
   ```

2. **Trace Execution** (Application code):

   ```typescript
   // Start trace
   const traceId = observa.startTrace({
     conversationId: "conv-123",
     sessionId: "session-456",
     userId: "user-789",
   });

   // During execution, SDK accumulates events
   observa.llmCall({
     model: "gpt-4",
     input: "What is the weather?",
     output: "Sunny, 72°F",
     tokens: 150,
     latency_ms: 1200,
   });

   observa.toolCall({
     tool_name: "web_search",
     args: {...},
     result: {...},
   });

   // End trace - SDK batches and sends all events
   await observa.endTrace();
   ```

3. **Event Accumulation**:

   - SDK maintains array of events: `this.events = []`
   - Each method call (`llmCall()`, `toolCall()`, etc.) adds event to array
   - Events share same `trace_id` but have unique `span_id`
   - Parent-child relationships via `parent_span_id`

4. **Batch Sending** (when `endTrace()` called):
   ```typescript
   // SDK sends all accumulated events at once
   await fetch(`${apiUrl}/api/v1/events/ingest`, {
     method: "POST",
     headers: {
       Authorization: `Bearer ${apiKey}`,
       "Content-Type": "application/json", // or "application/x-ndjson"
     },
     body: JSON.stringify(events), // Array of canonical events
   });
   ```

**Key Decisions:**

- **Batch Sending**: Events accumulated and sent at trace end (not per-event)
  - **Why**: Reduces HTTP overhead, ensures all events in trace sent together
  - **Benefit**: Better trace completeness, fewer network requests
- **Format**: JSON array (recommended) or NDJSON (for streaming)
  - **JSON Array**: Simple, works for most cases
  - **NDJSON**: Better for very large traces, streaming scenarios
- **Authentication**: Bearer token with API key (contains tenant/project context)
  - API key format: `sk_...` (server key) or `pk_...` (publishable key)
  - API key contains `tenant_id` and optionally `project_id`

**Example: What Gets Sent**

When `observa.endTrace()` is called, SDK sends HTTP POST request:

```http
POST /api/v1/events/ingest HTTP/1.1
Host: api.observa.ai
Authorization: Bearer sk_live_abc123...
Content-Type: application/json

[
  {
    "tenant_id": "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
    "project_id": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
    "environment": "prod",
    "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
    "span_id": "550e8400-e29b-41d4-a716-446655440000",
    "parent_span_id": null,
    "timestamp": "2024-01-01T12:00:00.000Z",
    "event_type": "trace_start",
    "conversation_id": "conv-123",
    "session_id": "session-456",
    "user_id": "user-789",
    "agent_name": "customer-support-bot",
    "version": "1.2.3",
    "attributes": {
      "trace_start": {
        "name": "Customer Support Chat",
        "metadata": {"message_index": 1}
      }
    }
  },
  {
    "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
    "span_id": "660e8400-e29b-41d4-a716-446655440001",
    "parent_span_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-01T12:00:00.100Z",
    "event_type": "llm_call",
    "attributes": {
      "llm_call": {
        "model": "gpt-4",
        "input": "What is the weather?",
        "output": "Sunny, 72°F",
        "input_tokens": 10,
        "output_tokens": 12,
        "total_tokens": 22,
        "latency_ms": 850,
        "finish_reason": "stop"
      }
    }
  },
  {
    "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
    "span_id": "770e8400-e29b-41d4-a716-446655440002",
    "parent_span_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-01T12:00:00.200Z",
    "event_type": "tool_call",
    "attributes": {
      "tool_call": {
        "tool_name": "web_search",
        "args": {"query": "weather"},
        "result": {"temp": "72°F"},
        "result_status": "success",
        "latency_ms": 120
      }
    }
  },
  {
    "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
    "span_id": "550e8400-e29b-41d4-a716-446655440000",
    "parent_span_id": null,
    "timestamp": "2024-01-01T12:00:01.000Z",
    "event_type": "trace_end",
    "attributes": {
      "trace_end": {
        "total_latency_ms": 1000,
        "total_tokens": 22,
        "outcome": "success"
      }
    }
  }
]
```

**SDK Response Handling:**

API responds with:

```json
{
  "success": true,
  "event_count": 4,
  "message": "Events ingested successfully"
}
```

If validation fails, SDK receives error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "validation_errors": [
        { "field": "events[2].span_id", "message": "must be a valid UUIDv4" }
      ]
    }
  }
}
```

**Code Reference:**

- `SDK_IMPLEMENTATION_EXAMPLE.md` - Complete SDK implementation
- `SDK_MIGRATION_GUIDE.md` - Migration from legacy format
- `SDK_CANONICAL_EVENTS_REFERENCE.md` - Event format specification

---

### Phase 1: Event Ingestion (`/api/v1/events/ingest`)

**Location:** `src/routes/events.ts`

**Process:**

1. **Authentication**: API key validation via `apiKeyMiddleware`

   - Extracts `tenantId` and `projectId` from API key
   - Validates key hasn't been revoked

2. **Rate Limiting**: `rateLimitMiddleware`

   - Prevents abuse per tenant/project

3. **Quota Check**: `quotaMiddleware`

   - Validates monthly event quota hasn't been exceeded

4. **Payload Parsing**:

   - Supports NDJSON (`application/x-ndjson`) or JSON array
   - Validates each event size (max 1MB per event)

5. **Validation**:

   - Zod schema validation (`batchEventsSchema`)
   - UUID format validation (trace_id, span_id)
   - Tenant/project ID matching with API key context

6. **Secrets Scrubbing**: `SecretsScrubbingService`
   - Scans event attributes for secrets (API keys, tokens, etc.)
   - Replaces with placeholders
   - Stores scrubbing metadata for signal generation

**Key Decision:** Support both NDJSON and JSON array formats for flexibility.

---

### Phase 2: Dual Storage Architecture (HTAP Pattern)

**Decision:** Store data in both Tinybird (OLAP) and PostgreSQL (OLTP)

#### A. Tinybird Storage (Analytical Data Plane)

**Location:** `src/services/canonicalEventService.ts`

**What Gets Stored:**

- **All canonical events** (llm_call, tool_call, error, trace_start, trace_end, output, etc.)
- **Signal events** (stored as `event_type="error"` with signal metadata)
- **Event-by-event granularity**

**Format:**

```typescript
{
  tenant_id,
    project_id,
    environment,
    trace_id,
    span_id,
    parent_span_id,
    timestamp,
    event_type,
    conversation_id,
    session_id,
    user_id, // Required (empty string if null)
    agent_name,
    version,
    route, // Optional (null if not provided)
    attributes_json; // JSON string of event-specific data
}
```

**Why Tinybird:**

1. **Analytical Queries**: Fast aggregations (P95 latency, error rates, cost metrics)
2. **Time-Series Data**: Optimized for time-range queries
3. **Scalability**: Handles high-volume event ingestion
4. **Columnar Storage**: Efficient for analytical workloads

**Key Decision:** Use `conversation_id`, `session_id`, `user_id` as required fields (empty strings instead of null) to satisfy Tinybird's strict type checking.

---

#### B. PostgreSQL Storage (Operational Data Plane)

**Location:** `src/services/traceService.ts` → `storeTraceData()`

**What Gets Stored:**

- **Trace summaries only** (one row per trace_id)
- **Extracted from llm_call events** during ingestion
- **Basic issues detection** computed inline

**Format:** `analysis_results` table with:

- Trace metadata (trace_id, tenant_id, project_id, timestamp)
- LLM call data (query, response, model, tokens, latency)
- Basic issues flags (computed from error/tool_call events)
- Conversation tracking (conversation_id, session_id, user_id, message_index)

**Why PostgreSQL:**

1. **Fast Operational Queries**: Trace lookups by ID, list views
2. **Immediate Availability**: Data available instantly (no Tinybird lag)
3. **Relational Queries**: Join with conversations, sessions, users
4. **Dashboard Compatibility**: Legacy endpoints still work

**Key Decision:** Store trace summaries in Postgres for "10-minute dashboard path" - ensures dashboard shows non-zero counts even if Tinybird queries lag.

**Code Reference:**

```typescript
// src/routes/events.ts:437-439
// --- Basic "issues" detection (10-minute dashboard path) ---
// We compute a minimal issues summary from canonical events and store it into Postgres
// so the dashboard can show non-zero counts even if Tinybird signals/queries lag.
```

---

### Phase 3: Signal Generation (Layer 2)

**Location:** `src/services/signalsService.ts`

**Process:**

1. **Deterministic Signals**: Run on 100% of events

   - Latency thresholds (>5s = high, >2s = medium)
   - Token/cost spikes (>100k tokens, >$10 cost)
   - Tool errors and timeouts
   - Secret detection (from scrubbing metadata)

2. **Signal Storage**:

   - Signals stored as canonical events
   - `event_type="error"` with signal data in `attributes_json.signal`
   - Forwarded to Tinybird for querying

3. **Analysis Triggering**:
   - High/medium severity signals trigger Layer 3/4 analysis
   - Queued via `analysisDispatcher` (async, non-blocking)

**Key Decision:** Use `event_type="error"` as placeholder for signals (instead of dedicated `signal` event type) to simplify schema.

---

### Phase 4: Trace Summary Extraction

**Location:** `src/routes/events.ts` → `storeTraceSummaries()`

**Process:**

1. **Group Events by trace_id**: Collect all events for each trace

2. **Extract Main Event**: Find `llm_call` event (required for summary)

3. **Compute Basic Issues**:

   ```typescript
   // Error events count
   const errorEvents = traceEvents.filter((e) => e.event_type === "error");

   // Tool failures
   const toolFailures = toolCalls.filter(
     (e) => e.attributes?.tool_call?.result_status !== "success"
   );

   // Tool timeouts
   const toolTimeouts = toolCalls.filter(
     (e) => e.attributes?.tool_call?.result_status === "timeout"
   );

   const hasIssues =
     errorEvents.length > 0 ||
     toolFailures.length > 0 ||
     toolTimeouts.length > 0;
   ```

4. **Create TraceEvent Object**: Convert canonical events to legacy `TraceEvent` format

5. **Store in PostgreSQL**: Via `TraceService.storeTraceData()`

6. **Update Conversations/Sessions**: Track conversation and session metrics

**Key Decision:** Compute basic issues inline during ingestion to provide immediate dashboard visibility, even before Layer 2/3/4 signals are processed.

---

### Phase 5: Dashboard Queries

**Location:** `src/routes/dashboard.ts`, `src/services/dashboardMetricsService.ts`

#### A. Metrics from Tinybird

**Endpoints:**

- `GET /api/v1/dashboard/overview` - Comprehensive metrics
- `GET /api/v1/dashboard/alerts` - High-severity signals
- `GET /api/v1/metrics/latency` - Latency percentiles
- `GET /api/v1/metrics/error-rates` - Error rate metrics
- `GET /api/v1/costs/overview` - Cost breakdowns

**Data Source:** Tinybird `canonical_events` table

**Queries:**

- **Latency**: `quantile(0.95)(latency_ms)` from `llm_call` events
- **Error Rates**: Count `event_type='error'` vs total traces
- **Cost**: Sum `attributes_json.llm_call.cost`
- **Tokens**: Sum `attributes_json.llm_call.total_tokens`
- **Signals**: Query `event_type='error'` with `attributes_json.signal`

**Key Decision:** All analytical metrics come from Tinybird for performance and scalability.

---

#### B. Traces from PostgreSQL

**Endpoints:**

- `GET /api/v1/traces` - Trace list (with pagination)
- `GET /api/v1/traces/:traceId` - Trace details

**Data Source:** PostgreSQL `analysis_results` table

**Why PostgreSQL for Traces:**

1. **Fast Lookups**: Indexed by `trace_id` (UNIQUE constraint)
2. **Immediate Availability**: No Tinybird lag
3. **Relational Queries**: Can join with conversations, sessions
4. **Legacy Compatibility**: Existing endpoints continue to work

**Key Decision:** Keep trace detail queries in PostgreSQL for operational speed, while using Tinybird for aggregations.

---

## 🎯 Key Architectural Decisions

### Decision 1: Dual Storage (HTAP Pattern)

**What:** Store data in both Tinybird (OLAP) and PostgreSQL (OLTP)

**Why:**

- **Tinybird**: Optimized for analytical queries (aggregations, time-series)
- **PostgreSQL**: Optimized for operational queries (lookups, joins)
- **Best of Both Worlds**: Fast analytics + fast operational queries

**Trade-offs:**

- ✅ Fast aggregations (Tinybird)
- ✅ Fast lookups (PostgreSQL)
- ✅ Immediate availability (PostgreSQL)
- ❌ Data duplication (acceptable for this use case)
- ❌ Slight complexity (two storage systems)

**Code Reference:**

```typescript
// src/services/traceService.ts:122-125
/**
 * Store trace data immediately in PostgreSQL (SOTA: HTAP pattern)
 * This ensures trace data is available for operational queries
 * while Tinybird handles analytical workloads
 */
```

---

### Decision 2: Store Trace Summaries in Postgres

**What:** Extract `llm_call` events and store as trace summaries in `analysis_results` table

**Why:**

1. **10-Minute Dashboard Path**: Dashboard needs immediate data, can't wait for Tinybird queries
2. **Legacy Compatibility**: Existing trace endpoints continue to work
3. **Basic Issues Detection**: Compute inline during ingestion for immediate visibility

**Code Reference:**

```typescript
// src/routes/events.ts:437-439
// --- Basic "issues" detection (10-minute dashboard path) ---
// We compute a minimal issues summary from canonical events and store it into Postgres
// so the dashboard can show non-zero counts even if Tinybird signals/queries lag.
```

**Trade-offs:**

- ✅ Immediate dashboard visibility
- ✅ Legacy endpoint compatibility
- ✅ Fast trace lookups
- ❌ Data duplication (trace data in both systems)
- ❌ Requires extraction logic during ingestion

---

### Decision 3: Signals as Canonical Events

**What:** Store signals as `event_type="error"` with signal metadata in `attributes_json.signal`

**Why:**

1. **Unified Schema**: All events in same `canonical_events` table
2. **Simpler Queries**: Query signals like any other event
3. **Time-Series**: Signals have timestamps, can be queried by time range

**Alternative Considered:** Dedicated `signals` table or event type

- **Rejected**: Would require separate query logic and schema

**Code Reference:**

```typescript
// src/services/signalsService.ts:244
event_type: "error" as EventType, // Use error type as placeholder for signals
attributes_json: JSON.stringify({
  signal: {
    signal_name, signal_type, signal_value,
    signal_severity, metadata
  }
})
```

---

### Decision 4: Basic Issues Detection Inline

**What:** Compute basic issues (errors, tool failures, timeouts) during ingestion

**Why:**

1. **Immediate Visibility**: Dashboard shows issues right away
2. **No Dependency on Signals**: Works even if Layer 2/3/4 signals lag
3. **Simple Logic**: Fast, deterministic checks

**What Gets Detected:**

- Error events (`event_type="error"`)
- Tool failures (`tool_call.result_status !== "success"`)
- Tool timeouts (`tool_call.result_status === "timeout"`)

**Code Reference:**

```typescript
// src/routes/events.ts:440-462
const errorEvents = traceEvents.filter((e) => e.event_type === "error");
const toolFailures = toolCalls.filter(
  (e) => e.attributes?.tool_call?.result_status !== "success"
);
const toolTimeouts = toolCalls.filter(
  (e) => e.attributes?.tool_call?.result_status === "timeout"
);
const hasIssues =
  errorEvents.length > 0 || toolFailures.length > 0 || toolTimeouts.length > 0;
```

---

### Decision 5: Required Fields in Tinybird

**What:** `conversation_id`, `session_id`, `user_id` are required (not nullable) in Tinybird

**Why:**

1. **Tinybird Strict Type Checking**: Doesn't allow nullable strings in some contexts
2. **Consistent Schema**: All events have same structure
3. **Query Simplicity**: No null checks needed in queries

**Implementation:**

```typescript
// src/routes/events.ts:268-277
const conversationId =
  event.conversation_id && event.conversation_id.trim() !== ""
    ? event.conversation_id
    : "";
// Use empty string instead of null
```

**Trade-offs:**

- ✅ Simpler Tinybird schema
- ✅ No null handling in queries
- ❌ Empty strings instead of nulls (semantic difference)

---

### Decision 6: Async Signal Processing

**What:** Signal generation runs asynchronously (non-blocking)

**Why:**

1. **Ingestion Speed**: Don't slow down event ingestion
2. **Fault Tolerance**: Signal failures don't break ingestion
3. **Scalability**: Can process signals in background workers

**Code Reference:**

```typescript
// src/routes/events.ts:321-326
// Generate Layer 2 signals (async, non-blocking)
SignalsService.processEvents(tinybirdEvents).catch((error) => {
  console.error("[Events API] Failed to process signals (non-fatal):", error);
});
```

---

## 📈 Data Flow Summary

### Complete Path: SDK → Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  SDK/CLIENT (Application Code)                              │
│  • User's application runs                                  │
│  • SDK methods called (llmCall, toolCall, etc.)            │
│  • Events accumulated in memory                            │
│  • endTrace() triggers batch send                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ HTTP POST /api/v1/events/ingest
                        │ Authorization: Bearer <API_KEY>
                        │ Body: JSON array of events
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  API ENDPOINT (events.ts)                                   │
│  • API key validation (extract tenant_id, project_id)      │
│  • Rate limiting & quota checks                            │
│  • Payload validation (Zod schemas)                        │
│  • Secrets scrubbing                                        │
│  • UUID validation                                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Validated & scrubbed events
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  DUAL STORAGE (HTAP Pattern)                                │
│                                                              │
│  ┌────────────────────────┐    ┌────────────────────────┐  │
│  │  Tinybird (OLAP)       │    │  PostgreSQL (OLTP)    │  │
│  │                        │    │                        │  │
│  │  All events stored     │    │  Trace summaries      │  │
│  │  • llm_call            │    │  • Extract llm_call   │  │
│  │  • tool_call           │    │  • Compute issues     │  │
│  │  • error               │    │  • Store one row/trace│  │
│  │  • trace_start/end     │    │                        │  │
│  └────────────────────────┘    └────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Events stored
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  SIGNAL GENERATION (Layer 2)                                │
│  • Process events asynchronously                            │
│  • Generate deterministic signals                           │
│  • Store signals as events (event_type="error")            │
│  • Forward to Tinybird                                      │
│  • Trigger Layer 3/4 analysis (if high severity)           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Signals stored in Tinybird
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  DASHBOARD QUERIES                                          │
│                                                              │
│  Frontend Request:                                          │
│  GET /api/v1/dashboard/overview                             │
│                                                              │
│  ┌────────────────────────┐    ┌────────────────────────┐  │
│  │  Tinybird Queries      │    │  PostgreSQL Queries   │  │
│  │                        │    │                        │  │
│  │  • Latency metrics     │    │  • Trace list         │  │
│  │  • Error rates         │    │  • Trace details      │  │
│  │  • Cost metrics        │    │  • Basic issues count │  │
│  │  • Token usage         │    │                        │  │
│  │  • Signal counts       │    │                        │  │
│  └────────────────────────┘    └────────────────────────┘  │
│                                                              │
│  Response: Combined metrics + traces                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ JSON response
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  DASHBOARD (Frontend)                                       │
│  • Display metrics (latency, errors, cost)                 │
│  • Show trace list                                          │
│  • Display alerts/signals                                   │
│  • Show trace details                                       │
└─────────────────────────────────────────────────────────────┘
```

### Ingestion Path (Detailed)

```
SDK Sends Events
    ↓
[API Validation & Scrubbing]
    ↓
    ├─→ Tinybird (all events)
    │   └─→ Analytical queries
    │
    └─→ PostgreSQL (trace summaries)
        ├─→ Basic issues detection
        └─→ Operational queries
```

### Dashboard Path

```
Dashboard Request
    ↓
    ├─→ Tinybird Queries
    │   ├─→ Latency metrics (P50/P95/P99)
    │   ├─→ Error rates
    │   ├─→ Cost metrics
    │   ├─→ Token usage
    │   └─→ Signal counts
    │
    └─→ PostgreSQL Queries
        ├─→ Trace list
        ├─→ Trace details
        └─→ Issues count (basic)
```

---

## 🔧 Technical Implementation Details

### Event Format Conversion

**Canonical Event → Tinybird Format:**

- Convert camelCase to snake_case
- Serialize `attributes` to `attributes_json` (JSON string)
- Handle nullable fields (use empty strings for required fields)
- Format timestamps (ISO 8601)

**Canonical Events → Trace Summary:**

- Extract `llm_call` event
- Combine with `trace_start`, `trace_end`, `output` events
- Compute basic issues
- Convert to `TraceEvent` format
- Store in PostgreSQL

### Query Patterns

**Tinybird (ClickHouse SQL):**

```sql
-- Latency percentile
SELECT quantile(0.95)(
  toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))
) as p95
FROM canonical_events
WHERE tenant_id = '...' AND event_type = 'llm_call'
```

**PostgreSQL:**

```sql
-- Trace lookup
SELECT * FROM analysis_results
WHERE trace_id = $1 AND tenant_id = $2
```

---

## 🎯 Why These Decisions?

### 1. **HTAP Pattern (Dual Storage)**

- **Problem**: Need both analytical and operational queries
- **Solution**: Use right tool for right job (Tinybird for analytics, PostgreSQL for operations)
- **Result**: Fast aggregations + fast lookups

### 2. **Trace Summaries in Postgres**

- **Problem**: Dashboard needs immediate data, Tinybird queries can lag
- **Solution**: Store trace summaries in Postgres during ingestion
- **Result**: Dashboard shows data immediately, even if Tinybird is slow

### 3. **Basic Issues Detection Inline**

- **Problem**: Need to show issues count quickly
- **Solution**: Compute basic issues during ingestion
- **Result**: Dashboard shows non-zero counts immediately

### 4. **Signals as Events**

- **Problem**: Need to query signals by time range, severity, etc.
- **Solution**: Store signals as canonical events in Tinybird
- **Result**: Unified query interface for all events

### 5. **Async Signal Processing**

- **Problem**: Signal generation shouldn't slow down ingestion
- **Solution**: Process signals asynchronously
- **Result**: Fast ingestion, signals processed in background

---

## 📊 Current State

### ✅ What's Working

1. **Event Ingestion**: `/api/v1/events/ingest` accepts canonical events
2. **Dual Storage**: Events stored in both Tinybird and PostgreSQL
3. **Signal Generation**: Layer 2 signals generated and stored
4. **Trace Summaries**: Stored in PostgreSQL for fast access
5. **Dashboard Metrics**: Queries from Tinybird (latency, errors, cost, tokens)
6. **Dashboard Alerts**: Queries signals from Tinybird
7. **Trace Queries**: Fast lookups from PostgreSQL

### 🔄 What Could Be Improved

1. **Signal Event Type**: Consider dedicated `signal` event type instead of `error`
2. **Caching**: Add Redis caching for dashboard overview (5-15 min TTL)
3. **Real-time Updates**: WebSocket support for real-time alerts
4. **Query Optimization**: Optimize Tinybird queries for large datasets
5. **Data Consistency**: Ensure Tinybird and PostgreSQL stay in sync

---

## 📚 Related Documentation

- `DASHBOARD_IMPLEMENTATION_SUMMARY.md` - Dashboard API implementation
- `EVENT_CONTRACTS_AUDIT.md` - Event schema documentation
- `TRACE_DATA_REFERENCE.md` - Trace data structure
- `ANALYSIS_RESCOPE_IMPLEMENTATION.md` - Analysis layer details

---

## 🎓 Key Takeaways

1. **HTAP Pattern**: Use both OLAP (Tinybird) and OLTP (PostgreSQL) for different query patterns
2. **Immediate Availability**: Store trace summaries in Postgres for fast dashboard access
3. **Unified Event Model**: All events (including signals) stored in same Tinybird table
4. **Async Processing**: Don't block ingestion on analysis/signal generation
5. **Basic Detection First**: Compute simple issues inline, complex analysis later

---

**Last Updated:** Review of current implementation
**Status:** ✅ Complete flow documented with rationale

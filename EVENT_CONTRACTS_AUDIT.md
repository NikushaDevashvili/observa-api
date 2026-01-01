# Event Contracts Audit

This document audits the current event contracts across all Observa repos and defines the canonical event envelope for the trace-first architecture.

## Current State (Pre-Migration)

### observa-api Current Contracts

#### 1. Trace Ingestion Endpoint
- **Endpoint**: `POST /api/v1/traces/ingest`
- **Auth**: Bearer JWT token (contains tenantId, projectId, environment)
- **Request Body**: `TraceEvent` (see `src/types.ts`)
- **Response**: `{ success: true, traceId: string, message: string }`

#### 2. TraceEvent Interface (Legacy)
Located in: `src/types.ts`

```typescript
interface TraceEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  timestamp: string;
  tenantId: string;
  projectId: string;
  environment: "dev" | "prod";
  query: string;              // LLM input
  context?: string;           // Retrieval context
  model?: string;             // LLM model name
  metadata?: Record<string, any>;
  response: string;           // LLM output
  responseLength: number;
  tokensPrompt?: number | null;
  tokensCompletion?: number | null;
  tokensTotal?: number | null;
  latencyMs: number;
  timeToFirstTokenMs?: number | null;
  streamingDurationMs?: number | null;
  status?: number | null;
  statusText?: string | null;
  finishReason?: string | null;
  responseId?: string | null;
  systemFingerprint?: string | null;
  headers?: Record<string, string>;
  // Conversation tracking
  conversationId?: string;
  sessionId?: string;
  userId?: string;
  messageIndex?: number;
  parentMessageId?: string;
}
```

#### 3. TinybirdEvent Interface (Legacy)
Located in: `src/types.ts`

Snake_case version of TraceEvent used for Tinybird ingestion. All fields from TraceEvent are present with snake_case naming.

#### 4. Current Data Flow
1. SDK sends `TraceEvent` to `/api/v1/traces/ingest`
2. API validates with `traceEventSchema` (Zod)
3. API stores in Postgres `analysis_results` table
4. API forwards to Tinybird as `TinybirdEvent`
5. API triggers async analysis via `AnalysisService.analyzeTrace()`

#### 5. Current Query Endpoints
- `GET /api/v1/traces` - List traces (from `analysis_results` table)
- `GET /api/v1/traces/:traceId` - Get trace detail (from `analysis_results` table)

## Target State (Canonical Event Envelope)

### Canonical Event Types
Located in: `src/types/events.ts`

The canonical event envelope supports multiple event types:
- `llm_call` - LLM request/response
- `tool_call` - Tool/function execution
- `retrieval` - RAG/vector retrieval operations
- `error` - Error events
- `feedback` - User feedback (likes/dislikes)
- `output` - Final output events
- `trace_start` - Trace lifecycle start
- `trace_end` - Trace lifecycle end

### Canonical Event Structure

```typescript
interface CanonicalEvent {
  // Required fields
  tenant_id: string;
  project_id: string;
  environment: "dev" | "prod";
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  timestamp: string; // ISO 8601
  event_type: EventType;
  
  // Strongly recommended
  conversation_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  agent_name?: string | null;
  version?: string | null;
  route?: string | null;
  
  // Event-specific attributes (JSON)
  attributes: EventAttributes;
}
```

### Translation Strategy

**Backward Compatibility**: Legacy `TraceEvent` will be translated to canonical events via `EventTranslationService.traceEventToCanonicalEvents()`:

1. One `TraceEvent` → Multiple `CanonicalEvent`s:
   - If model/query/response present → `llm_call` event
   - If response present → `output` event
   - If no events created → minimal `trace_start` event

2. Translation preserves all data:
   - All fields from `TraceEvent` are mapped to appropriate canonical event attributes
   - Conversation tracking fields preserved
   - Metadata preserved

3. Tinybird Format:
   - Canonical events converted to `TinybirdCanonicalEvent` (snake_case)
   - `attributes` field serialized as JSON string (`attributes_json`)

## Migration Path

### Phase 1: Add Canonical Events (Current)
- ✅ Define canonical event types in `src/types/events.ts`
- ✅ Create `EventTranslationService` for backward compatibility
- ✅ Keep existing `/api/v1/traces/ingest` endpoint working

### Phase 2: New Ingestion Endpoint (Next)
- Add `/api/v1/events/ingest` endpoint (batch NDJSON)
- Accept canonical events directly
- Keep `/api/v1/traces/ingest` as compatibility layer (translates to canonical events)

### Phase 3: Query Migration (Later)
- Move trace queries from `analysis_results` table to Tinybird
- Query canonical events by trace_id, event_type, etc.
- Keep `analysis_results` as legacy compatibility layer

## Endpoints Audit

### Current Endpoints

1. **POST /api/v1/traces/ingest**
   - Status: Active (legacy, will be compatibility layer)
   - Input: TraceEvent (JSON)
   - Auth: JWT Bearer token
   - Output: `{ success: true, traceId: string }`

2. **GET /api/v1/traces**
   - Status: Active (reads from `analysis_results`)
   - Query params: limit, offset, issueType, projectId
   - Auth: Session token
   - Output: `{ success: true, traces: [], pagination: {} }`

3. **GET /api/v1/traces/:traceId**
   - Status: Active (reads from `analysis_results`)
   - Auth: Session token
   - Output: `{ success: true, trace: {} }`

### Planned Endpoints

4. **POST /api/v1/events/ingest** (New)
   - Status: To be implemented
   - Input: Batch NDJSON of CanonicalEvent
   - Auth: API Key (sk_ or pk_)
   - Output: `{ success: true, event_count: number }`

5. **GET /api/v1/events** (New)
   - Status: To be implemented
   - Query canonical events from Tinybird
   - Supports filtering by trace_id, event_type, etc.

## Data Model Comparison

| Legacy (TraceEvent) | Canonical (CanonicalEvent) | Notes |
|-------------------|---------------------------|-------|
| Single event per trace | Multiple events per trace | More granular |
| Fixed schema | Flexible attributes JSON | Extensible |
| Analysis-first | Trace-first | Focus shift |
| Stored in `analysis_results` | Stored in Tinybird/ClickHouse | OLAP-optimized |
| Hallucination flags | Generic signals | More flexible |

## Backward Compatibility Guarantees

1. `/api/v1/traces/ingest` will continue to work
2. Legacy `TraceEvent` → canonical events translation is lossless
3. All existing fields preserved in canonical event attributes
4. Query endpoints will continue to work during migration


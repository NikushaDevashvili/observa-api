# Canonical Events Reference for SDK

Complete reference for the canonical event format that the SDK should send to `/api/v1/events/ingest`.

## Event Types

The SDK can send these event types:

1. `trace_start` - Beginning of a trace
2. `llm_call` - LLM API call (OpenAI, Anthropic, etc.)
3. `tool_call` - Function/tool execution (database queries, API calls, web searches, etc.)
4. `retrieval` - RAG/vector database retrieval
5. `error` - Error that occurred during execution
6. `output` - Final output/response
7. `feedback` - User feedback (like/dislike/rating)
8. `trace_end` - End of trace with summary statistics

## Common Event Fields

All events share these fields:

```typescript
{
  // Required
  tenant_id: string;           // From API key (auto-filled by SDK)
  project_id: string;          // From API key (auto-filled by SDK)
  environment: "dev" | "prod"; // From API key or SDK config
  trace_id: string;            // UUIDv4 - same for all events in a trace
  span_id: string;             // UUIDv4 - unique per event/operation
  parent_span_id: string | null; // UUIDv4 - parent span_id for hierarchy
  timestamp: string;           // ISO 8601 format (e.g., "2024-01-01T00:00:00.000Z")
  event_type: EventType;       // One of the 8 event types above
  
  // Optional (but recommended)
  conversation_id?: string | null;  // For conversation tracking
  session_id?: string | null;       // For session tracking
  user_id?: string | null;          // End user identifier
  agent_name?: string | null;       // Agent/service name
  version?: string | null;          // Agent version
  route?: string | null;            // API route/endpoint
  
  // Event-specific attributes
  attributes: EventAttributes; // See below for each event type
}
```

## Event Examples

### 1. trace_start Event

Marks the beginning of a trace. Should be the first event sent.

```json
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
  "route": "/api/chat",
  "attributes": {
    "trace_start": {
      "name": "Customer Support Chat",
      "metadata": {
        "message_index": 1,
        "channel": "web"
      }
    }
  }
}
```

### 2. llm_call Event

Tracks an LLM API call (OpenAI, Anthropic, etc.).

```json
{
  "tenant_id": "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  "project_id": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  "environment": "prod",
  "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
  "span_id": "660e8400-e29b-41d4-a716-446655440001",
  "parent_span_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-01T12:00:00.100Z",
  "event_type": "llm_call",
  "attributes": {
    "llm_call": {
      "model": "gpt-4",
      "input": "What is the weather today?",
      "output": "The weather is sunny and 72°F.",
      "input_tokens": 10,
      "output_tokens": 12,
      "total_tokens": 22,
      "latency_ms": 850,
      "time_to_first_token_ms": 120,
      "streaming_duration_ms": 730,
      "finish_reason": "stop",
      "response_id": "chatcmpl-abc123",
      "system_fingerprint": "fp_abc123def456",
      "temperature": 0.7,
      "max_tokens": 1000,
      "cost": 0.00066,
      "prompt_template_id": "template_v1"
    }
  }
}
```

**Required Fields:**
- `model`: Model name (e.g., "gpt-4", "claude-3-opus")
- `latency_ms`: Total request latency in milliseconds

**Optional but Recommended:**
- `input`: User query/input (may be redacted in production)
- `output`: LLM response (may be redacted in production)
- `input_tokens`, `output_tokens`, `total_tokens`: Token counts
- `finish_reason`: "stop", "length", "tool_calls", "error"
- `time_to_first_token_ms`: Time until first token (for streaming)
- `streaming_duration_ms`: Total streaming duration
- `response_id`: Provider's response ID
- `system_fingerprint`: Provider's system fingerprint
- `cost`: Estimated cost in USD

### 3. tool_call Event

Tracks a function/tool execution (database queries, API calls, web searches, calculators, etc.).

```json
{
  "tenant_id": "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  "project_id": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  "environment": "prod",
  "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
  "span_id": "770e8400-e29b-41d4-a716-446655440002",
  "parent_span_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-01T12:00:00.200Z",
  "event_type": "tool_call",
  "attributes": {
    "tool_call": {
      "tool_name": "web_search",
      "args": {
        "query": "weather today San Francisco",
        "limit": 10
      },
      "result": {
        "results": [
          {
            "title": "Weather in San Francisco",
            "url": "https://weather.com/...",
            "snippet": "Sunny, 72°F"
          }
        ]
      },
      "result_status": "success",
      "latency_ms": 245,
      "error_message": null
    }
  }
}
```

**Required Fields:**
- `tool_name`: Name of the tool/function (e.g., "web_search", "database_query", "calculator")
- `result_status`: "success", "error", or "timeout"
- `latency_ms`: Execution latency in milliseconds

**Optional but Recommended:**
- `args`: Tool arguments (may be redacted)
- `result`: Tool result/output
- `error_message`: Error message if result_status is "error" or "timeout"

### 4. retrieval Event

Tracks a RAG/vector database retrieval operation.

```json
{
  "tenant_id": "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  "project_id": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  "environment": "prod",
  "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
  "span_id": "880e8400-e29b-41d4-a716-446655440003",
  "parent_span_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-01T12:00:00.050Z",
  "event_type": "retrieval",
  "attributes": {
    "retrieval": {
      "retrieval_context_ids": ["doc-123", "doc-456", "doc-789"],
      "retrieval_context_hashes": ["hash-abc", "hash-def", "hash-ghi"],
      "k": 3,
      "top_k": 3,
      "similarity_scores": [0.95, 0.87, 0.82],
      "latency_ms": 180
    }
  }
}
```

**Required Fields:**
- `latency_ms`: Retrieval latency in milliseconds

**Optional but Recommended:**
- `retrieval_context_ids`: Array of document/context IDs
- `retrieval_context_hashes`: Array of content hashes
- `k` or `top_k`: Number of results retrieved
- `similarity_scores`: Array of similarity scores (0-1)

### 5. error Event

Tracks an error that occurred during execution.

```json
{
  "tenant_id": "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  "project_id": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  "environment": "prod",
  "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
  "span_id": "990e8400-e29b-41d4-a716-446655440004",
  "parent_span_id": "770e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2024-01-01T12:00:00.300Z",
  "event_type": "error",
  "attributes": {
    "error": {
      "error_type": "tool_error",
      "error_message": "Database connection timeout",
      "stack_trace": "Error: Connection timeout\n    at Database.query (db.js:45:12)\n    at Tool.call (tool.js:23:5)",
      "context": {
        "tool_name": "database_query",
        "attempt": 1,
        "timeout_ms": 30000
      }
    }
  }
}
```

**Required Fields:**
- `error_type`: Error category (e.g., "tool_error", "llm_error", "retrieval_error", "timeout_error")
- `error_message`: Human-readable error message

**Optional but Recommended:**
- `stack_trace`: Stack trace string
- `context`: Additional error context (object)

### 6. output Event

Tracks the final output/response of the trace.

```json
{
  "tenant_id": "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  "project_id": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  "environment": "prod",
  "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
  "span_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "parent_span_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-01T12:00:01.000Z",
  "event_type": "output",
  "attributes": {
    "output": {
      "final_output": "The weather is sunny and 72°F in San Francisco today.",
      "output_length": 56
    }
  }
}
```

**Required Fields:**
- None (but include `final_output` or `output_length`)

**Optional:**
- `final_output`: Final output text (may be redacted)
- `output_length`: Length of output in characters
- `final_output_hash`: Hash of output for deduplication

### 7. feedback Event

Tracks user feedback (like/dislike/rating/correction).

```json
{
  "tenant_id": "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  "project_id": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  "environment": "prod",
  "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
  "span_id": "bb0e8400-e29b-41d4-a716-446655440006",
  "parent_span_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-01T12:00:05.000Z",
  "event_type": "feedback",
  "attributes": {
    "feedback": {
      "type": "rating",
      "rating": 4,
      "comment": "Helpful response, but could be more detailed",
      "outcome": "success"
    }
  }
}
```

**Required Fields:**
- `type`: "like", "dislike", "rating", or "correction"

**Optional:**
- `rating`: 1-5 scale (for "rating" type)
- `comment`: User comment
- `outcome`: "success", "failure", or "partial"

### 8. trace_end Event

Marks the end of a trace with summary statistics. Should be the last event sent.

```json
{
  "tenant_id": "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  "project_id": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  "environment": "prod",
  "trace_id": "42fb5c68-5e71-4b57-92ba-2fe978e4ff84",
  "span_id": "550e8400-e29b-41d4-a716-446655440000",
  "parent_span_id": null,
  "timestamp": "2024-01-01T12:00:01.050Z",
  "event_type": "trace_end",
  "attributes": {
    "trace_end": {
      "total_latency_ms": 1050,
      "total_tokens": 22,
      "total_cost": 0.00066,
      "outcome": "success"
    }
  }
}
```

**Required Fields:**
- None (but include summary statistics)

**Optional but Recommended:**
- `total_latency_ms`: Total trace latency
- `total_tokens`: Sum of all token usage
- `total_cost`: Sum of all costs
- `outcome`: "success", "error", or "timeout"

## Span Hierarchy

Use `parent_span_id` to create hierarchical relationships:

- `trace_start` and `trace_end`: `parent_span_id = null` (root level)
- `retrieval`, `tool_call`, `llm_call`: `parent_span_id = root_span_id` (child of root)
- Nested operations: `parent_span_id = parent_operation_span_id`

**Example Hierarchy:**
```
Trace (root_span_id)
  ├── Retrieval (parent_span_id = root_span_id)
  ├── Tool Call: web_search (parent_span_id = root_span_id)
  │   └── Error (parent_span_id = tool_call_span_id)
  └── LLM Call (parent_span_id = root_span_id)
      └── Tool Call: calculator (parent_span_id = llm_call_span_id)
```

## Batch Sending

Send all events for a trace in a single request:

```javascript
const events = [
  traceStartEvent,
  retrievalEvent,
  toolCallEvent,
  llmCallEvent,
  outputEvent,
  traceEndEvent
];

await fetch("/api/v1/events/ingest", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(events)
});
```

## TypeScript Types

See `src/types/events.ts` in this repository for TypeScript type definitions.

## Validation

The API validates events using Zod schemas. Ensure:
- All required fields are present
- UUIDs are valid UUIDv4 format
- Timestamps are ISO 8601 format
- Event types match exactly (case-sensitive)
- Attributes match the expected structure for each event type


# Canonical Events Reference

Complete reference for the canonical event format used by the Observa SDK.

## Event Types

The SDK supports these event types:

1. `trace_start` - Beginning of a trace
2. `llm_call` - LLM API call (OpenAI, Anthropic, etc.)
3. `tool_call` - Function/tool execution
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
  tenant_id: string;           // From API key (auto-filled)
  project_id: string;          // From API key (auto-filled)
  environment: "dev" | "prod"; // From API key or config
  trace_id: string;            // UUIDv4 - same for all events
  span_id: string;             // UUIDv4 - unique per event
  parent_span_id: string | null; // UUIDv4 - parent span_id
  timestamp: string;           // ISO 8601 format
  event_type: EventType;       // One of the 8 types above
  
  // Optional (recommended)
  conversation_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  agent_name?: string | null;
  version?: string | null;
  route?: string | null;
  
  // Event-specific attributes
  attributes: EventAttributes;
}
```

## Event Examples

### trace_start

```json
{
  "event_type": "trace_start",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "span_id": "660e8400-e29b-41d4-a716-446655440001",
  "parent_span_id": null,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "attributes": {
    "trace_start": {
      "name": "Customer Support Chat",
      "metadata": {
        "feature": "chat",
        "version": "2.0"
      }
    }
  }
}
```

### llm_call

```json
{
  "event_type": "llm_call",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "span_id": "770e8400-e29b-41d4-a716-446655440002",
  "parent_span_id": "660e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2024-01-01T00:00:01.200Z",
  "attributes": {
    "llm_call": {
      "model": "gpt-4",
      "input": "What is the weather today?",
      "output": "The weather is sunny and warm.",
      "tokens_prompt": 10,
      "tokens_completion": 20,
      "tokens_total": 30,
      "latency_ms": 1200,
      "cost": 0.001
    }
  }
}
```

### tool_call

```json
{
  "event_type": "tool_call",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "span_id": "880e8400-e29b-41d4-a716-446655440003",
  "parent_span_id": "770e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2024-01-01T00:00:00.500Z",
  "attributes": {
    "tool_call": {
      "tool_name": "get_weather",
      "args": { "location": "San Francisco" },
      "result": { "temperature": 72, "condition": "sunny" },
      "result_status": "success",
      "latency_ms": 150
    }
  }
}
```

### retrieval

```json
{
  "event_type": "retrieval",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "span_id": "990e8400-e29b-41d4-a716-446655440004",
  "parent_span_id": "660e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2024-01-01T00:00:00.100Z",
  "attributes": {
    "retrieval": {
      "context_ids": ["doc-1", "doc-2", "doc-3"],
      "k": 3,
      "latency_ms": 200
    }
  }
}
```

### error

```json
{
  "event_type": "error",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "span_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "parent_span_id": "880e8400-e29b-41d4-a716-446655440003",
  "timestamp": "2024-01-01T00:00:00.600Z",
  "attributes": {
    "error": {
      "error_type": "tool_error",
      "error_message": "Tool call timeout",
      "stack": "Error: Tool call timeout\n  at toolCall()"
    }
  }
}
```

## Span Hierarchy

Events form a tree structure using `span_id` and `parent_span_id`:

```
trace_start (span_id: root, parent: null)
  ├── retrieval (span_id: ret1, parent: root)
  ├── llm_call (span_id: llm1, parent: root)
  │   ├── tool_call (span_id: tool1, parent: llm1)
  │   │   └── error (span_id: err1, parent: tool1)
  │   └── tool_call (span_id: tool2, parent: llm1)
  └── trace_end (span_id: root, parent: null)
```

## Related Documentation

- [SDK Installation](./installation.md)
- [SDK Examples](./examples.md)
- [SDK Migration Guide](./migration.md)
- [API Endpoints](../api/endpoints.md)

---

**Full Reference**: See [SDK_CANONICAL_EVENTS_REFERENCE.md](../../SDK_CANONICAL_EVENTS_REFERENCE.md) for complete details.


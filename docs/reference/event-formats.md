# Event Formats Reference

Complete reference for canonical event formats.

## Event Types

1. `trace_start` - Beginning of trace
2. `llm_call` - LLM API call
3. `tool_call` - Tool/function execution
4. `retrieval` - RAG/vector retrieval
5. `error` - Error occurrence
6. `output` - Final output
7. `feedback` - User feedback
8. `trace_end` - End of trace

## Common Fields

All events include:

```typescript
{
  tenant_id: string;
  project_id: string;
  environment: "dev" | "prod";
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  timestamp: string; // ISO 8601
  event_type: EventType;
  conversation_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  agent_name?: string | null;
  version?: string | null;
  route?: string | null;
  attributes: EventAttributes;
}
```

## Event-Specific Attributes

### trace_start

```typescript
attributes: {
  trace_start: {
    name?: string;
    metadata?: Record<string, any>;
  }
}
```

### llm_call

```typescript
attributes: {
  llm_call: {
    model: string;
    input: string;
    output: string;
    tokens_prompt: number;
    tokens_completion: number;
    tokens_total: number;
    latency_ms: number;
    cost?: number;
  }
}
```

### tool_call

```typescript
attributes: {
  tool_call: {
    tool_name: string;
    args: Record<string, any>;
    result?: any;
    result_status: "success" | "error";
    latency_ms: number;
  }
}
```

### retrieval

```typescript
attributes: {
  retrieval: {
    context_ids: string[];
    k: number;
    latency_ms: number;
  }
}
```

### error

```typescript
attributes: {
  error: {
    error_type: string;
    error_message: string;
    stack?: string;
  }
}
```

## Related Documentation

- [SDK Event Reference](../sdk/events-reference.md)
- [SDK Examples](../sdk/examples.md)
- [Full Reference](../../SDK_CANONICAL_EVENTS_REFERENCE.md)

---

**Full Reference**: See [SDK_CANONICAL_EVENTS_REFERENCE.md](../../SDK_CANONICAL_EVENTS_REFERENCE.md) for complete details.


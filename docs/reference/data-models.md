# Data Models Reference

Complete reference for Observa data models.

## Trace

Represents a single execution of your AI application.

```typescript
interface Trace {
  trace_id: string;
  tenant_id: string;
  project_id: string;
  environment: "dev" | "prod";
  conversation_id?: string;
  session_id?: string;
  user_id?: string;
  query?: string;
  response?: string;
  model?: string;
  tokens_total?: number;
  latency_ms?: number;
  cost?: number;
  status?: "success" | "error";
  timestamp: string;
}
```

## Session

Represents a user's interaction period.

```typescript
interface Session {
  session_id: string;
  user_id?: string;
  conversation_id?: string;
  tenant_id: string;
  project_id: string;
  started_at: string;
  ended_at?: string;
  message_count: number;
  status: "active" | "ended";
}
```

## User

Represents an end user of your AI application.

```typescript
interface User {
  user_id: string;
  first_seen: string;
  last_seen: string;
  trace_count: number;
  total_cost: number;
  total_tokens: number;
}
```

## Issue

Represents a detected problem.

```typescript
interface Issue {
  timestamp: string;
  issue_type: string;
  severity: "high" | "medium" | "low";
  trace_id: string;
  span_id?: string;
  details: Record<string, any>;
}
```

## Cost Metrics

```typescript
interface CostMetrics {
  total: number;
  avg_per_trace: number;
  by_model: Record<string, number>;
  by_route: Record<string, number>;
}
```

## Related Documentation

- [Event Formats](./event-formats.md)
- [API Endpoints](../api/endpoints.md)

---

**Full Reference**: See [TRACE_DATA_REFERENCE.md](../../TRACE_DATA_REFERENCE.md) for complete details.


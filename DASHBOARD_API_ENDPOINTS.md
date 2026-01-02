# Dashboard API Endpoints Reference

## SOTA API Design for Dashboard Display

This document describes the API endpoints created to support the dashboard information architecture, following SOTA practices and the Trace-First plan.

---

## 🎯 Overview

All endpoints require authentication via Bearer token (session token):

```
Authorization: Bearer <SESSION_TOKEN>
```

All endpoints support optional `projectId` query parameter for filtering by project.

---

## 📊 Dashboard Overview

### `GET /api/v1/dashboard/overview`

Get comprehensive dashboard overview with all key metrics.

**Query Parameters:**

- `projectId` (optional): UUID - Filter by project
- `days` (optional): number - Number of days to look back (default: 1)
- `startTime` (optional): ISO 8601 timestamp - Start time (overrides days)
- `endTime` (optional): ISO 8601 timestamp - End time (overrides days)

**Response:**

```json
{
  "success": true,
  "period": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-02T00:00:00Z",
    "days": 1
  },
  "metrics": {
    "error_rate": {
      "rate": 2.5,
      "total": 1000,
      "errors": 25,
      "error_types": {
        "tool_error": 10,
        "tool_timeout": 5,
        "error_event": 10
      }
    },
    "latency": {
      "p50": 250.5,
      "p95": 1250.8,
      "p99": 3500.2,
      "avg": 450.3,
      "min": 50,
      "max": 5000
    },
    "cost": {
      "total": 125.5,
      "avg_per_trace": 0.1255,
      "by_model": {
        "gpt-4o": 100.0,
        "gpt-4o-mini": 25.5
      },
      "by_route": {
        "/api/chat": 100.0,
        "/api/agent": 25.5
      }
    },
    "active_issues": {
      "high": 25,
      "medium": 50,
      "low": 100,
      "total": 175
    },
    "tokens": {
      "total": 500000,
      "avg_per_trace": 500,
      "input": 250000,
      "output": 250000,
      "by_model": {
        "gpt-4o": {
          "total": 400000,
          "avg": 400
        }
      }
    },
    "success_rate": 97.5,
    "trace_count": 1000
  },
  "timestamp": "2025-01-02T12:00:00Z"
}
```

**Use Cases:**

- Dashboard overview page
- Key metrics cards
- Alert banner data source

---

## 🚨 Alerts

### `GET /api/v1/dashboard/alerts`

Get active alerts (high/medium severity signals) for the specified time period.

**Query Parameters:**

- `projectId` (optional): UUID - Filter by project
- `hours` (optional): number - Hours to look back (default: 24)
- `severity` (optional): "high" | "medium" - Filter by severity (default: "high")

**Response:**

```json
{
  "success": true,
  "period": {
    "start": "2025-01-01T12:00:00Z",
    "end": "2025-01-02T12:00:00Z",
    "hours": 24
  },
  "alerts": [
    {
      "signal_name": "tool_error",
      "severity": "high",
      "count": 10,
      "latest_timestamp": "2025-01-02T11:30:00Z",
      "trace_ids": ["trace-1", "trace-2", ...],
      "metadata_sample": {
        "tool_name": "database_query",
        "error_message": "Connection timeout"
      }
    },
    {
      "signal_name": "high_latency",
      "severity": "high",
      "count": 5,
      "latest_timestamp": "2025-01-02T11:00:00Z",
      "trace_ids": ["trace-3", ...],
      "metadata_sample": {
        "model": "gpt-4o",
        "threshold_ms": 5000
      }
    }
  ],
  "total": 15
}
```

**Use Cases:**

- Alert banner on dashboard
- Critical issues notification
- Real-time monitoring

---

## 🔍 Issues Timeline

### `GET /api/v1/issues`

Get issues timeline (signals) with filtering and pagination.

**Query Parameters:**

- `projectId` (optional): UUID - Filter by project
- `severity` (optional): "high" | "medium" | "low" - Filter by severity
- `signalNames` (optional): comma-separated list - Filter by signal names (e.g., "tool_error,high_latency")
- `startTime` (optional): ISO 8601 timestamp - Start time
- `endTime` (optional): ISO 8601 timestamp - End time
- `limit` (optional): number - Results per page (default: 50)
- `offset` (optional): number - Pagination offset (default: 0)

**Response:**

```json
{
  "success": true,
  "period": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-02T00:00:00Z"
  },
  "issues": [
    {
      "timestamp": "2025-01-02T11:30:00Z",
      "issue_type": "tool_error",
      "severity": "high",
      "trace_id": "uuid",
      "span_id": "uuid",
      "details": {
        "tool_name": "database_query",
        "error_message": "Connection timeout"
      },
      "signal_value": true,
      "signal_type": "error"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "has_more": true
  },
  "filters": {
    "severity": "high",
    "signal_names": "tool_error,high_latency"
  }
}
```

**Use Cases:**

- Issues timeline page
- Filterable issues list
- Issue investigation

### `GET /api/v1/issues/summary`

Get issues summary (aggregated by signal type and severity).

**Query Parameters:**

- `projectId` (optional): UUID - Filter by project
- `days` (optional): number - Days to look back (default: 1)

**Response:**

```json
{
  "success": true,
  "period": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-02T00:00:00Z",
    "days": 1
  },
  "summary": [
    {
      "signal_name": "tool_error",
      "severity": "high",
      "count": 10,
      "latest_timestamp": "2025-01-02T11:30:00Z",
      "trace_ids": ["trace-1", "trace-2", ...]
    },
    {
      "signal_name": "high_latency",
      "severity": "high",
      "count": 5,
      "latest_timestamp": "2025-01-02T11:00:00Z",
      "trace_ids": ["trace-3", ...]
    }
  ]
}
```

**Use Cases:**

- Issues summary widget
- Grouped issue display
- Quick issue overview

---

## 📈 Metrics

### `GET /api/v1/metrics/latency`

Get latency metrics (P50, P95, P99) optionally grouped by route or model.

**Query Parameters:**

- `projectId` (optional): UUID - Filter by project
- `groupBy` (optional): "route" | "model" - Group results
- `days` (optional): number - Days to look back (default: 30)
- `startTime` (optional): ISO 8601 timestamp
- `endTime` (optional): ISO 8601 timestamp

**Response (no grouping):**

```json
{
  "success": true,
  "period": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-31T00:00:00Z",
    "days": 30
  },
  "group_by": "none",
  "metrics": {
    "p50": 250.5,
    "p95": 1250.8,
    "p99": 3500.2,
    "avg": 450.3,
    "min": 50,
    "max": 5000,
    "count": 10000
  }
}
```

**Response (grouped by route):**

```json
{
  "success": true,
  "group_by": "route",
  "metrics": {
    "/api/chat": {
      "p50": 200,
      "p95": 1000,
      "p99": 3000,
      "avg": 400,
      "min": 50,
      "max": 4000,
      "count": 5000
    },
    "/api/agent": {
      "p50": 300,
      "p95": 1500,
      "p99": 4000,
      "avg": 500,
      "min": 100,
      "max": 5000,
      "count": 5000
    }
  }
}
```

**Use Cases:**

- Latency metrics dashboard
- Performance monitoring
- Route/model comparison

### `GET /api/v1/metrics/error-rates`

Get error rate metrics with breakdown by error type.

**Query Parameters:**

- `projectId` (optional): UUID - Filter by project
- `days` (optional): number - Days to look back (default: 30)
- `startTime` (optional): ISO 8601 timestamp
- `endTime` (optional): ISO 8601 timestamp

**Response:**

```json
{
  "success": true,
  "period": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-31T00:00:00Z",
    "days": 30
  },
  "error_rates": {
    "total": 10000,
    "errors": 250,
    "error_rate": 2.5,
    "error_types": {
      "tool_error": 100,
      "tool_timeout": 50,
      "error_event": 100
    }
  }
}
```

**Use Cases:**

- Error rate monitoring
- Error type breakdown
- Reliability metrics

---

## 💰 Costs

### `GET /api/v1/costs/overview`

Get cost overview with breakdowns by model and route.

**Query Parameters:**

- `projectId` (optional): UUID - Filter by project
- `days` (optional): number - Days to look back (default: 30)
- `startTime` (optional): ISO 8601 timestamp
- `endTime` (optional): ISO 8601 timestamp

**Response:**

```json
{
  "success": true,
  "period": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-31T00:00:00Z",
    "days": 30
  },
  "costs": {
    "total": 1250.5,
    "avg_per_trace": 0.1251,
    "by_model": {
      "gpt-4o": 1000.0,
      "gpt-4o-mini": 250.5
    },
    "by_route": {
      "/api/chat": 1000.0,
      "/api/agent": 250.5
    }
  },
  "timestamp": "2025-01-31T12:00:00Z"
}
```

**Use Cases:**

- Cost dashboard
- Cost breakdown by model/route
- Cost optimization analysis

---

## 🔧 Trace Detail Signals

### Get Signals for a Trace

Use the existing trace detail endpoint and enhance it with signals query:

**Existing:** `GET /api/v1/traces/:traceId`

**Enhancement:** The trace detail should include signals. Add signals query in the service layer.

**Signals Query Service:**

```typescript
SignalsQueryService.getTraceSignals(traceId, tenantId, projectId);
```

---

## 📋 Available Signal Types

### Layer 2 Signals (Always Available)

- `tool_error` - Tool call failed
- `tool_timeout` - Tool call timed out
- `tool_latency` - Tool latency >5s
- `high_latency` - LLM latency >5s
- `medium_latency` - LLM latency >2s
- `cost_spike` - Cost >$10/call
- `token_spike` - Tokens >100k
- `error_event` - General error event
- `contains_secrets` - Secrets/PII detected

### Layer 3 Signals (If Available)

- `embedding_cluster` - Clustered with similar traces
- `semantic_drift` - Semantic drift detected
- `duplicate_output` - Duplicate/spam output

### Layer 4 Signals (If Available)

- `faithfulness_score` - Answer faithfulness (0-1)
- `context_relevance_score` - Context relevance (0-1)
- `quality_score` - Overall quality (1-5)
- `potential_hallucination` - Potential hallucination detected

---

## 🎨 Response Format Standards

### Success Response

All endpoints follow this format:

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "ISO 8601"
}
```

### Error Response

All endpoints follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

**Error Codes:**

- `UNAUTHORIZED` - Missing/invalid auth token
- `INTERNAL_ERROR` - Server error
- `INVALID_PAYLOAD` - Invalid request parameters

---

## 🚀 Performance Considerations

1. **Caching**: Consider caching dashboard overview data (5-15 minute TTL)
2. **Pagination**: Issues endpoint supports pagination for large datasets
3. **Time Ranges**: Default to reasonable time ranges (1-30 days)
4. **Parallel Queries**: Dashboard overview fetches metrics in parallel
5. **Graceful Degradation**: Returns empty/default values if Tinybird queries fail

---

## 📚 Implementation Notes

### SQL Query Compatibility

The SQL queries in `DashboardMetricsService` use ClickHouse/Tinybird syntax:

- `quantile(0.95)(column)` for percentiles
- `JSON_EXTRACT_STRING(attributes_json, '$.path')` for JSON extraction
- Note: These may need adjustment based on actual Tinybird datasource schema

### Data Source

- **Signals**: Stored in Tinybird `canonical_events` table with `event_type="error"` and signal data in `attributes_json.signal`
- **Metrics**: Aggregated from `canonical_events` table (LLM calls, tool calls, etc.)
- **Costs**: Calculated from `llm_call.cost` in event attributes

### Backward Compatibility

- Old `analysis_results` table is still queried for backward compatibility
- New signals-based queries are the primary source
- Both can coexist during migration

---

## 🧪 Testing

### Test Dashboard Overview

```bash
curl -X GET "http://localhost:3000/api/v1/dashboard/overview?days=1" \
  -H "Authorization: Bearer <SESSION_TOKEN>"
```

### Test Alerts

```bash
curl -X GET "http://localhost:3000/api/v1/dashboard/alerts?hours=24&severity=high" \
  -H "Authorization: Bearer <SESSION_TOKEN>"
```

### Test Issues

```bash
curl -X GET "http://localhost:3000/api/v1/issues?severity=high&limit=50" \
  -H "Authorization: Bearer <SESSION_TOKEN>"
```

---

## ✅ Status

- ✅ Dashboard overview endpoint
- ✅ Alerts endpoint
- ✅ Issues timeline endpoint
- ✅ Issues summary endpoint
- ✅ Latency metrics endpoint
- ✅ Error rates endpoint
- ✅ Cost overview endpoint
- ✅ Signals query service
- ✅ Dashboard metrics service

**Ready for:** Frontend integration and dashboard UI implementation


# API Endpoints Reference

Complete reference for all Observa API endpoints.

> **Interactive Docs**: Visit `/api-docs` for Swagger UI with try-it-out functionality

## SDK Endpoints

### POST /api/v1/events/ingest

Ingest canonical events from SDK (primary SDK endpoint).

**Authentication**: API Key (Bearer token)

**Request Body**: JSON array or NDJSON of canonical events
- Content-Type: `application/json` (JSON array)
- Content-Type: `application/x-ndjson` (NDJSON, one event per line)

**Query Parameters**:
- Batch size limit: 1000 events per request
- Individual event size limit: 1MB

**Response**:
```json
{
  "success": true,
  "event_count": 5,
  "message": "Events ingested successfully"
}
```

**See**: [Event Reference](../sdk/events-reference.md)

---

### POST /api/v1/traces/ingest

Legacy trace ingestion endpoint (for backward compatibility).

**Authentication**: API Key (Bearer token)

**Request Body**: Single TraceEvent (JSON)

**Response**: 200 OK on success

---

## Trace Endpoints

### GET /api/v1/traces

List traces with filtering and pagination.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `limit` (default: 50): Results per page
- `offset` (default: 0): Pagination offset
- `issueType` (optional): Filter by issue type

**Response**:
```json
{
  "success": true,
  "traces": [...],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### GET /api/v1/traces/:traceId

Get detailed trace information.

**Authentication**: Session Token

**Query Parameters**:
- `format` (optional): `tree` for hierarchical format

**Response**:
```json
{
  "success": true,
  "trace": {
    "summary": {...},
    "spans": [...],
    "signals": [...]
  }
}
```

### GET /api/v1/traces/models

Get list of models used in traces.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `days` (optional): Days to look back (default: 30)

### GET /api/v1/traces/export

Export traces as CSV or JSON.

**Authentication**: Session Token

**Query Parameters**:
- `format` (optional): `csv` or `json` (default: `json`)
- `projectId` (optional): Filter by project
- `startTime` (optional): Start time (ISO 8601)
- `endTime` (optional): End time (ISO 8601)
- `limit` (optional): Max records to export

### GET /api/v1/traces/:traceId/export

Export a single trace.

**Authentication**: Session Token

**Query Parameters**:
- `format` (optional): `csv` or `json` (default: `json`)

---

## Session Endpoints

### GET /api/v1/sessions

List sessions with filtering.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `userId` (optional): Filter by user
- `limit` (default: 50): Results per page
- `offset` (default: 0): Pagination offset
- `activeOnly` (optional): Filter active sessions

**Response**:
```json
{
  "success": true,
  "sessions": [...],
  "pagination": {...}
}
```

### GET /api/v1/sessions/:sessionId

Get session details.

**Authentication**: Session Token

### GET /api/v1/sessions/:sessionId/traces

Get all traces in a session.

**Authentication**: Session Token

### GET /api/v1/sessions/:sessionId/analytics

Get session-level analytics.

**Authentication**: Session Token

---

## Conversation Endpoints

### GET /api/v1/conversations

List conversations with filtering.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `userId` (optional): Filter by user
- `hasIssues` (optional): Filter by issues (`true`/`false`)
- `limit` (default: 50): Results per page
- `offset` (default: 0): Pagination offset

**Response**:
```json
{
  "success": true,
  "conversations": [...],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### GET /api/v1/conversations/:conversationId

Get conversation details.

**Authentication**: Session Token

### GET /api/v1/conversations/:conversationId/messages

Get all messages in a conversation.

**Authentication**: Session Token

**Query Parameters**:
- `limit` (default: 100): Results per page
- `offset` (default: 0): Pagination offset

### GET /api/v1/conversations/:conversationId/analytics

Get conversation-level analytics.

**Authentication**: Session Token

---

## User Endpoints

### GET /api/v1/users

List users from AI application.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `days` (default: 30): Days to look back
- `startTime` (optional): Start time (ISO 8601)
- `endTime` (optional): End time (ISO 8601)
- `limit` (default: 50): Results per page
- `offset` (default: 0): Pagination offset

**Response**:
```json
{
  "success": true,
  "users": [
    {
      "user_id": "user-123",
      "first_seen": "2024-01-01T00:00:00Z",
      "last_seen": "2024-01-02T00:00:00Z",
      "trace_count": 10,
      "total_cost": 0.50,
      "total_tokens": 5000
    }
  ],
  "pagination": {...}
}
```

---

## Issue Endpoints

### GET /api/v1/issues

Get issues timeline with filtering.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `severity` (optional): `high` | `medium` | `low`
- `signalNames` (optional): Comma-separated signal names
- `startTime` (optional): Start time
- `endTime` (optional): End time
- `limit` (default: 50): Results per page
- `offset` (default: 0): Pagination offset

**Response**:
```json
{
  "success": true,
  "issues": [...],
  "pagination": {...}
}
```

### GET /api/v1/issues/summary

Get issues summary (aggregated).

**Authentication**: Session Token

---

## Cost Endpoints

### GET /api/v1/costs/overview

Get cost overview with breakdowns.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `days` (default: 30): Days to look back
- `startTime` (optional): Start time
- `endTime` (optional): End time

**Response**:
```json
{
  "success": true,
  "costs": {
    "total": 1250.50,
    "avg_per_trace": 0.125,
    "by_model": {...},
    "by_route": {...}
  }
}
```

---

## Dashboard Endpoints

### GET /api/v1/dashboard/overview

Get comprehensive dashboard metrics.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `days` (default: 1): Days to look back
- `startTime` (optional): Start time
- `endTime` (optional): End time

**Response**:
```json
{
  "success": true,
  "metrics": {
    "error_rate": {...},
    "latency": {...},
    "cost": {...},
    "active_issues": {...},
    "tokens": {...},
    "success_rate": 97.5,
    "trace_count": 1000
  }
}
```

### GET /api/v1/dashboard/alerts

Get active alerts (high/medium severity).

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `hours` (optional): Time window in hours (default: 24)

### GET /api/v1/dashboard/overview/time-series

Get time-series data for dashboard metrics.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `days` (optional): Days to look back (default: 7)
- `startTime` (optional): Start time (ISO 8601)
- `endTime` (optional): End time (ISO 8601)
- `interval` (optional): `hour`, `day`, `week` (default: `day`)

### GET /api/v1/dashboard/overview/comparison

Get comparison metrics between time periods.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `days` (optional): Days for current period (default: 7)
- `compareDays` (optional): Days for comparison period (default: 7)

### GET /api/v1/dashboard/metrics/breakdown

Get detailed metrics breakdown by dimension.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `dimension` (optional): `model`, `route`, `user` (default: `model`)
- `days` (optional): Days to look back (default: 7)

### GET /api/v1/dashboard/feedback

Get feedback metrics and summaries.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `days` (optional): Days to look back (default: 30)

### GET /api/v1/dashboard/feedback/debug

Get detailed feedback debug information.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `traceId` (optional): Filter by trace

### GET /api/v1/dashboard/health

Get dashboard-specific health metrics.

**Authentication**: Session Token

---

## Authentication Endpoints

### POST /api/v1/auth/signup

Create a new account (replaces `/onboarding/signup`).

**No Authentication Required**

**Request Body**:
```json
{
  "email": "your@email.com",
  "password": "your-secure-password",
  "companyName": "Your Company",
  "plan": "free"
}
```

**Response**:
```json
{
  "success": true,
  "user": {
    "id": "user-id",
    "email": "your@email.com",
    "tenantId": "abc-123-..."
  },
  "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionToken": "session-token-here",
  "tenantId": "abc-123-...",
  "projectId": "def-456-...",
  "message": "Account created successfully"
}
```

### POST /api/v1/auth/login

Login and get session token.

**Request Body**:
```json
{
  "email": "your@email.com",
  "password": "your-password"
}
```

### GET /api/v1/auth/me

Get current user information.

**Authentication**: Session Token

### GET /api/v1/auth/account

Get full account information.

**Authentication**: Session Token

### POST /api/v1/auth/logout

Logout and invalidate session token.

**Authentication**: Session Token

**Response**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## System Endpoints

### GET /health

Basic health check.

**No Authentication Required**

### GET /health/detailed

Detailed health check with dependency status.

**No Authentication Required**

### GET /api/v1/metrics

System metrics (admin).

**No Authentication Required** (or admin token)

### GET /api-docs

Interactive API documentation (Swagger UI).

**No Authentication Required**

---

## Analytics Endpoints

### GET /api/v1/analytics/overview

Get analytics overview with ML analysis metrics.

**Authentication**: Session Token

**Query Parameters**:
- `days` (optional): Days to look back (default: 30)

**Response**:
```json
{
  "success": true,
  "period": "30 days",
  "metrics": {
    "totalTraces": 1000,
    "hallucinationRate": 2.5,
    "avgQualityScore": 85,
    "issues": {
      "hallucinations": 25,
      "contextDrop": 10,
      "faithfulness": 5,
      "drift": 3,
      "costAnomaly": 2
    }
  }
}
```

### GET /api/v1/analytics/trends

Get analytics trends over time.

**Authentication**: Session Token

**Query Parameters**:
- `days` (optional): Days to look back (default: 30)
- `interval` (optional): `day`, `week`, `month` (default: `day`)

---

## Analysis Endpoints

### POST /api/v1/analysis/analyze

Explicitly request analysis for a trace.

**Authentication**: API Key (with `query` scope)

**Request Body**:
```json
{
  "trace_id": "uuid",
  "layers": ["layer3", "layer4"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Analysis job queued successfully",
  "trace_id": "uuid",
  "layers": ["layer4"],
  "status": "queued"
}
```

### GET /api/v1/analysis/queue/stats

Get analysis queue statistics.

**Authentication**: API Key (with `query` scope)

**Response**:
```json
{
  "success": true,
  "queue": {
    "waiting": 10,
    "active": 2,
    "completed": 1000,
    "failed": 5
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## Metrics Endpoints

### GET /api/v1/metrics/latency

Get latency metrics by route or model.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `groupBy` (optional): `route` | `model`
- `days` (optional): Days to look back (default: 30)
- `startTime` (optional): Start time (ISO 8601)
- `endTime` (optional): End time (ISO 8601)

**Response**:
```json
{
  "success": true,
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z",
    "days": 30
  },
  "group_by": "model",
  "metrics": {
    "p50": 150,
    "p95": 500,
    "p99": 1000,
    "avg": 200,
    "min": 50,
    "max": 2000
  }
}
```

### GET /api/v1/metrics/error-rates

Get error rates by tool or model/version.

**Authentication**: Session Token

**Query Parameters**:
- `projectId` (optional): Filter by project
- `days` (optional): Days to look back (default: 30)
- `startTime` (optional): Start time (ISO 8601)
- `endTime` (optional): End time (ISO 8601)

**Response**:
```json
{
  "success": true,
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z",
    "days": 30
  },
  "error_rates": {
    "total": 1000,
    "errors": 25,
    "error_rate": 2.5,
    "error_types": {
      "timeout": 10,
      "rate_limit": 5,
      "invalid_input": 10
    }
  }
}
```

---

## Tenant Endpoints

### DELETE /api/v1/tenants/:tenantId/tokens

Revoke all tokens for a tenant (JWT and Tinybird tokens).

**Authentication**: Admin/Session Token

**Response**:
```json
{
  "message": "Tokens revoked successfully for tenant {tenantId}",
  "tenantId": "abc-123-..."
}
```

### POST /api/v1/tenants/:tenantId/api-keys

Create a new API key for a tenant.

**Authentication**: Session Token

**Request Body**:
```json
{
  "name": "My API Key",
  "scopes": ["ingest", "query"]
}
```

**Response**:
```json
{
  "success": true,
  "apiKey": "sk_...",
  "name": "My API Key",
  "scopes": ["ingest", "query"],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

## Related Documentation

- [API Overview](./overview.md)
- [Authentication Guide](./authentication.md)
- [SDK Event Reference](../sdk/events-reference.md)

---

**Interactive Documentation**: Visit `/api-docs` for Swagger UI with try-it-out functionality.





# API Endpoints Reference

Complete reference for all Observa API endpoints.

> **Interactive Docs**: Visit `/api-docs` for Swagger UI with try-it-out functionality

## SDK Endpoints

### POST /api/v1/events/ingest

Ingest canonical events from SDK.

**Authentication**: API Key (Bearer token)

**Request Body**: JSON array or NDJSON of canonical events

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

---

## Authentication Endpoints

### POST /api/v1/onboarding/signup

Create a new account.

**No Authentication Required**

**Request Body**:
```json
{
  "email": "your@email.com",
  "companyName": "Your Company",
  "plan": "free"
}
```

**Response**:
```json
{
  "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tenantId": "abc-123-...",
  "projectId": "def-456-...",
  "environment": "prod"
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

## Related Documentation

- [API Overview](./overview.md)
- [Authentication Guide](./authentication.md)
- [SDK Event Reference](../sdk/events-reference.md)

---

**Interactive Documentation**: Visit `/api-docs` for Swagger UI with try-it-out functionality.


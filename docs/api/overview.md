# API Overview

Complete overview of the Observa API.

## Base URL

**Production**: `https://observa-api.vercel.app`  
**Development**: `http://localhost:3000`

> **Note**: The API is deployed on Vercel and supports serverless functions. Check `/health/detailed` for service status.

## Authentication

### API Keys (For SDK)

Use API keys (JWT tokens) for SDK authentication:

```
Authorization: Bearer <API_KEY>
```

API keys are obtained during signup or from the dashboard.

### Session Tokens (For Dashboard)

Use session tokens for dashboard API access:

```
Authorization: Bearer <SESSION_TOKEN>
```

Session tokens are obtained via login endpoint.

## API Endpoints

### SDK Endpoints

- `POST /api/v1/events/ingest` - Ingest canonical events (primary SDK endpoint, supports NDJSON and JSON array)
- `POST /api/v1/traces/ingest` - Legacy trace ingestion (backward compatibility)

### Dashboard Endpoints

**Traces**
- `GET /api/v1/traces` - List traces with filtering
- `GET /api/v1/traces/:traceId` - Get trace detail
- `GET /api/v1/traces/models` - List models used in traces
- `GET /api/v1/traces/export` - Export traces (CSV/JSON)
- `GET /api/v1/traces/:traceId/export` - Export single trace

**Sessions**
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/sessions/:sessionId` - Get session detail
- `GET /api/v1/sessions/:sessionId/traces` - Get traces in session
- `GET /api/v1/sessions/:sessionId/analytics` - Session analytics

**Conversations**
- `GET /api/v1/conversations` - List conversations
- `GET /api/v1/conversations/:conversationId` - Get conversation detail
- `GET /api/v1/conversations/:conversationId/messages` - Get conversation messages
- `GET /api/v1/conversations/:conversationId/analytics` - Conversation analytics

**Dashboard**
- `GET /api/v1/dashboard/overview` - Dashboard metrics overview
- `GET /api/v1/dashboard/overview/time-series` - Time-series metrics
- `GET /api/v1/dashboard/overview/comparison` - Comparison metrics
- `GET /api/v1/dashboard/metrics/breakdown` - Metrics breakdown
- `GET /api/v1/dashboard/alerts` - Active alerts
- `GET /api/v1/dashboard/feedback` - Feedback metrics
- `GET /api/v1/dashboard/feedback/debug` - Feedback debug info
- `GET /api/v1/dashboard/health` - Dashboard health

**Other Dashboard Endpoints**
- `GET /api/v1/users` - List users
- `GET /api/v1/issues` - List issues timeline
- `GET /api/v1/issues/summary` - Issues summary
- `GET /api/v1/costs/overview` - Cost overview

### Analytics & Metrics Endpoints

**Analytics**
- `GET /api/v1/analytics/overview` - Analytics overview with ML metrics
- `GET /api/v1/analytics/trends` - Analytics trends over time

**Metrics**
- `GET /api/v1/metrics` - System-level metrics (admin)
- `GET /api/v1/metrics/latency` - Latency metrics (P50/P95/P99)
- `GET /api/v1/metrics/error-rates` - Error rate metrics

### Analysis Endpoints

- `POST /api/v1/analysis/analyze` - Request explicit trace analysis
- `GET /api/v1/analysis/queue/stats` - Analysis queue statistics

### Authentication Endpoints

- `POST /api/v1/auth/signup` - Create account (replaces `/onboarding/signup`)
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user
- `GET /api/v1/auth/account` - Get account info

### Tenant Management Endpoints

- `DELETE /api/v1/tenants/:tenantId/tokens` - Revoke tenant tokens
- `POST /api/v1/tenants/:tenantId/api-keys` - Create API key for tenant

### System Endpoints

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health check (includes DB, Tinybird, Redis, Analysis Service status)
- `GET /api/v1/version` - API version and deployment info
- `GET /api/v1/admin/init-schema` - Manual schema initialization
- `GET /diagnostics` - Startup diagnostics
- `GET /api-docs` - Interactive API documentation (Swagger UI)

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... },
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## Rate Limiting

- Default: 100 requests per 15 minutes per IP
- Per-tenant limits: 1000 events per minute
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Quotas

- Free plan: 10M events per month
- Quota resets monthly
- Check quota: `GET /api/v1/tenants/:tenantId`

## Interactive Documentation

Visit `/api-docs` for interactive Swagger UI documentation with:
- All endpoints
- Request/response examples
- Try it out functionality
- Authentication guide

## Related Documentation

- [API Endpoints Reference](./endpoints.md) - Detailed endpoint documentation
- [Authentication Guide](./authentication.md) - Authentication methods
- [Rate Limits](../reference/rate-limits.md) - Rate limiting details
- [Quotas](../reference/quotas.md) - Quota information

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).





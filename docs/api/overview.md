# API Overview

Complete overview of the Observa API.

## Base URL

**Production**: `https://observa-api.vercel.app`  
**Development**: `http://localhost:3000`

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

- `POST /api/v1/events/ingest` - Ingest canonical events (SDK)

### Dashboard Endpoints

- `GET /api/v1/traces` - List traces
- `GET /api/v1/traces/:traceId` - Get trace detail
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/sessions/:sessionId` - Get session detail
- `GET /api/v1/users` - List users
- `GET /api/v1/issues` - List issues
- `GET /api/v1/issues/summary` - Issues summary
- `GET /api/v1/costs/overview` - Cost overview
- `GET /api/v1/dashboard/overview` - Dashboard metrics
- `GET /api/v1/dashboard/alerts` - Active alerts

### Authentication Endpoints

- `POST /api/v1/onboarding/signup` - Create account
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user
- `GET /api/v1/auth/account` - Get account info

### System Endpoints

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health check
- `GET /api/v1/metrics` - System metrics
- `GET /api-docs` - Interactive API documentation

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


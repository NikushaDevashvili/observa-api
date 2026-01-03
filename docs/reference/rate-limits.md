# Rate Limits Reference

Complete reference for Observa API rate limits.

## Rate Limit Types

### IP-Based Rate Limiting

- **Limit**: 100 requests per 15 minutes per IP
- **Applies to**: All endpoints
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Per-Tenant Rate Limiting

- **Limit**: 1000 events per minute per tenant
- **Applies to**: Event ingestion endpoint
- **Key**: `tenant_id` or `tenant_id:project_id`

### Per-API-Key Rate Limiting

- **Limit**: Based on plan and key type
- **Applies to**: All endpoints using API keys
- **Key**: API key identifier

## Rate Limit Headers

All rate-limited responses include:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 500
X-RateLimit-Reset: 2024-01-01T00:01:00Z
```

## Handling Rate Limits

### Exponential Backoff

```typescript
async function sendWithRetry(events, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await observa.endTrace();
    } catch (error) {
      if (error.status === 429 && i < retries - 1) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

### Check Rate Limit Status

```typescript
const response = await fetch(url, options);
const remaining = response.headers.get("X-RateLimit-Remaining");
const resetAt = response.headers.get("X-RateLimit-Reset");

if (parseInt(remaining) < 100) {
  // Approaching limit, slow down
}
```

## Error Response

When rate limit exceeded:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please retry after the specified time.",
    "details": {
      "limit": 1000,
      "window_seconds": 60,
      "retry_after": 30
    }
  }
}
```

## Best Practices

1. **Batch Events**: Send multiple events in one request
2. **Implement Backoff**: Use exponential backoff on 429 errors
3. **Monitor Headers**: Check rate limit headers
4. **Optimize Frequency**: Reduce unnecessary requests

## Related Documentation

- [API Overview](../api/overview.md)
- [Troubleshooting Guide](../troubleshooting/common-issues.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


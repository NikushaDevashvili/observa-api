# Error Codes Reference

Complete reference for all Observa API error codes.

## Authentication Errors

### UNAUTHORIZED (401)

**Meaning**: Invalid or missing authentication

**Common Causes**:
- Missing Authorization header
- Invalid API key or session token
- Expired token
- Wrong token format

**Solution**: Verify token and ensure `Bearer` prefix is included

---

### FORBIDDEN (403)

**Meaning**: Authenticated but lacks permission

**Common Causes**:
- API key doesn't have required scope
- Origin not allowed (for publishable keys)
- Tenant/project mismatch

**Solution**: Check API key scopes and permissions

---

## Request Errors

### INVALID_PAYLOAD (400)

**Meaning**: Request body doesn't match expected format

**Common Causes**:
- Missing required fields
- Invalid field types
- Malformed JSON
- Event format doesn't match canonical format

**Solution**: Check request format against [Event Reference](../sdk/events-reference.md)

---

### RATE_LIMIT_EXCEEDED (429)

**Meaning**: Too many requests

**Common Causes**:
- Exceeded per-IP rate limit (100/15min)
- Exceeded per-tenant rate limit (1000/min)
- Too many concurrent requests

**Solution**: 
- Reduce request frequency
- Implement exponential backoff
- Check `X-RateLimit-*` headers

---

### QUOTA_EXCEEDED (429)

**Meaning**: Monthly event quota exceeded

**Common Causes**:
- Sent more events than plan allows
- Quota not reset yet

**Solution**:
- Upgrade plan
- Wait for monthly reset
- Optimize event volume

---

## Server Errors

### INTERNAL_ERROR (500)

**Meaning**: Server error

**Common Causes**:
- Database connection issue
- Tinybird connection issue
- Unexpected error

**Solution**: 
- Check API logs
- Retry request
- Contact support if persists

---

### SERVICE_UNAVAILABLE (503)

**Meaning**: Service temporarily unavailable

**Common Causes**:
- Database initialization in progress
- Service overloaded
- Maintenance mode

**Solution**: 
- Wait and retry
- Check `/health/detailed` endpoint
- Check status page

---

## Error Response Format

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {
      "hint": "Helpful hint",
      "requestId": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

## Request ID

All error responses include `requestId` for:
- Support ticket reference
- Log correlation
- Debugging

Include `requestId` when contacting support.

---

## Related Documentation

- [Common Issues](./common-issues.md)
- [Debugging Guide](./debugging.md)
- [API Overview](../api/overview.md)

---

**Need help?** Check the [Troubleshooting Guide](../../TROUBLESHOOTING_GUIDE.md).


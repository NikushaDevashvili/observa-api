# Authentication Guide

Complete guide to authenticating with the Observa API.

## Authentication Methods

Observa API supports two authentication methods:

1. **API Keys** - For SDK and programmatic access
2. **Session Tokens** - For dashboard access

---

## API Keys (SDK Authentication)

### Getting an API Key

**Via Signup:**
```bash
curl -X POST https://observa-api.vercel.app/api/v1/onboarding/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "companyName": "Your Company",
    "plan": "free"
  }'
```

Response includes `apiKey` - save this securely.

**Via Dashboard:**
1. Log in to dashboard
2. Go to Settings → API Keys
3. Copy your API key

### Using API Keys

```bash
curl -X POST https://observa-api.vercel.app/api/v1/events/ingest \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{...events...}]'
```

### API Key Types

- **Server Keys** (`sk_` prefix): Full access, use in backend
- **Publishable Keys** (`pk_` prefix): Limited access, use in frontend (with origin restrictions)

### API Key Scopes

- `ingest`: Can send events
- `query`: Can query data (future)

---

## Session Tokens (Dashboard Authentication)

### Getting a Session Token

**Via Login:**
```bash
curl -X POST https://observa-api.vercel.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "your-password"
  }'
```

Response includes `sessionToken` - use for dashboard API calls.

### Using Session Tokens

```bash
curl -X GET https://observa-api.vercel.app/api/v1/traces \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

---

## Security Best Practices

1. **Never Commit Keys**: Use environment variables
2. **Rotate Keys**: Regularly rotate API keys
3. **Use Scoped Keys**: Use least privilege principle
4. **Monitor Usage**: Check audit logs for suspicious activity
5. **HTTPS Only**: Always use HTTPS in production

---

## Error Responses

### 401 Unauthorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

**Solutions:**
- Verify API key is correct
- Check key hasn't expired
- Ensure `Bearer` prefix is included

### 403 Forbidden

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "API key does not have permission for this operation"
  }
}
```

**Solutions:**
- Check API key scopes
- Verify origin restrictions (for publishable keys)
- Check tenant/project permissions

---

## Token Expiration

- **API Keys**:** No expiration (until revoked)
- **Session Tokens**: Expire after inactivity (configurable)

---

## Related Documentation

- [API Overview](./overview.md)
- [API Endpoints](./endpoints.md)
- [Troubleshooting](../troubleshooting/common-issues.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


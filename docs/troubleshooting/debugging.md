# Debugging Guide

Complete guide to debugging issues with Observa.

## How to Check Logs

### API Logs (Vercel)

1. Go to Vercel Dashboard
2. Select your project
3. Go to "Logs" tab
4. Filter by function or search

### Application Logs

**Node.js**:
```typescript
// Enable debug logging
process.env.DEBUG = "observa:*";
```

**SDK Logging**:
```typescript
observa.on("error", (error) => {
  console.error("SDK error:", error);
});

observa.on("sent", (eventCount) => {
  console.log(`Sent ${eventCount} events`);
});
```

### Database Logs

- **Vercel Postgres**: Vercel Dashboard → Database → Logs
- **Supabase**: Supabase Dashboard → Logs
- **Neon**: Neon Dashboard → Logs

### Tinybird Logs

1. Go to Tinybird Dashboard
2. Navigate to Data Sources
3. Check ingestion logs for errors

---

## Debugging Steps

### 1. Verify API Key

```typescript
console.log("API Key length:", process.env.OBSERVA_API_KEY?.length);
console.log("API Key preview:", process.env.OBSERVA_API_KEY?.substring(0, 20));
```

### 2. Check Network Requests

Open browser DevTools → Network tab:
- Look for requests to `/api/v1/events/ingest`
- Check response status
- Review request/response payloads

### 3. Verify Event Format

```typescript
const events = [...]; // Your events
console.log("Event count:", events.length);
console.log("First event:", JSON.stringify(events[0], null, 2));
```

### 4. Test API Endpoints

```bash
# Health check
curl https://your-api.vercel.app/health

# Detailed health
curl https://your-api.vercel.app/health/detailed

# Test authentication
curl -H "Authorization: Bearer YOUR_KEY" \
  https://your-api.vercel.app/api/v1/auth/account
```

### 5. Check Data Ingestion

```bash
# Query traces
curl -H "Authorization: Bearer TOKEN" \
  https://your-api.vercel.app/api/v1/traces?limit=10
```

---

## Common Debugging Scenarios

### Events Not Appearing

1. **Check API Response**:
   ```typescript
   const response = await observa.endTrace();
   console.log("Response:", response);
   ```

2. **Check Network**:
   - Open DevTools → Network
   - Find `/api/v1/events/ingest` request
   - Check status code and response

3. **Verify Tenant/Project**:
   - Ensure events have correct `tenant_id` and `project_id`
   - Match your dashboard account

### Slow Performance

1. **Check Health Endpoint**:
   ```bash
   curl https://your-api.vercel.app/health/detailed
   ```
   - Check database latency
   - Check Tinybird latency

2. **Check Request Timing**:
   - Use browser DevTools → Performance
   - Identify slow requests
   - Check response times

### Authentication Failures

1. **Verify Token Format**:
   ```typescript
   const token = process.env.OBSERVA_API_KEY;
   console.log("Starts with eyJ:", token?.startsWith("eyJ"));
   console.log("Has Bearer:", token?.includes("Bearer"));
   ```

2. **Test Token**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://your-api.vercel.app/api/v1/auth/account
   ```

---

## Debugging Tools

### Browser DevTools

- **Network Tab**: See all API requests
- **Console Tab**: See SDK logs
- **Application Tab**: Check stored tokens

### API Testing

- **Postman**: Test API endpoints
- **cURL**: Command-line testing
- **Swagger UI**: Interactive API docs at `/api-docs`

### Logging

- **Console Logs**: Application logs
- **Sentry**: Error tracking (if configured)
- **Vercel Logs**: Server logs

---

## Getting Help

When reporting issues, include:

1. **Error Message**: Full error text
2. **Request ID**: From error response
3. **Steps to Reproduce**: What you did
4. **Expected vs Actual**: What should happen vs what happened
5. **Environment**: SDK version, Node version, etc.
6. **Logs**: Relevant log excerpts

---

## Related Documentation

- [Common Issues](./common-issues.md)
- [Error Codes](./error-codes.md)
- [Troubleshooting Guide](../../TROUBLESHOOTING_GUIDE.md)

---

**Need help?** Check the [Troubleshooting Guide](../../TROUBLESHOOTING_GUIDE.md).


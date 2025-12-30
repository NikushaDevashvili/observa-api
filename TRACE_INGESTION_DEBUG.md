# Trace Ingestion Debugging Guide

## Critical Issue: Traces Not Appearing in Dashboard or Tinybird

This guide helps diagnose why traces from customer-chat aren't appearing.

## Step 1: Check Vercel Logs for observa-api

1. Go to Vercel Dashboard → observa-api → Functions → Logs
2. Look for these log messages when you send a message from customer-chat:

### Expected Logs (in order):
```
[Observa API] Received trace ingestion request
[Observa API] Request method: POST, URL: /api/v1/traces/ingest
[Observa API] Request headers: { authorization: 'present', contentType: 'application/json' }
[Observa API] Extracted token (length: XXX)
[Observa API] JWT validated - Tenant: XXX, Project: XXX
[Observa API] Received trace data - traceId: XXX, query length: XXX
[Observa API] Trace data keys: [...]
[Observa API] Trace data validation passed
[Observa API] Updated conversation XXX - TraceID: XXX
[Observa API] Storing trace data in PostgreSQL - TraceID: XXX
[TraceService] Conversation columns check: found
[TraceService] Storing trace with conversation tracking - TraceID: XXX
[Observa API] ✅ Successfully stored trace data in PostgreSQL - TraceID: XXX
[Observa API] Forwarding trace to Tinybird - TraceID: XXX
[TraceService] Forwarding to Tinybird - TraceID: XXX, Conversation: XXX
[TraceService] ✅ Successfully forwarded to Tinybird - TraceID: XXX
[Observa API] ✅ Trace ingestion completed successfully - TraceID: XXX
```

### Error Patterns to Look For:

**If you see:**
- `[Observa API] Missing or invalid Authorization header` → SDK not sending API key
- `[Observa API] Invalid or expired JWT token` → API key is invalid/expired
- `[Observa API] Validation failed:` → Trace data structure is wrong
- `[Observa API] ❌ Failed to store trace data` → Database issue
- `[TraceService] ❌ Failed to forward trace to Tinybird` → Tinybird issue

## Step 2: Check Customer-Chat Logs

1. Go to Vercel Dashboard → customer-chat → Functions → Logs
2. Look for these log messages:

### Expected Logs:
```
[Customer Chat API] Received request:
  - API Key present: true
  - API Key length: XXX
  - Conversation ID: XXX
[Observa] Starting captureStream for trace XXX
[Observa] captureStream started for trace XXX
[Observa] Trace data prepared, calling sendTrace for XXX
[Observa] Sending trace - URL: https://observa-api.vercel.app/api/v1/traces/ingest, TraceID: XXX
[Observa] Response status: 200 OK
✅ [Observa] Trace sent successfully - Trace ID: XXX
```

### Error Patterns:
- `[Observa] Failed to send trace:` → Network/API issue
- `[Observa] Request timeout after 10 seconds` → API not responding
- `[Observa] Backend API error: 401` → Authentication failed
- `[Observa] Backend API error: 400` → Validation failed

## Step 3: Verify Environment Variables

### Customer-Chat (Vercel):
- `OBSERVA_API_URL` should be `https://observa-api.vercel.app` (or your custom domain)

### Observa-API (Vercel):
- `DATABASE_URL` - PostgreSQL connection string
- `TINYBIRD_ADMIN_TOKEN` - Tinybird admin token
- `TINYBIRD_HOST` - Tinybird API host (default: https://api.europe-west2.gcp.tinybird.co)
- `TINYBIRD_DATASOURCE_NAME` - Tinybird datasource name (default: traces)
- `JWT_SECRET` - Secret for signing JWT tokens

## Step 4: Test Trace Ingestion Directly

Use this curl command to test if the API is receiving traces:

```bash
curl -X POST https://observa-api.vercel.app/api/v1/traces/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -d '{
    "traceId": "test-trace-debug-001",
    "spanId": "span-001",
    "timestamp": "2025-01-30T12:00:00Z",
    "query": "Test query for debugging",
    "response": "Test response",
    "responseLength": 15,
    "latencyMs": 100
  }'
```

Expected response:
```json
{
  "success": true,
  "traceId": "test-trace-debug-001",
  "message": "Trace ingested successfully"
}
```

## Step 5: Check Database

Query the database directly to see if traces are being stored:

```sql
SELECT 
  trace_id, 
  tenant_id, 
  query, 
  response, 
  timestamp, 
  conversation_id,
  created_at
FROM analysis_results 
ORDER BY timestamp DESC 
LIMIT 10;
```

## Step 6: Check Tinybird

1. Go to Tinybird Dashboard
2. Check the `traces` datasource
3. Verify events are being received

## Common Issues and Fixes

### Issue 1: SDK Not Sending Traces
**Symptoms:** No logs in customer-chat about sending traces
**Fix:** Check if API key is configured in customer-chat settings

### Issue 2: API Not Receiving Traces
**Symptoms:** No `[Observa API] Received trace ingestion request` logs
**Fix:** 
- Verify `OBSERVA_API_URL` is correct in customer-chat
- Check CORS settings (should allow all in production)
- Verify network connectivity

### Issue 3: Validation Failing
**Symptoms:** `[Observa API] Validation failed:` in logs
**Fix:** Check the validation error details - usually missing required fields

### Issue 4: Storage Failing
**Symptoms:** `[Observa API] ❌ Failed to store trace data` in logs
**Fix:** 
- Check DATABASE_URL is correct
- Verify database is accessible
- Check database schema is initialized

### Issue 5: Tinybird Not Receiving
**Symptoms:** `[TraceService] ❌ Failed to forward trace to Tinybird` in logs
**Fix:**
- Verify TINYBIRD_ADMIN_TOKEN is correct
- Check TINYBIRD_HOST is correct
- Verify TINYBIRD_DATASOURCE_NAME matches your datasource

## Next Steps

After checking logs, share the specific error messages you see and we can fix them.


# Troubleshooting Guide

Common issues and solutions for Observa.

## Table of Contents

1. [SDK Issues](#sdk-issues)
2. [API Authentication Issues](#api-authentication-issues)
3. [Data Not Appearing](#data-not-appearing)
4. [Rate Limiting Issues](#rate-limiting-issues)
5. [Quota Exceeded](#quota-exceeded)
6. [Performance Issues](#performance-issues)
7. [Dashboard Issues](#dashboard-issues)
8. [How to Check Logs](#how-to-check-logs)

---

## SDK Issues

### Issue: "Cannot find module 'observa-sdk'"

**Symptoms**: Import error when trying to use SDK

**Solutions**:
1. Verify SDK is installed: `npm list observa-sdk`
2. Reinstall: `npm install observa-sdk`
3. Check Node.js version (requires v18+)
4. Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`

---

### Issue: "Invalid API Key"

**Symptoms**: SDK returns 401 Unauthorized

**Solutions**:
1. **Verify API Key**:
   ```bash
   echo $OBSERVA_API_KEY | wc -c  # Should be > 100 characters
   ```
2. **Check for Extra Spaces**:
   ```bash
   # Remove any leading/trailing spaces
   export OBSERVA_API_KEY=$(echo "$OBSERVA_API_KEY" | xargs)
   ```
3. **Verify API Key Format**: Should start with `eyJ` (JWT token)
4. **Check Environment**: Ensure API key matches environment (dev vs prod)
5. **Regenerate API Key**: Get a new key from dashboard

**Debug**:
```typescript
console.log('API Key length:', process.env.OBSERVA_API_KEY?.length);
console.log('API Key preview:', process.env.OBSERVA_API_KEY?.substring(0, 20));
```

---

### Issue: "Events Not Sending"

**Symptoms**: `endTrace()` called but events don't appear in dashboard

**Solutions**:
1. **Check `endTrace()` is Called**:
   ```typescript
   try {
     // ... your code
     await observa.endTrace(); // ✅ Must be called
   } catch (error) {
     await observa.endTrace(); // ✅ Even on error
   }
   ```
2. **Check Network Requests**:
   - Open browser DevTools → Network tab
   - Look for requests to `/api/v1/events/ingest`
   - Check response status (should be 200)
3. **Check API URL**:
   ```typescript
   console.log('API URL:', observa.apiUrl);
   ```
4. **Enable SDK Logging** (if available):
   ```typescript
   observa.on('error', (error) => {
     console.error('SDK error:', error);
   });
   ```

---

### Issue: "TypeScript Errors"

**Symptoms**: Type errors when using SDK

**Solutions**:
1. **Update TypeScript**: `npm install -D typescript@latest`
2. **Install Types**: `npm install -D @types/node`
3. **Check SDK Version**: `npm list observa-sdk`
4. **Update SDK**: `npm update observa-sdk`

---

## API Authentication Issues

### Issue: "401 Unauthorized"

**Symptoms**: API requests return 401

**Solutions**:
1. **Check Authorization Header**:
   ```bash
   # Should be: Authorization: Bearer <token>
   curl -H "Authorization: Bearer YOUR_API_KEY" ...
   ```
2. **Verify Token Format**: Should be a valid JWT
3. **Check Token Expiration**: JWT tokens can expire
4. **Regenerate Token**: Get new API key from dashboard

**Debug**:
```bash
# Test authentication
curl -X GET https://your-api.vercel.app/api/v1/auth/account \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### Issue: "403 Forbidden"

**Symptoms**: API requests return 403

**Solutions**:
1. **Check API Key Scopes**: Verify key has required permissions (ingest/query)
2. **Check Origin** (for publishable keys): Verify origin is allowed
3. **Check Tenant/Project**: Ensure API key matches tenant/project
4. **Contact Support**: May need permission adjustment

---

## Data Not Appearing

### Issue: "Traces Not Showing in Dashboard"

**Symptoms**: Events sent but dashboard shows no traces

**Solutions**:
1. **Wait a Few Seconds**: Data processing takes time
2. **Check Time Range**: Dashboard may filter by time range
3. **Check Project Filter**: Ensure correct project selected
4. **Verify Tenant ID**: Ensure events have correct tenant_id
5. **Check API Response**:
   ```typescript
   const response = await observa.endTrace();
   console.log('Response:', response);
   ```
6. **Check Dashboard URL**: Ensure you're viewing correct tenant/project

**Debug**:
```bash
# Query traces directly
curl -X GET "https://your-api.vercel.app/api/v1/traces?limit=10" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

---

### Issue: "Events Sent But No Data"

**Symptoms**: API returns 200 but no data appears

**Solutions**:
1. **Check Event Format**: Verify events match canonical format
2. **Check Required Fields**: Ensure tenant_id, project_id, trace_id are present
3. **Check Timestamps**: Ensure timestamps are valid ISO 8601
4. **Check Event Types**: Verify event_type is valid (trace_start, llm_call, etc.)
5. **Review API Logs**: Check for validation errors

---

## Rate Limiting Issues

### Issue: "429 Too Many Requests"

**Symptoms**: API returns 429 rate limit error

**Solutions**:
1. **Reduce Request Frequency**: Batch events when possible
2. **Implement Exponential Backoff**:
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
3. **Check Rate Limits**: Default is 100 requests per 15 minutes per IP
4. **Contact Support**: Request higher limits if needed

**Rate Limit Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 50
X-RateLimit-Reset: 1234567890
```

---

## Quota Exceeded

### Issue: "Quota Exceeded"

**Symptoms**: API returns error about monthly quota

**Solutions**:
1. **Check Current Usage**: View quota in dashboard
2. **Upgrade Plan**: Contact support to increase quota
3. **Optimize Events**: Reduce event volume if possible
4. **Wait for Reset**: Quota resets monthly

**Check Quota**:
```bash
curl -X GET "https://your-api.vercel.app/api/v1/tenants/YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Performance Issues

### Issue: "Slow Dashboard Loading"

**Symptoms**: Dashboard takes long to load

**Solutions**:
1. **Reduce Time Range**: Use shorter time ranges (e.g., last 24 hours)
2. **Filter by Project**: Filter to specific project
3. **Check Data Volume**: Large datasets take longer to query
4. **Clear Browser Cache**: Clear cache and reload
5. **Check Network**: Verify network connectivity

---

### Issue: "SDK Blocking Application"

**Symptoms**: Application slows down when using SDK

**Solutions**:
1. **Use Async**: Ensure `endTrace()` is awaited properly
2. **Batch Events**: Send events in batches, not individually
3. **Use Background Processing**: Send events asynchronously
4. **Check Network**: Slow network can block requests

**Example**:
```typescript
// ✅ Good: Non-blocking
observa.endTrace().catch(console.error);

// ❌ Bad: Blocking
await observa.endTrace(); // Blocks if network is slow
```

---

## Dashboard Issues

### Issue: "Dashboard Shows Zero Metrics"

**Symptoms**: Dashboard displays zeros for all metrics

**Solutions**:
1. **Check Time Range**: Ensure time range includes data
2. **Check Project Filter**: Verify correct project selected
3. **Verify Data Ingestion**: Check that events are being sent
4. **Check Data Processing**: Data may still be processing
5. **Refresh Dashboard**: Reload the page

---

### Issue: "Dashboard Errors"

**Symptoms**: Dashboard shows errors or doesn't load

**Solutions**:
1. **Check Browser Console**: Look for JavaScript errors
2. **Clear Browser Cache**: Clear cache and cookies
3. **Try Different Browser**: Test in Chrome, Firefox, Safari
4. **Check Network Tab**: Verify API requests are successful
5. **Contact Support**: Report the issue

---

## How to Check Logs

### API Logs (Vercel)

1. Go to Vercel Dashboard
2. Select your project
3. Go to "Logs" tab
4. Filter by function name or search for errors

### Application Logs

**Node.js**:
```typescript
// Enable debug logging
process.env.DEBUG = 'observa:*';
```

**Check SDK Logs**:
```typescript
observa.on('error', (error) => {
  console.error('SDK error:', error);
});

observa.on('sent', (eventCount) => {
  console.log(`Sent ${eventCount} events`);
});
```

### Database Logs

Check PostgreSQL logs for database errors:
- Vercel Postgres: Vercel Dashboard → Database → Logs
- Supabase: Supabase Dashboard → Logs
- Neon: Neon Dashboard → Logs

### Tinybird Logs

Check Tinybird dashboard for ingestion errors:
1. Go to Tinybird Dashboard
2. Navigate to Data Sources
3. Check for errors in ingestion logs

---

## Common Error Messages

### "INVALID_PAYLOAD"

**Meaning**: Request body doesn't match expected format

**Solution**: Check event format against [SDK_CANONICAL_EVENTS_REFERENCE.md](./SDK_CANONICAL_EVENTS_REFERENCE.md)

---

### "FORBIDDEN"

**Meaning**: API key doesn't have permission

**Solution**: Check API key scopes and origin restrictions

---

### "INTERNAL_ERROR"

**Meaning**: Server error

**Solution**: Check API logs, contact support if persists

---

### "UNAUTHORIZED"

**Meaning**: Invalid or missing API key

**Solution**: Verify API key is correct and not expired

---

## Getting Help

### Before Contacting Support

1. **Check Documentation**: Review all guides
2. **Check Logs**: Review application and API logs
3. **Reproduce Issue**: Create minimal reproduction
4. **Gather Information**:
   - Error messages
   - Request/response examples
   - SDK version
   - Node.js version
   - Timestamp of issue

### Contact Support

- **GitHub Issues**: Report bugs on GitHub
- **Email**: support@observa.ai (if available)
- **Documentation**: Check other guides in repository

---

## Quick Diagnostic Checklist

- [ ] API key is set and valid
- [ ] SDK is installed correctly
- [ ] `endTrace()` is being called
- [ ] Network requests are reaching API
- [ ] API returns 200 status
- [ ] Time range includes data
- [ ] Correct project selected in dashboard
- [ ] Browser cache cleared
- [ ] No rate limit errors
- [ ] Quota not exceeded

---

**Still having issues?** Check the logs, gather error details, and contact support with:
- Error messages
- Steps to reproduce
- SDK/API versions
- Timestamp of issue




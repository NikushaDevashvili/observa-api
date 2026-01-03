# Fix: Dashboard Showing 0 Metrics

## Problem

The dashboard is showing all metrics as 0 because the `TINYBIRD_ADMIN_TOKEN` doesn't have the required permissions to read from the `canonical_events` datasource.

## Error

All Tinybird queries are returning `403 Forbidden` with the message:
```
Not enough permissions for datasource 'canonical_events', token needs DATASOURCES:READ:canonical_events scope
```

## Solution

You need to add the `DATASOURCES:READ:canonical_events` permission to your Tinybird token.

### Option 1: Using Tinybird API (Recommended)

```bash
curl -X PUT "https://api.tinybird.co/v0/tokens/your-token-name?scope=DATASOURCES:READ:canonical_events" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Replace:
- `your-token-name` with your actual token name
- `YOUR_ADMIN_TOKEN` with your Tinybird admin token

### Option 2: Using Tinybird UI

1. Go to https://app.tinybird.co/
2. Navigate to **Settings** → **Tokens**
3. Find your token (the one used in `TINYBIRD_ADMIN_TOKEN`)
4. Click **Edit**
5. Add scope: `DATASOURCES:READ:canonical_events`
6. Save

### Option 3: Create a New Token with Proper Permissions

1. Go to https://app.tinybird.co/
2. Navigate to **Settings** → **Tokens**
3. Click **Create Token**
4. Name it (e.g., "Observa API Token")
5. Add scopes:
   - `DATASOURCES:READ:canonical_events`
   - `DATASOURCES:WRITE:canonical_events` (for ingestion)
6. Copy the token
7. Update `TINYBIRD_ADMIN_TOKEN` in your Vercel environment variables

## Verify Fix

After updating the token permissions, the dashboard should show:
- Total Traces > 0
- Latency metrics (P50, P95, P99)
- Cost metrics
- Token metrics
- Error rates
- Active issues

## Current Workaround

Until the token permissions are fixed, the dashboard will show 0 for all metrics. The issues page works because it has a PostgreSQL fallback, but the main dashboard metrics only query Tinybird.

## Related Files

- `src/services/dashboardMetricsService.ts` - Dashboard metrics queries
- `src/services/tinybirdRepository.ts` - Tinybird query wrapper
- `src/routes/dashboard.ts` - Dashboard API endpoints


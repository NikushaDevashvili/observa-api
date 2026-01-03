# Fix: Dashboard Showing All Zeros

## Root Cause

The `TINYBIRD_ADMIN_TOKEN` in Vercel environment variables is **missing the `DATASOURCES:READ:canonical_events` permission**.

All Tinybird queries are returning `403 Forbidden`, which causes the dashboard to show 0 for all metrics.

## Solution

### Option 1: Update Token in Vercel (Recommended)

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Find `TINYBIRD_ADMIN_TOKEN`
3. Update it with this token (which has correct permissions):
   ```
   p.eyJ1IjogImVmNGNjNGFlLTExZDAtNDVhNy1hNTcxLTJiZDg1NWNkZDZkNCIsICJpZCI6ICIyYmNmMjU5ZS01MWM1LTQ0NGUtODFkNS00NDZmYjljYzQzNjMiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.IDQZZNus_b5-OqdRYd-Qod_0YOiPnR6jsIJgk_prfoI
   ```
4. **Redeploy** the application

### Option 2: Add Permission to Existing Token

1. Go to **Tinybird Dashboard** → **Settings** → **Tokens**
2. Find your current token
3. Click **Edit**
4. Add scope: `DATASOURCES:READ:canonical_events`
5. Save
6. **Redeploy** in Vercel (to pick up any changes)

## Verification

After updating the token and redeploying:

1. **Check Vercel Logs** - Look for `[Dashboard]` messages:
   ```
   [Dashboard] Querying metrics for period: ...
   [Dashboard] Metrics fetched:
     - Trace count: 704
     - Error rate: X%
     - Latency P95: Xms
     - Cost: $X
     - Tokens: X
     - Active issues: X
   ```

2. **Check Browser Network Tab**:
   - Open DevTools → Network
   - Look for `/api/v1/dashboard/overview` request
   - Check the response - should have actual numbers, not all zeros

3. **Test Health Endpoint** (after login):
   ```
   GET https://observa-api.vercel.app/api/v1/dashboard/health
   Authorization: Bearer <session-token>
   ```

## Expected Results

After fixing, the dashboard should show:
- ✅ Total Traces: 704 (not 0)
- ✅ Latency metrics (P50, P95, P99)
- ✅ Cost metrics
- ✅ Token metrics
- ✅ Error rates
- ✅ Active issues

## Current Status

- **Data exists**: 7,471 events, 704 traces in Tinybird
- **Token provided**: Has correct permissions (tested ✅)
- **Issue**: Vercel environment variable has wrong token
- **Fix**: Update `TINYBIRD_ADMIN_TOKEN` in Vercel and redeploy


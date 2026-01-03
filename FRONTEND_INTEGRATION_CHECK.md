# Frontend Integration Check

## Issue
Dashboard shows all zeros even though:
- ✅ Token has correct permissions (tested)
- ✅ Data exists in Tinybird (7471 events, 704 traces)
- ✅ Latest event: `2026-01-02 23:56:40.153`

## Root Cause Analysis

### 1. Time Range Issue
The frontend is likely passing `days=1` (24 hours) when "24h" is selected. The latest data is from `2026-01-02 23:56:40`, which might be just outside the 24-hour window depending on:
- Current time
- Timezone handling
- How the frontend calculates the time range

### 2. Frontend API Call
Check what the frontend is actually calling:

**Expected:**
```
GET /api/v1/dashboard/overview?days=7
Authorization: Bearer <session-token>
```

**Possible issues:**
- Frontend might be calling wrong endpoint
- Frontend might be passing `days=1` instead of `days=7`
- Frontend might be using `timeRange=24h` format
- Frontend might not be sending authentication header

## How to Debug

### 1. Check Browser Network Tab
1. Open DevTools → Network tab
2. Filter for "dashboard" or "overview"
3. Look for `/api/v1/dashboard/overview` request
4. Check:
   - **Request URL**: What parameters are being sent?
   - **Request Headers**: Is `Authorization: Bearer <token>` present?
   - **Response**: What does the API return?

### 2. Check Vercel Logs
Look for `[Dashboard]` log messages:
```
[Dashboard] Time range requested: 24h (1 days)
[Dashboard] Querying metrics for period: ... to ...
[Dashboard] Metrics fetched:
  - Trace count: 0
  - Error rate: 0% (0/0)
```

### 3. Test API Directly
Use the browser console or curl:
```javascript
// In browser console (after login)
fetch('/api/v1/dashboard/overview?days=7', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
  }
})
.then(r => r.json())
.then(console.log)
```

## Fixes Applied

1. ✅ Added support for `timeRange` parameter (24h, 7d, 30d)
2. ✅ Changed default from 1 day to 7 days
3. ✅ Added detailed logging to see what's being requested
4. ✅ Token permissions verified

## Next Steps

1. **Check Vercel Logs** - See what time range the frontend is requesting
2. **Check Browser Network Tab** - See the actual API call
3. **Verify Frontend Code** - Make sure it's calling `/api/v1/dashboard/overview` with correct params
4. **Test with days=7** - Try manually calling with `?days=7` to see if data appears

## Frontend Code to Check

Look for where the dashboard calls the API:
- Should call: `/api/v1/dashboard/overview`
- Should pass: `days` or `timeRange` parameter
- Should send: `Authorization: Bearer <session-token>` header
- Should handle: The response format from the API


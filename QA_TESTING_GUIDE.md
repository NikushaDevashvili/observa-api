# QA Testing Guide - Trace Summary Fixes

**Date:** January 2026  
**Purpose:** Verify that trace summary fixes are working correctly after deployment

## Prerequisites

1. **Code Deployed:** Ensure the latest code with fixes is deployed to Vercel
2. **Session Token:** Get a valid session token by logging into the dashboard
3. **Test Traces:** Generate new traces using the simulation script (old traces may not have the new fields)

## Quick Test

### Step 1: Generate New Test Traces

Generate fresh traces that will use the new code:

```bash
# Generate a small batch of test traces
NUM_USERS=1 CONVERSATIONS_PER_USER=1 MIN_MESSAGES=1 MAX_MESSAGES=1 \
API_URL="https://observa-api.vercel.app" \
node scripts/load-simulation-events.js <JWT_TOKEN>
```

**Note:** Copy one of the trace IDs from the output for testing.

### Step 2: Test Trace Summary

Use the test script to verify the summary includes all required fields:

```bash
# Get your session token from browser (dashboard login)
# Then run:
TRACE_ID=<trace-id-from-step-1> \
SESSION_TOKEN=<your-session-token> \
API_URL="https://observa-api.vercel.app" \
node scripts/test-trace-summary.js
```

Or manually test with curl:

```bash
curl "https://observa-api.vercel.app/api/v1/traces/<TRACE_ID>?format=tree" \
  -H "Authorization: Bearer <SESSION_TOKEN>" \
  | jq '.trace.summary | {query, response, total_cost, finish_reason, model, total_tokens}'
```

## Expected Results

### ✅ Summary Should Include:

1. **`query`** (CRITICAL) - User's question from first LLM call
   - Should be a string
   - Should not be null or undefined
   - Example: "I need help with my order #12345"

2. **`response`** (CRITICAL) - Final response/output
   - Should be a string
   - Should not be null or undefined
   - Can come from output event or last LLM call output

3. **`total_cost`** (NICE TO HAVE) - Aggregated cost from all LLM calls
   - Should be a number (or null if cost calculation disabled)
   - Should sum all LLM call costs

4. **`finish_reason`** (NICE TO HAVE) - Finish reason from last LLM call
   - Should be a string (e.g., "stop", "length", "tool_calls")
   - Can be null if not available

5. **`model`** - LLM model name
   - Should be a string (e.g., "gpt-4o", "claude-3-opus")

6. **`total_tokens`** - Total tokens used
   - Should be a number

7. **`total_latency_ms`** - Total latency
   - Should be a number

## Test Scenarios

### Test 1: Single LLM Call Trace

**Expected:**
- `query` = first (and only) LLM call's input
- `response` = output event's final_output OR LLM call's output
- `total_cost` = cost from the single LLM call
- `finish_reason` = finish_reason from the LLM call

### Test 2: Multiple LLM Call Trace (Agentic Workflow)

Generate traces with multi-LLM enabled:

```bash
MULTI_LLM_RATE=1.0 \  # Force 100% multi-LLM
NUM_USERS=1 CONVERSATIONS_PER_USER=1 MIN_MESSAGES=1 MAX_MESSAGES=1 \
API_URL="https://observa-api.vercel.app" \
node scripts/load-simulation-events.js <JWT_TOKEN>
```

**Expected:**
- `query` = **first** LLM call's input (user's original question)
- `response` = output event's final_output OR **last** LLM call's output
- `total_cost` = sum of all LLM call costs
- `finish_reason` = finish_reason from **last** LLM call

### Test 3: Trace with Output Event

**Expected:**
- `response` should prefer output event's `final_output`
- Should fallback to LLM call output if no output event

### Test 4: Trace without Output Event

**Expected:**
- `response` should fallback to last LLM call's output

## Frontend Verification

After verifying the API returns the correct data, check the frontend:

1. **Navigate to trace detail page:**
   ```
   https://observa-app.vercel.app/dashboard/traces/<TRACE_ID>
   ```

2. **Check Summary Section:**
   - ✅ User question should be displayed
   - ✅ Final response should be displayed
   - ✅ Cost should be displayed (if available)
   - ✅ Finish reason should be displayed (if available)

3. **Check Browser Console:**
   - Open DevTools → Console
   - Look for any errors
   - Verify the API response includes `summary.query` and `summary.response`

4. **Check Network Tab:**
   - Open DevTools → Network
   - Find the trace API request
   - Inspect response → `trace.summary`
   - Verify `query` and `response` fields are present

## Manual API Testing

### Test with curl:

```bash
# Replace <TRACE_ID> and <SESSION_TOKEN>
TRACE_ID="your-trace-id"
SESSION_TOKEN="your-session-token"

# Get trace with tree format
curl "https://observa-api.vercel.app/api/v1/traces/${TRACE_ID}?format=tree" \
  -H "Authorization: Bearer ${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  | jq '.trace.summary'
```

### Expected JSON Structure:

```json
{
  "trace_id": "...",
  "tenant_id": "...",
  "project_id": "...",
  "query": "I need help with my order #12345",  // ✅ Should be present
  "response": "I can help you with order #12345...",  // ✅ Should be present
  "total_cost": 0.000123,  // ✅ Should be a number (or null)
  "finish_reason": "stop",  // ✅ Should be present
  "model": "gpt-4o",
  "total_tokens": 150,
  "total_latency_ms": 1200,
  "conversation_id": "...",
  "session_id": "...",
  "user_id": "...",
  "environment": "prod",
  "start_time": "2026-01-...",
  "end_time": "2026-01-..."
}
```

## Troubleshooting

### Issue: `query` is null/undefined

**Possible Causes:**
1. Trace was generated before the fix (old traces won't have query)
2. No LLM call events in the trace
3. LLM call events don't have `input` field

**Solution:**
- Generate new traces using the simulation script
- Verify LLM call events have `attributes.llm_call.input` field

### Issue: `response` is null/undefined

**Possible Causes:**
1. No output events and no LLM call output
2. Trace was generated before the fix

**Solution:**
- Generate new traces (they should have output events)
- Check if output events exist: `jq '.trace.allSpans[] | select(.type == "output")'`

### Issue: `total_cost` is null

**Possible Causes:**
1. Cost calculation disabled in simulation (`ENABLE_COST_CALCULATION=false`)
2. LLM call events don't have `cost` attribute
3. All costs are 0

**Solution:**
- This is okay - cost can be null if not calculated
- Verify with: `jq '.trace.allSpans[] | select(.type == "llm_call") | .llm_call.cost'`

### Issue: API returns 401 Unauthorized

**Cause:** Invalid or expired session token

**Solution:**
- Log into the dashboard
- Get session token from browser cookies/storage
- Or use browser DevTools → Application → Cookies → find session token

### Issue: API returns 404 Not Found

**Cause:** Trace ID doesn't exist or doesn't belong to your tenant

**Solution:**
- Verify the trace ID is correct
- Make sure you're using traces from your tenant
- Check trace exists: Look in dashboard or query traces list

## Success Criteria

✅ **Critical Checks:**
- [ ] `summary.query` is present and contains user's question
- [ ] `summary.response` is present and contains final output
- [ ] No errors in API response
- [ ] Frontend can access `summary.query`
- [ ] Frontend can access `summary.response`

✅ **Nice to Have:**
- [ ] `summary.total_cost` is calculated correctly
- [ ] `summary.finish_reason` is present
- [ ] Multiple LLM calls: query comes from first, response from last
- [ ] Cost aggregation works for multiple LLM calls

## Automated Testing

The test script (`scripts/test-trace-summary.js`) will automatically:
1. ✅ Check if `query` field is present (CRITICAL)
2. ✅ Check if `response` field is present (CRITICAL)
3. ⚠️  Check if `total_cost` field is present (optional)
4. ⚠️  Check if `finish_reason` field is present (optional)
5. Display all summary fields for verification

Run it after deployment to quickly verify the fixes are working.

## Next Steps After Verification

1. ✅ If all tests pass: Fixes are working correctly
2. ✅ Verify frontend displays query and response
3. ✅ Monitor production for any issues
4. ✅ Update documentation if needed

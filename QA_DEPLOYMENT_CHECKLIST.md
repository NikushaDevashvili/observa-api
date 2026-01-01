# Deployment Checklist - Trace Summary Fixes

## Pre-Deployment

- [x] Code changes completed
- [x] TypeScript compilation passes (`npm run build`)
- [x] No linter errors
- [x] Code reviewed
- [ ] All tests pass (if applicable)

## Deployment Steps

1. **Commit Changes:**
   ```bash
   git add src/services/traceQueryService.ts
   git add scripts/test-trace-summary.js
   git commit -m "fix: Add query and response fields to trace summary

   - Extract query from first LLM call input
   - Extract response from output events or LLM call output
   - Aggregate total_cost from all LLM calls
   - Add finish_reason to summary
   - Fixes critical issue where frontend couldn't display user question and response"
   ```

2. **Push to Repository:**
   ```bash
   git push origin main  # or your branch
   ```

3. **Wait for Vercel Deployment:**
   - Check Vercel dashboard for deployment status
   - Wait for deployment to complete
   - Verify deployment is successful

## Post-Deployment Verification

### Step 1: Generate New Test Traces

Generate fresh traces that will use the new code:

```bash
NUM_USERS=2 CONVERSATIONS_PER_USER=1 MIN_MESSAGES=1 MAX_MESSAGES=1 \
API_URL="https://observa-api.vercel.app" \
node scripts/load-simulation-events.js <JWT_TOKEN>
```

**Save the trace IDs from the output.**

### Step 2: Run Automated Test

```bash
# Get session token from browser (after logging into dashboard)
# Then run test script:
TRACE_ID=<trace-id-from-step-1> \
SESSION_TOKEN=<your-session-token> \
API_URL="https://observa-api.vercel.app" \
node scripts/test-trace-summary.js
```

**Expected Output:**
- ✅ query (user question) [CRITICAL]: Should show the user's question
- ✅ response (final output) [CRITICAL]: Should show the final response
- ⚠️  total_cost: Should show cost (or null if disabled)
- ⚠️  finish_reason: Should show finish reason

### Step 3: Manual API Test

```bash
curl "https://observa-api.vercel.app/api/v1/traces/<TRACE_ID>?format=tree" \
  -H "Authorization: Bearer <SESSION_TOKEN>" \
  | jq '.trace.summary | {query, response, total_cost, finish_reason}'
```

**Verify:**
- `query` field exists and contains user's question
- `response` field exists and contains final output
- `total_cost` is a number (or null)
- `finish_reason` is a string (or null)

### Step 4: Frontend Verification

1. Navigate to: `https://observa-app.vercel.app/dashboard/traces/<TRACE_ID>`
2. Check summary section displays:
   - ✅ User question
   - ✅ Final response
   - ✅ Cost (if available)
   - ✅ Finish reason (if available)

3. Check browser console for errors

4. Check network tab:
   - Verify API response includes `summary.query`
   - Verify API response includes `summary.response`

### Step 5: Test Multiple Scenarios

- [ ] Single LLM call trace (should work)
- [ ] Multiple LLM call trace (agentic workflow)
- [ ] Trace with output event
- [ ] Trace without output event (should fallback)

## Rollback Plan

If issues are found:

1. **Revert the commit:**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

2. **Or manually revert changes:**
   - Remove query/response extraction code
   - Remove new fields from TraceSummary interface
   - Redeploy

## Success Criteria

✅ All critical checks pass:
- [ ] `summary.query` is present in API response
- [ ] `summary.response` is present in API response
- [ ] Frontend can display user question
- [ ] Frontend can display final response
- [ ] No errors in logs
- [ ] No breaking changes to existing functionality

## Monitoring

After deployment, monitor:
- [ ] API error rates (should not increase)
- [ ] API response times (should not degrade)
- [ ] Frontend errors (check Sentry/error tracking)
- [ ] User feedback (if applicable)

## Documentation Updates

- [x] QA_COMPREHENSIVE_ANALYSIS.md (created)
- [x] QA_FIXES_APPLIED.md (created)
- [x] QA_TESTING_GUIDE.md (created)
- [x] QA_DEPLOYMENT_CHECKLIST.md (this file)
- [ ] Update API documentation if needed
- [ ] Update frontend documentation if needed

## Notes

- Old traces (generated before deployment) will not have query/response in summary
- New traces (generated after deployment) will have query/response
- Frontend should handle null/undefined gracefully (fields are optional)
- No database migration needed (data is computed on-the-fly)
- No breaking changes (fields are added, not removed)


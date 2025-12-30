# QA Testing Guide - Observa Implementation

This guide provides comprehensive testing instructions for all newly implemented features.

## Prerequisites

1. **Environment Variables Set:**

   - `DATABASE_URL` - PostgreSQL connection string
   - `ANALYSIS_SERVICE_URL` - Python analysis service URL (e.g., Railway URL)
   - `TINYBIRD_ADMIN_TOKEN` - Tinybird admin token
   - `JWT_SECRET` - JWT signing secret

2. **Services Running:**

   - `observa-api` deployed on Vercel
   - `observa-analysis` deployed on Railway
   - `observa-app` deployed on Vercel

3. **Test Account:**
   - Email and password for login
   - API key from registration

## Test 1: Conversation Tracking - Basic Flow

### Step 1.1: Create a conversation with multiple messages

```bash
# Set your API key
API_KEY="your-api-key-here"
API_URL="https://observa-api.vercel.app"

# Generate a conversation ID
CONVERSATION_ID="conv-test-$(date +%s)"
SESSION_ID="session-test-$(date +%s)"
USER_ID="user-test-123"

# Send first message
curl -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "traceId": "trace-001",
    "spanId": "span-001",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "query": "What is the capital of France?",
    "context": "France is a country in Europe. The capital city of France is Paris.",
    "response": "The capital of France is Paris.",
    "model": "gpt-3.5-turbo",
    "tokensPrompt": 20,
    "tokensCompletion": 10,
    "tokensTotal": 30,
    "latencyMs": 500,
    "responseLength": 30,
    "conversationId": "'$CONVERSATION_ID'",
    "sessionId": "'$SESSION_ID'",
    "userId": "'$USER_ID'",
    "messageIndex": 1
  }'

# Send second message (same conversation)
curl -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "traceId": "trace-002",
    "spanId": "span-002",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "query": "What is the population of Paris?",
    "context": "Paris is the capital of France. The population of Paris is approximately 2.1 million people.",
    "response": "The population of Paris is approximately 2.1 million people.",
    "model": "gpt-3.5-turbo",
    "tokensPrompt": 25,
    "tokensCompletion": 15,
    "tokensTotal": 40,
    "latencyMs": 600,
    "responseLength": 60,
    "conversationId": "'$CONVERSATION_ID'",
    "sessionId": "'$SESSION_ID'",
    "userId": "'$USER_ID'",
    "messageIndex": 2
  }'

# Send third message (same conversation)
curl -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "traceId": "trace-003",
    "spanId": "span-003",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "query": "What is the Eiffel Tower?",
    "context": "The Eiffel Tower is a famous landmark in Paris, France. It was built in 1889.",
    "response": "The Eiffel Tower is a famous landmark in Paris, France, built in 1889.",
    "model": "gpt-3.5-turbo",
    "tokensPrompt": 30,
    "tokensCompletion": 20,
    "tokensTotal": 50,
    "latencyMs": 700,
    "responseLength": 70,
    "conversationId": "'$CONVERSATION_ID'",
    "sessionId": "'$SESSION_ID'",
    "userId": "'$USER_ID'",
    "messageIndex": 3
  }'
```

**Expected Results:**

- All three requests return `{"success": true, "traceId": "...", "message": "Trace ingested successfully"}`
- Wait 30-60 seconds for analysis to complete

### Step 1.2: Verify conversation was created

```bash
# Get session token (login first)
SESSION_TOKEN="your-session-token-here"

# List conversations
curl -X GET "$API_URL/api/v1/conversations" \
  -H "Authorization: Bearer $SESSION_TOKEN"

# Expected: Should see the conversation with:
# - conversation_id: $CONVERSATION_ID
# - message_count: 3
# - total_tokens: 120 (30+40+50)
# - user_id: $USER_ID
```

### Step 1.3: Get conversation details

```bash
# Get specific conversation
curl -X GET "$API_URL/api/v1/conversations/$CONVERSATION_ID" \
  -H "Authorization: Bearer $SESSION_TOKEN"

# Expected: Full conversation object with all metrics
```

### Step 1.4: Get conversation messages

```bash
# Get all messages in conversation
curl -X GET "$API_URL/api/v1/conversations/$CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $SESSION_TOKEN"

# Expected: Array of 3 messages, ordered by message_index
```

### Step 1.5: Get conversation analytics

```bash
# Get conversation analytics
curl -X GET "$API_URL/api/v1/conversations/$CONVERSATION_ID/analytics" \
  -H "Authorization: Bearer $SESSION_TOKEN"

# Expected: Analytics object with:
# - totalMessages: 3
# - totalTokens: 120
# - totalCost: > 0
# - averageLatency: ~600ms
```

## Test 2: Frontend - Conversation Pages

### Step 2.1: Access conversation list

1. Go to `https://observa-app.vercel.app/dashboard/conversations`
2. Login if needed
3. **Expected:** See list of conversations with:
   - Conversation ID (truncated)
   - User ID
   - Message count
   - Total tokens
   - Total cost
   - Last message timestamp
   - Status (OK/Issues)

### Step 2.2: Filter conversations

1. Click "With Issues" filter
2. **Expected:** Only conversations with `has_issues: true` are shown

### Step 2.3: View conversation detail

1. Click "View →" on any conversation
2. **Expected:** See:
   - Conversation header with ID and user
   - Analytics summary cards (Total Messages, Tokens, Cost, Issue Rate)
   - Full message thread (all messages in order)
   - Each message shows:
     - Message number
     - Query and Response
     - Issue badges (if any)
     - Link to trace details

## Test 3: Model Preloading & Health Checks

### Step 3.1: Check analysis service health

```bash
ANALYSIS_URL="https://your-railway-service.railway.app"

# Check /health endpoint
curl -X GET "$ANALYSIS_URL/health"

# Expected:
# {
#   "status": "ok",
#   "service": "observa-analysis",
#   "models": {
#     "hallucination": "loaded",
#     "context": "loaded",
#     "faithfulness": "loaded",
#     "drift": "loaded",
#     "cost": "loaded"
#   }
# }
```

### Step 3.2: Check readiness endpoint

```bash
# Check /ready endpoint
curl -X GET "$ANALYSIS_URL/ready"

# Expected (if models loaded):
# {
#   "status": "ready",
#   "service": "observa-analysis",
#   "models": { ... }
# }

# Expected (if models not loaded):
# 503 status with details about which models are loading
```

### Step 3.3: Test cold start (if possible)

1. Restart Railway service
2. Immediately check `/ready` endpoint
3. **Expected:** Returns 503 until models are loaded
4. Wait 30-60 seconds
5. Check again
6. **Expected:** Returns 200 with all models ready

## Test 4: Parallel Processing Performance

### Step 4.1: Measure analysis time

```bash
# Send a trace with all analysis types
START_TIME=$(date +%s%N)

curl -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "traceId": "trace-performance-test",
    "spanId": "span-perf",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "query": "What is machine learning?",
    "context": "Machine learning is a subset of artificial intelligence that enables systems to learn from data.",
    "response": "Machine learning is a subset of AI that enables systems to learn from data without explicit programming.",
    "model": "gpt-4",
    "tokensPrompt": 50,
    "tokensCompletion": 30,
    "tokensTotal": 80,
    "latencyMs": 1000,
    "responseLength": 100
  }'

# Wait for analysis to complete (check in dashboard)
# Then check processing_time_ms in analysis_results

# Expected: processing_time_ms should be < 30 seconds (previously was 120+ seconds)
```

### Step 4.2: Verify all detectors ran

1. Go to trace detail page in dashboard
2. **Expected:** See results from:
   - Hallucination detection
   - Context drop detection
   - Faithfulness detection
   - Cost anomaly detection
   - Model drift detection

## Test 5: Error Handling & Retry Logic

### Step 5.1: Test timeout handling

```bash
# Temporarily set ANALYSIS_SERVICE_URL to invalid URL
# (This will cause timeout)

# Send a trace
curl -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{ ... }'

# Expected:
# - Trace ingestion succeeds (non-blocking)
# - Analysis fails gracefully
# - Error logged but doesn't break trace ingestion
```

### Step 5.2: Test 503 retry logic

1. Restart analysis service (models will be loading)
2. Send a trace immediately
3. **Expected:**
   - Analysis service retries up to 3 times
   - Exponential backoff between retries
   - Eventually succeeds when service is ready

## Test 6: Conversation Analytics Accuracy

### Step 6.1: Create conversation with issues

```bash
# Send trace with hallucination
curl -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "traceId": "trace-hallucination",
    "spanId": "span-hall",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "query": "What is the capital of France?",
    "context": "France is a country in Europe. The capital city of France is Paris.",
    "response": "The capital of France is London.",  // WRONG - should trigger hallucination
    "model": "gpt-3.5-turbo",
    "tokensPrompt": 20,
    "tokensCompletion": 10,
    "tokensTotal": 30,
    "latencyMs": 500,
    "responseLength": 30,
    "conversationId": "'$CONVERSATION_ID'",
    "messageIndex": 4
  }'
```

### Step 6.2: Verify conversation has_issues flag

```bash
# Wait for analysis
sleep 60

# Get conversation
curl -X GET "$API_URL/api/v1/conversations/$CONVERSATION_ID" \
  -H "Authorization: Bearer $SESSION_TOKEN"

# Expected: has_issues: true
```

### Step 6.3: Check analytics accuracy

```bash
# Get analytics
curl -X GET "$API_URL/api/v1/conversations/$CONVERSATION_ID/analytics" \
  -H "Authorization: Bearer $SESSION_TOKEN"

# Expected:
# - issueCount: > 0
# - hallucinationRate: > 0 (if hallucination detected)
```

## Test 7: Edge Cases

### Test 7.1: Trace without conversation fields

```bash
# Send trace without conversationId
curl -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "traceId": "trace-no-conv",
    "spanId": "span-no-conv",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "query": "Test query",
    "response": "Test response",
    "tokensTotal": 10,
    "latencyMs": 100,
    "responseLength": 20
  }'

# Expected: Trace ingestion succeeds (conversation fields are optional)
```

### Test 7.2: Multiple conversations for same user

```bash
# Create second conversation for same user
CONVERSATION_ID_2="conv-test-2-$(date +%s)"

curl -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "traceId": "trace-004",
    "spanId": "span-004",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "query": "What is Python?",
    "response": "Python is a programming language.",
    "tokensTotal": 20,
    "latencyMs": 200,
    "responseLength": 40,
    "conversationId": "'$CONVERSATION_ID_2'",
    "userId": "'$USER_ID'",
    "messageIndex": 1
  }'

# Expected: New conversation created, separate from first
```

### Test 7.3: Pagination

```bash
# List conversations with pagination
curl -X GET "$API_URL/api/v1/conversations?limit=10&offset=0" \
  -H "Authorization: Bearer $SESSION_TOKEN"

# Expected: Returns first 10 conversations with pagination metadata
```

## Test 8: Integration - Full Flow

### Step 8.1: Complete user journey

1. **Login** to `observa-app.vercel.app`
2. **Send traces** with conversation tracking using SDK or API
3. **View conversations** in dashboard
4. **Click conversation** to see full thread
5. **Check analytics** for conversation-level insights
6. **View individual traces** from conversation

### Step 8.2: Verify data consistency

1. Check that conversation metrics match sum of individual traces
2. Verify message ordering (by message_index)
3. Confirm issue flags are correctly aggregated

## Success Criteria

✅ **Conversation Tracking:**

- Conversations are created and updated correctly
- Messages are linked to conversations
- Analytics are accurate

✅ **Performance:**

- Analysis completes in < 30 seconds (parallel processing)
- Models preload on startup (< 60 seconds)
- No cold start delays after initial load

✅ **Error Handling:**

- Timeouts handled gracefully
- Retries work correctly
- Partial results returned on failures

✅ **Frontend:**

- Conversation list displays correctly
- Conversation detail shows full thread
- Analytics are visible and accurate

✅ **Health Checks:**

- `/health` returns model status
- `/ready` returns 503 until models loaded
- Service recovers gracefully

## Troubleshooting

### Issue: Conversations not appearing

- Check database schema was initialized
- Verify migration ran successfully
- Check conversationId is being sent in traces

### Issue: Analysis taking too long

- Check Railway service logs
- Verify models are preloaded (check /ready endpoint)
- Check for errors in analysis service

### Issue: Frontend not loading conversations

- Check API proxy routes are working
- Verify session token is valid
- Check browser console for errors

### Issue: Models not loading

- Check Railway service has enough memory (8GB recommended)
- Verify model files are downloading
- Check Railway logs for OOM errors

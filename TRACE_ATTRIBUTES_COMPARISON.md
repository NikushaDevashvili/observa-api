# Trace Attributes Comparison - Dashboard vs Tinybird

## Trace ID
`05420b59-6f0a-42af-a1f1-20b1d14deeaa`

## Issue Identified
The `llm_call` event's `attributes` field is empty `{}` in the dashboard trace, while Tinybird's `attribute_json` contains all the LLM call data.

## Data Comparison

### ✅ Data that Matches

| Field | Dashboard | Tinybird | Status |
|-------|-----------|----------|--------|
| **Total Tokens** | 9 | 9 | ✅ Match |
| **Total Cost** | $0.00027 | 0.00026999999999999995 | ✅ Match |
| **Total Latency** | 1,193ms | 1,187ms | ✅ Close (6ms difference) |

### ❌ Missing Data in Dashboard

| Field | Dashboard | Tinybird | Expected |
|-------|-----------|----------|----------|
| **Model** | `n/a` | `"openai/gpt-4.1-mini"` | Should show model name |
| **Query** | `n/a` | `"hey"` | Should show input |
| **Response** | `n/a` | `"Hey! How can I help you today?"` | Should show output |
| **Time to First Token** | `n/a` | `984ms` | Should show TTT |
| **Streaming Duration** | `n/a` | `194ms` | Should show duration |
| **Status** | `n/a` | `"success"` | Should show status |
| **Finish Reason** | Not shown | `{}` | Should show finish reason |
| **Operation Name** | Not shown | `"generate_text"` | Should show operation |
| **Provider Name** | Not shown | `"gateway"` | Should show provider |

## Root Cause Analysis

### Current State in Dashboard Trace

The `llm_call` event shows empty attributes:

```json
{
  "event_type": "llm_call",
  "timestamp": "2026-01-18 18:11:44.071",
  "attributes": {},  // ❌ EMPTY - Should contain llm_call data
  "span_id": "b7ce0368-e059-434a-a71c-696a0be651bc"
}
```

### Expected State (from Tinybird)

The `attribute_json` from Tinybird contains:

```json
{
  "llm_call": {
    "model": "openai/gpt-4.1-mini",
    "input": "hey",
    "output": "Hey! How can I help you today?",
    "input_tokens": 1,
    "output_tokens": 8,
    "total_tokens": 9,
    "latency_ms": 1187,
    "time_to_first_token_ms": 984,
    "streaming_duration_ms": 194,
    "finish_reason": {},
    "cost": 0.00026999999999999995,
    "operation_name": "generate_text",
    "provider_name": "gateway",
    "response_model": "openai/gpt-4.1-mini",
    "input_messages": [...],
    "output_messages": [...],
    "status": "success"
  },
  "metadata": {
    "tools": [...],
    "ai.prompt.tools": [...]
  }
}
```

### Problem Location

The issue is in `/src/services/traceQueryService.ts` when building the trace tree:

1. **Line 1074-1116**: `attributes_json` is parsed correctly from events
2. **Line 1326**: Attributes are copied to event: `attributes: event.attributes`
3. **Line 1403-1445**: Code expects `llmCallEvent.attributes.llm_call` to extract LLM data

**The problem**: The parsed `attributes` object is not being populated correctly. The `attributes_json` may be:
- Empty when retrieved from the database
- Not being parsed correctly
- Not stored correctly when events are ingested

### Code Flow

```typescript
// Step 1: Parse attributes_json (lines 1074-1116)
const parsedEvents = uniqueEvents.map((event: any) => {
  let attributes = {};
  if (typeof event.attributes_json === "string") {
    attributes = JSON.parse(event.attributes_json); // ✅ Should parse correctly
  }
  return { ...event, attributes };
});

// Step 2: Add event to span (lines 1320-1329)
spanEventsMap.get(spanId)!.push({
  attributes: event.attributes, // ❌ This is empty {}
});

// Step 3: Extract LLM data (lines 1403-1445)
if (llmCallEvent?.attributes?.llm_call) { // ❌ This fails because attributes is {}
  const llmAttrs = llmCallEvent.attributes.llm_call;
  // Extract model, input, output, tokens, etc.
}
```

## Root Cause Analysis - Code Flow

### Data Flow Path

1. **Event Ingestion** (`src/routes/events.ts` lines 483-520):
   - Events are received with `attributes` object
   - `attributes` is stringified to `attributes_json` and sent to Tinybird
   - ✅ This should store `{"llm_call": {...}, "metadata": {...}}`

2. **Event Retrieval** (`src/services/tinybirdRepository.ts` lines 297-316):
   - Query selects `attributes_json` from `canonical_events` datasource
   - Returns events with `attributes_json` as a string

3. **Attribute Parsing** (`src/services/traceQueryService.ts` lines 1074-1116):
   ```typescript
   const parsedEvents = uniqueEvents.map((event: any) => {
     let attributes = {};
     if (typeof event.attributes_json === "string") {
       let jsonStr = event.attributes_json.trim();
       if (jsonStr && jsonStr.length > 0) {
         attributes = JSON.parse(jsonStr); // Should parse to {llm_call: {...}, metadata: {...}}
       }
     }
     return { ...event, attributes };
   });
   ```

4. **Event to Span** (`src/services/traceQueryService.ts` line 1326):
   ```typescript
   spanEventsMap.get(spanId)!.push({
     attributes: event.attributes, // Should have llm_call here
   });
   ```

5. **LLM Data Extraction** (`src/services/traceQueryService.ts` line 1403):
   ```typescript
   if (llmCallEvent?.attributes?.llm_call) { // This check fails if attributes is {}
     const llmAttrs = llmCallEvent.attributes.llm_call;
     // Extract model, input, output, etc.
   }
   ```

### Debug Logging Already Present

The code already has debug logging at:
- **Lines 1209-1222**: Warns if `llm_call` event has no attributes or missing `llm_call` key
- **Lines 1384-1401**: Warns if `llmCallEvent` attributes are missing before extraction
- **Lines 1094-1110**: Logs errors if JSON parsing fails

**Check server logs** for these warnings to see what's actually happening.

## Potential Issues

### Issue 1: Empty `attributes_json` in Tinybird
- **Symptom**: `attributes_json` is `null`, `""`, or `"{}"` when retrieved
- **Cause**: Event was ingested without proper attributes
- **Check**: Query Tinybird directly to see what's stored

### Issue 2: JSON Parsing Fails Silently
- **Symptom**: Parsing fails but catch block sets `attributes = {}`
- **Cause**: Invalid JSON string (escaped incorrectly, truncated, etc.)
- **Check**: Logs should show error at line 1100-1107

### Issue 3: Attributes Structure Mismatch
- **Symptom**: Parsed attributes don't have `llm_call` at top level
- **Cause**: Different structure than expected
- **Check**: Logs at lines 1213-1222 should show available keys

### Issue 4: Multiple Events / Wrong Event
- **Symptom**: Looking at wrong event type or duplicate events
- **Cause**: Multiple `llm_call` events or event deduplication issues
- **Check**: Verify trace has exactly one `llm_call` event

## Next Steps - Investigation

1. **Check Server Logs** for warnings from:
   - Line 1210-1217: Attributes missing after parsing
   - Line 1387-1400: Attributes missing before extraction
   - Line 1100-1107: JSON parsing errors

2. **Query Tinybird Directly**:
   ```sql
   SELECT attributes_json 
   FROM canonical_events 
   WHERE trace_id = '05420b59-6f0a-42af-a1f1-20b1d14deeaa' 
     AND event_type = 'llm_call'
   ORDER BY timestamp;
   ```

3. **Run Debug Script** (if env vars available):
   ```bash
   node scripts/debug-trace-attributes.js 05420b59-6f0a-42af-a1f1-20b1d14deeaa 4f62d2a5-6a34-4d53-a301-c0c661b0c4d6
   ```

4. **Add Enhanced Logging** if needed:
   - Log the raw `attributes_json` string before parsing
   - Log the parsed `attributes` object after parsing
   - Log the final `llmCallEvent.attributes` before extraction

## Expected vs Actual

**Expected** (based on Tinybird data you provided):
```json
{
  "attributes": {
    "llm_call": {
      "model": "openai/gpt-4.1-mini",
      "input": "hey",
      "output": "Hey! How can I help you today?",
      ...
    },
    "metadata": {...}
  }
}
```

**Actual** (from dashboard trace):
```json
{
  "attributes": {}  // ❌ EMPTY
}
```

## Recommended Fix

Based on the code analysis, the issue is most likely:

1. **Empty `attributes_json` in Tinybird** - The event was stored with empty attributes
2. **Or the attributes_json string is `"{}"` or empty** when retrieved

**Solution**: Check the event ingestion path to ensure attributes are properly stringified before sending to Tinybird. The code at `src/routes/events.ts` lines 483-520 should handle this, but verify the incoming event actually has the `llm_call` data in `attributes.llm_call`.

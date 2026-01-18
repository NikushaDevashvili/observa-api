# Debug Attributes Parsing - Enhanced Logging Added

## Problem

The `llm_call` event's `attributes` field is empty `{}` in the dashboard trace, even though `attributes_json` contains the full LLM call data in Tinybird.

## Solution Applied

Enhanced logging has been added to `/src/services/traceQueryService.ts` to track where attributes are being lost:

### 1. Logging at Parse Time (Lines ~1074-1116)

Logs for `llm_call` events:
- `attributes_json` type and length
- Preview of first 500 characters of `attributes_json` string
- Whether parsing succeeded
- Parsed attributes keys
- Whether `llm_call` key exists in parsed attributes
- Model name and input preview if `llm_call` is present

### 2. Logging at Event-to-Span Time (Lines ~1320-1330)

Logs for `llm_call` events:
- Event attributes type
- Event attributes keys
- Whether `event.attributes.llm_call` exists before adding to span

### 3. Existing Logging at Extraction Time (Lines ~1384-1401)

Already logs warnings if:
- `llmCallEvent` has no attributes property
- `llmCallEvent.attributes` is missing `llm_call` key

## How to Debug

1. **Query the trace detail** via API or dashboard:
   ```bash
   GET /api/v1/traces/05420b59-6f0a-42af-a1f1-20b1d14deeaa
   ```

2. **Check server logs** for the following log entries:
   - `[TraceQueryService] Parsing llm_call event` - Shows raw attributes_json from Tinybird
   - `[TraceQueryService] ✅ Successfully parsed attributes_json` - Confirms parsing worked
   - `[TraceQueryService] Adding llm_call event to span` - Shows attributes before adding to span
   - `[TraceQueryService] ⚠️ llmCallEvent attributes missing llm_call key` - Shows if extraction fails

3. **What to Look For**:

   **Scenario A: attributes_json is empty/undefined when retrieved**
   ```
   [TraceQueryService] attributes_json is null/undefined: true
   ```
   → Issue is in Tinybird retrieval, check `tinybirdRepository.ts`

   **Scenario B: JSON parsing fails**
   ```
   [TraceQueryService] Failed to parse attributes_json for event llm_call
   ```
   → Issue is with JSON format, check the error message and JSON preview

   **Scenario C: Parsing succeeds but attributes lost during span creation**
   ```
   [TraceQueryService] ✅ Successfully parsed attributes_json
   [TraceQueryService] Has llm_call key: YES
   [TraceQueryService] Adding llm_call event to span
   [TraceQueryService] event.attributes.llm_call exists: NO  ← PROBLEM HERE
   ```
   → Issue is between parsing and span creation (line 1114 vs line 1326)

   **Scenario D: Attributes present but extraction fails**
   ```
   [TraceQueryService] event.attributes.llm_call exists: YES
   [TraceQueryService] ⚠️ llmCallEvent attributes missing llm_call key  ← PROBLEM HERE
   ```
   → Issue is with event lookup or structure at extraction time (line 1346-1403)

## Expected Log Output (Success Case)

```
[TraceQueryService] Parsing llm_call event (trace: 05420b59..., span: b7ce0368...):
[TraceQueryService] attributes_json type: string
[TraceQueryService] attributes_json length: 1234
[TraceQueryService] attributes_json preview (first 500 chars): {"llm_call":{"model":"openai/gpt-4.1-mini",...
[TraceQueryService] ✅ Successfully parsed attributes_json
[TraceQueryService] Parsed attributes keys: llm_call, metadata
[TraceQueryService] Has llm_call key: YES
[TraceQueryService] llm_call.model: openai/gpt-4.1-mini
[TraceQueryService] llm_call.input: hey
[TraceQueryService] Adding llm_call event to span b7ce0368...:
[TraceQueryService] event.attributes type: object
[TraceQueryService] event.attributes keys: llm_call, metadata
[TraceQueryService] event.attributes.llm_call exists: YES
```

## Next Steps

1. **Deploy the enhanced logging** (or test locally with the changes)
2. **Query the trace detail** for `05420b59-6f0a-42af-a1f1-20b1d14deeaa`
3. **Check the logs** to see which scenario applies
4. **Fix the issue** based on where the data is lost

## Potential Issues Based on Logs

### If attributes_json is empty when retrieved:
- Check `tinybirdRepository.ts` `getTraceEvents()` method
- Verify Tinybird query is returning the correct field
- Check if JSON/TSV parsing is stripping the field

### If JSON parsing fails:
- Check the JSON preview in error logs
- May need to fix JSON escaping or format
- Could be TSV parsing issue if tabs/newlines are in JSON

### If attributes lost between parsing and span creation:
- Check the `parsedEvents.map()` function (line 1075)
- Verify `return { ...event, attributes }` is correct
- Check if event object is being mutated elsewhere

### If attributes present but extraction fails:
- Check `spanEvents.find()` is finding correct event (line 1346)
- Verify event structure matches expected format
- Check if events are being filtered/transformed incorrectly

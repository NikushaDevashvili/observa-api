# Fix: JSON Parsing Error for attributes_json

## Problem Identified

The logs show a JSON parsing error:
```
Expected ',' or '}' after property value in JSON at position 2800
```

This causes the `attributes_json` parsing to fail, resulting in empty `attributes: {}` and missing LLM call data in the dashboard.

## Root Cause

The `attributes_json` string stored in Tinybird is malformed JSON - likely due to:
1. **Double-encoding**: JSON string inside a JSON string (escaped incorrectly)
2. **Escaping issues**: Special characters not properly escaped when stored
3. **Truncation or corruption**: JSON may be cut off or corrupted at position 2800

## Solution Implemented

Enhanced JSON parsing in `/src/services/traceQueryService.ts` with multiple fallback strategies:

### Strategy 1: Direct Parsing
- Try `JSON.parse(jsonStr)` first (fastest)

### Strategy 2: Fix Common Escaping Issues
- Fix incorrect single quote escaping (`\'` → `'`)
- Fix double-escaped backslashes (`\\'` → `\'`)
- Fix escaped quotes (`\"` → `"`)
- Fix double-escaped quotes (`\\"` → `\"`)

### Strategy 3: Handle Double-Encoded JSON
- Detect if JSON string is wrapped in quotes (double-encoded)
- Parse twice to get the inner JSON string
- Example: `"{\"llm_call\":{...}}"` → parse once to get `{"llm_call":{...}}` → parse again to get object

### Strategy 4: Salvage Partial Data (for llm_call events)
- Extract `llm_call` section even if full JSON is broken
- Find `"llm_call":{` pattern
- Balance braces to extract complete `llm_call` object
- Parse just the `llm_call` section to preserve critical data

### Enhanced Error Logging
- Log error position and context around error
- Show 100 characters before and after error position
- Helps identify what's breaking the JSON

## Code Changes

**File**: `src/services/traceQueryService.ts` (lines ~1100-1210)

**Before**: Simple `JSON.parse()` with basic escaping fixes
```typescript
jsonStr = jsonStr.replace(/\\'/g, "'");
jsonStr = jsonStr.replace(/\\\\'/g, "\\'");
attributes = JSON.parse(jsonStr);
```

**After**: Multi-strategy parsing with fallbacks
```typescript
// Try Strategy 1: Direct parsing
try {
  attributes = JSON.parse(jsonStr);
} catch {
  // Try Strategy 2: Fix escaping
  try {
    fixedJson = fixEscaping(jsonStr);
    attributes = JSON.parse(fixedJson);
  } catch {
    // Try Strategy 3: Double-encoded
    try {
      const firstParse = JSON.parse(jsonStr); // Get inner string
      if (typeof firstParse === "string") {
        attributes = JSON.parse(firstParse); // Parse inner JSON
      }
    } catch {
      // Try Strategy 4: Salvage llm_call
      // Extract llm_call section even if full JSON is broken
    }
  }
}
```

## Testing

To verify the fix:

1. **Query a trace** that was previously failing:
   ```bash
   GET /api/v1/traces/05420b59-6f0a-42af-a1f1-20b1d14deeaa
   ```

2. **Check logs** for:
   - ✅ `Successfully parsed attributes_json` - Strategy 1 worked
   - ⚠️ `Fixed JSON escaping issues and parsed successfully` - Strategy 2 worked
   - ⚠️ `Detected double-encoded JSON and parsed successfully` - Strategy 3 worked
   - ⚠️ `Salvaged llm_call from malformed JSON` - Strategy 4 worked (partial recovery)

3. **Verify dashboard** shows:
   - Model name (not "n/a")
   - Query/Input text
   - Response/Output text
   - Time to first token
   - Streaming duration

## Expected Behavior

- **Before Fix**: JSON parsing fails → `attributes: {}` → No LLM data in dashboard
- **After Fix**: JSON parsing succeeds (with fallback strategies) → `attributes: {llm_call: {...}}` → Full LLM data in dashboard

## Prevention

To prevent malformed JSON in the future:

1. **Event Ingestion** (`src/routes/events.ts` lines 483-520):
   - Already validates JSON before storing: `JSON.parse(JSON.stringify(finalAttributes))`
   - This should catch malformed JSON before sending to Tinybird

2. **Check Tinybird Storage**:
   - Verify how Tinybird stores JSON strings
   - May need to escape JSON differently for Tinybird's TSV format

3. **Add Validation**:
   - Add post-ingestion validation to verify stored JSON can be parsed
   - Alert if malformed JSON is detected

## Related Issues

- Original issue: Empty `attributes` in dashboard trace detail
- Error: `Expected ',' or '}' after property value in JSON at position 2800`
- Root cause: Malformed JSON in Tinybird `attributes_json` field

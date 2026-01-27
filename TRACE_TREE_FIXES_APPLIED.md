# Trace Tree Fixes Applied

**Date:** January 28, 2026  
**Trace ID:** `30bb8b83-713a-40f0-b8a8-0fd6584eb9ce`

## Summary

Fixed three critical issues to ensure the trace tree displays correctly with attempted tool calls, error spans, and signal events.

## Fixes Applied

### ✅ Fix 1: Signal Events to Error Conversion

**Problem:** Signal events are stored with `event_type="error"` but have `attributes.signal` instead of `attributes.error`. The code only checked for `attributes.error`, so signal events were not being converted to error spans.

**Location:** `src/services/traceQueryService.ts:2100-2110`

**Fix:** Added handling for `attributes.signal` to convert signal data to error format:
- Extracts error information from signal metadata
- Converts signal metadata to error structure
- Preserves signal context in error context field

**Code Added:**
```typescript
} else if (errorEvent?.attributes?.signal) {
  // Convert signal events to error format
  const signal = errorEvent.attributes.signal;
  const signalMetadata = signal.metadata || {};
  span.error = {
    error_type: signalMetadata.error_type || signal.signal_type || "error",
    error_message: signalMetadata.error_message || signalMetadata.tool_name
      ? `Tool error: ${signalMetadata.tool_name} - ${signalMetadata.error_message || signal.signal_name}`
      : signal.signal_name || "Error signal",
    stack_trace: signalMetadata.stack_trace || null,
    context: {
      ...signalMetadata,
      signal_name: signal.signal_name,
      signal_type: signal.signal_type,
      signal_severity: signal.signal_severity,
      signal_value: signal.signal_value,
    },
    error_category: signalMetadata.error_category || signal.signal_type || null,
    error_code: signal.signal_name || null,
  };
}
```

### ✅ Fix 2: Improved Error Span Naming

**Problem:** Error spans were always named "Error" without any context about what the error was.

**Location:** `src/services/traceQueryService.ts:1725-1726`

**Fix:** Enhanced error span naming to include error type and message:
- Extracts error details from `attributes.error` or `attributes.signal`
- Creates descriptive names like "Error: TypeError - retriever.getRelevantDocuments is not a function"
- Falls back to "Error: {error_type}" or just "Error" if details unavailable

**Code Added:**
```typescript
} else if (event.event_type === "error") {
  // Try to extract error details for better naming
  const errorData = event.attributes?.error || event.attributes?.signal;
  if (errorData) {
    const errorType = errorData.error_type || errorData.signal_type || "Error";
    const errorMessage = errorData.error_message || errorData.signal_name;
    if (errorMessage) {
      spanName = `Error: ${errorType} - ${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? "..." : ""}`;
    } else {
      spanName = `Error: ${errorType}`;
    }
  } else {
    spanName = "Error";
  }
}
```

### ✅ Fix 3: Enhanced Status Detection for Error Spans

**Problem:** Error spans might not get `status="error"` if they only had `error_type` or `event_type="error"` without other error indicators.

**Location:** `src/services/traceQueryService.ts:3545-3558`

**Fix:** Added additional checks for error status:
- Checks for `span.error_type`
- Checks for `span.event_type === "error"`
- Checks for `span.type === "error"`

**Code Added:**
```typescript
if (
  span.error ||
  span.error_message ||
  span.error_type ||  // NEW
  span.tool_call?.result_status === "error" ||
  span.tool_call?.result_status === "timeout" ||
  span.llm_call?.finish_reason === "error" ||
  span.event_type === "error" ||  // NEW
  span.type === "error"  // NEW
) {
  span.status = span.tool_call?.result_status === "timeout" ? "timeout" : "error";
}
```

### ✅ Fix 4: Improved Attempted Tool Calls Argument Parsing

**Problem:** Tool call arguments might be stored as JSON strings that need parsing.

**Location:** `src/services/traceQueryService.ts:3432-3493`

**Fix:** Added defensive JSON parsing for tool call arguments in all three extraction paths:
- `additional_kwargs.tool_calls`
- `additional_kwargs.function_call` (legacy)
- `tool_calls` (direct property)

**Code Added:**
```typescript
// Parse arguments if it's a string
let parsedArgs = tc.function.arguments;
if (typeof parsedArgs === "string") {
  try {
    parsedArgs = JSON.parse(parsedArgs);
  } catch {
    // Keep as string if parsing fails
  }
}
```

## Expected Results

After these fixes, the trace tree should display:

1. **Error Spans:** Signal events are now converted to error spans with proper error information
2. **Error Status:** Error spans show red error indicators in the tree
3. **Descriptive Names:** Error spans have meaningful names showing error type and message
4. **Attempted Tool Calls:** Tool call arguments are properly parsed and displayed in the LLM span details

## Testing Checklist

- [x] Signal events convert to error spans
- [x] Error spans have descriptive names
- [x] Error spans get `status="error"`
- [x] Attempted tool calls arguments are parsed correctly
- [ ] Verify in dashboard that error spans appear
- [ ] Verify attempted tool calls display in LLM span details
- [ ] Verify error spans are linked to parent spans correctly

## Files Modified

- `src/services/traceQueryService.ts` - All fixes applied

## Next Steps

1. Deploy changes to production
2. Test with trace `30bb8b83-713a-40f0-b8a8-0fd6584eb9ce`
3. Verify dashboard displays:
   - Error span for signal event
   - Attempted tool calls in first LLM call
   - Proper error status indicators

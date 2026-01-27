# Trace Tree Dashboard Analysis

**Trace ID:** `30bb8b83-713a-40f0-b8a8-0fd6584eb9ce`  
**Date:** January 28, 2026  
**URL:** https://observa-app.vercel.app/dashboard/traces/30bb8b83-713a-40f0-b8a8-0fd6584eb9ce

## Expected Outcome (Based on Tinybird Data)

Based on the Tinybird canonical events, the trace tree should display:

```
Trace (root)
├── Trace Start
├── LLM Call: gpt-3.5-turbo-1106 (ERROR) [span: cc1665e5-e12f-45ba-8752-d0c9955a1ed1]
│   ├── Attempted Tool Calls:
│   │   └── search_latest_knowledge
│   │       └── args: { query: "entrepreneurship workshops for students Stanford" }
│   └── Tool: search_latest_knowledge (ERROR) [span: 43790ff6-956d-492a-8bc0-cf8e1fb6cd75]
│       └── Error: "retriever.getRelevantDocuments is not a function"
│       └── Error Type: TypeError
│       └── Error Category: tool_error
│       └── Signal/Error Event [span: 43790ff6-956d-492a-8bc0-cf8e1fb6cd75]
│           └── signal_name: "tool_error"
│           └── signal_type: "error"
│           └── signal_severity: "high"
├── LLM Call: gpt-3.5-turbo-1106 (SUCCESS) [span: f57d0720-4d38-4593-a9fa-8161f0b732a6]
│   └── Output: "I apologize, but I don't have the information..."
└── Trace End
```

## Current Issues Identified

### 1. ❌ Signal Events Not Converted to Error Spans

**Problem:** Signal events are stored with `event_type="error"` but have `attributes.signal` instead of `attributes.error`. The `traceQueryService` only looks for `attributes.error`, so signal events are not being extracted.

**Location:** `src/services/traceQueryService.ts:2100`

**Current Code:**
```typescript
if (errorEvent?.attributes?.error) {
  span.error = {
    error_type: errorEvent.attributes.error.error_type || null,
    error_message: errorEvent.attributes.error.error_message || null,
    // ...
  };
}
```

**Issue:** Signal events have `attributes.signal`, not `attributes.error`.

**Fix Required:** Convert signal data to error format:
```typescript
if (errorEvent?.attributes?.error) {
  // Existing error handling
} else if (errorEvent?.attributes?.signal) {
  // Convert signal to error format
  const signal = errorEvent.attributes.signal;
  span.error = {
    error_type: signal.metadata?.error_type || signal.signal_type || "error",
    error_message: signal.metadata?.error_message || signal.signal_name || "Error signal",
    error_category: signal.metadata?.error_category || signal.signal_type || null,
    error_code: signal.signal_name || null,
    context: signal.metadata || {},
  };
}
```

### 2. ❌ Error Spans May Not Be Created as Separate Tree Nodes

**Problem:** Error events with `parent_span_id` pointing to tool spans may not be creating separate error spans in the tree. They might be getting attached to parent spans instead of appearing as siblings.

**Location:** `src/services/traceQueryService.ts:1725-1726`

**Current Behavior:** Error events create spans with name "Error", but they need to be properly linked to their parent spans.

**Fix Required:** Ensure error events create spans and are linked correctly. The recent fixes for orphan spans should help, but we need to verify error spans are created when `parent_span_id` points to an existing span.

### 3. ⚠️ Attempted Tool Calls Extraction

**Status:** Code exists to extract attempted tool calls from `output_messages` (lines 3386-3420), but we need to verify:
- The extraction is working correctly
- The data is being passed through the adapter
- The frontend is displaying it

**Location:** 
- Backend: `src/services/traceQueryService.ts:3386-3420`
- Frontend: `observa-app/components/agent-prism/DetailsView/DetailsViewInputOutputTab.tsx:80-82, 169-172`

**Verification Needed:** Check if `attempted_tool_calls` is being populated from the first LLM call's `output_messages.additional_kwargs.function_call`.

### 4. ⚠️ Tool Call Error Status Display

**Status:** Tool calls with `result_status: "error"` should show error status in the tree view.

**Location:** 
- Backend: `src/services/traceQueryService.ts:3485-3490` (status detection)
- Frontend: `observa-app/components/agent-prism/SpanStatus.tsx` (status display)

**Verification Needed:** Ensure tool spans with errors show red error indicators.

## Required Fixes

### Backend Fixes (`observa-api`)

1. **Convert Signal Events to Error Format** (`src/services/traceQueryService.ts:2100`)
   - Add handling for `attributes.signal` in addition to `attributes.error`
   - Convert signal metadata to error format

2. **Ensure Error Spans Are Created** (`src/services/traceQueryService.ts:1725-1726`)
   - Verify error events with `parent_span_id` create separate spans
   - Ensure they're linked to parent spans correctly

3. **Verify Attempted Tool Calls Extraction** (`src/services/traceQueryService.ts:3386-3420`)
   - Test that `function_call` from `output_messages.additional_kwargs` is extracted
   - Ensure `attempted_tool_calls` is populated on LLM spans

### Frontend Fixes (`observa-app`)

1. **Verify Attempted Tool Calls Display** (`components/agent-prism/DetailsView/DetailsViewInputOutputTab.tsx`)
   - Confirm the "Attempted Tool Calls" section is visible when data exists
   - Test that it displays tool names and arguments correctly

2. **Verify Error Span Display** (`components/agent-prism/SpanCard/SpanCard.tsx`)
   - Ensure error spans appear in the tree
   - Verify error status indicators (red dots) are shown

3. **Verify Tool Call Error Status** (`components/agent-prism/SpanStatus.tsx`)
   - Ensure tool spans with `result_status: "error"` show error status

## Testing Checklist

- [ ] Signal events are converted to error spans
- [ ] Error spans appear in the tree view
- [ ] Error spans are linked to their parent spans correctly
- [ ] Attempted tool calls are extracted from LLM output_messages
- [ ] Attempted tool calls are displayed in the LLM span details
- [ ] Tool call errors show error status indicators
- [ ] Tool call error messages are visible in tool span details

## Data Flow Verification

1. **Tinybird → Backend:**
   - Signal event with `attributes.signal` → Should be converted to `span.error`
   - LLM call with `output_messages` containing `function_call` → Should populate `span.attempted_tool_calls`

2. **Backend → Frontend:**
   - `span.error` → Should create error span or attach error info
   - `span.attempted_tool_calls` → Should display in "Attempted Tool Calls" section

3. **Frontend Display:**
   - Error spans → Should appear in tree with error status
   - Attempted tool calls → Should appear in LLM span details panel

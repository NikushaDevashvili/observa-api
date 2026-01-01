# Comprehensive QA Analysis - Simulation Script & Trace System

**Date:** January 2026  
**Scope:** Complete technical and customer experience audit of trace generation, API processing, and frontend display

## Executive Summary

After comprehensive analysis of the simulation script, trace query service, and API responses, I've identified **critical data flow issues** that prevent proper display of user queries and outputs in the frontend. The root causes are in both the simulation script data generation and the trace query service's summary aggregation.

## 🔴 Critical Issues

### 1. **Missing User Query in Trace Summary** - CRITICAL

**Problem:** The trace summary object doesn't include the user's query/question, making it impossible for the frontend to display what the user asked.

**Root Cause:**

- `TraceQueryService.aggregateEventsToTrace()` (line 1240-1311) aggregates LLM call events but **doesn't extract the `input` field**
- The summary includes `model`, `latency_ms`, `tokens_total`, etc., but **no `query` field**
- Frontend expects `summary.query` to display the user's question

**Location:** `src/services/traceQueryService.ts:1240-1311`

**Code Issue:**

```typescript
llmEvents.forEach((event: any) => {
  const attrs = event.attributes?.llm_call || {};
  // ❌ Missing: attrs.input is never extracted
  if (attrs.model && !model) {
    model = attrs.model;
  }
  // ... tokens and latency aggregation
});
```

**Impact:**

- Frontend cannot display "User Question" section
- Users cannot see what query was sent
- Critical information missing from trace view

**Fix Required:**

```typescript
let query: string | null = null;
llmEvents.forEach((event: any) => {
  const attrs = event.attributes?.llm_call || {};
  if (attrs.input && !query) {
    query = attrs.input; // Extract first LLM call input as the user query
  }
  // ... rest
});
// Add to return object:
return {
  // ... existing fields
  query: query, // ✅ Add this
};
```

### 2. **Output Events Not Properly Linked to Summary** - HIGH

**Problem:** Output events are generated correctly, but the summary doesn't include the final output/response, making it hard for the frontend to display.

**Root Cause:**

- `aggregateEventsToTrace()` only processes `llm_call` events
- Output events (`event_type === "output"`) are **never processed** for the summary
- Summary should include `response` or `output` field from output events

**Location:** `src/services/traceQueryService.ts:1240-1311`

**Missing Code:**

```typescript
// Find output events
const outputEvents = events.filter((e: any) => e.event_type === "output");
let response: string | null = null;
if (outputEvents.length > 0) {
  // Get final output (prefer last one, or from final_output attribute)
  const lastOutput = outputEvents[outputEvents.length - 1];
  response = lastOutput.attributes?.output?.final_output || null;
}
```

**Impact:**

- Frontend cannot reliably show the final response
- Users see spans but not the actual output text
- Inconsistent display of response data

### 3. **Summary Missing Response Field in buildTreeFromCanonicalEvents** - HIGH

**Problem:** In `buildTreeFromCanonicalEvents()`, the summary object (line 1036-1059) doesn't include `query` or `response` fields.

**Location:** `src/services/traceQueryService.ts:1036-1059`

**Current Summary:**

```typescript
const summary = {
  trace_id: traceId,
  // ... metadata fields
  model: llmAttrs?.model || null,
  // ❌ Missing: query, response
};
```

**Should Include:**

```typescript
const summary = {
  // ... existing fields
  query: llmAttrs?.input || null, // ✅ User query from first LLM call
  response:
    outputEvent?.attributes?.output?.final_output || llmAttrs?.output || null, // ✅ Final response
};
```

## 🟡 Medium Priority Issues

### 4. **Multiple LLM Calls - Only First Input Used** - MEDIUM

**Problem:** When there are multiple LLM calls (agentic workflows), only the first LLM call's input should be the "user query". Subsequent LLM calls are intermediate steps.

**Current Behavior:** Not handled - would extract the last LLM call's input if we implemented query extraction.

**Fix:** Extract input from the **first** LLM call event (index 0), not the last.

### 5. **Cost Not Aggregated in Summary** - MEDIUM

**Problem:** `total_cost` is set to `null` in summary (line 1057), even though LLM call events include cost.

**Location:** `src/services/traceQueryService.ts:1057`

**Fix:**

```typescript
let totalCost = 0;
llmEvents.forEach((event: any) => {
  const attrs = event.attributes?.llm_call || {};
  if (attrs.cost) {
    totalCost += attrs.cost;
  }
});
// In summary:
total_cost: totalCost > 0 ? totalCost : null,
```

### 6. **Finish Reason Not in Summary** - MEDIUM

**Problem:** Summary doesn't include `finish_reason` from LLM calls, which is useful information for users.

**Fix:** Extract finish_reason from the last LLM call event.

### 7. **Output Events May Have Wrong Span ID** - MEDIUM

**Problem:** Output events use `rootSpanId` as `span_id`, but they might need to be associated with the final LLM call span for proper hierarchy.

**Location:** `scripts/load-simulation-events.js:1041-1070`

**Current:**

```javascript
events.push({
  ...createBaseEventMetadata(traceId, rootSpanId, null, outputTime, ...),
  event_type: "output",
  // Uses rootSpanId
});
```

**Consideration:** This might be correct if output is at root level, but verify the frontend expects this structure.

## 🔵 Low Priority / Enhancement Opportunities

### 8. **Retrieval Context in Summary** - LOW

**Enhancement:** Could aggregate retrieval context IDs or count for summary display.

### 9. **Tool Call Count in Summary** - LOW

**Enhancement:** Summary could include count of tool calls for quick overview.

### 10. **Span Hierarchy - Output as Separate Node** - LOW

**Observation:** Output events create separate spans (good for clicking), but ensure they're properly nested under the trace root.

## 📊 Data Flow Analysis

### Current Flow:

```
Simulation Script
  ↓
Generates events with:
  - LLM call: attributes.llm_call.input = "user query" ✅
  - Output event: attributes.output.final_output = "response" ✅
  ↓
API /events/ingest
  ↓
Stored in Tinybird
  ↓
TraceQueryService.buildTreeFromCanonicalEvents()
  ↓
Summary aggregation (aggregateEventsToTrace)
  ❌ Doesn't extract input → query
  ❌ Doesn't extract output → response
  ↓
Frontend receives summary without query/response
  ❌ Can't display user question
  ❌ Can't display final output
```

### Expected Flow:

```
Events stored correctly ✅
  ↓
Summary should extract:
  - query from first LLM call input ✅
  - response from output event or last LLM call output ✅
  ↓
Frontend receives complete summary
  ✅ Can display user question
  ✅ Can display final output
```

## 🧪 Testing Checklist

- [ ] Summary includes `query` field from first LLM call input
- [ ] Summary includes `response` field from output event
- [ ] Summary includes `total_cost` aggregated from LLM calls
- [ ] Summary includes `finish_reason` from last LLM call
- [ ] Multiple LLM calls: query comes from first, not last
- [ ] Output events properly linked to spans
- [ ] Frontend can display user query in summary section
- [ ] Frontend can display final response in summary section
- [ ] Cost displays correctly in summary
- [ ] Finish reason displays correctly

## 🎯 Recommended Fix Priority

1. **URGENT:** Fix summary to include `query` field (Issue #1)
2. **URGENT:** Fix summary to include `response` field (Issue #2)
3. **HIGH:** Fix summary in `buildTreeFromCanonicalEvents` (Issue #3)
4. **MEDIUM:** Aggregate cost in summary (Issue #5)
5. **MEDIUM:** Add finish_reason to summary (Issue #6)
6. **LOW:** Multiple LLM calls handling (Issue #4)

## 📝 Code Locations to Fix

### File: `src/services/traceQueryService.ts`

1. **Line 1240-1311:** `aggregateEventsToTrace()` method

   - Add query extraction from first LLM call input
   - Add response extraction from output events
   - Add cost aggregation
   - Add finish_reason from last LLM call

2. **Line 1036-1059:** Summary object in `buildTreeFromCanonicalEvents()`
   - Add `query` field from `llmAttrs?.input`
   - Add `response` field from `outputEvent?.attributes?.output?.final_output`

## ✅ What's Working Well

1. **Event Generation:** Simulation script correctly generates all event types with proper attributes
2. **Span Building:** Spans are properly constructed with correct hierarchy
3. **LLM Call Data:** All LLM call attributes (tokens, latency, etc.) are correctly extracted and flattened to span level
4. **Tool Calls:** Tool call data is properly extracted and available in spans
5. **Retrieval Events:** Retrieval data is properly extracted
6. **Event Storage:** Events are correctly stored in Tinybird
7. **Tree Structure:** Spans are correctly organized in tree structure

## 🎨 Customer Experience Impact

**Before Fixes:**

- ❌ User opens trace detail page
- ❌ Sees spans and metadata
- ❌ **Cannot see what question they asked**
- ❌ **Cannot see the final response in summary**
- ❌ Must click into spans to find information
- ⚠️ Poor user experience

**After Fixes:**

- ✅ User opens trace detail page
- ✅ Sees summary with **user query clearly displayed**
- ✅ Sees summary with **final response clearly displayed**
- ✅ Can see cost, finish reason, and all metadata
- ✅ Spans provide additional detail on click
- ✅ Excellent user experience

## 🔧 Implementation Notes

When implementing fixes:

1. **Query Extraction:** Use the **first** LLM call's `input` field as the user query
2. **Response Extraction:** Prefer output event's `final_output`, fallback to last LLM call's `output`
3. **Cost Aggregation:** Sum all LLM call costs (handle nulls gracefully)
4. **Backward Compatibility:** Ensure existing traces without these fields still work (use null defaults)
5. **Testing:** Test with:
   - Single LLM call traces
   - Multiple LLM call traces (agentic workflows)
   - Traces with output events
   - Traces without output events (fallback to LLM output)

# Retrieval Span Data Display Fix

**Date:** January 2026  
**Issue:** Retrieval spans showed "No input or output data available" when clicked in trace detail page.

## Problem Analysis

When clicking on a "Retrieval" span in the trace detail page:

- ✅ Span was clickable (previous fix worked)
- ❌ Details panel showed "No input or output data available for this span"
- ❌ No retrieval context, IDs, similarity scores, or metadata displayed

**Root Cause:**

1. `agentPrismAdapter.ts` only handled `input`/`output` for LLM calls, tool calls, and output events
2. Retrieval spans were completely skipped in the input/output population logic
3. Retrieval data existed in `span.retrieval` object but wasn't formatted for frontend display

## Fixes Applied

### 1. Added Retrieval Input/Output in `agentPrismAdapter.ts` (Lines 621-682)

**Problem:** Retrieval spans had no `input` or `output` fields set, causing frontend to show "No data available".

**Solution:** Added retrieval handling:

- **Input**: Formatted query metadata (k, top_k) as JSON
- **Output**:
  - If `retrieval_context` exists → Show actual context text
  - Otherwise → Show formatted summary with:
    - Retrieved document IDs
    - Similarity scores (avg, max, min)
    - Document count
    - Latency

```typescript
else if (span.retrieval) {
  // Input: Query/metadata
  const retrievalInput = { k: ..., top_k: ... };
  input = JSON.stringify(retrievalInput, null, 2);

  // Output: Context or formatted summary
  if (span.retrieval.retrieval_context) {
    output = span.retrieval.retrieval_context;
  } else {
    output = JSON.stringify({
      retrieved_documents: [...],
      similarity_scores: [...],
      avg_similarity: ...,
      // ...
    }, null, 2);
  }
}
```

### 2. Added Retrieval Input/Output in `traceQueryService.ts` (Lines 1584-1650)

**Problem:** Retrieval spans didn't have top-level `input`/`output` fields, only nested `retrieval` object.

**Solution:** Flatten retrieval data to top-level fields:

- Populate `span.input` with query metadata
- Populate `span.output` with context or formatted summary
- Set `span.hasInput` and `span.hasOutput` flags
- Ensure data is available in both nested and flattened formats

## Data Flow

### Retrieval Event → Span → Frontend

1. **Event Ingestion**: Retrieval event arrives with:

   ```json
   {
     "event_type": "retrieval",
     "attributes": {
       "retrieval": {
         "retrieval_context_ids": ["doc-123", "doc-456"],
         "similarity_scores": [0.95, 0.87],
         "k": 3,
         "latency_ms": 126
       }
     }
   }
   ```

2. **Span Building**: `traceQueryService.ts` extracts data:

   ```typescript
   span.retrieval = {
     retrieval_context_ids: [...],
     similarity_scores: [...],
     k: 3,
     latency_ms: 126
   }
   ```

3. **Input/Output Population**: Now also sets:

   ```typescript
   span.input = '{"k": 3, "top_k": 3}';
   span.output = JSON.stringify({
     retrieved_documents: ["doc-123", "doc-456"],
     document_count: 2,
     similarity_scores: [0.95, 0.87],
     avg_similarity: 0.91,
     max_similarity: 0.95,
     min_similarity: 0.87,
     latency_ms: 126,
   });
   ```

4. **Frontend Display**: Shows formatted data in In/Out tab

## What's Now Displayed

### Input Tab (Retrieval Query/Metadata)

- `k`: Number of documents to retrieve
- `top_k`: Alternative field name for k

### Output Tab (Retrieval Results)

**If context available:**

- Full retrieval context text

**If context not available (hashes only):**

- Retrieved document IDs
- Document count
- Similarity scores (array)
- Average similarity score
- Maximum similarity score
- Minimum similarity score
- Latency in milliseconds

## Limitations

### Data Privacy/Security

- Retrieval events may only include `retrieval_context_hashes` (not actual text) for privacy
- In this case, we show metadata summary instead of actual content
- This is by design - actual context may be redacted/hashed in production

### Missing Optional Fields

The following fields from retrieval events are tracked but may not always be present:

- `retrieval_context`: Actual context text (may be null/hashed)
- `retrieval_context_ids`: Document IDs (optional)
- `similarity_scores`: Similarity scores (optional)
- `k`/`top_k`: Number of results (optional)

If none of these are available, we show a minimal summary with:

- Type: "retrieval"
- Latency
- k/top_k value (if available)

## Testing Recommendations

1. **Test with retrieval context**:

   ```bash
   # Generate trace with retrieval event that includes context
   # Verify output shows actual context text
   ```

2. **Test without retrieval context** (hashes only):

   ```bash
   # Generate trace with retrieval event that only has hashes
   # Verify output shows formatted summary with IDs/scores
   ```

3. **Test with minimal data**:

   ```bash
   # Generate trace with retrieval event that only has latency
   # Verify output shows basic metadata (latency, type)
   ```

4. **Frontend verification**:
   - Navigate to trace detail page
   - Click on "Retrieval" span
   - Verify In/Out tab shows data (not "No data available")
   - Check that context or summary is displayed correctly

## Files Modified

- `src/services/agentPrismAdapter.ts`
  - Added retrieval input/output handling (lines 621-682)
- `src/services/traceQueryService.ts`
  - Added retrieval input/output population at top level (lines 1584-1650)

## Related Issues

- Related to: `FRONTEND_CHILD_SPAN_FIX.md` (child spans now clickable)
- Related to: `QA_TRACE_PAGE_REPORT.md` (original QA report)

## Next Steps

1. ✅ Deploy fixes
2. Test with real retrieval traces
3. Verify frontend displays retrieval data correctly
4. Consider adding support for:
   - Retrieval query/input (if available in events)
   - Embedding vectors (if available)
   - Filters/metadata used for retrieval
   - Retrieval source/database name

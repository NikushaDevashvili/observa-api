# Frontend Child Span Click Fix

**Date:** January 2026  
**Issue:** Child spans in trace detail page were not clickable - clicking on Retrieval, Tool Call, or LLM Call spans didn't update the Node Details panel.

## Problem Analysis

The QA report identified that:

1. Backend was returning correct data structure with `allSpans` and `spansById`
2. Tree structure was built correctly with parent-child relationships
3. Child spans were visible when tree was expanded
4. **BUT**: Click handlers failed to find child spans when clicked

**Root Cause:** Child spans created from root events had synthetic IDs (e.g., `${trace_id}-retrieval`), but the `spansById` lookup map wasn't indexing them with enough variations for frontends to find them. Additionally, some edge cases in parent lookup and ID consistency could cause spans to not be found.

## Fixes Applied

### 1. Enhanced `spansById` Indexing (Line 1926-1973)

**Problem:** Indexing wasn't comprehensive enough - only indexed by basic ID patterns, which could miss child spans when frontend used different lookup strategies.

**Solution:** Added multiple indexing patterns:

- Primary ID indexing (existing)
- Parent-event_type combination indexing for child spans (e.g., `parentId-retrieval`)
- Synthetic child span ID pattern detection and indexing
- Parent-child position-based indexing (e.g., `parentId-child-0`)
- Enhanced compound key indexing

```typescript
// Now indexes by multiple patterns:
spansById[span.id] = span; // Primary ID
spansById[`${span.parent_span_id}-${span.event_type}`] = span; // Parent-event pattern
spansById[`${span.parent_span_id}-child-${childIndex}`] = span; // Position-based
// ... and more patterns
```

### 2. Improved Parent Span Lookup (Line 1725-1785)

**Problem:** When building tree structure, parent spans might not be found if IDs didn't match exactly.

**Solution:** Added fallback lookup logic:

- Try direct ID lookup
- Try by `original_span_id`
- Try by matching any span's `id` or `span_id` field
- Added warning logs when parent not found for debugging

### 3. Consistent ID Enforcement (Line 1873-1897)

**Problem:** Child spans in tree structure might have inconsistent IDs compared to `allSpans`/`spansById`.

**Solution:**

- Ensure all spans have consistent `id` and `span_id` fields before tree building
- Reconstruct synthetic IDs for child spans if they don't follow the expected pattern
- Add `key` field for React compatibility
- Add explicit reference fields: `_id`, `_spanId`, `_parentId`

### 4. Enhanced Span Metadata (Line 1873-1897)

**Problem:** Frontend might need additional metadata to identify and handle child spans correctly.

**Solution:** Added:

- `isChild` boolean flag to explicitly mark child spans
- `_id`, `_spanId`, `_parentId` alternative reference fields
- Improved `details` object population for all span types (including feedback)
- Enhanced `hasDetails` detection

## Technical Details

### Child Span ID Pattern

Child spans created from root events follow this pattern:

- **Synthetic ID**: `${original_span_id}-${event_type}`
  - Example: `trace-123-retrieval`, `trace-123-llm_call`
- **Parent ID**: Original `span_id` from the event
- **Event Type**: Type of event (retrieval, llm_call, tool_call, output, feedback)

### Lookup Strategies Supported

Frontends can now find child spans using any of these patterns:

1. **Direct ID**: `spansById['trace-123-retrieval']`
2. **Parent-event pattern**: `spansById['trace-123-retrieval']`
3. **Event type**: `spansById['retrieval']` (last one wins for root spans)
4. **Name-based**: `spansById['Retrieval']`
5. **Position-based**: `spansById['trace-123-child-0']`
6. **Original span ID**: `spansById['trace-123']` (for parent)

## Testing Recommendations

1. **Test trace detail endpoint** with `format=tree`:

   ```bash
   curl "https://observa-api.vercel.app/api/v1/traces/<TRACE_ID>?format=tree" \
     -H "Authorization: Bearer <SESSION_TOKEN>" \
     | jq '.trace.spansById | keys | length'
   ```

   Should show all span IDs indexed.

2. **Verify child spans are indexed**:

   ```bash
   jq '.trace.spansById | to_entries | map(select(.key | contains("-retrieval") or contains("-llm_call") or contains("-tool_call"))) | length'
   ```

   Should show child spans are indexed with synthetic IDs.

3. **Check tree structure**:

   ```bash
   jq '.trace.spans[0].children | map(.id)'
   ```

   Should show child span IDs match what's in `spansById`.

4. **Frontend testing**:
   - Navigate to trace detail page
   - Expand tree to show child spans
   - Click on each child span (Retrieval, Tool Call, LLM Call)
   - Verify Node Details panel updates correctly
   - Verify no errors in browser console

## Expected Behavior After Fix

✅ **Child spans are clickable** - Clicking on any child span (Retrieval, Tool, LLM Call) updates the Node Details panel  
✅ **Span lookup works** - Frontend can find spans using multiple ID patterns  
✅ **Tree structure consistent** - Child spans in tree match `allSpans`/`spansById`  
✅ **No console errors** - All span lookups succeed without errors

## Files Modified

- `src/services/traceQueryService.ts`
  - Enhanced `spansById` indexing (lines 1926-1973)
  - Improved parent lookup logic (lines 1725-1785)
  - Added ID consistency enforcement (lines 1873-1897)

## Next Steps

1. Deploy to production
2. Test with real trace data
3. Verify frontend can now click child spans
4. Monitor for any remaining issues

## Related Documentation

- `QA_TRACE_PAGE_REPORT.md` - Original issue report
- `TRACE_DATA_REFERENCE.md` - Trace data structure documentation

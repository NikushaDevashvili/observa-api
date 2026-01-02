# Debugging Quarantined Events in Tinybird

## Issue

178 events are quarantined with "Strict type checking failed" errors.

## How to Debug

### Step 1: Check Full Error Details

1. Go to Tinybird dashboard → `canonical_events_quarantine`
2. Click on one of the quarantined rows to see the **full error message**
3. The error will tell you exactly which field and what the type mismatch is

### Step 2: Compare with Working Events

Looking at the successfully ingested events (2k rows), they have:
- `event_type` values: "trace_start", "retrieval", "call", "llm_call", "output", "trace_end"
- All fields present: attributes_json, conversation_id, environment, event_type, parent_span_id, project_id

### Step 3: Check Tinybird Schema

1. In Tinybird dashboard, go to `canonical_events` datasource
2. Click on **"Schema"** tab
3. Note:
   - Which fields are **required** (not Nullable)
   - Field types (String, Nullable(String), DateTime, etc.)
   - Allowed enum values for `event_type`

### Common Issues

1. **Nullable fields**: 
   - Tinybird might require fields to be omitted (not present) instead of `null`
   - Or vice versa - fields marked as `Nullable(String)` might need `null`, not omitted

2. **event_type enum values**:
   - Our code sends: "tool_call"
   - Working data shows: "call" (might be a different source)
   - Check what enum values are actually allowed

3. **Timestamp format**:
   - Tinybird expects DateTime format
   - We're sending ISO 8601 strings (should work, but verify)

4. **attributes_json**:
   - Must be a valid JSON string
   - No extra whitespace or invalid JSON

### Step 4: Fix Based on Error

Once you see the full error message, it will tell you:
- Which field is failing
- What type was expected
- What type was received

Then we can fix the code to match.

## Quick Check: Sample Event Format

Our code sends events like this:
```json
{
  "tenant_id": "uuid",
  "project_id": "uuid",
  "environment": "prod",
  "trace_id": "uuid",
  "span_id": "uuid",
  "parent_span_id": null,
  "timestamp": "2026-01-02T01:13:41.000Z",
  "event_type": "tool_call",
  "conversation_id": null,
  "session_id": null,
  "user_id": null,
  "agent_name": null,
  "version": null,
  "route": null,
  "attributes_json": "{\"tool_call\": {...}}"
}
```

## Next Steps

1. **Click a quarantined row** in Tinybird to see the exact error
2. **Share the error message** - it will tell us exactly what to fix
3. **Check the Schema tab** in Tinybird to see field types
4. We'll fix the code based on the actual schema requirements



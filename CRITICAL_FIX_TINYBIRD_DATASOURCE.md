# CRITICAL FIX: Tinybird Datasource Missing

## Problem
Events are being sent to the API successfully (200 responses), but **nothing is being stored in Tinybird** because the `canonical_events` datasource doesn't exist.

## Root Cause
The `canonical_events` datasource needs to be created in Tinybird before events can be ingested.

## Solution

### Option 1: Create via Tinybird UI (Recommended)
1. Go to your Tinybird dashboard
2. Navigate to Data Sources
3. Click "Create Data Source"
4. Name it: `canonical_events`
5. Use this schema:

```sql
CREATE TABLE canonical_events
(
    tenant_id String,
    project_id String,
    environment String,
    trace_id String,
    span_id String,
    parent_span_id Nullable(String),
    timestamp DateTime64(3),
    event_type String,
    conversation_id String,
    session_id String,
    user_id String,
    attributes_json String
)
ENGINE = MergeTree()
ORDER BY (tenant_id, project_id, trace_id, timestamp)
PARTITION BY toYYYYMM(timestamp);
```

### Option 2: Use Existing Datasource
If you have an existing datasource, update the code to use it:

1. Find your datasource name in Tinybird
2. Update `src/services/canonicalEventService.ts` line 25:
   ```typescript
   "canonical_events" // Change to your actual datasource name
   ```

### Option 3: Make Datasource Name Configurable
Add an environment variable:

1. Add to `src/config/env.ts`:
   ```typescript
   TINYBIRD_CANONICAL_EVENTS_DATASOURCE: z.string().default("canonical_events"),
   ```

2. Update `src/services/canonicalEventService.ts`:
   ```typescript
   const url = `${env.TINYBIRD_HOST}/v0/events?name=${encodeURIComponent(
     env.TINYBIRD_CANONICAL_EVENTS_DATASOURCE
   )}&format=ndjson`;
   ```

## Verification

After creating the datasource, test with:
```bash
node scripts/test-tinybird-ingestion.js
```

This will:
1. Check if the datasource exists
2. Try to ingest a test event
3. Verify the event was stored

## Current Status

- ✅ Error handling improved in `canonicalEventService.ts`
- ✅ Better logging added to track Tinybird responses
- ✅ Request will now fail if Tinybird ingestion fails (instead of silently succeeding)
- ❌ Datasource `canonical_events` does not exist in Tinybird

## Next Steps

1. **Create the datasource** using one of the options above
2. **Test ingestion** with the test script
3. **Re-run the load simulation** to send test data
4. **Verify events appear** in Tinybird dashboard

## Files Changed

1. `src/routes/events.ts` - Added explicit error handling for Tinybird forwarding
2. `src/services/canonicalEventService.ts` - Improved error detection and logging
3. `scripts/test-tinybird-ingestion.js` - Diagnostic script to test ingestion
4. `scripts/create-canonical-events-datasource.js` - Attempt to create datasource (needs manual creation)


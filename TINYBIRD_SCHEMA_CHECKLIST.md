# Tinybird Schema Checklist

## To Fix Quarantine Issues

Please check the Tinybird datasource schema and share:

### 1. Schema Fields

In Tinybird dashboard → `canonical_events` → Schema tab, check:

- **tenant_id**: Type? (String / Nullable(String))
- **project_id**: Type? (String / Nullable(String))
- **environment**: Type? (String / Nullable(String))
- **trace_id**: Type? (String / Nullable(String))
- **span_id**: Type? (String / Nullable(String))
- **parent_span_id**: Type? (String / Nullable(String))
- **timestamp**: Type? (DateTime / String / Nullable(DateTime))
- **event_type**: Type? (String / Enum values?)
- **conversation_id**: Type? (String / Nullable(String))
- **session_id**: Type? (String / Nullable(String))
- **user_id**: Type? (String / Nullable(String))
- **agent_name**: Type? (String / Nullable(String))
- **version**: Type? (String / Nullable(String))
- **route**: Type? (String / Nullable(String))
- **attributes_json**: Type? (String / Nullable(String))

### 2. event_type Enum Values

What are the allowed values for `event_type`?
- Is it "tool_call" or "call"?
- What are all allowed values?

### 3. Nullable Fields

For fields marked as `Nullable(Type)`:
- Should null values be sent as `null` JSON value?
- Or should they be omitted from the JSON object?

### 4. Required Fields

Which fields are **required** (not Nullable)?
- These must always be present

### 5. Timestamp Format

What format does Tinybird expect for `timestamp`?
- ISO 8601 string: "2026-01-02T01:13:41.000Z"
- Or different format?

## What We're Currently Sending

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

Once you share the schema details, I'll fix the code to match exactly what Tinybird expects.



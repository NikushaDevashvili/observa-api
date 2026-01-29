# Ideal Trace Tree View Spec

**Based on:** `canonical_events_pipe_3458_0` CSV  
**Trace ID:** `baf12b45-6531-4386-976e-a3854c5102a4`  
**Goal:** Best CX for devs to see the full workflow and **where the problem resides** in &lt;5 seconds.

**Frontend:** Use the **existing tree view in observa-app** (the one you already display). The API now returns `treeView`, `summary.attempt_count`, `summary.failure_count`, and spans with `signals` / synthetic error children. Update the existing observa-app tree view component to consume these fields for problem-first display (see §4 and §6 for payload shape).

---

## 1. Workflow Summary (from CSV)

| Event       | span_id     | parent_span_id | Timestamp    | Notes                                                         |
| ----------- | ----------- | -------------- | ------------ | ------------------------------------------------------------- |
| trace_start | 0c985882... | null           | 20:57:05.487 | Attempt 1                                                     |
| llm_call    | 0c985882... | null           | 20:57:05.487 | status=error, 3870ms, function call → search_latest_knowledge |
| tool_call   | 8f98fbc8... | 476aa276...    | 20:57:05.491 | **ERROR**: `retriever.getRelevantDocuments is not a function` |
| trace_end   | 0c985882... | null           | 20:57:06.012 | outcome=success                                               |
| error       | 0c985882... | null           | 20:57:05.487 | signal: **medium_latency** (3870ms &gt; 2000ms)               |
| error       | 8f98fbc8... | null           | 20:57:05.491 | signal: **tool_error** (search_latest_knowledge)              |
| trace_start | afd8ac2f... | null           | 20:57:07.021 | Attempt 2 (retry)                                             |
| llm_call    | afd8ac2f... | null           | 20:57:07.021 | status=success, 1525ms, no tool call                          |
| trace_end   | afd8ac2f... | null           | 20:57:16.013 | outcome=success                                               |

**Key insight:** One trace, two logical “attempts” (roots `0c985882` and `afd8ac2f`). Attempt 1 fails on the tool; Attempt 2 retries without the tool and succeeds.

---

## 2. Ideal Tree View (Dev-Optimized)

```
Trace baf12b45-6531-4386-976e-a3854c5102a4
├─ ⏱  ~10.5s  │  2 attempts  │  1 failure  │  prod
│
├── Attempt 1 — Failed  [0c985882]  20:57:05.487 → 20:57:06.012
│   ├── Trace Start
│   ├── LLM Call: gpt-3.5-turbo-1106  [⚠️ 3.87s] [medium_latency] [status: error]
│   │   └── Tool: search_latest_knowledge  [❌ ERROR]  ← ROOT CAUSE
│   │       └── Error: tool_error — "retriever.getRelevantDocuments is not a function"
│   └── Trace End (outcome: success)
│
└── Attempt 2 — Success  [afd8ac2f]  20:57:07.021 → 20:57:16.013
    ├── Trace Start
    ├── LLM Call: gpt-3.5-turbo-1106  [✓ 1.5s] [success]
    └── Trace End (outcome: success)
```

---

## 3. CX Principles Applied

### 3.1 Problem-first (Miller’s Law)

- **Level 1:** Trace header shows “1 failure” and which attempt failed.
- **Level 2:** “Attempt 1 — Failed” is visually prominent (e.g. red/warning).
- **Level 3:** Tool span has clear **ERROR** badge and the exact error message inline or one click away.

**Outcome:** Dev sees “something failed in Attempt 1” → expands → sees “Tool: search_latest_knowledge” + error message. Root cause in seconds.

### 3.2 Visual hierarchy

| Element            | Treatment                                                          |
| ------------------ | ------------------------------------------------------------------ |
| Root trace         | Neutral; summary badges (duration, attempt count, failure count).  |
| Attempt 1          | **Warning/error** (red or orange) — “Failed”.                      |
| Attempt 2          | **Success** (green) — “Success”.                                   |
| Failing tool span  | **Strong error** (red), optional “ROOT CAUSE” or “Fix here” label. |
| Error (tool_error) | Child of tool span; same severity, concise message.                |
| medium_latency     | Shown on LLM span (e.g. “⚠️ 3.87s” + “medium_latency” badge).      |

### 3.3 Progressive disclosure

- **Collapsed:** Trace → Attempt 1 (Failed) / Attempt 2 (Success). Duration and failure summary visible.
- **Expand Attempt 1:** Trace Start, LLM Call, Tool (ERROR), Trace End.
- **Expand Tool:** Full `tool_call` payload, error message, stack if present.
- **Expand Error child:** Full `attributes_json` for the `tool_error` signal.

### 3.4 Actionable grouping

- **Group by:** Logical “attempt” (root span_id), then span type.
- **Show:** Duration, status, severity, error message.
- **Suggest (optional):** “Fix: ensure retriever implements `getRelevantDocuments`” or link to docs.

---

## 4. What to Show at Each Level

### 4.1 Trace root

- `trace_id`, `environment`, optional `conversation_id` / `session_id`.
- **Summary:** total duration, number of attempts, number of failures.
- **Badges:** e.g. `prod`, `1 failure`, `2 attempts`.

### 4.2 Attempt (sub-trace) roots

- **Attempt 1:** “Attempt 1 — Failed”, `span_id` (e.g. `0c985882`), time range.
- **Attempt 2:** “Attempt 2 — Success”, `span_id` (e.g. `afd8ac2f`), time range.

### 4.3 Spans

| Type           | Default label                        | Extra                                       |
| -------------- | ------------------------------------ | ------------------------------------------- |
| trace_start    | Trace Start                          | —                                           |
| trace_end      | Trace End                            | outcome                                     |
| llm_call       | LLM Call: `{model}`                  | latency, status, tokens/cost if available   |
| tool_call      | Tool: `{tool_name}`                  | status, latency, **error_message** if error |
| error (signal) | Error: `{signal_type}` — `{message}` | severity, metadata                          |

### 4.4 Signals

- **medium_latency:** Attach to the LLM span it refers to (same `span_id`). Show as badge/latency highlight.
- **tool_error:** Attach to the tool span it refers to (same `span_id`). Show as child “Error” span or inline badge with message.

---

## 5. Parent–child Rules (for this dataset)

1. **Tool under LLM:**  
   `tool_call` (span `8f98fbc8`) has `parent_span_id` `476aa276`. That ID is not a `span_id` in the CSV (likely an internal run ID).  
   **Rule:** When `parent_span_id` is missing from span set, attach the tool to the **LLM span that emitted the function call** (same trace, immediate predecessor by time, and `llm_call` with `search_latest_knowledge`).  
   → Tool appears as **child of** “LLM Call: gpt-3.5-turbo-1106” in Attempt 1.

2. **tool_error under tool:**  
   `error` event (signal `tool_error`) has `span_id` `8f98fbc8` = tool span.  
   **Rule:** Attach error signals to the span with matching `span_id`.  
   → “Error: tool_error — retriever.getRelevantDocuments is not a function” as **child of** “Tool: search_latest_knowledge”.

3. **medium_latency on LLM:**  
   `error` (medium_latency) has `span_id` `0c985882` = root/LLM.  
   **Rule:** Attach to the corresponding LLM span; display as badge/metadata, not necessarily a separate tree node.

4. **Attempt grouping:**  
   Two roots: `0c985882` (attempt 1), `afd8ac2f` (attempt 2).  
   **Rule:** Group spans by root `span_id` into “Attempt 1” and “Attempt 2” sub-trees under the single trace.

---

## 6. Example JSON-like structure (for frontend)

```json
{
  "id": "baf12b45-6531-4386-976e-a3854c5102a4",
  "name": "Trace baf12b45...",
  "duration_ms": 10526,
  "summary": { "attempts": 2, "failures": 1, "environment": "prod" },
  "children": [
    {
      "id": "attempt-1-0c985882",
      "name": "Attempt 1 — Failed",
      "status": "failed",
      "span_id": "0c985882-d633-4f17-b40c-d14b4e76e161",
      "start_time": "2026-01-27T20:57:05.487Z",
      "end_time": "2026-01-27T20:57:06.012Z",
      "children": [
        { "type": "trace_start", "name": "Trace Start" },
        {
          "type": "llm_call",
          "name": "LLM Call: gpt-3.5-turbo-1106",
          "latency_ms": 3870,
          "status": "error",
          "signals": ["medium_latency"],
          "children": [
            {
              "type": "tool_call",
              "name": "Tool: search_latest_knowledge",
              "status": "error",
              "error_message": "retriever.getRelevantDocuments is not a function",
              "children": [
                {
                  "type": "error",
                  "signal": "tool_error",
                  "message": "retriever.getRelevantDocuments is not a function"
                }
              ]
            }
          ]
        },
        { "type": "trace_end", "name": "Trace End", "outcome": "success" }
      ]
    },
    {
      "id": "attempt-2-afd8ac2f",
      "name": "Attempt 2 — Success",
      "status": "success",
      "span_id": "afd8ac2f-c9f6-4d75-8fc5-d1fcdaa33d14",
      "children": [
        { "type": "trace_start", "name": "Trace Start" },
        {
          "type": "llm_call",
          "name": "LLM Call: gpt-3.5-turbo-1106",
          "latency_ms": 1525,
          "status": "success"
        },
        { "type": "trace_end", "name": "Trace End", "outcome": "success" }
      ]
    }
  ]
}
```

---

## 7. Checklist for implementation

- [x] **Attempt grouping:** Multiple root `span_id`s in one trace → “Attempt 1”, “Attempt 2”, etc.
- [x] **Tool → LLM parent:** If `parent_span_id` of `tool_call` is missing, infer parent from preceding `llm_call` that invoked that tool.
- [x] **Signals → spans:** Attach `error` events to span with matching `span_id`; render as badges or child nodes.
- [x] **Problem-first UI:** Failed attempt and failing tool visually emphasized; error message visible without extra clicks.
- [x] **Progressive disclosure:** Collapse by default to trace → attempts; expand to spans → tool → error.

**UI:** Implement the above in the **existing tree view in observa-app** (consume `trace.treeView`, `trace.summary.attempt_count` / `failure_count`, span `signals` and error children).

This gives devs the full workflow, clear attempt/retry structure, and **where the problem resides** (tool + tool_error) with minimal cognitive load.

# Trace Data vs. Display Analysis

**Trace ID:** `ac08e9ba-fe7b-404a-9fa8-c6ff29de46cc`  
**Purpose:** Compare raw database events to what the trace view displays; identify mismatches.

---

## Database Events (Actual Data)

| #   | event_type  | span_id  | parent_span_id | Notes                                                            |
| --- | ----------- | -------- | -------------- | ---------------------------------------------------------------- |
| 1   | trace_start | 7aca92fe | null           | Root trace                                                       |
| 2   | llm_call    | b1a27c3e | 7aca92fe       | Child of root; input "how are you?", output "I'm doing great..." |
| 3   | error       | 7aca92fe | **null**       | medium_latency signal (latency 2310ms > 2000ms threshold)        |
| 4   | trace_end   | 7aca92fe | null           | outcome: success                                                 |

**Flow:** 1 trace_start → 1 llm_call (with tool context in input_messages) → 1 success. **One logical attempt.**

---

## What Was Displayed (Before Fixes)

| Shown                        | Correct? | Cause                                                                                            |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| "2 attempts"                 | ❌       | Signal event had `parent_span_id: null` → counted as 2nd root                                    |
| "1 failure"                  | ❌       | medium_latency + hasFailure logic marked attempt as failed                                       |
| "4 Errors"                   | ❌       | Duplicate error spans from medium_latency (span + synthetic children)                            |
| "3 Thresholds"               | ⚠️       | Multiple medium_latency representations                                                          |
| Input: "how are you?"        | ✅       | Correct                                                                                          |
| Output: "I'm doing great..." | ✅       | Correct                                                                                          |
| Tool: getWeather             | ⚠️       | In input_messages (conversation context), not separate tool_call event — may display differently |

---

## Root Cause: False "2 Attempts"

**Bug:** `SignalsService` created signal events with `parent_span_id: null`.  
**Effect:** The medium_latency error event had `span_id: 7aca92fe` (LLM's span?) — actually the signal uses the span it refers to. For llm_call span `b1a27c3e`, the signal's span_id is `b1a27c3e`. So we had:

- trace_start: span 7aca92fe, parent null → root 1
- error (signal): span **b1a27c3e**, parent null → root 2 (false!)

**Fix applied:**

1. `SignalsService`: Set `parent_span_id` from source event (e.g. llm_call's parent).
2. `traceQueryService`: Exclude signal events from attempt-root calculation (for existing bad data).

---

## Fixes Applied

| Fix                        | File                 | Description                                                         |
| -------------------------- | -------------------- | ------------------------------------------------------------------- |
| Signal parent              | signalsService.ts    | Use `sourceEvent.parent_span_id` for signal events                  |
| Exclude signals from roots | traceQueryService.ts | Don't count `event_type=error` + attributes.signal as attempt roots |
| medium_latency badge-only  | traceQueryService.ts | No separate spans or synthetic error children                       |

---

## Expected Display After Fixes

- **1 attempt** (not 2)
- **0 failures** (medium_latency is a threshold warning, not a hard failure)
- **Input:** "how are you?" ✅
- **Output:** "I'm doing great..." ✅
- **LLM span:** May show medium_latency badge (2310ms > 2000ms) — informational only

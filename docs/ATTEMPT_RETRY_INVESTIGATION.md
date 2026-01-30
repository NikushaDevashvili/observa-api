# Why Did This Trace Take 2 Attempts?

**Purpose:** Document how attempts and retries are determined, and how to investigate the root cause when a trace shows multiple attempts.

---

## How Attempts Are Determined

### 1. Multiple Roots = Multiple Attempts

A **trace** can have multiple logical "attempts" when the framework (LangChain, LangGraph, etc.) retries after a failure. Each attempt corresponds to a **root span** — an event with `parent_span_id === null`.

- **Attempt 1** = First root span (e.g. from first `trace_start`)
- **Attempt 2** = Second root span (e.g. from retry `trace_start`)

The trace builder groups events by root ancestor. Events with the same root belong to the same attempt.

### 2. What Makes an Attempt "Failed"?

An attempt is marked **Failed** if any span in it has:

- `status === "error"` or `"timeout"`
- `event_type === "error"`
- `tool_call.result_status === "error"`
- `error_message` or `error_type` set
- LLM `finish_reason === "error"` or similar

### 3. Common Root Causes for Retries

| Cause                     | Where to Look                                          | Example                                                                             |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **LLM latency threshold** | LLM span has `medium_latency` or `high_latency` signal | LLM call took >2s (medium) or >5s (high); framework may retry with different params |
| **LLM status=error**      | LLM span `status` or `finish_reason`                   | Rate limit, content filter, model error                                             |
| **Tool failure**          | Tool span `result_status`, `error_message`             | Tool threw; agent retried without tool or with different input                      |
| **Timeout**               | Span `status === "timeout"`                            | Request exceeded timeout; framework retried                                         |
| **Framework retry**       | Second `trace_start` with new `span_id`                | LangChain/LangGraph built-in retry on failure                                       |

---

## Investigating a Specific Trace

1. **Check Attempt 1 spans** — Which span has `status: error` or an error signal?
2. **LLM span** — Look at `finish_reason`, `status`, and any `medium_latency`/`high_latency` badges.
3. **Tool spans** — Look at `result_status`, `error_message`.
4. **Signals** — `medium_latency` = LLM took >2s (warning, not necessarily hard failure). `tool_error` = tool call failed.
5. **Timeline** — Attempt 2 typically starts after Attempt 1's `trace_end` or error.

---

## Example: "how are you?" Trace with 2 Attempts

For a trace like the one shown:

- **Attempt 1 failed** — LLM span had `medium_latency` (took ~2s, exceeded 2s threshold) and possibly `status: error`. The framework retried.
- **Attempt 2 succeeded** — Second LLM call completed successfully, producing the final output.
- **Why 2 attempts** — Most likely: (1) first LLM call was slow or errored, (2) framework retry logic kicked in, (3) second attempt succeeded.

To confirm: inspect the first attempt's LLM span details (Input/Output, attributes) and any error/signal metadata.

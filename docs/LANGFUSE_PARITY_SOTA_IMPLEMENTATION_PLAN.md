# Langfuse Parity & SOTA Implementation Plan

**Date:** January 2026  
**Goal:** Bring Observa to parity with Langfuse's trace/observation architecture and UX  
**Reference:** [Langfuse Docs](https://langfuse.com/docs) — Core Concepts, Data Model, Observation Types, SDK, Empty Trace I/O FAQ  
**observa-sdk:** `/Users/nickdevashvili/observa-sdk/` (v0.0.24)

---

## 0. SOTA Methodologies (Observa + Industry)

### 0.1 Observa's Existing SOTA (Already Implemented)

Per `observa-sdk/SDK_SOTA_IMPLEMENTATION.md` and `observa-sdk/SDK_API_ALIGNMENT_REPORT.md`:

| Tier       | Scope                                                                                                     | Status | Location                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------- |
| **TIER 1** | OTEL Semantic Conventions (gen_ai.\*, operation_name, provider_name, response_model, structured messages) | ✅     | observa-sdk/src/index.ts, observa-api/src/types/events.ts |
| **TIER 2** | Sampling params, cost tracking, tool standardization, retrieval enrichment, error classification          | ✅     | observa-sdk, observa-api                                  |
| **TIER 3** | vector_db_operation, cache_operation, agent_create                                                        | ✅     | observa-sdk, observa-api                                  |

**OTEL Semconv:** `observa-sdk/src/instrumentation/semconv.ts` — gen*ai.*, ai.prompt.\_, ai.response.\* mappings.

**Agentic Pattern (SOTA):** SDK doc recommends Thought → Action → Observation:

- Thought: `trackLLMCall({ input, output: null, metadata: { "ai.agent.reasoning_summary": "..." } })`
- Action: `trackToolCall({ toolName, args, resultStatus })`
- Observation: `trackLLMCall({ input: null, output })`

### 0.2 Langfuse SOTA Methodologies

| Methodology               | Description                                                                      | Observa Gap                                          |
| ------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Trace vs. Observation** | Trace = request; Observation = step. Different zoom levels.                      | No explicit separation; question+answer on same span |
| **Root observation rule** | Trace I/O inherited from root observation                                        | Not implemented                                      |
| **Observation types**     | span, generation, tool, agent, chain, retriever, embedding, evaluator, guardrail | event_type only; no asType                           |
| **update_trace()**        | Explicit trace-level input/output                                                | N/A                                                  |
| **Context propagation**   | OTel span context for nesting                                                    | SDK uses spanStack; no full OTel                     |

### 0.3 SOTA Methodology Checklist (Target State)

- [ ] **Input/output attribution:** Question and answer always on different spans
- [ ] **Trace-level I/O:** Explicit trace.input / trace.output (or summary)
- [ ] **Observation types:** Optional asType/observation_type on events
- [ ] **updateTrace():** SDK method to set trace I/O explicitly
- [ ] **Agentic pattern:** Document Thought/Action/Observation; ensure output not conflated
- [ ] **Attempt grouping:** UI renders Attempt 1 / Attempt 2 from treeView
- [ ] **Problem-first:** Failed attempt/tool visually prominent

---

## 1. Target UX (Langfuse-Style)

**Reference:** Langfuse trace view screenshots.

- **Layout:** Left panel = hierarchical trace tree with icons, durations, costs, token counts. Right panel = selected node details (Input, Output, Metadata).
- **Root trace:** Input = user question; Output = final AI response. Session ID, User ID, Env prominent. Formatted/JSON toggle, copy buttons. Evaluations (scores) under root when present.
- **Per-observation:** Each inner span shows only that step's input and output (e.g., get-prompt → config in, prompt out; LLM → prompt in, completion out).
- **Tree:** Icons by type (chat bubble, lightning bolt, wrench, arrow). Metrics per node: duration, cost, tokens (input → output, Σ total). Nested hierarchy with interleaved LLM and tool calls.

---

## 2. Executive Summary

Observa has strong **span-level** coverage (~95% SOTA per `SOTA_SPAN_IMPLEMENTATION_SUMMARY.md`) but **does not** explicitly support the **trace vs. observation** mental model that Langfuse uses. Key gaps:

1. **Trace vs. Observation separation** — Langfuse distinguishes trace-level (overall request/response) from observation-level (per-step I/O). Observa blurs these.
2. **Input/output attribution** — User question and AI answer are shown on the same span. Langfuse keeps them on different observations (or trace-level).
3. **Root observation rule** — Langfuse inherits trace input/output from root observation. Observa has no equivalent.
4. **Observation types** — Langfuse has `span`, `generation`, `tool`, `agent`, `chain`, `retriever`, `embedding`, `evaluator`, `guardrail`. Observa uses event types but not observation-type semantics.
5. **Frontend** — Attempt grouping exists in API but not rendered; problem-first UX is partial.
6. **SDK** — observa-sdk (referenced as `file:../observa-sdk`) needs explicit trace/observation APIs and support for observation types.

---

## 3. Langfuse vs. Observa: Side-by-Side Comparison

### 3.1 Data Model

| Concept                | Langfuse                                                                         | Observa                                                             | Gap                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Trace**              | One request; holds overall input/output; collects observations                   | Implicit (root span + summary); `summary.query`, `summary.response` | No first-class trace object; no trace-level input/output inheritance                |
| **Observation**        | Individual step (span, generation, tool, etc.); each has own input/output        | Spans built from events (llm_call, tool_call, etc.)                 | Semantically similar but not labeled as "observation"; no observation types         |
| **Trace input**        | From root observation or set explicitly                                          | `summary.query` from first LLM                                      | ✅ Present but not in trace object                                                  |
| **Trace output**       | From root observation or set explicitly                                          | `summary.response` from output event / last LLM                     | ✅ Present                                                                          |
| **Observation input**  | Per observation                                                                  | Per span (llm_call.input, tool_call.args)                           | ✅ Present                                                                          |
| **Observation output** | Per observation                                                                  | Per span (llm_call.output, tool_call.result)                        | ⚠️ **Bug:** LLM span shows final answer when it should only show that step's output |
| **Observation types**  | span, generation, tool, agent, chain, retriever, embedding, evaluator, guardrail | event_type: llm_call, tool_call, retrieval, embedding, etc.         | Partial; no `generation` vs `span`; no `agent`, `chain`, `evaluator`, `guardrail`   |

### 3.2 Input/Output Rules

| Rule                                   | Langfuse                           | Observa                                 | Status             |
| -------------------------------------- | ---------------------------------- | --------------------------------------- | ------------------ |
| Trace input = user question            | ✅ Trace-level or root observation | ✅ summary.query                        | ✅                 |
| Trace output = final answer            | ✅ Trace-level or root observation | ✅ summary.response                     | ✅                 |
| Each observation has own I/O           | ✅                                 | ⚠️ LLM span conflates question + answer | ❌                 |
| Question and answer on different spans | ✅                                 | ❌ Same span                            | ❌ **Critical**    |
| Root observation rule                  | Trace inherits from root           | N/A                                     | ⚠️ Not implemented |

### 3.3 SDK Capabilities

| Capability                  | Langfuse                                  | Observa (from ObservaClient)             | Gap                                            |
| --------------------------- | ----------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| startTrace / trace          | `trace()`, `start_as_current_observation` | `startTrace()`                           | ✅                                             |
| startSpan                   | `span()`, `as_type="span"`                | Implicit via trackLLMCall, trackToolCall | ⚠️ No explicit span/observation API            |
| startGeneration             | `generation()`, `as_type="generation"`    | trackLLMCall                             | ✅ Mapped to llm_call                          |
| startTool                   | `tool()`, `as_type="tool"`                | trackToolCall                            | ✅                                             |
| Observation types           | `as_type` param on all                    | No type param                            | ❌                                             |
| update(input, output)       | Per observation                           | Per track call                           | ⚠️ Single call per span; no incremental update |
| update_trace(input, output) | Explicit trace-level                      | N/A                                      | ❌                                             |
| Flush / shutdown            | `flush()`, `shutdown()`                   | endTrace()                               | Partial                                        |
| sendEvent (generic)         | Via OTel                                  | `sendEvent?` optional                    | ⚠️ Optional                                    |

---

## 4. Current Observa Architecture (As-Is)

### 4.1 Event Flow

```
SDK/Wrapper → POST /api/v1/events/ingest → CanonicalEventService
    → Tinybird (canonical_events) → TraceQueryService.buildTreeFromCanonicalEvents
    → treeView, spans, summary → Agent Prism Adapter → Frontend
```

### 4.2 Event Types (Observa)

- `trace_start`, `trace_end`
- `llm_call`, `tool_call`, `retrieval`, `embedding`
- `vector_db_operation`, `cache_operation`, `agent_create`
- `output`, `error`, `feedback`

### 4.3 Span Building (traceQueryService)

- Spans created from events; root-level events become separate spans (e.g. `${span_id}-llm_call`).
- `treeView` has attempt grouping (Attempt 1 — Failed, Attempt 2 — Success).
- Frontend uses `spans` (rootSpans) for tree; `treeView.children` (attempts) **not rendered**.
- Input/output: LLM span gets `llm_call.input` + `llm_call.output`; Output span gets `final_output`.
- **Bug:** LLM span shows both user question and final answer when they should be separate.

---

## 5. Gap Analysis: What Needs to Change

### 5.1 Critical (P0)

| #   | Gap                                                        | Component                            | Effort |
| --- | ---------------------------------------------------------- | ------------------------------------ | ------ |
| 1   | **Question and answer on different spans**                 | traceQueryService, agentPrismAdapter | Medium |
| 2   | **Trace Start = question only; Output span = answer only** | traceQueryService                    | Medium |
| 3   | **LLM span never shows final answer when it's the answer** | traceQueryService, adapter           | Medium |
| 4   | **Synthetic Output span when no output event**             | traceQueryService                    | Small  |

### 5.2 High (P1)

| #   | Gap                                                  | Component                         | Effort |
| --- | ---------------------------------------------------- | --------------------------------- | ------ |
| 5   | **Render treeView.children (Attempt 1, Attempt 2)**  | observa-app frontend              | Medium |
| 6   | **Observation types in events/SDK**                  | events.ts, observa-sdk, ingestion | Medium |
| 7   | **Trace-level input/output as first-class**          | API response, frontend            | Small  |
| 8   | **Root observation rule (trace inherits from root)** | traceQueryService                 | Small  |

### 5.3 Medium (P2)

| #   | Gap                                                                      | Component                   | Effort |
| --- | ------------------------------------------------------------------------ | --------------------------- | ------ |
| 9   | **Langfuse-style observation types: agent, chain, evaluator, guardrail** | events.ts, SDK              | Medium |
| 10  | **SDK: startSpan, startGeneration, startTool with asType**               | observa-sdk                 | Large  |
| 11  | **SDK: update_trace(input, output)**                                     | observa-sdk                 | Small  |
| 12  | **medium_latency as badge only (no duplicate error nodes)**              | traceQueryService, frontend | Small  |

### 5.4 Lower (P3)

| #   | Gap                                       | Component      | Effort |
| --- | ----------------------------------------- | -------------- | ------ |
| 13  | **OTel foundation (Context propagation)** | observa-sdk    | Large  |
| 14  | **Sessions grouping**                     | Already exists | N/A    |
| 15  | **Agent graphs / specialized views**      | Frontend       | Future |

---

## 6. observa-sdk Changes Required

**Location:** `/Users/nickdevashvili/observa-sdk/` (v0.0.24)  
**Entry:** `src/index.ts` (bundled via tsup)

### 6.1 Current SDK API (Actual — from observa-sdk/src/index.ts)

| Method                            | Line ~ | Purpose                               |
| --------------------------------- | ------ | ------------------------------------- |
| `startTrace(options)`             | 1668   | Create trace; add trace_start event   |
| `endTrace(options?)`              | 2662   | Flush buffered events to API          |
| `trackTraceStart(payload)`        | 1783   | Direct trace_start (LangChain compat) |
| `sendEvent(event)`                | 1854   | Generic canonical event               |
| `trackLLMCall(options)`           | 1925   | LLM call with full OTEL               |
| `trackToolCall(options)`          | —      | Tool call                             |
| `trackRetrieval(options)`         | —      | Retrieval                             |
| `trackOutput(options)`            | 2445   | Output event (final_output)           |
| `trackError(options)`             | —      | Error                                 |
| `trackFeedback(options)`          | —      | Feedback                              |
| `trackEmbedding(options)`         | 2468   | Embedding                             |
| `trackVectorDbOperation(options)` | 2532   | Vector DB                             |
| `trackCacheOperation(options)`    | —      | Cache                                 |
| `trackAgentCreate(options)`       | —      | Agent create                          |

**Event flow:** `addEvent()` → buffers; `endTrace()` → `_sendEventsWithRetry()` → `sendEvents()` → POST `/api/v1/events/ingest`.

**observa-sdk structure:**

```
observa-sdk/
├── src/
│   ├── index.ts              # Main SDK (Observa class, track*, startTrace, endTrace)
│   ├── context.ts            # Context/state
│   └── instrumentation/
│       ├── openai.ts         # OpenAI wrapper
│       ├── anthropic.ts      # Anthropic wrapper
│       ├── langchain.ts      # LangChain callback (ObservaClient interface)
│       ├── vercel-ai.ts      # Vercel AI SDK
│       ├── semconv.ts        # OTEL gen_ai.* mappings
│       └── utils.ts, normalize.ts, error-utils.ts
├── SDK_SOTA_IMPLEMENTATION.md
├── SDK_API_ALIGNMENT_REPORT.md
└── package.json              # v0.0.24
```

### 6.2 Required Additions (SOTA)

| Method                                    | File        | Purpose                                             | Langfuse Equivalent |
| ----------------------------------------- | ----------- | --------------------------------------------------- | ------------------- |
| `updateTrace(input?, output?)`            | index.ts    | Set trace-level input/output; store for endTrace    | `update_trace()`    |
| `observation_type` / `asType` param       | All track\* | Optional; add to attributes                         | `as_type`           |
| `isFinalOutput?: boolean` on trackLLMCall | index.ts    | When true, omit output (answer goes to trackOutput) | —                   |
| `flush()`                                 | index.ts    | Force send buffered events (short-lived apps)       | `flush()`           |

### 6.3 Observation Types (Optional Enhancement)

Add to `observa-sdk/src/index.ts` and attributes:

```typescript
type ObservationType =
  | "span" // Generic (map: event_type)
  | "generation" // LLM (llm_call)
  | "tool" // tool_call
  | "agent" // Agent decision (new or metadata)
  | "chain" // Chain step (new or metadata)
  | "retriever" // retrieval
  | "embedding" // embedding
  | "evaluator" // (new event_type or metadata)
  | "guardrail"; // (new event_type or metadata)
```

Include `observation_type` in `attributes` when provided; API can store in attributes_json.

### 6.4 Implementation Tasks (observa-sdk)

| Task | File                                                  | Description                                                                                                                    |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 5.1  | `observa-sdk/src/index.ts`                            | Add `updateTrace(input?, output?)` — store in instance; on endTrace, add to trace_end or create trace-level event              |
| 5.2  | `observa-sdk/src/index.ts`                            | Add `flush()` — call `_sendEventsWithRetry` for current buffer without ending trace                                            |
| 5.3  | `observa-sdk/src/index.ts`                            | Add `isFinalOutput?: boolean` to trackLLMCall — when true, set `output: null` in llm_call (caller uses trackOutput for answer) |
| 5.4  | `observa-sdk/src/index.ts`                            | Add optional `observationType?: ObservationType` to track methods; include in attributes                                       |
| 5.5  | `observa-sdk/README.md`, `SDK_SOTA_IMPLEMENTATION.md` | Document trace vs. observation; agentic pattern (Thought/Action/Observation); when to use isFinalOutput                        |
| 5.6  | `observa-api/src/wrappers/langchain.ts`               | When agentic flow: use isFinalOutput for intermediate LLM; ensure trackOutput called for final answer                          |

### 6.6 SDK Implementation Checklist

- [ ] `updateTrace(input?, output?)` — persist; include in trace_end or summary on flush
- [ ] `flush()` — send buffer without ending trace
- [ ] `trackLLMCall({ isFinalOutput: true })` — omit output; rely on trackOutput
- [ ] `observationType` param on track methods (optional)
- [ ] Update SDK_SOTA_IMPLEMENTATION.md with trace/observation semantics

---

## 7. SOTA Implementation Plan (Phased)

### Phase 1: Input/Output Attribution (P0) — ~2–3 days

**Goal:** Question and answer always on different spans.

| Task | File(s)              | Description                                                                                               |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| 1.1  | traceQueryService.ts | Precompute `userQuery`, `finalOutput` from parsedEvents before span loop                                  |
| 1.2  | traceQueryService.ts | Trace Start span: `input = userQuery`, `output = null`                                                    |
| 1.3  | traceQueryService.ts | Output span: `input = null`, `output = final_output` only                                                 |
| 1.4  | traceQueryService.ts | LLM span: when `llm_call.output === finalOutput`, set `span.output = null`, `span.llm_call.output = null` |
| 1.5  | traceQueryService.ts | Create synthetic Output span when no output event but finalOutput from last LLM                           |
| 1.6  | agentPrismAdapter.ts | Ensure adapter respects span.input/output (no override from llm_call when cleared)                        |

**Acceptance:** User question on Trace Start or Input span; final answer only on Output span; LLM span shows only that call's I/O (or tool decision).

---

### Phase 2: Frontend — Attempt Grouping & Tree (P1) — ~2 days

**Goal:** Render treeView.children so Attempt 1 / Attempt 2 appear in the tree.

| Task | File(s)     | Description                                                                     |
| ---- | ----------- | ------------------------------------------------------------------------------- |
| 2.1  | observa-app | Use `trace.treeView` (not just `trace.spans`) for tree structure when available |
| 2.2  | observa-app | Render Attempt 1 — Failed / Attempt 2 — Success with status styling (red/green) |
| 2.3  | observa-app | Progressive disclosure: collapsed by default to trace → attempts                |

**Acceptance:** Tree shows "Attempt 1 — Failed" and "Attempt 2 — Success" as intermediate nodes.

---

### Phase 3: Observation Types (P1–P2) — ~2 days

**Goal:** Add observation_type to event model and ingestion.

| Task | File(s)               | Description                                                             |
| ---- | --------------------- | ----------------------------------------------------------------------- |
| 3.1  | events.ts             | Add `observation_type?: ObservationType` to CanonicalEvent / attributes |
| 3.2  | validation/schemas.ts | Add observation_type to schema (optional)                               |
| 3.3  | events/ingest         | Accept observation_type from SDK, store in attributes_json              |
| 3.4  | traceQueryService.ts  | Use observation_type for span display (e.g. "Agent", "Chain")           |
| 3.5  | agentPrismAdapter.ts  | Map observation_type to AgentPrismTraceSpan type                        |

**Acceptance:** Events can carry observation_type; UI can show "Agent", "Chain", etc. when provided.

---

### Phase 4: Trace-Level Input/Output (P1) — ~1 day

**Goal:** First-class trace input/output in API response.

| Task | File(s)              | Description                                                                                                |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| 4.1  | traceQueryService.ts | Ensure `summary.query`, `summary.response` always populated                                                |
| 4.2  | traces route         | Add `trace.input`, `trace.output` to response (from summary)                                               |
| 4.3  | observa-app          | When root Trace span selected, show trace-level input/output (or labels "User message" / "Final response") |

**Acceptance:** Trace object has explicit input/output; root span or trace header shows them with clear labels.

---

### Phase 5: observa-sdk Enhancements (P2) — ~2–3 days

**Goal:** SDK supports trace/observation model per SOTA methodologies.

| Task | Location                                 | Description                                                                  |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| 5.1  | `observa-sdk/src/index.ts`               | Add `updateTrace(input?, output?)` — store; include in trace_end on endTrace |
| 5.2  | `observa-sdk/src/index.ts`               | Add `flush()` — send buffer without ending trace                             |
| 5.3  | `observa-sdk/src/index.ts`               | Add `isFinalOutput?: boolean` to trackLLMCall — omit output when true        |
| 5.4  | `observa-sdk/src/index.ts`               | Add optional `observationType` to track methods; pass to attributes          |
| 5.5  | `observa-api/src/wrappers/langchain.ts`  | Use isFinalOutput for agentic flows; ensure trackOutput for final answer     |
| 5.6  | `observa-sdk/SDK_SOTA_IMPLEMENTATION.md` | Document trace vs. observation; agentic pattern; updateTrace, flush          |

**Acceptance:** SDK has updateTrace, flush, isFinalOutput; trace-level I/O can be set; agentic pattern documented.

---

### Phase 6: Polish (P2–P3) — ~1–2 days

| Task | Description                                                                                   |
| ---- | --------------------------------------------------------------------------------------------- |
| 6.1  | Consolidate medium_latency: badge only on LLM span, no duplicate error children               |
| 6.2  | Root observation rule: when root span has input/output, use for trace summary                 |
| 6.3  | Update docs (TRACE_TREE_VIEW_SPEC, TRACE_DATA_REFERENCE) with trace vs. observation semantics |
| 6.4  | Add integration tests for input/output attribution                                            |

---

## 8. Success Criteria (Langfuse Parity)

### Data Model

| Criterion                               | Measure                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Root = user question + final answer** | When root trace selected: Input = user query, Output = final AI response. Never on the same inner span.                                     |
| **Per-step I/O only**                   | Each inner observation shows only that step's input and output (e.g., get-prompt → config in, prompt out; LLM → prompt in, completion out). |
| **No conflation**                       | No span shows both the user question and the final answer as its Input/Output.                                                              |

### UI / UX (Langfuse-Style)

| Criterion                   | Measure                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| **Two-panel layout**        | Left: trace tree; Right: selected node's Input, Output, Metadata.             |
| **Icons by type**           | Chat bubble (trace), lightning bolt (LLM), wrench (tool), arrow (chain/step). |
| **Metrics in tree**         | Duration, cost, token counts (input → output, Σ total) visible per node.      |
| **Context header**          | Session ID, User ID, Env, trace ID when root selected.                        |
| **Formatted/JSON + copy**   | Toggle for Input/Output; copy buttons.                                        |
| **Attempt grouping**        | Attempt 1 — Failed / Attempt 2 — Success in tree when retries exist.          |
| **Trace-level evaluations** | Scores (answer-fit, relevance, etc.) under root when available.               |

### SDK

| Criterion         | Measure                                                           |
| ----------------- | ----------------------------------------------------------------- |
| **updateTrace**   | SDK can set trace-level input/output explicitly.                  |
| **flush**         | SDK can send buffered events without ending trace.                |
| **isFinalOutput** | SDK supports omitting LLM output when answer goes to trackOutput. |

---

## 9. References

### Langfuse

- [Langfuse Core Concepts](https://langfuse.com/docs/tracing-data-model)
- [Langfuse Observation Types](https://langfuse.com/docs/observability/features/observation-types)
- [Langfuse Empty Trace I/O FAQ](https://langfuse.com/faq/all/empty-trace-input-and-output)
- [Langfuse SDK Overview](https://langfuse.com/docs/observability/sdk/overview)

### Observa

- [Observa TRACE_TREE_VIEW_SPEC](./TRACE_TREE_VIEW_SPEC.md)
- [Observa SOTA_SPAN_IMPLEMENTATION_SUMMARY](../SOTA_SPAN_IMPLEMENTATION_SUMMARY.md)
- **observa-sdk** (sibling repo): `observa-sdk/SDK_SOTA_IMPLEMENTATION.md` — OTEL params, agentic pattern
- **observa-sdk**: `observa-sdk/SDK_API_ALIGNMENT_REPORT.md` — SDK ↔ API alignment
- **observa-sdk**: `observa-sdk/src/instrumentation/semconv.ts` — OTEL gen_ai.\* semantic conventions

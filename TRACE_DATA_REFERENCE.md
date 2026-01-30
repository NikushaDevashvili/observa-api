# Trace Data Reference

This document explains all the trace information available in the API and how to access it.

**Trace vs. Observation:** A trace represents one request (user question → final answer). Observations are individual steps within the trace (LLM call, tool call, retrieval, etc.). Each observation has its own input/output. Trace-level `summary.query` and `summary.response` hold the overall user question and final answer; per-span data holds that step's I/O only.

## API Endpoints

### 1. Get Trace Detail (Tree Format)

**Endpoint:** `GET /api/v1/traces/:traceId?format=tree`

**Response Structure:**

```json
{
  "success": true,
  "trace": {
    "summary": {
      /* Trace summary metadata */
    },
    "spans": [
      /* Array of spans */
    ],
    "signals": [
      /* Array of detected issues */
    ],
    "analysis": {
      /* Full analysis results */
    }
  }
}
```

### 2. Get Trace Detail (Legacy Format)

**Endpoint:** `GET /api/v1/traces/:traceId`

Returns a flat structure with all trace and analysis data.

## Complete Data Structure

### Summary Object

Contains high-level trace metadata:

- `trace_id` - Unique trace identifier
- `tenant_id` - Tenant identifier
- `project_id` - Project identifier
- `environment` - "dev" or "prod"
- `conversation_id` - Conversation identifier (if part of a conversation)
- `session_id` - Session identifier (if part of a session)
- `user_id` - User identifier
- `message_index` - Position in conversation (1, 2, 3...)
- `start_time` - Trace start timestamp
- `end_time` - Trace end timestamp
- `total_latency_ms` - Total latency in milliseconds
- `total_tokens` - Total tokens used
- `total_cost` - Estimated cost (currently null)
- `model` - LLM model name
- `status` - HTTP status code
- `status_text` - HTTP status text
- `finish_reason` - Completion reason
- `response_length` - Response length in characters
- `time_to_first_token_ms` - Time to first token
- `streaming_duration_ms` - Streaming duration
- `analyzed_at` - When analysis was completed

### Spans Array

Each span contains:

- `span_id` - Span identifier
- `parent_span_id` - Parent span (null for root)
- `name` - Span name (e.g., "LLM Call")
- `start_time` - Span start timestamp
- `end_time` - Span end timestamp
- `duration_ms` - Span duration
- `events` - Array of events within the span
- `metadata` - Span metadata including:
  - `model` - LLM model
  - `environment` - Environment
  - `conversation_id` - Conversation ID
  - `session_id` - Session ID
  - `user_id` - User ID
  - `message_index` - Message index
  - `status` - HTTP status
  - `status_text` - HTTP status text
  - `finish_reason` - Finish reason
  - `response_id` - Response ID
  - `system_fingerprint` - System fingerprint
  - `metadata` - Custom metadata (JSON object)
  - `headers` - HTTP headers (JSON object)

### Events within Spans

#### LLM Call Event

- `event_type`: "llm_call"
- `timestamp`: Event timestamp
- `attributes.llm_call`:
  - `model` - Model name
  - `input` - User query/input
  - `output` - LLM response
  - `context` - Retrieval context (if available)
  - `input_tokens` - Input tokens
  - `output_tokens` - Output tokens
  - `total_tokens` - Total tokens
  - `latency_ms` - Latency
  - `time_to_first_token_ms` - Time to first token
  - `streaming_duration_ms` - Streaming duration
  - `finish_reason` - Finish reason
  - `response_id` - Response ID
  - `system_fingerprint` - System fingerprint

#### Retrieval Event

- `event_type`: "retrieval"
- `timestamp`: Event timestamp
- `attributes.retrieval`:
  - `retrieval_context_ids` - Context IDs (if available)
  - `retrieval_context` - Actual context text
  - `context_length` - Context length
  - `latency_ms` - Retrieval latency

#### Output Event

- `event_type`: "output"
- `timestamp`: Event timestamp
- `attributes.output`:
  - `final_output` - Final output text
  - `output_length` - Output length

### Signals Array

Array of detected issues (only populated if issues are found):

- `signal_type` - Type: "hallucination", "context_drop", "faithfulness", "model_drift", "cost_anomaly"
- `severity` - "high", "medium", "low"
- `confidence` - Confidence score (for hallucination)
- `reasoning` - Explanation (for hallucination)
- `score` - Numeric score (for other signals)

### Analysis Object

Complete analysis results (all fields, even if null):

- `isHallucination` - Boolean
- `hallucinationConfidence` - Confidence score (0-1)
- `hallucinationReasoning` - Explanation text
- `qualityScore` - Overall quality (integer)
- `coherenceScore` - Coherence (0-1)
- `relevanceScore` - Relevance (0-1)
- `helpfulnessScore` - Helpfulness (0-1)
- `hasContextDrop` - Boolean
- `hasModelDrift` - Boolean
- `hasPromptInjection` - Boolean
- `hasContextOverflow` - Boolean
- `hasFaithfulnessIssue` - Boolean
- `hasCostAnomaly` - Boolean
- `hasLatencyAnomaly` - Boolean
- `hasQualityDegradation` - Boolean
- `contextRelevanceScore` - Context relevance (0-1)
- `answerFaithfulnessScore` - Answer faithfulness (0-1)
- `driftScore` - Model drift score (0-1)
- `anomalyScore` - Anomaly score (0-1)
- `analysisModel` - Model used for analysis
- `analysisVersion` - Analysis version
- `processingTimeMs` - Analysis processing time

## Why You Might Only See the Span

If you're only seeing the span object in your frontend, it's likely because:

1. **Frontend Extraction**: The frontend might be extracting only `trace.spans[0]` instead of the full `trace` object
2. **Analysis Not Run**: Analysis fields will be `null`/`false` if:
   - `ANALYSIS_SERVICE_URL` environment variable is not set
   - Analysis service is not running
   - Analysis is still in progress (runs asynchronously)
3. **No Issues Detected**: The `signals` array will be empty if no issues were detected

## Checking Analysis Status

To check if analysis has run:

1. Look for `analyzed_at` in the summary - if present, analysis has completed
2. Check if `analysis.analysisModel` is not null
3. Check if any analysis scores are populated

## Diagnostic Script

Use the diagnostic script to check what's in the database:

```bash
node scripts/check-trace-data.js <trace_id>
```

This will show:

- What analysis fields are populated
- Whether analysis has run
- All available trace data
- Environment configuration

## Environment Variables

Required for analysis:

- `ANALYSIS_SERVICE_URL` - URL of the Python analysis service (optional, analysis will be skipped if not set)

## Notes

- Analysis runs **asynchronously** after trace ingestion, so there may be a delay
- If `ANALYSIS_SERVICE_URL` is not set, analysis is skipped but trace data is still stored
- All fields are optional and may be `null` if not available
- The tree format is designed for waterfall/timeline views
- The legacy format is better for simple display of all data at once

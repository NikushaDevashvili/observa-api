# Generate Issues Test Data

This script generates test data with various issue types for testing the dashboard issues display.

## Issue Types Generated

The script generates traces with the following issue types:

1. **Tool Errors** (`tool_error`)
   - Database connection failures
   - API errors
   - Tool execution failures

2. **Tool Timeouts** (`tool_timeout`)
   - Tools that exceed 30s timeout
   - High latency tool calls

3. **High Latency** (`high_latency`, `medium_latency`)
   - LLM calls with latency >5s (high)
   - LLM calls with latency >2s (medium)

4. **Cost Spikes** (`cost_spike`)
   - Expensive LLM calls (>$10 per call)
   - High token usage with expensive models

5. **Token Spikes** (`token_spike`)
   - Traces with >100k tokens
   - High input/output token counts

6. **Error Events** (`error_event`)
   - General error events
   - LLM API errors
   - Rate limit errors

## Usage

### Basic Usage

```bash
node scripts/generate-issues-test-data.js <JWT_TOKEN>
```

### With Environment Variables

```bash
JWT_TOKEN=your_token \
NUM_TRACES=30 \
ERROR_RATE=0.6 \
HIGH_LATENCY_RATE=0.5 \
COST_SPIKE_RATE=0.4 \
node scripts/generate-issues-test-data.js
```

### With API URL

```bash
API_URL=https://observa-api.vercel.app \
node scripts/generate-issues-test-data.js <JWT_TOKEN>
```

## Configuration Options

All configuration options can be set via environment variables:

- `NUM_TRACES` (default: 20) - Number of traces to generate
- `ERROR_RATE` (default: 0.5) - Probability of tool errors (0.0-1.0)
- `HIGH_LATENCY_RATE` (default: 0.4) - Probability of high latency LLM calls (0.0-1.0)
- `COST_SPIKE_RATE` (default: 0.3) - Probability of cost spikes (0.0-1.0)
- `TOKEN_SPIKE_RATE` (default: 0.2) - Probability of token spikes (0.0-1.0)
- `TOOL_TIMEOUT_RATE` (default: 0.3) - Probability of tool timeouts (0.0-1.0)
- `RATE_LIMIT_MS` (default: 200) - Delay between trace sends (ms)
- `API_URL` (default: http://localhost:3000) - Backend API URL
- `API_KEY` (optional) - Use existing API key instead of creating one

## Example: Generate Many Issues

To generate a lot of issues for testing:

```bash
NUM_TRACES=50 \
ERROR_RATE=0.7 \
HIGH_LATENCY_RATE=0.6 \
COST_SPIKE_RATE=0.5 \
TOKEN_SPIKE_RATE=0.4 \
TOOL_TIMEOUT_RATE=0.5 \
node scripts/generate-issues-test-data.js <JWT_TOKEN>
```

## Expected Results

After running the script:

1. **Dashboard Overview** (`/dashboard`)
   - Should show active issues count
   - Error rate should be elevated
   - Cost metrics may show spikes
   - Latency metrics may show high percentiles

2. **Issues Page** (`/dashboard/issues`)
   - Should display multiple issues
   - Filterable by severity (high/medium/low)
   - Filterable by signal type (tool_error, tool_timeout, high_latency, etc.)
   - Each issue should link to its trace

3. **Signals Generated**
   - Signals are generated automatically by `SignalsService` when events are processed
   - Signals appear as "error" type events in Tinybird
   - Signal metadata includes severity, signal_name, signal_type

## Signal Types Generated

The `SignalsService` automatically generates signals from the events:

- `tool_error` - High severity, when tool_call.result_status === "error"
- `tool_timeout` - High severity, when tool_call.result_status === "timeout"
- `tool_latency` - Medium severity, when tool_call.latency_ms > 5000
- `high_latency` - High severity, when llm_call.latency_ms > 5000
- `medium_latency` - Medium severity, when llm_call.latency_ms > 2000
- `cost_spike` - High severity, when llm_call.cost > 10
- `token_spike` - High severity, when llm_call.total_tokens > 100000
- `error_event` - High severity, when event_type === "error"

## Notes

- Signals are generated server-side when events are ingested
- There may be a slight delay before signals appear (processing time)
- Signals are stored in Tinybird as canonical events with event_type="error"
- The issues page queries signals from Tinybird via the `/api/v1/issues` endpoint

## Troubleshooting

**No issues showing in dashboard:**
- Check that events were successfully sent (script output)
- Wait a few seconds for signal processing
- Check browser console for API errors
- Verify JWT token is valid
- Check that SignalsService is processing events

**Only some issue types appearing:**
- Signals are generated based on event attributes
- Check that events have the required fields (latency_ms, cost, tokens, etc.)
- Verify signal thresholds match your data (e.g., latency >5s, cost >$10)


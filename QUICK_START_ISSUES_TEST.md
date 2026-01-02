# Quick Start: Generate Issues Test Data

## Generate Test Data with Issues

Run this script to generate test traces with various issue types for testing the dashboard:

```bash
# Basic usage (generates 20 traces with 50% error rate)
node scripts/generate-issues-test-data.js <YOUR_JWT_TOKEN>

# Generate more issues (50 traces, 70% error rate)
NUM_TRACES=50 ERROR_RATE=0.7 \
node scripts/generate-issues-test-data.js <YOUR_JWT_TOKEN>

# Generate lots of issues for comprehensive testing
NUM_TRACES=30 \
ERROR_RATE=0.6 \
HIGH_LATENCY_RATE=0.5 \
COST_SPIKE_RATE=0.4 \
TOKEN_SPIKE_RATE=0.4 \
TOOL_TIMEOUT_RATE=0.5 \
node scripts/generate-issues-test-data.js <YOUR_JWT_TOKEN>
```

## What Gets Generated

The script creates traces with:

1. **Tool Errors** - Database failures, API errors
2. **Tool Timeouts** - Tools that exceed 30s timeout
3. **High Latency** - LLM calls >5s (high severity) or >2s (medium)
4. **Cost Spikes** - Expensive calls (>$10) using expensive models
5. **Token Spikes** - High token usage (>100k tokens)
6. **Error Events** - General error events

## View the Issues

After running the script:

1. **Dashboard Overview** (`/dashboard`)
   - Check "Active Issues" count
   - Look at error rate
   - Check latency metrics (P95/P99 should be high)
   - Check cost metrics

2. **Issues Page** (`/dashboard/issues`)
   - Should show multiple issues
   - Filter by severity: high/medium/low
   - Filter by signal type: tool_error, tool_timeout, high_latency, etc.
   - Click any issue to view the trace

## Configuration Options

- `NUM_TRACES` (default: 20) - Number of traces
- `ERROR_RATE` (default: 0.5) - Tool error probability (0.0-1.0)
- `HIGH_LATENCY_RATE` (default: 0.4) - High latency probability
- `COST_SPIKE_RATE` (default: 0.3) - Cost spike probability
- `TOKEN_SPIKE_RATE` (default: 0.2) - Token spike probability
- `TOOL_TIMEOUT_RATE` (default: 0.3) - Tool timeout probability

## Get Your JWT Token

If you need a JWT token:

```bash
# From observa-api directory
node scripts/generate-test-token.js
```

Or log in to your dashboard and check localStorage for `sessionToken`.



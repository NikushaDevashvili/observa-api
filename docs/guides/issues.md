# Issues Guide

Complete guide to understanding and managing issues in Observa.

## What are Issues?

Issues are automatically detected problems in your AI application, such as:
- Errors (tool failures, timeouts)
- High latency
- Cost spikes
- Token spikes
- Quality degradation

## Viewing Issues

### Timeline View

1. Navigate to "Issues" in the dashboard
2. See issues timeline with:
   - Timestamp
   - Issue type
   - Severity (high/medium/low)
   - Affected trace ID
   - Details

### Summary View

See aggregated issues:
- Grouped by issue type
- Count per type
- Latest occurrence
- Sample trace IDs

## Issue Types

### Errors

- **Tool Error**: Tool/function call failed
- **Tool Timeout**: Tool call timed out
- **LLM Error**: LLM API error
- **General Error**: Other errors

### Performance

- **High Latency**: LLM call > 5 seconds
- **Medium Latency**: LLM call > 2 seconds
- **Tool Latency**: Tool call > 5 seconds

### Cost & Usage

- **Cost Spike**: Cost > $10 per call
- **Token Spike**: Tokens > 100k per call

### Quality

- **Quality Degradation**: Detected quality issues
- **Potential Hallucination**: Possible hallucination

## Severity Levels

### High

Critical issues requiring immediate attention:
- Errors
- Very high latency
- Cost spikes

### Medium

Important issues to monitor:
- Moderate latency
- Quality concerns

### Low

Minor issues:
- Small performance variations
- Informational signals

## Filtering Issues

### By Severity

- High only
- Medium and high
- All severities

### By Issue Type

Filter by specific issue types:
- Tool errors
- High latency
- Cost spikes
- etc.

### By Time Range

- Last 24 hours
- Last 7 days
- Last 30 days
- Custom range

## Investigating Issues

### View Affected Trace

Click on an issue to see:
- Full trace details
- What caused the issue
- Context around the issue
- Related events

### Patterns

Look for patterns:
- Same issue recurring
- Issues at specific times
- Issues for specific users
- Issues with specific models

## Alerts

The dashboard shows active alerts for:
- High-severity issues
- Medium-severity issues
- Recent errors

## Related Documentation

- [Traces Guide](./traces.md)
- [Dashboard Guide](./dashboard.md)
- [Troubleshooting Guide](../troubleshooting/common-issues.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


# Traces Guide

Complete guide to understanding and using traces in Observa.

## What are Traces?

Traces represent a single execution of your AI application, including:
- User queries
- LLM calls
- Tool calls
- Retrievals
- Errors
- Final outputs

## Viewing Traces

### List View

1. Navigate to "Traces" in the dashboard
2. See all traces with:
   - Timestamp
   - User query
   - Model used
   - Latency
   - Cost
   - Issue indicators

### Detail View

Click on a trace to see:
- **Summary**: High-level information (query, response, model, tokens, cost)
- **Spans**: Hierarchical view of all operations
- **Signals**: Detected issues and anomalies
- **Timeline**: Chronological view of events

## Trace Structure

### Summary

Contains:
- `trace_id`: Unique identifier
- `query`: User's question/input
- `response`: Final output
- `model`: LLM model used
- `tokens_total`: Total tokens consumed
- `latency_ms`: Total latency
- `cost`: Estimated cost
- `status`: Success or error

### Spans

Spans represent individual operations:
- **Root Span**: The trace itself
- **LLM Call Spans**: Each LLM API call
- **Tool Call Spans**: Each tool/function call
- **Retrieval Spans**: Each RAG retrieval
- **Error Spans**: Errors that occurred

### Hierarchy

Spans form a tree:
```
Trace (root)
  ├── Retrieval
  ├── LLM Call
  │   ├── Tool Call
  │   └── Tool Call
  └── Output
```

## Filtering Traces

### By Project

Select a project to see only traces from that project.

### By Time Range

- Last 24 hours
- Last 7 days
- Last 30 days
- Custom range

### By Issue Type

Filter to see only traces with:
- Errors
- High latency
- Cost spikes
- Tool failures

## Understanding Trace Data

### Latency

- **Total Latency**: End-to-end time
- **LLM Latency**: Time for LLM response
- **Tool Latency**: Time for tool execution
- **Retrieval Latency**: Time for RAG retrieval

### Cost

- **Total Cost**: Sum of all LLM call costs
- **Cost per Model**: Breakdown by model
- **Cost per Route**: Breakdown by API route

### Tokens

- **Total Tokens**: Sum of all tokens
- **Input Tokens**: Prompt tokens
- **Output Tokens**: Completion tokens
- **Tokens per Model**: Breakdown by model

## Signals and Issues

Traces may have signals indicating:
- **Errors**: Tool failures, timeouts
- **High Latency**: Slow operations
- **Cost Spikes**: Unusually expensive calls
- **Token Spikes**: Very large token usage
- **Quality Issues**: Detected quality problems

## Related Documentation

- [Dashboard Guide](./dashboard.md)
- [Sessions Guide](./sessions.md)
- [Issues Guide](./issues.md)
- [API Endpoints](../api/endpoints.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


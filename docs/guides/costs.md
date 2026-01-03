# Costs Guide

Complete guide to understanding and managing costs in Observa.

## Cost Overview

The Costs page shows spending across your AI application:
- Total cost
- Average cost per trace
- Cost breakdown by model
- Cost breakdown by route

## Viewing Costs

### Overview Page

1. Navigate to "Costs" in the dashboard
2. See cost overview with:
   - Total cost (period)
   - Average cost per trace
   - Top 10 costs by model
   - Top 10 costs by route

### Cost Breakdown

#### By Model

See which models cost the most:
- `gpt-4`: $1000.00
- `gpt-4o-mini`: $250.50
- `claude-3-opus`: $500.00

#### By Route

See which API routes cost the most:
- `/api/chat`: $1000.00
- `/api/agent`: $250.50
- `/api/assistant`: $500.00

## Cost Calculation

Costs are calculated based on:
- Model pricing (per 1K tokens)
- Input tokens
- Output tokens
- Model used

Formula: `cost = (tokens_total / 1000) * price_per_1k`

## Filtering Costs

### By Project

Select a project to see costs for that project only.

### By Time Range

- Last 24 hours
- Last 7 days
- Last 30 days
- Custom range

## Cost Optimization

### Identify High Costs

1. Check "Cost by Model" - identify expensive models
2. Check "Cost by Route" - identify expensive routes
3. Review individual traces with high costs

### Optimization Strategies

1. **Use Cheaper Models**: Switch to more cost-effective models where possible
2. **Reduce Token Usage**: Optimize prompts to use fewer tokens
3. **Cache Responses**: Cache common queries
4. **Batch Operations**: Combine operations when possible

## Cost Alerts

The dashboard alerts on:
- Cost spikes (> $10 per call)
- Unusual cost increases
- High daily costs

## Related Documentation

- [Dashboard Guide](./dashboard.md)
- [Traces Guide](./traces.md)
- [API Endpoints](../api/endpoints.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


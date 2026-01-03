# Dashboard Guide

Complete guide to using the Observa dashboard.

## Overview

The Observa dashboard provides a comprehensive view of your AI application's performance, including traces, sessions, users, issues, and costs.

## Accessing the Dashboard

1. Go to [Observa Dashboard](https://observa-app.vercel.app)
2. Log in with your credentials
3. You'll see the dashboard overview

## Dashboard Sections

### Overview Page

The main dashboard shows:

- **Error Rate**: Total errors, error rate percentage, error types
- **Latency**: P50, P95, P99, average, min, max
- **Cost**: Total cost, average per trace, breakdown by model/route
- **Active Issues**: High/medium/low severity counts
- **Tokens**: Total tokens, average per trace, input/output breakdown
- **Success Rate**: Calculated success percentage
- **Trace Count**: Total traces in the period

### Traces Page

View all traces with:
- Filtering by project, time range, issue type
- Trace details (query, response, model, latency, cost)
- Click to view full trace details
- Hierarchical span view

### Sessions Page

View user sessions:
- List of all sessions
- Filter by project, user, active status
- Session analytics
- Traces within each session

### Users Page

View users from your AI application:
- User list with metadata
- First seen / last seen timestamps
- Trace count per user
- Total cost per user
- Total tokens per user

### Issues Page

View detected issues:
- Issues timeline
- Filter by severity (high/medium/low)
- Filter by issue type
- Issue details and affected traces

### Costs Page

Monitor spending:
- Total cost overview
- Cost breakdown by model
- Cost breakdown by route
- Cost trends over time

## Time Range Filtering

Most pages support time range filtering:

- **Quick Filters**: Last 24 hours, 7 days, 30 days
- **Custom Range**: Select start and end dates
- **Default**: Usually last 24 hours or 30 days

## Project Filtering

Filter data by project:

- Select project from dropdown
- View project-specific metrics
- Compare across projects

## Alerts

The dashboard shows active alerts for:
- High-severity issues
- Medium-severity issues
- Recent errors
- Cost spikes

## Exporting Data

(Feature coming soon)

## Related Documentation

- [Traces Guide](./traces.md)
- [Sessions Guide](./sessions.md)
- [Users Guide](./users.md)
- [Issues Guide](./issues.md)
- [Costs Guide](./costs.md)
- [API Endpoints](../api/endpoints.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


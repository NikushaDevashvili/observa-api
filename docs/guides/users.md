# Users Guide

Complete guide to viewing user information in Observa.

## What are Users?

Users represent end users of your AI application (identified by `user_id` from traces). The Users page shows aggregated information about each user.

## Viewing Users

### List View

1. Navigate to "Users" in the dashboard
2. See all users with:
   - User ID
   - First seen timestamp
   - Last seen timestamp
   - Trace count
   - Total cost
   - Total tokens

### User Details

Click on a user to see:
- All traces from this user
- All sessions from this user
- User activity timeline
- Cost breakdown
- Token usage breakdown

## User Metrics

### First Seen / Last Seen

- **First Seen**: When the user first interacted with your AI
- **Last Seen**: Most recent interaction timestamp

### Trace Count

Total number of traces (conversation turns) from this user.

### Total Cost

Sum of all costs from this user's traces.

### Total Tokens

Sum of all tokens consumed by this user.

## Filtering Users

### By Project

Select a project to see only users from that project.

### By Time Range

Filter users by activity:
- Last 24 hours
- Last 7 days
- Last 30 days
- Custom range

Only users active in the selected period are shown.

## Use Cases

### User Analytics

- Identify most active users
- Find users with high costs
- Track user engagement over time

### Cost Analysis

- See cost per user
- Identify high-spending users
- Optimize costs for specific users

### Support

- View user's trace history
- Debug issues for specific users
- Understand user behavior

## Related Documentation

- [Traces Guide](./traces.md)
- [Sessions Guide](./sessions.md)
- [Costs Guide](./costs.md)
- [API Endpoints](../api/endpoints.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


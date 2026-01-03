# Sessions Guide

Complete guide to understanding sessions in Observa.

## What are Sessions?

Sessions represent a user's interaction period with your AI application. A session can contain multiple traces (conversation turns).

## Viewing Sessions

### List View

1. Navigate to "Sessions" in the dashboard
2. See all sessions with:
   - Session ID
   - User ID
   - Start time
   - End time (if ended)
   - Message count
   - Status (active/ended)

### Detail View

Click on a session to see:
- **Session Info**: ID, user, timestamps, message count
- **Traces**: All traces/messages in the session
- **Analytics**: Session-level metrics

## Session Structure

### Session Metadata

- `session_id`: Unique identifier
- `user_id`: User identifier
- `conversation_id`: Related conversation (if applicable)
- `started_at`: Session start time
- `ended_at`: Session end time (if ended)
- `message_count`: Number of traces/messages
- `status`: Active or ended

### Traces in Session

Each session contains multiple traces representing conversation turns:
- Trace 1: First user message
- Trace 2: Second user message
- Trace 3: Third user message
- etc.

## Filtering Sessions

### By Project

Select a project to see only sessions from that project.

### By User

Filter by `user_id` to see all sessions for a specific user.

### By Status

- **Active**: Currently ongoing sessions
- **Ended**: Completed sessions
- **All**: Both active and ended

### By Time Range

Filter sessions by start time:
- Last 24 hours
- Last 7 days
- Last 30 days
- Custom range

## Session Analytics

View session-level metrics:
- Total traces in session
- Total tokens used
- Total cost
- Average latency
- Error rate
- Issues detected

## Related Documentation

- [Traces Guide](./traces.md)
- [Users Guide](./users.md)
- [Dashboard Guide](./dashboard.md)
- [API Endpoints](../api/endpoints.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


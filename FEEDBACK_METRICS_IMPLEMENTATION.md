# Feedback Metrics Implementation

## Overview

This document describes the implementation of user feedback metrics tracking and display in the Observa API dashboard. This feature is **critical** for AI developers to understand system issues, as users primarily click like/dislike buttons to signal problems.

## Implementation Summary

### ✅ Completed Features

1. **Feedback Metrics Service** (`src/services/dashboardMetricsService.ts`)
   - Added `FeedbackMetrics` interface with comprehensive feedback data
   - Implemented `getFeedbackMetrics()` method that queries Tinybird for feedback events
   - Tracks: likes, dislikes, ratings, corrections, comments, outcomes
   - Calculates feedback rate (percentage of traces with feedback)
   - Calculates average rating (1-5 scale)
   - Includes PostgreSQL fallback (returns empty metrics as PostgreSQL doesn't store feedback events)

2. **Dashboard Overview Integration** (`src/routes/dashboard.ts`)
   - Added feedback metrics to `/api/v1/dashboard/overview` endpoint
   - Feedback data included in main dashboard response
   - Logs feedback metrics for debugging

3. **Dedicated Feedback Endpoint** (`src/routes/dashboard.ts`)
   - New `GET /api/v1/dashboard/feedback` endpoint
   - Returns comprehensive feedback analytics
   - Includes insights:
     - Like/dislike ratio
     - Satisfaction score
     - Negative feedback rate
     - Positive feedback rate

4. **Time-Series Integration** (`src/services/dashboardMetricsService.ts`)
   - Added feedback metrics to time-series endpoint
   - Tracks feedback trends over time (hourly/daily/weekly)
   - Includes: total feedback, likes, dislikes, feedback rate per time bucket

## API Endpoints

### 1. Dashboard Overview (Updated)
**GET** `/api/v1/dashboard/overview`

**Response includes:**
```json
{
  "metrics": {
    "feedback": {
      "total": 150,
      "likes": 120,
      "dislikes": 30,
      "ratings": 50,
      "corrections": 10,
      "feedback_rate": 15.5,
      "avg_rating": 4.2,
      "with_comments": 45,
      "by_outcome": {
        "success": 100,
        "failure": 30,
        "partial": 15,
        "unknown": 5
      },
      "by_type": {
        "like": 120,
        "dislike": 30,
        "rating": 50,
        "correction": 10
      }
    }
  }
}
```

### 2. Dedicated Feedback Endpoint (New)
**GET** `/api/v1/dashboard/feedback`

**Query Parameters:**
- `projectId` (optional): Filter by project
- `startTime` (optional): Start time (ISO 8601), defaults to 7 days ago
- `endTime` (optional): End time (ISO 8601), defaults to now

**Response:**
```json
{
  "success": true,
  "period": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-01-08T00:00:00.000Z"
  },
  "metrics": {
    "total": 150,
    "likes": 120,
    "dislikes": 30,
    "ratings": 50,
    "corrections": 10,
    "feedback_rate": 15.5,
    "avg_rating": 4.2,
    "with_comments": 45,
    "by_outcome": {
      "success": 100,
      "failure": 30,
      "partial": 15,
      "unknown": 5
    },
    "by_type": {
      "like": 120,
      "dislike": 30,
      "rating": 50,
      "correction": 10
    }
  },
  "insights": {
    "like_dislike_ratio": 4.0,
    "satisfaction_score": 85.5,
    "negative_feedback_rate": 20.0,
    "positive_feedback_rate": 80.0
  },
  "timestamp": "2024-01-08T12:00:00.000Z"
}
```

### 3. Time-Series (Updated)
**GET** `/api/v1/dashboard/overview/time-series`

**Response includes feedback in each time bucket:**
```json
{
  "series": [
    {
      "timestamp": "2024-01-01T00:00:00.000Z",
      "latency": { "p50": 100, "p95": 200, "p99": 300 },
      "error_rate": 2.5,
      "cost": 10.5,
      "tokens": 50000,
      "trace_count": 1000,
      "feedback": {
        "total": 50,
        "likes": 40,
        "dislikes": 10,
        "feedback_rate": 5.0
      }
    }
  ]
}
```

## Data Source

Feedback metrics are queried from **Tinybird's `canonical_events` table**:
- Event type: `event_type = 'feedback'`
- Feedback data stored in: `attributes_json.feedback`
- Fields:
  - `type`: "like" | "dislike" | "rating" | "correction"
  - `rating`: number (1-5 scale, for rating type)
  - `comment`: string (optional user comment)
  - `outcome`: "success" | "failure" | "partial" | null

## Implementation Details

### Security
- All queries validate UUID format for `tenant_id` and `project_id` to prevent SQL injection
- Tenant isolation enforced at query level
- Input sanitization for all user-provided parameters

### Performance
- Queries use Tinybird (OLAP) for fast aggregation
- Parallel query execution for time-series data
- Caching support (inherited from dashboard overview endpoint)
- PostgreSQL fallback for resilience (though returns empty for feedback)

### Error Handling
- Graceful fallback to PostgreSQL if Tinybird fails
- Comprehensive error logging
- Returns empty metrics structure if no data available

## Usage Examples

### Get Feedback Metrics for Last 7 Days
```bash
curl -X GET "https://api.observa.ai/api/v1/dashboard/feedback" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

### Get Feedback Metrics for Specific Project
```bash
curl -X GET "https://api.observa.ai/api/v1/dashboard/feedback?projectId=PROJECT_ID" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

### Get Feedback Metrics for Custom Time Range
```bash
curl -X GET "https://api.observa.ai/api/v1/dashboard/feedback?startTime=2024-01-01T00:00:00.000Z&endTime=2024-01-08T00:00:00.000Z" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Key Metrics Explained

1. **Feedback Rate**: Percentage of traces that received user feedback
   - Formula: `(total_feedback / total_traces) * 100`
   - Higher rate = more engaged users

2. **Like/Dislike Ratio**: Ratio of positive to negative feedback
   - Formula: `likes / dislikes`
   - Higher ratio = better user satisfaction

3. **Satisfaction Score**: Weighted score combining likes and ratings
   - Formula: `((likes + ratings * (avg_rating / 5)) / total_feedback) * 100`
   - Range: 0-100, higher = better

4. **Negative Feedback Rate**: Percentage of feedback that is negative
   - Formula: `(dislikes / total_feedback) * 100`
   - Lower = better

## Frontend Integration

The frontend can now:
1. Display feedback metrics in dashboard overview cards
2. Show feedback trends in time-series charts
3. Create dedicated feedback analytics page using `/api/v1/dashboard/feedback`
4. Alert on high negative feedback rates
5. Track satisfaction scores over time

## Next Steps (Future Enhancements)

1. **Feedback Comments Analysis**: Extract and analyze feedback comments for sentiment
2. **Feedback Correlation**: Correlate feedback with error rates, latency, etc.
3. **Feedback Alerts**: Set up alerts for high negative feedback rates
4. **Feedback Export**: Export feedback data for analysis
5. **Feedback Drill-Down**: View individual feedback events with trace context

## Testing

To test the implementation:

1. **Send feedback events** via the events API:
```json
{
  "event_type": "feedback",
  "attributes": {
    "feedback": {
      "type": "dislike",
      "comment": "Response was incorrect",
      "outcome": "failure"
    }
  }
}
```

2. **Query dashboard overview** to see feedback metrics appear
3. **Query dedicated feedback endpoint** for detailed analytics
4. **Check time-series** to see feedback trends

## Notes

- Feedback events are stored in Tinybird, not PostgreSQL
- PostgreSQL fallback returns empty metrics (by design)
- All metrics are calculated in real-time from Tinybird queries
- Feedback rate is calculated against total trace count
- Average rating only includes feedback of type "rating"


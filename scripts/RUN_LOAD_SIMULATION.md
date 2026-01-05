# Running Load Simulation with Feedback Metrics

## Quick Start

### 1. Start the API Server

```bash
cd observa-api
npm run dev
# Server should be running on http://localhost:3000
```

### 2. Get a JWT Token

You need a JWT token to run the simulation. You can get one by:

**Option A: Sign up via API**
```bash
curl -X POST http://localhost:3000/api/v1/onboarding/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "loadtest@example.com",
    "companyName": "Load Test Company"
  }'
```

This will return a `sessionToken` that you can use as the JWT_TOKEN.

**Option B: Use existing session token**
If you already have a session token from the frontend, use that.

### 3. Run the Load Simulation

```bash
# Basic usage
JWT_TOKEN=your_token node scripts/load-simulation-events.js

# Or pass as argument
node scripts/load-simulation-events.js your_jwt_token

# With custom configuration
FEEDBACK_RATE=0.40 LIKE_DISLIKE_RATE=0.80 NUM_USERS=20 \
  node scripts/load-simulation-events.js your_jwt_token
```

## Configuration Options

### Feedback-Specific Settings

- `FEEDBACK_RATE` (default: `0.30`): Percentage of traces that receive feedback (30%)
- `LIKE_DISLIKE_RATE` (default: `0.70`): Percentage of feedback that is like/dislike (70%)

### Other Settings

- `NUM_USERS` (default: `10`): Number of concurrent users
- `CONVERSATIONS_PER_USER` (default: `3`): Conversations per user
- `MIN_MESSAGES` / `MAX_MESSAGES` (default: `5-10`): Messages per conversation
- `ERROR_RATE` (default: `0.25`): Error rate (25%)
- `RATE_LIMIT_MS` (default: `100`): Delay between requests

## What the Simulation Generates

The enhanced simulation now generates:

1. **Feedback Events** (30% of traces by default):
   - **70% are likes/dislikes** (most important for issue detection)
   - **30% are ratings/corrections**
   - **Realistic comments** for likes/dislikes
   - **Error-aware**: More dislikes when errors occur
   - **Outcome correlation**: Feedback outcome matches trace outcome

2. **Feedback Distribution**:
   - When **no error**: 70% likes, 30% dislikes
   - When **error occurs**: 80% dislikes, 20% likes
   - Comments included 40% of the time

3. **Feedback Types**:
   - `like`: Positive feedback with encouraging comments
   - `dislike`: Negative feedback with problem descriptions
   - `rating`: 1-5 star ratings
   - `correction`: User corrections

## Example Output

After running, you should see:
- Total events sent
- Feedback events by type (like, dislike, rating, correction)
- Success/error statistics
- All trace IDs for verification

## Verify Feedback Metrics

After running the simulation, check the dashboard:

```bash
# Get dashboard overview (includes feedback metrics)
curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  http://localhost:3000/api/v1/dashboard/overview

# Get dedicated feedback metrics
curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  http://localhost:3000/api/v1/dashboard/feedback
```

The dashboard should show:
- Total feedback count
- Likes and dislikes
- Feedback rate percentage
- Average rating
- Breakdown by type and outcome

## Tips

1. **Higher Feedback Rate**: Set `FEEDBACK_RATE=0.50` for 50% feedback rate
2. **More Likes/Dislikes**: Set `LIKE_DISLIKE_RATE=0.90` for 90% like/dislike
3. **More Users**: Increase `NUM_USERS=50` for heavier load
4. **Faster Simulation**: Reduce `RATE_LIMIT_MS=50` for faster execution


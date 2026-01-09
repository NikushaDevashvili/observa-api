# Testing Guide for Observa

This guide will help you test the Observa system end-to-end.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **PostgreSQL** database (for control plane)
3. **Redis** (for rate limiting)
4. **Tinybird/ClickHouse** (optional for now, API works with Postgres only)

## Quick Start Testing

### 1. Start the Backend API

```bash
cd observa-api

# Install dependencies (if not already done)
npm install

# Set up environment variables (create .env file)
# See Environment Variables section below

# Run database migrations (automatically on startup)
# Or manually: npm run migrate

# Start the API server
npm run dev
# Server runs on http://localhost:3000
```

### 2. Start the Frontend App

```bash
cd observa-app

# Install dependencies (if not already done)
npm install

# Set up environment variables (create .env.local file)
# See Environment Variables section below

# Start the Next.js dev server
npm run dev
# App runs on http://localhost:3001
```

### 3. Test the System

#### Option A: Use the SDK (Recommended)

Create a test script to send traces:

```bash
cd observa-sdk

# Install dependencies
npm install

# Create a test file: test-trace.js
```

See `TEST_TRACE_SCRIPT.md` for a complete test script.

#### Option B: Use cURL/HTTP

Send test traces directly via HTTP:

```bash
# Get an API key from the auth signup endpoint first
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test-password-123",
    "companyName": "Test Company"
  }'

# Use the returned JWT token to send traces
curl -X POST http://localhost:3000/api/v1/traces/ingest \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "traceId": "test-trace-123",
    "query": "What is the weather today?",
    "response": "The weather is sunny and warm.",
    "model": "gpt-4",
    "tokensTotal": 150,
    "latencyMs": 1200
  }'
```

## Environment Variables

### observa-api/.env

```env
# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/observa

# JWT Secret (generate a random string)
JWT_SECRET=your-secret-key-here

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379

# Tinybird (optional - can be skipped for initial testing)
TINYBIRD_HOST=https://api.tinybird.co
TINYBIRD_ADMIN_TOKEN=your-token
TINYBIRD_DATASOURCE_NAME=canonical_events

# API Port (default: 3000)
PORT=3000

# Sentry (optional)
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
```

### observa-app/.env.local

```env
# Backend API URL
API_URL=http://localhost:3000

# Next.js (defaults are fine)
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

## Testing Checklist

### Backend API Tests

- [ ] **Health Check**
  ```bash
  curl http://localhost:3000/health
  ```

- [ ] **Authentication Flow**
  - Create a new user/tenant via signup
  - Verify JWT token is returned
  - Check database for new records

- [ ] **Trace Ingestion**
  - Send a trace via POST /api/v1/traces/ingest
  - Verify 200 response
  - Check database for trace data
  - Check analysis_results table

- [ ] **Trace Querying**
  - GET /api/v1/traces (list traces)
  - GET /api/v1/traces/:traceId (single trace)
  - Verify authentication works
  - Test pagination
  - Test filtering by issue type

- [ ] **Rate Limiting**
  - Send multiple requests rapidly
  - Verify 429 response after limit

- [ ] **API Key Validation**
  - Test with invalid key → 401
  - Test with valid key → success

### Frontend App Tests

- [ ] **Login/Authentication**
  - Access dashboard requires auth
  - Session persists

- [ ] **Dashboard Home**
  - Statistics cards display
  - Recent traces table shows data
  - Links work correctly

- [ ] **Traces Page**
  - Traces list loads
  - Filters work (all, hallucinations, etc.)
  - Table sorting works
  - Click trace → navigate to detail page
  - Pagination works

- [ ] **Trace Detail Page**
  - All trace data displays
  - Analysis results show
  - Query/Context/Response render safely (XSS protection)
  - Navigation back works

- [ ] **Issues Page**
  - Issues aggregate correctly
  - Statistics display
  - Filtering works
  - Click issue → navigate to trace

- [ ] **UI Components**
  - Dark mode toggle (if implemented)
  - Sidebar navigation works
  - Cards, tables, badges render correctly
  - Responsive design on mobile

### Security Tests

- [ ] **XSS Protection**
  - Send trace with `<script>alert('xss')</script>` in query/response
  - Verify it's sanitized in UI (should not execute)

- [ ] **API Key Security**
  - Test publishable key (pk_) with origin restriction
  - Test server key (sk_) without restrictions
  - Verify unauthorized requests are rejected

- [ ] **Rate Limiting**
  - Verify Redis-based rate limiting works
  - Check quota enforcement

## Common Issues

### Database Connection Errors

- Verify PostgreSQL is running: `pg_isready`
- Check DATABASE_URL format
- Ensure database exists
- Check user permissions

### Redis Connection Errors

- Verify Redis is running: `redis-cli ping`
- Check REDIS_URL format
- Rate limiting will fail silently without Redis (check logs)

### Frontend Can't Connect to API

- Verify API_URL in .env.local
- Check CORS settings in API
- Verify API is running on correct port
- Check browser console for errors

### No Traces Showing

- Verify trace ingestion succeeded (check API logs)
- Check database for data
- Verify authentication token is valid
- Check tenant_id matches

## Next Steps After Testing

1. **Create Test Data Script** - Automate trace generation
2. **Integration Tests** - Automated test suite
3. **Load Testing** - Test with high volume of traces
4. **Performance Monitoring** - Add metrics/observability

## Need Help?

- Check logs in both API and frontend consoles
- Verify database contains expected data
- Test API endpoints directly with cURL first
- Check browser DevTools Network tab for API calls


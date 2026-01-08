# Environment Setup Guide

Complete guide to setting up environment variables for Observa.

## Quick Checklist

### Required Environment Variables for `observa-api`:
- ✅ `DATABASE_URL` - PostgreSQL connection string (required)
- ✅ `TINYBIRD_ADMIN_TOKEN` - From Tinybird dashboard (required)
- ✅ `TINYBIRD_HOST` - Your Tinybird region URL (required)
- ✅ `JWT_SECRET` - Generate a random secret (32+ characters, required)

### Optional Environment Variables:
- ⚪ `NODE_ENV` - Environment: `development`, `production`, or `test` (default: `development`)
- ⚪ `PORT` - Server port (default: `3000`)
- ⚪ `TINYBIRD_DATASOURCE_NAME` - Traces datasource name (default: `traces`)
- ⚪ `TINYBIRD_CANONICAL_EVENTS_DATASOURCE` - Canonical events datasource (default: `canonical_events`)
- ⚪ `JWT_EXPIRES_IN` - JWT expiration time (default: `90d`)
- ⚪ `SENTRY_DSN` - Sentry error monitoring DSN (optional)
- ⚪ `SENTRY_ENVIRONMENT` - Sentry environment (default: `production`)
- ⚪ `REDIS_URL` - Redis connection URL (optional, for analysis queue)
- ⚪ `UPSTASH_REDIS_URL` - Upstash Redis URL (optional, alternative to REDIS_URL)
- ⚪ `ANALYSIS_SERVICE_URL` - Python ML analysis service URL (optional)
- ⚪ `FRONTEND_URL` - Frontend application URL (optional)
- ⚪ `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins (optional)

### For `observa-app` (Frontend):
- ✅ `NEXT_PUBLIC_API_URL` - Your observa-api Vercel URL
- ✅ `NEXT_PUBLIC_SENTRY_DSN` - From Sentry dashboard (optional)

---

## Detailed Instructions

### 1. DATABASE_URL

**What it is:** PostgreSQL connection string

**Where to get it:**

#### Option A: Vercel Postgres (Recommended)
1. Go to Vercel Dashboard → Your Project → Storage
2. Create Postgres database
3. Copy `POSTGRES_URL` from `.env.local` tab

**Format:** `postgres://default:xxxxx@xxxxx.vercel-storage.com:5432/verceldb`

#### Option B: Supabase
1. Go to Supabase → Settings → Database
2. Copy connection string (URI)
3. Replace `[YOUR-PASSWORD]` with your password

**Format:** `postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

#### Option C: Neon
1. Go to Neon Dashboard → Connection Details
2. Copy connection string

**Format:** `postgresql://user:password@xxxxx.neon.tech/dbname?sslmode=require`

---

### 2. TINYBIRD_ADMIN_TOKEN

**What it is:** Tinybird admin token for data ingestion

**Where to get it:**
1. Go to [Tinybird Dashboard](https://ui.tinybird.co)
2. Profile icon → Tokens
3. Create or copy Admin Token

---

### 3. TINYBIRD_HOST

**What it is:** Tinybird API host URL

**Default:** `https://api.europe-west2.gcp.tinybird.co`

**Other regions:**
- US East: `https://api.us-east-1.aws.tinybird.co`
- EU West 1: `https://api.europe-west1.gcp.tinybird.co`

---

### 4. JWT_SECRET

**What it is:** Secret for signing JWT tokens (must be 32+ characters)

**Generate:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or:
```bash
openssl rand -hex 32
```

---

### 5. SENTRY_DSN (Optional)

**What it is:** Sentry error monitoring DSN

**Where to get it:**
1. Go to [Sentry.io](https://sentry.io)
2. Create project (Node.js for API, Next.js for app)
3. Copy DSN from project settings

---

### 6. REDIS_URL / UPSTASH_REDIS_URL (Optional)

**What it is:** Redis connection URL for analysis job queue

**Where to get it:**

#### Option A: Upstash Redis (Recommended for Vercel)
1. Go to [Upstash Console](https://console.upstash.com)
2. Create Redis database
3. Copy `UPSTASH_REDIS_URL` from connection details

#### Option B: Redis Cloud / Self-hosted
1. Get Redis connection string from your provider
2. Format: `redis://username:password@host:port`

**Note:** Redis is optional but required for:
- Analysis job queue (`/api/v1/analysis/*`)
- Queue statistics (`/api/v1/analysis/queue/stats`)

If Redis is not configured, analysis features will gracefully degrade.

---

### 7. ANALYSIS_SERVICE_URL (Optional)

**What it is:** Python ML analysis service URL

**Where to get it:**
1. Deploy Python service (Railway, Render, Fly.io)
2. Copy the service URL (must have `/health` endpoint)
3. Use as `ANALYSIS_SERVICE_URL`

**Note:** Required for ML-based analysis features (hallucination detection, quality scoring, etc.)

---

### 8. TINYBIRD_DATASOURCE_NAME (Optional)

**What it is:** Name of the Tinybird datasource for traces

**Default:** `traces`

**Change only if:** You use a different datasource name in Tinybird

---

### 9. TINYBIRD_CANONICAL_EVENTS_DATASOURCE (Optional)

**What it is:** Name of the Tinybird datasource for canonical events

**Default:** `canonical_events`

**Change only if:** You use a different datasource name in Tinybird

---

### 10. SENTRY_ENVIRONMENT (Optional)

**What it is:** Environment name for Sentry error tracking

**Default:** `production`

**Options:** `development`, `staging`, `production`

---

### 11. FRONTEND_URL (Optional)

**What it is:** Frontend application URL for CORS and redirects

**Example:** `https://observa-app.vercel.app`

---

### 12. ALLOWED_ORIGINS (Optional)

**What it is:** Comma-separated list of allowed CORS origins

**Example:** `https://observa-app.vercel.app,https://app.observa.ai`

**Note:** In production, if not set and `NODE_ENV=production`, all origins are allowed for authenticated endpoints.

---

## Setting Environment Variables

### Local Development

Create `.env` file:

```env
# Required
DATABASE_URL=postgresql://user:password@host:port/database
TINYBIRD_ADMIN_TOKEN=your-tinybird-admin-token
TINYBIRD_HOST=https://api.europe-west2.gcp.tinybird.co
JWT_SECRET=your-32-character-secret-minimum-32-chars-long

# Optional
NODE_ENV=development
PORT=3000
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
SENTRY_ENVIRONMENT=development
REDIS_URL=redis://localhost:6379
# OR
UPSTASH_REDIS_URL=https://your-upstash-redis-url
ANALYSIS_SERVICE_URL=https://your-analysis-service.railway.app
FRONTEND_URL=http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3000
```

### Vercel Deployment

1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add each variable
3. Select environments (Production, Preview, Development)
4. Save

---

## Verification

### Test Database Connection

```bash
curl https://your-api.vercel.app/health/detailed
```

Check `services.database.status` should be `"healthy"`

### Test Tinybird Connection

Check health endpoint - `services.tinybird.status` should be `"healthy"`

### Test Redis Connection (if configured)

Check health endpoint - `services.redis.status` should be `"healthy"` if Redis is configured

### Test Analysis Service (if configured)

Check health endpoint - `services.analysis_service.status` should be `"healthy"` if configured

### Verify Environment Variables

```bash
curl https://your-api.vercel.app/diagnostics
```

This returns environment variable status without sensitive values.

---

## Related Documentation

- [Deployment Guide](./deployment.md)
- [Quick Reference](../../ENV_QUICK_REFERENCE.md)
- [Full Setup Guide](../../ENV_SETUP_GUIDE.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).





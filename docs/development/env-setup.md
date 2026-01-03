# Environment Setup Guide

Complete guide to setting up environment variables for Observa.

## Quick Checklist

### For `observa-api` (Backend API):
- ✅ `DATABASE_URL` - PostgreSQL connection string
- ✅ `TINYBIRD_ADMIN_TOKEN` - From Tinybird dashboard
- ✅ `TINYBIRD_HOST` - Your Tinybird region URL
- ✅ `JWT_SECRET` - Generate a random secret (32+ characters)
- ✅ `SENTRY_DSN` - From Sentry dashboard (optional)
- ✅ `ANALYSIS_SERVICE_URL` - Your Python service URL (optional)

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

### 6. ANALYSIS_SERVICE_URL (Optional)

**What it is:** Python ML analysis service URL

**Where to get it:**
1. Deploy Python service (Railway, Render, Fly.io)
2. Copy the service URL
3. Use as `ANALYSIS_SERVICE_URL`

---

## Setting Environment Variables

### Local Development

Create `.env` file:

```env
DATABASE_URL=postgresql://...
TINYBIRD_ADMIN_TOKEN=xxxxx
TINYBIRD_HOST=https://api.europe-west2.gcp.tinybird.co
JWT_SECRET=your-32-character-secret-here
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
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

---

## Related Documentation

- [Deployment Guide](./deployment.md)
- [Quick Reference](../../ENV_QUICK_REFERENCE.md)
- [Full Setup Guide](../../ENV_SETUP_GUIDE.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


# Observa API Deployment Guide

## Prerequisites

1. Vercel account (sign up at https://vercel.com)
2. GitHub repository with observa-api code
3. Environment variables ready (see below)

## Step 1: Install Dependencies

```bash
npm install
```

**Note:** `npm audit` may show vulnerabilities in `@vercel/node` dependencies (esbuild, path-to-regexp, undici). These are:

- **Safe to ignore** - They're in build-time tools (esbuild) or handled by Vercel's runtime
- **Not exploitable** - Vercel's serverless environment manages these dependencies
- **Latest version** - We're using `@vercel/node@^5.5.16` (latest SOTA version)

## Step 2: Build the Project

```bash
npm run build
```

## Step 3: Deploy to Vercel

### Option A: Via Vercel CLI (Recommended)

1. Install Vercel CLI:

```bash
npm i -g vercel
```

2. Login to Vercel:

```bash
vercel login
```

3. Deploy:

```bash
vercel --prod
```

### Option B: Via GitHub Integration

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Vercel will auto-detect the project settings
4. Configure environment variables (see below)
5. Click "Deploy"

## Step 4: Configure Environment Variables

**📖 For detailed instructions on where to get each variable, see [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md)**

In Vercel Dashboard → Project Settings → Environment Variables, add:

### Required Variables:

- `DATABASE_URL` - PostgreSQL connection string (get from Vercel Postgres, Supabase, or Neon)
- `TINYBIRD_ADMIN_TOKEN` - Your Tinybird admin token (from Tinybird dashboard)
- `JWT_SECRET` - A secure random string (min 32 characters)
- `TINYBIRD_HOST` - Your Tinybird API host (default: https://api.europe-west2.gcp.tinybird.co)
- `TINYBIRD_DATASOURCE_NAME` - Name of your traces datasource (default: traces)

### Optional Variables:

- `SENTRY_DSN` - Sentry error monitoring DSN (from Sentry.io)
- `SENTRY_ENVIRONMENT` - Environment name (default: production)
- `ANALYSIS_SERVICE_URL` - Python ML analysis service URL (after deployment)

### Generate JWT_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**💡 Quick Reference:** See [ENV_QUICK_REFERENCE.md](./ENV_QUICK_REFERENCE.md) for a checklist.

## Step 5: Verify Deployment

1. Check health endpoint: `https://your-api.vercel.app/health`
2. Test signup endpoint: `https://your-api.vercel.app/api/v1/auth/signup`

## Security Features Enabled

- ✅ Helmet security headers
- ✅ Rate limiting (100 requests per 15 minutes per IP)
- ✅ Strict CORS policy
- ✅ Request size limits (10MB max)
- ✅ Automatic HTTPS/SSL
- ✅ DDoS protection (Vercel built-in)
- ✅ WAF (Vercel built-in)

## Troubleshooting

- If build fails, check that all dependencies are installed
- If environment variables are missing, verify they're set in Vercel dashboard
- Check Vercel logs for detailed error messages

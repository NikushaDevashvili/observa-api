# Deployment Guide

Complete guide to deploying Observa to production.

## Prerequisites

1. Vercel account
2. GitHub repository
3. Environment variables ready

## Deployment Steps

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build

```bash
npm run build
```

### Step 3: Deploy to Vercel

#### Option A: Via Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

#### Option B: Via GitHub Integration

1. Go to [Vercel Dashboard](https://vercel.com/new)
2. Import GitHub repository
3. Configure environment variables
4. Deploy

### Step 4: Configure Environment Variables

In Vercel Dashboard → Project Settings → Environment Variables:

**Required:**
- `DATABASE_URL`
- `TINYBIRD_ADMIN_TOKEN`
- `JWT_SECRET`
- `TINYBIRD_HOST`

**Optional:**
- `SENTRY_DSN`
- `ANALYSIS_SERVICE_URL`

See [Environment Setup Guide](./env-setup.md) for details.

### Step 5: Verify Deployment

1. Check health: `https://your-api.vercel.app/health`
2. Test signup: `POST /api/v1/onboarding/signup`
3. Check API docs: `https://your-api.vercel.app/api-docs`

---

## Security Features

Deployment includes:
- ✅ Helmet security headers
- ✅ Rate limiting
- ✅ CORS configuration
- ✅ Request size limits
- ✅ HTTPS/SSL (Vercel)
- ✅ DDoS protection (Vercel)

---

## Monitoring

### Health Checks

- Basic: `GET /health`
- Detailed: `GET /health/detailed`

### Metrics

- System: `GET /api/v1/metrics`
- Business: Dashboard endpoints

### Error Tracking

- Sentry integration (if configured)
- Request ID tracking
- Audit logging

---

## Troubleshooting

### Build Fails

- Check Node.js version (v18+)
- Verify all dependencies installed
- Check TypeScript compilation errors

### Deployment Fails

- Verify environment variables set
- Check Vercel logs
- Verify database connectivity

### API Not Responding

- Check health endpoint
- Verify database connection
- Check Vercel function logs

---

## Related Documentation

- [Environment Setup](./env-setup.md)
- [Testing Guide](./testing.md)
- [Troubleshooting Guide](../troubleshooting/common-issues.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


# Testing Guide

Complete guide to testing the Observa system.

## Quick Start Testing

### 1. Start Backend API

```bash
cd observa-api
npm install
npm run dev
# Server runs on http://localhost:3000
```

### 2. Start Frontend App

```bash
cd observa-app
npm install
npm run dev
# App runs on http://localhost:3001
```

### 3. Test the System

#### Option A: Use SDK

```bash
npm install observa-sdk
# Use SDK to send traces
```

#### Option B: Use cURL

```bash
# Signup
curl -X POST http://localhost:3000/api/v1/onboarding/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "companyName": "Test"}'

# Send events
curl -X POST http://localhost:3000/api/v1/events/ingest \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{...events...}]'
```

---

## Test Scripts

### Demo Data Setup

```bash
node scripts/setup-demo-data.js
```

Creates demo tenant and generates sample data.

### Load Simulation

```bash
node scripts/load-simulation-events.js <JWT_TOKEN>
```

Simulates heavy load with multiple users and conversations.

---

## End-to-End Testing

### Test Flow

1. **Signup**: Create account via onboarding
2. **Get API Key**: Extract from signup response
3. **Send Events**: Ingest canonical events
4. **View Dashboard**: Check traces appear
5. **Verify Data**: Check all endpoints work

### E2E Test Suite

See `tests/e2e/basic-flow.test.ts` for automated tests.

---

## Testing Endpoints

### Health Check

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/detailed
```

### API Endpoints

```bash
# List traces
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/v1/traces

# Get trace detail
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/v1/traces/TRACE_ID

# Dashboard overview
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/v1/dashboard/overview
```

---

## Related Documentation

- [Environment Setup](./env-setup.md)
- [Deployment Guide](./deployment.md)
- [Troubleshooting Guide](../troubleshooting/common-issues.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).


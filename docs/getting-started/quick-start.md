# Quick Start Guide

Get up and running with Observa in 5 minutes.

## Step 1: Sign Up

### Option A: Via Dashboard

1. Go to [Observa Dashboard](https://observa-app.vercel.app)
2. Click "Sign Up"
3. Enter your email and company name
4. Complete signup

### Option B: Via API

```bash
curl -X POST https://observa-api.vercel.app/api/v1/onboarding/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "companyName": "Your Company",
    "plan": "free"
  }'
```

Save the `apiKey` from the response.

## Step 2: Install SDK

```bash
npm install observa-sdk
```

## Step 3: Initialize SDK

```typescript
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});
```

## Step 4: Send Your First Trace

```typescript
// Start trace
const traceId = observa.startTrace({
  userId: "user-123",
  name: "My First Trace",
});

// Track LLM call
observa.trackLLMCall({
  model: "gpt-4",
  input: "Hello!",
  output: "Hi there!",
  tokensTotal: 30,
  latencyMs: 1200,
});

// End trace (sends events)
await observa.endTrace();
```

## Step 5: View in Dashboard

1. Go to [Observa Dashboard](https://observa-app.vercel.app)
2. Navigate to "Traces"
3. See your trace appear within seconds

## Next Steps

- [Full Onboarding Guide](./onboarding.md)
- [SDK Installation](./../sdk/installation.md)
- [Dashboard Guide](./../guides/dashboard.md)

---

**That's it!** You're now tracking your AI applications with Observa.

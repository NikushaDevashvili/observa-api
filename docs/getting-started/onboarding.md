# Customer Onboarding Guide

Complete step-by-step guide to get started with Observa.

> **See also**: [Quick Start Guide](./quick-start.md) for a 5-minute version

## Overview

This guide walks you through:
1. Creating an account
2. Getting your API key
3. Installing the SDK
4. Sending your first trace
5. Viewing data in the dashboard

**Time to complete**: ~10 minutes

---

## Step 1: Sign Up for an Account

### Option A: Via API (For Developers)

Use the onboarding endpoint to create an account programmatically:

```bash
curl -X POST https://observa-api.vercel.app/api/v1/onboarding/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "companyName": "Your Company Name",
    "plan": "free"
  }'
```

**Response:**
```json
{
  "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tenantId": "abc-123-...",
  "projectId": "def-456-...",
  "environment": "prod",
  "message": "Welcome! Your API key is ready to use."
}
```

**Save these values:**
- `apiKey` - Your API key for SDK authentication
- `tenantId` - Your tenant identifier
- `projectId` - Your project identifier

### Option B: Via Dashboard

1. Go to [Observa Dashboard](https://observa-app.vercel.app)
2. Click "Sign Up"
3. Enter your email and company name
4. Complete the signup process
5. You'll receive your API key via email or in the dashboard

---

## Step 2: Get Your API Key

### If You Signed Up Via API

Your API key was returned in the signup response. Save it securely:

```bash
# Save to environment variable
export OBSERVA_API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### If You Signed Up Via Dashboard

1. Log in to the dashboard
2. Go to Settings → API Keys
3. Copy your API key
4. Save it securely (never commit to version control)

### Verify Your API Key

Test that your API key works:

```bash
curl -X GET https://observa-api.vercel.app/api/v1/auth/account \
  -H "Authorization: Bearer YOUR_API_KEY"
```

You should see your account information.

---

## Step 3: Install the SDK

### Node.js/TypeScript

```bash
npm install observa-sdk
```

Or with yarn:

```bash
yarn add observa-sdk
```

### Verify Installation

```bash
npm list observa-sdk
```

---

## Step 4: Initialize the SDK

Create a file `observa-setup.ts`:

```typescript
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
  apiUrl: "https://observa-api.vercel.app",
  environment: "prod",
  agentName: "my-ai-app",
  version: "1.0.0",
});

export default observa;
```

### Environment Variables

Create a `.env` file:

```env
OBSERVA_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OBSERVA_API_URL=https://observa-api.vercel.app
```

**⚠️ Security**: Never commit `.env` files to version control.

---

## Step 5: Send Your First Trace

### Basic Example

```typescript
import observa from "./observa-setup";

async function sendFirstTrace() {
  const traceId = observa.startTrace({
    userId: "user-123",
    conversationId: "conv-456",
    name: "First Trace",
  });

  try {
    const response = await yourLLMCall("Hello, world!");

    observa.trackLLMCall({
      model: "gpt-4",
      input: "Hello, world!",
      output: response,
      tokensPrompt: 10,
      tokensCompletion: 20,
      tokensTotal: 30,
      latencyMs: 1200,
    });

    await observa.endTrace();
    console.log(`Trace ${traceId} sent successfully!`);
  } catch (error) {
    observa.trackError({
      errorType: "llm_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
  }
}
```

---

## Step 6: View Data in Dashboard

### Access the Dashboard

1. Go to [Observa Dashboard](https://observa-app.vercel.app)
2. Log in with your account credentials
3. You should see your traces appear within a few seconds

### What to Look For

1. **Traces Page**: See all your traces
2. **Dashboard Overview**: Key metrics (error rate, latency, cost)
3. **Sessions**: View user sessions
4. **Users**: See all users from your AI application
5. **Issues**: View detected issues
6. **Costs**: Monitor spending

---

## Next Steps

1. **Integrate with Your Application**: Wrap your LLM calls with Observa tracking
2. **Set Up Monitoring**: Configure alerts for high error rates
3. **Explore Advanced Features**: Conversations, sessions, signals

---

## Related Documentation

- [SDK Installation Guide](./../sdk/installation.md)
- [SDK Implementation Examples](./../sdk/examples.md)
- [Dashboard Guide](./../guides/dashboard.md)
- [Troubleshooting Guide](./../troubleshooting/common-issues.md)

---

## Support

- **Documentation**: Check other guides in this knowledge hub
- **Issues**: Report on GitHub
- **Email**: support@observa.ai


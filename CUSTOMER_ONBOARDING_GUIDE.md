# Customer Onboarding Guide

Step-by-step guide to get started with Observa.

## Overview

This guide will walk you through:
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
curl -X POST https://your-api.vercel.app/api/v1/onboarding/signup \
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

### Option B: Via Dashboard (If Available)

1. Go to [Observa Dashboard](https://your-dashboard-url.com)
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
curl -X GET https://your-api.vercel.app/api/v1/auth/account \
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

### Python (If Available)

```bash
pip install observa-sdk
```

### Verify Installation

```bash
# Node.js
npm list observa-sdk

# Python
pip show observa-sdk
```

---

## Step 4: Initialize the SDK

### Node.js/TypeScript

Create a file `observa-setup.ts`:

```typescript
import ObservaSDK from 'observa-sdk';

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!, // Your API key from Step 2
  apiUrl: 'https://your-api.vercel.app', // Your API URL
  environment: 'prod',
  agentName: 'my-ai-app', // Name of your application
  version: '1.0.0', // Version of your application
});

export default observa;
```

### Environment Variables

Create a `.env` file:

```env
OBSERVA_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OBSERVA_API_URL=https://your-api.vercel.app
```

**⚠️ Security**: Never commit `.env` files to version control. Add `.env` to `.gitignore`.

---

## Step 5: Send Your First Trace

### Basic Example

```typescript
import observa from './observa-setup';

async function sendFirstTrace() {
  // Start a trace
  const traceId = observa.startTrace({
    userId: 'user-123',
    conversationId: 'conv-456',
    name: 'First Trace',
  });

  try {
    // Simulate an LLM call
    const response = await yourLLMCall('Hello, world!');

    // Track the LLM call
    observa.trackLLMCall({
      model: 'gpt-4',
      input: 'Hello, world!',
      output: response,
      tokensPrompt: 10,
      tokensCompletion: 20,
      tokensTotal: 30,
      latencyMs: 1200,
    });

    // End the trace (this sends events to Observa)
    await observa.endTrace();
    
    console.log(`Trace ${traceId} sent successfully!`);
  } catch (error) {
    // Track errors
    observa.trackError({
      errorType: 'llm_error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    await observa.endTrace();
  }
}

sendFirstTrace();
```

### With OpenAI SDK

```typescript
import OpenAI from 'openai';
import observa from './observa-setup';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function chatWithObserva(userMessage: string) {
  const traceId = observa.startTrace({
    userId: 'user-123',
    name: 'Chat Completion',
  });

  try {
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: userMessage }],
    });

    const latency = Date.now() - startTime;

    observa.trackLLMCall({
      model: response.model,
      input: userMessage,
      output: response.choices[0].message.content || '',
      tokensPrompt: response.usage.prompt_tokens,
      tokensCompletion: response.usage.completion_tokens,
      tokensTotal: response.usage.total_tokens,
      latencyMs: latency,
    });

    await observa.endTrace();
    return response.choices[0].message.content;
  } catch (error) {
    observa.trackError({
      errorType: 'openai_error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    await observa.endTrace();
    throw error;
  }
}
```

---

## Step 6: View Data in Dashboard

### Access the Dashboard

1. Go to [Observa Dashboard](https://your-dashboard-url.com)
2. Log in with your account credentials
3. You should see your traces appear within a few seconds

### What to Look For

1. **Traces Page**: See all your traces
   - Filter by project, time range, issue type
   - Click on a trace to see details

2. **Dashboard Overview**: Key metrics
   - Error rate
   - Latency (P50, P95, P99)
   - Cost breakdown
   - Active issues
   - Token usage

3. **Sessions**: View user sessions
   - See conversations grouped by session
   - Track user journeys

4. **Users**: See all users from your AI application
   - User activity
   - Trace counts per user
   - Cost per user

5. **Issues**: View detected issues
   - High/medium/low severity
   - Filter by issue type
   - See affected traces

6. **Costs**: Monitor spending
   - Total cost
   - Cost by model
   - Cost by route

---

## Next Steps

### 1. Integrate with Your Application

- Wrap your LLM calls with Observa tracking
- Add error tracking
- Track tool calls and retrievals
- See [SDK_IMPLEMENTATION_EXAMPLE.md](./SDK_IMPLEMENTATION_EXAMPLE.md) for examples

### 2. Set Up Monitoring

- Configure alerts for high error rates
- Monitor latency spikes
- Track cost trends
- Set up notifications

### 3. Explore Advanced Features

- **Conversations**: Group related traces
- **Sessions**: Track user sessions
- **Signals**: Automatic issue detection
- **Analysis**: ML-powered insights

### 4. Read Documentation

- [SDK Installation Guide](./SDK_INSTALLATION_GUIDE.md) - Detailed SDK setup
- [SDK Migration Guide](./SDK_MIGRATION_GUIDE.md) - Advanced SDK usage
- [Troubleshooting Guide](./TROUBLESHOOTING_GUIDE.md) - Common issues and solutions

---

## Troubleshooting

### Traces Not Appearing

1. **Check API Key**: Verify your API key is correct
2. **Check Endpoint**: Ensure events are sent to `/api/v1/events/ingest`
3. **Check `endTrace()`**: Events are sent when trace ends
4. **Check Network**: Verify requests are reaching the API
5. **Check Dashboard**: Wait a few seconds for data to appear

### API Key Errors

1. **401 Unauthorized**: API key is invalid or expired
2. **403 Forbidden**: API key doesn't have required permissions
3. **Solution**: Generate a new API key from dashboard

### SDK Errors

1. **Import Errors**: Ensure SDK is installed correctly
2. **Type Errors**: Check TypeScript version (4.5+)
3. **Runtime Errors**: Check SDK version compatibility

See [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md) for more help.

---

## Support

- **Documentation**: Check other guides in this repository
- **Issues**: Report on GitHub
- **Email**: support@observa.ai (if available)

---

## Quick Reference

### API Endpoints

- **Signup**: `POST /api/v1/onboarding/signup`
- **Ingest Events**: `POST /api/v1/events/ingest`
- **Get Traces**: `GET /api/v1/traces`
- **Get Dashboard**: `GET /api/v1/dashboard/overview`

### Environment Variables

```env
OBSERVA_API_KEY=your-api-key-here
OBSERVA_API_URL=https://your-api.vercel.app
OBSERVA_ENVIRONMENT=prod
```

### SDK Methods

```typescript
observa.startTrace(options)      // Start a trace
observa.trackLLMCall(data)       // Track LLM call
observa.trackToolCall(data)      // Track tool call
observa.trackRetrieval(data)     // Track retrieval
observa.trackError(data)         // Track error
observa.endTrace()               // End and send trace
```

---

**Congratulations!** You're now set up with Observa. Start tracking your AI applications and gain insights into performance, costs, and issues.




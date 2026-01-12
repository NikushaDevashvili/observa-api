# SDK Installation Guide

Complete guide for installing and setting up the Observa SDK in your application.

## Quick Start

### 1. Install the SDK

```bash
npm install observa-sdk
```

Or with yarn:

```bash
yarn add observa-sdk
```

Or with pnpm:

```bash
pnpm add observa-sdk
```

### 2. Get Your API Key

You can get your API key in two ways:

**Option A: Via Dashboard Settings**

1. Sign up and log in to [Observa Dashboard](https://your-dashboard-url.com)
2. Go to Settings → API Keys
3. Create a new API key or copy an existing one
4. **Important**: When copying an API key from the dashboard (format: `sk_...` or `pk_...`), you'll also need to note your `tenantId` and `projectId` from the settings page, or use Option B below

**Option B: Via Auth Signup Endpoint (JWT format)**

```bash
curl -X POST https://your-api.vercel.app/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "your-secure-password",
    "companyName": "Your Company",
    "plan": "free"
  }'
```

Response includes `apiKey` (JWT format) - save this for SDK initialization.

### 3. Initialize the SDK

**If you have a JWT-formatted API key** (from signup endpoint):

```typescript
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!, // JWT-formatted key (auto-detects tenant/project)
  apiUrl: "https://your-api.vercel.app", // Optional, defaults to production
  environment: "prod", // 'dev' or 'prod'
  agentName: "my-ai-app", // Optional: name of your application
  version: "1.0.0", // Optional: version of your application
});
```

**If you have a legacy API key** (from dashboard: `sk_...` or `pk_...` format):

```typescript
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!, // sk_... or pk_... format
  tenantId: process.env.OBSERVA_TENANT_ID!, // Required for legacy keys
  projectId: process.env.OBSERVA_PROJECT_ID, // Optional, can be null for tenant-level keys
  apiUrl: "https://your-api.vercel.app",
  environment: "prod",
  agentName: "my-ai-app",
  version: "1.0.0",
});
```

**💡 Tip**: The SDK can automatically resolve `tenantId` and `projectId` from legacy API keys. If you don't provide them, the SDK will call the `/api/v1/api-keys/resolve` endpoint automatically (requires an internet connection during initialization).

### 4. Send Your First Trace

```typescript
// Start a trace
const traceId = observa.startTrace({
  conversationId: "conv-123", // Optional: group related traces
  sessionId: "session-456", // Optional: browser/app session
  userId: "user-789", // Optional: end user identifier
  name: "Customer Support Chat", // Optional: trace name
});

try {
  // Track an LLM call
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello!" }],
  });

  observa.trackLLMCall({
    model: "gpt-4",
    input: "Hello!",
    output: response.choices[0].message.content,
    tokensPrompt: response.usage.prompt_tokens,
    tokensCompletion: response.usage.completion_tokens,
    tokensTotal: response.usage.total_tokens,
    latencyMs: Date.now() - startTime,
  });

  // End the trace
  await observa.endTrace();
} catch (error) {
  // Track errors
  observa.trackError({
    errorType: "llm_error",
    errorMessage: error.message,
    stack: error.stack,
  });
  await observa.endTrace();
}
```

## Environment Configuration

### Recommended: Environment Variables

Create a `.env` file:

```env
# If using JWT-formatted API key (from signup):
OBSERVA_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# If using legacy API key (from dashboard - sk_ or pk_ format):
OBSERVA_API_KEY=sk_...
OBSERVA_TENANT_ID=your-tenant-id-here
OBSERVA_PROJECT_ID=your-project-id-here  # Optional, can be null for tenant-level keys

# Common settings:
OBSERVA_API_URL=https://your-api.vercel.app
OBSERVA_ENVIRONMENT=prod
```

Then in your code:

```typescript
const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
  apiUrl: process.env.OBSERVA_API_URL,
  environment: process.env.OBSERVA_ENVIRONMENT as "dev" | "prod",
});
```

### Alternative: Direct Configuration

```typescript
const observa = new ObservaSDK({
  apiKey: "your-api-key-here",
  // ... other options
});
```

**⚠️ Security Note**: Never commit API keys to version control. Always use environment variables.

## Complete Example

### Node.js/TypeScript

```typescript
import ObservaSDK from "observa-sdk";
import OpenAI from "openai";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
  agentName: "customer-support-bot",
  version: "1.0.0",
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function handleUserQuery(userQuery: string, userId: string) {
  // Start trace
  const traceId = observa.startTrace({
    userId,
    conversationId: `conv-${userId}`,
    name: "Customer Support",
  });

  try {
    // Track retrieval (if using RAG)
    const retrievalStart = Date.now();
    const context = await vectorDB.query(userQuery, { k: 3 });
    observa.trackRetrieval({
      contextIds: context.map((doc) => doc.id),
      k: 3,
      latencyMs: Date.now() - retrievalStart,
    });

    // Track LLM call
    const llmStart = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: userQuery },
      ],
    });

    observa.trackLLMCall({
      model: "gpt-4",
      input: userQuery,
      output: response.choices[0].message.content || "",
      tokensPrompt: response.usage.prompt_tokens,
      tokensCompletion: response.usage.completion_tokens,
      tokensTotal: response.usage.total_tokens,
      latencyMs: Date.now() - llmStart,
    });

    // End trace
    await observa.endTrace();

    return response.choices[0].message.content;
  } catch (error) {
    observa.trackError({
      errorType: "llm_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
    throw error;
  }
}
```

### Python (if SDK available)

```python
from observa_sdk import ObservaSDK

observa = ObservaSDK(
    api_key=os.getenv("OBSERVA_API_KEY"),
    api_url="https://your-api.vercel.app",
    environment="prod"
)

# Start trace
trace_id = observa.start_trace(
    user_id="user-123",
    conversation_id="conv-456"
)

# Track LLM call
observa.track_llm_call(
    model="gpt-4",
    input="Hello!",
    output="Hi there!",
    tokens_total=150,
    latency_ms=1200
)

# End trace
observa.end_trace()
```

## Integration Patterns

### Pattern 1: OpenAI SDK Wrapper

```typescript
import OpenAI from "openai";
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

// Wrap OpenAI calls
async function openaiWithObserva(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: OpenAI.Chat.ChatCompletionCreateParams
) {
  const traceId = observa.startTrace();
  const startTime = Date.now();

  try {
    const response = await openai.chat.completions.create({
      ...options,
      messages,
    });

    observa.trackLLMCall({
      model: response.model,
      input: JSON.stringify(messages),
      output: response.choices[0].message.content || "",
      tokensPrompt: response.usage.prompt_tokens,
      tokensCompletion: response.usage.completion_tokens,
      tokensTotal: response.usage.total_tokens,
      latencyMs: Date.now() - startTime,
    });

    await observa.endTrace();
    return response;
  } catch (error) {
    observa.trackError({
      errorType: "openai_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
    throw error;
  }
}
```

### Pattern 2: Express Middleware

```typescript
import express from "express";
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

function observaMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const traceId = observa.startTrace({
    userId: req.user?.id,
    sessionId: req.session?.id,
    name: `${req.method} ${req.path}`,
  });

  // Track when response finishes
  res.on("finish", async () => {
    if (res.statusCode >= 400) {
      observa.trackError({
        errorType: "http_error",
        errorMessage: `HTTP ${res.statusCode}`,
      });
    }
    await observa.endTrace();
  });

  next();
}

app.use(observaMiddleware);
```

## Common Issues and Troubleshooting

### Issue 1: "tenantId and projectId are required when using legacy API key format"

**Symptoms**: SDK throws error: `Observa SDK: tenantId and projectId are required when using legacy API key format`

**Cause**: You're using an API key from the dashboard (`sk_...` or `pk_...` format) which doesn't encode tenant/project info like JWT keys do.

**Solutions**:

1. **Provide tenantId and projectId explicitly**:

   ```typescript
   const observa = new ObservaSDK({
     apiKey: process.env.OBSERVA_API_KEY!, // sk_... or pk_...
     tenantId: process.env.OBSERVA_TENANT_ID!, // Get from settings page
     projectId: process.env.OBSERVA_PROJECT_ID, // Get from settings page (optional)
   });
   ```

2. **Use a JWT-formatted API key** instead (from signup endpoint):

   ```typescript
   const observa = new ObservaSDK({
     apiKey: process.env.OBSERVA_API_KEY!, // JWT format (from signup)
   });
   ```

3. **Find your tenantId and projectId**:
   - Go to Settings → API Keys in the dashboard
   - When creating or viewing an API key, the response includes `tenantId` and `projectId`
   - Copy these values to your environment variables

**Debug**:

```typescript
console.log(
  "API Key format:",
  process.env.OBSERVA_API_KEY?.startsWith("sk_") ? "legacy" : "JWT"
);
console.log("Tenant ID:", process.env.OBSERVA_TENANT_ID);
console.log("Project ID:", process.env.OBSERVA_PROJECT_ID);
```

### Issue 2: "Invalid API Key"

**Symptoms**: SDK returns 401 Unauthorized

**Solutions**:

1. Verify your API key is correct (check for extra spaces)
2. Ensure API key is from the correct environment (dev vs prod)
3. Check if API key has expired (JWT tokens can expire)
4. Verify the API URL is correct

**Debug**:

```typescript
console.log("API Key length:", process.env.OBSERVA_API_KEY?.length);
console.log("API URL:", observa.apiUrl);
```

### Issue 3: "Events Not Appearing in Dashboard"

**Symptoms**: SDK sends events but dashboard shows nothing

**Solutions**:

1. Check that `endTrace()` is called (events are sent when trace ends)
2. Verify tenant_id and project_id match your dashboard account
3. Check API response for errors
4. Ensure events are being sent to the correct endpoint (`/api/v1/events/ingest`)

**Debug**:

```typescript
observa.on("error", (error) => {
  console.error("Observa SDK error:", error);
});

observa.on("sent", (eventCount) => {
  console.log(`Sent ${eventCount} events`);
});
```

### Issue 4: "Rate Limit Exceeded"

**Symptoms**: SDK returns 429 Too Many Requests

**Solutions**:

1. Reduce event frequency (batch events if possible)
2. Check your quota limits in dashboard
3. Implement exponential backoff for retries
4. Contact support to increase limits

### Issue 5: "Network Timeout"

**Symptoms**: SDK requests timeout

**Solutions**:

1. Check network connectivity
2. Increase timeout in SDK configuration (if available)
3. Verify API URL is accessible
4. Check firewall/proxy settings

### Issue 6: "TypeScript Errors"

**Symptoms**: Type errors when using SDK

**Solutions**:

1. Ensure TypeScript version is 4.5+
2. Install type definitions: `npm install @types/node`
3. Check SDK version compatibility
4. Update SDK to latest version: `npm update observa-sdk`

## Best Practices

### 1. Always End Traces

```typescript
try {
  // ... your code
  await observa.endTrace(); // ✅ Always call this
} catch (error) {
  observa.trackError({ ... });
  await observa.endTrace(); // ✅ Even on error
}
```

### 2. Use Environment Variables

```typescript
// ❌ Bad: Hardcoded API key
const observa = new ObservaSDK({
  apiKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
});

// ✅ Good: Environment variable
const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});
```

### 3. Handle Errors Gracefully

```typescript
try {
  await observa.endTrace();
} catch (error) {
  // Don't let Observa errors break your app
  console.error("Failed to send trace:", error);
}
```

### 4. Batch Events When Possible

The SDK automatically batches events, but you can optimize by:

- Grouping related operations in one trace
- Using conversation_id to link related traces
- Sending events at trace completion (not per-operation)

### 5. Include Context

```typescript
observa.startTrace({
  userId: "user-123", // ✅ Include user context
  conversationId: "conv-456", // ✅ Group related traces
  sessionId: "session-789", // ✅ Track sessions
  metadata: {
    // ✅ Add custom metadata
    feature: "chat",
    version: "2.0",
  },
});
```

## Next Steps

1. **View Your Data**: Check the [Observa Dashboard](https://your-dashboard-url.com) to see your traces
2. **Read Documentation**: See [SDK_MIGRATION_GUIDE.md](./SDK_MIGRATION_GUIDE.md) for advanced usage
3. **Event Reference**: See [SDK_CANONICAL_EVENTS_REFERENCE.md](./SDK_CANONICAL_EVENTS_REFERENCE.md) for event formats
4. **Examples**: See [SDK_IMPLEMENTATION_EXAMPLE.md](./SDK_IMPLEMENTATION_EXAMPLE.md) for complete examples

## Support

- **Documentation**: Check other SDK guides in this repository
- **Issues**: Report issues on GitHub
- **Email**: support@observa.ai (if available)

## Package Information

- **Package Name**: `observa-sdk`
- **npm**: https://www.npmjs.com/package/observa-sdk
- **Latest Version**: Check npm for current version
- **License**: (Check package.json in SDK repo)

# SDK Installation Guide

Complete guide for installing and setting up the Observa SDK in your application.

## Quick Start

### 1. Install the SDK

```bash
npm install observa-sdk
```

### 2. Get Your API Key

After signup, you'll receive an API key. Save it securely:

```env
OBSERVA_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Initialize the SDK

```typescript
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
  apiUrl: "https://observa-api.vercel.app",
  environment: "prod",
});
```

### 4. Send Your First Trace

```typescript
const traceId = observa.startTrace({
  userId: "user-123",
});

observa.trackLLMCall({
  model: "gpt-4",
  input: "Hello!",
  output: "Hi there!",
  tokensTotal: 30,
  latencyMs: 1200,
});

await observa.endTrace();
```

---

## Detailed Installation

### Package Information

- **Package Name**: `observa-sdk`
- **npm**: https://www.npmjs.com/package/observa-sdk
- **Latest Version**: Check npm for current version

### Environment Configuration

**Recommended: Environment Variables**

```env
OBSERVA_API_KEY=your-api-key-here
OBSERVA_API_URL=https://observa-api.vercel.app
OBSERVA_ENVIRONMENT=prod
```

**⚠️ Security Note**: Never commit API keys to version control.

---

## Integration Patterns

### Pattern 1: OpenAI SDK Wrapper

```typescript
import OpenAI from "openai";
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

async function openaiWithObserva(messages, options) {
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

function observaMiddleware(req, res, next) {
  const traceId = observa.startTrace({
    userId: req.user?.id,
    sessionId: req.session?.id,
    name: `${req.method} ${req.path}`,
  });

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

---

## Best Practices

1. **Always End Traces**: Call `endTrace()` in try/catch blocks
2. **Use Environment Variables**: Never hardcode API keys
3. **Handle Errors Gracefully**: Don't let Observa errors break your app
4. **Batch Events**: Group related operations in one trace
5. **Include Context**: Add userId, conversationId, sessionId

---

## Common Issues

### "Cannot find module 'observa-sdk'"

**Solution**: Verify installation with `npm list observa-sdk`

### "Invalid API Key"

**Solution**: Check API key format and ensure it's from the correct environment

### "Events Not Appearing"

**Solution**: Ensure `endTrace()` is called and check network requests

---

## Next Steps

- [SDK Migration Guide](./migration.md) - Advanced usage
- [SDK Examples](./examples.md) - Complete examples
- [Event Reference](./events-reference.md) - Event formats
- [Troubleshooting](../troubleshooting/common-issues.md) - Common issues

---

## Support

- **Documentation**: Check other SDK guides
- **Issues**: Report on GitHub
- **Email**: support@observa.ai


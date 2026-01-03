# SDK Implementation Examples

Complete working examples for integrating Observa SDK into your application.

## Basic Example

```typescript
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
  agentName: "my-ai-app",
  version: "1.0.0",
});

// Start trace
const traceId = observa.startTrace({
  userId: "user-123",
  conversationId: "conv-456",
  name: "Customer Support",
});

try {
  // Track LLM call
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello!" }],
  });

  observa.trackLLMCall({
    model: "gpt-4",
    input: "Hello!",
    output: response.choices[0].message.content || "",
    tokensPrompt: response.usage.prompt_tokens,
    tokensCompletion: response.usage.completion_tokens,
    tokensTotal: response.usage.total_tokens,
    latencyMs: 1200,
  });

  await observa.endTrace();
} catch (error) {
  observa.trackError({
    errorType: "llm_error",
    errorMessage: error instanceof Error ? error.message : "Unknown error",
  });
  await observa.endTrace();
}
```

## OpenAI Integration

```typescript
import OpenAI from "openai";
import ObservaSDK from "observa-sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const observa = new ObservaSDK({ apiKey: process.env.OBSERVA_API_KEY! });

async function chatWithObserva(userMessage: string, userId: string) {
  const traceId = observa.startTrace({
    userId,
    name: "Chat Completion",
  });

  try {
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: userMessage }],
    });

    const latency = Date.now() - startTime;

    observa.trackLLMCall({
      model: response.model,
      input: userMessage,
      output: response.choices[0].message.content || "",
      tokensPrompt: response.usage.prompt_tokens,
      tokensCompletion: response.usage.completion_tokens,
      tokensTotal: response.usage.total_tokens,
      latencyMs: latency,
    });

    await observa.endTrace();
    return response.choices[0].message.content;
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

## RAG with Retrieval Tracking

```typescript
async function ragWithObserva(query: string, userId: string) {
  const traceId = observa.startTrace({ userId, name: "RAG Query" });

  try {
    // Track retrieval
    const retrievalStart = Date.now();
    const context = await vectorDB.query(query, { k: 3 });
    observa.trackRetrieval({
      contextIds: context.map((doc) => doc.id),
      k: 3,
      latencyMs: Date.now() - retrievalStart,
    });

    // Track LLM call with context
    const llmStart = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "Answer using the provided context." },
        { role: "user", content: query },
      ],
    });

    observa.trackLLMCall({
      model: "gpt-4",
      input: query,
      output: response.choices[0].message.content || "",
      tokensTotal: response.usage.total_tokens,
      latencyMs: Date.now() - llmStart,
    });

    await observa.endTrace();
    return response.choices[0].message.content;
  } catch (error) {
    observa.trackError({
      errorType: "rag_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
    throw error;
  }
}
```

## Tool Calls Tracking

```typescript
async function agentWithTools(userQuery: string) {
  const traceId = observa.startTrace({ userId: "user-123" });

  try {
    // Track tool call
    const toolStart = Date.now();
    const weatherData = await getWeather(userQuery);
    observa.trackToolCall({
      toolName: "get_weather",
      args: { query: userQuery },
      result: weatherData,
      resultStatus: "success",
      latencyMs: Date.now() - toolStart,
    });

    // Track LLM call with tool result
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "user", content: userQuery },
        { role: "assistant", content: `Weather: ${JSON.stringify(weatherData)}` },
      ],
    });

    observa.trackLLMCall({
      model: "gpt-4",
      input: userQuery,
      output: response.choices[0].message.content || "",
      tokensTotal: response.usage.total_tokens,
      latencyMs: 1500,
    });

    await observa.endTrace();
  } catch (error) {
    observa.trackError({
      errorType: "tool_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
  }
}
```

## Express Middleware

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

## Related Documentation

- [SDK Installation](./installation.md)
- [SDK Migration Guide](./migration.md)
- [Event Reference](./events-reference.md)
- [API Documentation](../api/endpoints.md)

---

**More examples?** Check the [SDK Implementation Example](../../SDK_IMPLEMENTATION_EXAMPLE.md) for advanced patterns.


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

## User Feedback Tracking

### Basic Feedback (Like/Dislike)

```typescript
async function handleUserFeedback(
  feedbackType: "like" | "dislike",
  conversationId: string,
  userId: string
) {
  // User clicks like/dislike button after receiving AI response
  observa.trackFeedback({
    type: feedbackType,
    outcome: feedbackType === "like" ? "success" : "failure",
    conversationId,
    userId,
  });
}
```

### Rating Feedback

```typescript
async function handleRating(
  rating: number,
  comment: string | null,
  conversationId: string,
  userId: string
) {
  // User provides 1-5 star rating
  observa.trackFeedback({
    type: "rating",
    rating: rating, // Automatically clamped to 1-5
    comment: comment || undefined,
    outcome: rating >= 4 ? "success" : rating >= 3 ? "partial" : "failure",
    conversationId,
    userId,
  });
}
```

### Feedback Linked to Specific LLM Call

```typescript
async function chatWithFeedback(userMessage: string, userId: string) {
  const traceId = observa.startTrace({
    userId,
    conversationId: `conv-${userId}-${Date.now()}`,
    name: "Chat with Feedback",
  });

  try {
    // Track LLM call
    const llmSpanId = observa.trackLLMCall({
      model: "gpt-4",
      input: userMessage,
      output: aiResponse,
      tokensTotal: usage.total_tokens,
      latencyMs: 1200,
    });

    // User provides feedback - link it to the LLM call
    observa.trackFeedback({
      type: "like",
      parentSpanId: llmSpanId, // Attach feedback to specific LLM call
      conversationId: `conv-${userId}-${Date.now()}`,
      userId,
      outcome: "success",
    });

    await observa.endTrace();
  } catch (error) {
    observa.trackError({
      errorType: "chat_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
  }
}
```

### Feedback in Conversation Context

```typescript
async function conversationWithFeedback(
  messages: Array<{ role: string; content: string }>,
  userId: string
) {
  const conversationId = `conv-${userId}-${Date.now()}`;
  const sessionId = `session-${Date.now()}`;

  for (let i = 0; i < messages.length; i++) {
    const traceId = observa.startTrace({
      userId,
      conversationId,
      sessionId,
      messageIndex: i + 1,
    });

    try {
      // Process message and get AI response
      const response = await processMessage(messages[i]);

      // Track LLM call
      const llmSpanId = observa.trackLLMCall({
        model: "gpt-4",
        input: messages[i].content,
        output: response,
        // ... other LLM data
      });

      // User provides feedback for this specific message
      // (This would typically be called from a UI event handler)
      observa.trackFeedback({
        type: "rating",
        rating: userRating,
        comment: userComment,
        parentSpanId: llmSpanId,
        conversationId,
        sessionId,
        userId,
        messageIndex: i + 1,
        agentName: "chat-assistant",
        version: "v1.0.0",
      });

      await observa.endTrace();
    } catch (error) {
      observa.trackError({
        errorType: "conversation_error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      await observa.endTrace();
    }
  }
}
```

### Feedback with Correction

```typescript
async function handleCorrection(
  originalResponse: string,
  correction: string,
  conversationId: string,
  userId: string
) {
  // User provides correction/feedback
  observa.trackFeedback({
    type: "correction",
    comment: correction,
    outcome: "partial", // Partial because response needed correction
    conversationId,
    userId,
  });
}
```

### Express Route with Feedback Endpoint

```typescript
import express from "express";
import { init } from "observa-sdk";

const observa = init({ apiKey: process.env.OBSERVA_API_KEY! });

// Endpoint to receive user feedback
app.post("/api/feedback", async (req, res) => {
  const { type, rating, comment, conversationId, traceId } = req.body;
  const userId = req.user?.id;

  try {
    // Track feedback
    observa.trackFeedback({
      type: type, // "like" | "dislike" | "rating" | "correction"
      rating: rating ? Number(rating) : undefined,
      comment: comment || undefined,
      outcome: type === "like" || (type === "rating" && rating >= 4) 
        ? "success" 
        : type === "dislike" || (type === "rating" && rating <= 2)
        ? "failure"
        : "partial",
      conversationId: conversationId || undefined,
      userId: userId || undefined,
      agentName: "api-server",
      version: process.env.APP_VERSION,
      route: "/api/feedback",
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to track feedback:", error);
    res.status(500).json({ error: "Failed to track feedback" });
  }
});
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




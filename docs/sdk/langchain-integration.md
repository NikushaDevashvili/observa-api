# LangChain Integration Guide

Complete guide for integrating Observa with LangChain, LangGraph, and other agentic frameworks.

> **See also**: [SDK Installation](./installation.md) | [SDK Examples](./examples.md) | [Event Reference](./events-reference.md)

## Overview

Observa provides full observability for LangChain applications, automatically tracking:
- **Chains**: RunnableSequence, RunnableLambda, and custom chains
- **Agents**: AgentExecutor, OpenAIToolsAgent, and custom agents
- **Multi-step workflows**: Multiple LLM calls, tool invocations, and retrievals
- **LangGraph**: State machines and complex agentic workflows

The platform automatically detects LangChain patterns and categorizes spans for better visualization in the dashboard.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install observa-sdk langchain @langchain/openai
```

### 2. Create Observa Callback Handler

```typescript
import { BaseCallbackHandler } from "langchain/callbacks";
import ObservaSDK from "observa-sdk";

class ObservaCallbackHandler extends BaseCallbackHandler {
  private observa: ObservaSDK;
  private traceId: string | null = null;
  private spanStack: string[] = [];
  private spanMap: Map<string, string> = new Map(); // LangChain run_id -> Observa span_id

  constructor(observaSDK: ObservaSDK) {
    super();
    this.observa = observaSDK;
  }

  async handleChainStart(chain: any, inputs: any, runId: string) {
    if (!this.traceId) {
      this.traceId = this.observa.startTrace({
        name: chain.name || "LangChain Execution",
      });
    }

    const spanId = this.observa.trackLLMCall({
      model: inputs.model || "unknown",
      input: JSON.stringify(inputs),
      output: null,
      latencyMs: 0,
    });

    this.spanMap.set(runId, spanId);
    this.spanStack.push(spanId);
  }

  async handleLLMStart(llm: any, prompts: string[], runId: string) {
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;
    
    const spanId = this.observa.trackLLMCall({
      model: llm.modelName || "unknown",
      input: prompts.join("\n"),
      output: null,
      latencyMs: 0,
    });

    this.spanMap.set(runId, spanId);
    this.spanStack.push(spanId);
  }

  async handleLLMEnd(output: any, runId: string) {
    const spanId = this.spanMap.get(runId);
    if (spanId) {
      // Update LLM call with output
      // Note: You may need to track this differently based on your SDK implementation
    }
    this.spanStack.pop();
  }

  async handleToolStart(tool: any, input: string, runId: string) {
    const spanId = this.observa.trackToolCall({
      toolName: tool.name || "unknown",
      args: JSON.parse(input),
      result: null,
      resultStatus: "success",
      latencyMs: 0,
    });

    this.spanMap.set(runId, spanId);
    this.spanStack.push(spanId);
  }

  async handleToolEnd(output: string, runId: string) {
    const spanId = this.spanMap.get(runId);
    if (spanId) {
      // Update tool call with result
    }
    this.spanStack.pop();
  }

  async handleChainEnd(outputs: any, runId: string) {
    this.spanStack.pop();
  }

  async handleChainError(err: Error, runId: string) {
    const spanId = this.spanMap.get(runId);
    if (spanId) {
      this.observa.trackError({
        errorType: "chain_error",
        errorMessage: err.message,
        stackTrace: err.stack,
      });
    }
  }

  async endTrace() {
    if (this.traceId) {
      await this.observa.endTrace();
      this.traceId = null;
      this.spanStack = [];
      this.spanMap.clear();
    }
  }
}
```

### 3. Use with LangChain

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ObservaCallbackHandler } from "./observa-callback";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

const llm = new ChatOpenAI({
  modelName: "gpt-4",
  temperature: 0.7,
});

const callback = new ObservaCallbackHandler(observa);

// Run with callback
const response = await llm.invoke("What is the weather in Paris?", {
  callbacks: [callback],
});

await callback.endTrace();
```

---

## Integration Patterns

### Pattern 1: Basic Chain Integration

Track a simple LangChain chain:

```typescript
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

async function runChainWithObserva(userQuery: string) {
  const traceId = observa.startTrace({
    name: "LangChain Chain",
    userId: "user-123",
  });

  try {
    const prompt = ChatPromptTemplate.fromTemplate("Answer: {question}");
    const llm = new ChatOpenAI({ modelName: "gpt-4" });
    const chain = RunnableSequence.from([prompt, llm]);

    const startTime = Date.now();
    const result = await chain.invoke(
      { question: userQuery },
      {
        callbacks: [
          {
            handleChainStart: async (chain, inputs) => {
              observa.trackLLMCall({
                model: "gpt-4",
                input: JSON.stringify(inputs),
                output: null,
                latencyMs: 0,
              });
            },
            handleLLMEnd: async (output) => {
              const latency = Date.now() - startTime;
              // Update the LLM call with output and latency
            },
          },
        ],
      }
    );

    await observa.endTrace();
    return result;
  } catch (error) {
    observa.trackError({
      errorType: "chain_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
    throw error;
  }
}
```

### Pattern 2: Agent with Tools

Track an agent that uses tools:

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { createRetrieverTool } from "langchain/tools/retriever";
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

async function runAgentWithObserva(userQuery: string) {
  const traceId = observa.startTrace({
    name: "LangChain Agent",
    userId: "user-123",
  });

  try {
    const llm = new ChatOpenAI({ modelName: "gpt-4" });
    
    // Create tools
    const retrieverTool = createRetrieverTool(vectorStore.asRetriever(), {
      name: "search_knowledge_base",
      description: "Search the knowledge base for relevant information",
    });

    const tools = [retrieverTool];

    // Create agent
    const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt: agentPrompt,
    });

    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true,
    });

    // Track retrieval
    const retrievalStart = Date.now();
    const context = await vectorStore.similaritySearch(userQuery, 3);
    observa.trackRetrieval({
      contextIds: context.map((doc) => doc.id || doc.metadata.id),
      k: 3,
      latencyMs: Date.now() - retrievalStart,
    });

    // Track agent execution
    const agentStart = Date.now();
    const result = await agentExecutor.invoke(
      { input: userQuery },
      {
        callbacks: [
          {
            handleToolStart: async (tool, input) => {
              observa.trackToolCall({
                toolName: tool.name,
                args: JSON.parse(input),
                result: null,
                resultStatus: "success",
                latencyMs: 0,
              });
            },
            handleToolEnd: async (output) => {
              // Update tool call with result
            },
            handleLLMStart: async (llm, prompts) => {
              observa.trackLLMCall({
                model: llm.modelName || "gpt-4",
                input: prompts.join("\n"),
                output: null,
                latencyMs: 0,
              });
            },
            handleLLMEnd: async (output) => {
              // Update LLM call with output
            },
          },
        ],
      }
    );

    await observa.endTrace();
    return result;
  } catch (error) {
    observa.trackError({
      errorType: "agent_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
    throw error;
  }
}
```

### Pattern 3: LangGraph Integration

Track LangGraph state machines:

```typescript
import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

interface AgentState {
  messages: any[];
  next: string;
}

async function runLangGraphWithObserva(userQuery: string) {
  const traceId = observa.startTrace({
    name: "LangGraph State Machine",
    userId: "user-123",
  });

  try {
    const llm = new ChatOpenAI({ modelName: "gpt-4" });

    // Define nodes
    const agentNode = async (state: AgentState) => {
      const startTime = Date.now();
      const response = await llm.invoke(state.messages);
      const latency = Date.now() - startTime;

      observa.trackLLMCall({
        model: "gpt-4",
        input: JSON.stringify(state.messages),
        output: response.content as string,
        latencyMs: latency,
      });

      return { messages: [response] };
    };

    const toolNode = async (state: AgentState) => {
      const toolStart = Date.now();
      // Execute tool
      const result = await executeTool(state.messages[0]);
      const latency = Date.now() - toolStart;

      observa.trackToolCall({
        toolName: "custom_tool",
        args: state.messages[0],
        result: result,
        resultStatus: "success",
        latencyMs: latency,
      });

      return { messages: [{ role: "tool", content: result }] };
    };

    // Build graph
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: {
          reducer: (x: any[], y: any[]) => x.concat(y),
        },
        next: {
          reducer: (x: string, y: string) => y || x,
        },
      },
    })
      .addNode("agent", agentNode)
      .addNode("tools", toolNode)
      .addEdge("agent", "tools")
      .addEdge("tools", END);

    const app = workflow.compile();

    // Execute
    const result = await app.invoke({
      messages: [{ role: "user", content: userQuery }],
      next: "agent",
    });

    await observa.endTrace();
    return result;
  } catch (error) {
    observa.trackError({
      errorType: "langgraph_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    await observa.endTrace();
    throw error;
  }
}
```

### Pattern 4: Manual Event Tracking

If you prefer manual tracking instead of callbacks:

```typescript
import { ChatOpenAI } from "@langchain/openai";
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

async function manualTracking(userQuery: string) {
  const traceId = observa.startTrace({
    name: "Manual LangChain Tracking",
  });

  try {
    const llm = new ChatOpenAI({ modelName: "gpt-4" });

    // Track LLM call manually
    const llmStart = Date.now();
    const response = await llm.invoke(userQuery);
    const llmLatency = Date.now() - llmStart;

    observa.trackLLMCall({
      model: "gpt-4",
      input: userQuery,
      output: response.content as string,
      latencyMs: llmLatency,
    });

    await observa.endTrace();
    return response;
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

---

## Automatic Pattern Detection

Observa automatically detects LangChain patterns from span names and categorizes them:

### Chain Operations

Spans with these names are detected as `chain_operation`:
- `RunnableSequence`
- `RunnableLambda`
- `RunnableMap`
- Names containing `"sequence"`, `"chain"`, or starting with `"runnable"`

### Agent Invocations

Spans with these names are detected as `agent_invocation`:
- `AgentExecutor`
- `RunnableAssign`
- `OpenAIToolsAgent`
- `ToolAgent`
- `PlanAndExecute`
- Names containing `"agent"` or `"agentexecutor"`

### Example Trace Structure

When using LangChain, your trace will appear in the dashboard like this:

```
📊 Trace (2.5s)
  └─ 🤖 AgentExecutor [AGENT INVOCATION]
      └─ ⛓️ RunnableSequence [CHAIN]
          ├─ 💬 LLM Call: gpt-4 [LLM]
          ├─ 🔧 Tool: search_knowledge_base [TOOL]
          └─ 💬 LLM Call: gpt-4 [LLM]
```

---

## Best Practices

### 1. Use Descriptive Span Names

When creating custom chains or agents, use descriptive names that will be detected:

```typescript
// Good - will be detected as chain_operation
const chain = new RunnableSequence({
  name: "CustomerSupportChain", // Contains "chain"
  // ...
});

// Good - will be detected as agent_invocation
const agent = new AgentExecutor({
  name: "SupportAgent", // Contains "agent"
  // ...
});
```

### 2. Track All Operations

Ensure you track:
- **All LLM calls** (even intermediate ones in agent loops)
- **All tool calls** (function executions, API calls, database queries)
- **Retrievals** (vector database queries, RAG operations)
- **Errors** (at any level of the chain)

### 3. Maintain Span Hierarchy

Use `parent_span_id` to maintain proper hierarchy:

```typescript
// Start with root span
const rootSpanId = observa.startTrace({ name: "Agent Workflow" });

// Track agent (child of root)
const agentSpanId = observa.trackLLMCall({
  model: "gpt-4",
  input: userQuery,
  output: null,
  latencyMs: 0,
  parentSpanId: rootSpanId, // Link to root
});

// Track tool (child of agent)
observa.trackToolCall({
  toolName: "search",
  args: { query: userQuery },
  result: null,
  resultStatus: "success",
  latencyMs: 0,
  parentSpanId: agentSpanId, // Link to agent
});
```

### 4. Handle Multiple LLM Calls

In agentic workflows, you'll have multiple LLM calls. Track each one:

```typescript
// First LLM call (user query)
observa.trackLLMCall({
  model: "gpt-4",
  input: userQuery, // User's original question
  output: "I'll search for that information.",
  latencyMs: 1200,
});

// Tool execution
observa.trackToolCall({
  toolName: "web_search",
  args: { query: userQuery },
  result: searchResults,
  resultStatus: "success",
  latencyMs: 500,
});

// Second LLM call (with tool results)
observa.trackLLMCall({
  model: "gpt-4",
  input: `User asked: ${userQuery}\nSearch results: ${searchResults}`, // Intermediate input
  output: finalResponse, // Final answer
  latencyMs: 1500,
});
```

### 5. Track Errors at Appropriate Levels

Track errors where they occur:

```typescript
try {
  const result = await chain.invoke(input);
} catch (error) {
  // Track error at chain level
  observa.trackError({
    errorType: "chain_error",
    errorMessage: error.message,
    stackTrace: error.stack,
  });
}

try {
  const toolResult = await tool.invoke(toolInput);
} catch (error) {
  // Track error at tool level
  observa.trackError({
    errorType: "tool_error",
    errorMessage: error.message,
    stackTrace: error.stack,
  });
}
```

---

## Advanced Patterns

### Custom Callback Handler

Create a reusable callback handler:

```typescript
import { BaseCallbackHandler } from "langchain/callbacks";
import ObservaSDK from "observa-sdk";

export class ObservaLangChainHandler extends BaseCallbackHandler {
  name = "ObservaHandler";
  private observa: ObservaSDK;
  private traceId: string | null = null;
  private runMap: Map<string, { type: string; startTime: number; spanId?: string }> = new Map();

  constructor(observaSDK: ObservaSDK) {
    super();
    this.observa = observaSDK;
  }

  async handleChainStart(chain: any, inputs: any, runId: string) {
    if (!this.traceId) {
      this.traceId = this.observa.startTrace({
        name: chain.name || "LangChain Chain",
      });
    }

    this.runMap.set(runId, {
      type: "chain",
      startTime: Date.now(),
    });
  }

  async handleLLMStart(llm: any, prompts: string[], runId: string) {
    const spanId = this.observa.trackLLMCall({
      model: llm.modelName || "unknown",
      input: prompts.join("\n"),
      output: null,
      latencyMs: 0,
    });

    this.runMap.set(runId, {
      type: "llm",
      startTime: Date.now(),
      spanId,
    });
  }

  async handleLLMEnd(output: any, runId: string) {
    const run = this.runMap.get(runId);
    if (run && run.type === "llm") {
      const latency = Date.now() - run.startTime;
      // Update LLM call with output and latency
      // Note: Your SDK may need a different method for updating
    }
    this.runMap.delete(runId);
  }

  async handleToolStart(tool: any, input: string, runId: string) {
    const spanId = this.observa.trackToolCall({
      toolName: tool.name || "unknown",
      args: JSON.parse(input),
      result: null,
      resultStatus: "success",
      latencyMs: 0,
    });

    this.runMap.set(runId, {
      type: "tool",
      startTime: Date.now(),
      spanId,
    });
  }

  async handleToolEnd(output: string, runId: string) {
    const run = this.runMap.get(runId);
    if (run && run.type === "tool") {
      const latency = Date.now() - run.startTime;
      // Update tool call with result and latency
    }
    this.runMap.delete(runId);
  }

  async handleChainError(err: Error, runId: string) {
    this.observa.trackError({
      errorType: "chain_error",
      errorMessage: err.message,
      stackTrace: err.stack,
    });
  }

  async handleToolError(err: Error, runId: string) {
    this.observa.trackError({
      errorType: "tool_error",
      errorMessage: err.message,
      stackTrace: err.stack,
    });
  }

  async handleLLMError(err: Error, runId: string) {
    this.observa.trackError({
      errorType: "llm_error",
      errorMessage: err.message,
      stackTrace: err.stack,
    });
  }

  async endTrace() {
    if (this.traceId) {
      await this.observa.endTrace();
      this.traceId = null;
      this.runMap.clear();
    }
  }
}
```

### Usage with Custom Handler

```typescript
import { ObservaLangChainHandler } from "./observa-handler";
import ObservaSDK from "observa-sdk";

const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
});

const handler = new ObservaLangChainHandler(observa);

// Use with any LangChain component
const result = await chain.invoke(input, {
  callbacks: [handler],
});

await handler.endTrace();
```

---

## Troubleshooting

### Spans Not Appearing

**Issue**: LangChain spans aren't showing up in the dashboard.

**Solutions**:
1. Ensure `endTrace()` is called after chain execution
2. Check that callbacks are properly attached
3. Verify API key is correct
4. Check network requests in browser DevTools

### Incorrect Span Types

**Issue**: Spans are showing as `unknown` instead of `chain_operation` or `agent_invocation`.

**Solutions**:
1. Use descriptive names containing "chain", "agent", "runnable", etc.
2. Check span names in the dashboard's raw JSON view
3. Ensure span names match the detection patterns

### Multiple LLM Calls Not Aggregated

**Issue**: Multiple LLM calls in agent loops aren't being properly tracked.

**Solutions**:
1. Ensure all LLM calls are within the same trace (same `trace_id`)
2. Use proper `parent_span_id` to maintain hierarchy
3. Track each LLM call separately (don't overwrite previous calls)

### Callback Handler Not Firing

**Issue**: Callbacks aren't being called during chain execution.

**Solutions**:
1. Ensure callbacks are passed correctly: `chain.invoke(input, { callbacks: [handler] })`
2. Check LangChain version compatibility
3. Verify callback handler extends `BaseCallbackHandler` correctly

---

## Related Documentation

- [SDK Installation](./installation.md) - Setting up the SDK
- [SDK Examples](./examples.md) - More integration examples
- [Event Reference](./events-reference.md) - Event format details
- [Traces Guide](../guides/traces.md) - Understanding traces in the dashboard

---

## Support

- **Documentation**: Check other SDK guides
- **Issues**: Report on GitHub
- **Email**: support@observa.ai


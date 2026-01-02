# SDK Implementation Example

Complete example implementation showing how to update the Observa SDK to use canonical events.

## Basic SDK Structure

```typescript
import { v4 as uuidv4 } from 'uuid';

interface ObservaConfig {
  apiKey: string;
  apiUrl?: string;
  environment?: 'dev' | 'prod';
  tenantId?: string;
  projectId?: string;
  agentName?: string;
  version?: string;
}

interface TraceOptions {
  conversationId?: string;
  sessionId?: string;
  userId?: string;
  name?: string;
  metadata?: Record<string, any>;
}

class ObservaSDK {
  private apiKey: string;
  private apiUrl: string;
  private environment: 'dev' | 'prod';
  private tenantId?: string;
  private projectId?: string;
  private agentName?: string;
  private version?: string;

  private currentTraceId: string | null = null;
  private rootSpanId: string | null = null;
  private events: any[] = [];
  private spanStack: string[] = [];

  constructor(config: ObservaConfig) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl || 'https://observa-api.vercel.app';
    this.environment = config.environment || 'prod';
    this.tenantId = config.tenantId;
    this.projectId = config.projectId;
    this.agentName = config.agentName;
    this.version = config.version;

    // Extract tenant/project from JWT if not provided
    if (!this.tenantId || !this.projectId) {
      try {
        const payload = JSON.parse(
          Buffer.from(this.apiKey.split('.')[1], 'base64').toString()
        );
        this.tenantId = payload.tenantId;
        this.projectId = payload.projectId;
        this.environment = payload.environment || this.environment;
      } catch (e) {
        console.warn('[Observa] Failed to extract tenant/project from API key');
      }
    }
  }

  /**
   * Start a new trace
   */
  startTrace(options: TraceOptions = {}): string {
    if (this.currentTraceId) {
      console.warn('[Observa] Trace already active, ending previous trace');
      this.endTrace().catch(console.error);
    }

    this.currentTraceId = uuidv4();
    this.rootSpanId = uuidv4();
    this.events = [];
    this.spanStack = [this.rootSpanId];

    // Add trace_start event
    this.addEvent({
      event_type: 'trace_start',
      span_id: this.rootSpanId,
      parent_span_id: null,
      attributes: {
        trace_start: {
          name: options.name || null,
          metadata: options.metadata || null,
        },
      },
      conversation_id: options.conversationId || null,
      session_id: options.sessionId || null,
      user_id: options.userId || null,
    });

    return this.currentTraceId;
  }

  /**
   * Track an LLM call
   */
  trackLLMCall(options: {
    model: string;
    input?: string;
    output?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    timeToFirstTokenMs?: number;
    streamingDurationMs?: number;
    finishReason?: string;
    responseId?: string;
    systemFingerprint?: string;
    temperature?: number;
    maxTokens?: number;
    cost?: number;
    promptTemplateId?: string;
  }): string {
    const spanId = uuidv4();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.addEvent({
      event_type: 'llm_call',
      span_id: spanId,
      parent_span_id: parentSpanId,
      attributes: {
        llm_call: {
          model: options.model,
          input: options.input || null,
          output: options.output || null,
          input_tokens: options.inputTokens || null,
          output_tokens: options.outputTokens || null,
          total_tokens: options.totalTokens || null,
          latency_ms: options.latencyMs,
          time_to_first_token_ms: options.timeToFirstTokenMs || null,
          streaming_duration_ms: options.streamingDurationMs || null,
          finish_reason: options.finishReason || null,
          response_id: options.responseId || null,
          system_fingerprint: options.systemFingerprint || null,
          temperature: options.temperature || null,
          max_tokens: options.maxTokens || null,
          cost: options.cost || null,
          prompt_template_id: options.promptTemplateId || null,
        },
      },
    });

    return spanId;
  }

  /**
   * Track a tool call
   */
  trackToolCall(options: {
    toolName: string;
    args?: Record<string, any>;
    result?: any;
    resultStatus: 'success' | 'error' | 'timeout';
    latencyMs: number;
    errorMessage?: string;
  }): string {
    const spanId = uuidv4();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.addEvent({
      event_type: 'tool_call',
      span_id: spanId,
      parent_span_id: parentSpanId,
      attributes: {
        tool_call: {
          tool_name: options.toolName,
          args: options.args || null,
          result: options.result || null,
          result_status: options.resultStatus,
          latency_ms: options.latencyMs,
          error_message: options.errorMessage || null,
        },
      },
    });

    return spanId;
  }

  /**
   * Track a retrieval operation
   */
  trackRetrieval(options: {
    contextIds?: string[];
    contextHashes?: string[];
    k?: number;
    similarityScores?: number[];
    latencyMs: number;
  }): string {
    const spanId = uuidv4();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.addEvent({
      event_type: 'retrieval',
      span_id: spanId,
      parent_span_id: parentSpanId,
      attributes: {
        retrieval: {
          retrieval_context_ids: options.contextIds || null,
          retrieval_context_hashes: options.contextHashes || null,
          k: options.k || null,
          top_k: options.k || null,
          similarity_scores: options.similarityScores || null,
          latency_ms: options.latencyMs,
        },
      },
    });

    return spanId;
  }

  /**
   * Track an error
   */
  trackError(options: {
    errorType: string;
    errorMessage: string;
    stackTrace?: string;
    context?: Record<string, any>;
  }): string {
    const spanId = uuidv4();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.addEvent({
      event_type: 'error',
      span_id: spanId,
      parent_span_id: parentSpanId,
      attributes: {
        error: {
          error_type: options.errorType,
          error_message: options.errorMessage,
          stack_trace: options.stackTrace || null,
          context: options.context || null,
        },
      },
    });

    return spanId;
  }

  /**
   * Track final output
   */
  trackOutput(options: {
    finalOutput?: string;
    outputLength?: number;
  }): string {
    const spanId = uuidv4();
    const parentSpanId = this.spanStack[this.spanStack.length - 1] || null;

    this.addEvent({
      event_type: 'output',
      span_id: spanId,
      parent_span_id: parentSpanId,
      attributes: {
        output: {
          final_output: options.finalOutput || null,
          output_length: options.outputLength || null,
        },
      },
    });

    return spanId;
  }

  /**
   * End trace and send events
   */
  async endTrace(options: { outcome?: 'success' | 'error' | 'timeout' } = {}): Promise<string> {
    if (!this.currentTraceId || !this.rootSpanId) {
      throw new Error('[Observa] No active trace. Call startTrace() first.');
    }

    // Calculate summary statistics
    const llmEvents = this.events.filter(e => e.event_type === 'llm_call');
    const totalTokens = llmEvents.reduce((sum, e) => 
      sum + (e.attributes.llm_call?.total_tokens || 0), 0
    );
    const totalCost = llmEvents.reduce((sum, e) => 
      sum + (e.attributes.llm_call?.cost || 0), 0
    );

    // Calculate total latency (time from trace_start to trace_end)
    const traceStart = this.events.find(e => e.event_type === 'trace_start');
    const totalLatency = traceStart
      ? new Date().getTime() - new Date(traceStart.timestamp).getTime()
      : null;

    // Add trace_end event
    this.addEvent({
      event_type: 'trace_end',
      span_id: this.rootSpanId,
      parent_span_id: null,
      attributes: {
        trace_end: {
          total_latency_ms: totalLatency,
          total_tokens: totalTokens || null,
          total_cost: totalCost || null,
          outcome: options.outcome || 'success',
        },
      },
    });

    // Send events
    const traceId = this.currentTraceId;
    await this.sendEvents(this.events);

    // Reset for next trace
    this.currentTraceId = null;
    this.rootSpanId = null;
    this.events = [];
    this.spanStack = [];

    return traceId;
  }

  /**
   * Helper: Add event with common fields
   */
  private addEvent(eventData: Partial<any>) {
    if (!this.currentTraceId) {
      console.warn('[Observa] No active trace, ignoring event');
      return;
    }

    const event = {
      tenant_id: this.tenantId!,
      project_id: this.projectId!,
      environment: this.environment,
      trace_id: this.currentTraceId,
      timestamp: new Date().toISOString(),
      agent_name: this.agentName || null,
      version: this.version || null,
      ...eventData,
    };

    this.events.push(event);
  }

  /**
   * Send events to API
   */
  private async sendEvents(events: any[]): Promise<void> {
    if (events.length === 0) {
      console.warn('[Observa] No events to send');
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/events/ingest`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(events),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ 
          message: response.statusText 
        }));
        throw new Error(`[Observa] Failed to send events: ${error.message || response.statusText}`);
      }

      const result = await response.json();
      console.log(`[Observa] Successfully sent ${result.event_count} events`);
    } catch (error) {
      console.error('[Observa] Error sending events:', error);
      throw error;
    }
  }
}

export default ObservaSDK;
```

## Usage Example

```typescript
import ObservaSDK from '@observa/sdk';

// Initialize SDK
const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!,
  environment: 'prod',
  agentName: 'my-ai-app',
  version: '1.0.0',
});

// Start trace
const traceId = observa.startTrace({
  conversationId: 'conv-123',
  sessionId: 'session-456',
  userId: 'user-789',
  name: 'Customer Support Chat',
});

try {
  // Track retrieval
  const retrievalStart = Date.now();
  const context = await vectorDB.query(userQuery, { k: 3 });
  observa.trackRetrieval({
    contextIds: context.map(doc => doc.id),
    contextHashes: context.map(doc => hash(doc.content)),
    k: 3,
    similarityScores: context.map(doc => doc.score),
    latencyMs: Date.now() - retrievalStart,
  });

  // Track tool call
  const toolStart = Date.now();
  let toolResult;
  try {
    toolResult = await webSearch(userQuery);
    observa.trackToolCall({
      toolName: 'web_search',
      args: { query: userQuery },
      result: toolResult,
      resultStatus: 'success',
      latencyMs: Date.now() - toolStart,
    });
  } catch (error) {
    observa.trackToolCall({
      toolName: 'web_search',
      args: { query: userQuery },
      resultStatus: 'error',
      latencyMs: Date.now() - toolStart,
      errorMessage: error.message,
    });
    observa.trackError({
      errorType: 'tool_error',
      errorMessage: error.message,
      stackTrace: error.stack,
    });
    throw error;
  }

  // Track LLM call
  const llmStart = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ],
  });

  observa.trackLLMCall({
    model: 'gpt-4',
    input: userQuery,
    output: response.choices[0].message.content,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
    totalTokens: response.usage?.total_tokens,
    latencyMs: Date.now() - llmStart,
    finishReason: response.choices[0].finish_reason,
    responseId: response.id,
  });

  // Track output
  observa.trackOutput({
    finalOutput: response.choices[0].message.content,
    outputLength: response.choices[0].message.content.length,
  });

  // End trace
  await observa.endTrace({ outcome: 'success' });

} catch (error) {
  observa.trackError({
    errorType: 'execution_error',
    errorMessage: error.message,
    stackTrace: error.stack,
  });
  await observa.endTrace({ outcome: 'error' });
  throw error;
}
```

## Integration with OpenAI SDK

Example wrapper for OpenAI that automatically tracks LLM calls:

```typescript
class ObservableOpenAI {
  private client: OpenAI;
  private observa: ObservaSDK;

  constructor(apiKey: string, observaSDK: ObservaSDK) {
    this.client = new OpenAI({ apiKey });
    this.observa = observaSDK;
  }

  async chat(options: {
    model: string;
    messages: any[];
    temperature?: number;
    max_tokens?: number;
  }) {
    const startTime = Date.now();
    let timeToFirstToken: number | undefined;

    try {
      const stream = await this.client.chat.completions.create({
        ...options,
        stream: true,
      });

      let fullResponse = '';
      let firstToken = true;

      for await (const chunk of stream) {
        if (firstToken) {
          timeToFirstToken = Date.now() - startTime;
          firstToken = false;
        }

        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;
        }
      }

      const latencyMs = Date.now() - startTime;

      // Track LLM call
      this.observa.trackLLMCall({
        model: options.model,
        input: JSON.stringify(options.messages),
        output: fullResponse,
        latencyMs,
        timeToFirstTokenMs: timeToFirstToken,
        streamingDurationMs: latencyMs,
        temperature: options.temperature,
        maxTokens: options.max_tokens,
      });

      return { content: fullResponse };
    } catch (error) {
      this.observa.trackError({
        errorType: 'llm_error',
        errorMessage: error.message,
        stackTrace: error.stack,
      });
      throw error;
    }
  }
}
```

## Testing

Test the SDK implementation:

```typescript
// Test basic trace
const observa = new ObservaSDK({ apiKey: 'test-key' });
observa.startTrace();
observa.trackLLMCall({
  model: 'gpt-4',
  input: 'Hello',
  output: 'Hi!',
  latencyMs: 100,
});
await observa.endTrace();

// Verify events were sent correctly
// Check dashboard or use test script
```

Use the simulation script to verify your implementation matches the expected format:

```bash
# Generate test traces
node scripts/load-simulation-events.js <JWT_TOKEN>

# Compare with your SDK output
```


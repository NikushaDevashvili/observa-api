/**
 * Observa LangChain Integration Wrapper
 *
 * Provides a defensive LangChain callback handler that:
 * - Normalizes attributes to avoid double-escaped JSON
 * - Validates serialization before sending to Observa/Tinybird
 * - Never throws (all failures fall back to safe values)
 */
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import crypto from "node:crypto";
import { AttributeNormalizer, JsonValue } from "../utils/attributeNormalizer.js";

export interface ObservaClient {
  startTrace(payload: {
    name: string;
    chainType?: string;
    numPrompts?: number;
    attributes?: Record<string, JsonValue>;
    attributes_json?: string;
  }): string | Promise<string>;
  endTrace(): void | Promise<void>;
  trackTraceStart?(payload: {
    spanId: string;
    parentSpanId: string | null;
    traceId: string | null;
    attributes?: Record<string, JsonValue>;
    attributes_json?: string;
  }): void | Promise<void>;
  // Direct event sending method (if SDK supports it)
  sendEvent?(event: {
    event_type: string;
    span_id: string;
    parent_span_id: string | null;
    trace_id: string | null;
    attributes?: Record<string, JsonValue>;
    attributes_json?: string;
    timestamp?: string;
  }): void | Promise<void>;
  trackLLMCall(payload: {
    model: string;
    input: string | null;
    output: string | null;
    latencyMs: number | null;
    attributes?: Record<string, JsonValue>;
    attributes_json?: string;
    spanId?: string | null;
    parentSpanId?: string | null;
    traceId?: string | null;
  }): string | void | Promise<string | void>;
  trackToolCall(payload: {
    toolName: string;
    args: JsonValue;
    result: JsonValue | null;
    resultStatus: "success" | "error";
    latencyMs: number | null;
    attributes?: Record<string, JsonValue>;
    attributes_json?: string;
    spanId?: string | null;
    parentSpanId?: string | null;
    traceId?: string | null;
  }): string | void | Promise<string | void>;
  trackError(payload: {
    errorType: string;
    errorMessage: string;
    stackTrace?: string | null;
    attributes?: Record<string, JsonValue>;
  }): void | Promise<void>;
}

type RunState = {
  type: "chain" | "llm" | "tool";
  startTime: number;
  spanId?: string;
  parentSpanId?: string | null;
  model?: string;
  input?: string | null;
  inputMessages?: Array<Record<string, any>> | null;
  extraParams?: Record<string, any> | null;
  streamingTokens?: string[];
  firstTokenTime?: number;
  toolName?: string;
  toolArgs?: JsonValue;
};

type SpanInfo = {
  spanId: string;
  parentSpanId: string | null;
};

/**
 * SpanManager
 *
 * Tracks span hierarchy for LangChain runs. Never throws.
 */
class SpanManager {
  private spans: Map<string, SpanInfo> = new Map();

  createSpan(runId: string, parentRunId?: string | null): SpanInfo {
    const parentSpanId = parentRunId
      ? this.spans.get(parentRunId)?.spanId || null
      : null;
    const spanInfo: SpanInfo = {
      spanId: crypto.randomUUID(),
      parentSpanId,
    };
    this.spans.set(runId, spanInfo);
    return spanInfo;
  }

  getSpan(runId: string | null | undefined): SpanInfo | null {
    if (!runId) return null;
    return this.spans.get(runId) || null;
  }

  deleteSpan(runId: string): void {
    this.spans.delete(runId);
  }

  clear(): void {
    this.spans.clear();
  }
}

/**
 * ObservaLangChainHandler
 *
 * Defensive LangChain callback handler that avoids double-serialization
 * by normalizing JSON-like strings before emitting events.
 */
export class ObservaLangChainHandler extends BaseCallbackHandler {
  name = "ObservaLangChainHandler";
  private observa: ObservaClient;
  private traceId: string | null = null;
  private rootSpanId: string | null = null;
  private runMap: Map<string, RunState> = new Map();
  private spanManager: SpanManager;
  private activeChainRunId: string | null = null;
  private chainStartTime: number | null = null;

  constructor(observaClient: ObservaClient) {
    super();
    this.observa = observaClient;
    this.spanManager = new SpanManager();
  }

  async handleChainStart(
    chain: any,
    inputs: unknown,
    runId: string,
    parentRunId?: string,
  ) {
    // Only create root trace on the first chain (no parent)
    if (!this.traceId && !parentRunId) {
      // Extract chain information before creating trace
      const chainType = this.extractChainType(chain);
      const numPrompts = this.extractNumPrompts(inputs);

      // Build trace_start payload with proper data
      const traceStartPayload = {
        chain_type: chainType,
        num_prompts: numPrompts,
        created_at: new Date().toISOString(),
        name: chain?.name || "LangChain Chain",
      };

      const normalizedAttributes = AttributeNormalizer.normalize({
        trace_start: traceStartPayload,
      });
      const attributesJson = this.buildAttributesJson(normalizedAttributes);

      try {
        // CRITICAL: Pass chain data to startTrace
        // The SDK's startTrace() implementation MUST use attributes_json to create trace_start event
        // If the SDK doesn't use it, trackTraceStart() will be called as fallback below
        const traceId = await this.observa.startTrace({
          name: chain?.name || "LangChain Chain",
          chainType: chainType,
          numPrompts: numPrompts,
          attributes:
            normalizedAttributes &&
            typeof normalizedAttributes === "object" &&
            !Array.isArray(normalizedAttributes)
              ? (normalizedAttributes as Record<string, JsonValue>)
              : undefined,
          attributes_json: attributesJson, // CRITICAL: SDK must use this in trace_start event
        });
        this.traceId = typeof traceId === "string" ? traceId : this.traceId;
        
        // Log what we're passing to help debug SDK implementation
        console.log(
          `[ObservaLangChainHandler] Called startTrace with attributes_json: ${attributesJson.substring(0, 200)}...`
        );
      } catch (error) {
        console.error(
          "[ObservaLangChainHandler] startTrace failed:",
          error instanceof Error ? error.message : String(error)
        );
        // Never throw - continue without traceId
      }
    }

    // Create root span for the first chain (root of trace)
    if (!parentRunId && !this.rootSpanId) {
      this.rootSpanId = crypto.randomUUID();
      this.chainStartTime = Date.now();

      // Extract chain information
      const chainType = this.extractChainType(chain);
      const numPrompts = this.extractNumPrompts(inputs);

      // Build trace_start payload with proper data
      const traceStartPayload = {
        chain_type: chainType,
        num_prompts: numPrompts,
        created_at: new Date().toISOString(),
        name: chain?.name || "LangChain Chain",
      };

      const normalizedAttributes = AttributeNormalizer.normalize({
        trace_start: traceStartPayload,
      });
      const attributesJson = this.buildAttributesJson(normalizedAttributes);

      // CRITICAL: Always try to send trace_start event with data
      // Try multiple methods to ensure the event is sent with proper data
      
      // Method 1: Use trackTraceStart if available (preferred)
      if (this.observa.trackTraceStart) {
        try {
          await this.observa.trackTraceStart({
            spanId: this.rootSpanId,
            parentSpanId: null,
            traceId: this.traceId,
            attributes:
              normalizedAttributes &&
              typeof normalizedAttributes === "object" &&
              !Array.isArray(normalizedAttributes)
                ? (normalizedAttributes as Record<string, JsonValue>)
                : undefined,
            attributes_json: attributesJson,
          });
          // Success - trace_start event sent with data
          return; // Exit early if successful
        } catch (error) {
          console.warn(
            "[ObservaLangChainHandler] trackTraceStart failed, trying fallback:",
            error
          );
          // Continue to fallback methods
        }
      }

      // Method 2: Use sendEvent if available (direct event sending)
      if (this.observa.sendEvent) {
        try {
          await this.observa.sendEvent({
            event_type: "trace_start",
            span_id: this.rootSpanId,
            parent_span_id: null,
            trace_id: this.traceId,
            attributes:
              normalizedAttributes &&
              typeof normalizedAttributes === "object" &&
              !Array.isArray(normalizedAttributes)
                ? (normalizedAttributes as Record<string, JsonValue>)
                : undefined,
            attributes_json: attributesJson,
            timestamp: new Date().toISOString(),
          });
          // Success - trace_start event sent with data
          return; // Exit early if successful
        } catch (error) {
          console.warn(
            "[ObservaLangChainHandler] sendEvent failed:",
            error
          );
        }
      }

      // Method 3: Log warning if no method available
      // The SDK's startTrace() should have created the event, but it might be empty
      console.warn(
        `[ObservaLangChainHandler] ⚠️ trace_start event may be empty. ` +
        `SDK needs to implement trackTraceStart() or sendEvent() to capture chain data. ` +
        `Chain type: ${chainType}, Num prompts: ${numPrompts}, Attributes JSON: ${attributesJson}`
      );
    }

    this.spanManager.createSpan(runId, parentRunId || null);
    if (!parentRunId) {
      this.activeChainRunId = runId;
    }

    this.runMap.set(runId, {
      type: "chain",
      startTime: Date.now(),
    });
  }

  async handleLLMStart(
    llm: any,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ) {
    const parentForSpan = parentRunId || this.activeChainRunId;
    const spanInfo = this.spanManager.createSpan(runId, parentForSpan || null);
    const model = llm?.modelName || "unknown";
    const input = prompts.join("\n");
    const inputMessages = prompts.map((p) => ({ role: "user", content: p }));

    const payload = {
      model,
      input,
      output: null,
      latencyMs: 0,
      attributes: this.normalizeAttributes({
        llm: this.normalizeAttributes(llm),
      }),
      spanId: spanInfo.spanId,
      parentSpanId: spanInfo.parentSpanId,
      traceId: this.traceId,
    };

    try {
      const spanId = await this.observa.trackLLMCall(payload);
      this.runMap.set(runId, {
        type: "llm",
        startTime: Date.now(),
        spanId: typeof spanId === "string" ? spanId : undefined,
        parentSpanId: spanInfo.parentSpanId,
        model,
        input,
        inputMessages,
        extraParams: extraParams || null,
        streamingTokens: [],
      });
    } catch {
      this.runMap.set(runId, {
        type: "llm",
        startTime: Date.now(),
        spanId: spanInfo.spanId,
        parentSpanId: spanInfo.parentSpanId,
        model,
        input,
        inputMessages,
        extraParams: extraParams || null,
        streamingTokens: [],
      });
    }
  }

  async handleLLMNewToken(
    token: string,
    _idx: any,
    runId: string,
    _parentRunId?: string,
  ) {
    const run = this.runMap.get(runId);
    if (run?.type === "llm") {
      if (!run.firstTokenTime) {
        run.firstTokenTime = Date.now();
      }
      if (!run.streamingTokens) {
        run.streamingTokens = [];
      }
      run.streamingTokens.push(token);
    }
  }

  async handleLLMEnd(output: any, runId: string) {
    const run = this.runMap.get(runId);
    if (run?.type === "llm") {
      const latency = Date.now() - run.startTime;
      const timeToFirstToken = run.firstTokenTime
        ? run.firstTokenTime - run.startTime
        : null;

      // Extract output text and messages from LangChain output
      const extracted = this.extractLLMOutput(output, run);
      const outputText = extracted.outputText;
      const outputMessages = extracted.outputMessages;

      // Extract token usage
      const tokens = this.extractTokenUsage(output, run, outputText);

      // Extract tool definitions
      const toolDefinitions = this.extractToolDefinitions(run.extraParams);

      // Build comprehensive llm_call payload
      const llmPayload = {
        model: run.model || "unknown",
        input: run.input ?? null,
        output: outputText,
        input_tokens: tokens.inputTokens,
        output_tokens: tokens.outputTokens,
        total_tokens: tokens.totalTokens,
        latency_ms: latency,
        time_to_first_token_ms: timeToFirstToken,
        finish_reason: this.extractFinishReason(output),
        response_id: runId,
        operation_name: "chat",
        provider_name: this.inferProvider(run.model || "unknown"),
        response_model: this.extractResponseModel(
          output,
          run.model !== undefined ? run.model : null,
        ),
        input_messages: run.inputMessages || null,
        output_messages: outputMessages || null,
        tool_definitions: toolDefinitions || null,
        tools: toolDefinitions || null,
      };

      const normalizedAttributes = AttributeNormalizer.normalize({
        llm_call: llmPayload,
      });
      const attributesJson = this.buildAttributesJson(normalizedAttributes);

      // Use rootSpanId as parent if this is a top-level LLM call
      const parentSpanId = run.parentSpanId || this.rootSpanId || null;

      try {
        await this.observa.trackLLMCall({
          model: llmPayload.model,
          input: llmPayload.input,
          output: llmPayload.output,
          latencyMs: latency,
          attributes:
            normalizedAttributes &&
            typeof normalizedAttributes === "object" &&
            !Array.isArray(normalizedAttributes)
              ? (normalizedAttributes as Record<string, JsonValue>)
              : undefined,
          attributes_json: attributesJson,
          spanId: run.spanId || null,
          parentSpanId: parentSpanId,
          traceId: this.traceId,
        });
      } catch {
        // Never throw
      }
    }
    this.spanManager.deleteSpan(runId);
    this.runMap.delete(runId);
  }

  async handleToolStart(
    tool: any,
    input: unknown,
    runId: string,
    parentRunId?: string,
  ) {
    const spanInfo = this.spanManager.createSpan(
      runId,
      (parentRunId || this.activeChainRunId || null) as string | null,
    );
    const toolName = tool?.name || "unknown";
    const toolArgs = AttributeNormalizer.normalize(input);

    const payload = {
      toolName,
      args: toolArgs,
      result: null,
      resultStatus: "success" as const,
      latencyMs: 0,
      attributes: this.normalizeAttributes({
        tool: this.normalizeAttributes(tool),
      }),
      spanId: spanInfo.spanId,
      parentSpanId: spanInfo.parentSpanId,
      traceId: this.traceId,
    };

    try {
      const spanId = await this.observa.trackToolCall(payload);
      this.runMap.set(runId, {
        type: "tool",
        startTime: Date.now(),
        spanId: typeof spanId === "string" ? spanId : undefined,
        parentSpanId: spanInfo.parentSpanId,
        toolName,
        toolArgs,
      });
    } catch {
      this.runMap.set(runId, {
        type: "tool",
        startTime: Date.now(),
        spanId: spanInfo.spanId,
        parentSpanId: spanInfo.parentSpanId,
        toolName,
        toolArgs,
      });
    }
  }

  async handleToolEnd(output: unknown, runId: string) {
    const run = this.runMap.get(runId);
    if (run?.type === "tool") {
      const latency = Date.now() - run.startTime;
      const toolName = this.getToolNameFromRun(run);
      const toolArgs = this.getToolArgsFromRun(run);

      const toolPayload = {
        tool_name: toolName,
        args: toolArgs,
        result: AttributeNormalizer.normalize(output),
        result_status: "success" as const,
        latency_ms: latency,
        operation_name: "execute_tool",
      };

      const normalizedAttributes = AttributeNormalizer.normalize({
        tool_call: toolPayload,
      });
      const attributesJson = this.buildAttributesJson(normalizedAttributes);

      try {
        await this.observa.trackToolCall({
          toolName,
          args: toolArgs,
          result: AttributeNormalizer.normalize(output),
          resultStatus: "success",
          latencyMs: latency,
          attributes:
            normalizedAttributes &&
            typeof normalizedAttributes === "object" &&
            !Array.isArray(normalizedAttributes)
              ? (normalizedAttributes as Record<string, JsonValue>)
              : undefined,
          attributes_json: attributesJson,
          spanId: run.spanId || null,
          parentSpanId: run.parentSpanId || null,
          traceId: this.traceId,
        });
      } catch {
        // Never throw
      }
    }
    this.spanManager.deleteSpan(runId);
    this.runMap.delete(runId);
  }

  async handleChainError(err: Error) {
    try {
      await this.observa.trackError({
        errorType: "chain_error",
        errorMessage: err.message,
        stackTrace: err.stack || null,
      });
    } catch {
      // Never throw
    }
  }

  async handleToolError(err: Error, runId: string) {
    const run = this.runMap.get(runId);
    if (run?.type === "tool") {
      const latency = Date.now() - run.startTime;
      const toolName = this.getToolNameFromRun(run);
      const toolArgs = this.getToolArgsFromRun(run);

      const toolPayload = {
        tool_name: toolName,
        args: toolArgs,
        result: null,
        result_status: "error" as const,
        latency_ms: latency,
        error_message: err.message,
        error_type: err.name,
        error_category: "tool_error",
        operation_name: "execute_tool",
      };

      const normalizedAttributes = AttributeNormalizer.normalize({
        tool_call: toolPayload,
      });
      const attributesJson = this.buildAttributesJson(normalizedAttributes);

      try {
        await this.observa.trackToolCall({
          toolName,
          args: toolArgs,
          result: null,
          resultStatus: "error",
          latencyMs: latency,
          attributes:
            normalizedAttributes &&
            typeof normalizedAttributes === "object" &&
            !Array.isArray(normalizedAttributes)
              ? (normalizedAttributes as Record<string, JsonValue>)
              : undefined,
          attributes_json: attributesJson,
          spanId: run.spanId || null,
          parentSpanId: run.parentSpanId || null,
          traceId: this.traceId,
        });
      } catch {
        // Never throw
      }
      this.spanManager.deleteSpan(runId);
      this.runMap.delete(runId);
    } else {
      try {
        await this.observa.trackError({
          errorType: "tool_error",
          errorMessage: err.message,
          stackTrace: err.stack || null,
        });
      } catch {
        // Never throw
      }
    }
  }

  async handleLLMError(err: Error) {
    try {
      await this.observa.trackError({
        errorType: "llm_error",
        errorMessage: err.message,
        stackTrace: err.stack || null,
      });
    } catch {
      // Never throw
    }
  }

  async handleChainEnd(outputs: any, runId: string) {
    const run = this.runMap.get(runId);
    if (run?.type === "chain") {
      const latency = Date.now() - (run.startTime || Date.now());
      
      // Only create trace_end for root chain
      if (runId === this.activeChainRunId && this.rootSpanId && this.chainStartTime) {
        const totalLatency = Date.now() - this.chainStartTime;
        
        const traceEndPayload = {
          total_latency_ms: totalLatency,
          outcome: "success",
          created_at: new Date().toISOString(),
        };

        const normalizedAttributes = AttributeNormalizer.normalize({
          trace_end: traceEndPayload,
        });
        const attributesJson = this.buildAttributesJson(normalizedAttributes);

        // Try to use trackTraceStart for trace_end if available
        // (we can reuse the same method signature)
        if (this.observa.trackTraceStart) {
          try {
            const traceEndSpanId = `${this.rootSpanId}-end`;
            await this.observa.trackTraceStart({
              spanId: traceEndSpanId,
              parentSpanId: this.rootSpanId,
              traceId: this.traceId,
              attributes:
                normalizedAttributes &&
                typeof normalizedAttributes === "object" &&
                !Array.isArray(normalizedAttributes)
                  ? (normalizedAttributes as Record<string, JsonValue>)
                  : undefined,
              attributes_json: attributesJson,
            });
          } catch {
            // Never throw
          }
        }
      }
    }
    this.spanManager.deleteSpan(runId);
    this.runMap.delete(runId);
  }

  async endTrace() {
    try {
      await this.observa.endTrace();
    } catch {
      // Never throw
    }
    this.traceId = null;
    this.rootSpanId = null;
    this.chainStartTime = null;
    this.runMap.clear();
    this.spanManager.clear();
    this.activeChainRunId = null;
  }

  private normalizeAttributes(input: unknown): Record<string, JsonValue> {
    const normalized = AttributeNormalizer.normalize(input);
    const json = AttributeNormalizer.safeStringify(normalized);
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, JsonValue>;
      }
    } catch {
      // Ignore parse errors; fall back to empty object
    }
    return {};
  }

  private safeString(input: unknown): string | null {
    if (input === null || input === undefined) return null;
    if (typeof input === "string") return input;
    return AttributeNormalizer.safeStringify(input);
  }

  /**
   * Build a JSON string for attributes_json, guaranteed parseable.
   */
  private buildAttributesJson(input: unknown): string {
    try {
      const normalized = AttributeNormalizer.normalize(input);
      const json = JSON.stringify(normalized);
      JSON.parse(json);
      return json;
    } catch {
      return "{}";
    }
  }

  /**
   * Extract output text and messages from LangChain LLM output.
   */
  private extractLLMOutput(
    output: any,
    run: RunState,
  ): { outputText: string | null; outputMessages: Array<Record<string, any>> | null } {
    let outputText: string | null = null;
    let outputMessages: Array<Record<string, any>> | null = null;

    try {
      // Handle generations array (standard LangChain format)
      if (output?.generations && Array.isArray(output.generations)) {
        const first = output.generations[0];
        const generation = Array.isArray(first) ? first[0] : first;

        if (generation?.message) {
          const msg = generation.message;
          outputText = this.extractMessageContent(msg.content || msg.text || "");
          outputMessages = this.convertMessage(msg);
        } else if (generation?.text) {
          outputText = generation.text;
          outputMessages = [{ role: "assistant", content: outputText }];
        }
      }
      // Handle direct text property
      else if (output?.text && typeof output.text === "string") {
        outputText = output.text;
        outputMessages = [{ role: "assistant", content: outputText }];
      }
      // Handle message content directly
      else if (output?.content) {
        outputText = this.extractMessageContent(output.content);
        outputMessages = [{ role: "assistant", content: outputText }];
      }
      // Fallback: reconstruct from streaming tokens
      if (!outputText && run.streamingTokens && run.streamingTokens.length > 0) {
        outputText = run.streamingTokens.join("");
        outputMessages = [{ role: "assistant", content: outputText }];
      }
    } catch {
      // Fallback to streaming tokens if extraction fails
      if (run.streamingTokens && run.streamingTokens.length > 0) {
        outputText = run.streamingTokens.join("");
        outputMessages = [{ role: "assistant", content: outputText }];
      }
    }

    return { outputText, outputMessages };
  }

  /**
   * Extract text from LangChain message content.
   */
  private extractMessageContent(content: any): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item?.text) return item.text;
          if (item?.content) return this.extractMessageContent(item.content);
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    if (content?.text) return content.text;
    if (content?.content) return this.extractMessageContent(content.content);
    return String(content || "");
  }

  /**
   * Convert LangChain message to Observa message format.
   */
  private convertMessage(msg: any): Array<Record<string, any>> {
    const content = this.extractMessageContent(msg.content || msg.text || "");
    const result: Record<string, any> = {
      role: msg._getType?.() || msg.role || "assistant",
      content,
    };

    // Extract tool_calls and function_call from additional_kwargs
    const kwargs = msg.additional_kwargs || msg.kwargs?.additional_kwargs || {};
    if (kwargs.function_call || kwargs.tool_calls) {
      result.additional_kwargs = {};
      if (kwargs.function_call) {
        result.additional_kwargs.function_call = this.normalizeFunctionCall(
          kwargs.function_call,
        );
      }
      if (kwargs.tool_calls) {
        result.additional_kwargs.tool_calls = Array.isArray(kwargs.tool_calls)
          ? kwargs.tool_calls.map((tc: any) => this.normalizeToolCall(tc))
          : [];
      }
    }

    return [result];
  }

  /**
   * Normalize function_call arguments (handle JSON strings).
   */
  private normalizeFunctionCall(fc: any): any {
    if (!fc || typeof fc !== "object") return fc;
    const normalized = { ...fc };
    if (typeof fc.arguments === "string") {
      try {
        normalized.arguments = JSON.parse(fc.arguments);
      } catch {
        // Try to fix malformed JSON
        const fixed = fc.arguments
          .replace(/\\\\/g, "\\")
          .replace(/\\'/g, "'");
        try {
          normalized.arguments = JSON.parse(fixed);
        } catch {
          normalized.arguments = fc.arguments;
        }
      }
    }
    return normalized;
  }

  /**
   * Normalize tool_call (handle function.arguments as JSON string).
   */
  private normalizeToolCall(tc: any): any {
    if (!tc || typeof tc !== "object") return tc;
    const normalized = { ...tc };
    if (tc.function && typeof tc.function === "object") {
      normalized.function = { ...tc.function };
      if (typeof tc.function.arguments === "string") {
        try {
          normalized.function.arguments = JSON.parse(tc.function.arguments);
        } catch {
          const fixed = tc.function.arguments
            .replace(/\\\\/g, "\\")
            .replace(/\\'/g, "'");
          try {
            normalized.function.arguments = JSON.parse(fixed);
          } catch {
            normalized.function.arguments = tc.function.arguments;
          }
        }
      }
    }
    return normalized;
  }

  /**
   * Extract token usage from LangChain output.
   */
  private extractTokenUsage(
    output: any,
    run: RunState,
    outputText: string | null,
  ): {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  } {
    try {
      const usageMetadata =
        output?.generations?.[0]?.[0]?.message?.usage_metadata;
      const tokenUsage = output?.llmOutput?.tokenUsage || output?.tokenUsage || {};

      const inputTokens =
        usageMetadata?.input_tokens ||
        tokenUsage.promptTokens ||
        (run.input ? Math.ceil(run.input.length / 4) : null);

      const outputTokens =
        usageMetadata?.output_tokens ||
        tokenUsage.completionTokens ||
        (outputText ? Math.ceil(outputText.length / 4) : null);

      const totalTokens =
        usageMetadata?.total_tokens ||
        tokenUsage.totalTokens ||
        (inputTokens && outputTokens ? inputTokens + outputTokens : null);

      return {
        inputTokens: inputTokens ?? null,
        outputTokens: outputTokens ?? null,
        totalTokens: totalTokens ?? null,
      };
    } catch {
      return { inputTokens: null, outputTokens: null, totalTokens: null };
    }
  }

  /**
   * Extract tool definitions from extraParams.
   */
  private extractToolDefinitions(
    extraParams: Record<string, any> | null | undefined,
  ): Array<Record<string, any>> | null {
    if (!extraParams?.tools) return null;

    try {
      const tools = extraParams.tools;
      let toolsArray: Array<{ tool: any; name?: string }> = [];

      if (Array.isArray(tools)) {
        toolsArray = tools.map((tool: any) => ({ tool }));
      } else if (tools instanceof Map) {
        const mapEntries = Array.from(tools.entries());
        toolsArray = mapEntries.map(([key, value]) => ({
          tool: value,
          name: String(key),
        }));
      } else if (typeof tools === "object") {
        toolsArray = Object.entries(tools).map(([key, value]) => ({
          tool: value,
          name: key,
        }));
      }

      const normalized = toolsArray.map(({ tool, name: keyName }) => {
        if (typeof tool === "function") {
          return {
            type: "function",
            name: tool.name || keyName || "unknown",
            description: tool.description || null,
            inputSchema: tool.parameters || tool.schema || {},
          };
        }
        if (tool && typeof tool === "object") {
          return {
            type: tool.type || "function",
            name: tool.name || tool.function?.name || keyName || "unknown",
            description: tool.description || tool.function?.description || null,
            inputSchema:
              tool.parameters ||
              tool.schema ||
              tool.inputSchema ||
              tool.function?.parameters ||
              {},
          };
        }
        return {
          type: "function",
          name: keyName || "unknown",
          description: null,
          inputSchema: {},
        };
      });

      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  }

  /**
   * Extract finish reason from output.
   */
  private extractFinishReason(output: any): string | null {
    try {
      return (
        output?.generations?.[0]?.[0]?.message?.response_metadata?.finish_reason ||
        output?.llmOutput?.finishReason ||
        output?.finishReason ||
        null
      );
    } catch {
      return null;
    }
  }

  /**
   * Extract response model from output.
   */
  private extractResponseModel(output: any, defaultModel: string | null): string | null {
    try {
      return (
        output?.generations?.[0]?.[0]?.message?.response_metadata?.model_name ||
        output?.llmOutput?.modelName ||
        output?.model ||
        defaultModel ||
        null
      );
    } catch {
      return defaultModel || null;
    }
  }

  /**
   * Infer provider name from model string.
   */
  private inferProvider(model: string): string {
    const modelLower = model.toLowerCase();
    if (modelLower.includes("gpt") || modelLower.includes("openai")) return "openai";
    if (modelLower.includes("claude") || modelLower.includes("anthropic"))
      return "anthropic";
    if (modelLower.includes("gemini") || modelLower.includes("google")) return "google";
    return "langchain";
  }

  /**
   * Get tool name from run state (stored during handleToolStart).
   */
  private getToolNameFromRun(run: RunState): string {
    return run.toolName || "unknown";
  }

  /**
   * Get tool args from run state.
   */
  private getToolArgsFromRun(run: RunState): JsonValue {
    return run.toolArgs || {};
  }

  /**
   * Extract chain type from LangChain chain object.
   */
  private extractChainType(chain: any): string {
    try {
      if (chain?.id && Array.isArray(chain.id)) {
        return chain.id[chain.id.length - 1] || "unknown";
      }
      if (chain?.id && typeof chain.id === "string") {
        return chain.id;
      }
      if (chain?.constructor?.name) {
        return chain.constructor.name;
      }
      if (chain?.name) {
        return chain.name;
      }
    } catch {
      // Fall through to default
    }
    return "unknown";
  }

  /**
   * Extract number of prompts from inputs.
   */
  private extractNumPrompts(inputs: unknown): number {
    try {
      if (Array.isArray(inputs)) {
        return inputs.length;
      }
      if (inputs && typeof inputs === "object") {
        // Check for common LangChain input patterns
        const inputObj = inputs as Record<string, any>;
        if (inputObj.input && Array.isArray(inputObj.input)) {
          return inputObj.input.length;
        }
        if (inputObj.inputs && Array.isArray(inputObj.inputs)) {
          return inputObj.inputs.length;
        }
        if (inputObj.messages && Array.isArray(inputObj.messages)) {
          return inputObj.messages.length;
        }
        // If it's an object with string values, count them
        const values = Object.values(inputObj);
        if (values.length > 0) {
          return values.length;
        }
      }
    } catch {
      // Fall through to default
    }
    return 1; // Default to 1 prompt
  }
}

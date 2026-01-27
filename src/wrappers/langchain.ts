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
  startTrace(payload: { name: string }): string | Promise<string>;
  endTrace(): void | Promise<void>;
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
  private runMap: Map<string, RunState> = new Map();
  private spanManager: SpanManager;
  private activeChainRunId: string | null = null;

  constructor(observaClient: ObservaClient) {
    super();
    this.observa = observaClient;
    this.spanManager = new SpanManager();
  }

  async handleChainStart(
    chain: any,
    _inputs: unknown,
    runId: string,
    parentRunId?: string,
  ) {
    if (!this.traceId) {
      try {
        const traceId = await this.observa.startTrace({
          name: chain?.name || "LangChain Chain",
        });
        this.traceId = typeof traceId === "string" ? traceId : this.traceId;
      } catch {
        // Never throw - continue without traceId
      }
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
  ) {
    const parentForSpan = parentRunId || this.activeChainRunId;
    const spanInfo = this.spanManager.createSpan(runId, parentForSpan || null);
    const model = llm?.modelName || "unknown";
    const input = prompts.join("\n");

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
      });
    } catch {
      this.runMap.set(runId, {
        type: "llm",
        startTime: Date.now(),
        spanId: spanInfo.spanId,
        parentSpanId: spanInfo.parentSpanId,
        model,
        input,
      });
    }
  }

  async handleLLMEnd(output: any, runId: string) {
    const run = this.runMap.get(runId);
    if (run?.type === "llm") {
      const latency = Date.now() - run.startTime;
      const llmPayload = {
        model: run.model || "unknown",
        input: run.input ?? null,
        output: this.safeString(output),
      };
      const attributesJson = this.buildAttributesJson({ llm_call: llmPayload });

      try {
        await this.observa.trackLLMCall({
          model: llmPayload.model,
          input: llmPayload.input,
          output: llmPayload.output,
          latencyMs: latency,
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

  async handleToolStart(tool: any, input: unknown, runId: string) {
    const spanInfo = this.spanManager.createSpan(
      runId,
      this.activeChainRunId || null,
    );
    const payload = {
      toolName: tool?.name || "unknown",
      args: AttributeNormalizer.normalize(input),
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
      });
    } catch {
      this.runMap.set(runId, {
        type: "tool",
        startTime: Date.now(),
        spanId: spanInfo.spanId,
        parentSpanId: spanInfo.parentSpanId,
      });
    }
  }

  async handleToolEnd(output: unknown, runId: string) {
    const run = this.runMap.get(runId);
    if (run?.type === "tool") {
      const latency = Date.now() - run.startTime;
      try {
        await this.observa.trackToolCall({
          toolName: "unknown",
          args: {},
          result: AttributeNormalizer.normalize(output),
          resultStatus: "success",
          latencyMs: latency,
          attributes: this.normalizeAttributes({}),
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

  async handleToolError(err: Error) {
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

  async endTrace() {
    try {
      await this.observa.endTrace();
    } catch {
      // Never throw
    }
    this.traceId = null;
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
}

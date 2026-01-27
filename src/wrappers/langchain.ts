/**
 * Observa LangChain Integration Wrapper
 *
 * Provides a defensive LangChain callback handler that:
 * - Normalizes attributes to avoid double-escaped JSON
 * - Validates serialization before sending to Observa/Tinybird
 * - Never throws (all failures fall back to safe values)
 */
import { BaseCallbackHandler } from "langchain/callbacks";
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
  }): string | void | Promise<string | void>;
  trackToolCall(payload: {
    toolName: string;
    args: JsonValue;
    result: JsonValue | null;
    resultStatus: "success" | "error";
    latencyMs: number | null;
    attributes?: Record<string, JsonValue>;
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
};

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

  constructor(observaClient: ObservaClient) {
    super();
    this.observa = observaClient;
  }

  async handleChainStart(chain: any, _inputs: unknown, runId: string) {
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

    this.runMap.set(runId, {
      type: "chain",
      startTime: Date.now(),
    });
  }

  async handleLLMStart(llm: any, prompts: string[], runId: string) {
    const payload = {
      model: llm?.modelName || "unknown",
      input: prompts.join("\n"),
      output: null,
      latencyMs: 0,
      attributes: this.normalizeAttributes({
        llm: this.normalizeAttributes(llm),
      }),
    };

    try {
      const spanId = await this.observa.trackLLMCall(payload);
      this.runMap.set(runId, {
        type: "llm",
        startTime: Date.now(),
        spanId: typeof spanId === "string" ? spanId : undefined,
      });
    } catch {
      this.runMap.set(runId, {
        type: "llm",
        startTime: Date.now(),
      });
    }
  }

  async handleLLMEnd(output: any, runId: string) {
    const run = this.runMap.get(runId);
    if (run?.type === "llm") {
      const latency = Date.now() - run.startTime;
      try {
        await this.observa.trackLLMCall({
          model: "unknown",
          input: null,
          output: this.safeString(output),
          latencyMs: latency,
          attributes: this.normalizeAttributes({}),
        });
      } catch {
        // Never throw
      }
    }
    this.runMap.delete(runId);
  }

  async handleToolStart(tool: any, input: unknown, runId: string) {
    const payload = {
      toolName: tool?.name || "unknown",
      args: AttributeNormalizer.normalize(input),
      result: null,
      resultStatus: "success" as const,
      latencyMs: 0,
      attributes: this.normalizeAttributes({
        tool: this.normalizeAttributes(tool),
      }),
    };

    try {
      const spanId = await this.observa.trackToolCall(payload);
      this.runMap.set(runId, {
        type: "tool",
        startTime: Date.now(),
        spanId: typeof spanId === "string" ? spanId : undefined,
      });
    } catch {
      this.runMap.set(runId, {
        type: "tool",
        startTime: Date.now(),
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
}

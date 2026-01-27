/**
 * AttributeNormalizer
 *
 * Recursively normalizes attributes to be safe for JSON serialization.
 * - Parses JSON-like strings into objects/arrays when possible.
 * - Converts unsupported types (BigInt, Function, Symbol, undefined) to safe values.
 * - Handles circular references with a stable placeholder.
 *
 * Key guarantee: normalize() -> JSON.stringify() -> JSON.parse() should not throw.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AttributeNormalizerOptions {
  /** Maximum recursion depth to avoid runaway parsing. */
  maxDepth?: number;
  /** Whether to attempt parsing JSON strings. */
  parseJsonStrings?: boolean;
  /** Maximum string length to attempt JSON parsing. */
  maxParseLength?: number;
}

export class AttributeNormalizer {
  private static readonly DEFAULTS: Required<AttributeNormalizerOptions> = {
    maxDepth: 12,
    parseJsonStrings: true,
    maxParseLength: 50000,
  };

  /**
   * Normalize any value into JSON-safe data.
   */
  static normalize(input: unknown, options?: AttributeNormalizerOptions): JsonValue {
    const merged = { ...AttributeNormalizer.DEFAULTS, ...(options || {}) };
    const seen = new WeakSet<object>();
    return AttributeNormalizer.normalizeValue(input, merged, merged.maxDepth, seen);
  }

  /**
   * Normalize and stringify. Ensures JSON.parse() can read the result.
   * Falls back to "{}" if serialization is not possible.
   */
  static safeStringify(
    input: unknown,
    options?: AttributeNormalizerOptions,
  ): string {
    const normalized = AttributeNormalizer.normalize(input, options);
    try {
      const json = JSON.stringify(normalized);
      if (typeof json !== "string") return "{}";
      JSON.parse(json);
      return json;
    } catch {
      return "{}";
    }
  }

  private static normalizeValue(
    value: unknown,
    options: Required<AttributeNormalizerOptions>,
    depth: number,
    seen: WeakSet<object>,
  ): JsonValue {
    if (depth <= 0) return AttributeNormalizer.toSafePrimitive(value);
    if (value === null) return null;

    const type = typeof value;
    if (type === "string") {
      return AttributeNormalizer.normalizeString(value, options, depth, seen);
    }
    if (type === "number" || type === "boolean") return value;
    if (type === "bigint") return value.toString();
    if (type === "undefined") return null;
    if (type === "function" || type === "symbol") return String(value);

    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack || null,
      };
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        AttributeNormalizer.normalizeValue(item, options, depth - 1, seen),
      );
    }

    if (typeof value === "object") {
      if (seen.has(value as object)) return "[Circular]";
      seen.add(value as object);

      const result: Record<string, JsonValue> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = AttributeNormalizer.normalizeValue(
          val,
          options,
          depth - 1,
          seen,
        );
      }
      return result;
    }

    return AttributeNormalizer.toSafePrimitive(value);
  }

  private static normalizeString(
    value: string,
    options: Required<AttributeNormalizerOptions>,
    depth: number,
    seen: WeakSet<object>,
  ): JsonValue {
    if (!options.parseJsonStrings) return value;
    if (value.length > options.maxParseLength) return value;

    const trimmed = value.trim();
    if (!AttributeNormalizer.looksLikeJson(trimmed)) return value;

    const parsed = AttributeNormalizer.tryParseJson(trimmed);
    if (parsed.success) {
      return AttributeNormalizer.normalizeValue(parsed.value, options, depth - 1, seen);
    }

    // Try to decode stringified JSON (e.g., "{\"key\":\"value\"}")
    const unwrapped = AttributeNormalizer.tryUnwrapJsonString(trimmed);
    if (unwrapped !== null) {
      const decoded = AttributeNormalizer.tryParseJson(unwrapped);
      if (decoded.success) {
        return AttributeNormalizer.normalizeValue(
          decoded.value,
          options,
          depth - 1,
          seen,
        );
      }
    }

    return value;
  }

  private static looksLikeJson(value: string): boolean {
    if (value.length < 2) return false;
    if (value.startsWith("{") && value.endsWith("}")) return true;
    if (value.startsWith("[") && value.endsWith("]")) return true;
    if (value.startsWith('"') && value.endsWith('"')) return true;
    if (value.startsWith('\\"{') || value.startsWith('\\"[')) return true;
    return false;
  }

  private static tryParseJson(input: string): { success: true; value: unknown } | { success: false } {
    try {
      return { success: true, value: JSON.parse(input) };
    } catch {
      return { success: false };
    }
  }

  private static tryUnwrapJsonString(value: string): string | null {
    if (!value.startsWith('"') || !value.endsWith('"')) return null;
    try {
      const decoded = JSON.parse(value);
      return typeof decoded === "string" ? decoded : null;
    } catch {
      return null;
    }
  }

  private static toSafePrimitive(value: unknown): JsonPrimitive {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    return String(value);
  }
}

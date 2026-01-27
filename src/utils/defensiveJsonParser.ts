/**
 * DefensiveJSONParser
 *
 * Safely parses JSON with multiple fallback strategies.
 * Never throws - always returns a fallback value.
 */
export interface DefensiveJSONParserOptions<T> {
  /** Fallback value when parsing fails. */
  fallback: T;
  /** Maximum number of repair attempts. */
  maxAttempts?: number;
}

export class DefensiveJSONParser {
  private static readonly DEFAULT_MAX_ATTEMPTS = 6;

  /**
   * Parse any input into JSON with defensive fallbacks.
   */
  static parse<T>(input: unknown, options: DefensiveJSONParserOptions<T>): T {
    const maxAttempts = options.maxAttempts ?? DefensiveJSONParser.DEFAULT_MAX_ATTEMPTS;

    if (input === null || input === undefined) return options.fallback;
    if (typeof input === "object") return input as T;

    if (typeof input !== "string") {
      return options.fallback;
    }

    const raw = input.trim();
    if (!raw) return options.fallback;

    const candidates = DefensiveJSONParser.buildCandidates(raw).slice(0, maxAttempts);
    for (const candidate of candidates) {
      const parsed = DefensiveJSONParser.tryParseJson(candidate);
      if (parsed.success) return parsed.value as T;
    }

    // Last resort: try to unescape and parse once more
    const unescaped = DefensiveJSONParser.unescapeJsonString(raw);
    if (unescaped !== raw) {
      const parsed = DefensiveJSONParser.tryParseJson(unescaped);
      if (parsed.success) return parsed.value as T;
    }

    return options.fallback;
  }

  /**
   * Parse and ensure the result is an object. Falls back to {}.
   */
  static parseObject(
    input: unknown,
    options?: Partial<DefensiveJSONParserOptions<Record<string, unknown>>>,
  ): Record<string, unknown> {
    const fallback = options?.fallback ?? {};
    const parsed = DefensiveJSONParser.parse<Record<string, unknown>>(input, {
      fallback,
      maxAttempts: options?.maxAttempts,
    });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return fallback;
  }

  private static buildCandidates(raw: string): string[] {
    const candidates = [raw];

    // Fix common malformed arguments patterns that cause double-escaped JSON.
    candidates.push(DefensiveJSONParser.fixMalformedArguments(raw));
    candidates.push(DefensiveJSONParser.fixMissingObjectBraces(raw));
    candidates.push(DefensiveJSONParser.escapeControlCharacters(raw));

    // Try to unwrap double-encoded JSON strings.
    const unwrapped = DefensiveJSONParser.tryUnwrapJsonString(raw);
    if (unwrapped !== null) {
      candidates.push(unwrapped);
      candidates.push(DefensiveJSONParser.fixMalformedArguments(unwrapped));
    }

    return candidates.filter(Boolean);
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

  private static unescapeJsonString(value: string): string {
    try {
      return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
    } catch {
      return value
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t");
    }
  }

  private static escapeControlCharacters(value: string): string {
    return value.replace(/[\u0000-\u001F\u007F]/g, (ch) => {
      switch (ch) {
        case "\n":
          return "\\n";
        case "\r":
          return "\\r";
        case "\t":
          return "\\t";
        default:
          return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
      }
    });
  }

  /**
   * Fix patterns like: "arguments":""key":"value""
   * and escaped variants.
   */
  private static fixMalformedArguments(value: string): string {
    let output = value;

    const literalPattern =
      /"arguments"\s*:\s*""([^"]+)"\s*:\s*"([^"]*)"([,}])/g;
    output = output.replace(
      literalPattern,
      (_match, key: string, val: string, suffix: string) => {
        return `"arguments":${JSON.stringify({ [key]: val })}${suffix}`;
      },
    );

    const escapedPattern =
      /"arguments"\s*:\s*"\\"([^"\\]+)\\"\s*:\s*\\"([^"\\]*)\\""/g;
    output = output.replace(
      escapedPattern,
      (_match, key: string, val: string) => {
        return `"arguments":${JSON.stringify({ [key]: val })}`;
      },
    );

    const doubleEscapedPattern =
      /"arguments"\s*:\s*"\\\\"([^"\\\\]+)\\\\"\s*:\s*\\\\"([^"\\\\]*)\\\\""/g;
    output = output.replace(
      doubleEscapedPattern,
      (_match, key: string, val: string) => {
        return `"arguments":${JSON.stringify({ [key]: val })}`;
      },
    );

    return output;
  }

  /**
   * Fix missing opening brace in object properties:
   * "arguments":""query": -> "arguments":{"query":
   */
  private static fixMissingObjectBraces(value: string): string {
    return value
      .replace(
        /"arguments"\s*:\s*""\s*"([^"]+)"\s*:/g,
        '"arguments":{"$1":',
      )
      .replace(
        /"arguments"\s*:\s*""([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
        '"arguments":{"$1":',
      )
      .replace(
        /"arguments"\s*:\s*"\\"\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\\"\s*:/g,
        '"arguments":{"$1":',
      );
  }
}

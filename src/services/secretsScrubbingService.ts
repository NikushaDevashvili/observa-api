/**
 * Secrets Scrubbing Service
 *
 * Scans and redacts secrets/PII in event data before storage.
 * Emits a contains_secrets signal for tracking.
 */

interface ScrubbingPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

/**
 * Common secret patterns to detect and redact
 */
const SECRET_PATTERNS: ScrubbingPattern[] = [
  // OpenAI API keys
  {
    name: "openai_key",
    regex: /sk-[a-zA-Z0-9]{32,}/gi,
    replacement: "[REDACTED_OPENAI_KEY]",
  },
  // Generic API keys (sk_ prefix)
  {
    name: "api_key_sk",
    regex: /sk_[a-zA-Z0-9]{32,}/gi,
    replacement: "[REDACTED_API_KEY]",
  },
  // AWS access keys
  {
    name: "aws_access_key",
    regex: /AKIA[0-9A-Z]{16}/gi,
    replacement: "[REDACTED_AWS_KEY]",
  },
  // AWS secret keys
  {
    name: "aws_secret_key",
    regex:
      /[Aa][Ww][Ss][_ ]?[Ss][Ee][Cc][Rr][Ee][Tt][_ ]?[Aa][Cc][Cc][Ee][Ss][Ss][_ ]?[Kk][Ee][Yy][\s:=]+['"]?[A-Za-z0-9/+=]{40}/gi,
    replacement: "[REDACTED_AWS_SECRET]",
  },
  // GitHub tokens
  {
    name: "github_token",
    regex: /ghp_[a-zA-Z0-9]{36}/gi,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },
  // Generic bearer tokens
  {
    name: "bearer_token",
    regex: /[Bb]earer[\s:]+['"]?[A-Za-z0-9._-]{32,}/gi,
    replacement: "[REDACTED_BEARER_TOKEN]",
  },
  // Email addresses (optional - can be configured)
  {
    name: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[REDACTED_EMAIL]",
  },
  // Credit card numbers (basic pattern)
  {
    name: "credit_card",
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: "[REDACTED_CC]",
  },
  // SSN (US)
  {
    name: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED_SSN]",
  },
];

export interface ScrubbingResult {
  text: string;
  scrubbed: boolean;
  patternsFound: string[];
}

export class SecretsScrubbingService {
  /**
   * Scrub secrets from a text string
   */
  static scrubText(text: string | null | undefined): ScrubbingResult {
    if (!text || typeof text !== "string") {
      return {
        text: text || "",
        scrubbed: false,
        patternsFound: [],
      };
    }

    let scrubbed = false;
    const patternsFound: string[] = [];
    let result = text;

    for (const pattern of SECRET_PATTERNS) {
      const matches = result.match(pattern.regex);
      if (matches && matches.length > 0) {
        scrubbed = true;
        patternsFound.push(pattern.name);
        result = result.replace(pattern.regex, pattern.replacement);
      }
    }

    return {
      text: result,
      scrubbed,
      patternsFound: Array.from(new Set(patternsFound)), // Deduplicate
    };
  }

  /**
   * Scrub secrets from an object (recursively scans string values)
   */
  static scrubObject(obj: any): {
    obj: any;
    scrubbed: boolean;
    patternsFound: string[];
  } {
    if (obj === null || obj === undefined) {
      return { obj, scrubbed: false, patternsFound: [] };
    }

    if (typeof obj === "string") {
      const result = this.scrubText(obj);
      return {
        obj: result.text,
        scrubbed: result.scrubbed,
        patternsFound: result.patternsFound,
      };
    }

    if (Array.isArray(obj)) {
      let anyScrubbed = false;
      const allPatterns: string[] = [];
      const scrubbedArray = obj.map((item) => {
        const result = this.scrubObject(item);
        if (result.scrubbed) {
          anyScrubbed = true;
          allPatterns.push(...result.patternsFound);
        }
        return result.obj;
      });
      return {
        obj: scrubbedArray,
        scrubbed: anyScrubbed,
        patternsFound: Array.from(new Set(allPatterns)),
      };
    }

    if (typeof obj === "object") {
      let anyScrubbed = false;
      const allPatterns: string[] = [];
      const scrubbedObj: any = {};

      for (const [key, value] of Object.entries(obj)) {
        const result = this.scrubObject(value);
        scrubbedObj[key] = result.obj;
        if (result.scrubbed) {
          anyScrubbed = true;
          allPatterns.push(...result.patternsFound);
        }
      }

      return {
        obj: scrubbedObj,
        scrubbed: anyScrubbed,
        patternsFound: Array.from(new Set(allPatterns)),
      };
    }

    // Primitive types (number, boolean, etc.) - no scrubbing needed
    return { obj, scrubbed: false, patternsFound: [] };
  }

  /**
   * Scrub secrets from event attributes
   */
  static scrubEventAttributes(attributes: any): {
    attributes: any;
    containsSecrets: boolean;
    secretTypes: string[];
  } {
    // Focus on fields that commonly contain secrets
    const sensitiveFields = [
      "input",
      "output",
      "error_message",
      "args",
      "result",
    ];

    let containsSecrets = false;
    const allSecretTypes: string[] = [];

    const scrubbedAttributes = { ...attributes };

    // Scrub sensitive fields in attributes
    for (const field of sensitiveFields) {
      if (scrubbedAttributes[field] !== undefined) {
        const result = this.scrubObject(scrubbedAttributes[field]);
        scrubbedAttributes[field] = result.obj;
        if (result.scrubbed) {
          containsSecrets = true;
          allSecretTypes.push(...result.patternsFound);
        }
      }
    }

    // Also scrub nested objects (llm_call.input, tool_call.args, etc.)
    for (const [key, value] of Object.entries(scrubbedAttributes)) {
      if (value && typeof value === "object") {
        const result = this.scrubObject(value);
        scrubbedAttributes[key] = result.obj;
        if (result.scrubbed) {
          containsSecrets = true;
          allSecretTypes.push(...result.patternsFound);
        }
      }
    }

    return {
      attributes: scrubbedAttributes,
      containsSecrets,
      secretTypes: Array.from(new Set(allSecretTypes)),
    };
  }
}

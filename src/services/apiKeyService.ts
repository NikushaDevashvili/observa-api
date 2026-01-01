/**
 * API Key Service
 * 
 * Manages split API keys (sk_ server keys + pk_ publishable keys)
 */

import { query } from "../db/client.js";
import * as crypto from "crypto";

export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  project_id: string | null;
  name: string;
  key_prefix: "sk_" | "pk_";
  scopes: {
    ingest: boolean;
    query?: boolean;
  };
  allowed_origins: string[];
  revoked_at: Date | null;
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key
 */
export function generateApiKey(prefix: "sk_" | "pk_"): string {
  // Generate 48 random bytes (384 bits) and encode as base64url
  const randomBytes = crypto.randomBytes(48);
  const base64 = randomBytes.toString("base64");
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${prefix}${base64url}`;
}

export class ApiKeyService {
  /**
   * Validate API key and return key record
   */
  static async validateApiKey(key: string): Promise<ApiKeyRecord | null> {
    if (!key || (!key.startsWith("sk_") && !key.startsWith("pk_"))) {
      return null;
    }

    const keyHash = hashApiKey(key);

    const result = await query<ApiKeyRecord>(
      `SELECT id, tenant_id, project_id, name, key_prefix, scopes, allowed_origins, revoked_at
       FROM api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL`,
      [keyHash]
    );

    if (result.length === 0) {
      return null;
    }

    const keyRecord = result[0];
    
    // Update last_used_at
    await query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [keyRecord.id]
    );

    return keyRecord;
  }

  /**
   * Check if origin is allowed for publishable key
   */
  static isOriginAllowed(
    keyRecord: ApiKeyRecord,
    origin: string | undefined,
    referer: string | undefined
  ): boolean {
    // Server keys (sk_) don't have origin restrictions
    if (keyRecord.key_prefix === "sk_") {
      return true;
    }

    // Publishable keys (pk_) require origin validation
    if (keyRecord.key_prefix === "pk_") {
      const allowedOrigins = keyRecord.allowed_origins || [];
      
      // If no origins configured, reject (must explicitly allow)
      if (allowedOrigins.length === 0) {
        return false;
      }

      // Check origin header
      if (origin) {
        // Remove protocol and trailing slash for comparison
        const normalizedOrigin = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
        for (const allowed of allowedOrigins) {
          const normalizedAllowed = allowed.replace(/^https?:\/\//, "").replace(/\/$/, "");
          if (
            normalizedOrigin === normalizedAllowed ||
            normalizedOrigin.endsWith(`.${normalizedAllowed}`)
          ) {
            return true;
          }
        }
      }

      // Fallback to referer header
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          const normalizedReferer = refererUrl.hostname;
          for (const allowed of allowedOrigins) {
            try {
              const allowedUrl = new URL(allowed);
              if (
                normalizedReferer === allowedUrl.hostname ||
                normalizedReferer.endsWith(`.${allowedUrl.hostname}`)
              ) {
                return true;
              }
            } catch {
              // Invalid URL in allowed_origins, skip
            }
          }
        } catch {
          // Invalid referer URL
        }
      }

      return false;
    }

    return false;
  }

  /**
   * Check if key has required scope
   */
  static hasScope(
    keyRecord: ApiKeyRecord,
    requiredScope: "ingest" | "query"
  ): boolean {
    const scopes = keyRecord.scopes || { ingest: true, query: false };
    return scopes[requiredScope] === true;
  }

  /**
   * Create a new API key
   */
  static async createApiKey(params: {
    tenantId: string;
    projectId?: string | null;
    name: string;
    keyPrefix: "sk_" | "pk_";
    scopes?: { ingest: boolean; query?: boolean };
    allowedOrigins?: string[];
  }): Promise<{ key: string; keyRecord: ApiKeyRecord }> {
    const key = generateApiKey(params.keyPrefix);
    const keyHash = hashApiKey(key);

    const scopes = params.scopes || {
      ingest: true,
      query: params.keyPrefix === "sk_", // Server keys can query by default
    };

    const result = await query<ApiKeyRecord>(
      `INSERT INTO api_keys (tenant_id, project_id, name, key_prefix, key_hash, scopes, allowed_origins)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tenant_id, project_id, name, key_prefix, scopes, allowed_origins, revoked_at`,
      [
        params.tenantId,
        params.projectId || null,
        params.name,
        params.keyPrefix,
        keyHash,
        JSON.stringify(scopes),
        params.allowedOrigins || [],
      ]
    );

    return {
      key, // Return plaintext key (only shown once)
      keyRecord: result[0],
    };
  }
}


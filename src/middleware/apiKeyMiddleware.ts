/**
 * API Key Middleware
 * 
 * Validates API keys (sk_ or pk_) and enforces origin restrictions for pk_ keys
 */

import { Request, Response, NextFunction } from "express";
import { ApiKeyService } from "../services/apiKeyService.js";

export type RequiredScope = "ingest" | "query";

/**
 * API Key validation middleware
 */
export function apiKeyMiddleware(requiredScope: RequiredScope = "ingest") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing API key",
          details: {
            hint: "Provide a valid Bearer token in the Authorization header",
          },
        },
      });
      return;
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer " prefix

    // Validate API key
    const keyRecord = await ApiKeyService.validateApiKey(apiKey);
    if (!keyRecord) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing API key",
          details: {
            hint: "Provide a valid Bearer token in the Authorization header",
          },
        },
      });
      return;
    }

    // Check scope
    if (!ApiKeyService.hasScope(keyRecord, requiredScope)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "API key does not have permission for this operation",
          details: {
            reason: `${keyRecord.key_prefix === "pk_" ? "publishable" : "server"}_key_not_allowed_for_${requiredScope}`,
            key_prefix: keyRecord.key_prefix,
            required_scope: requiredScope,
          },
        },
      });
    }

    // Check origin for publishable keys
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (!ApiKeyService.isOriginAllowed(keyRecord, origin as string, referer)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "API key does not have permission for this operation",
          details: {
            reason: "origin_not_allowed",
            key_prefix: keyRecord.key_prefix,
            origin: origin || referer || "missing",
          },
        },
      });
      return;
    }

    // Set tenant/project context from key record
    (req as any).tenantId = keyRecord.tenant_id;
    (req as any).projectId = keyRecord.project_id;
    (req as any).apiKeyRecord = keyRecord;

    next();
  };
}


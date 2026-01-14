/**
 * API Key Middleware
 * 
 * Validates API keys (sk_ or pk_) or JWT tokens from signup
 * Enforces origin restrictions for pk_ keys
 */

import { Request, Response, NextFunction } from "express";
import { ApiKeyService } from "../services/apiKeyService.js";
import { TokenService } from "../services/tokenService.js";

export type RequiredScope = "ingest" | "query";

/**
 * API Key validation middleware
 * Accepts both API keys (sk_/pk_) and JWT tokens from signup
 */
export function apiKeyMiddleware(requiredScope: RequiredScope = "ingest") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Extract token from Authorization header
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

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Try to validate as API key first (sk_ or pk_ prefix)
    if (token.startsWith("sk_") || token.startsWith("pk_")) {
      const keyRecord = await ApiKeyService.validateApiKey(token);
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
        return;
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
      return;
    }

    // If not an API key, try to validate as JWT token (from signup/account)
    const jwtPayload = TokenService.validateToken(token);
    if (jwtPayload && jwtPayload.tenantId && jwtPayload.projectId) {
      // JWT token is valid - set tenant/project context
      (req as any).tenantId = jwtPayload.tenantId;
      (req as any).projectId = jwtPayload.projectId;
      
      next();
      return;
    }

    // JWT validation failed - decode without verification to check if it's expired
    // This helps diagnose the issue without exposing sensitive data
    const decodedPayload = TokenService.decodeToken(token);
    if (decodedPayload) {
      // Token format is valid but signature doesn't match or token expired
      const now = Math.floor(Date.now() / 1000);
      const isExpired = decodedPayload.exp && now > decodedPayload.exp;
      console.error("[apiKeyMiddleware] JWT validation failed", {
        tokenLength: token.length,
        tokenStartsWithEyJ: token.startsWith("eyJ"),
        isExpired,
        expiresAt: decodedPayload.exp ? new Date(decodedPayload.exp * 1000).toISOString() : null,
        tenantId: decodedPayload.tenantId, // Safe to log - helps identify the tenant
        projectId: decodedPayload.projectId, // Safe to log - helps identify the project
        errorType: isExpired ? "expired" : "signature_mismatch",
      });
    } else {
      // Token format is invalid
      console.error("[apiKeyMiddleware] JWT validation failed - invalid format", {
        tokenLength: token.length,
        tokenStartsWithEyJ: token.startsWith("eyJ"),
      });
    }

    // Return generic error - don't leak information about token structure
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired authentication token",
        details: {
          hint: "Provide a valid Bearer token (API key or JWT) in the Authorization header. If using a JWT, ensure it was generated with the same JWT_SECRET as the backend.",
        },
      },
    });
  };
}


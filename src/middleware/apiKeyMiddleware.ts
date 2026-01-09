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
    // JWT tokens typically start with "eyJ" (base64 encoded JSON header)
    if (!token.startsWith("eyJ")) {
      // Token doesn't match expected formats (sk_/pk_ or JWT)
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid token format",
          details: {
            hint: "Token must be either an API key (sk_... or pk_...) or a JWT token (eyJ...)",
            tokenPrefix: token.substring(0, 10) + "...",
          },
        },
      });
      return;
    }

    const jwtPayload = TokenService.validateToken(token);
    if (jwtPayload && jwtPayload.tenantId && jwtPayload.projectId) {
      // JWT token is valid - set tenant/project context
      (req as any).tenantId = jwtPayload.tenantId;
      (req as any).projectId = jwtPayload.projectId;
      
      next();
      return;
    }

    // JWT validation failed - try to decode without validation to get more info
    const decoded = TokenService.decodeToken(token);
    let errorDetails: any = {
      hint: "JWT token validation failed. Token may be expired, invalid, or malformed.",
      tokenType: "JWT",
    };

    if (decoded) {
      // Token is decodable but validation failed - likely expired or wrong secret
      errorDetails.decodedInfo = {
        hasTenantId: !!decoded.tenantId,
        hasProjectId: !!decoded.projectId,
        hasExpiry: !!decoded.exp,
        expiryTimestamp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
        isExpired: decoded.exp ? decoded.exp * 1000 < Date.now() : null,
      };
    } else {
      // Token is not even decodable - malformed
      errorDetails.decodedInfo = {
        error: "Token cannot be decoded - may be malformed",
      };
    }

    console.error("[apiKeyMiddleware] JWT validation failed:", {
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20),
      decoded: decoded ? {
        hasTenantId: !!decoded.tenantId,
        hasProjectId: !!decoded.projectId,
        exp: decoded.exp,
      } : null,
    });

    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired JWT token",
        details: errorDetails,
      },
    });
  };
}


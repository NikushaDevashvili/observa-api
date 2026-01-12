import { Router, Request, Response } from "express";
import { TenantService } from "../services/tenantService.js";
import { ApiKeyService } from "../services/apiKeyService.js";
import { TokenService } from "../services/tokenService.js";
import { tenantIdSchema } from "../validation/schemas.js";
import { z } from "zod";

const router = Router();

/**
 * DELETE /api/v1/tenants/:tenantId/tokens
 * Revoke all tokens for a tenant (JWT + Tinybird token)
 *
 * This endpoint:
 * 1. Revokes the Tinybird token via Tinybird API
 * 2. Removes the tenant token from storage (effectively revoking JWT)
 *
 * Response: {
 *   message: string;
 *   tenantId: string;
 * }
 */
router.delete("/:tenantId/tokens", async (req: Request, res: Response) => {
  try {
    // Validate tenantId parameter with Zod
    const validationResult = tenantIdSchema.safeParse(req.params);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid tenantId parameter",
        details: validationResult.error.issues,
      });
    }

    const { tenantId } = validationResult.data;

    await TenantService.revokeTenantTokens(tenantId);

    return res.status(200).json({
      message: `Tokens revoked successfully for tenant ${tenantId}`,
      tenantId,
    });
  } catch (error) {
    console.error("Error revoking tenant tokens:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    // Handle case where tenant doesn't exist
    if (errorMessage.includes("No tokens found")) {
      return res.status(404).json({
        error: errorMessage,
      });
    }

    return res.status(500).json({
      error: errorMessage,
    });
  }
});

/**
 * GET /api/v1/tenants/:tenantId/api-keys
 * List all API keys for a tenant/project
 * 
 * Authenticated via JWT token in Authorization header
 * 
 * Query Parameters:
 *   projectId?: string; // Optional: filter by project
 * 
 * Returns list of API keys with metadata (but not the actual key values for security)
 */
router.get("/:tenantId/api-keys", async (req: Request, res: Response) => {
  try {
    // Validate JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const token = authHeader.substring(7);
    const payload = TokenService.validateToken(token);
    if (!payload) {
      return res.status(401).json({
        error: "Invalid or expired JWT token",
      });
    }

    // Validate tenantId matches JWT
    const validationResult = tenantIdSchema.safeParse(req.params);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid tenantId parameter",
        details: validationResult.error.issues,
      });
    }

    const { tenantId } = validationResult.data;
    if (tenantId !== payload.tenantId) {
      return res.status(403).json({
        error: "Tenant ID does not match JWT token",
      });
    }

    // Get optional projectId from query params
    const projectId = req.query.projectId as string | undefined;

    // List API keys
    const apiKeys = await ApiKeyService.listApiKeys(tenantId, projectId || null);

    // Format response (don't include actual key values, only metadata)
    return res.status(200).json({
      success: true,
      apiKeys: apiKeys.map((keyRecord) => ({
        id: keyRecord.id,
        tenantId: keyRecord.tenant_id,
        projectId: keyRecord.project_id,
        name: keyRecord.name,
        keyPrefix: keyRecord.key_prefix,
        scopes: keyRecord.scopes,
        allowedOrigins: keyRecord.allowed_origins,
        revoked: !!keyRecord.revoked_at,
        createdAt: keyRecord.created_at,
        lastUsedAt: keyRecord.last_used_at,
      })),
      count: apiKeys.length,
    });
  } catch (error) {
    console.error("Error listing API keys:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({
      error: errorMessage,
    });
  }
});

/**
 * POST /api/v1/tenants/:tenantId/api-keys
 * Create a new API key for a tenant/project
 * 
 * Authenticated via JWT token in Authorization header
 * 
 * Body: {
 *   name: string;
 *   keyPrefix?: "sk_" | "pk_";
 *   projectId?: string;
 *   scopes?: { ingest: boolean; query?: boolean };
 *   allowedOrigins?: string[];
 * }
 */
router.post("/:tenantId/api-keys", async (req: Request, res: Response) => {
  try {
    // Validate JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const token = authHeader.substring(7);
    const payload = TokenService.validateToken(token);
    if (!payload) {
      return res.status(401).json({
        error: "Invalid or expired JWT token",
      });
    }

    // Validate tenantId matches JWT
    const validationResult = tenantIdSchema.safeParse(req.params);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid tenantId parameter",
        details: validationResult.error.issues,
      });
    }

    const { tenantId } = validationResult.data;
    if (tenantId !== payload.tenantId) {
      return res.status(403).json({
        error: "Tenant ID does not match JWT token",
      });
    }

    // Validate request body
    const bodySchema = z.object({
      name: z.string().min(1, "Name is required"),
      keyPrefix: z.enum(["sk_", "pk_"]).optional().default("sk_"),
      projectId: z.string().uuid().optional(),
      scopes: z.object({
        ingest: z.boolean().optional(),
        query: z.boolean().optional(),
      }).optional(),
      allowedOrigins: z.array(z.string()).optional(),
    });

    const bodyResult = bodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: bodyResult.error.issues,
      });
    }

    const { name, keyPrefix, projectId, scopes, allowedOrigins } = bodyResult.data;

    // Use projectId from JWT if not provided
    const finalProjectId = projectId || payload.projectId || null;

    // Create API key
    const { key, keyRecord } = await ApiKeyService.createApiKey({
      tenantId,
      projectId: finalProjectId,
      name,
      keyPrefix,
      scopes: scopes ? {
        ingest: scopes.ingest ?? true,
        query: scopes.query ?? false,
      } : undefined,
      allowedOrigins,
    });

    return res.status(201).json({
      success: true,
      apiKey: key,
      keyRecord: {
        id: keyRecord.id,
        tenantId: keyRecord.tenant_id,
        projectId: keyRecord.project_id,
        name: keyRecord.name,
        keyPrefix: keyRecord.key_prefix,
        scopes: keyRecord.scopes,
        allowedOrigins: keyRecord.allowed_origins,
        createdAt: new Date(),
      },
      message: "API key created successfully. Store it securely - it won't be shown again.",
      important: "When using this API key with the SDK, you may need to provide tenantId and projectId from keyRecord if using legacy key format (sk_ or pk_).",
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({
      error: errorMessage,
    });
  }
});

export default router;

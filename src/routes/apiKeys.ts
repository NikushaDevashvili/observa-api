import { Router, Request, Response } from "express";
import { ApiKeyService } from "../services/apiKeyService.js";
import { z } from "zod";

const router = Router();

/**
 * POST /api/v1/api-keys/resolve
 * Resolve tenant/project metadata from an API key
 * 
 * This endpoint allows SDKs to automatically resolve tenantId and projectId
 * from API keys (sk_ or pk_ format) when they don't have JWT-formatted keys.
 * 
 * This is useful for SDK initialization - when users provide an API key from
 * the settings page (which is in sk_/pk_ format), the SDK can call this endpoint
 * to automatically get the tenantId and projectId instead of requiring users
 * to provide them manually.
 * 
 * Body: {
 *   apiKey: string;
 * }
 * 
 * Response: {
 *   success: true;
 *   tenantId: string;
 *   projectId: string | null;
 *   keyPrefix: "sk_" | "pk_";
 *   scopes: { ingest: boolean; query?: boolean };
 * }
 */
router.post("/resolve", async (req: Request, res: Response) => {
  try {
    const bodySchema = z.object({
      apiKey: z.string().min(1, "API key is required"),
    });

    const bodyResult = bodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: bodyResult.error.issues,
      });
    }

    const { apiKey } = bodyResult.data;

    // Validate API key
    const keyRecord = await ApiKeyService.validateApiKey(apiKey);
    if (!keyRecord) {
      return res.status(401).json({
        error: "Invalid or revoked API key",
      });
    }

    // Return tenant/project info
    return res.status(200).json({
      success: true,
      tenantId: keyRecord.tenant_id,
      projectId: keyRecord.project_id,
      keyPrefix: keyRecord.key_prefix,
      scopes: keyRecord.scopes,
    });
  } catch (error) {
    console.error("Error resolving API key:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({
      error: errorMessage,
    });
  }
});

export default router;

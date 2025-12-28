import { Router, Request, Response } from "express";
import { TenantService } from "../services/tenantService.js";
import { tenantIdSchema } from "../validation/schemas.js";

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

export default router;

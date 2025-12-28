import { Router, Request, Response } from "express";
import { TokenService } from "../services/tokenService.js";
import { TraceService } from "../services/traceService.js";
import { TraceEvent } from "../types.js";
import { traceEventSchema } from "../validation/schemas.js";

const router = Router();

/**
 * POST /api/v1/traces/ingest
 * Trace ingestion endpoint
 *
 * Validates JWT token and forwards trace data to Tinybird
 *
 * Headers:
 *   Authorization: Bearer <JWT_TOKEN>
 *
 * Body: TraceEvent (JSON)
 *
 * Response: 200 OK on success
 */
router.post("/ingest", async (req: Request, res: Response) => {
  try {
    // Extract JWT token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header. Expected: Bearer <token>",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Validate JWT token
    const payload = TokenService.validateToken(token);
    if (!payload) {
      return res.status(401).json({
        error: "Invalid or expired JWT token",
      });
    }

    // Extract tenant context from JWT
    const tenantId = payload.tenantId;
    const projectId = payload.projectId;
    const environment = payload.environment ?? "dev";

    if (!tenantId || !projectId) {
      return res.status(401).json({
        error: "JWT token missing tenantId or projectId",
      });
    }

    // Validate trace data structure with Zod
    const traceData = req.body;
    const validationResult = traceEventSchema.safeParse(traceData);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid trace data structure",
        details: validationResult.error.issues,
      });
    }

    // Override tenant/project from JWT (security: prevent token spoofing)
    const validatedData = validationResult.data;
    const trace: TraceEvent = {
      ...validatedData,
      tenantId,
      projectId,
      environment,
      headers: validatedData.headers as Record<string, string> | undefined,
    };

    // Forward to Tinybird
    await TraceService.forwardToTinybird(trace);

    // Log success (in dev mode)
    if (process.env.NODE_ENV !== "production") {
      console.log(`POST /api/v1/traces/ingest`);
      console.log(`JWT validation successful`);
      console.log(`Tenant: ${tenantId}, Project: ${projectId}`);
      console.log(`Forwarding to Tinybird...`);
      console.log(`Trace ID: ${trace.traceId}`);
    }

    return res.status(200).json({
      success: true,
      traceId: trace.traceId,
      message: "Trace ingested successfully",
    });
  } catch (error) {
    console.error("Error during trace ingestion:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({
      error: errorMessage,
    });
  }
});

export default router;


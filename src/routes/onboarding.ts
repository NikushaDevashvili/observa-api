import { Router, Request, Response } from "express";
import { OnboardingService } from "../services/onboardingService.js";
import { signupSchema } from "../validation/schemas.js";

const router = Router();

/**
 * POST /api/v1/onboarding/signup
 * Customer signup endpoint
 *
 * Body: {
 *   email: string;
 *   companyName: string;
 *   plan?: "free" | "pro" | "enterprise";
 * }
 *
 * Response: {
 *   apiKey: string;
 *   tenantId: string;
 *   projectId: string;
 *   environment: "prod";
 *   message: string;
 * }
 */
router.post("/signup", async (req: Request, res: Response) => {
  try {
    // Validate request body with Zod
    const validationResult = signupSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validationResult.error.issues,
      });
    }

    const { email, companyName, plan } = validationResult.data;

    // Call onboarding service
    const result = await OnboardingService.signup({
      email,
      companyName,
      plan,
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error("Error during signup:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({
      error: errorMessage,
    });
  }
});

export default router;


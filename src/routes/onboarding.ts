import { Router, Request, Response } from "express";
import { OnboardingService } from "../services/onboardingService.js";
import { OnboardingTrackerService } from "../services/onboardingTrackerService.js";
import { OnboardingChecklistService } from "../services/onboardingChecklistService.js";
import { EmailService } from "../services/emailService.js";
import { AuthService } from "../services/authService.js";
import { signupSchema } from "../validation/schemas.js";
import { z } from "zod";
import { query } from "../db/client.js";

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

/**
 * Helper to extract user from session token
 */
async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const sessionToken = authHeader.substring(7);
  return await AuthService.validateSession(sessionToken);
}

/**
 * GET /api/v1/onboarding/progress
 * Get user's onboarding progress
 */
router.get("/progress", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid session token",
      });
    }

    const progress = await OnboardingTrackerService.getOnboardingProgress(user.id);

    res.json({
      success: true,
      progress,
    });
  } catch (error) {
    console.error("Get onboarding progress error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * POST /api/v1/onboarding/tasks/:taskKey/complete
 * Mark a task as complete
 */
router.post("/tasks/:taskKey/complete", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid session token",
      });
    }

    const { taskKey } = req.params;
    const metadata = req.body?.metadata || {};

    await OnboardingTrackerService.completeTask(user.id, taskKey, metadata);

    res.json({
      success: true,
      message: `Task ${taskKey} marked as complete`,
    });
  } catch (error) {
    console.error("Complete task error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * POST /api/v1/onboarding/tasks/:taskKey/skip
 * Skip a task
 */
router.post("/tasks/:taskKey/skip", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid session token",
      });
    }

    const { taskKey } = req.params;

    await OnboardingTrackerService.skipTask(user.id, taskKey);

    res.json({
      success: true,
      message: `Task ${taskKey} skipped`,
    });
  } catch (error) {
    console.error("Skip task error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

const preferencesSchema = z.object({
  role: z.enum(["developer", "product_manager", "executive", "other"]).optional(),
  useCase: z
    .enum(["llm_monitoring", "cost_tracking", "debugging", "quality_analysis", "other"])
    .optional(),
  onboardingDismissed: z.boolean().optional(),
});

/**
 * POST /api/v1/onboarding/preferences
 * Update user onboarding preferences
 */
router.post("/preferences", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid session token",
      });
    }

    const validationResult = preferencesSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.issues,
      });
    }

    const data = validationResult.data;

    // Upsert user preferences
    await query(
      `INSERT INTO user_preferences (user_id, role, use_case, onboarding_dismissed, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         role = COALESCE($2, user_preferences.role),
         use_case = COALESCE($3, user_preferences.use_case),
         onboarding_dismissed = COALESCE($4, user_preferences.onboarding_dismissed),
         updated_at = NOW()`,
      [user.id, data.role || null, data.useCase || null, data.onboardingDismissed ?? null]
    );

    res.json({
      success: true,
      message: "Preferences updated",
    });
  } catch (error) {
    console.error("Update preferences error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/onboarding/next-steps
 * Get recommended next steps
 */
router.get("/next-steps", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid session token",
      });
    }

    const nextSteps = await OnboardingTrackerService.getNextSteps(user.id);

    res.json({
      success: true,
      nextSteps,
    });
  } catch (error) {
    console.error("Get next steps error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/onboarding/banner
 * Get onboarding banner state for frontend
 */
router.get("/banner", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid session token",
      });
    }

    const progress = await OnboardingTrackerService.getOnboardingProgress(user.id);
    
    // Check user preferences
    const prefsResult = await query(
      `SELECT onboarding_completed, onboarding_dismissed
       FROM user_preferences
       WHERE user_id = $1`,
      [user.id]
    );

    const preferences = prefsResult.length > 0 ? prefsResult[0] : {
      onboarding_completed: false,
      onboarding_dismissed: false,
    };

    const isComplete = await OnboardingTrackerService.isOnboardingComplete(user.id);
    const showBanner = !preferences.onboarding_completed && 
                      !preferences.onboarding_dismissed && 
                      !isComplete;

    // Get next pending task
    const checklist = progress.checklist;
    const nextTask = checklist.find((t) => t.status === "pending");

    res.json({
      showBanner,
      currentStep: progress.currentStep,
      progressPercentage: progress.progressPercentage,
      nextTask: nextTask ? {
        key: nextTask.taskKey,
        title: nextTask.metadata?.title || nextTask.taskKey,
        description: nextTask.metadata?.description || "",
        type: nextTask.taskType,
      } : null,
      canDismiss: true,
    });
  } catch (error) {
    console.error("Get banner error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/onboarding/checklist
 * Get full checklist for frontend rendering
 */
router.get("/checklist", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid session token",
      });
    }

    const checklist = await OnboardingChecklistService.getChecklist(user.id);
    const stats = await OnboardingChecklistService.getChecklistStats(user.id);

    res.json({
      success: true,
      items: checklist.map((item) => ({
        id: item.id,
        taskKey: item.taskKey,
        taskType: item.taskType,
        status: item.status,
        completedAt: item.completedAt,
        metadata: item.metadata,
        createdAt: item.createdAt,
      })),
      overallProgress: stats.progressPercentage,
      completedCount: stats.completedCount,
      totalCount: stats.totalCount,
    });
  } catch (error) {
    console.error("Get checklist error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;


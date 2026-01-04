import { query } from "../db/client.js";
import { OnboardingChecklistService } from "./onboardingChecklistService.js";
import { EmailService } from "./emailService.js";

/**
 * Onboarding Steps (in order)
 */
export const ONBOARDING_STEPS = [
  "account_created",
  "email_verified",
  "api_key_retrieved",
  "install_sdk",
  "send_first_trace",
  "dashboard_visited",
  "first_trace_viewed",
  "project_configured",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Onboarding Tracker Service
 * Manages onboarding progress and state
 */
export class OnboardingTrackerService {
  /**
   * Initialize onboarding for a new user
   */
  static async initializeOnboarding(
    userId: string,
    tenantId: string,
    role?: string,
    useCase?: string
  ): Promise<void> {
    // Create onboarding progress record
    await query(
      `INSERT INTO user_onboarding_progress 
       (user_id, tenant_id, current_step, progress_percentage, started_at)
       VALUES ($1, $2, 'account_created', 0, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, tenantId]
    );

    // Create checklist
    await OnboardingChecklistService.createChecklistForUser(
      userId,
      tenantId,
      role,
      useCase
    );

    // Mark account_created as complete
    await this.updateProgress(userId, "account_created");

    console.log(`✅ Onboarding initialized for user ${userId}`);
  }

  /**
   * Get onboarding progress for a user
   */
  static async getOnboardingProgress(userId: string): Promise<{
    currentStep: string;
    progressPercentage: number;
    completedAt: Date | null;
    startedAt: Date;
    checklist: Array<{
      id: string;
      taskKey: string;
      taskType: string;
      status: string;
      completedAt: Date | null;
      metadata: any;
      createdAt: Date;
    }>;
  }> {
    // Get progress record
    const progressResult = await query(
      `SELECT current_step, progress_percentage, completed_at, started_at
       FROM user_onboarding_progress
       WHERE user_id = $1`,
      [userId]
    );

    if (progressResult.length === 0) {
      // Initialize if doesn't exist
      const userResult = await query(
        `SELECT tenant_id FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.length === 0) {
        throw new Error(`User not found: ${userId}`);
      }

      await this.initializeOnboarding(userId, userResult[0].tenant_id);

      // Retry query
      const retryResult = await query(
        `SELECT current_step, progress_percentage, completed_at, started_at
         FROM user_onboarding_progress
         WHERE user_id = $1`,
        [userId]
      );

      if (retryResult.length === 0) {
        throw new Error(`Failed to initialize onboarding for user ${userId}`);
      }

      progressResult.push(retryResult[0]);
    }

    const progress = progressResult[0];

    // Get checklist
    const checklist = await OnboardingChecklistService.getChecklist(userId);

    // Recalculate progress percentage from checklist
    const stats = await OnboardingChecklistService.getChecklistStats(userId);

    return {
      currentStep: progress.current_step,
      progressPercentage: stats.progressPercentage,
      completedAt: progress.completed_at,
      startedAt: progress.started_at,
      checklist,
    };
  }

  /**
   * Update onboarding progress
   */
  static async updateProgress(userId: string, step: OnboardingStep): Promise<void> {
    // Update checklist if task exists
    const taskKeys: Record<OnboardingStep, string> = {
      account_created: "account_created",
      email_verified: "email_verified",
      api_key_retrieved: "api_key_retrieved",
      install_sdk: "install_sdk",
      send_first_trace: "send_first_trace",
      dashboard_visited: "dashboard_visited",
      first_trace_viewed: "first_trace_viewed",
      project_configured: "project_configured",
    };

    const taskKey = taskKeys[step];
    if (taskKey) {
      await OnboardingChecklistService.markTaskComplete(userId, taskKey);
    }

    // Update progress record
    const stats = await OnboardingChecklistService.getChecklistStats(userId);
    
    await query(
      `UPDATE user_onboarding_progress
       SET current_step = $1,
           progress_percentage = $2,
           updated_at = NOW()
       WHERE user_id = $3`,
      [step, stats.progressPercentage, userId]
    );

    // Check if onboarding is complete
    const isComplete = await this.isOnboardingComplete(userId);
    if (isComplete) {
      await query(
        `UPDATE user_onboarding_progress
         SET completed_at = NOW()
         WHERE user_id = $1 AND completed_at IS NULL`,
        [userId]
      );

      // Send completion email (async, don't wait)
      this.sendCompletionEmailIfNeeded(userId).catch((err) => {
        console.error("Failed to send completion email:", err);
      });
    }
  }

  /**
   * Complete a specific task
   */
  static async completeTask(
    userId: string,
    taskKey: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await OnboardingChecklistService.markTaskComplete(userId, taskKey, metadata);

    // Update progress
    const stats = await OnboardingChecklistService.getChecklistStats(userId);
    
    await query(
      `UPDATE user_onboarding_progress
       SET progress_percentage = $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [stats.progressPercentage, userId]
    );

    // Map task key to step if applicable
    const stepMap: Record<string, OnboardingStep> = {
      account_created: "account_created",
      email_verified: "email_verified",
      api_key_retrieved: "api_key_retrieved",
      install_sdk: "install_sdk",
      send_first_trace: "send_first_trace",
      dashboard_visited: "dashboard_visited",
      first_trace_viewed: "first_trace_viewed",
      project_configured: "project_configured",
    };

    const step = stepMap[taskKey];
    if (step) {
      await query(
        `UPDATE user_onboarding_progress
         SET current_step = $1
         WHERE user_id = $2`,
        [step, userId]
      );
    }

    // Check if onboarding is complete
    const isComplete = await this.isOnboardingComplete(userId);
    if (isComplete) {
      await query(
        `UPDATE user_onboarding_progress
         SET completed_at = NOW()
         WHERE user_id = $1 AND completed_at IS NULL`,
        [userId]
      );

      // Send completion email (async, don't wait)
      this.sendCompletionEmailIfNeeded(userId).catch((err) => {
        console.error("Failed to send completion email:", err);
      });
    }
  }

  /**
   * Skip a task
   */
  static async skipTask(userId: string, taskKey: string): Promise<void> {
    await OnboardingChecklistService.skipTask(userId, taskKey);

    // Update progress
    const stats = await OnboardingChecklistService.getChecklistStats(userId);
    
    await query(
      `UPDATE user_onboarding_progress
       SET progress_percentage = $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [stats.progressPercentage, userId]
    );
  }

  /**
   * Check if onboarding is complete
   */
  static async isOnboardingComplete(userId: string): Promise<boolean> {
    const stats = await OnboardingChecklistService.getChecklistStats(userId);
    
    // Get required tasks
    const checklist = await OnboardingChecklistService.getChecklist(userId);
    const requiredTasks = checklist.filter((item) => {
      // Check if task is required based on default checklist
      const defaultTask = require("./onboardingChecklistService.js").DEFAULT_CHECKLIST_TASKS.find(
        (t: any) => t.key === item.taskKey
      );
      return defaultTask?.required === true;
    });

    // All required tasks must be completed
    const completedRequiredTasks = requiredTasks.filter(
      (t) => t.status === "completed"
    );

    return (
      requiredTasks.length > 0 &&
      completedRequiredTasks.length === requiredTasks.length &&
      stats.progressPercentage >= 80 // At least 80% progress
    );
  }

  /**
   * Get next recommended steps
   */
  static async getNextSteps(userId: string): Promise<Array<{
    taskKey: string;
    title: string;
    description: string;
    type: "automatic" | "manual";
    actionUrl?: string;
    actionText?: string;
  }>> {
    const checklist = await OnboardingChecklistService.getChecklist(userId);
    const pendingTasks = checklist
      .filter((t) => t.status === "pending")
      .sort((a, b) => {
        const orderA = (a.metadata?.order as number) || 999;
        const orderB = (b.metadata?.order as number) || 999;
        return orderA - orderB;
      })
      .slice(0, 3); // Return top 3 next steps

    const frontendUrl = process.env.FRONTEND_URL || "https://observa-app.vercel.app";

    return pendingTasks.map((task) => {
      const taskKey = task.taskKey;
      let actionUrl: string | undefined;
      let actionText: string | undefined;

      // Set action URLs based on task
      switch (taskKey) {
        case "email_verified":
          actionUrl = `${frontendUrl}/settings/verify-email`;
          actionText = "Verify Email";
          break;
        case "api_key_retrieved":
          actionUrl = `${frontendUrl}/settings/api-keys`;
          actionText = "View API Keys";
          break;
        case "install_sdk":
          actionUrl = `${frontendUrl}/docs/installation`;
          actionText = "View Installation Guide";
          break;
        case "send_first_trace":
          actionUrl = `${frontendUrl}/docs/quickstart`;
          actionText = "View Quick Start";
          break;
        case "dashboard_visited":
          actionUrl = `${frontendUrl}/dashboard`;
          actionText = "Go to Dashboard";
          break;
        case "first_trace_viewed":
          actionUrl = `${frontendUrl}/traces`;
          actionText = "View Traces";
          break;
        case "project_configured":
          actionUrl = `${frontendUrl}/settings/project`;
          actionText = "Configure Project";
          break;
      }

      return {
        taskKey: task.taskKey,
        title: (task.metadata?.title as string) || task.taskKey,
        description: (task.metadata?.description as string) || "",
        type: task.taskType as "automatic" | "manual",
        actionUrl,
        actionText,
      };
    });
  }

  /**
   * Send completion email if onboarding is complete
   */
  private static async sendCompletionEmailIfNeeded(userId: string): Promise<void> {
    const result = await query(
      `SELECT u.email, u.id
       FROM users u
       WHERE u.id = $1`,
      [userId]
    );

    if (result.length === 0) {
      return;
    }

    const email = result[0].email;
    const name = email.split("@")[0]; // Simple name extraction

    // Check if we already sent completion email (prevent duplicates)
    const progressResult = await query(
      `SELECT completed_at FROM user_onboarding_progress WHERE user_id = $1`,
      [userId]
    );

    if (progressResult.length > 0 && progressResult[0].completed_at) {
      // Only send if completed very recently (within last minute) to avoid duplicates
      const completedAt = new Date(progressResult[0].completed_at);
      const now = new Date();
      const diffMs = now.getTime() - completedAt.getTime();

      if (diffMs < 60000) {
        // Within 1 minute
        await EmailService.sendOnboardingCompletionEmail(userId, email, name);
      }
    }
  }
}


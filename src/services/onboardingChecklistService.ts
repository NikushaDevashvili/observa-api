import { query } from "../db/client.js";

/**
 * Checklist Task Definitions
 */
export interface ChecklistTask {
  key: string;
  title: string;
  description: string;
  type: "automatic" | "manual";
  required: boolean;
  order: number;
  dependsOn?: string[]; // Task keys that must be completed first
}

/**
 * Default checklist tasks
 */
const DEFAULT_CHECKLIST_TASKS: ChecklistTask[] = [
  {
    key: "account_created",
    title: "Create Account",
    description: "Your account has been created",
    type: "automatic",
    required: true,
    order: 1,
  },
  {
    key: "email_verified",
    title: "Verify Email",
    description: "Verify your email address",
    type: "manual",
    required: false,
    order: 2,
    dependsOn: ["account_created"],
  },
  {
    key: "api_key_retrieved",
    title: "Get API Key",
    description: "Retrieve your API key from the dashboard or signup response",
    type: "automatic",
    required: true,
    order: 3,
    dependsOn: ["account_created"],
  },
  {
    key: "install_sdk",
    title: "Install SDK",
    description: "Install the Observa SDK in your project",
    type: "manual",
    required: true,
    order: 4,
    dependsOn: ["api_key_retrieved"],
  },
  {
    key: "send_first_trace",
    title: "Send First Trace",
    description: "Send your first trace to Observa",
    type: "automatic",
    required: true,
    order: 5,
    dependsOn: ["install_sdk"],
  },
  {
    key: "dashboard_visited",
    title: "Visit Dashboard",
    description: "Explore your dashboard",
    type: "automatic",
    required: false,
    order: 6,
    dependsOn: ["account_created"],
  },
  {
    key: "first_trace_viewed",
    title: "View First Trace",
    description: "View a trace detail in your dashboard",
    type: "automatic",
    required: false,
    order: 7,
    dependsOn: ["send_first_trace", "dashboard_visited"],
  },
  {
    key: "project_configured",
    title: "Configure Project",
    description: "Customize your project settings",
    type: "manual",
    required: false,
    order: 8,
    dependsOn: ["account_created"],
  },
];

/**
 * Role-based checklist customization
 */
const ROLE_TASKS: Record<string, string[]> = {
  developer: ["account_created", "api_key_retrieved", "install_sdk", "send_first_trace"],
  product_manager: ["account_created", "dashboard_visited", "first_trace_viewed"],
  executive: ["account_created", "dashboard_visited"],
};

/**
 * Use case based checklist customization
 */
const USE_CASE_TASKS: Record<string, string[]> = {
  llm_monitoring: ["account_created", "api_key_retrieved", "install_sdk", "send_first_trace", "first_trace_viewed"],
  cost_tracking: ["account_created", "dashboard_visited", "first_trace_viewed"],
  debugging: ["account_created", "api_key_retrieved", "install_sdk", "send_first_trace", "first_trace_viewed"],
  quality_analysis: ["account_created", "dashboard_visited", "first_trace_viewed"],
};

/**
 * Onboarding Checklist Service
 * Manages checklist items for user onboarding
 */
export class OnboardingChecklistService {
  /**
   * Create checklist for a new user
   */
  static async createChecklistForUser(
    userId: string,
    tenantId: string,
    role?: string,
    useCase?: string
  ): Promise<void> {
    // Determine which tasks to include based on role/use case
    let taskKeysToInclude: Set<string> = new Set(
      DEFAULT_CHECKLIST_TASKS.map((t) => t.key)
    );

    // Filter by role if provided
    if (role && ROLE_TASKS[role]) {
      taskKeysToInclude = new Set(ROLE_TASKS[role]);
    }

    // Further filter by use case if provided
    if (useCase && USE_CASE_TASKS[useCase]) {
      const useCaseKeys = new Set(USE_CASE_TASKS[useCase]);
      taskKeysToInclude = new Set(
        Array.from(taskKeysToInclude).filter((key) => useCaseKeys.has(key))
      );
    }

    // Get tasks to create
    const tasksToCreate = DEFAULT_CHECKLIST_TASKS.filter((task) =>
      taskKeysToInclude.has(task.key)
    );

    // Mark account_created as completed immediately
    const accountCreatedTask = tasksToCreate.find((t) => t.key === "account_created");
    if (accountCreatedTask) {
      await this.markTaskComplete(userId, "account_created");
    }

    // Create all other tasks as pending
    const pendingTasks = tasksToCreate.filter((t) => t.key !== "account_created");
    
    if (pendingTasks.length > 0) {
      const params: any[] = [];
      const placeholders: string[] = [];
      
      pendingTasks.forEach((task, index) => {
        const base = index * 6;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
        params.push(
          userId,
          tenantId,
          task.key,
          task.type,
          "pending",
          JSON.stringify({ title: task.title, description: task.description, order: task.order })
        );
      });

      await query(
        `INSERT INTO onboarding_checklist_items (user_id, tenant_id, task_key, task_type, status, metadata)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (user_id, task_key) DO NOTHING`,
        params
      );
    }

    console.log(`✅ Created ${tasksToCreate.length} checklist items for user ${userId}`);
  }

  /**
   * Get checklist for a user
   */
  static async getChecklist(userId: string): Promise<Array<{
    id: string;
    taskKey: string;
    taskType: string;
    status: string;
    completedAt: Date | null;
    metadata: any;
    createdAt: Date;
  }>> {
    const result = await query(
      `SELECT id, task_key, task_type, status, completed_at, metadata, created_at
       FROM onboarding_checklist_items
       WHERE user_id = $1
       ORDER BY 
         CASE status
           WHEN 'pending' THEN 1
           WHEN 'completed' THEN 2
           WHEN 'skipped' THEN 3
         END,
         (metadata->>'order')::int ASC`,
      [userId]
    );

    return result.map((row: any) => ({
      id: row.id,
      taskKey: row.task_key,
      taskType: row.task_type,
      status: row.status,
      completedAt: row.completed_at,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    }));
  }

  /**
   * Mark a task as complete
   */
  static async markTaskComplete(
    userId: string,
    taskKey: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    // Check if task exists
    const existing = await query(
      `SELECT id, status, metadata FROM onboarding_checklist_items
       WHERE user_id = $1 AND task_key = $2`,
      [userId, taskKey]
    );

    if (existing.length === 0) {
      // Task doesn't exist yet, create it
      const task = DEFAULT_CHECKLIST_TASKS.find((t) => t.key === taskKey);
      if (!task) {
        throw new Error(`Unknown task key: ${taskKey}`);
      }

      // Get tenant_id from user
      const userResult = await query(
        `SELECT tenant_id FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.length === 0) {
        throw new Error(`User not found: ${userId}`);
      }

      const tenantId = userResult[0].tenant_id;

      await query(
        `INSERT INTO onboarding_checklist_items 
         (user_id, tenant_id, task_key, task_type, status, completed_at, metadata)
         VALUES ($1, $2, $3, $4, 'completed', NOW(), $5)
         ON CONFLICT (user_id, task_key) 
         DO UPDATE SET status = 'completed', completed_at = NOW(), metadata = $5`,
        [
          userId,
          tenantId,
          taskKey,
          task.type,
          JSON.stringify({
            ...{ title: task.title, description: task.description, order: task.order },
            ...metadata,
          }),
        ]
      );
    } else {
      // Update existing task
      const currentMetadata = existing[0].metadata || {};
      const newMetadata = { ...currentMetadata, ...metadata };

      await query(
        `UPDATE onboarding_checklist_items
         SET status = 'completed',
             completed_at = COALESCE(completed_at, NOW()),
             metadata = $1
         WHERE user_id = $2 AND task_key = $3`,
        [JSON.stringify(newMetadata), userId, taskKey]
      );
    }

    // Check dependencies and auto-complete if applicable
    await this.checkDependencies(userId, taskKey);

    return true;
  }

  /**
   * Check if dependencies are met and auto-complete tasks
   */
  private static async checkDependencies(userId: string, completedTaskKey: string): Promise<void> {
    const allTasks = await this.getChecklist(userId);
    const completedTaskKeys = new Set(
      allTasks.filter((t) => t.status === "completed").map((t) => t.taskKey)
    );

    // Find tasks that depend on the completed task
    for (const task of DEFAULT_CHECKLIST_TASKS) {
      if (task.dependsOn?.includes(completedTaskKey)) {
        // Check if all dependencies are met
        const allDepsMet = task.dependsOn.every((dep) => completedTaskKeys.has(dep));

        if (allDepsMet) {
          // If task is automatic, mark it complete
          if (task.type === "automatic") {
            const taskExists = allTasks.find((t) => t.taskKey === task.key);
            if (taskExists && taskExists.status === "pending") {
              await this.markTaskComplete(userId, task.key);
            }
          }
        }
      }
    }
  }

  /**
   * Mark a task as skipped
   */
  static async skipTask(userId: string, taskKey: string): Promise<boolean> {
    const result = await query(
      `UPDATE onboarding_checklist_items
       SET status = 'skipped'
       WHERE user_id = $1 AND task_key = $2
       RETURNING id`,
      [userId, taskKey]
    );

    if (result.length === 0) {
      throw new Error(`Task not found: ${taskKey}`);
    }

    return true;
  }

  /**
   * Get checklist statistics
   */
  static async getChecklistStats(userId: string): Promise<{
    totalCount: number;
    completedCount: number;
    pendingCount: number;
    skippedCount: number;
    progressPercentage: number;
  }> {
    const result = await query(
      `SELECT 
         COUNT(*) as total_count,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
         COUNT(*) FILTER (WHERE status = 'skipped') as skipped_count
       FROM onboarding_checklist_items
       WHERE user_id = $1`,
      [userId]
    );

    const stats = result[0];
    const total = parseInt(stats.total_count) || 0;
    const completed = parseInt(stats.completed_count) || 0;
    const progressPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      totalCount: total,
      completedCount: completed,
      pendingCount: parseInt(stats.pending_count) || 0,
      skippedCount: parseInt(stats.skipped_count) || 0,
      progressPercentage,
    };
  }

  /**
   * Detect automatic tasks based on events
   */
  static async detectAutomaticTasks(
    userId: string,
    event: { type: string; metadata?: Record<string, any> }
  ): Promise<void> {
    switch (event.type) {
      case "first_trace":
        await this.markTaskComplete(userId, "send_first_trace", event.metadata);
        break;
      case "dashboard_visit":
        await this.markTaskComplete(userId, "dashboard_visited", event.metadata);
        break;
      case "trace_view":
        await this.markTaskComplete(userId, "first_trace_viewed", event.metadata);
        break;
      case "api_key_used":
        await this.markTaskComplete(userId, "api_key_retrieved", event.metadata);
        break;
      default:
        console.log(`Unknown event type for auto-detection: ${event.type}`);
    }
  }
}


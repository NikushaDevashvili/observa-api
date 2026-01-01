/**
 * Migration to add monthly_event_quota to projects table
 */
import { query } from "../client.js";

export async function migrateAddProjectQuota(): Promise<void> {
  try {
    console.log("🔄 Migrating projects table to add monthly_event_quota...");

    // Check if column exists
    const checkColumn = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'projects' 
      AND column_name = 'monthly_event_quota'
    `);

    if (checkColumn.length === 0) {
      console.log("  Adding column: monthly_event_quota");
      await query(`
        ALTER TABLE projects 
        ADD COLUMN monthly_event_quota INTEGER DEFAULT 10000000
      `);
      console.log("  ✅ Added monthly_event_quota column");
    } else {
      console.log("  ✅ monthly_event_quota column already exists");
    }

    // Add monthly_event_count for tracking current usage
    const checkCountColumn = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'projects' 
      AND column_name = 'monthly_event_count'
    `);

    if (checkCountColumn.length === 0) {
      console.log("  Adding column: monthly_event_count");
      await query(`
        ALTER TABLE projects 
        ADD COLUMN monthly_event_count INTEGER DEFAULT 0
      `);
      console.log("  ✅ Added monthly_event_count column");
    } else {
      console.log("  ✅ monthly_event_count column already exists");
    }

    // Add quota_period_start for tracking the current month window
    const checkPeriodColumn = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'projects' 
      AND column_name = 'quota_period_start'
    `);

    if (checkPeriodColumn.length === 0) {
      console.log("  Adding column: quota_period_start");
      await query(`
        ALTER TABLE projects 
        ADD COLUMN quota_period_start TIMESTAMP DEFAULT NOW()
      `);
      console.log("  ✅ Added quota_period_start column");
    } else {
      console.log("  ✅ quota_period_start column already exists");
    }

    console.log("✅ Project quota migration completed successfully");
  } catch (error) {
    console.error("❌ Project quota migration failed:", error);
    // Don't throw - allow the app to continue
  }
}

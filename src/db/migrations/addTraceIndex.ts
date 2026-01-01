/**
 * Migration to add trace_index table for soft delete support (GDPR)
 */
import { query } from "../client.js";

export async function migrateAddTraceIndex(): Promise<void> {
  try {
    console.log("🔄 Creating trace_index table for GDPR soft delete...");

    // Create trace_index table for fast soft-delete lookups
    await query(`
      CREATE TABLE IF NOT EXISTS trace_index (
        trace_id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP NULL,
        deleted_by_user_id UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for fast queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_trace_index_tenant_deleted 
      ON trace_index(tenant_id, is_deleted, created_at DESC)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_trace_index_project_deleted 
      ON trace_index(project_id, is_deleted, created_at DESC)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_trace_index_deleted 
      ON trace_index(is_deleted, deleted_at)
    `);

    console.log("✅ trace_index migration completed successfully");
  } catch (error) {
    console.error("❌ trace_index migration failed:", error);
    // Don't throw - allow the app to continue
  }
}

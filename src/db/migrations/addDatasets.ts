/**
 * Migration to add datasets and dataset_items tables for Golden Dataset feature
 */
import { query } from "../client.js";

export async function migrateAddDatasets(): Promise<void> {
  try {
    console.log("🔄 Creating datasets and dataset_items tables...");

    // Create datasets table
    await query(`
      CREATE TABLE IF NOT EXISTS datasets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, name)
      )
    `);

    // Create dataset_items table
    await query(`
      CREATE TABLE IF NOT EXISTS dataset_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        trace_id UUID NOT NULL,
        input_snapshot_json TEXT,
        expected_output TEXT,
        corrected_output TEXT,
        notes TEXT,
        created_by_user_id UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await query(`
      CREATE INDEX IF NOT EXISTS idx_datasets_tenant 
      ON datasets(tenant_id, created_at DESC)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_datasets_project 
      ON datasets(project_id, created_at DESC)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_dataset_items_dataset 
      ON dataset_items(dataset_id, created_at DESC)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_dataset_items_trace 
      ON dataset_items(trace_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_dataset_items_tenant 
      ON dataset_items(tenant_id)
    `);

    console.log("✅ Datasets migration completed successfully");
  } catch (error) {
    console.error("❌ Datasets migration failed:", error);
    // Don't throw - allow the app to continue
  }
}


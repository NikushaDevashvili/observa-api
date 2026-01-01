/**
 * Migration to add api_keys table for split server/publishable keys
 */
import { query } from "../client.js";

export async function migrateAddApiKeys(): Promise<void> {
  try {
    console.log("🔄 Creating api_keys table...");

    await query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        key_prefix VARCHAR(10) NOT NULL CHECK (key_prefix IN ('sk_', 'pk_')),
        key_hash TEXT NOT NULL,
        scopes JSONB NOT NULL DEFAULT '{"ingest": true, "query": false}'::jsonb,
        allowed_origins TEXT[] DEFAULT ARRAY[]::TEXT[],
        revoked_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        last_used_at TIMESTAMP NULL,
        UNIQUE(key_hash)
      )
    `);

    // Create indexes
    await query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant 
      ON api_keys(tenant_id, revoked_at NULLS LAST)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_project 
      ON api_keys(project_id, revoked_at NULLS LAST)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash 
      ON api_keys(key_hash)
    `);

    console.log("✅ api_keys table migration completed successfully");
  } catch (error) {
    console.error("❌ api_keys migration failed:", error);
    // Don't throw - allow the app to continue
  }
}


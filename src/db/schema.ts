import { query } from "./client.js";

/**
 * Database schema initialization
 * Creates all required tables if they don't exist
 */

export async function initializeSchema(): Promise<void> {
  console.log("Initializing database schema...");

  // Create tenants table
  await query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      plan VARCHAR(50) DEFAULT 'free',
      email VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create projects table
  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      environment VARCHAR(50) DEFAULT 'prod',
      monthly_event_quota INTEGER DEFAULT 10000000,
      monthly_event_count INTEGER DEFAULT 0,
      quota_period_start TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(tenant_id, name, environment)
    );
  `);

  // Create users table (for authentication)
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      last_login_at TIMESTAMP
    );
  `);

  // Create sessions table (for JWT session management)
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create tenant_tokens table
  await query(`
    CREATE TABLE IF NOT EXISTS tenant_tokens (
      tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      tinybird_token TEXT NOT NULL,
      tinybird_token_id VARCHAR(255),
      jwt_secret TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create api_keys table (for split server/publishable keys)
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
    );
  `);

  // Create analysis_results table (for ML analysis)
  await query(`
    CREATE TABLE IF NOT EXISTS analysis_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trace_id VARCHAR(255) NOT NULL UNIQUE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      analyzed_at TIMESTAMP DEFAULT NOW(),
      
      -- Hallucination Detection
      is_hallucination BOOLEAN DEFAULT FALSE,
      hallucination_confidence DECIMAL(5,4),
      hallucination_reasoning TEXT,
      
      -- Quality Scores
      quality_score INTEGER,
      coherence_score DECIMAL(5,4),
      relevance_score DECIMAL(5,4),
      helpfulness_score DECIMAL(5,4),
      
      -- Issue Flags
      has_context_drop BOOLEAN DEFAULT FALSE,
      has_model_drift BOOLEAN DEFAULT FALSE,
      has_prompt_injection BOOLEAN DEFAULT FALSE,
      has_context_overflow BOOLEAN DEFAULT FALSE,
      has_faithfulness_issue BOOLEAN DEFAULT FALSE,
      has_cost_anomaly BOOLEAN DEFAULT FALSE,
      has_latency_anomaly BOOLEAN DEFAULT FALSE,
      has_quality_degradation BOOLEAN DEFAULT FALSE,
      
      -- Detailed Metrics
      context_relevance_score DECIMAL(5,4),
      answer_faithfulness_score DECIMAL(5,4),
      drift_score DECIMAL(5,4),
      anomaly_score DECIMAL(5,4),
      
      -- Metadata
      analysis_model VARCHAR(255),
      analysis_version VARCHAR(50),
      processing_time_ms INTEGER,
      
      -- Original trace data (for display) - ALL fields from TraceEvent
      span_id VARCHAR(255),
      parent_span_id VARCHAR(255),
      query TEXT,
      context TEXT,
      response TEXT,
      model VARCHAR(255),
      tokens_prompt INTEGER,
      tokens_completion INTEGER,
      tokens_total INTEGER,
      latency_ms INTEGER,
      time_to_first_token_ms INTEGER,
      streaming_duration_ms INTEGER,
      response_length INTEGER,
      status INTEGER,
      status_text VARCHAR(255),
      finish_reason VARCHAR(255),
      response_id VARCHAR(255),
      system_fingerprint VARCHAR(255),
      metadata_json TEXT,
      headers_json TEXT,
      timestamp TIMESTAMP,
      environment VARCHAR(10),
      
      -- Conversation tracking fields
      conversation_id VARCHAR(255),
      session_id VARCHAR(255),
      user_id VARCHAR(255),
      message_index INTEGER
    );
  `);

  // Create conversations table (groups messages)
  await query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id VARCHAR(255) NOT NULL,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id VARCHAR(255),
      started_at TIMESTAMP DEFAULT NOW(),
      last_message_at TIMESTAMP DEFAULT NOW(),
      message_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      total_cost DECIMAL(10, 4) DEFAULT 0,
      has_issues BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(conversation_id, tenant_id)
    );
  `);

  // Create user_sessions table (browser/app sessions)
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR(255) NOT NULL,
      conversation_id VARCHAR(255),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id VARCHAR(255),
      started_at TIMESTAMP DEFAULT NOW(),
      ended_at TIMESTAMP,
      message_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(session_id, tenant_id)
    );
  `);

  // Create indexes for performance
  await query(`
    CREATE INDEX IF NOT EXISTS idx_analysis_tenant 
    ON analysis_results(tenant_id, analyzed_at);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_analysis_hallucination 
    ON analysis_results(is_hallucination, hallucination_confidence);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_analysis_quality 
    ON analysis_results(quality_score);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_analysis_trace 
    ON analysis_results(trace_id);
  `);

  // Note: Conversation tracking indexes are created in migration
  // (after columns are added) to avoid errors if columns don't exist yet

  await query(`
    CREATE INDEX IF NOT EXISTS idx_projects_tenant 
    ON projects(tenant_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_tenant 
    ON api_keys(tenant_id, revoked_at NULLS LAST);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_project 
    ON api_keys(project_id, revoked_at NULLS LAST);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash 
    ON api_keys(key_hash);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_users_email 
    ON users(email);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_users_tenant 
    ON users(tenant_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user 
    ON sessions(user_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_token 
    ON sessions(token_hash);
  `);

  // Indexes for conversations
  await query(`
    CREATE INDEX IF NOT EXISTS idx_conversations_tenant 
    ON conversations(tenant_id, last_message_at DESC);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_conversations_user 
    ON conversations(tenant_id, user_id, last_message_at DESC);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_conversations_id 
    ON conversations(conversation_id, tenant_id);
  `);

  // Indexes for user_sessions
  await query(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant 
    ON user_sessions(tenant_id, started_at DESC);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user 
    ON user_sessions(tenant_id, user_id, started_at DESC);
  `);

  // Create audit_logs table
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(100) NOT NULL,
      resource_id VARCHAR(255),
      metadata_json TEXT,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create indexes for audit_logs
  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant 
    ON audit_logs(tenant_id, created_at DESC);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_project 
    ON audit_logs(project_id, created_at DESC);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action 
    ON audit_logs(action, created_at DESC);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
    ON audit_logs(user_id, created_at DESC);
  `);

  // Create user_onboarding_progress table
  await query(`
    CREATE TABLE IF NOT EXISTS user_onboarding_progress (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      current_step VARCHAR(255) DEFAULT 'account_created',
      progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
      completed_at TIMESTAMP NULL,
      started_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create onboarding_checklist_items table
  await query(`
    CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      task_key VARCHAR(255) NOT NULL,
      task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('automatic', 'manual')),
      status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
      completed_at TIMESTAMP NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, task_key)
    );
  `);

  // Create email_verification_tokens table
  await query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      verified_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create user_preferences table
  await query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      onboarding_completed BOOLEAN DEFAULT FALSE,
      onboarding_dismissed BOOLEAN DEFAULT FALSE,
      role VARCHAR(50) CHECK (role IN ('developer', 'product_manager', 'executive', 'other')),
      use_case VARCHAR(50) CHECK (use_case IN ('llm_monitoring', 'cost_tracking', 'debugging', 'quality_analysis', 'other')),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create indexes for onboarding tables
  await query(`
    CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user 
    ON user_onboarding_progress(user_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_onboarding_progress_tenant 
    ON user_onboarding_progress(tenant_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_checklist_items_user 
    ON onboarding_checklist_items(user_id, status);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_checklist_items_tenant 
    ON onboarding_checklist_items(tenant_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_user 
    ON email_verification_tokens(user_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_token 
    ON email_verification_tokens(token);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_expires 
    ON email_verification_tokens(expires_at) WHERE verified_at IS NULL;
  `);

  console.log("✅ Core database schema initialized successfully");

  // Run migration to add new columns if needed
  // These are non-blocking - app can function even if migration fails
  // Run migrations in background without blocking schema initialization
  Promise.all([
    (async () => {
      try {
        const { migrateAnalysisResultsTable } = await import("./migrate.js");
        await migrateAnalysisResultsTable();
        console.log("✅ migrateAnalysisResultsTable completed");
      } catch (err: any) {
        console.warn(
          "⚠️ migrateAnalysisResultsTable failed (non-fatal):",
          err?.message || err
        );
      }
    })(),
    (async () => {
      try {
        const { migrateConversationColumns } = await import("./migrate.js");
        await migrateConversationColumns();
        console.log("✅ migrateConversationColumns completed");
      } catch (err: any) {
        console.warn(
          "⚠️ migrateConversationColumns failed (non-fatal):",
          err?.message || err
        );
      }
    })(),
    (async () => {
      try {
        const { migrateAddProjectQuota } = await import(
          "./migrations/addProjectQuota.js"
        );
        await migrateAddProjectQuota();
        console.log("✅ migrateAddProjectQuota completed");
      } catch (err: any) {
        console.warn(
          "⚠️ migrateAddProjectQuota failed (non-fatal):",
          err?.message || err
        );
      }
    })(),
    (async () => {
      try {
        const { migrateAddApiKeys } = await import(
          "./migrations/addApiKeys.js"
        );
        await migrateAddApiKeys();
        console.log("✅ migrateAddApiKeys completed");
      } catch (err: any) {
        console.warn(
          "⚠️ migrateAddApiKeys failed (non-fatal):",
          err?.message || err
        );
      }
    })(),
    (async () => {
      try {
        const { migrateAddDatasets } = await import(
          "./migrations/addDatasets.js"
        );
        await migrateAddDatasets();
        console.log("✅ migrateAddDatasets completed");
      } catch (err: any) {
        console.warn(
          "⚠️ migrateAddDatasets failed (non-fatal):",
          err?.message || err
        );
      }
    })(),
    (async () => {
      try {
        const { migrateAddTraceIndex } = await import(
          "./migrations/addTraceIndex.js"
        );
        await migrateAddTraceIndex();
        console.log("✅ migrateAddTraceIndex completed");
      } catch (err: any) {
        console.warn(
          "⚠️ migrateAddTraceIndex failed (non-fatal):",
          err?.message || err
        );
      }
    })(),
  ]).catch((err) => {
    console.warn(
      "⚠️ Migration background task error (non-fatal):",
      err?.message || err
    );
  });

  // Don't wait for migrations - schema initialization is complete
  // Migrations will run in background and won't block the app
  console.log(
    "✅ Schema initialization complete (migrations running in background)"
  );
}

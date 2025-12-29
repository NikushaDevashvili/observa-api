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
      processing_time_ms INTEGER
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

  await query(`
    CREATE INDEX IF NOT EXISTS idx_projects_tenant 
    ON projects(tenant_id);
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

  console.log("Database schema initialized successfully");
}


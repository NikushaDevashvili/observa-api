/**
 * Migration script to add original trace data columns to analysis_results table
 * Run this after deploying the schema changes
 */
import { query } from "./client.js";

export async function migrateAnalysisResultsTable(): Promise<void> {
  try {
    console.log(
      "🔄 Migrating analysis_results table to add trace data columns..."
    );

    // Check if columns already exist
    const checkColumns = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'analysis_results' 
      AND column_name IN ('query', 'context', 'response', 'model', 'tokens_prompt', 'tokens_completion', 'tokens_total', 'latency_ms', 'response_length', 'timestamp', 'environment')
    `);

    const existingColumns = checkColumns.map((row: any) => row.column_name);
    const columnsToAdd = [
      { name: "span_id", type: "VARCHAR(255)" },
      { name: "parent_span_id", type: "VARCHAR(255)" },
      { name: "query", type: "TEXT" },
      { name: "context", type: "TEXT" },
      { name: "response", type: "TEXT" },
      { name: "model", type: "VARCHAR(255)" },
      { name: "tokens_prompt", type: "INTEGER" },
      { name: "tokens_completion", type: "INTEGER" },
      { name: "tokens_total", type: "INTEGER" },
      { name: "latency_ms", type: "INTEGER" },
      { name: "time_to_first_token_ms", type: "INTEGER" },
      { name: "streaming_duration_ms", type: "INTEGER" },
      { name: "response_length", type: "INTEGER" },
      { name: "status", type: "INTEGER" },
      { name: "status_text", type: "VARCHAR(255)" },
      { name: "finish_reason", type: "VARCHAR(255)" },
      { name: "response_id", type: "VARCHAR(255)" },
      { name: "system_fingerprint", type: "VARCHAR(255)" },
      { name: "metadata_json", type: "TEXT" },
      { name: "headers_json", type: "TEXT" },
      { name: "timestamp", type: "TIMESTAMP" },
      { name: "environment", type: "VARCHAR(10)" },
    ];

    for (const column of columnsToAdd) {
      if (!existingColumns.includes(column.name)) {
        console.log(`  Adding column: ${column.name}`);
        await query(`
          ALTER TABLE analysis_results 
          ADD COLUMN ${column.name} ${column.type}
        `);
      } else {
        console.log(`  Column ${column.name} already exists, skipping`);
      }
    }

    console.log("✅ Migration completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

/**
 * Migration to add conversation tracking columns to analysis_results table
 */
export async function migrateConversationColumns(): Promise<void> {
  try {
    console.log(
      "🔄 Migrating analysis_results table to add conversation tracking columns..."
    );

    const conversationColumns = [
      { name: "conversation_id", type: "VARCHAR(255)" },
      { name: "session_id", type: "VARCHAR(255)" },
      { name: "user_id", type: "VARCHAR(255)" },
      { name: "message_index", type: "INTEGER" },
    ];

    // Check existing columns
    const checkColumns = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'analysis_results' 
      AND column_name IN (${conversationColumns
        .map((c) => `'${c.name}'`)
        .join(",")})
    `);
    const existingColumns = checkColumns.map((row: any) => row.column_name);

    for (const col of conversationColumns) {
      if (!existingColumns.includes(col.name)) {
        console.log(`  Adding column: ${col.name}`);
        await query(
          `ALTER TABLE analysis_results ADD COLUMN ${col.name} ${col.type}`
        );
      } else {
        console.log(`  Column ${col.name} already exists, skipping`);
      }
    }

    // Create indexes for conversation queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_conversation 
      ON analysis_results(conversation_id, message_index);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_session 
      ON analysis_results(session_id, timestamp);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_user 
      ON analysis_results(tenant_id, user_id, timestamp DESC);
    `);

    console.log("✅ Conversation columns migration completed successfully");
  } catch (error) {
    console.error("❌ Conversation columns migration failed:", error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateAnalysisResultsTable()
    .then(() => {
      console.log("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}

/**
 * Diagnostic script to check what trace data is actually stored in the database
 * and what the API returns
 */

import dotenv from "dotenv";
dotenv.config();

import { query } from "../dist/db/client.js";

async function checkTraceData(traceId) {
  console.log(`\n🔍 Checking trace data for: ${traceId}\n`);

  try {
    // Get full trace data from database
    const rows = await query(
      `SELECT * FROM analysis_results WHERE trace_id = $1 LIMIT 1`,
      [traceId]
    );

    if (rows.length === 0) {
      console.log("❌ Trace not found in database");
      return;
    }

    const trace = rows[0];
    console.log("✅ Trace found in database\n");

    // Check analysis fields
    console.log("📊 Analysis Results:");
    console.log("  - is_hallucination:", trace.is_hallucination);
    console.log("  - hallucination_confidence:", trace.hallucination_confidence);
    console.log("  - hallucination_reasoning:", trace.hallucination_reasoning ? "present" : "null");
    console.log("  - quality_score:", trace.quality_score);
    console.log("  - coherence_score:", trace.coherence_score);
    console.log("  - relevance_score:", trace.relevance_score);
    console.log("  - helpfulness_score:", trace.helpfulness_score);
    console.log("  - has_context_drop:", trace.has_context_drop);
    console.log("  - has_model_drift:", trace.has_model_drift);
    console.log("  - has_faithfulness_issue:", trace.has_faithfulness_issue);
    console.log("  - has_cost_anomaly:", trace.has_cost_anomaly);
    console.log("  - context_relevance_score:", trace.context_relevance_score);
    console.log("  - answer_faithfulness_score:", trace.answer_faithfulness_score);
    console.log("  - drift_score:", trace.drift_score);
    console.log("  - anomaly_score:", trace.anomaly_score);
    console.log("  - analysis_model:", trace.analysis_model);
    console.log("  - analysis_version:", trace.analysis_version);
    console.log("  - processing_time_ms:", trace.processing_time_ms);
    console.log("  - analyzed_at:", trace.analyzed_at);

    console.log("\n📝 Trace Data:");
    console.log("  - query:", trace.query ? trace.query.substring(0, 50) + "..." : "null");
    console.log("  - context:", trace.context ? "present (" + trace.context.length + " chars)" : "null");
    console.log("  - response:", trace.response ? "present (" + trace.response.length + " chars)" : "null");
    console.log("  - model:", trace.model);
    console.log("  - tokens_prompt:", trace.tokens_prompt);
    console.log("  - tokens_completion:", trace.tokens_completion);
    console.log("  - tokens_total:", trace.tokens_total);
    console.log("  - latency_ms:", trace.latency_ms);
    console.log("  - time_to_first_token_ms:", trace.time_to_first_token_ms);
    console.log("  - streaming_duration_ms:", trace.streaming_duration_ms);
    console.log("  - finish_reason:", trace.finish_reason);
    console.log("  - response_id:", trace.response_id);
    console.log("  - system_fingerprint:", trace.system_fingerprint);
    console.log("  - metadata_json:", trace.metadata_json ? "present" : "null");
    console.log("  - headers_json:", trace.headers_json ? "present" : "null");

    console.log("\n💬 Conversation Tracking:");
    console.log("  - conversation_id:", trace.conversation_id);
    console.log("  - session_id:", trace.session_id);
    console.log("  - user_id:", trace.user_id);
    console.log("  - message_index:", trace.message_index);

    // Check if analysis has run
    const hasAnalysis = trace.analyzed_at && 
      (trace.is_hallucination !== null || 
       trace.quality_score !== null || 
       trace.analysis_model !== null);
    
    console.log("\n🔬 Analysis Status:");
    if (hasAnalysis) {
      console.log("  ✅ Analysis has been run");
      console.log("  - Analysis completed at:", trace.analyzed_at);
    } else {
      console.log("  ⚠️  Analysis has NOT been run yet");
      console.log("  - Check if ANALYSIS_SERVICE_URL is set");
      console.log("  - Analysis may still be in progress");
    }

    // Check environment
    console.log("\n🌍 Environment:");
    console.log("  - ANALYSIS_SERVICE_URL:", process.env.ANALYSIS_SERVICE_URL || "NOT SET");

    console.log("\n📋 Full Database Row (first 10 fields):");
    const fieldNames = Object.keys(trace).slice(0, 10);
    for (const field of fieldNames) {
      const value = trace[field];
      if (value === null || value === undefined) {
        console.log(`  - ${field}: null/undefined`);
      } else if (typeof value === 'string' && value.length > 100) {
        console.log(`  - ${field}: [string, ${value.length} chars]`);
      } else {
        console.log(`  - ${field}: ${value}`);
      }
    }

  } catch (error) {
    console.error("❌ Error checking trace data:", error);
    throw error;
  }
}

// Get trace ID from command line
const traceId = process.argv[2];

if (!traceId) {
  console.error("Usage: node scripts/check-trace-data.js <trace_id>");
  console.error("\nExample:");
  console.error("  node scripts/check-trace-data.js 0dee6ce7-acf4-459a-9d1a-a6f5bbe1778c");
  process.exit(1);
}

checkTraceData(traceId)
  .then(() => {
    console.log("\n✅ Check complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Check failed:", error);
    process.exit(1);
  });


/**
 * Debug script to check dashboard metrics queries
 * Run with: node scripts/debug-dashboard-metrics.js <tenantId> [projectId]
 */

import dotenv from "dotenv";
dotenv.config();

import { query } from "../dist/db/client.js";

async function debugDashboardMetrics(tenantId, projectId = null) {
  console.log(`\n🔍 Debugging Dashboard Metrics\n`);
  console.log(`Tenant ID: ${tenantId}`);
  console.log(`Project ID: ${projectId || "all"}\n`);

  try {
    // Check total count without filters
    console.log("1. Checking total trace count (no time filter)...");
    let sql = "SELECT COUNT(*) as count FROM analysis_results WHERE tenant_id = $1";
    const params = [tenantId];
    
    if (projectId) {
      sql += " AND project_id = $2";
      params.push(projectId);
    }
    
    const totalResult = await query(sql, params);
    console.log(`   Total traces: ${totalResult[0]?.count || 0}`);

    // Check recent data (last 24 hours using analyzed_at)
    console.log("\n2. Checking traces from last 24 hours (analyzed_at)...");
    sql = `SELECT COUNT(*) as count FROM analysis_results 
           WHERE tenant_id = $1 AND analyzed_at > NOW() - INTERVAL '24 hours'`;
    const recentParams = [tenantId];
    
    if (projectId) {
      sql += " AND project_id = $2";
      recentParams.push(projectId);
    }
    
    const recentResult = await query(sql, recentParams);
    console.log(`   Recent traces (24h): ${recentResult[0]?.count || 0}`);

    // Check with timestamp field
    console.log("\n3. Checking traces with timestamp field set...");
    sql = "SELECT COUNT(*) as count FROM analysis_results WHERE tenant_id = $1 AND timestamp IS NOT NULL";
    const timestampParams = [tenantId];
    
    if (projectId) {
      sql += " AND project_id = $2";
      timestampParams.push(projectId);
    }
    
    const timestampResult = await query(sql, timestampParams);
    console.log(`   Traces with timestamp: ${timestampResult[0]?.count || 0}`);

    // Check sample data
    console.log("\n4. Sample trace data (first 5):");
    sql = `SELECT trace_id, tenant_id, project_id, timestamp, analyzed_at, latency_ms, tokens_total, model
           FROM analysis_results 
           WHERE tenant_id = $1
           ORDER BY COALESCE(timestamp, analyzed_at) DESC
           LIMIT 5`;
    const sampleParams = [tenantId];
    
    const sampleResult = await query(sql, sampleParams);
    if (sampleResult.length > 0) {
      sampleResult.forEach((row, i) => {
        console.log(`   ${i + 1}. trace_id: ${row.trace_id}`);
        console.log(`      timestamp: ${row.timestamp || "NULL"}, analyzed_at: ${row.analyzed_at}`);
        console.log(`      latency_ms: ${row.latency_ms || "NULL"}, tokens_total: ${row.tokens_total || "NULL"}`);
        console.log(`      model: ${row.model || "NULL"}\n`);
      });
    } else {
      console.log("   No traces found");
    }

    // Test the actual query with time range (last 24 hours)
    console.log("5. Testing actual dashboard query (last 24 hours)...");
    const endTime = new Date().toISOString();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1);
    const startTime = startDate.toISOString();
    
    console.log(`   Start time: ${startTime}`);
    console.log(`   End time: ${endTime}`);
    
    sql = `SELECT COUNT(DISTINCT trace_id) as count 
           FROM analysis_results 
           WHERE tenant_id = $1 
           AND COALESCE(timestamp, analyzed_at) >= $2
           AND COALESCE(timestamp, analyzed_at) <= $3`;
    const testParams = [tenantId, startTime, endTime];
    
    if (projectId) {
      sql += " AND project_id = $4";
      testParams.push(projectId);
    }
    
    const testResult = await query(sql, testParams);
    console.log(`   Count with time filter: ${testResult[0]?.count || 0}`);

    // Check latency data
    console.log("\n6. Checking latency metrics...");
    sql = `SELECT 
             COUNT(*) as count,
             AVG(latency_ms) as avg_latency,
             MIN(latency_ms) as min_latency,
             MAX(latency_ms) as max_latency
           FROM analysis_results 
           WHERE tenant_id = $1 
           AND latency_ms IS NOT NULL 
           AND latency_ms > 0`;
    const latencyParams = [tenantId];
    
    if (projectId) {
      sql += " AND project_id = $2";
      latencyParams.push(projectId);
    }
    
    const latencyResult = await query(sql, latencyParams);
    console.log(`   Traces with latency data: ${latencyResult[0]?.count || 0}`);
    console.log(`   Avg latency: ${latencyResult[0]?.avg_latency || 0}ms`);

    // Check token data
    console.log("\n7. Checking token metrics...");
    sql = `SELECT 
             COUNT(*) as count,
             SUM(tokens_total) as total_tokens
           FROM analysis_results 
           WHERE tenant_id = $1 
           AND tokens_total IS NOT NULL`;
    const tokenParams = [tenantId];
    
    if (projectId) {
      sql += " AND project_id = $2";
      tokenParams.push(projectId);
    }
    
    const tokenResult = await query(sql, tokenParams);
    console.log(`   Traces with token data: ${tokenResult[0]?.count || 0}`);
    console.log(`   Total tokens: ${tokenResult[0]?.total_tokens || 0}`);

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Get tenant ID from command line args
const tenantId = process.argv[2];
const projectId = process.argv[3] || null;

if (!tenantId) {
  console.error("Usage: node scripts/debug-dashboard-metrics.js <tenantId> [projectId]");
  process.exit(1);
}

debugDashboardMetrics(tenantId, projectId).then(() => {
  console.log("\n✅ Debug complete\n");
  process.exit(0);
}).catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});






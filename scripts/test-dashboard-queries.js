/**
 * Test dashboard queries to see if they're working
 * 
 * Usage:
 *   node scripts/test-dashboard-queries.js
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;
const TENANT_ID = process.env.TENANT_ID || "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6";
const PROJECT_ID = process.env.PROJECT_ID || "7aca92fe-ad27-41c2-bc0b-96e94dd2d165";

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

// Calculate time range (last 24 hours)
const end = new Date().toISOString();
const startDate = new Date();
startDate.setDate(startDate.getDate() - 1);
const start = startDate.toISOString();

async function testQuery(name, sql) {
  console.log(`\n📊 Testing: ${name}`);
  console.log(`SQL: ${sql.substring(0, 200)}...\n`);

  const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    const responseText = await response.text();
    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.log(`   ❌ Error: ${responseText.substring(0, 500)}`);
      return null;
    }

    try {
      const data = JSON.parse(responseText);
      const results = Array.isArray(data) ? data : (data.data || []);
      console.log(`   ✅ Results: ${results.length} row(s)`);
      if (results.length > 0) {
        console.log(`   Sample: ${JSON.stringify(results[0], null, 2)}`);
      }
      return results;
    } catch (e) {
      console.log(`   ⚠️  Response is not JSON: ${responseText.substring(0, 200)}`);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Exception: ${error.message}`);
    return null;
  }
}

async function testDashboardQueries() {
  console.log("\n🧪 Testing Dashboard Queries");
  console.log("============================\n");
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Time Range: ${start} to ${end}\n`);

  const escapedTenantId = TENANT_ID.replace(/'/g, "''");
  const escapedProjectId = PROJECT_ID.replace(/'/g, "''");

  // Test 1: Trace count
  const traceCountSql = `
    SELECT count(DISTINCT trace_id) as count
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND event_type IN ('trace_start', 'llm_call')
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
  `;
  await testQuery("Trace Count", traceCountSql);

  // Test 2: Latency metrics
  const latencySql = `
    SELECT 
      quantile(0.5)(toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))) as p50,
      quantile(0.95)(toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))) as p95,
      quantile(0.99)(toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))) as p99,
      avg(toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))) as avg,
      count(*) as count
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND event_type = 'llm_call'
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
      AND toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms')) IS NOT NULL
      AND toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms')) > 0
  `;
  await testQuery("Latency Metrics", latencySql);

  // Test 3: Error count
  const errorCountSql = `
    SELECT count(DISTINCT trace_id) as error_count
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND event_type = 'error'
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
  `;
  await testQuery("Error Count", errorCountSql);

  // Test 4: Cost metrics
  const costSql = `
    SELECT 
      sum(toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.cost'))) as total_cost,
      count(*) as count
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND event_type = 'llm_call'
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
      AND toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.cost')) IS NOT NULL
  `;
  await testQuery("Cost Metrics", costSql);

  // Test 5: Token metrics
  const tokenSql = `
    SELECT 
      sum(toInt64OrNull(JSONExtractString(attributes_json, '$.llm_call.total_tokens'))) as total_tokens,
      count(*) as count
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND event_type = 'llm_call'
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
      AND toInt64OrNull(JSONExtractString(attributes_json, '$.llm_call.total_tokens')) IS NOT NULL
  `;
  await testQuery("Token Metrics", tokenSql);

  // Test 6: Simple count to verify data exists
  const simpleCountSql = `
    SELECT count(*) as total_events
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
  `;
  await testQuery("Total Events (Simple)", simpleCountSql);

  console.log("\n💡 If all queries return 0 or fail, check:");
  console.log("   1. Time range - events might be outside the last 24 hours");
  console.log("   2. Tenant/Project IDs - verify they match your test data");
  console.log("   3. Tinybird permissions - token needs DATASOURCES:READ permission");
  console.log("   4. Data format - check if attributes_json structure matches queries\n");
}

testDashboardQueries().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


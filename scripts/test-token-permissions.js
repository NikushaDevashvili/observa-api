/**
 * Test Tinybird token permissions
 * 
 * Usage:
 *   node scripts/test-token-permissions.js
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TEST_TOKEN = process.argv[2] || process.env.TINYBIRD_ADMIN_TOKEN;

if (!TEST_TOKEN) {
  console.error("❌ Error: Token required as argument or TINYBIRD_ADMIN_TOKEN env var");
  console.error("Usage: node scripts/test-token-permissions.js <token>");
  process.exit(1);
}

const TENANT_ID = process.env.TENANT_ID || "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6";
const PROJECT_ID = process.env.PROJECT_ID || "7aca92fe-ad27-41c2-bc0b-96e94dd2d165";

// Calculate time range (last 24 hours)
const end = new Date().toISOString();
const startDate = new Date();
startDate.setDate(startDate.getDate() - 1);
const start = startDate.toISOString();

async function testQuery(name, sql) {
  console.log(`\n📊 Testing: ${name}`);

  const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}&format=json`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    const responseText = await response.text();
    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.log(`   ❌ Error: ${responseText.substring(0, 500)}`);
      return { success: false, error: responseText };
    }

    try {
      const data = JSON.parse(responseText);
      const results = Array.isArray(data) ? data : (data.data || []);
      console.log(`   ✅ Success: ${results.length} row(s)`);
      if (results.length > 0) {
        console.log(`   Sample: ${JSON.stringify(results[0], null, 2)}`);
      }
      return { success: true, results };
    } catch (e) {
      console.log(`   ⚠️  Response is not JSON: ${responseText.substring(0, 200)}`);
      return { success: false, error: "Invalid JSON response" };
    }
  } catch (error) {
    console.log(`   ❌ Exception: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testTokenPermissions() {
  console.log("\n🔐 Testing Tinybird Token Permissions");
  console.log("====================================\n");
  console.log(`Token: ${TEST_TOKEN.substring(0, 20)}...${TEST_TOKEN.substring(TEST_TOKEN.length - 10)}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Time Range: ${start} to ${end}\n`);

  const escapedTenantId = TENANT_ID.replace(/'/g, "''");
  const escapedProjectId = PROJECT_ID.replace(/'/g, "''");

  // Test 1: Simple count to verify data exists
  const simpleCountSql = `
    SELECT count(*) as total_events
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
  `;
  const result1 = await testQuery("1. Total Events Count", simpleCountSql);

  // Test 2: Trace count
  const traceCountSql = `
    SELECT count(DISTINCT trace_id) as count
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND event_type IN ('trace_start', 'llm_call')
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
  `;
  const result2 = await testQuery("2. Trace Count", traceCountSql);

  // Test 3: Latency metrics
  const latencySql = `
    SELECT 
      quantile(0.5)(toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))) as p50,
      quantile(0.95)(toFloat64OrNull(JSONExtractString(attributes_json, '$.llm_call.latency_ms'))) as p95,
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
  const result3 = await testQuery("3. Latency Metrics", latencySql);

  // Summary
  console.log("\n📋 Summary");
  console.log("==========");
  const allSuccess = result1.success && result2.success && result3.success;
  
  if (allSuccess) {
    console.log("✅ All queries succeeded! Token has required permissions.");
    console.log("\n💡 Next steps:");
    console.log("   1. Update TINYBIRD_ADMIN_TOKEN in Vercel environment variables");
    console.log("   2. Redeploy the application");
    console.log("   3. Dashboard should now show data");
  } else {
    console.log("❌ Some queries failed. Token may be missing permissions.");
    console.log("\n💡 To fix:");
    console.log("   1. Go to https://app.tinybird.co/ → Settings → Tokens");
    console.log("   2. Find your token and add scope: DATASOURCES:READ:canonical_events");
    console.log("   3. Or create a new token with proper permissions");
  }
  
  console.log("");
}

testTokenPermissions().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


/**
 * Test dashboard overview endpoint directly with JWT token
 * This bypasses session auth and tests the underlying queries
 */

import dotenv from "dotenv";
dotenv.config();

const API_URL = process.env.API_URL || "https://observa-api.vercel.app";
const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;

if (!JWT_TOKEN) {
  console.error("❌ Error: JWT token required");
  console.error("Usage: node scripts/test-dashboard-direct.js <jwt-token>");
  process.exit(1);
}

// Extract tenant/project from JWT
let tenantId, projectId;
try {
  const payload = JSON.parse(Buffer.from(JWT_TOKEN.split('.')[1], 'base64').toString());
  tenantId = payload.tenantId;
  projectId = payload.projectId;
  console.log(`\n🔑 Token Info:`);
  console.log(`   Tenant: ${tenantId}`);
  console.log(`   Project: ${projectId}`);
  console.log(`   Environment: ${payload.environment || 'prod'}\n`);
} catch (e) {
  console.error("❌ Could not parse JWT token");
  process.exit(1);
}

async function testTinybirdDirectly() {
  console.log("🔍 Testing Tinybird Connection Directly\n");
  
  const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
  const TINYBIRD_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;
  
  if (!TINYBIRD_TOKEN) {
    console.log("⚠️  TINYBIRD_ADMIN_TOKEN not set in environment");
    console.log("   Testing with provided token...\n");
    return;
  }

  const end = new Date().toISOString();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const start = startDate.toISOString();

  const escapedTenantId = tenantId.replace(/'/g, "''");
  const escapedProjectId = projectId.replace(/'/g, "''");

  // Test 1: Simple count
  const sql = `
    SELECT count(*) as total
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
  `;

  const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}&format=json`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_TOKEN}`,
      },
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.log(`❌ Error: ${responseText.substring(0, 500)}`);
      if (responseText.includes("permissions")) {
        console.log("\n💡 Token is missing DATASOURCES:READ:canonical_events permission");
      }
    } else {
      try {
        const data = JSON.parse(responseText);
        const results = Array.isArray(data) ? data : (data.data || []);
        const row = results[0] || {};
        console.log(`✅ Query successful: ${row.total || 0} events found`);
      } catch (e) {
        // Handle TSV
        if (responseText.includes("\t")) {
          const lines = responseText.trim().split("\n");
          if (lines.length > 1) {
            const values = lines[1].split("\t");
            console.log(`✅ Query successful: ${values[0] || 0} events found`);
          }
        } else {
          console.log(`⚠️  Unexpected response: ${responseText.substring(0, 200)}`);
        }
      }
    }
  } catch (error) {
    console.error("❌ Request failed:", error.message);
  }
}

async function testDashboardOverview() {
  console.log("\n📊 Testing Dashboard Overview (via API)\n");
  
  // Try to call the overview endpoint
  // Note: This will fail with 401 because it needs session token
  // But we can see if the endpoint exists and what error it returns
  
  try {
    const response = await fetch(`${API_URL}/api/v1/dashboard/overview?days=7`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${JWT_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        console.log("✅ Dashboard Overview Response:");
        console.log(JSON.stringify(data, null, 2));
      } catch (e) {
        console.log("Response:", responseText);
      }
    } else {
      console.log("❌ Error Response:");
      console.log(responseText);
      
      if (response.status === 401) {
        console.log("\n💡 This endpoint requires a session token (from login), not a JWT token");
        console.log("   The dashboard frontend should handle authentication automatically");
      }
    }
  } catch (error) {
    console.error("❌ Request failed:", error.message);
  }
}

async function main() {
  await testTinybirdDirectly();
  await testDashboardOverview();
  
  console.log("\n💡 Summary:");
  console.log("   1. Check Vercel logs for [Dashboard] messages");
  console.log("   2. Verify TINYBIRD_ADMIN_TOKEN has DATASOURCES:READ:canonical_events permission");
  console.log("   3. Check browser Network tab for /api/v1/dashboard/overview calls");
  console.log("   4. Verify the session token is being sent from the frontend\n");
}

main().catch(console.error);


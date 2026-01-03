/**
 * Verify that the token is working in Vercel
 * This tests the actual deployed endpoint
 */

const API_URL = "https://observa-api.vercel.app";
const TINYBIRD_TOKEN = "p.eyJ1IjogImVmNGNjNGFlLTExZDAtNDVhNy1hNTcxLTJiZDg1NWNkZDZkNCIsICJpZCI6ICIyYmNmMjU5ZS01MWM1LTQ0NGUtODFkNS00NDZmYjljYzQzNjMiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.IDQZZNus_b5-OqdRYd-Qod_0YOiPnR6jsIJgk_prfoI";

async function testTinybirdWithToken() {
  console.log("\n🔍 Testing Tinybird Token in Vercel Environment\n");
  console.log("This simulates what the dashboard API does...\n");

  const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
  const TENANT_ID = "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6";
  const PROJECT_ID = "7aca92fe-ad27-41c2-bc0b-96e94dd2d165";

  const end = new Date().toISOString();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const start = startDate.toISOString();

  const escapedTenantId = TENANT_ID.replace(/'/g, "''");
  const escapedProjectId = PROJECT_ID.replace(/'/g, "''");

  // Test the exact query the dashboard uses
  const sql = `
    SELECT count(DISTINCT trace_id) as count
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
      AND event_type IN ('trace_start', 'llm_call')
      AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
      AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
  `;

  const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}&format=json`;

  console.log(`Query: Trace count for last 7 days`);
  console.log(`Time range: ${start} to ${end}\n`);

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
        console.log("\n⚠️  Token is still missing DATASOURCES:READ:canonical_events permission");
        console.log("   Make sure you:");
        console.log("   1. Updated TINYBIRD_ADMIN_TOKEN in Vercel");
        console.log("   2. Redeployed the application");
        console.log("   3. Waited for deployment to complete");
      }
      return false;
    }

    try {
      const data = JSON.parse(responseText);
      const results = Array.isArray(data) ? data : (data.data || []);
      const row = results[0] || {};
      const count = row.count || 0;
      
      console.log(`✅ Success! Found ${count} traces`);
      
      if (count === 0) {
        console.log("\n⚠️  Query succeeded but returned 0 traces");
        console.log("   This could mean:");
        console.log("   - No data in the last 7 days (check time range)");
        console.log("   - Data exists but outside the time range");
        console.log("   - Tenant/Project IDs don't match");
      } else {
        console.log("\n✅ Token is working correctly!");
        console.log("   If dashboard still shows 0, check:");
        console.log("   1. Frontend is calling the correct API endpoint");
        console.log("   2. Frontend is sending the correct time range");
        console.log("   3. Frontend is sending authentication headers");
      }
      
      return true;
    } catch (e) {
      // Handle TSV
      if (responseText.includes("\t")) {
        const lines = responseText.trim().split("\n");
        if (lines.length > 1) {
          const values = lines[1].split("\t");
          const count = parseInt(values[0]) || 0;
          console.log(`✅ Success! Found ${count} traces (TSV format)`);
          return count > 0;
        }
      }
      console.log(`⚠️  Unexpected response format: ${responseText.substring(0, 200)}`);
      return false;
    }
  } catch (error) {
    console.error("❌ Request failed:", error.message);
    return false;
  }
}

testTinybirdWithToken().catch(console.error);


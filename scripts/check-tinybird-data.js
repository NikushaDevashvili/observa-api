/**
 * Check if data exists in Tinybird with wider time range
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TEST_TOKEN = "p.eyJ1IjogImVmNGNjNGFlLTExZDAtNDVhNy1hNTcxLTJiZDg1NWNkZDZkNCIsICJpZCI6ICIyYmNmMjU5ZS01MWM1LTQ0NGUtODFkNS00NDZmYjljYzQzNjMiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.IDQZZNus_b5-OqdRYd-Qod_0YOiPnR6jsIJgk_prfoI";

const TENANT_ID = "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6";
const PROJECT_ID = "7aca92fe-ad27-41c2-bc0b-96e94dd2d165";

async function checkData() {
  console.log("\n🔍 Checking Tinybird Data");
  console.log("========================\n");

  const escapedTenantId = TENANT_ID.replace(/'/g, "''");
  const escapedProjectId = PROJECT_ID.replace(/'/g, "''");

  // Check 1: All time (no time filter)
  const allTimeSql = `
    SELECT 
      count(*) as total_events,
      min(timestamp) as earliest,
      max(timestamp) as latest
    FROM canonical_events
    WHERE tenant_id = '${escapedTenantId}'
      AND project_id = '${escapedProjectId}'
  `;

  const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(allTimeSql)}&format=json`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.log(`❌ Error: ${responseText}`);
      return;
    }

    // Handle TSV format (Tinybird default)
    let row = {};
    if (responseText.includes("\t")) {
      const lines = responseText.trim().split("\n");
      if (lines.length > 1) {
        const headers = lines[0].split("\t");
        const values = lines[1].split("\t");
        row = {};
        headers.forEach((h, i) => {
          row[h] = values[i] || null;
        });
      }
    } else {
      // Try JSON
      try {
        const data = JSON.parse(responseText);
        const results = Array.isArray(data) ? data : (data.data || []);
        row = results[0] || {};
      } catch (e) {
        console.log(`⚠️  Could not parse response: ${responseText.substring(0, 200)}`);
        return;
      }
    }

    console.log(`Total Events: ${row.total_events || 0}`);
    console.log(`Earliest: ${row.earliest || "N/A"}`);
    console.log(`Latest: ${row.latest || "N/A"}`);

    if (row.total_events > 0) {
      console.log("\n✅ Data exists! Checking recent data...\n");

      // Check last 7 days
      const end = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const start = startDate.toISOString();

      const recentSql = `
        SELECT 
          count(*) as total_events,
          count(DISTINCT trace_id) as trace_count,
          min(timestamp) as earliest,
          max(timestamp) as latest
        FROM canonical_events
        WHERE tenant_id = '${escapedTenantId}'
          AND project_id = '${escapedProjectId}'
          AND timestamp >= parseDateTime64BestEffort('${start.replace(/'/g, "''")}', 3)
          AND timestamp <= parseDateTime64BestEffort('${end.replace(/'/g, "''")}', 3)
      `;

      const recentUrl = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(recentSql)}&format=json`;
      const recentResponse = await fetch(recentUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
      });

      const recentText = await recentResponse.text();
      if (recentResponse.ok) {
        let recentRow = {};
        if (recentText.includes("\t")) {
          const lines = recentText.trim().split("\n");
          if (lines.length > 1) {
            const headers = lines[0].split("\t");
            const values = lines[1].split("\t");
            recentRow = {};
            headers.forEach((h, i) => {
              recentRow[h] = values[i] || null;
            });
          }
        } else {
          try {
            const recentData = JSON.parse(recentText);
            const recentResults = Array.isArray(recentData) ? recentData : (recentData.data || []);
            recentRow = recentResults[0] || {};
          } catch (e) {
            console.log(`⚠️  Could not parse recent response`);
            return;
          }
        }

        console.log(`Last 7 Days:`);
        console.log(`  Events: ${recentRow.total_events || 0}`);
        console.log(`  Traces: ${recentRow.trace_count || 0}`);
        console.log(`  Earliest: ${recentRow.earliest || "N/A"}`);
        console.log(`  Latest: ${recentRow.latest || "N/A"}`);

        if (recentRow.total_events > 0) {
          console.log("\n💡 Dashboard should use last 7 days or wider time range");
        } else {
          console.log("\n⚠️  No data in last 7 days - data might be older");
        }
      }
    } else {
      console.log("\n❌ No data found for this tenant/project");
      console.log("   Make sure events were sent with correct tenant_id and project_id");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkData().catch(console.error);


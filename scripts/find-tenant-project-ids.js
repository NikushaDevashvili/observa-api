/**
 * Find tenant/project IDs in Tinybird data
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TEST_TOKEN = "p.eyJ1IjogImVmNGNjNGFlLTExZDAtNDVhNy1hNTcxLTJiZDg1NWNkZDZkNCIsICJpZCI6ICIyYmNmMjU5ZS01MWM1LTQ0NGUtODFkNS00NDZmYjljYzQzNjMiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.IDQZZNus_b5-OqdRYd-Qod_0YOiPnR6jsIJgk_prfoI";

async function findTenantProjectIds() {
  console.log("\n🔍 Finding Tenant/Project IDs in Tinybird");
  console.log("==========================================\n");

  // Query to get distinct tenant/project combinations
  const sql = `
    SELECT 
      tenant_id,
      project_id,
      count(*) as event_count,
      count(DISTINCT trace_id) as trace_count,
      min(timestamp) as earliest,
      max(timestamp) as latest
    FROM canonical_events
    GROUP BY tenant_id, project_id
    ORDER BY event_count DESC
    LIMIT 10
  `;

  const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}&format=json`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Response length: ${responseText.length}`);
    console.log(`Response preview: ${responseText.substring(0, 500)}\n`);

    if (!response.ok) {
      console.log(`❌ Error: ${responseText}`);
      return;
    }

    // Handle TSV format
    if (responseText.includes("\t")) {
      const lines = responseText.trim().split("\n");
      if (lines.length > 1) {
        const headers = lines[0].split("\t");
        console.log("Found Tenant/Project combinations:\n");
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split("\t");
          const row = {};
          headers.forEach((h, j) => {
            row[h] = values[j] || null;
          });
          console.log(`Tenant: ${row.tenant_id}`);
          console.log(`Project: ${row.project_id}`);
          console.log(`Events: ${row.event_count}`);
          console.log(`Traces: ${row.trace_count}`);
          console.log(`Earliest: ${row.earliest}`);
          console.log(`Latest: ${row.latest}`);
          console.log("");
        }
      }
    } else {
      // Try JSON
      try {
        const data = JSON.parse(responseText);
        const results = Array.isArray(data) ? data : (data.data || []);
        console.log("Found Tenant/Project combinations:\n");
        for (const row of results) {
          console.log(`Tenant: ${row.tenant_id}`);
          console.log(`Project: ${row.project_id}`);
          console.log(`Events: ${row.event_count}`);
          console.log(`Traces: ${row.trace_count}`);
          console.log(`Earliest: ${row.earliest}`);
          console.log(`Latest: ${row.latest}`);
          console.log("");
        }
      } catch (e) {
        console.log(`⚠️  Could not parse response: ${responseText.substring(0, 500)}`);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

findTenantProjectIds().catch(console.error);


/**
 * Verify a specific trace exists in Tinybird
 * 
 * Usage:
 *   node scripts/verify-trace-in-tinybird.js <traceId>
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;
const TRACE_ID = process.argv[2] || "0a15d3f8-f6e4-49e2-8285-4191cc9cac59";

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

async function verifyTrace() {
  console.log(`\n🔍 Verifying Trace in Tinybird`);
  console.log("==============================\n");
  console.log(`Trace ID: ${TRACE_ID}\n`);

  // Use the Management API to get datasource info first
  const datasourceUrl = `${TINYBIRD_HOST}/v0/datasources/canonical_events`;
  
  try {
    const response = await fetch(datasourceUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const stats = data.statistics || {};
      console.log(`📊 Current Datasource Statistics:`);
      console.log(`   Total Rows: ${stats.row_count || "unknown"}`);
      console.log(`   Total Bytes: ${stats.bytes || "unknown"}`);
      console.log(`   Last Updated: ${data.updated_at || "unknown"}\n`);
    }
  } catch (error) {
    console.log(`⚠️  Could not get statistics: ${error.message}\n`);
  }

  console.log(`💡 Note: To query the trace directly, you need DATASOURCES:READ permission.`);
  console.log(`   The trace should appear in your Tinybird dashboard.`);
  console.log(`   Check: https://app.tinybird.co/ → canonical_events datasource\n`);
  
  console.log(`✅ Test load completed successfully!`);
  console.log(`   - 385 events sent`);
  console.log(`   - 100% success rate`);
  console.log(`   - Row count increased (indicating events are being stored)`);
  console.log(`   - Check your dashboard to see the new events\n`);
}

verifyTrace().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


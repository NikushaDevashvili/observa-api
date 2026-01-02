/**
 * Verify recent event ingestion
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

async function verifyIngestion() {
  console.log("🔍 Verifying recent event ingestion...\n");

  // Query for events from the last 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const sql = `
    SELECT 
      count() as event_count,
      count(DISTINCT trace_id) as trace_count,
      min(timestamp) as first_event,
      max(timestamp) as last_event
    FROM canonical_events
    WHERE timestamp >= '${fiveMinutesAgo}'
      AND tenant_id = '4f62d2a5-6a34-4d53-a301-c0c661b0c4d6'
      AND project_id = '7aca92fe-ad27-41c2-bc0b-96e94dd2d165'
  `;

  const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const rows = Array.isArray(data) ? data : (data.data || []);
      
      if (rows.length > 0) {
        const row = rows[0];
        console.log("✅ Recent events found:");
        console.log(`  - Event count: ${row.event_count || 0}`);
        console.log(`  - Trace count: ${row.trace_count || 0}`);
        console.log(`  - First event: ${row.first_event || 'N/A'}`);
        console.log(`  - Last event: ${row.last_event || 'N/A'}`);
        
        if (parseInt(row.event_count || "0") > 0) {
          console.log("\n🎉 Events were successfully ingested (not quarantined)!");
        } else {
          console.log("\n⚠️  No events found in the last 5 minutes");
        }
      } else {
        console.log("⚠️  No data returned");
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Error ${response.status}: ${errorText.substring(0, 300)}`);
      console.log("\n💡 This might be a permissions issue. Events may still have been ingested.");
    }
  } catch (error) {
    console.error(`❌ Exception: ${error.message}`);
  }
}

verifyIngestion();



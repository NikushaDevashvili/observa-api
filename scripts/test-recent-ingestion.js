/**
 * Test if recent events were ingested by checking the last few events
 * 
 * Usage:
 *   node scripts/test-recent-ingestion.js
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

async function checkRecentIngestion() {
  console.log("\n🔍 Checking Recent Event Ingestion");
  console.log("==================================\n");
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Project: ${PROJECT_ID}\n`);

  // Try to get recent events using the Management API which might have different permissions
  console.log("📊 Checking datasource statistics...");
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
      console.log(`✅ Datasource Statistics:`);
      console.log(`   Total Rows: ${stats.row_count || "unknown"}`);
      console.log(`   Total Bytes: ${stats.bytes || "unknown"}`);
      console.log(`   Last Updated: ${data.updated_at || "unknown"}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not get statistics: ${error.message}`);
  }

  // Try to send a test event
  console.log("\n📤 Testing event ingestion...");
  const testEvent = {
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    environment: "prod",
    trace_id: `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    span_id: `span-${Math.random().toString(36).substring(7)}`,
    parent_span_id: null,
    timestamp: new Date().toISOString(),
    event_type: "trace_start",
    conversation_id: `conv-${Math.random().toString(36).substring(7)}`,
    session_id: `session-${Math.random().toString(36).substring(7)}`,
    user_id: `user-${Math.random().toString(36).substring(7)}`,
    attributes_json: JSON.stringify({
      trace_start: {
        name: "Test Event",
      },
    }),
  };

  const ndjson = JSON.stringify(testEvent) + "\n";
  const ingestUrl = `${TINYBIRD_HOST}/v0/events?name=canonical_events&format=ndjson`;

  console.log(`   Sending test event: ${testEvent.trace_id}`);
  console.log(`   URL: ${ingestUrl}`);

  try {
    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
        "Content-Type": "application/x-ndjson",
      },
      body: ndjson,
    });

    const responseText = await response.text();
    console.log(`   Response Status: ${response.status} ${response.statusText}`);
    console.log(`   Response Body: ${responseText}`);

    if (response.ok) {
      try {
        const responseJson = JSON.parse(responseText);
        const ingested = responseJson.ingested || responseJson.successful_inserts || 0;
        console.log(`\n✅ Event sent successfully!`);
        console.log(`   Ingested: ${ingested}`);
        
        if (responseJson.error || responseJson.errors) {
          console.log(`\n⚠️  But there were errors:`);
          console.log(JSON.stringify(responseJson.error || responseJson.errors, null, 2));
        }
      } catch {
        if (responseText.includes("error") || responseText.includes("Error")) {
          console.log(`\n❌ Response indicates error: ${responseText}`);
        } else {
          console.log(`\n✅ Event sent (non-JSON response)`);
        }
      }
    } else {
      console.log(`\n❌ Ingestion failed!`);
      console.log(`   This is why events aren't being stored.`);
    }
  } catch (error) {
    console.log(`\n❌ Error during ingestion:`, error.message);
  }

  console.log("\n💡 Next Steps:");
  console.log("   1. Check Vercel logs for the API to see if events are being forwarded");
  console.log("   2. Check if there are any errors in the Tinybird ingestion response");
  console.log("   3. Verify the TINYBIRD_ADMIN_TOKEN has DATASOURCES:APPEND:canonical_events permission");
}

checkRecentIngestion().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


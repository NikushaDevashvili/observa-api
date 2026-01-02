/**
 * Test script to verify Tinybird ingestion is working
 * 
 * Usage:
 *   node scripts/test-tinybird-ingestion.js
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;
const DATASOURCE_NAME = "canonical_events";

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

// Generate a test event
function generateTestEvent() {
  const now = new Date().toISOString();
  return {
    tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
    project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
    environment: "prod",
    trace_id: `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    span_id: `span-${Math.random().toString(36).substring(7)}`,
    parent_span_id: null,
    timestamp: now,
    event_type: "trace_start",
    conversation_id: `conv-${Math.random().toString(36).substring(7)}`,
    session_id: `session-${Math.random().toString(36).substring(7)}`,
    user_id: `user-${Math.random().toString(36).substring(7)}`,
    attributes_json: JSON.stringify({
      trace_start: {
        name: "Test Trace",
      },
    }),
  };
}

async function testIngestion() {
  console.log("\n🧪 Testing Tinybird Ingestion");
  console.log("==============================\n");
  console.log(`Tinybird Host: ${TINYBIRD_HOST}`);
  console.log(`Datasource: ${DATASOURCE_NAME}`);
  console.log(`Token: ${TINYBIRD_ADMIN_TOKEN.substring(0, 10)}...\n`);

  // Step 1: Check if datasource exists
  console.log("📊 Step 1: Checking if datasource exists...");
  try {
    const datasourceUrl = `${TINYBIRD_HOST}/v0/datasources`;
    const dsResponse = await fetch(datasourceUrl, {
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (dsResponse.ok) {
      const datasources = await dsResponse.json();
      const canonicalEventsDS = datasources.data?.find(
        (ds) => ds.name === DATASOURCE_NAME
      );
      if (canonicalEventsDS) {
        console.log(`✅ Datasource "${DATASOURCE_NAME}" exists`);
        console.log(`   Rows: ${canonicalEventsDS.rows || "unknown"}`);
        console.log(`   Size: ${canonicalEventsDS.size || "unknown"}`);
      } else {
        console.log(`❌ Datasource "${DATASOURCE_NAME}" NOT FOUND`);
        console.log(
          "   Available datasources:",
          datasources.data?.map((ds) => ds.name).join(", ") || "none"
        );
        console.log("\n⚠️  This is the problem! The datasource doesn't exist.");
        return;
      }
    } else {
      const errorText = await dsResponse.text();
      console.log(`❌ Could not check datasources: ${dsResponse.status}`);
      console.log(`   Error: ${errorText}`);
      return;
    }
  } catch (error) {
    console.log(`❌ Error checking datasources:`, error.message);
    return;
  }

  // Step 2: Try to ingest a test event
  console.log("\n📤 Step 2: Attempting to ingest a test event...");
  const testEvent = generateTestEvent();
  const ndjson = JSON.stringify(testEvent) + "\n";

  const ingestUrl = `${TINYBIRD_HOST}/v0/events?name=${encodeURIComponent(
    DATASOURCE_NAME
  )}&format=ndjson`;

  console.log(`   URL: ${ingestUrl}`);
  console.log(`   Event: ${JSON.stringify(testEvent, null, 2)}`);

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

    console.log(`\n   Response Status: ${response.status} ${response.statusText}`);
    console.log(`   Response Body: ${responseText}`);

    if (!response.ok) {
      console.log(`\n❌ Ingestion failed!`);
      console.log(`   This is why events aren't being stored.`);
      return;
    }

    // Try to parse response
    try {
      const responseJson = JSON.parse(responseText);
      console.log(`\n   Parsed Response:`, JSON.stringify(responseJson, null, 2));

      if (responseJson.error || responseJson.errors) {
        console.log(`\n❌ Tinybird returned an error in the response body!`);
        console.log(`   Error: ${responseJson.error || JSON.stringify(responseJson.errors)}`);
        return;
      }

      const ingested = responseJson.ingested || responseJson.successful_inserts || 0;
      console.log(`\n✅ Event ingested successfully!`);
      console.log(`   Ingested count: ${ingested}`);
    } catch (parseError) {
      if (responseText.includes("error") || responseText.includes("Error")) {
        console.log(`\n❌ Response indicates an error: ${responseText}`);
        return;
      }
      console.log(`\n✅ Event ingested (non-JSON response)`);
    }

    // Step 3: Verify the event was stored
    console.log("\n🔍 Step 3: Verifying event was stored...");
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

    const queryUrl = `${TINYBIRD_HOST}/v0/sql`;
    const query = `SELECT * FROM ${DATASOURCE_NAME} WHERE trace_id = '${testEvent.trace_id}' LIMIT 1`;

    const queryResponse = await fetch(queryUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}`,
    });

    if (queryResponse.ok) {
      const queryText = await queryResponse.text();
      if (queryText.includes(testEvent.trace_id)) {
        console.log(`✅ Event found in datasource!`);
      } else {
        console.log(`⚠️  Event not found yet (may need more time to propagate)`);
        console.log(`   Query result: ${queryText.substring(0, 200)}`);
      }
    } else {
      console.log(`⚠️  Could not verify (query failed): ${queryResponse.status}`);
    }
  } catch (error) {
    console.log(`\n❌ Error during ingestion:`, error.message);
    console.log(`   Stack:`, error.stack);
  }
}

testIngestion().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


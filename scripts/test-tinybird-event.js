/**
 * Test Tinybird Event Ingestion
 * 
 * Sends a single test event to Tinybird and captures the exact error response
 * 
 * Usage:
 *   node scripts/test-tinybird-event.js
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

// Test event with all possible fields (including nulls)
const testEvent = {
  tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  environment: "prod",
  trace_id: "123e4567-e89b-12d3-a456-426614174000",
  span_id: "123e4567-e89b-12d3-a456-426614174001",
  parent_span_id: null, // This might be the issue
  timestamp: new Date().toISOString(),
  event_type: "llm_call",
  conversation_id: null,
  session_id: null,
  user_id: null,
  agent_name: null,
  version: null,
  route: null,
  attributes_json: JSON.stringify({
    llm_call: {
      model: "gpt-4",
      input_tokens: 100,
      output_tokens: 200,
      total_tokens: 300,
      latency_ms: 1500,
      cost: 0.03,
    }
  })
};

// Test event with nulls omitted
const testEventNoNulls = {
  tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  environment: "prod",
  trace_id: "123e4567-e89b-12d3-a456-426614174002",
  span_id: "123e4567-e89b-12d3-a456-426614174003",
  timestamp: new Date().toISOString(),
  event_type: "llm_call",
  attributes_json: JSON.stringify({
    llm_call: {
      model: "gpt-4",
      input_tokens: 100,
      output_tokens: 200,
      total_tokens: 300,
      latency_ms: 1500,
      cost: 0.03,
    }
  })
};

async function testEventIngestion() {
  console.log("🧪 Testing Tinybird event ingestion...\n");

  const url = `${TINYBIRD_HOST}/v0/events?name=${encodeURIComponent("canonical_events")}&format=ndjson`;

  // Test 1: Event with nulls omitted
  console.log("📋 Test 1: Event with nulls omitted");
  console.log(JSON.stringify(testEventNoNulls, null, 2));
  console.log("\n");

  try {
    const response1 = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
        "Content-Type": "application/x-ndjson",
      },
      body: JSON.stringify(testEventNoNulls) + "\n",
    });

    console.log(`Response Status: ${response1.status} ${response1.statusText}`);
    const responseText1 = await response1.text();
    console.log(`Response Body: ${responseText1}\n`);

    if (!response1.ok) {
      console.error("❌ Test 1 FAILED");
      try {
        const errorJson = JSON.parse(responseText1);
        console.error("Error details:", JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error("Error text:", responseText1);
      }
    } else {
      console.log("✅ Test 1 PASSED - Event ingested successfully");
    }
  } catch (error) {
    console.error("❌ Test 1 ERROR:", error.message);
  }

  console.log("\n" + "=".repeat(80) + "\n");

  // Test 2: Event with explicit nulls
  console.log("📋 Test 2: Event with explicit nulls");
  console.log(JSON.stringify(testEvent, null, 2));
  console.log("\n");

  try {
    const response2 = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
        "Content-Type": "application/x-ndjson",
      },
      body: JSON.stringify(testEvent) + "\n",
    });

    console.log(`Response Status: ${response2.status} ${response2.statusText}`);
    const responseText2 = await response2.text();
    console.log(`Response Body: ${responseText2}\n`);

    if (!response2.ok) {
      console.error("❌ Test 2 FAILED");
      try {
        const errorJson = JSON.parse(responseText2);
        console.error("Error details:", JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error("Error text:", responseText2);
      }
    } else {
      console.log("✅ Test 2 PASSED - Event ingested successfully");
    }
  } catch (error) {
    console.error("❌ Test 2 ERROR:", error.message);
  }

  // Also try to query a successfully ingested event to see its format
  console.log("\n" + "=".repeat(80) + "\n");
  console.log("📋 Querying successfully ingested events to see format...\n");

  const querySql = `
    SELECT *
    FROM canonical_events
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const queryUrl = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(querySql)}`;

  try {
    const queryResponse = await fetch(queryUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (queryResponse.ok) {
      const queryData = await queryResponse.json();
      const rows = Array.isArray(queryData) ? queryData : (queryData.data || []);
      
      if (rows.length > 0) {
        console.log("✅ Sample successfully ingested event:");
        console.log(JSON.stringify(rows[0], null, 2));
      } else {
        console.log("ℹ️  No events found in canonical_events");
      }
    } else {
      const errorText = await queryResponse.text();
      console.log(`⚠️  Could not query events: ${queryResponse.status} - ${errorText.substring(0, 200)}`);
    }
  } catch (error) {
    console.error("❌ Query error:", error.message);
  }
}

testEventIngestion();


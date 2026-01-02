/**
 * Test the fixed event format
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

const url = `${TINYBIRD_HOST}/v0/events?name=${encodeURIComponent("canonical_events")}&format=ndjson`;

// Test event matching the actual Tinybird schema
const testEvent = {
  tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  environment: "prod",
  trace_id: "123e4567-e89b-12d3-a456-426614174000",
  span_id: "123e4567-e89b-12d3-a456-426614174001",
  timestamp: new Date().toISOString(),
  event_type: "llm_call",
  conversation_id: "", // Required field - empty string if not provided
  session_id: "", // Required field - empty string if not provided
  user_id: "", // Required field - empty string if not provided
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

console.log("🧪 Testing fixed event format...\n");
console.log(JSON.stringify(testEvent, null, 2));
console.log("\n");

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      "Content-Type": "application/x-ndjson",
    },
    body: JSON.stringify(testEvent) + "\n",
  });

  const responseText = await response.text();
  console.log(`Status: ${response.status} ${response.statusText}`);
  console.log(`Response: ${responseText}`);

  if (response.ok) {
    const result = JSON.parse(responseText);
    if (result.successful_rows > 0) {
      console.log(`\n✅ SUCCESS! ${result.successful_rows} row(s) ingested successfully!`);
      console.log("🎉 The fix works!");
    } else if (result.quarantined_rows > 0) {
      console.log(`\n❌ Still quarantined: ${result.quarantined_rows} row(s)`);
    }
  }
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
}



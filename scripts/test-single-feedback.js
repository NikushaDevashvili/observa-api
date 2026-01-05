/**
 * Test script to send a single feedback event and verify it reaches Tinybird
 */

import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const API_URL = process.env.API_URL || "https://observa-api.vercel.app";
const JWT_TOKEN =
  process.env.JWT_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZW5hbnRJZCI6IjRmNjJkMmE1LTZhMzQtNGQ1My1hMzAxLWMwYzY2MWIwYzRkNiIsInByb2plY3RJZCI6IjdhY2E5MmZlLWFkMjctNDFjMi1iYzBiLTk2ZTk0ZGQyZDE2NSIsImVudmlyb25tZW50IjoicHJvZCIsImlhdCI6MTc2NzYzOTgyMywiZXhwIjoxNzc1NDE1ODIzfQ.-9e6srUY-EkfIU-6_UUxDF6psVN0wfoPPyk2Z-RPnwE";

const tenantId = "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6";
const projectId = "7aca92fe-ad27-41c2-bc0b-96e94dd2d165";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Create a test feedback event with explicit like type
const feedbackEvent = {
  tenant_id: tenantId,
  project_id: projectId,
  environment: "prod",
  trace_id: generateUUID(),
  span_id: generateUUID(),
  parent_span_id: null,
  timestamp: new Date().toISOString(),
  event_type: "feedback",
  conversation_id: generateUUID(),
  session_id: generateUUID(),
  user_id: generateUUID(),
  agent_name: "test-agent",
  version: "1.0.0",
  route: "/test",
  attributes: {
    feedback: {
      type: "like",
      outcome: "success",
      comment: "Test feedback from script",
    },
  },
};

console.log("📤 Sending test feedback event...");
console.log("Event:", JSON.stringify(feedbackEvent, null, 2));

// First, create an API key
const createKeyResponse = await fetch(`${API_URL}/api/v1/api-keys`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${JWT_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "test-feedback-key-" + Date.now(),
    permissions: ["ingest"],
  }),
});

if (!createKeyResponse.ok) {
  const errorText = await createKeyResponse.text();
  console.error("❌ Failed to create API key:", errorText);
  process.exit(1);
}

const keyData = await createKeyResponse.json();
const apiKey = keyData.api_key;

console.log("✅ API key created:", apiKey.substring(0, 20) + "...");

// Send the feedback event
console.log("\n📤 Sending feedback event to API...");
const ingestResponse = await fetch(`${API_URL}/api/v1/events/ingest`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify([feedbackEvent]),
});

if (!ingestResponse.ok) {
  const errorText = await ingestResponse.text();
  console.error("❌ Failed to ingest event:", errorText);
  process.exit(1);
}

const result = await ingestResponse.json();
console.log("✅ Event ingested successfully:", result);

console.log("\n🔍 Check Tinybird for this event:");
console.log(`   event_type = 'feedback'`);
console.log(`   trace_id = '${feedbackEvent.trace_id}'`);
console.log(`   timestamp >= '${feedbackEvent.timestamp}'`);
console.log("\n   attributes_json should contain:");
console.log(
  `   {"feedback":{"type":"like","outcome":"success","comment":"Test feedback from script"}}`
);

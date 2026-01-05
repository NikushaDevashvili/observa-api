/**
 * Test script to send a single feedback event and verify attributes_json
 */

import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const API_URL = process.env.API_URL || "https://observa-api.vercel.app";
const JWT_TOKEN = process.env.JWT_TOKEN;

if (!JWT_TOKEN) {
  console.error("❌ JWT_TOKEN is required");
  process.exit(1);
}

const tenantId = "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6";
const projectId = "7aca92fe-ad27-41c2-bc0b-96e94dd2d165";

// Create a test feedback event
const feedbackEvent = {
  tenant_id: tenantId,
  project_id: projectId,
  environment: "prod",
  trace_id: "test-trace-" + Date.now(),
  span_id: "test-span-" + Date.now(),
  parent_span_id: null,
  timestamp: new Date().toISOString(),
  event_type: "feedback",
  conversation_id: "test-conversation",
  session_id: "test-session",
  user_id: "test-user",
  agent_name: "test-agent",
  version: "1.0.0",
  route: "/test",
  attributes: {
    feedback: {
      type: "like",
      outcome: "success",
      comment: "Great response!",
    },
  },
};

console.log("📤 Sending test feedback event...");
console.log("Event attributes:", JSON.stringify(feedbackEvent.attributes, null, 2));

// First, create an API key
const createKeyResponse = await fetch(`${API_URL}/api/v1/api-keys`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${JWT_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "test-feedback-key",
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

console.log("\n🔍 Check Vercel logs for debug output showing:");
console.log("   - Original attributes");
console.log("   - Cleaned attributes");
console.log("   - Final attributes_json string");


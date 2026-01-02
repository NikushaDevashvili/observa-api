/**
 * Inspect Event Format
 * 
 * Generates a sample event and shows exactly what we're sending to Tinybird
 * 
 * Usage:
 *   node scripts/inspect-event-format.js
 */

import dotenv from "dotenv";
dotenv.config();

// Simulate what we're sending
const sampleEvent = {
  tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  environment: "prod",
  trace_id: "123e4567-e89b-12d3-a456-426614174000",
  span_id: "123e4567-e89b-12d3-a456-426614174001",
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
      input: "Hello",
      output: "Hi there!",
    }
  })
};

// Test with null values
const sampleEventWithNulls = {
  tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  environment: "prod",
  trace_id: "123e4567-e89b-12d3-a456-426614174000",
  span_id: "123e4567-e89b-12d3-a456-426614174001",
  parent_span_id: null,
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
      input: "Hello",
      output: "Hi there!",
    }
  })
};

// Import our formatter
import { formatTinybirdEvent, cleanNullValues } from "../src/utils/tinybirdEventFormatter.js";

console.log("📋 Sample Event (BEFORE formatting):\n");
console.log(JSON.stringify(sampleEventWithNulls, null, 2));

console.log("\n\n📋 Sample Event (AFTER formatting - nulls omitted):\n");
const formatted = formatTinybirdEvent(sampleEventWithNulls);
console.log(JSON.stringify(formatted, null, 2));

console.log("\n\n📋 Attributes JSON (BEFORE cleaning nulls):\n");
const attrsBefore = JSON.parse(sampleEventWithNulls.attributes_json);
console.log(JSON.stringify(attrsBefore, null, 2));

console.log("\n\n📋 Attributes JSON (AFTER cleaning nulls):\n");
const attrsAfter = cleanNullValues(attrsBefore);
console.log(JSON.stringify(attrsAfter, null, 2));

console.log("\n\n📋 Final NDJSON format (what gets sent to Tinybird):\n");
console.log(JSON.stringify(formatted));


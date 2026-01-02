/**
 * Check Quarantine Schema Issues
 * 
 * This script helps debug schema mismatches by showing what we're sending
 * vs what Tinybird might expect
 */

// Sample event from our code (what we're sending)
const sampleEvent = {
  tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
  project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  environment: "prod",
  trace_id: "uuid-here",
  span_id: "uuid-here",
  parent_span_id: null,
  timestamp: "2026-01-02T01:13:41.000Z",
  event_type: "tool_call",
  conversation_id: null,
  session_id: null,
  user_id: null,
  agent_name: null,
  version: null,
  route: null,
  attributes_json: JSON.stringify({
    tool_call: {
      tool_name: "get_order_status",
      args: { query: "test" },
      result_status: "error",
      latency_ms: 500,
      error_message: "Database connection failed"
    }
  })
};

console.log("Sample event we're sending:");
console.log(JSON.stringify(sampleEvent, null, 2));

console.log("\n--- Common Quarantine Issues ---");
console.log("1. Check if event_type values match: 'tool_call' vs 'call'");
console.log("2. Check if nullable fields need to be omitted (not null)");
console.log("3. Check timestamp format (ISO 8601 vs DateTime)");
console.log("4. Check if attributes_json is a valid JSON string");
console.log("\n--- Next Steps ---");
console.log("1. Click a quarantined row in Tinybird to see full error");
console.log("2. Check Tinybird datasource schema (Schema tab)");
console.log("3. Compare field types: String vs Nullable(String), etc.");
console.log("4. Check if event_type enum values match");


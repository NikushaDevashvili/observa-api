/**
 * Test Tinybird Event Ingestion - Version 2
 * 
 * Tests different field combinations to identify the exact schema issue
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

async function testEvent(event, testName) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🧪 ${testName}`);
  console.log("=".repeat(80));
  console.log(JSON.stringify(event, null, 2));
  console.log("\n");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
        "Content-Type": "application/x-ndjson",
      },
      body: JSON.stringify(event) + "\n",
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Response: ${responseText}`);

    if (response.ok) {
      try {
        const result = JSON.parse(responseText);
        if (result.successful_rows > 0) {
          console.log(`✅ SUCCESS - ${result.successful_rows} rows ingested`);
          return true;
        } else if (result.quarantined_rows > 0) {
          console.log(`❌ QUARANTINED - ${result.quarantined_rows} rows quarantined`);
          return false;
        }
      } catch (e) {
        console.log(`⚠️  Response: ${responseText}`);
      }
    } else {
      console.log(`❌ ERROR: ${responseText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Exception: ${error.message}`);
    return false;
  }
}

async function runTests() {
  const baseTime = new Date().toISOString();
  let traceCounter = 0;

  // Test 1: Minimal event (only required fields)
  const test1 = {
    tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
    project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
    environment: "prod",
    trace_id: `test-${++traceCounter}`,
    span_id: `span-${traceCounter}`,
    timestamp: baseTime,
    event_type: "llm_call",
    attributes_json: "{}",
  };
  await testEvent(test1, "Test 1: Minimal event (no nullable fields)");

  // Test 2: With parent_span_id as string (not null)
  const test2 = {
    tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
    project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
    environment: "prod",
    trace_id: `test-${++traceCounter}`,
    span_id: `span-${traceCounter}`,
    parent_span_id: "parent-span-1",
    timestamp: baseTime,
    event_type: "llm_call",
    attributes_json: "{}",
  };
  await testEvent(test2, "Test 2: With parent_span_id as string");

  // Test 3: All fields with nulls
  const test3 = {
    tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
    project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
    environment: "prod",
    trace_id: `test-${++traceCounter}`,
    span_id: `span-${traceCounter}`,
    parent_span_id: null,
    timestamp: baseTime,
    event_type: "llm_call",
    conversation_id: null,
    session_id: null,
    user_id: null,
    agent_name: null,
    version: null,
    route: null,
    attributes_json: "{}",
  };
  await testEvent(test3, "Test 3: All fields with explicit nulls");

  // Test 4: Try different event_type
  const test4 = {
    tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
    project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
    environment: "prod",
    trace_id: `test-${++traceCounter}`,
    span_id: `span-${traceCounter}`,
    timestamp: baseTime,
    event_type: "trace_start",
    attributes_json: "{}",
  };
  await testEvent(test4, "Test 4: Different event_type (trace_start)");

  // Test 5: Try with proper attributes
  const test5 = {
    tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
    project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
    environment: "prod",
    trace_id: `test-${++traceCounter}`,
    span_id: `span-${traceCounter}`,
    timestamp: baseTime,
    event_type: "trace_start",
    attributes_json: JSON.stringify({
      trace_start: {
        name: "test_trace",
      }
    }),
  };
  await testEvent(test5, "Test 5: trace_start with proper attributes");

  console.log("\n" + "=".repeat(80));
  console.log("📊 Summary: Check which test(s) succeeded to identify the issue");
  console.log("=".repeat(80));
}

runTests();


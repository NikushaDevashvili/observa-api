/**
 * Test script to query Tinybird directly and verify canonical events
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

const traceId = process.argv[2];
const tenantId = process.argv[3] || "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6";
const projectId = process.argv[4] || "7aca92fe-ad27-41c2-bc0b-96e94dd2d165";

if (!traceId) {
  console.error("Usage: node scripts/test-tinybird-query.js <traceId> [tenantId] [projectId]");
  process.exit(1);
}

async function testQuery() {
  console.log(`\n🔍 Testing Tinybird query for trace: ${traceId}`);
  console.log(`   Tenant: ${tenantId}`);
  console.log(`   Project: ${projectId}\n`);

  // Test 1: Check if datasource exists
  console.log("📊 Test 1: Checking if canonical_events datasource exists...");
  try {
    const datasourceUrl = `${TINYBIRD_HOST}/v0/datasources`;
    const dsResponse = await fetch(datasourceUrl, {
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });
    
    if (dsResponse.ok) {
      const datasources = await dsResponse.json();
      const canonicalEventsDS = datasources.data?.find((ds: any) => ds.name === "canonical_events");
      if (canonicalEventsDS) {
        console.log("✅ canonical_events datasource exists");
        console.log(`   Rows: ${canonicalEventsDS.rows || 'unknown'}`);
      } else {
        console.log("❌ canonical_events datasource NOT FOUND");
        console.log("   Available datasources:", datasources.data?.map((ds: any) => ds.name).join(", ") || "none");
      }
    } else {
      console.log(`⚠️  Could not check datasources: ${dsResponse.status}`);
    }
  } catch (error) {
    console.log(`⚠️  Error checking datasources:`, error.message);
  }

  // Test 2: Query for events
  console.log("\n📊 Test 2: Querying for trace events...");
  const sql = `
    SELECT 
      tenant_id,
      project_id,
      environment,
      trace_id,
      span_id,
      parent_span_id,
      timestamp,
      event_type,
      conversation_id,
      session_id,
      user_id,
      agent_name,
      version,
      route,
      attributes_json
    FROM canonical_events
    WHERE tenant_id = {tenant_id:String}
      AND trace_id = {trace_id:String}
      ${projectId ? "AND project_id = {project_id:String}" : ""}
    ORDER BY timestamp ASC
    LIMIT 100
  `;

  const params = new URLSearchParams();
  params.append("q", sql);
  params.append("tenant_id", tenantId);
  params.append("trace_id", traceId);
  if (projectId) {
    params.append("project_id", projectId);
  }

  const url = `${TINYBIRD_HOST}/v0/sql?${params.toString()}`;
  console.log(`   URL: ${url.replace(TINYBIRD_ADMIN_TOKEN, "***")}`);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Query failed: ${errorText}`);
      return;
    }

    const result = await response.json();
    console.log(`   Response type: ${typeof result}`);
    console.log(`   Response keys: ${Object.keys(result).join(", ")}`);

    let events = [];
    if (Array.isArray(result)) {
      events = result;
      console.log(`✅ Found ${events.length} events (array format)`);
    } else if (result?.data && Array.isArray(result.data)) {
      events = result.data;
      console.log(`✅ Found ${events.length} events (object.data format)`);
    } else {
      console.log(`⚠️  Unexpected response format:`, JSON.stringify(result, null, 2).substring(0, 500));
    }

    if (events.length > 0) {
      console.log("\n📋 Event Summary:");
      const eventTypes = {};
      events.forEach((event: any) => {
        const type = event.event_type || "unknown";
        eventTypes[type] = (eventTypes[type] || 0) + 1;
      });
      Object.entries(eventTypes).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });

      console.log("\n📝 First event sample:");
      console.log(JSON.stringify(events[0], null, 2).substring(0, 1000));
    } else {
      console.log("\n⚠️  No events found for this trace");
      console.log("   This could mean:");
      console.log("   1. Events haven't been sent yet");
      console.log("   2. Events are in a different datasource");
      console.log("   3. There's a delay in Tinybird processing");
    }
  } catch (error) {
    console.error(`❌ Query error:`, error);
  }
}

testQuery().catch(console.error);


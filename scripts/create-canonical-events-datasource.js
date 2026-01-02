/**
 * Create the canonical_events datasource in Tinybird
 * 
 * Usage:
 *   node scripts/create-canonical-events-datasource.js
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

// ClickHouse schema for canonical_events
// Based on the TypeScript interface and what we're sending
const DATASOURCE_SCHEMA = `
tenant_id String,
project_id String,
environment String,
trace_id String,
span_id String,
parent_span_id Nullable(String),
timestamp DateTime64(3),
event_type String,
conversation_id String,
session_id String,
user_id String,
attributes_json String
`;

async function createDatasource() {
  console.log("\n🔧 Creating canonical_events Datasource in Tinybird");
  console.log("==================================================\n");
  console.log(`Tinybird Host: ${TINYBIRD_HOST}`);
  console.log(`Datasource Name: ${DATASOURCE_NAME}\n`);

  // Step 1: Check if datasource already exists
  console.log("📊 Step 1: Checking if datasource already exists...");
  try {
    const datasourceUrl = `${TINYBIRD_HOST}/v0/datasources`;
    const dsResponse = await fetch(datasourceUrl, {
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (dsResponse.ok) {
      const datasources = await dsResponse.json();
      const existingDS = datasources.data?.find(
        (ds) => ds.name === DATASOURCE_NAME
      );
      if (existingDS) {
        console.log(`✅ Datasource "${DATASOURCE_NAME}" already exists!`);
        console.log(`   Rows: ${existingDS.rows || "unknown"}`);
        console.log(`   Size: ${existingDS.size || "unknown"}`);
        console.log("\n💡 No need to create it. The issue might be elsewhere.");
        return;
      }
    }
    console.log(`   Datasource doesn't exist, will create it.\n`);
  } catch (error) {
    console.log(`   Could not check (will try to create anyway): ${error.message}\n`);
  }

  // Step 2: Create the datasource
  console.log("📤 Step 2: Creating datasource...");
  
  // Tinybird API for creating datasource
  // POST /v0/datasources with SQL CREATE TABLE statement
  const createUrl = `${TINYBIRD_HOST}/v0/datasources`;
  
  // Create the SQL statement
  const sql = `CREATE TABLE ${DATASOURCE_NAME}
(
    tenant_id String,
    project_id String,
    environment String,
    trace_id String,
    span_id String,
    parent_span_id Nullable(String),
    timestamp DateTime64(3),
    event_type String,
    conversation_id String,
    session_id String,
    user_id String,
    attributes_json String
)
ENGINE = MergeTree()
ORDER BY (tenant_id, project_id, trace_id, timestamp)
PARTITION BY toYYYYMM(timestamp);`;

  console.log(`   SQL:\n${sql}\n`);

  try {
    const response = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `sql=${encodeURIComponent(sql)}`,
    });

    const responseText = await response.text();
    console.log(`   Response Status: ${response.status} ${response.statusText}`);
    console.log(`   Response Body: ${responseText}\n`);

    if (!response.ok) {
      // Try parsing as JSON for better error message
      try {
        const errorJson = JSON.parse(responseText);
        console.log(`❌ Failed to create datasource!`);
        console.log(`   Error: ${JSON.stringify(errorJson, null, 2)}`);
      } catch {
        console.log(`❌ Failed to create datasource!`);
        console.log(`   Error: ${responseText}`);
      }
      return;
    }

    // Try to parse response
    try {
      const responseJson = JSON.parse(responseText);
      console.log(`✅ Datasource created successfully!`);
      console.log(`   Response: ${JSON.stringify(responseJson, null, 2)}`);
    } catch {
      if (responseText.includes("error") || responseText.includes("Error")) {
        console.log(`❌ Response indicates an error: ${responseText}`);
        return;
      }
      console.log(`✅ Datasource created (response: ${responseText.substring(0, 200)})`);
    }

    // Step 3: Verify it was created
    console.log("\n🔍 Step 3: Verifying datasource was created...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const verifyUrl = `${TINYBIRD_HOST}/v0/datasources`;
    const verifyResponse = await fetch(verifyUrl, {
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (verifyResponse.ok) {
      const datasources = await verifyResponse.json();
      const newDS = datasources.data?.find((ds) => ds.name === DATASOURCE_NAME);
      if (newDS) {
        console.log(`✅ Datasource verified!`);
        console.log(`   Name: ${newDS.name}`);
        console.log(`   Rows: ${newDS.rows || 0}`);
      } else {
        console.log(`⚠️  Datasource not found in list (may need more time)`);
      }
    } else {
      console.log(`⚠️  Could not verify: ${verifyResponse.status}`);
    }

    console.log("\n✨ Done! You can now send events to Tinybird.");
    console.log(`   Test with: node scripts/test-tinybird-ingestion.js`);

  } catch (error) {
    console.log(`\n❌ Error creating datasource:`, error.message);
    console.log(`   Stack:`, error.stack);
  }
}

createDatasource().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


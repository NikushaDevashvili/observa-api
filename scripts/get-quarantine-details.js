/**
 * Get Quarantine Error Details from Tinybird API
 * 
 * Tries to query the quarantine table to get detailed error messages
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

async function getQuarantineDetails() {
  console.log("🔍 Attempting to get quarantine error details...\n");

  // Try different possible quarantine table names and query formats
  const queries = [
    // Try to describe the datasource to see its structure
    {
      name: "Describe canonical_events datasource",
      sql: "DESCRIBE TABLE canonical_events",
    },
    // Try to query quarantine table (various possible names)
    {
      name: "Query _quarantine_canonical_events",
      sql: "SELECT * FROM _quarantine_canonical_events ORDER BY timestamp DESC LIMIT 1",
    },
    {
      name: "Query canonical_events_quarantine",
      sql: "SELECT * FROM canonical_events_quarantine ORDER BY timestamp DESC LIMIT 1",
    },
    // Try to get datasource info
    {
      name: "Get datasource info",
      sql: "SHOW DATASOURCES LIKE 'canonical_events%'",
    },
  ];

  for (const query of queries) {
    console.log(`\n📋 ${query.name}`);
    console.log(`SQL: ${query.sql}`);
    
    const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(query.sql)}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const rows = Array.isArray(data) ? data : (data.data || []);
        
        if (rows.length > 0) {
          console.log(`✅ Found ${rows.length} row(s):`);
          console.log(JSON.stringify(rows[0], null, 2));
          
          // If this is a quarantine row, look for error fields
          if (rows[0].error || rows[0].error_message || rows[0].reason) {
            console.log("\n🔴 ERROR DETAILS FOUND:");
            console.log(`Error: ${rows[0].error || rows[0].error_message || rows[0].reason}`);
          }
        } else {
          console.log("ℹ️  No rows returned");
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ Error ${response.status}: ${errorText.substring(0, 300)}`);
      }
    } catch (error) {
      console.log(`❌ Exception: ${error.message}`);
    }
  }

  // Also try the Tinybird Management API to get datasource schema
  console.log("\n\n📋 Trying to get datasource schema via Management API...");
  const datasourceUrl = `${TINYBIRD_HOST}/v0/datasources/canonical_events`;
  
  try {
    const response = await fetch(datasourceUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (response.ok) {
      const schema = await response.json();
      console.log("✅ Datasource schema:");
      console.log(JSON.stringify(schema, null, 2));
    } else {
      const errorText = await response.text();
      console.log(`❌ Error ${response.status}: ${errorText.substring(0, 300)}`);
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
  }
}

getQuarantineDetails();


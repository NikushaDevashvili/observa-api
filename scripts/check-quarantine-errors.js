/**
 * Check Tinybird Quarantine Errors
 * 
 * Queries the Tinybird quarantine table to see detailed error messages
 * 
 * Usage:
 *   node scripts/check-quarantine-errors.js
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

async function checkQuarantineErrors() {
  try {
    console.log("🔍 Querying Tinybird quarantine table...\n");

    // Query the quarantine table for recent errors
    // Note: The exact table name might be different - common names:
    // - canonical_events_quarantine
    // - canonical_events_quarantine_errors
    // - _quarantine_canonical_events
    
    const possibleTableNames = [
      "canonical_events_quarantine",
      "_quarantine_canonical_events",
      "canonical_events_quarantine_errors"
    ];

    for (const tableName of possibleTableNames) {
      console.log(`\n📋 Trying table: ${tableName}`);
      
      const sql = `
        SELECT 
          *
        FROM ${tableName}
        ORDER BY timestamp DESC
        LIMIT 5
      `;

      const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}`;

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
            console.log(`✅ Found ${rows.length} quarantined rows in ${tableName}\n`);
            
            rows.forEach((row, index) => {
              console.log(`\n--- Row ${index + 1} ---`);
              console.log(JSON.stringify(row, null, 2));
            });
            
            return; // Found the table, exit
          } else {
            console.log(`   No rows found in ${tableName}`);
          }
        } else {
          const errorText = await response.text();
          console.log(`   Error: ${response.status} - ${errorText.substring(0, 200)}`);
        }
      } catch (error) {
        console.log(`   Error querying ${tableName}: ${error.message}`);
      }
    }

    // If we didn't find the quarantine table, try to list all datasources
    console.log("\n\n📋 Listing all datasources to find quarantine table...");
    const datasourcesUrl = `${TINYBIRD_HOST}/v0/datasources`;
    
    const response = await fetch(datasourcesUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (response.ok) {
      const datasources = await response.json();
      const dsList = Array.isArray(datasources) ? datasources : (datasources.data || []);
      
      console.log("\nAvailable datasources:");
      dsList.forEach((ds) => {
        if (ds.name && ds.name.toLowerCase().includes("quarantine")) {
          console.log(`  🔴 ${ds.name} (quarantine table)`);
        } else {
          console.log(`  ✅ ${ds.name || ds.id}`);
        }
      });
    }

    // Also try to query the main canonical_events table to see its schema
    console.log("\n\n📋 Checking canonical_events schema...");
    const schemaSql = `DESCRIBE TABLE canonical_events`;
    const schemaUrl = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(schemaSql)}`;
    
    const schemaResponse = await fetch(schemaUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (schemaResponse.ok) {
      const schema = await schemaResponse.json();
      const schemaData = Array.isArray(schema) ? schema : (schema.data || []);
      
      console.log("\ncanonical_events schema:");
      schemaData.forEach((col) => {
        console.log(`  ${col.name || col.field}: ${col.type || col.data_type} ${col.nullable ? '(Nullable)' : '(Required)'}`);
      });
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  }
}

checkQuarantineErrors();



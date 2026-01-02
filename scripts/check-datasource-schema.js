/**
 * Check the schema of canonical_events datasource
 * 
 * Usage:
 *   node scripts/check-datasource-schema.js
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

async function checkSchema() {
  console.log("\n🔍 Checking canonical_events Datasource Schema");
  console.log("==============================================\n");

  // Method 1: Try DESCRIBE TABLE
  console.log("📋 Method 1: DESCRIBE TABLE");
  const describeSQL = `DESCRIBE TABLE canonical_events`;
  const describeUrl = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(describeSQL)}`;
  
  try {
    const response = await fetch(describeUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const rows = Array.isArray(data) ? data : (data.data || []);
      
      if (rows.length > 0) {
        console.log("✅ Schema found:\n");
        rows.forEach((col) => {
          const name = col.name || col.field || col.column || "unknown";
          const type = col.type || col.data_type || col.type_name || "unknown";
          const nullable = col.nullable !== undefined ? col.nullable : (type.includes("Nullable") || type.includes("null"));
          console.log(`  ${name}: ${type} ${nullable ? "(Nullable)" : "(Required)"}`);
        });
      } else {
        console.log("❌ No schema data returned");
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Error ${response.status}: ${errorText.substring(0, 300)}`);
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
  }

  // Method 2: Try Management API
  console.log("\n\n📋 Method 2: Management API");
  const datasourceUrl = `${TINYBIRD_HOST}/v0/datasources/canonical_events`;
  
  try {
    const response = await fetch(datasourceUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log("✅ Datasource info:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.log(`❌ Error ${response.status}: ${errorText.substring(0, 300)}`);
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
  }

  // Method 3: Try to get a sample row to see actual structure
  console.log("\n\n📋 Method 3: Sample Data (to infer schema)");
  const sampleSQL = `SELECT * FROM canonical_events LIMIT 1`;
  const sampleUrl = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sampleSQL)}`;
  
  try {
    const response = await fetch(sampleUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const rows = Array.isArray(data) ? data : (data.data || []);
      
      if (rows.length > 0) {
        console.log("✅ Sample row found:");
        console.log(JSON.stringify(rows[0], null, 2));
      } else {
        console.log("ℹ️  No rows in datasource (empty)");
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Error ${response.status}: ${errorText.substring(0, 300)}`);
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
  }

  // Method 4: Check row count
  console.log("\n\n📋 Method 4: Row Count");
  const countSQL = `SELECT count() as total FROM canonical_events`;
  const countUrl = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(countSQL)}`;
  
  try {
    const response = await fetch(countUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const rows = Array.isArray(data) ? data : (data.data || []);
      
      if (rows.length > 0) {
        const count = rows[0].total || rows[0].count || rows[0][0] || "unknown";
        console.log(`✅ Total rows in canonical_events: ${count}`);
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Error ${response.status}: ${errorText.substring(0, 300)}`);
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
  }
}

checkSchema().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


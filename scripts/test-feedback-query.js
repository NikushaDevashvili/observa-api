/**
 * Test script to query feedback events from Tinybird and inspect their structure
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

const tenantId = process.argv[2] || '4f62d2a5-6a34-4d53-a301-c0c661b0c4d6';
const projectId = process.argv[3] || '7aca92fe-ad27-41c2-bc0b-96e94dd2d165';

async function testFeedbackQuery() {
  try {
    console.log('🔍 Querying feedback events from Tinybird...\n');
    console.log(`   Tenant: ${tenantId}`);
    console.log(`   Project: ${projectId}\n`);
    
    const sql = `
      SELECT 
        attributes_json,
        event_type,
        timestamp
      FROM canonical_events
      WHERE tenant_id = '${tenantId}' 
        AND event_type = 'feedback'
      LIMIT 5
    `;
    
    const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tinybird query failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();
    
    let result;
    if (contentType.includes("application/json") || responseText.trim().startsWith("{")) {
      result = JSON.parse(responseText);
    } else {
      // Parse TSV
      const lines = responseText.trim().split("\n").filter((line) => line.trim());
      const data = lines.map((line) => {
        const values = line.split("\t");
        return {
          attributes_json: values[0],
          event_type: values[1],
          timestamp: values[2],
        };
      });
      result = { data };
    }
    
    const results = Array.isArray(result) ? result : result?.data || [];
    
    console.log(`Found ${results.length} feedback events\n`);
    
    if (results.length === 0) {
      console.log('❌ No feedback events found!');
      return;
    }
    
    results.forEach((row, index) => {
      console.log(`\n--- Event ${index + 1} ---`);
      console.log('Event type:', row.event_type);
      console.log('Timestamp:', row.timestamp);
      console.log('attributes_json type:', typeof row.attributes_json);
      console.log('attributes_json raw:', String(row.attributes_json).substring(0, 300));
      
      // Try to parse
      try {
        let attrs = row.attributes_json;
        if (typeof attrs === 'string') {
          attrs = JSON.parse(attrs);
        }
        console.log('Parsed attributes keys:', Object.keys(attrs || {}));
        if (attrs && attrs.feedback) {
          console.log('✅ Feedback object found:', JSON.stringify(attrs.feedback, null, 2));
        } else {
          console.log('❌ No feedback object found');
          console.log('Available keys:', Object.keys(attrs || {}));
          console.log('Full attributes:', JSON.stringify(attrs, null, 2).substring(0, 500));
        }
      } catch (e) {
        console.log('❌ Failed to parse:', e.message);
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testFeedbackQuery();


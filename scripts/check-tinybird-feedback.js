/**
 * Script to check what feedback data is actually stored in Tinybird
 */

import dotenv from "dotenv";
dotenv.config();

import { TinybirdRepository } from "../src/services/tinybirdRepository.js";
import { AuthService } from "../src/services/authService.js";

const API_URL = process.env.API_URL || "https://observa-api.vercel.app";
const JWT_TOKEN = process.env.JWT_TOKEN;

if (!JWT_TOKEN) {
  console.error("❌ JWT_TOKEN is required");
  process.exit(1);
}

async function checkTinybirdFeedback() {
  console.log("\n🔍 Checking feedback events in Tinybird...");

  const user = await AuthService.validateSession(JWT_TOKEN);
  if (!user) {
    console.error("❌ Invalid or expired JWT_TOKEN");
    process.exit(1);
  }

  const tenantId = user.tenantId;
  const projectId = user.projectId;

  console.log(`   Tenant: ${tenantId}`);
  console.log(`   Project: ${projectId}\n`);

  const end = new Date();
  const start = new Date(end.getTime() - 1 * 60 * 60 * 1000); // Last 1 hour

  const escapedTenantId = tenantId.replace(/'/g, "''");
  const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

  let whereClause = `WHERE tenant_id = '${escapedTenantId}' AND event_type = 'feedback'`;
  if (escapedProjectId) {
    whereClause += ` AND project_id = '${escapedProjectId}'`;
  }
  whereClause += ` AND timestamp >= parseDateTime64BestEffort('${start.toISOString()}', 3)`;
  whereClause += ` AND timestamp <= parseDateTime64BestEffort('${end.toISOString()}', 3)`;

  // Select all columns to match TSV parser
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
      attributes_json
    FROM canonical_events
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT 20
  `;

  try {
    const result = await TinybirdRepository.rawQuery(sql, {
      tenantId: tenantId,
      projectId: projectId,
    });

    const events = Array.isArray(result) ? result : result?.data || [];

    if (events.length === 0) {
      console.log("❌ No feedback events found in the last hour.");
      return;
    }

    console.log(`✅ Found ${events.length} feedback events in the last hour.\n`);

    let withFeedback = 0;
    let withoutFeedback = 0;
    let emptyAttributes = 0;
    let nullAttributes = 0;

    events.forEach((event, index) => {
      const attrsJson = event.attributes_json;
      let parsed = null;
      let hasFeedback = false;
      let feedbackData = null;

      if (attrsJson === null || attrsJson === undefined) {
        nullAttributes++;
        console.log(`\n--- Event ${index + 1} ---`);
        console.log(`  Timestamp: ${event.timestamp}`);
        console.log(`  ❌ attributes_json is NULL/undefined`);
        return;
      }

      if (typeof attrsJson === 'string' && attrsJson.trim() === '') {
        emptyAttributes++;
        console.log(`\n--- Event ${index + 1} ---`);
        console.log(`  Timestamp: ${event.timestamp}`);
        console.log(`  ❌ attributes_json is empty string`);
        return;
      }

      try {
        if (typeof attrsJson === 'string') {
          parsed = JSON.parse(attrsJson);
        } else if (typeof attrsJson === 'object') {
          parsed = attrsJson;
        }

        if (parsed && parsed.feedback) {
          hasFeedback = true;
          feedbackData = parsed.feedback;
          withFeedback++;
        } else {
          withoutFeedback++;
        }
      } catch (e) {
        console.log(`\n--- Event ${index + 1} ---`);
        console.log(`  Timestamp: ${event.timestamp}`);
        console.log(`  ❌ Failed to parse attributes_json:`, e);
        console.log(`  Raw value:`, attrsJson?.substring(0, 200));
        return;
      }

      console.log(`\n--- Event ${index + 1} ---`);
      console.log(`  Timestamp: ${event.timestamp}`);
      console.log(`  Trace ID: ${event.trace_id}`);
      console.log(`  attributes_json type: ${typeof attrsJson}`);
      console.log(`  attributes_json length: ${typeof attrsJson === 'string' ? attrsJson.length : 'N/A'}`);
      console.log(`  Has feedback object: ${hasFeedback ? '✅ YES' : '❌ NO'}`);
      
      if (hasFeedback) {
        console.log(`  ✅ Feedback data:`, JSON.stringify(feedbackData, null, 2));
      } else {
        console.log(`  Parsed attributes keys:`, parsed ? Object.keys(parsed) : 'N/A');
        console.log(`  Parsed attributes:`, JSON.stringify(parsed, null, 2).substring(0, 300));
      }
    });

    console.log(`\n\n📊 Summary:`);
    console.log(`  Total events: ${events.length}`);
    console.log(`  ✅ With feedback: ${withFeedback}`);
    console.log(`  ❌ Without feedback: ${withoutFeedback}`);
    console.log(`  ❌ NULL attributes_json: ${nullAttributes}`);
    console.log(`  ❌ Empty attributes_json: ${emptyAttributes}`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

checkTinybirdFeedback();


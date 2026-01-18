/**
 * Debug script to check attributes_json parsing for traces
 * Queries Tinybird directly and shows what's in attributes_json
 */

import dotenv from "dotenv";
dotenv.config();

import { TinybirdRepository } from "../dist/services/tinybirdRepository.js";

async function debugTraceAttributes(traceId, tenantId, projectId = null) {
  console.log(`\n🔍 Debugging trace attributes for: ${traceId}\n`);
  console.log(`Tenant: ${tenantId}`);
  console.log(`Project: ${projectId || "null"}\n`);

  try {
    // Get events from Tinybird
    const events = await TinybirdRepository.getTraceEvents(
      traceId,
      tenantId,
      projectId
    );

    if (events.length === 0) {
      console.log("❌ No events found in Tinybird for this trace");
      return;
    }

    console.log(`✅ Found ${events.length} events in Tinybird\n`);

    // Check each event
    for (const event of events) {
      console.log(`\n📋 Event: ${event.event_type} (span: ${event.span_id})`);
      console.log(`   Timestamp: ${event.timestamp}`);
      
      // Check attributes_json
      if (!event.attributes_json) {
        console.log(`   ⚠️  attributes_json is null/undefined`);
        continue;
      }

      const attrsJsonType = typeof event.attributes_json;
      console.log(`   attributes_json type: ${attrsJsonType}`);
      
      if (attrsJsonType === "string") {
        const jsonStr = event.attributes_json;
        console.log(`   attributes_json length: ${jsonStr.length}`);
        console.log(`   First 200 chars: ${jsonStr.substring(0, 200)}`);

        // Try to parse
        try {
          const parsed = JSON.parse(jsonStr);
          console.log(`   ✅ Parsed successfully`);
          console.log(`   Parsed keys: ${Object.keys(parsed).join(", ")}`);

          // Check for llm_call
          if (event.event_type === "llm_call") {
            if (parsed.llm_call) {
              console.log(`   ✅ llm_call found in attributes`);
              console.log(`   Model: ${parsed.llm_call.model || "missing"}`);
              console.log(`   Input tokens: ${parsed.llm_call.input_tokens || "missing"}`);
              console.log(`   Output tokens: ${parsed.llm_call.output_tokens || "missing"}`);
            } else {
              console.log(`   ❌ llm_call NOT found in attributes`);
              console.log(`   Available keys: ${Object.keys(parsed).join(", ")}`);
              console.log(`   Full parsed object (first 500 chars):`);
              console.log(JSON.stringify(parsed, null, 2).substring(0, 500));
            }
          } else if (parsed.llm_call) {
            console.log(`   ⚠️  llm_call found in attributes but event_type is "${event.event_type}" (not "llm_call")`);
          }

        } catch (parseError) {
          console.log(`   ❌ Failed to parse JSON: ${parseError.message}`);
          console.log(`   This might be the issue!`);
        }
      } else {
        console.log(`   ⚠️  attributes_json is not a string (type: ${attrsJsonType})`);
        console.log(`   Value:`, event.attributes_json);
      }
    }

    // Summary
    console.log(`\n\n📊 Summary:`);
    const llmCallEvents = events.filter(e => e.event_type === "llm_call");
    console.log(`   Total events: ${events.length}`);
    console.log(`   llm_call events: ${llmCallEvents.length}`);
    
    if (llmCallEvents.length > 0) {
      const withValidAttrs = llmCallEvents.filter(e => {
        if (!e.attributes_json) return false;
        try {
          const parsed = JSON.parse(e.attributes_json);
          return parsed.llm_call !== undefined;
        } catch {
          return false;
        }
      });
      console.log(`   llm_call events with valid attributes: ${withValidAttrs.length}`);
      
      if (withValidAttrs.length < llmCallEvents.length) {
        console.log(`   ⚠️  ${llmCallEvents.length - withValidAttrs.length} llm_call events have invalid/missing attributes`);
      }
    } else {
      console.log(`   ⚠️  No llm_call events found!`);
      console.log(`   Event types found: ${[...new Set(events.map(e => e.event_type))].join(", ")}`);
    }

  } catch (error) {
    console.error("❌ Error debugging trace attributes:", error);
    throw error;
  }
}

// Get parameters from command line
const traceId = process.argv[2];
const tenantId = process.argv[3];
const projectId = process.argv[4] || null;

if (!traceId || !tenantId) {
  console.error("Usage: node scripts/debug-trace-attributes.js <trace_id> <tenant_id> [project_id]");
  console.error("\nExample:");
  console.error("  node scripts/debug-trace-attributes.js 0dee6ce7-acf4-459a-9d1a-a6f5bbe1778c tenant-uuid");
  process.exit(1);
}

debugTraceAttributes(traceId, tenantId, projectId)
  .then(() => {
    console.log("\n✅ Debug complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Debug failed:", error);
    process.exit(1);
  });

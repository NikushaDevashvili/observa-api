/**
 * Debug script to check trace detail attributes parsing
 * Queries trace detail and shows what happens to attributes_json
 */

import dotenv from "dotenv";
dotenv.config();

// Import after env is loaded
const { TraceQueryService } = await import("../dist/services/traceQueryService.js");
const { TinybirdRepository } = await import("../dist/services/tinybirdRepository.js");

async function debugTraceDetailAttributes(traceId, tenantId, projectId = null) {
  console.log(`\n🔍 Debugging trace detail attributes for: ${traceId}\n`);
  console.log(`Tenant: ${tenantId}`);
  console.log(`Project: ${projectId || "null"}\n`);

  try {
    // Step 1: Check what Tinybird returns directly
    console.log("=".repeat(80));
    console.log("STEP 1: Querying Tinybird directly");
    console.log("=".repeat(80));
    
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

    // Check each event, especially llm_call
    const llmCallEvents = events.filter(e => e.event_type === "llm_call");
    console.log(`📋 llm_call events: ${llmCallEvents.length}\n`);

    for (const event of llmCallEvents) {
      console.log(`\n📋 llm_call Event Details:`);
      console.log(`   Span ID: ${event.span_id}`);
      console.log(`   Timestamp: ${event.timestamp}`);
      console.log(`   attributes_json type: ${typeof event.attributes_json}`);
      console.log(`   attributes_json is null: ${event.attributes_json === null}`);
      console.log(`   attributes_json is undefined: ${event.attributes_json === undefined}`);
      
      if (event.attributes_json) {
        if (typeof event.attributes_json === "string") {
          console.log(`   attributes_json length: ${event.attributes_json.length}`);
          console.log(`   attributes_json empty string: ${event.attributes_json.trim() === ""}`);
          console.log(`   attributes_json first 500 chars: ${event.attributes_json.substring(0, 500)}`);
          
          // Try to parse it
          try {
            const parsed = JSON.parse(event.attributes_json);
            console.log(`   ✅ Parsed successfully`);
            console.log(`   Parsed type: ${typeof parsed}`);
            console.log(`   Parsed keys: ${Object.keys(parsed).join(", ")}`);
            
            if (parsed.llm_call) {
              console.log(`   ✅ llm_call found in parsed attributes`);
              console.log(`   Model: ${parsed.llm_call.model || "missing"}`);
              console.log(`   Input: ${parsed.llm_call.input?.substring(0, 50) || "missing"}`);
            } else {
              console.log(`   ❌ llm_call NOT found in parsed attributes`);
              console.log(`   Available keys: ${Object.keys(parsed).join(", ")}`);
            }
          } catch (parseError) {
            console.log(`   ❌ Failed to parse JSON: ${parseError.message}`);
          }
        } else if (typeof event.attributes_json === "object") {
          console.log(`   ⚠️  attributes_json is already an object (not a string)`);
          console.log(`   Object keys: ${Object.keys(event.attributes_json).join(", ")}`);
        }
      } else {
        console.log(`   ❌ attributes_json is null/undefined`);
      }
    }

    // Step 2: Check what TraceQueryService returns
    console.log("\n" + "=".repeat(80));
    console.log("STEP 2: Querying via TraceQueryService.getTraceDetailTree()");
    console.log("=".repeat(80));

    const traceTree = await TraceQueryService.getTraceDetailTree(
      traceId,
      tenantId,
      projectId
    );

    if (!traceTree) {
      console.log("❌ TraceQueryService returned null");
      return;
    }

    console.log(`✅ TraceQueryService returned trace tree\n`);

    // Find llm_call spans/events in the tree
    const allSpans = traceTree.allSpans || traceTree.spans || [];
    console.log(`Total spans: ${allSpans.length}`);

    for (const span of allSpans) {
      if (span.event_type === "llm_call" || span.name?.includes("LLM Call")) {
        console.log(`\n📋 LLM Call Span:`);
        console.log(`   Span ID: ${span.span_id}`);
        console.log(`   Name: ${span.name}`);
        console.log(`   Events count: ${span.events?.length || 0}`);
        
        // Check events
        if (span.events && span.events.length > 0) {
          const llmEvent = span.events.find(e => e.event_type === "llm_call");
          if (llmEvent) {
            console.log(`   llm_call event found in span.events`);
            console.log(`   event.attributes type: ${typeof llmEvent.attributes}`);
            console.log(`   event.attributes is null: ${llmEvent.attributes === null}`);
            console.log(`   event.attributes is undefined: ${llmEvent.attributes === undefined}`);
            
            if (llmEvent.attributes) {
              console.log(`   event.attributes keys: ${Object.keys(llmEvent.attributes).join(", ")}`);
              console.log(`   event.attributes.llm_call exists: ${!!llmEvent.attributes.llm_call}`);
              
              if (llmEvent.attributes.llm_call) {
                console.log(`   ✅ llm_call data present in event.attributes`);
                console.log(`   Model: ${llmEvent.attributes.llm_call.model || "missing"}`);
              } else {
                console.log(`   ❌ llm_call NOT in event.attributes`);
              }
            } else {
              console.log(`   ❌ event.attributes is null/undefined/empty`);
            }
          } else {
            console.log(`   ⚠️  No llm_call event found in span.events`);
          }
        }
        
        // Check span.llm_call (extracted data)
        if (span.llm_call) {
          console.log(`   ✅ span.llm_call exists (extracted data)`);
          console.log(`   Model: ${span.llm_call.model || "missing"}`);
        } else {
          console.log(`   ❌ span.llm_call does NOT exist (extraction failed)`);
        }
      }
    }

    // Summary
    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    
    const hasLlmCallInTinybird = llmCallEvents.some(e => {
      if (!e.attributes_json) return false;
      try {
        const parsed = typeof e.attributes_json === "string" 
          ? JSON.parse(e.attributes_json) 
          : e.attributes_json;
        return parsed.llm_call !== undefined;
      } catch {
        return false;
      }
    });
    
    const hasLlmCallInTraceTree = allSpans.some(span => {
      if (span.event_type !== "llm_call" && !span.name?.includes("LLM Call")) return false;
      const llmEvent = span.events?.find(e => e.event_type === "llm_call");
      return llmEvent?.attributes?.llm_call !== undefined || span.llm_call !== undefined;
    });

    console.log(`Tinybird has llm_call data: ${hasLlmCallInTinybird ? "✅ YES" : "❌ NO"}`);
    console.log(`TraceTree has llm_call data: ${hasLlmCallInTraceTree ? "✅ YES" : "❌ NO"}`);
    
    if (hasLlmCallInTinybird && !hasLlmCallInTraceTree) {
      console.log(`\n❌ ISSUE FOUND: Data exists in Tinybird but lost in TraceTree!`);
      console.log(`   This indicates a problem in buildTreeFromCanonicalEvents()`);
    } else if (!hasLlmCallInTinybird) {
      console.log(`\n❌ ISSUE FOUND: Data doesn't exist in Tinybird!`);
      console.log(`   This indicates a problem during event ingestion.`);
    } else if (hasLlmCallInTinybird && hasLlmCallInTraceTree) {
      console.log(`\n✅ Data is present in both Tinybird and TraceTree!`);
      console.log(`   Issue may be in frontend display or API response transformation.`);
    }

  } catch (error) {
    console.error("❌ Error debugging trace detail attributes:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    throw error;
  }
}

// Get parameters from command line
const traceId = process.argv[2];
const tenantId = process.argv[3];
const projectId = process.argv[4] || null;

if (!traceId || !tenantId) {
  console.error("Usage: node scripts/debug-trace-detail-attributes.js <trace_id> <tenant_id> [project_id]");
  console.error("\nExample:");
  console.error("  node scripts/debug-trace-detail-attributes.js 05420b59-6f0a-42af-a1f1-20b1d14deeaa 4f62d2a5-6a34-4d53-a301-c0c661b0c4d6");
  process.exit(1);
}

debugTraceDetailAttributes(traceId, tenantId, projectId)
  .then(() => {
    console.log("\n✅ Debug complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Debug failed:", error);
    process.exit(1);
  });

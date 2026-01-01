/**
 * Test script to verify trace summary includes query and response fields
 *
 * This script tests the trace API to ensure the summary includes:
 * - query (user's question)
 * - response (final output)
 * - total_cost (aggregated cost)
 * - finish_reason (from LLM call)
 *
 * Usage:
 *   node scripts/test-trace-summary.js <TRACE_ID> <SESSION_TOKEN>
 *
 * Or with environment variables:
 *   TRACE_ID=xxx SESSION_TOKEN=yyy API_URL=https://observa-api.vercel.app node scripts/test-trace-summary.js
 */

const TRACE_ID = process.argv[2] || process.env.TRACE_ID;
const SESSION_TOKEN = process.argv[3] || process.env.SESSION_TOKEN;
const API_URL = process.env.API_URL || "https://observa-api.vercel.app";

if (!TRACE_ID) {
  console.error("❌ Error: TRACE_ID is required");
  console.error(
    "Usage: node scripts/test-trace-summary.js <TRACE_ID> <SESSION_TOKEN>"
  );
  console.error(
    "   or: TRACE_ID=xxx SESSION_TOKEN=yyy node scripts/test-trace-summary.js"
  );
  process.exit(1);
}

if (!SESSION_TOKEN) {
  console.error("❌ Error: SESSION_TOKEN is required");
  console.error(
    "Usage: node scripts/test-trace-summary.js <TRACE_ID> <SESSION_TOKEN>"
  );
  console.error(
    "   or: TRACE_ID=xxx SESSION_TOKEN=yyy node scripts/test-trace-summary.js"
  );
  console.error(
    "\n💡 Get a session token by logging into the dashboard and checking browser cookies/storage"
  );
  process.exit(1);
}

async function testTraceSummary() {
  console.log("\n🧪 Testing Trace Summary Fields");
  console.log("=================================\n");
  console.log(`Trace ID: ${TRACE_ID}`);
  console.log(`API URL: ${API_URL}\n`);

  try {
    const response = await fetch(
      `${API_URL}/api/v1/traces/${TRACE_ID}?format=tree`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SESSION_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);

      if (response.status === 401) {
        console.error(
          "\n💡 Authentication failed. Make sure you're using a valid session token."
        );
        console.error("   Get a session token by logging into the dashboard.");
      } else if (response.status === 404) {
        console.error(
          "\n💡 Trace not found. Make sure the trace ID is correct and belongs to your tenant."
        );
      }

      process.exit(1);
    }

    const data = await response.json();

    if (!data.success) {
      console.error("❌ API returned success: false");
      console.error("Response:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const trace = data.trace;
    const summary = trace.summary;

    console.log("✅ Trace retrieved successfully\n");
    console.log("📊 Summary Fields Check:\n");

    // Test critical fields
    const checks = {
      "query (user question)": {
        present: summary.query !== undefined && summary.query !== null,
        value: summary.query
          ? summary.query.substring(0, 100) +
            (summary.query.length > 100 ? "..." : "")
          : null,
        critical: true,
      },
      "response (final output)": {
        present: summary.response !== undefined && summary.response !== null,
        value: summary.response
          ? summary.response.substring(0, 100) +
            (summary.response.length > 100 ? "..." : "")
          : null,
        critical: true,
      },
      total_cost: {
        present: summary.total_cost !== undefined,
        value: summary.total_cost,
        critical: false,
      },
      finish_reason: {
        present:
          summary.finish_reason !== undefined && summary.finish_reason !== null,
        value: summary.finish_reason,
        critical: false,
      },
      model: {
        present: summary.model !== undefined && summary.model !== null,
        value: summary.model,
        critical: false,
      },
      total_tokens: {
        present: summary.total_tokens !== undefined,
        value: summary.total_tokens,
        critical: false,
      },
      total_latency_ms: {
        present: summary.total_latency_ms !== undefined,
        value: summary.total_latency_ms,
        critical: false,
      },
    };

    let allPassed = true;
    let criticalPassed = true;

    for (const [field, check] of Object.entries(checks)) {
      const status = check.present ? "✅" : check.critical ? "❌" : "⚠️ ";
      const label = check.critical ? " [CRITICAL]" : "";
      console.log(`${status} ${field}${label}:`);

      if (check.present) {
        console.log(
          `   Value: ${
            check.value !== null ? JSON.stringify(check.value) : "null"
          }`
        );
      } else {
        console.log(`   ❌ MISSING`);
        if (check.critical) {
          allPassed = false;
          criticalPassed = false;
        } else {
          allPassed = false;
        }
      }
      console.log("");
    }

    // Check spans structure
    console.log("🌳 Spans Structure:\n");
    console.log(
      `   Total spans: ${trace.allSpans?.length || trace.spans?.length || 0}`
    );
    console.log(`   Root spans: ${trace.spans?.length || 0}`);

    if (trace.spans && trace.spans.length > 0) {
      console.log("\n   Span types:");
      const spanTypes = {};
      (trace.allSpans || trace.spans || []).forEach((span) => {
        const type = span.type || span.event_type || "unknown";
        spanTypes[type] = (spanTypes[type] || 0) + 1;
      });
      for (const [type, count] of Object.entries(spanTypes)) {
        console.log(`     - ${type}: ${count}`);
      }
    }

    console.log("\n" + "=".repeat(50));
    if (criticalPassed) {
      console.log("✅ ALL CRITICAL CHECKS PASSED");
      if (allPassed) {
        console.log("✅ ALL CHECKS PASSED");
      } else {
        console.log("⚠️  Some non-critical fields are missing (this is okay)");
      }
    } else {
      console.log("❌ CRITICAL CHECKS FAILED");
      console.log(
        "   The summary is missing required fields (query or response)"
      );
      process.exit(1);
    }
    console.log("=".repeat(50) + "\n");

    // Show full summary for reference
    console.log("📋 Full Summary Object:\n");
    console.log(JSON.stringify(summary, null, 2));
    console.log("");
  } catch (error) {
    console.error("\n❌ Error testing trace summary:");
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testTraceSummary();

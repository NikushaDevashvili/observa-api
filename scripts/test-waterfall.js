/**
 * Test script to send traces for waterfall/timeline view testing
 *
 * Uses the legacy /traces/ingest endpoint which populates analysis_results
 * The waterfall view reads from this table and builds a tree structure
 *
 * Usage:
 *   node scripts/test-waterfall.js <JWT_TOKEN>
 *
 * Or set JWT_TOKEN environment variable:
 *   JWT_TOKEN=your_token node scripts/test-waterfall.js
 */

const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;
const API_URL = process.env.API_URL || "http://localhost:3000";

if (!JWT_TOKEN) {
  console.error("Error: JWT_TOKEN is required");
  console.error("Usage: node scripts/test-waterfall.js <JWT_TOKEN>");
  console.error("   or: JWT_TOKEN=your_token node scripts/test-waterfall.js");
  console.error("\n💡 Get a token from: POST /api/v1/auth/signup");
  console.error("   Or use a token from customer-chat settings");
  process.exit(1);
}

// Simple UUID v4 generator for test script
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function sendWaterfallTestTrace() {
  const traceId = generateUUID(); // Use UUID format

  // Send a trace with context and response - this will show up in the waterfall view
  const traceData = {
    traceId: traceId,
    spanId: traceId, // Root span
    parentSpanId: null,
    query: "What is the refund policy for digital products?",
    context:
      "[CONTEXT] Refund Policy: Refunds are allowed within 30 days only. No refunds for digital items. All refunds must be requested through the customer portal.",
    response:
      "Refunds are allowed within 30 days only. No refunds for digital items. All refunds must be requested through the customer portal.",
    model: "gpt-4o-mini",
    tokensPrompt: 150,
    tokensCompletion: 45,
    tokensTotal: 195,
    latencyMs: 1250,
    timeToFirstTokenMs: 350,
    streamingDurationMs: 900,
    status: 200,
    timestamp: new Date().toISOString(),
    environment: "dev",
    conversationId: generateUUID(),
    sessionId: generateUUID(),
    userId: generateUUID(),
    messageIndex: 1,
  };

  try {
    console.log(
      `\n📊 Sending waterfall test trace to ${API_URL}/api/v1/traces/ingest...`
    );
    console.log(`   Trace ID: ${traceId}`);
    console.log(`   Query: ${traceData.query.substring(0, 60)}...`);
    console.log(`   Model: ${traceData.model}`);
    console.log(
      `   Tokens: ${traceData.tokensTotal} (${traceData.tokensPrompt} input, ${traceData.tokensCompletion} output)`
    );
    console.log(`   Latency: ${traceData.latencyMs}ms\n`);

    const response = await fetch(`${API_URL}/api/v1/traces/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${JWT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(traceData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Waterfall test trace sent successfully!");
      console.log("Response:", JSON.stringify(data, null, 2));
      console.log(
        `\n💡 View waterfall at: http://localhost:3001/dashboard/traces/${traceId}`
      );
      console.log(
        `💡 Or in production: https://your-app.vercel.app/dashboard/traces/${traceId}`
      );
      console.log("\n📝 The waterfall view will show:");
      console.log("   - Root span with LLM call event");
      console.log("   - Retrieval event (from context)");
      console.log("   - Output event");
      console.log(
        "\n⏳ Note: Analysis may take a few seconds. Refresh the page if data doesn't appear immediately."
      );
    } else {
      console.error("❌ Failed to send waterfall test trace");
      console.error("Status:", response.status);
      console.error("Response:", JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error sending waterfall test trace:", error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

async function main() {
  await sendWaterfallTestTrace();
  console.log("\n✅ Waterfall test complete!");
}

main().catch(console.error);

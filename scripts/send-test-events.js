/**
 * Simple script to send test events with both normal and errored events
 * 
 * Usage:
 *   API_KEY=sk_... node scripts/send-test-events.js
 * 
 * Or with JWT token (will try to create API key):
 *   JWT_TOKEN=... node scripts/send-test-events.js
 */

const API_KEY = process.env.API_KEY;
const JWT_TOKEN = process.env.JWT_TOKEN;
const API_URL = process.env.API_URL || "http://localhost:3000";
const NUM_TRACES = parseInt(process.env.NUM_TRACES || "10");
const ERROR_RATE = parseFloat(process.env.ERROR_RATE || "0.3"); // 30% error rate

if (!API_KEY && !JWT_TOKEN) {
  console.error("❌ Error: API_KEY or JWT_TOKEN is required");
  console.error("Usage: API_KEY=sk_... node scripts/send-test-events.js");
  console.error("   or: JWT_TOKEN=... node scripts/send-test-events.js");
  process.exit(1);
}

// Extract tenant/project from JWT if provided
let tenantId, projectId;
if (JWT_TOKEN && !API_KEY) {
  try {
    const payload = JSON.parse(
      Buffer.from(JWT_TOKEN.split(".")[1], "base64").toString()
    );
    tenantId = payload.tenantId;
    projectId = payload.projectId;
  } catch (e) {
    console.error("❌ Error: Could not extract tenantId/projectId from JWT token");
    process.exit(1);
  }
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a trace with events (normal or with errors)
function generateTrace(traceIndex, hasError) {
  const traceId = generateUUID();
  const rootSpanId = generateUUID();
  const conversationId = generateUUID();
  const sessionId = generateUUID();
  const userId = generateUUID();
  const baseTime = new Date(Date.now() - traceIndex * 10000).toISOString();
  const events = [];

  // Use extracted tenant/project or defaults
  const tId = tenantId || "00000000-0000-0000-0000-000000000001";
  const pId = projectId || "00000000-0000-0000-0000-000000000002";

  // Trace start
  events.push({
    tenant_id: tId,
    project_id: pId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: baseTime,
    event_type: "trace_start",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      trace_start: {
        name: `Test Trace ${traceIndex}`,
      },
    },
  });

  // Tool call (may have error)
  const toolSpanId = generateUUID();
  const toolError = hasError && Math.random() < 0.5;
  const toolTimeout = hasError && !toolError && Math.random() < 0.3;

  events.push({
    tenant_id: tId,
    project_id: pId,
    environment: "prod",
    trace_id: traceId,
    span_id: toolSpanId,
    parent_span_id: rootSpanId,
    timestamp: new Date(new Date(baseTime).getTime() + 50).toISOString(),
    event_type: "tool_call",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      tool_call: {
        tool_name: randomChoice(["get_order_status", "search_database", "call_api"]),
        args: { query: `test query ${traceIndex}` },
        args_hash: "abc123",
        result_status: toolTimeout ? "timeout" : toolError ? "error" : "success",
        result: toolError || toolTimeout ? null : { success: true, data: "result" },
        latency_ms: toolTimeout ? 35000 : randomInt(100, 500),
        error_message: toolTimeout
          ? "Request timeout after 30s"
          : toolError
          ? "Database connection failed"
          : null,
      },
    },
  });

  // Error event if tool failed
  if (toolError || toolTimeout) {
    events.push({
      tenant_id: tId,
      project_id: pId,
      environment: "prod",
      trace_id: traceId,
      span_id: generateUUID(),
      parent_span_id: toolSpanId,
      timestamp: new Date(new Date(baseTime).getTime() + (toolTimeout ? 35000 : 500)).toISOString(),
      event_type: "error",
      conversation_id: conversationId,
      session_id: sessionId,
      user_id: userId,
      attributes: {
        error: {
          error_type: toolTimeout ? "timeout_error" : "tool_error",
          error_message: toolTimeout
            ? "Request timeout after 30s"
            : "Database connection failed",
          stack_trace: "Error: Connection failed\n    at Tool.call (tool.js:23:5)",
        },
      },
    });
  }

  // LLM call
  const llmLatency = hasError && Math.random() < 0.3 ? randomInt(6000, 12000) : randomInt(200, 2000);
  const inputTokens = randomInt(100, 5000);
  const outputTokens = randomInt(50, 2000);
  const model = randomChoice(["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet"]);

  events.push({
    tenant_id: tId,
    project_id: pId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: new Date(new Date(baseTime).getTime() + 1000).toISOString(),
    event_type: "llm_call",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      llm_call: {
        model,
        input: "What is the status of my order?",
        output: "Your order is currently being processed.",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        latency_ms: llmLatency,
        finish_reason: "stop",
        temperature: 0.7,
      },
    },
  });

  // Output event
  events.push({
    tenant_id: tId,
    project_id: pId,
    environment: "prod",
    trace_id: traceId,
    span_id: generateUUID(),
    parent_span_id: rootSpanId,
    timestamp: new Date(new Date(baseTime).getTime() + llmLatency + 50).toISOString(),
    event_type: "output",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      output: {
        final_output: "Your order is currently being processed.",
        output_length: 35,
      },
    },
  });

  // Trace end
  events.push({
    tenant_id: tId,
    project_id: pId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: new Date(new Date(baseTime).getTime() + llmLatency + 100).toISOString(),
    event_type: "trace_end",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      trace_end: {
        total_latency_ms: llmLatency + 100,
        total_tokens: inputTokens + outputTokens,
        outcome: hasError ? "error" : "success",
      },
    },
  });

  return events;
}

// Send events to API
async function sendEvents(events, apiKey) {
  const response = await fetch(`${API_URL}/api/v1/events/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(events),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send events: ${response.status} ${text}`);
  }

  return response.json();
}

// Get or create API key
async function getOrCreateApiKey() {
  if (API_KEY) {
    return API_KEY;
  }

  // Try to create API key using JWT
  try {
    const response = await fetch(
      `${API_URL}/api/v1/tenants/${tenantId}/api-keys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${JWT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Test Load Key - ${new Date().toISOString()}`,
          keyPrefix: "sk_",
          projectId: projectId,
          scopes: { ingest: true, query: true },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create API key: ${response.status}`);
    }

    const data = await response.json();
    return data.apiKey;
  } catch (error) {
    console.error("❌ Failed to create API key:", error.message);
    throw error;
  }
}

// Main execution
async function main() {
  console.log("🚀 Sending test events with errors...\n");
  console.log(`Configuration:`);
  console.log(`  - Traces: ${NUM_TRACES}`);
  console.log(`  - Error Rate: ${(ERROR_RATE * 100).toFixed(0)}%`);
  console.log(`  - API URL: ${API_URL}\n`);

  try {
    const apiKey = await getOrCreateApiKey();
    console.log("✅ API Key ready\n");

    const stats = {
      traces: 0,
      events: 0,
      errors: 0,
      success: 0,
    };

    // Generate and send traces
    for (let i = 0; i < NUM_TRACES; i++) {
      const hasError = Math.random() < ERROR_RATE;
      const events = generateTrace(i, hasError);
      
      try {
        await sendEvents(events, apiKey);
        stats.traces++;
        stats.events += events.length;
        stats.success++;
        
        if (hasError) stats.errors++;
        
        console.log(
          `✅ Trace ${i + 1}/${NUM_TRACES} sent (${events.length} events${hasError ? ", with errors" : ""})`
        );
      } catch (error) {
        console.error(`❌ Failed to send trace ${i + 1}:`, error.message);
        stats.errors++;
      }

      // Rate limiting
      if (i < NUM_TRACES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log("\n✨ Test data sent!");
    console.log(`\nStatistics:`);
    console.log(`  - Traces sent: ${stats.traces}`);
    console.log(`  - Events sent: ${stats.events}`);
    console.log(`  - Traces with errors: ${stats.errors}`);
    console.log(`  - Success rate: ${((stats.success / NUM_TRACES) * 100).toFixed(1)}%`);
    console.log(`\n📊 Check your dashboard to see the events and errors!`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();


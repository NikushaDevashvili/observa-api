/**
 * Generate Test Data with Issues
 * 
 * Generates canonical events with various issue types for testing dashboard display:
 * - Tool errors and timeouts
 * - High latency LLM calls
 * - Cost spikes
 * - Token spikes
 * - Error events
 * 
 * Usage:
 *   node scripts/generate-issues-test-data.js <JWT_TOKEN>
 * 
 * Environment variables:
 *   ERROR_RATE=0.5 - Increase error rate to 50%
 *   HIGH_LATENCY_RATE=0.4 - 40% of LLM calls will have high latency
 *   COST_SPIKE_RATE=0.3 - 30% will have cost spikes
 *   TOKEN_SPIKE_RATE=0.2 - 20% will have token spikes
 */

const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;
const API_URL = process.env.API_URL || "http://localhost:3000";

// Enhanced configuration for generating issues
const CONFIG = {
  numTraces: parseInt(process.env.NUM_TRACES || "20"),
  errorRate: parseFloat(process.env.ERROR_RATE || "0.5"), // 50% error rate
  highLatencyRate: parseFloat(process.env.HIGH_LATENCY_RATE || "0.4"), // 40% high latency
  costSpikeRate: parseFloat(process.env.COST_SPIKE_RATE || "0.3"), // 30% cost spikes
  tokenSpikeRate: parseFloat(process.env.TOKEN_SPIKE_RATE || "0.2"), // 20% token spikes
  toolTimeoutRate: parseFloat(process.env.TOOL_TIMEOUT_RATE || "0.3"), // 30% tool timeouts
  rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || "200"),
};

if (!JWT_TOKEN) {
  console.error("❌ Error: JWT_TOKEN is required");
  console.error("Usage: node scripts/generate-issues-test-data.js <JWT_TOKEN>");
  process.exit(1);
}

// Extract tenant/project from JWT
let tenantId, projectId, API_KEY;
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

// Get or create API key
async function getOrCreateApiKey() {
  if (process.env.API_KEY && (process.env.API_KEY.startsWith("sk_") || process.env.API_KEY.startsWith("pk_"))) {
    return process.env.API_KEY;
  }

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
          name: `Issues Test Data Key - ${new Date().toISOString()}`,
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

// Generate events for a trace with issues
function generateTraceWithIssues(traceIndex) {
  const traceId = generateUUID();
  const rootSpanId = generateUUID();
  const conversationId = generateUUID();
  const sessionId = generateUUID();
  const userId = generateUUID();
  const agentName = randomChoice(["customer_support_agent", "code_assistant", "data_analyst"]);
  const version = randomChoice(["v1.0.0", "v2.0.0"]);
  const route = randomChoice(["/api/chat", "/api/agent"]);
  const environment = Math.random() > 0.3 ? "prod" : "dev";
  
  const baseTime = Date.now() - (traceIndex * 60000); // Stagger traces
  const events = [];

  // Trace start
  // NOTE: agent_name, version, and route are NOT in Tinybird schema, but validation allows them
  // They will be removed by the formatter before sending to Tinybird
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment,
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: new Date(baseTime).toISOString(),
    event_type: "trace_start",
    // CRITICAL: conversation_id, session_id, and user_id are REQUIRED in Tinybird (not nullable)
    // Always provide these values (use empty string if not available, but we have them here)
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    // These fields are allowed in validation but removed by formatter (not in Tinybird schema)
    agent_name: agentName,
    version,
    route,
    attributes: {},
  });

  // Determine which issues to include
  const hasToolError = Math.random() < CONFIG.errorRate;
  const hasToolTimeout = Math.random() < CONFIG.toolTimeoutRate;
  const hasHighLatency = Math.random() < CONFIG.highLatencyRate;
  const hasCostSpike = Math.random() < CONFIG.costSpikeRate;
  const hasTokenSpike = Math.random() < CONFIG.tokenSpikeRate;
  const hasErrorEvent = Math.random() < CONFIG.errorRate * 0.5;

  // Generate tool calls with errors/timeouts
  const toolNames = ["get_order_status", "search_database", "call_api", "fetch_data"];
  const numTools = hasToolError || hasToolTimeout ? randomInt(2, 4) : randomInt(1, 3);

  for (let i = 0; i < numTools; i++) {
    const toolSpanId = generateUUID();
    const toolStartTime = baseTime + (i * 1000) + 50;
    const toolEndTime = toolStartTime + (hasToolTimeout ? 35000 : (hasToolError ? 500 : randomInt(100, 500)));
    
    const toolName = randomChoice(toolNames);
    const isError = hasToolError && i === 0; // First tool fails
    const isTimeout = hasToolTimeout && i === 1; // Second tool times out

    events.push({
      tenant_id: tenantId,
      project_id: projectId,
      environment,
      trace_id: traceId,
      span_id: toolSpanId,
      parent_span_id: rootSpanId,
      timestamp: new Date(toolStartTime).toISOString(),
      event_type: "tool_call",
      conversation_id: conversationId,
      session_id: sessionId,
      user_id: userId,
      agent_name: agentName,
      version,
      route,
      attributes: {
        tool_call: {
          tool_name: toolName,
          args: { query: `test query ${i}` },
          args_hash: "abc123",
          result_status: isTimeout ? "timeout" : (isError ? "error" : "success"),
          result: isError || isTimeout ? null : { success: true, data: `result ${i}` },
          latency_ms: toolEndTime - toolStartTime,
          error_message: isTimeout ? "Request timeout after 30s" : (isError ? "Database connection failed" : null),
        },
      },
    });

    // Generate error event for tool errors/timeouts
    if (isError || isTimeout) {
      events.push({
        tenant_id: tenantId,
        project_id: projectId,
        environment,
        trace_id: traceId,
        span_id: generateUUID(),
        parent_span_id: toolSpanId,
        timestamp: new Date(toolEndTime).toISOString(),
        event_type: "error",
        conversation_id: conversationId,
        session_id: sessionId,
        user_id: userId,
        agent_name: agentName,
        version,
        route,
        attributes: {
          error: {
            error_type: isTimeout ? "timeout_error" : "tool_error",
            error_message: isTimeout ? "Request timeout after 30s" : "Database connection failed",
            stack_trace: "Error: Connection failed\n    at Tool.call (tool.js:23:5)",
          },
        },
      });
    }
  }

  // Generate LLM call with potential high latency, cost spike, or token spike
  const llmStartTime = baseTime + 2000;
  let latency = hasHighLatency ? randomInt(6000, 12000) : randomInt(200, 2000);
  let inputTokens = hasTokenSpike ? randomInt(80000, 150000) : randomInt(100, 5000);
  let outputTokens = hasTokenSpike ? randomInt(50000, 100000) : randomInt(50, 2000);
  let totalTokens = inputTokens + outputTokens;
  
  // Use expensive model for cost spikes
  const model = hasCostSpike ? "gpt-4o" : (hasHighLatency ? "gpt-4o" : randomChoice(["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet"]));
  
  // Calculate cost (gpt-4o is more expensive)
  const inputCostPer1k = model === "gpt-4o" ? 0.005 : 0.00015;
  const outputCostPer1k = model === "gpt-4o" ? 0.015 : 0.0006;
  let cost = (inputTokens / 1000) * inputCostPer1k + (outputTokens / 1000) * outputCostPer1k;
  
  // Boost cost for spikes
  if (hasCostSpike) {
    cost = cost * randomInt(5, 15); // 5-15x multiplier
  }

  const llmEndTime = llmStartTime + latency;

  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment,
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: new Date(llmStartTime).toISOString(),
    event_type: "llm_call",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version,
    route,
    attributes: {
      llm_call: {
        model,
        input: "What is the status of my order?",
        output: "Your order is currently being processed and will ship soon.",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        latency_ms: latency,
        cost: parseFloat(cost.toFixed(6)),
        finish_reason: "stop",
        temperature: 0.7,
      },
    },
  });

  // Generate additional error event if configured
  if (hasErrorEvent) {
    events.push({
      tenant_id: tenantId,
      project_id: projectId,
      environment,
      trace_id: traceId,
      span_id: generateUUID(),
      parent_span_id: rootSpanId,
      timestamp: new Date(llmEndTime + 100).toISOString(),
      event_type: "error",
      conversation_id: conversationId,
      session_id: sessionId,
      user_id: userId,
      agent_name: agentName,
      version,
      route,
      attributes: {
        error: {
          error_type: "llm_error",
          error_message: "Rate limit exceeded",
          stack_trace: "Error: Rate limit\n    at LLMClient.call (llm.js:123:45)",
        },
      },
    });
  }

  // Output event
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment,
    trace_id: traceId,
    span_id: generateUUID(),
    parent_span_id: rootSpanId,
    timestamp: new Date(llmEndTime + 50).toISOString(),
    event_type: "output",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version,
    route,
    attributes: {
      output: {
        content: "Your order is currently being processed.",
        content_type: "text",
      },
    },
  });

  // Trace end
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment,
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: new Date(llmEndTime + 100).toISOString(),
    event_type: "trace_end",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version,
    route,
    attributes: {},
  });

  return events;
}

// Send events
async function sendEvents(events, apiKey) {
  const response = await fetch(`${API_URL}/api/v1/events/ingest`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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

// Main execution
async function main() {
  console.log("🚀 Generating test data with issues...\n");
  console.log(`Configuration:`);
  console.log(`  - Traces: ${CONFIG.numTraces}`);
  console.log(`  - Error Rate: ${(CONFIG.errorRate * 100).toFixed(0)}%`);
  console.log(`  - High Latency Rate: ${(CONFIG.highLatencyRate * 100).toFixed(0)}%`);
  console.log(`  - Cost Spike Rate: ${(CONFIG.costSpikeRate * 100).toFixed(0)}%`);
  console.log(`  - Token Spike Rate: ${(CONFIG.tokenSpikeRate * 100).toFixed(0)}%`);
  console.log(`  - Tool Timeout Rate: ${(CONFIG.toolTimeoutRate * 100).toFixed(0)}%\n`);

  try {
    API_KEY = await getOrCreateApiKey();
    console.log("✅ API Key ready\n");

    const stats = {
      traces: 0,
      events: 0,
      errors: 0,
    };

    // Generate and send traces
    for (let i = 0; i < CONFIG.numTraces; i++) {
      const events = generateTraceWithIssues(i);
      await sendEvents(events, API_KEY);
      
      stats.traces++;
      stats.events += events.length;
      
      // Count issues in this trace
      const hasErrors = events.some(e => 
        e.event_type === "error" || 
        (e.event_type === "tool_call" && e.attributes?.tool_call?.result_status !== "success")
      );
      if (hasErrors) stats.errors++;

      console.log(`✅ Trace ${i + 1}/${CONFIG.numTraces} sent (${events.length} events)`);
      
      // Rate limiting
      if (i < CONFIG.numTraces - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitMs));
      }
    }

    console.log("\n✨ Generation complete!");
    console.log(`\nStatistics:`);
    console.log(`  - Traces: ${stats.traces}`);
    console.log(`  - Events: ${stats.events}`);
    console.log(`  - Traces with errors: ${stats.errors}`);
    console.log(`\n📊 Check your dashboard to see the issues!`);
    console.log(`   Issues should appear in: /dashboard/issues`);
    console.log(`   Dashboard overview: /dashboard\n`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();


/**
 * Test script to generate traces with specific feedback types
 * 
 * Usage:
 *   node scripts/test-feedback-traces.js <JWT_TOKEN> [feedback_type]
 * 
 * feedback_type options:
 *   - "like" - Only likes
 *   - "dislike" - Only dislikes  
 *   - "both" - Both likes and dislikes (random)
 *   - "none" - No feedback
 * 
 * Or with environment variables:
 *   JWT_TOKEN=token FEEDBACK_TYPE=like API_URL=https://observa-api.vercel.app node scripts/test-feedback-traces.js
 */

import dotenv from "dotenv";
dotenv.config();

const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;
const FEEDBACK_TYPE = process.argv[3] || process.env.FEEDBACK_TYPE || "both";
const API_URL = process.env.API_URL || "https://observa-api.vercel.app";
const NUM_TRACES = parseInt(process.env.NUM_TRACES || "5");

if (!JWT_TOKEN) {
  console.error("❌ Error: JWT_TOKEN is required");
  console.error("Usage: node scripts/test-feedback-traces.js <JWT_TOKEN> [feedback_type]");
  console.error("   or: JWT_TOKEN=token FEEDBACK_TYPE=like node scripts/test-feedback-traces.js");
  process.exit(1);
}

if (!["like", "dislike", "both", "none"].includes(FEEDBACK_TYPE)) {
  console.error("❌ Error: Invalid feedback_type. Must be: like, dislike, both, or none");
  process.exit(1);
}

// Import the main simulation script functions
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// We'll use a modified version of the load simulation
// For simplicity, let's create a minimal version here

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addMilliseconds(isoString, ms) {
  return new Date(new Date(isoString).getTime() + ms).toISOString();
}

async function getOrCreateApiKey() {
  try {
    const response = await fetch(`${API_URL}/api/v1/api-keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${JWT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `test-feedback-${Date.now()}`,
        permissions: ["ingest"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create API key: ${errorText}`);
    }

    const data = await response.json();
    return data.api_key;
  } catch (error) {
    console.error("❌ Failed to create API key:", error.message);
    throw error;
  }
}

function generateFeedbackEvent(params, feedbackType, traceOutcome) {
  const {
    traceId,
    spanId,
    timestamp,
    conversationId,
    sessionId,
    userId,
    agentName,
    version,
    route,
  } = params;

  let comment = null;
  const hasComment = Math.random() < 0.4; // 40% have comments

  if (hasComment) {
    if (feedbackType === "like") {
      comment = randomChoice([
        "Great response!",
        "This solved my problem",
        "Very helpful, thank you!",
        "Perfect answer",
        "Exactly what I needed",
      ]);
    } else if (feedbackType === "dislike") {
      comment = randomChoice([
        "This is incorrect or unhelpful.",
        "This doesn't answer my question",
        "Not helpful",
        "The system seems broken",
        "Response doesn't make sense",
        "This is not what I asked for",
      ]);
    }
  }

  const attributes = {
    feedback: {
      type: feedbackType,
      outcome: traceOutcome,
      comment: comment,
    },
  };

  return {
    tenant_id: params.tenantId,
    project_id: params.projectId,
    environment: Math.random() > 0.2 ? "prod" : "dev",
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: null,
    timestamp: timestamp,
    event_type: "feedback",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version: version,
    route: route,
    attributes: attributes,
  };
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateTraceWithFeedback(apiKey, traceIndex, tenantId, projectId) {
  const traceId = generateUUID();
  const rootSpanId = generateUUID();
  const conversationId = generateUUID();
  const sessionId = generateUUID();
  const userId = generateUUID();
  const agentName = "test-agent";
  const version = "1.0.0";
  const route = "/test";
  const baseTime = new Date().toISOString();

  const events = [];

  // Determine feedback type for this trace
  let feedbackType;
  if (FEEDBACK_TYPE === "none") {
    // No feedback
    feedbackType = null;
  } else if (FEEDBACK_TYPE === "both") {
    // Random like or dislike
    feedbackType = Math.random() < 0.5 ? "like" : "dislike";
  } else {
    // Specific type
    feedbackType = FEEDBACK_TYPE;
  }

  // Determine trace outcome (affects feedback outcome)
  const traceOutcome = Math.random() < 0.7 ? "success" : Math.random() < 0.5 ? "failure" : "partial";

  // 1. trace_start
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: baseTime,
    event_type: "trace_start",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version: version,
    route: route,
    attributes: {
      trace_start: {
        name: `Test Trace ${traceIndex}`,
        metadata: { message_index: 1 },
      },
    },
  });

  // 2. LLM call
  const llmTime = addMilliseconds(baseTime, 100);
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: llmTime,
    event_type: "llm_call",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version: version,
    route: route,
    attributes: {
      llm_call: {
        model: "gpt-4",
        input: "Test query",
        output: "Test response",
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        latency_ms: 500,
        finish_reason: "stop",
      },
    },
  });

  // 3. Output
  const outputTime = addMilliseconds(llmTime, 500);
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: outputTime,
    event_type: "output",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version: version,
    route: route,
    attributes: {
      output: {
        final_output: "Test response",
        output_length: 13,
      },
    },
  });

  // 4. Feedback (if not "none")
  if (feedbackType) {
    const feedbackTime = addMilliseconds(outputTime, 100);
    const feedbackEvent = generateFeedbackEvent(
      {
        traceId,
        spanId: rootSpanId,
        timestamp: feedbackTime,
        conversationId,
        sessionId,
        userId,
        agentName,
        version,
        route,
        tenantId,
        projectId,
      },
      feedbackType,
      traceOutcome
    );
    events.push(feedbackEvent);
  }

  // 5. trace_end
  const traceEndTime = addMilliseconds(outputTime, 600);
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: traceEndTime,
    event_type: "trace_end",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version: version,
    route: route,
    attributes: {
      trace_end: {
        total_latency_ms: 600,
        total_tokens: 150,
      },
    },
  });

  // Send events
  try {
    const response = await fetch(`${API_URL}/api/v1/events/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(events),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to send events: ${errorText}`);
    }

    const result = await response.json();
    return {
      traceId,
      feedbackType: feedbackType || "none",
      success: true,
    };
  } catch (error) {
    console.error(`❌ Failed to send trace ${traceIndex}:`, error.message);
    return {
      traceId: null,
      feedbackType: feedbackType || "none",
      success: false,
      error: error.message,
    };
  }
}

async function main() {
  console.log("\n🚀 Generating Test Traces with Feedback");
  console.log("=====================================\n");
  console.log(`Configuration:`);
  console.log(`  Feedback Type: ${FEEDBACK_TYPE}`);
  console.log(`  Number of Traces: ${NUM_TRACES}`);
  console.log(`  API URL: ${API_URL}\n`);

  // Get tenant/project from JWT
  try {
    const jwtParts = JWT_TOKEN.split(".");
    const payload = JSON.parse(Buffer.from(jwtParts[1], "base64").toString());
    const tenantId = payload.tenantId;
    const projectId = payload.projectId;

    console.log(`  Tenant ID: ${tenantId}`);
    console.log(`  Project ID: ${projectId}\n`);

    // Create API key
    console.log("🔑 Creating API key...");
    const apiKey = await getOrCreateApiKey();
    console.log("✅ API key created\n");

    // Generate traces
    console.log(`📤 Generating ${NUM_TRACES} trace(s) with ${FEEDBACK_TYPE} feedback...\n`);

    const results = [];
    for (let i = 1; i <= NUM_TRACES; i++) {
      const result = await generateTraceWithFeedback(apiKey, i, tenantId, projectId);
      results.push(result);
      
      if (result.success) {
        console.log(`✅ Trace ${i}: ${result.traceId} (${result.feedbackType})`);
      } else {
        console.log(`❌ Trace ${i}: Failed - ${result.error}`);
      }
      
      // Small delay between traces
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Summary
    const successful = results.filter((r) => r.success);
    const withFeedback = successful.filter((r) => r.feedbackType !== "none");
    
    console.log(`\n📊 Summary:`);
    console.log(`  Total traces: ${results.length}`);
    console.log(`  Successful: ${successful.length}`);
    console.log(`  With feedback: ${withFeedback.length}`);
    
    if (successful.length > 0) {
      console.log(`\n🔍 View traces at:`);
      console.log(`  ${API_URL.replace('/api', '')}/dashboard/traces`);
      console.log(`\n📝 Trace IDs:`);
      successful.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.traceId} (${r.feedbackType})`);
      });
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();


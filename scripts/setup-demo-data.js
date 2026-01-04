/**
 * Demo Data Setup Script
 * 
 * Creates demo tenant, generates sample traces, sessions, and users for customer demos.
 * 
 * Usage:
 *   node scripts/setup-demo-data.js
 * 
 * Environment Variables:
 *   API_URL - API base URL (default: http://localhost:3000)
 *   DEMO_EMAIL - Email for demo account (default: demo@observa.ai)
 *   DEMO_COMPANY - Company name (default: Demo Company)
 */

import dotenv from "dotenv";
dotenv.config();

const API_URL = process.env.API_URL || "http://localhost:3000";
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@observa.ai";
const DEMO_COMPANY = process.env.DEMO_COMPANY || "Demo Company";

// Configuration for demo data
const CONFIG = {
  numUsers: 5,
  conversationsPerUser: 3,
  messagesPerConversation: 5,
  enableErrors: true,
  enableHighLatency: true,
  enableCostSpikes: true,
};

/**
 * Create demo tenant via onboarding
 */
async function createDemoTenant() {
  console.log("📝 Creating demo tenant...");
  
  try {
    const response = await fetch(`${API_URL}/api/v1/onboarding/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: DEMO_EMAIL,
        companyName: DEMO_COMPANY,
        plan: "free",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      // If tenant already exists, try to get API key via auth
      if (response.status === 409 || error.includes("already exists")) {
        console.log("⚠️  Demo tenant already exists, skipping creation");
        return null;
      }
      throw new Error(`Failed to create tenant: ${response.status} ${error}`);
    }

    const data = await response.json();
    console.log("✅ Demo tenant created");
    console.log(`   Tenant ID: ${data.tenantId}`);
    console.log(`   Project ID: ${data.projectId}`);
    console.log(`   API Key: ${data.apiKey.substring(0, 20)}...`);
    
    return data;
  } catch (error) {
    console.error("❌ Error creating demo tenant:", error.message);
    throw error;
  }
}

/**
 * Generate canonical events for a trace
 */
function generateCanonicalEvents(traceParams) {
  const {
    traceId,
    tenantId,
    projectId,
    userId,
    conversationId,
    sessionId,
    messageIndex,
    enableError,
    enableHighLatency,
    enableCostSpike,
  } = traceParams;

  const events = [];
  const now = new Date().toISOString();
  const rootSpanId = `span-${traceId}-root`;
  
  // Trace start
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: now,
    event_type: "trace_start",
    conversation_id: conversationId || "",
    session_id: sessionId || "",
    user_id: userId || "",
    agent_name: "demo-agent",
    version: "1.0.0",
    route: "/api/chat",
    attributes_json: JSON.stringify({
      trace_start: {
        name: `Demo Trace ${messageIndex}`,
        metadata: {
          demo: true,
          message_index: messageIndex,
        },
      },
    }),
  });

  // Retrieval event
  const retrievalSpanId = `span-${traceId}-retrieval`;
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: "prod",
    trace_id: traceId,
    span_id: retrievalSpanId,
    parent_span_id: rootSpanId,
    timestamp: new Date(Date.now() + 10).toISOString(),
    event_type: "retrieval",
    conversation_id: conversationId || "",
    session_id: sessionId || "",
    user_id: userId || "",
    agent_name: "demo-agent",
    version: "1.0.0",
    route: "/api/chat",
    attributes_json: JSON.stringify({
      retrieval: {
        context_ids: ["doc-1", "doc-2", "doc-3"],
        k: 3,
        latency_ms: 150,
      },
    }),
  });

  // LLM call
  const llmSpanId = `span-${traceId}-llm`;
  const latency = enableHighLatency ? 5000 + Math.random() * 2000 : 500 + Math.random() * 1000;
  const tokensPrompt = 100 + Math.floor(Math.random() * 50);
  const tokensCompletion = enableCostSpike ? 5000 + Math.floor(Math.random() * 2000) : 200 + Math.floor(Math.random() * 100);
  const tokensTotal = tokensPrompt + tokensCompletion;
  
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: "prod",
    trace_id: traceId,
    span_id: llmSpanId,
    parent_span_id: rootSpanId,
    timestamp: new Date(Date.now() + 200).toISOString(),
    event_type: "llm_call",
    conversation_id: conversationId || "",
    session_id: sessionId || "",
    user_id: userId || "",
    agent_name: "demo-agent",
    version: "1.0.0",
    route: "/api/chat",
    attributes_json: JSON.stringify({
      llm_call: {
        model: "gpt-4",
        input: `User question ${messageIndex}: What is the weather today?`,
        output: `The weather is sunny and warm, perfect for outdoor activities.`,
        tokens_prompt: tokensPrompt,
        tokens_completion: tokensCompletion,
        tokens_total: tokensTotal,
        latency_ms: Math.floor(latency),
        cost: (tokensTotal / 1000) * 0.03,
      },
    }),
  });

  // Error event (if enabled)
  if (enableError && Math.random() < 0.2) {
    events.push({
      tenant_id: tenantId,
      project_id: projectId,
      environment: "prod",
      trace_id: traceId,
      span_id: `span-${traceId}-error`,
      parent_span_id: llmSpanId,
      timestamp: new Date(Date.now() + 300).toISOString(),
      event_type: "error",
      conversation_id: conversationId || "",
      session_id: sessionId || "",
      user_id: userId || "",
      agent_name: "demo-agent",
      version: "1.0.0",
      route: "/api/chat",
      attributes_json: JSON.stringify({
        error: {
          error_type: "tool_error",
          error_message: "Tool call timeout",
          stack: "Error: Tool call timeout\n  at toolCall()",
        },
      }),
    });
  }

  // Trace end
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: "prod",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: new Date(Date.now() + Math.floor(latency) + 100).toISOString(),
    event_type: "trace_end",
    conversation_id: conversationId || "",
    session_id: sessionId || "",
    user_id: userId || "",
    agent_name: "demo-agent",
    version: "1.0.0",
    route: "/api/chat",
    attributes_json: JSON.stringify({
      trace_end: {
        status: enableError ? "error" : "success",
      },
    }),
  });

  return events;
}

/**
 * Send events to API
 */
async function sendEvents(events, apiKey) {
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
      const error = await response.text();
      throw new Error(`Failed to send events: ${response.status} ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error sending events:", error.message);
    throw error;
  }
}

/**
 * Generate demo data
 */
async function generateDemoData(tenantData) {
  const { tenantId, projectId, apiKey } = tenantData;
  
  console.log("\n📊 Generating demo data...");
  console.log(`   Users: ${CONFIG.numUsers}`);
  console.log(`   Conversations per user: ${CONFIG.conversationsPerUser}`);
  console.log(`   Messages per conversation: ${CONFIG.messagesPerConversation}`);
  
  let totalTraces = 0;
  const userIds = [];
  const sessionIds = [];
  
  // Generate users
  for (let u = 0; u < CONFIG.numUsers; u++) {
    const userId = `demo-user-${u + 1}`;
    userIds.push(userId);
    
    // Generate conversations per user
    for (let c = 0; c < CONFIG.conversationsPerUser; c++) {
      const conversationId = `conv-${userId}-${c + 1}`;
      const sessionId = `session-${userId}-${c + 1}`;
      sessionIds.push(sessionId);
      
      // Generate messages per conversation
      for (let m = 0; m < CONFIG.messagesPerConversation; m++) {
        const traceId = `trace-${conversationId}-${m + 1}`;
        const enableError = CONFIG.enableErrors && Math.random() < 0.15;
        const enableHighLatency = CONFIG.enableHighLatency && Math.random() < 0.1;
        const enableCostSpike = CONFIG.enableCostSpikes && Math.random() < 0.1;
        
        const events = generateCanonicalEvents({
          traceId,
          tenantId,
          projectId,
          userId,
          conversationId,
          sessionId,
          messageIndex: m + 1,
          enableError,
          enableHighLatency,
          enableCostSpike,
        });
        
        try {
          await sendEvents(events, apiKey);
          totalTraces++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`❌ Failed to send trace ${traceId}:`, error.message);
        }
      }
    }
  }
  
  console.log(`\n✅ Demo data generated:`);
  console.log(`   Total traces: ${totalTraces}`);
  console.log(`   Total users: ${userIds.length}`);
  console.log(`   Total sessions: ${sessionIds.length}`);
  console.log(`   Total conversations: ${CONFIG.numUsers * CONFIG.conversationsPerUser}`);
  
  return {
    totalTraces,
    userIds,
    sessionIds,
    tenantId,
    projectId,
    apiKey,
  };
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Setting up demo data for Observa\n");
  console.log(`API URL: ${API_URL}`);
  console.log(`Demo Email: ${DEMO_EMAIL}`);
  console.log(`Demo Company: ${DEMO_COMPANY}\n`);
  
  try {
    // Create demo tenant
    let tenantData = await createDemoTenant();
    
    if (!tenantData) {
      console.log("\n⚠️  Demo tenant already exists. To create new data:");
      console.log("   1. Use existing API key, or");
      console.log("   2. Create new tenant with different email");
      console.log("\n   Example: DEMO_EMAIL=demo2@observa.ai node scripts/setup-demo-data.js");
      return;
    }
    
    // Generate demo data
    const demoData = await generateDemoData(tenantData);
    
    console.log("\n✅ Demo data setup complete!");
    console.log("\n📋 Summary:");
    console.log(`   Tenant ID: ${demoData.tenantId}`);
    console.log(`   Project ID: ${demoData.projectId}`);
    console.log(`   API Key: ${demoData.apiKey.substring(0, 30)}...`);
    console.log(`   Total Traces: ${demoData.totalTraces}`);
    console.log(`   Users: ${demoData.userIds.length}`);
    console.log(`   Sessions: ${demoData.sessionIds.length}`);
    
    console.log("\n🎯 Next Steps:");
    console.log("   1. Log in to dashboard with:", DEMO_EMAIL);
    console.log("   2. View traces, sessions, users, and costs");
    console.log("   3. Check dashboard overview for metrics");
    console.log("   4. Explore issues timeline for detected problems");
    
  } catch (error) {
    console.error("\n❌ Error setting up demo data:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, createDemoTenant, generateDemoData };



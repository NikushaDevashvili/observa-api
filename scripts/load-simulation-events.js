/**
 * Comprehensive Load Simulation Script - Canonical Events Version
 *
 * Simulates a company with heavy logging using canonical events format.
 * Creates rich, hierarchical traces with tool calls, retrieval events, and timeline structure.
 *
 * Usage:
 *   node scripts/load-simulation-events.js <JWT_TOKEN>
 *
 * Or with environment variables:
 *   JWT_TOKEN=your_token API_URL=http://localhost:3000 node scripts/load-simulation-events.js
 */

const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;
const API_URL = process.env.API_URL || "http://localhost:3000";
// API_KEY can be provided directly (sk_ or pk_ prefix) to skip creation
const PROVIDED_API_KEY = process.env.API_KEY;

// Configuration
const CONFIG = {
  numUsers: parseInt(process.env.NUM_USERS || "10"),
  conversationsPerUser: parseInt(process.env.CONVERSATIONS_PER_USER || "3"),
  minMessagesPerConversation: parseInt(process.env.MIN_MESSAGES || "5"),
  maxMessagesPerConversation: parseInt(process.env.MAX_MESSAGES || "10"),
  rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || "100"),
  enableErrors: process.env.ENABLE_ERRORS !== "false",
  enableHallucinations: process.env.ENABLE_HALLUCINATIONS !== "false",
  concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS || "5"),
  // Phase 4: Enhanced configuration
  errorRate: parseFloat(process.env.ERROR_RATE || "0.25"), // 25% error rate (increased for better visibility)
  feedbackRate: parseFloat(process.env.FEEDBACK_RATE || "0.10"), // 10% feedback
  multiLLMRate: parseFloat(process.env.MULTI_LLM_RATE || "0.20"), // 20% multi-LLM traces
  maxToolsPerTrace: parseInt(process.env.MAX_TOOLS_PER_TRACE || "4"),
  maxRetrievalsPerTrace: parseInt(process.env.MAX_RETRIEVALS_PER_TRACE || "3"),
  enableStreaming: process.env.ENABLE_STREAMING !== "false",
  enableCostCalculation: process.env.ENABLE_COST_CALCULATION !== "false",
  // Issue generation rates (integrated from generate-issues-test-data.js)
  highLatencyRate: parseFloat(process.env.HIGH_LATENCY_RATE || "0.15"), // 15% high latency LLM calls
  costSpikeRate: parseFloat(process.env.COST_SPIKE_RATE || "0.10"), // 10% cost spikes
  tokenSpikeRate: parseFloat(process.env.TOKEN_SPIKE_RATE || "0.10"), // 10% token spikes
  toolTimeoutRate: parseFloat(process.env.TOOL_TIMEOUT_RATE || "0.15"), // 15% tool timeouts
};

if (!JWT_TOKEN) {
  console.error("❌ Error: JWT_TOKEN is required");
  console.error("Usage: node scripts/load-simulation-events.js <JWT_TOKEN>");
  console.error(
    "   or: JWT_TOKEN=your_token node scripts/load-simulation-events.js"
  );
  process.exit(1);
}

// Extract tenant/project from JWT (basic decode, no validation)
let tenantId, projectId, API_KEY;
try {
  const payload = JSON.parse(
    Buffer.from(JWT_TOKEN.split(".")[1], "base64").toString()
  );
  tenantId = payload.tenantId;
  projectId = payload.projectId;
} catch (e) {
  console.error(
    "❌ Error: Could not extract tenantId/projectId from JWT token"
  );
  process.exit(1);
}

// Function to get or create an API key
async function getOrCreateApiKey() {
  // Check if API_KEY is provided via environment variable
  if (
    process.env.API_KEY &&
    (process.env.API_KEY.startsWith("sk_") ||
      process.env.API_KEY.startsWith("pk_"))
  ) {
    console.log("✅ Using API key from environment variable\n");
    return process.env.API_KEY;
  }

  // Try to create a new API key using JWT token
  try {
    console.log("🔑 Creating API key for events endpoint...");
    const response = await fetch(
      `${API_URL}/api/v1/tenants/${tenantId}/api-keys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${JWT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Load Simulation Key - ${new Date().toISOString()}`,
          keyPrefix: "sk_",
          projectId: projectId,
          scopes: {
            ingest: true,
            query: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { error: text.substring(0, 200) };
      }

      if (response.status === 404 || text.includes("<!DOCTYPE")) {
        console.error(
          "\n❌ API key creation endpoint not found. This endpoint needs to be deployed first."
        );
        console.error(
          "\n💡 Workaround: Create an API key manually or set API_KEY environment variable:"
        );
        console.error(
          `   API_KEY=sk_... node scripts/load-simulation-events.js ${JWT_TOKEN}`
        );
        console.error("\n   Or wait for the new endpoint to be deployed.\n");
        throw new Error("API key creation endpoint not available");
      }

      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.apiKey) {
      console.log("✅ API key created successfully!");
      console.log(`   Key: ${data.apiKey.substring(0, 20)}...`);
      console.log("   (Store this key securely - it won't be shown again)\n");
      return data.apiKey;
    } else {
      throw new Error("API key not returned in response");
    }
  } catch (error) {
    if (error.message.includes("not available")) {
      throw error;
    }
    console.error("❌ Error creating API key:", error.message);
    console.error(
      "\n💡 To use the events endpoint, you need an API key (sk_ or pk_)"
    );
    console.error("   Set API_KEY environment variable:");
    console.error(
      `   API_KEY=sk_... node scripts/load-simulation-events.js ${JWT_TOKEN}\n`
    );
    throw error;
  }
}

// Statistics tracking (enhanced)
const stats = {
  total: 0,
  success: 0,
  errors: 0,
  startTime: Date.now(),
  conversationIds: new Set(),
  userIds: new Set(),
  errorsByType: {},
  // Phase 4: Enhanced statistics
  errorEventsByType: {},
  feedbackEventsByType: {},
  toolCounts: [],
  llmCallCounts: [],
  finishReasonDistribution: {},
  retrievalCounts: [],
};

// Conversation templates
const CONVERSATION_TEMPLATES = [
  {
    name: "Customer Support",
    queries: [
      "I need help with my order #12345",
      "When will it be delivered?",
      "Can I change the shipping address?",
      "What is your refund policy?",
      "I want to cancel my order",
    ],
    contexts: [
      "[CONTEXT] Order Information: Order #12345 was placed on 2024-01-15. Status: Processing. Estimated delivery: 2024-01-20.",
      "[CONTEXT] Shipping Policy: Standard shipping takes 5-7 business days. Express shipping (2-3 days) available.",
      "[CONTEXT] Refund Policy: Full refunds available within 30 days of purchase. Items must be in original condition.",
    ],
    responses: [
      "I can help you with order #12345. It was placed on January 15th and is currently being processed.",
      "Your order is estimated to arrive on January 20th. You'll receive a tracking number via email once it ships.",
      "Yes, you can change the shipping address if the order hasn't shipped yet. Let me update that for you.",
      "We offer full refunds within 30 days of purchase for items in original condition. Processing takes 5-10 business days.",
      "I can help you cancel order #12345. Since it's still processing, the cancellation should complete within 24 hours.",
    ],
    tools: [
      "get_order_status",
      "update_shipping",
      "process_refund",
      "cancel_order",
    ],
  },
  {
    name: "Technical Support",
    queries: [
      "How do I reset my password?",
      "I'm getting an error when trying to login",
      "Can you explain the API rate limits?",
      "How do I integrate your SDK?",
    ],
    contexts: [
      "[CONTEXT] Authentication: Password reset requires email verification. Tokens expire after 1 hour.",
      "[CONTEXT] API Documentation: Rate limits: 1000 requests/hour per API key. SDK integration requires Node.js 18+.",
      "[CONTEXT] Error Handling: All API errors return standard HTTP status codes. 429 indicates rate limit exceeded.",
    ],
    responses: [
      'You can reset your password by clicking "Forgot Password" on the login page. You\'ll receive an email with a reset link.',
      "Let me help you troubleshoot the login issue. Are you using the correct email and password?",
      "API rate limits are 1000 requests per hour per API key. If you exceed this, you'll receive a 429 status code.",
      "To integrate our SDK, install it via npm and initialize with your API key. Detailed documentation is available.",
    ],
    tools: ["verify_user", "check_api_usage", "generate_docs_link"],
  },
  {
    name: "Product Inquiry",
    queries: [
      "What features does the premium plan include?",
      "How does your analytics compare to competitors?",
      "Can I try the product before purchasing?",
      "What integrations do you support?",
    ],
    contexts: [
      "[CONTEXT] Pricing: Free plan includes basic features. Premium plan ($99/month) includes advanced analytics.",
      "[CONTEXT] Features: Real-time analytics, custom dashboards, webhook integrations, REST API, SDK support.",
      "[CONTEXT] Trial: 14-day free trial available for premium plan. No credit card required.",
    ],
    responses: [
      "The premium plan includes advanced analytics, priority support, API access, custom dashboards, and webhook integrations.",
      "Our analytics platform offers real-time insights, custom dashboards, and extensive integrations.",
      "Yes! We offer a 14-day free trial of the premium plan with no credit card required.",
      "We support integrations with Slack, Discord, webhooks, REST API, and SDKs for JavaScript, Python, and Go.",
    ],
    tools: ["get_pricing_info", "fetch_feature_list", "check_integrations"],
  },
];

// Extended tool types for multiple tool calls
const EXTENDED_TOOLS = [
  "database_query",
  "api_call",
  "calculator",
  "file_reader",
  "email_sender",
  "web_search",
  "get_order_status",
  "update_shipping",
  "process_refund",
  "cancel_order",
  "verify_user",
  "check_api_usage",
  "generate_docs_link",
  "get_pricing_info",
  "fetch_feature_list",
  "check_integrations",
];

// Error templates for error event generation
const ERROR_TEMPLATES = {
  tool_error: {
    error_type: "tool_error",
    messages: [
      "Database connection timeout",
      "API endpoint returned 503",
      "File not found",
      "Invalid parameters",
      "Rate limit exceeded",
    ],
    stack_traces: [
      "Error: Connection timeout\n    at Database.query (db.js:45:12)\n    at Tool.call (tool.js:23:5)",
      "Error: API Error 503\n    at fetch (api.js:67:8)\n    at Tool.execute (tool.js:34:2)",
    ],
  },
  llm_error: {
    error_type: "llm_error",
    messages: [
      "OpenAI API error: Rate limit exceeded",
      "Anthropic API error: Invalid request",
      "Model overloaded, please retry",
      "Authentication failed",
    ],
    stack_traces: [
      "Error: Rate limit exceeded\n    at LLMClient.call (llm.js:123:45)",
      "Error: Invalid request\n    at AnthropicClient.generate (client.js:89:12)",
    ],
  },
  retrieval_error: {
    error_type: "retrieval_error",
    messages: [
      "Vector database query failed",
      "Embedding service unavailable",
      "No matching documents found",
      "Index corruption detected",
    ],
    stack_traces: [
      "Error: Query failed\n    at VectorDB.query (vectordb.js:78:12)",
      "Error: Service unavailable\n    at EmbeddingService.get (embedding.js:45:8)",
    ],
  },
  timeout_error: {
    error_type: "timeout_error",
    messages: [
      "Request timeout after 30s",
      "Operation timed out",
      "Connection timeout",
    ],
    stack_traces: [
      "Error: Timeout after 30000ms\n    at setTimeout (timers.js:456:11)",
      "Error: Connection timeout\n    at Socket.connect (net.js:234:15)",
    ],
  },
};

// Agent names and metadata
const AGENT_NAMES = [
  "customer_support_agent",
  "code_assistant",
  "data_analyst",
  "product_inquiry_agent",
  "technical_support_agent",
];

const VERSIONS = ["v1.0.0", "v1.2.3", "v2.0.0", "v2.1.0"];

const ROUTES = ["/api/chat", "/api/agent", "/api/assistant", "/api/v1/chat"];

// Finish reasons with distribution
const FINISH_REASONS = [
  { reason: "stop", weight: 90 },
  { reason: "length", weight: 5 },
  { reason: "tool_calls", weight: 3 },
  { reason: "content_filter", weight: 1 },
  { reason: "error", weight: 1 },
];

function selectFinishReason() {
  const total = FINISH_REASONS.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * total;
  for (const item of FINISH_REASONS) {
    random -= item.weight;
    if (random <= 0) return item.reason;
  }
  return "stop";
}

// Model configuration with pricing (for cost calculation)
const MODELS = [
  {
    name: "gpt-4o-mini",
    avgPromptTokens: 150,
    avgCompletionTokens: 80,
    inputPricePer1K: 0.15 / 1000, // $0.15 per 1M tokens = $0.00015 per 1K
    outputPricePer1K: 0.6 / 1000, // $0.6 per 1M tokens = $0.0006 per 1K
  },
  {
    name: "gpt-4o",
    avgPromptTokens: 300,
    avgCompletionTokens: 200,
    inputPricePer1K: 0.005, // $5 per 1M tokens
    outputPricePer1K: 0.015, // $15 per 1M tokens
  },
  {
    name: "gpt-4-turbo",
    avgPromptTokens: 400,
    avgCompletionTokens: 300,
    inputPricePer1K: 0.01,
    outputPricePer1K: 0.03,
  },
  {
    name: "claude-3-opus",
    avgPromptTokens: 350,
    avgCompletionTokens: 250,
    inputPricePer1K: 0.015,
    outputPricePer1K: 0.075,
  },
];

// Utility functions
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addMilliseconds(isoString, ms) {
  return new Date(new Date(isoString).getTime() + ms).toISOString();
}

// Phase 1.5 & Phase 3.3: Cost calculation
function calculateCost(tokensPrompt, tokensCompletion, modelName) {
  if (!CONFIG.enableCostCalculation) return null;

  const modelConfig = MODELS.find((m) => m.name === modelName) || MODELS[0];
  if (!modelConfig.inputPricePer1K || !modelConfig.outputPricePer1K) {
    return null;
  }

  const inputCost = (tokensPrompt / 1000) * modelConfig.inputPricePer1K;
  const outputCost = (tokensCompletion / 1000) * modelConfig.outputPricePer1K;
  return parseFloat((inputCost + outputCost).toFixed(6));
}

// Phase 1.1: Generate error event
function generateErrorEvent(params) {
  const {
    traceId,
    spanId,
    parentSpanId,
    timestamp,
    errorType,
    conversationId,
    sessionId,
    userId,
    agentName,
    version,
    route,
  } = params;

  const template = ERROR_TEMPLATES[errorType] || ERROR_TEMPLATES.tool_error;
  const errorMessage = randomChoice(template.messages);
  const stackTrace = randomChoice(template.stack_traces);

  return {
    tenant_id: tenantId,
    project_id: projectId,
    environment: Math.random() > 0.2 ? "prod" : "dev",
    trace_id: traceId,
    span_id: generateUUID(),
    parent_span_id: spanId,
    timestamp: timestamp,
    event_type: "error",
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version: version,
    route: route,
    attributes: {
      error: {
        error_type: template.error_type,
        error_message: errorMessage,
        stack_trace: stackTrace,
        context: {
          span_id: spanId,
          parent_span_id: parentSpanId,
          occurred_at: timestamp,
        },
      },
    },
  };
}

// Phase 1.2: Generate feedback event
function generateFeedbackEvent(params) {
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

  const feedbackTypes = ["like", "dislike", "rating", "correction"];
  const feedbackType = randomChoice(feedbackTypes);
  const outcome = randomChoice(["success", "failure", "partial"]);

  const attributes = {
    feedback: {
      type: feedbackType,
      outcome: outcome,
      comment: Math.random() > 0.5 ? "User feedback comment" : null,
    },
  };

  if (feedbackType === "rating") {
    attributes.feedback.rating = randomInt(1, 5);
  }

  return {
    tenant_id: tenantId,
    project_id: projectId,
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

// Helper to create base event metadata
function createBaseEventMetadata(
  traceId,
  spanId,
  parentSpanId,
  timestamp,
  conversationId,
  sessionId,
  userId,
  agentName,
  version,
  route,
  environment
) {
  return {
    tenant_id: tenantId,
    project_id: projectId,
    environment: environment || (Math.random() > 0.2 ? "prod" : "dev"),
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: parentSpanId,
    timestamp: timestamp,
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    agent_name: agentName,
    version: version,
    route: route,
  };
}

// Simple hash function for simulating hashes
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 16);
}

function generateCanonicalEvents(params) {
  const {
    traceId,
    conversationId,
    sessionId,
    userId,
    messageIndex,
    template,
    queryIndex,
    model,
  } = params;

  const query = template.queries[queryIndex % template.queries.length];
  const contexts = template.contexts || [];
  let response = template.responses[queryIndex % template.responses.length];

  // Phase 2.4: Add metadata
  const agentName = randomChoice(AGENT_NAMES);
  const version = randomChoice(VERSIONS);
  const route = randomChoice(ROUTES);
  const environment = Math.random() > 0.2 ? "prod" : "dev";

  // Check for hallucination
  if (CONFIG.enableHallucinations && Math.random() < 0.03) {
    response = "Your order #12345 has been delivered yesterday."; // Wrong answer
  }

  // Phase 2: Determine if multi-LLM trace
  const isMultiLLM = Math.random() < CONFIG.multiLLMRate;
  const numLLMCalls = isMultiLLM ? randomInt(2, 3) : 1;

  // Phase 1.4: Determine number of retrievals (1-3)
  const numRetrievals = randomInt(1, CONFIG.maxRetrievalsPerTrace);

  // Phase 1.3: Determine number of tools (1-4)
  const numTools = randomInt(1, CONFIG.maxToolsPerTrace);
  const useParallelTools = Math.random() > 0.5 && numTools > 1;

  const rootSpanId = generateUUID();
  const baseTime = new Date().toISOString();
  const events = [];

  // Phase 1.1: Track errors for statistics
  let hasError = false;
  let errorType = null;

  // Phase 1.5: Calculate base latencies
  const baseTotalLatency = randomInt(800, 2000);
  const baseRetrievalLatency = randomInt(50, 200);
  const baseToolCallLatency = randomInt(100, 500);
  const baseLLMLatency =
    baseTotalLatency - baseRetrievalLatency - baseToolCallLatency;

  // Calculate total latency accounting for multiple operations
  const totalRetrievalLatency = baseRetrievalLatency * numRetrievals;
  const totalToolLatency =
    baseToolCallLatency * (useParallelTools ? 1 : numTools);
  const totalLLMLatency = baseLLMLatency * numLLMCalls;
  const totalLatency =
    totalRetrievalLatency + totalToolLatency + totalLLMLatency + 100; // buffer

  let currentTime = baseTime;
  let cumulativeLatency = 0;

  // 1. trace_start event (Phase 2.4: with metadata)
  events.push({
    ...createBaseEventMetadata(
      traceId,
      rootSpanId,
      null,
      currentTime,
      conversationId,
      sessionId,
      userId,
      agentName,
      version,
      route,
      environment
    ),
    event_type: "trace_start",
    attributes: {
      trace_start: {
        name: `Conversation Message ${messageIndex}`,
        metadata: {
          message_index: messageIndex,
        },
      },
    },
  });

  // Phase 1.4: Multiple retrieval events
  const retrievalSpanIds = [];
  const retrievalResults = [];
  for (let i = 0; i < numRetrievals; i++) {
    const retrievalSpanId = i === 0 ? rootSpanId : generateUUID();
    retrievalSpanIds.push(retrievalSpanId);

    const retrievalLatency = baseRetrievalLatency + randomInt(-20, 20);
    currentTime = addMilliseconds(baseTime, cumulativeLatency + 10);
    cumulativeLatency += retrievalLatency;

    const context = randomChoice(
      contexts.length > 0 ? contexts : ["[CONTEXT] Default context text"]
    );
    const contextIds = [
      `ctx-${generateUUID().substring(0, 8)}`,
      `ctx-${generateUUID().substring(0, 8)}`,
    ];
    const contextHashes = contextIds.map((id) => simpleHash(id + context));
    const k = randomInt(3, 8);
    const similarityScores = Array.from(
      { length: k },
      () => Math.random() * 0.3 + 0.7
    ).sort((a, b) => b - a);

    retrievalResults.push({ context, contextIds, contextHashes });

    // Phase 1.1: Check for retrieval error
    const retrievalError =
      CONFIG.enableErrors && Math.random() < CONFIG.errorRate * 0.6; // 60% of error rate for retrieval (15% at 25% base)

    if (!retrievalError) {
      events.push({
        ...createBaseEventMetadata(
          traceId,
          retrievalSpanId,
          i === 0 ? null : rootSpanId,
          currentTime,
          conversationId,
          sessionId,
          userId,
          agentName,
          version,
          route,
          environment
        ),
        event_type: "retrieval",
        attributes: {
          retrieval: {
            retrieval_context_ids: contextIds,
            retrieval_context_hashes: contextHashes,
            k: k,
            top_k: k,
            latency_ms: retrievalLatency,
            similarity_scores: similarityScores,
          },
        },
      });
    } else {
      hasError = true;
      errorType = "retrieval_error";
      const errorEvent = generateErrorEvent({
        traceId,
        spanId: retrievalSpanId,
        parentSpanId: i === 0 ? null : rootSpanId,
        timestamp: currentTime,
        errorType: "retrieval_error",
        conversationId,
        sessionId,
        userId,
        agentName,
        version,
        route,
      });
      events.push(errorEvent);
    }
  }

  // Phase 1.3: Multiple tool calls
  const toolSpanIds = [];
  const toolResults = [];
  let toolStartOffset = cumulativeLatency + 20;

  for (let i = 0; i < numTools; i++) {
    const toolSpanId = generateUUID();
    toolSpanIds.push(toolSpanId);

    const toolName = randomChoice(EXTENDED_TOOLS);
    const toolArgs = {
      query: query.substring(0, 50),
      limit: randomInt(5, 20),
      ...(toolName === "database_query" ? { table: "orders" } : {}),
      ...(toolName === "api_call" ? { endpoint: "/api/v1/data" } : {}),
    };

    // Phase 1.1: Check for tool error or timeout
    // Integrated issue generation: tool timeouts are now configurable
    const toolErrorProb = CONFIG.enableErrors ? CONFIG.errorRate * 0.7 : 0; // 70% of error rate for tools (17.5% at 25% base)
    const toolError = Math.random() < toolErrorProb;
    // Use dedicated tool timeout rate if configured, otherwise use error-based logic
    const toolTimeout = toolError
      ? CONFIG.toolTimeoutRate > 0
        ? Math.random() < CONFIG.toolTimeoutRate
        : Math.random() < 0.4
      : Math.random() < CONFIG.toolTimeoutRate; // Can have timeouts without errors
    const resultStatus = toolTimeout
      ? "timeout"
      : toolError
      ? "error"
      : "success";

    // Tool timeout: if timeout, use very high latency (30s+)
    const toolLatency = toolTimeout
      ? randomInt(30000, 35000) // 30-35 seconds for timeout
      : baseToolCallLatency + randomInt(-50, 50);
    const toolStartTime = addMilliseconds(baseTime, toolStartOffset);
    const toolEndTime = addMilliseconds(toolStartTime, toolLatency);

    if (!useParallelTools) {
      toolStartOffset += toolLatency + 10;
    }

    if (toolError) {
      hasError = true;
      errorType = toolTimeout ? "timeout_error" : "tool_error";
    }

    const toolResult = toolError
      ? null
      : {
          data: retrievalResults[0]?.context || "[DATA] Tool result data",
          items_found: randomInt(1, 10),
        };

    events.push({
      ...createBaseEventMetadata(
        traceId,
        toolSpanId,
        rootSpanId,
        toolStartTime,
        conversationId,
        sessionId,
        userId,
        agentName,
        version,
        route,
        environment
      ),
      event_type: "tool_call",
      attributes: {
        tool_call: {
          tool_name: toolName,
          args: toolArgs,
          args_hash: simpleHash(JSON.stringify(toolArgs)),
          result_status: resultStatus,
          result: toolResult,
          latency_ms: toolLatency,
          error_message: toolError
            ? toolTimeout
              ? "Request timeout after 30s"
              : "Tool execution failed"
            : null,
        },
      },
    });

    // Phase 1.1: Generate error event if tool failed
    if (toolError) {
      const errorEvent = generateErrorEvent({
        traceId,
        spanId: toolSpanId,
        parentSpanId: rootSpanId,
        timestamp: toolEndTime,
        errorType: toolTimeout ? "timeout_error" : "tool_error",
        conversationId,
        sessionId,
        userId,
        agentName,
        version,
        route,
      });
      events.push(errorEvent);
    }

    toolResults.push(toolResult);
  }

  // Phase 2.1: Multiple LLM calls (agentic workflows)
  let llmStartOffset = toolStartOffset + 30;
  const llmCallResults = [];
  let totalTokensAll = 0;
  let totalCostAll = 0;

  for (let llmIndex = 0; llmIndex < numLLMCalls; llmIndex++) {
    const llmSpanId = llmIndex === 0 ? rootSpanId : generateUUID();
    const llmModel =
      llmIndex === 0
        ? model
        : llmIndex === 1 && numLLMCalls > 1
        ? randomChoice(MODELS).name
        : model;
    const modelConfig = MODELS.find((m) => m.name === llmModel) || MODELS[0];

    // Phase 2.2: Complex span hierarchies - nested tools within LLM calls (30% chance)
    const hasNestedTools = Math.random() < 0.3 && llmIndex > 0;
    const numNestedTools = hasNestedTools ? randomInt(1, 2) : 0;
    const nestedToolSpanIds = [];

    // Integrated issue generation: token spikes, cost spikes, high latency
    const hasTokenSpike = Math.random() < CONFIG.tokenSpikeRate;
    const hasCostSpike = Math.random() < CONFIG.costSpikeRate;
    const hasHighLatency = Math.random() < CONFIG.highLatencyRate;

    // Token spike: dramatically increase token counts
    const tokensPrompt = hasTokenSpike
      ? randomInt(80000, 150000) // 80k-150k tokens for spike
      : modelConfig.avgPromptTokens + randomInt(-50, 100);
    const tokensCompletion = hasTokenSpike
      ? randomInt(50000, 100000) // 50k-100k tokens for spike
      : modelConfig.avgCompletionTokens + randomInt(-30, 80);
    const tokensTotal = tokensPrompt + tokensCompletion;
    totalTokensAll += tokensTotal;

    // Cost spike: use expensive model and/or boost cost
    let selectedModel = llmModel;
    if (hasCostSpike) {
      // Use most expensive model for cost spikes
      selectedModel = "gpt-4o"; // Most expensive
    }
    const modelConfigForCost =
      MODELS.find((m) => m.name === selectedModel) || modelConfig;

    // Phase 1.5 & Phase 3.3: Cost calculation
    let cost = calculateCost(tokensPrompt, tokensCompletion, selectedModel);
    if (hasCostSpike && cost) {
      // Boost cost by 5-15x for spikes
      cost = cost * randomInt(5, 15);
    }
    if (cost) totalCostAll += cost;

    // High latency: dramatically increase latency
    const llmLatency = hasHighLatency
      ? randomInt(6000, 12000) // 6-12 seconds for high latency
      : baseLLMLatency + randomInt(-100, 100);

    // Phase 3.2: Streaming simulation
    const timeToFirstToken = CONFIG.enableStreaming ? randomInt(50, 300) : null;
    const streamingDuration =
      timeToFirstToken && CONFIG.enableStreaming
        ? Math.max(llmLatency - timeToFirstToken, 0)
        : null;

    // Phase 2.3: Different finish reasons
    const finishReason = selectFinishReason();

    const llmInput =
      llmIndex === 0 ? query : llmCallResults[llmIndex - 1]?.output || query;
    const llmOutput =
      llmIndex === numLLMCalls - 1
        ? response
        : `Intermediate response ${llmIndex + 1}: ${response.substring(
            0,
            100
          )}...`;

    llmCallResults.push({ output: llmOutput, tokens: tokensTotal });

    const llmStartTime = addMilliseconds(baseTime, llmStartOffset);

    // Phase 2.2: Generate nested tools within LLM call (complex hierarchy level 2-3)
    if (hasNestedTools) {
      const nestedToolStartOffset = llmStartOffset + 50;
      for (let nestedIdx = 0; nestedIdx < numNestedTools; nestedIdx++) {
        const nestedToolSpanId = generateUUID();
        nestedToolSpanIds.push(nestedToolSpanId);
        const nestedToolLatency = randomInt(50, 200);
        const nestedToolStartTime = addMilliseconds(
          baseTime,
          nestedToolStartOffset + nestedIdx * 60
        );
        const nestedToolName = randomChoice(EXTENDED_TOOLS);
        const nestedToolArgs = {
          query: llmInput.substring(0, 30),
          nested: true,
        };

        // Phase 2.2: Nested retrieval within nested tool (complex hierarchy level 3-4, 20% chance)
        const hasNestedRetrieval = Math.random() < 0.2;
        if (hasNestedRetrieval) {
          const nestedRetrievalSpanId = generateUUID();
          const nestedRetrievalTime = addMilliseconds(nestedToolStartTime, 5);
          const nestedRetrievalLatency = randomInt(20, 100);
          const nestedContext = randomChoice(
            contexts.length > 0
              ? contexts
              : ["[NESTED_CONTEXT] Nested retrieval context"]
          );
          const nestedContextIds = [
            `nested-ctx-${generateUUID().substring(0, 8)}`,
          ];

          events.push({
            ...createBaseEventMetadata(
              traceId,
              nestedRetrievalSpanId,
              nestedToolSpanId,
              nestedRetrievalTime,
              conversationId,
              sessionId,
              userId,
              agentName,
              version,
              route,
              environment
            ),
            event_type: "retrieval",
            attributes: {
              retrieval: {
                retrieval_context_ids: nestedContextIds,
                retrieval_context_hashes: [
                  simpleHash(nestedContextIds[0] + nestedContext),
                ],
                k: 3,
                top_k: 3,
                latency_ms: nestedRetrievalLatency,
                similarity_scores: [0.92, 0.88, 0.85],
              },
            },
          });
        }

        events.push({
          ...createBaseEventMetadata(
            traceId,
            nestedToolSpanId,
            llmSpanId,
            nestedToolStartTime,
            conversationId,
            sessionId,
            userId,
            agentName,
            version,
            route,
            environment
          ),
          event_type: "tool_call",
          attributes: {
            tool_call: {
              tool_name: nestedToolName,
              args: nestedToolArgs,
              args_hash: simpleHash(JSON.stringify(nestedToolArgs)),
              result_status: "success",
              result: { nested_data: "[DATA] Nested tool result" },
              latency_ms: nestedToolLatency,
            },
          },
        });
      }
    }

    llmStartOffset += llmLatency + 20;

    // Phase 1.1: Check for LLM error (don't require finish_reason === "error" for better visibility)
    const llmError =
      CONFIG.enableErrors && Math.random() < CONFIG.errorRate * 0.5; // 50% of error rate for LLM (12.5% at 25% base)

    if (!llmError) {
      events.push({
        ...createBaseEventMetadata(
          traceId,
          llmSpanId,
          llmIndex === 0 ? null : rootSpanId,
          llmStartTime,
          conversationId,
          sessionId,
          userId,
          agentName,
          version,
          route,
          environment
        ),
        event_type: "llm_call",
        attributes: {
          llm_call: {
            model: selectedModel, // Use selectedModel (may be gpt-4o for cost spikes)
            prompt_template_id: `template_v${randomInt(1, 3)}`,
            input: llmInput,
            output: llmOutput,
            input_tokens: tokensPrompt,
            output_tokens: tokensCompletion,
            total_tokens: tokensTotal,
            latency_ms: llmLatency,
            cost: cost,
            temperature: 0.7,
            max_tokens: 1000,
            finish_reason: finishReason,
            response_id: `resp_${generateUUID().substring(0, 16)}`,
            system_fingerprint: `fp_${simpleHash(llmModel)}`,
            time_to_first_token_ms: timeToFirstToken,
            streaming_duration_ms: streamingDuration,
            input_hash: Math.random() > 0.8 ? simpleHash(llmInput) : null,
            output_hash: Math.random() > 0.8 ? simpleHash(llmOutput) : null,
          },
        },
      });
    } else {
      hasError = true;
      errorType = "llm_error";
      const errorEvent = generateErrorEvent({
        traceId,
        spanId: llmSpanId,
        parentSpanId: llmIndex === 0 ? null : rootSpanId,
        timestamp: llmStartTime,
        errorType: "llm_error",
        conversationId,
        sessionId,
        userId,
        agentName,
        version,
        route,
      });
      events.push(errorEvent);
    }
  }

  // Phase 1.2: Output event
  const outputTime = addMilliseconds(baseTime, totalLatency - 50);
  const finalOutput =
    llmCallResults.length > 0
      ? llmCallResults[llmCallResults.length - 1].output
      : response;

  events.push({
    ...createBaseEventMetadata(
      traceId,
      rootSpanId,
      null,
      outputTime,
      conversationId,
      sessionId,
      userId,
      agentName,
      version,
      route,
      environment
    ),
    event_type: "output",
    attributes: {
      output: {
        final_output: finalOutput,
        final_output_hash: Math.random() > 0.8 ? simpleHash(finalOutput) : null,
        output_length: finalOutput.length,
      },
    },
  });

  // Phase 1.2: Feedback event (conditional)
  if (Math.random() < CONFIG.feedbackRate) {
    const feedbackTime = addMilliseconds(outputTime, 100);
    const feedbackEvent = generateFeedbackEvent({
      traceId,
      spanId: rootSpanId,
      timestamp: feedbackTime,
      conversationId,
      sessionId,
      userId,
      agentName,
      version,
      route,
    });
    events.push(feedbackEvent);

    // Phase 4: Track feedback statistics
    const feedbackType = feedbackEvent.attributes.feedback.type;
    stats.feedbackEventsByType[feedbackType] =
      (stats.feedbackEventsByType[feedbackType] || 0) + 1;
  }

  // Phase 1.1 & Phase 2.3: trace_end event with outcome
  const endTime = addMilliseconds(baseTime, totalLatency);
  const traceOutcome = hasError ? "error" : "success";

  events.push({
    ...createBaseEventMetadata(
      traceId,
      rootSpanId,
      null,
      endTime,
      conversationId,
      sessionId,
      userId,
      agentName,
      version,
      route,
      environment
    ),
    event_type: "trace_end",
    attributes: {
      trace_end: {
        total_latency_ms: totalLatency,
        total_cost:
          totalCostAll > 0 ? parseFloat(totalCostAll.toFixed(6)) : null,
        total_tokens: totalTokensAll,
        outcome: traceOutcome,
      },
    },
  });

  // Phase 4: Update statistics
  stats.toolCounts.push(numTools);
  stats.llmCallCounts.push(numLLMCalls);
  stats.retrievalCounts.push(numRetrievals);
  if (errorType) {
    stats.errorEventsByType[errorType] =
      (stats.errorEventsByType[errorType] || 0) + 1;
  }
  const lastLLMCall = events.filter((e) => e.event_type === "llm_call").pop();
  if (lastLLMCall?.attributes?.llm_call?.finish_reason) {
    const reason = lastLLMCall.attributes.llm_call.finish_reason;
    stats.finishReasonDistribution[reason] =
      (stats.finishReasonDistribution[reason] || 0) + 1;
  }

  return events;
}

async function sendEvents(events, apiKey, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${API_URL}/api/v1/events/ingest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(events),
      });

      const data = await response.json();

      if (response.ok) {
        stats.success += events.length;
        return { success: true, data };
      } else {
        const errorType = `${response.status}_${data.error?.code || "unknown"}`;
        stats.errorsByType[errorType] =
          (stats.errorsByType[errorType] || 0) + 1;

        // Log validation errors for debugging
        if (response.status === 422 && data.error?.details?.validation_errors) {
          console.error(
            "❌ Validation errors:",
            JSON.stringify(data.error.details.validation_errors, null, 2)
          );
        }

        if (response.status >= 500 && attempt < retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1))
          );
          continue;
        }

        stats.errors += events.length;
        return { success: false, error: data, status: response.status };
      }
    } catch (error) {
      if (attempt < retries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
        continue;
      }
      stats.errors += events.length;
      const errorType = `network_error_${error.message}`;
      stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
      return { success: false, error: error.message };
    }
  }
}

async function simulateConversation(
  userId,
  conversationIndex,
  apiKey,
  traceIdCollector = null
) {
  const conversationId = generateUUID();
  const sessionId = generateUUID();
  const template = randomChoice(CONVERSATION_TEMPLATES);
  const numMessages = randomInt(
    CONFIG.minMessagesPerConversation,
    CONFIG.maxMessagesPerConversation
  );
  const model = randomChoice(MODELS).name;

  stats.conversationIds.add(conversationId);
  stats.userIds.add(userId);

  const results = [];

  for (let messageIndex = 1; messageIndex <= numMessages; messageIndex++) {
    const traceId = generateUUID();
    if (traceIdCollector) {
      traceIdCollector.push(traceId);
    }
    const events = generateCanonicalEvents({
      traceId,
      conversationId,
      sessionId,
      userId,
      messageIndex,
      template,
      queryIndex: messageIndex - 1,
      model,
    });

    stats.total += events.length;
    const result = await sendEvents(events, apiKey);
    results.push({ ...result, traceId }); // Include traceId in result

    // Rate limiting
    if (messageIndex < numMessages) {
      await new Promise((resolve) => setTimeout(resolve, CONFIG.rateLimitMs));
    }

    // Small delay between messages
    if (messageIndex < numMessages) {
      await new Promise((resolve) => setTimeout(resolve, randomInt(500, 2000)));
    }
  }

  return results;
}

async function simulateUser(userIndex, apiKey, traceIdCollector = null) {
  const userId = generateUUID(); // Use proper UUID format
  const results = [];

  for (
    let convIndex = 0;
    convIndex < CONFIG.conversationsPerUser;
    convIndex++
  ) {
    try {
      const convResults = await simulateConversation(
        userId,
        convIndex,
        apiKey,
        traceIdCollector
      );
      results.push(...convResults);
    } catch (error) {
      console.error(
        `❌ Error in conversation ${convIndex} for user ${userId}:`,
        error.message
      );
    }
  }

  return results;
}

async function runSimulation() {
  console.log("\n🚀 Starting Comprehensive Load Simulation (Canonical Events)");
  console.log(
    "=============================================================\n"
  );

  // Get or create API key first
  const apiKey = await getOrCreateApiKey();

  // Track all trace IDs for output
  const allTraceIds = [];

  console.log("Configuration:");
  console.log(`  Users: ${CONFIG.numUsers}`);
  console.log(`  Conversations per user: ${CONFIG.conversationsPerUser}`);
  console.log(
    `  Messages per conversation: ${CONFIG.minMessagesPerConversation}-${CONFIG.maxMessagesPerConversation}`
  );
  console.log(
    `  Events per message: Variable (trace_start, retrievals, tool_calls, llm_calls, output, trace_end, errors, feedback)`
  );
  console.log(`  Rate limit: ${CONFIG.rateLimitMs}ms between requests`);
  console.log(`  Concurrent requests: ${CONFIG.concurrentRequests}`);
  console.log(
    `  Errors enabled: ${CONFIG.enableErrors} (rate: ${(
      CONFIG.errorRate * 100
    ).toFixed(1)}%)`
  );
  console.log(`  Hallucinations enabled: ${CONFIG.enableHallucinations}`);
  console.log(`  Feedback rate: ${(CONFIG.feedbackRate * 100).toFixed(1)}%`);
  console.log(`  Multi-LLM rate: ${(CONFIG.multiLLMRate * 100).toFixed(1)}%`);
  console.log(`  Max tools per trace: ${CONFIG.maxToolsPerTrace}`);
  console.log(`  Max retrievals per trace: ${CONFIG.maxRetrievalsPerTrace}`);
  console.log(`  Streaming enabled: ${CONFIG.enableStreaming}`);
  console.log(`  Cost calculation enabled: ${CONFIG.enableCostCalculation}`);
  console.log(`  API URL: ${API_URL}`);
  console.log(`  Tenant ID: ${tenantId}`);
  console.log(`  Project ID: ${projectId}\n`);

  const startTime = Date.now();

  // Simulate users with controlled concurrency
  for (let i = 0; i < CONFIG.numUsers; i += CONFIG.concurrentRequests) {
    const batch = [];
    for (
      let j = 0;
      j < CONFIG.concurrentRequests && i + j < CONFIG.numUsers;
      j++
    ) {
      batch.push(simulateUser(i + j, apiKey, allTraceIds));
    }

    const batchResults = await Promise.all(batch);

    // Progress reporting
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (stats.total / elapsed).toFixed(1);
    const successRate =
      stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;

    console.log(
      `📊 Progress: ${i + batch.length}/${CONFIG.numUsers} users | ${
        stats.total
      } events | ${stats.success} success | ${
        stats.errors
      } errors | ${rate} events/sec | ${successRate}% success rate`
    );
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Final statistics (enhanced)
  console.log("\n✅ Simulation Complete!");
  console.log("=======================\n");
  console.log("Statistics:");
  console.log(`  Total events sent: ${stats.total}`);
  console.log(
    `  Successful: ${stats.success} (${(
      (stats.success / stats.total) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `  Errors: ${stats.errors} (${((stats.errors / stats.total) * 100).toFixed(
      1
    )}%)`
  );
  console.log(`  Unique conversations: ${stats.conversationIds.size}`);
  console.log(`  Unique users: ${stats.userIds.size}`);
  console.log(`  Total time: ${totalTime}s`);
  console.log(
    `  Average rate: ${(stats.total / parseFloat(totalTime)).toFixed(
      1
    )} events/sec\n`
  );

  // Phase 4: Enhanced statistics
  if (stats.toolCounts.length > 0) {
    const avgTools = (
      stats.toolCounts.reduce((a, b) => a + b, 0) / stats.toolCounts.length
    ).toFixed(2);
    const maxTools = Math.max(...stats.toolCounts);
    console.log(`  Average tools per trace: ${avgTools} (max: ${maxTools})`);
  }

  if (stats.llmCallCounts.length > 0) {
    const avgLLMs = (
      stats.llmCallCounts.reduce((a, b) => a + b, 0) /
      stats.llmCallCounts.length
    ).toFixed(2);
    const maxLLMs = Math.max(...stats.llmCallCounts);
    console.log(`  Average LLM calls per trace: ${avgLLMs} (max: ${maxLLMs})`);
  }

  if (stats.retrievalCounts.length > 0) {
    const avgRetrievals = (
      stats.retrievalCounts.reduce((a, b) => a + b, 0) /
      stats.retrievalCounts.length
    ).toFixed(2);
    const maxRetrievals = Math.max(...stats.retrievalCounts);
    console.log(
      `  Average retrievals per trace: ${avgRetrievals} (max: ${maxRetrievals})`
    );
  }

  if (Object.keys(stats.errorsByType).length > 0) {
    console.log("\nNetwork/API Error breakdown:");
    for (const [errorType, count] of Object.entries(stats.errorsByType)) {
      console.log(`  ${errorType}: ${count}`);
    }
  }

  if (Object.keys(stats.errorEventsByType).length > 0) {
    console.log("\nSimulated Error Events breakdown:");
    for (const [errorType, count] of Object.entries(stats.errorEventsByType)) {
      console.log(`  ${errorType}: ${count}`);
    }
  }

  if (Object.keys(stats.feedbackEventsByType).length > 0) {
    console.log("\nFeedback Events breakdown:");
    for (const [feedbackType, count] of Object.entries(
      stats.feedbackEventsByType
    )) {
      console.log(`  ${feedbackType}: ${count}`);
    }
  }

  if (Object.keys(stats.finishReasonDistribution).length > 0) {
    console.log("\nFinish Reason Distribution:");
    for (const [reason, count] of Object.entries(
      stats.finishReasonDistribution
    )) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  console.log("");

  // Determine dashboard URL based on API URL
  let dashboardUrl = API_URL;
  if (API_URL.includes("observa-api")) {
    dashboardUrl = API_URL.replace("observa-api", "observa-app");
  } else if (API_URL.includes("localhost:3000")) {
    dashboardUrl = API_URL.replace("localhost:3000", "localhost:3001");
  } else {
    dashboardUrl = "https://observa-app.vercel.app";
  }

  console.log("💡 Next steps:");
  console.log(`  1. View traces at: ${dashboardUrl}/dashboard/traces`);
  console.log(
    `  2. View conversations at: ${dashboardUrl}/dashboard/conversations`
  );
  console.log(`  3. Check analytics at: ${dashboardUrl}/dashboard/analytics`);
  console.log(`\n📝 Each trace can include:`);
  console.log(`   - trace_start event`);
  console.log(
    `   - 1-${CONFIG.maxRetrievalsPerTrace} retrieval events (with context hashes)`
  );
  console.log(
    `   - 1-${CONFIG.maxToolsPerTrace} tool_call events (parallel/sequential, with args_hash)`
  );
  console.log(
    `   - 1-3 llm_call events (agentic workflows, with all attributes)`
  );
  console.log(`   - error events (tool/LLM/retrieval errors, timeouts)`);
  console.log(`   - output event (final response)`);
  console.log(`   - feedback events (like/dislike/rating/correction)`);
  console.log(`   - trace_end event (with cost, tokens, outcome)\n`);

  // Output trace IDs for testing
  if (allTraceIds.length > 0) {
    console.log(`🔍 Trace IDs created (for testing):`);
    allTraceIds.slice(0, 5).forEach((id, idx) => {
      console.log(`   ${idx + 1}. ${id}`);
    });
    if (allTraceIds.length > 5) {
      console.log(`   ... and ${allTraceIds.length - 5} more`);
    }
    console.log("");
    console.log(`💡 Test a trace directly:`);
    console.log(
      `   curl "${dashboardUrl.replace(
        "/dashboard/traces",
        ""
      )}/api/v1/traces/${
        allTraceIds[0]
      }?format=tree" -H "Authorization: Bearer <token>"`
    );
    console.log("");
  }
}

// Run the simulation
runSimulation().catch((error) => {
  console.error("\n❌ Fatal error during simulation:", error);
  console.error(error.stack);
  process.exit(1);
});

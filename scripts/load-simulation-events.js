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
const API_URL = process.env.API_URL || 'http://localhost:3000';
// API_KEY can be provided directly (sk_ or pk_ prefix) to skip creation
const PROVIDED_API_KEY = process.env.API_KEY;

// Configuration
const CONFIG = {
  numUsers: parseInt(process.env.NUM_USERS || '10'),
  conversationsPerUser: parseInt(process.env.CONVERSATIONS_PER_USER || '3'),
  minMessagesPerConversation: parseInt(process.env.MIN_MESSAGES || '5'),
  maxMessagesPerConversation: parseInt(process.env.MAX_MESSAGES || '10'),
  rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || '100'),
  enableErrors: process.env.ENABLE_ERRORS !== 'false',
  enableHallucinations: process.env.ENABLE_HALLUCINATIONS !== 'false',
  concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS || '5'),
};

if (!JWT_TOKEN) {
  console.error('❌ Error: JWT_TOKEN is required');
  console.error('Usage: node scripts/load-simulation-events.js <JWT_TOKEN>');
  console.error('   or: JWT_TOKEN=your_token node scripts/load-simulation-events.js');
  process.exit(1);
}

// Extract tenant/project from JWT (basic decode, no validation)
let tenantId, projectId, API_KEY;
try {
  const payload = JSON.parse(Buffer.from(JWT_TOKEN.split('.')[1], 'base64').toString());
  tenantId = payload.tenantId;
  projectId = payload.projectId;
} catch (e) {
  console.error('❌ Error: Could not extract tenantId/projectId from JWT token');
  process.exit(1);
}

// Function to get or create an API key
async function getOrCreateApiKey() {
  // Check if API_KEY is provided via environment variable
  if (process.env.API_KEY && (process.env.API_KEY.startsWith('sk_') || process.env.API_KEY.startsWith('pk_'))) {
    console.log('✅ Using API key from environment variable\n');
    return process.env.API_KEY;
  }

  // Try to create a new API key using JWT token
  try {
    console.log('🔑 Creating API key for events endpoint...');
    const response = await fetch(`${API_URL}/api/v1/tenants/${tenantId}/api-keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Load Simulation Key - ${new Date().toISOString()}`,
        keyPrefix: 'sk_',
        projectId: projectId,
        scopes: {
          ingest: true,
          query: true,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { error: text.substring(0, 200) };
      }
      
      if (response.status === 404 || text.includes('<!DOCTYPE')) {
        console.error('\n❌ API key creation endpoint not found. This endpoint needs to be deployed first.');
        console.error('\n💡 Workaround: Create an API key manually or set API_KEY environment variable:');
        console.error(`   API_KEY=sk_... node scripts/load-simulation-events.js ${JWT_TOKEN}`);
        console.error('\n   Or wait for the new endpoint to be deployed.\n');
        throw new Error('API key creation endpoint not available');
      }
      
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.apiKey) {
      console.log('✅ API key created successfully!');
      console.log(`   Key: ${data.apiKey.substring(0, 20)}...`);
      console.log('   (Store this key securely - it won\'t be shown again)\n');
      return data.apiKey;
    } else {
      throw new Error('API key not returned in response');
    }
  } catch (error) {
    if (error.message.includes('not available')) {
      throw error;
    }
    console.error('❌ Error creating API key:', error.message);
    console.error('\n💡 To use the events endpoint, you need an API key (sk_ or pk_)');
    console.error('   Set API_KEY environment variable:');
    console.error(`   API_KEY=sk_... node scripts/load-simulation-events.js ${JWT_TOKEN}\n`);
    throw error;
  }
}

// Statistics tracking
const stats = {
  total: 0,
  success: 0,
  errors: 0,
  startTime: Date.now(),
  conversationIds: new Set(),
  userIds: new Set(),
  errorsByType: {},
};

// Conversation templates
const CONVERSATION_TEMPLATES = [
  {
    name: 'Customer Support',
    queries: [
      'I need help with my order #12345',
      'When will it be delivered?',
      'Can I change the shipping address?',
      'What is your refund policy?',
      'I want to cancel my order',
    ],
    contexts: [
      '[CONTEXT] Order Information: Order #12345 was placed on 2024-01-15. Status: Processing. Estimated delivery: 2024-01-20.',
      '[CONTEXT] Shipping Policy: Standard shipping takes 5-7 business days. Express shipping (2-3 days) available.',
      '[CONTEXT] Refund Policy: Full refunds available within 30 days of purchase. Items must be in original condition.',
    ],
    responses: [
      'I can help you with order #12345. It was placed on January 15th and is currently being processed.',
      'Your order is estimated to arrive on January 20th. You\'ll receive a tracking number via email once it ships.',
      'Yes, you can change the shipping address if the order hasn\'t shipped yet. Let me update that for you.',
      'We offer full refunds within 30 days of purchase for items in original condition. Processing takes 5-10 business days.',
      'I can help you cancel order #12345. Since it\'s still processing, the cancellation should complete within 24 hours.',
    ],
    tools: ['get_order_status', 'update_shipping', 'process_refund', 'cancel_order'],
  },
  {
    name: 'Technical Support',
    queries: [
      'How do I reset my password?',
      'I\'m getting an error when trying to login',
      'Can you explain the API rate limits?',
      'How do I integrate your SDK?',
    ],
    contexts: [
      '[CONTEXT] Authentication: Password reset requires email verification. Tokens expire after 1 hour.',
      '[CONTEXT] API Documentation: Rate limits: 1000 requests/hour per API key. SDK integration requires Node.js 18+.',
      '[CONTEXT] Error Handling: All API errors return standard HTTP status codes. 429 indicates rate limit exceeded.',
    ],
    responses: [
      'You can reset your password by clicking "Forgot Password" on the login page. You\'ll receive an email with a reset link.',
      'Let me help you troubleshoot the login issue. Are you using the correct email and password?',
      'API rate limits are 1000 requests per hour per API key. If you exceed this, you\'ll receive a 429 status code.',
      'To integrate our SDK, install it via npm and initialize with your API key. Detailed documentation is available.',
    ],
    tools: ['verify_user', 'check_api_usage', 'generate_docs_link'],
  },
  {
    name: 'Product Inquiry',
    queries: [
      'What features does the premium plan include?',
      'How does your analytics compare to competitors?',
      'Can I try the product before purchasing?',
      'What integrations do you support?',
    ],
    contexts: [
      '[CONTEXT] Pricing: Free plan includes basic features. Premium plan ($99/month) includes advanced analytics.',
      '[CONTEXT] Features: Real-time analytics, custom dashboards, webhook integrations, REST API, SDK support.',
      '[CONTEXT] Trial: 14-day free trial available for premium plan. No credit card required.',
    ],
    responses: [
      'The premium plan includes advanced analytics, priority support, API access, custom dashboards, and webhook integrations.',
      'Our analytics platform offers real-time insights, custom dashboards, and extensive integrations.',
      'Yes! We offer a 14-day free trial of the premium plan with no credit card required.',
      'We support integrations with Slack, Discord, webhooks, REST API, and SDKs for JavaScript, Python, and Go.',
    ],
    tools: ['get_pricing_info', 'fetch_feature_list', 'check_integrations'],
  },
];

const MODELS = [
  { name: 'gpt-4o-mini', avgPromptTokens: 150, avgCompletionTokens: 80 },
  { name: 'gpt-4o', avgPromptTokens: 300, avgCompletionTokens: 200 },
  { name: 'gpt-4-turbo', avgPromptTokens: 400, avgCompletionTokens: 300 },
  { name: 'claude-3-opus', avgPromptTokens: 350, avgCompletionTokens: 250 },
];

// Utility functions
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
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
  const context = randomChoice(template.contexts);
  let response = template.responses[queryIndex % template.responses.length];
  
  // Check for hallucination
  if (CONFIG.enableHallucinations && Math.random() < 0.03) {
    response = 'Your order #12345 has been delivered yesterday.'; // Wrong answer
  }

  const modelConfig = MODELS.find(m => m.name === model) || MODELS[0];
  const tokensPrompt = modelConfig.avgPromptTokens + randomInt(-50, 100);
  const tokensCompletion = modelConfig.avgCompletionTokens + randomInt(-30, 80);
  const tokensTotal = tokensPrompt + tokensCompletion;
  const totalLatency = randomInt(800, 2000);
  const retrievalLatency = randomInt(50, 200);
  const toolCallLatency = randomInt(100, 500);
  const llmLatency = totalLatency - retrievalLatency - toolCallLatency;

  const rootSpanId = generateUUID();
  const toolSpanId = generateUUID();
  const baseTime = new Date().toISOString();

  const events = [];

  // 1. trace_start event
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: Math.random() > 0.2 ? 'prod' : 'dev',
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: baseTime,
    event_type: 'trace_start',
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      trace_start: {
        name: `Conversation Message ${messageIndex}`,
        metadata: {
          message_index: messageIndex,
        },
      },
    },
  });

  // 2. Retrieval event (fetch context)
  const retrievalTime = addMilliseconds(baseTime, 10);
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: Math.random() > 0.2 ? 'prod' : 'dev',
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: retrievalTime,
    event_type: 'retrieval',
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      retrieval: {
        retrieval_context_ids: [`ctx-${generateUUID().substring(0, 8)}`],
        k: 5,
        top_k: 5,
        latency_ms: retrievalLatency,
        similarity_scores: [0.95, 0.89, 0.87, 0.85, 0.82],
      },
    },
  });

  // 3. Tool call event (as a child span) - simulate calling a tool before LLM
  const toolStartTime = addMilliseconds(baseTime, retrievalLatency + 20);
  const toolName = randomChoice(template.tools || ['lookup_data']);
  const toolArgs = { query: query.substring(0, 50), limit: 10 };
  
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: Math.random() > 0.2 ? 'prod' : 'dev',
    trace_id: traceId,
    span_id: toolSpanId,
    parent_span_id: rootSpanId,
    timestamp: toolStartTime,
    event_type: 'tool_call',
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      tool_call: {
        tool_name: toolName,
        args: toolArgs,
        result_status: 'success',
        result: { data: context, items_found: 5 },
        latency_ms: toolCallLatency,
      },
    },
  });

  // 4. LLM call event (main event)
  const llmStartTime = addMilliseconds(baseTime, retrievalLatency + toolCallLatency + 30);
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: Math.random() > 0.2 ? 'prod' : 'dev',
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: llmStartTime,
    event_type: 'llm_call',
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      llm_call: {
        model: model,
        input: query,
        output: response,
        input_tokens: tokensPrompt,
        output_tokens: tokensCompletion,
        total_tokens: tokensTotal,
        latency_ms: llmLatency,
        finish_reason: 'stop',
        temperature: 0.7,
        max_tokens: 1000,
      },
    },
  });

  // 5. Output event (final output)
  const outputTime = addMilliseconds(baseTime, totalLatency - 50);
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: Math.random() > 0.2 ? 'prod' : 'dev',
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: outputTime,
    event_type: 'output',
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      output: {
        final_output: response,
        output_length: response.length,
      },
    },
  });

  // 6. trace_end event
  const endTime = addMilliseconds(baseTime, totalLatency);
  events.push({
    tenant_id: tenantId,
    project_id: projectId,
    environment: Math.random() > 0.2 ? 'prod' : 'dev',
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: null,
    timestamp: endTime,
    event_type: 'trace_end',
    conversation_id: conversationId,
    session_id: sessionId,
    user_id: userId,
    attributes: {
      trace_end: {
        total_latency_ms: totalLatency,
        total_tokens: tokensTotal,
      },
    },
  });

  return events;
}

async function sendEvents(events, apiKey, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${API_URL}/api/v1/events/ingest`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(events),
      });

      const data = await response.json();

      if (response.ok) {
        stats.success += events.length;
        return { success: true, data };
      } else {
        const errorType = `${response.status}_${data.error?.code || 'unknown'}`;
        stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
        
        if (response.status >= 500 && attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        
        stats.errors += events.length;
        return { success: false, error: data, status: response.status };
      }
    } catch (error) {
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      stats.errors += events.length;
      const errorType = `network_error_${error.message}`;
      stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
      return { success: false, error: error.message };
    }
  }
}

async function simulateConversation(userId, conversationIndex, apiKey) {
  const conversationId = generateUUID();
  const sessionId = generateUUID();
  const template = randomChoice(CONVERSATION_TEMPLATES);
  const numMessages = randomInt(CONFIG.minMessagesPerConversation, CONFIG.maxMessagesPerConversation);
  const model = randomChoice(MODELS).name;

  stats.conversationIds.add(conversationId);
  stats.userIds.add(userId);

  const results = [];
  
  for (let messageIndex = 1; messageIndex <= numMessages; messageIndex++) {
    const traceId = generateUUID();
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
    results.push(result);

    // Rate limiting
    if (messageIndex < numMessages) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitMs));
    }

    // Small delay between messages
    if (messageIndex < numMessages) {
      await new Promise(resolve => setTimeout(resolve, randomInt(500, 2000)));
    }
  }

  return results;
}

async function simulateUser(userIndex, apiKey) {
  const userId = `user-${userIndex}-${generateUUID().substring(0, 8)}`;
  const results = [];

  for (let convIndex = 0; convIndex < CONFIG.conversationsPerUser; convIndex++) {
    try {
      const convResults = await simulateConversation(userId, convIndex, apiKey);
      results.push(...convResults);
    } catch (error) {
      console.error(`❌ Error in conversation ${convIndex} for user ${userId}:`, error.message);
    }
  }

  return results;
}

async function runSimulation() {
  console.log('\n🚀 Starting Comprehensive Load Simulation (Canonical Events)');
  console.log('=============================================================\n');
  
  // Get or create API key first
  const apiKey = await getOrCreateApiKey();
  
  console.log('Configuration:');
  console.log(`  Users: ${CONFIG.numUsers}`);
  console.log(`  Conversations per user: ${CONFIG.conversationsPerUser}`);
  console.log(`  Messages per conversation: ${CONFIG.minMessagesPerConversation}-${CONFIG.maxMessagesPerConversation}`);
  console.log(`  Events per message: 6 (trace_start, retrieval, tool_call, llm_call, output, trace_end)`);
  console.log(`  Rate limit: ${CONFIG.rateLimitMs}ms between requests`);
  console.log(`  Concurrent requests: ${CONFIG.concurrentRequests}`);
  console.log(`  Errors enabled: ${CONFIG.enableErrors}`);
  console.log(`  Hallucinations enabled: ${CONFIG.enableHallucinations}`);
  console.log(`  API URL: ${API_URL}`);
  console.log(`  Tenant ID: ${tenantId}`);
  console.log(`  Project ID: ${projectId}\n`);

  const startTime = Date.now();

  // Simulate users with controlled concurrency
  for (let i = 0; i < CONFIG.numUsers; i += CONFIG.concurrentRequests) {
    const batch = [];
    for (let j = 0; j < CONFIG.concurrentRequests && i + j < CONFIG.numUsers; j++) {
      batch.push(simulateUser(i + j, apiKey));
    }

    const batchResults = await Promise.all(batch);
    
    // Progress reporting
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (stats.total / elapsed).toFixed(1);
    const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;
    
    console.log(`📊 Progress: ${i + batch.length}/${CONFIG.numUsers} users | ${stats.total} events | ${stats.success} success | ${stats.errors} errors | ${rate} events/sec | ${successRate}% success rate`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Final statistics
  console.log('\n✅ Simulation Complete!');
  console.log('=======================\n');
  console.log('Statistics:');
  console.log(`  Total events sent: ${stats.total}`);
  console.log(`  Successful: ${stats.success} (${((stats.success / stats.total) * 100).toFixed(1)}%)`);
  console.log(`  Errors: ${stats.errors} (${((stats.errors / stats.total) * 100).toFixed(1)}%)`);
  console.log(`  Unique conversations: ${stats.conversationIds.size}`);
  console.log(`  Unique users: ${stats.userIds.size}`);
  console.log(`  Total time: ${totalTime}s`);
  console.log(`  Average rate: ${(stats.total / parseFloat(totalTime)).toFixed(1)} events/sec\n`);

  if (Object.keys(stats.errorsByType).length > 0) {
    console.log('Error breakdown:');
    for (const [errorType, count] of Object.entries(stats.errorsByType)) {
      console.log(`  ${errorType}: ${count}`);
    }
    console.log('');
  }

  console.log('💡 Next steps:');
  console.log(`  1. View traces at: ${API_URL.replace(':3000', ':3001').replace('http://', 'https://')}/dashboard/traces`);
  console.log(`  2. View conversations at: ${API_URL.replace(':3000', ':3001').replace('http://', 'https://')}/dashboard/conversations`);
  console.log(`  3. Check analytics at: ${API_URL.replace(':3000', ':3001').replace('http://', 'https://')}/dashboard/analytics`);
  console.log(`\n📝 Each trace now includes:`);
  console.log(`   - trace_start event`);
  console.log(`   - retrieval event (context fetching)`);
  console.log(`   - tool_call event (child span)`);
  console.log(`   - llm_call event (main LLM request)`);
  console.log(`   - output event (final response)`);
  console.log(`   - trace_end event\n`);
}

// Run the simulation
runSimulation().catch(error => {
  console.error('\n❌ Fatal error during simulation:', error);
  console.error(error.stack);
  process.exit(1);
});


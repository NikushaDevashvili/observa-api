/**
 * Comprehensive Load Simulation Script
 * 
 * Simulates a company with heavy logging, multiple users, conversations, and realistic data.
 * This script is battle-tested and practical for load testing the Observa API.
 * 
 * Usage:
 *   node scripts/load-simulation.js <JWT_TOKEN>
 * 
 * Or with environment variables:
 *   JWT_TOKEN=your_token API_URL=http://localhost:3000 node scripts/load-simulation.js
 * 
 * Configuration via environment variables:
 *   - JWT_TOKEN: Required - API authentication token
 *   - API_URL: API base URL (default: http://localhost:3000)
 *   - NUM_USERS: Number of concurrent users (default: 10)
 *   - CONVERSATIONS_PER_USER: Number of conversations per user (default: 3)
 *   - MESSAGES_PER_CONVERSATION: Messages per conversation (default: 5-10, random)
 *   - RATE_LIMIT_MS: Delay between requests in ms (default: 100)
 *   - ENABLE_ERRORS: Include error scenarios (default: true)
 *   - ENABLE_HALLUCINATIONS: Include hallucination scenarios (default: true)
 */

const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;
const API_URL = process.env.API_URL || 'http://localhost:3000';

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
  console.error('Usage: node scripts/load-simulation.js <JWT_TOKEN>');
  console.error('   or: JWT_TOKEN=your_token node scripts/load-simulation.js');
  console.error('\n💡 Get a token from: POST /api/v1/auth/signup');
  process.exit(1);
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

// Realistic conversation templates for different scenarios
const CONVERSATION_TEMPLATES = [
  {
    name: 'Customer Support',
    queries: [
      'I need help with my order #12345',
      'When will it be delivered?',
      'Can I change the shipping address?',
      'What is your refund policy?',
      'I want to cancel my order',
      'How long does processing take?',
      'Do you ship internationally?',
      'What payment methods do you accept?',
    ],
    contexts: [
      '[CONTEXT] Order Information: Order #12345 was placed on 2024-01-15. Status: Processing. Estimated delivery: 2024-01-20. Shipping to: 123 Main St, New York, NY 10001.',
      '[CONTEXT] Shipping Policy: Standard shipping takes 5-7 business days. Express shipping (2-3 days) available for additional fee. International shipping available to select countries.',
      '[CONTEXT] Refund Policy: Full refunds available within 30 days of purchase. Items must be in original condition. Processing time: 5-10 business days after receipt.',
    ],
    responses: [
      'I can help you with order #12345. It was placed on January 15th and is currently being processed.',
      'Your order is estimated to arrive on January 20th. You\'ll receive a tracking number via email once it ships.',
      'Yes, you can change the shipping address if the order hasn\'t shipped yet. Let me update that for you.',
      'We offer full refunds within 30 days of purchase for items in original condition. Processing takes 5-10 business days.',
      'I can help you cancel order #12345. Since it\'s still processing, the cancellation should complete within 24 hours.',
    ],
  },
  {
    name: 'Technical Support',
    queries: [
      'How do I reset my password?',
      'I\'m getting an error when trying to login',
      'Can you explain the API rate limits?',
      'How do I integrate your SDK?',
      'What authentication methods are supported?',
      'I need help with webhook configuration',
      'How do I handle errors in the SDK?',
      'What are the best practices for API usage?',
    ],
    contexts: [
      '[CONTEXT] Authentication: Password reset requires email verification. Tokens expire after 1 hour. API keys never expire but can be revoked.',
      '[CONTEXT] API Documentation: Rate limits: 1000 requests/hour per API key. SDK integration requires Node.js 18+. Webhooks use HMAC signatures for verification.',
      '[CONTEXT] Error Handling: All API errors return standard HTTP status codes. 429 indicates rate limit exceeded. 401 indicates invalid credentials.',
    ],
    responses: [
      'You can reset your password by clicking "Forgot Password" on the login page. You\'ll receive an email with a reset link that expires in 1 hour.',
      'Let me help you troubleshoot the login issue. Are you using the correct email and password? Check for typos and ensure Caps Lock is off.',
      'API rate limits are 1000 requests per hour per API key. If you exceed this, you\'ll receive a 429 status code. Consider implementing request queuing.',
      'To integrate our SDK, install it via npm and initialize with your API key. Detailed documentation is available in our developer portal.',
    ],
  },
  {
    name: 'Product Inquiry',
    queries: [
      'What features does the premium plan include?',
      'How does your analytics compare to competitors?',
      'Can I try the product before purchasing?',
      'What integrations do you support?',
      'Do you offer enterprise pricing?',
      'What kind of support is included?',
      'How often do you release updates?',
      'Can I export my data?',
    ],
    contexts: [
      '[CONTEXT] Pricing: Free plan includes basic features. Premium plan ($99/month) includes advanced analytics, priority support, and API access. Enterprise plans are custom.',
      '[CONTEXT] Features: Real-time analytics, custom dashboards, webhook integrations, REST API, SDK support for major languages, 99.9% uptime SLA on enterprise plans.',
      '[CONTEXT] Trial: 14-day free trial available for premium plan. No credit card required. Full feature access during trial period.',
    ],
    responses: [
      'The premium plan includes advanced analytics, priority support, API access, custom dashboards, and webhook integrations for $99/month.',
      'Our analytics platform offers real-time insights, custom dashboards, and extensive integrations. Many customers choose us for our developer-friendly API.',
      'Yes! We offer a 14-day free trial of the premium plan with no credit card required. You\'ll have full access to all features during the trial.',
      'We support integrations with Slack, Discord, webhooks, REST API, and SDKs for JavaScript, Python, and Go. More integrations coming soon.',
    ],
  },
  {
    name: 'E-commerce',
    queries: [
      'Do you have this item in stock?',
      'What size should I get?',
      'Can you recommend similar products?',
      'What is the return policy?',
      'Do you offer gift wrapping?',
      'Can I use multiple discount codes?',
      'What is your shipping policy?',
      'How do I track my order?',
    ],
    contexts: [
      '[CONTEXT] Inventory: Real-time inventory tracking. Low stock alerts when quantity drops below 10 units. Out of stock items show estimated restock date.',
      '[CONTEXT] Sizing: Size charts available for all clothing items. Measurement guides with detailed instructions. Free size exchanges within 30 days.',
      '[CONTEXT] Returns: 30-day return policy. Items must be unworn/unused with tags. Free return shipping for orders over $50. Refunds processed within 5-7 business days.',
    ],
    responses: [
      'Yes, this item is currently in stock! We have 25 units available. Would you like me to add it to your cart?',
      'Based on our size chart, I\'d recommend a Medium if you typically wear a size 8-10. Would you like me to show you the detailed size chart?',
      'Here are some similar products you might like: [Product A], [Product B], and [Product C]. All have similar styles and are in the same price range.',
      'We offer a 30-day return policy. Items must be unworn/unused with tags. Return shipping is free for orders over $50.',
    ],
  },
];

// Models with realistic token usage
const MODELS = [
  { name: 'gpt-4o-mini', avgPromptTokens: 150, avgCompletionTokens: 80 },
  { name: 'gpt-4o', avgPromptTokens: 300, avgCompletionTokens: 200 },
  { name: 'gpt-4-turbo', avgPromptTokens: 400, avgCompletionTokens: 300 },
  { name: 'claude-3-opus', avgPromptTokens: 350, avgCompletionTokens: 250 },
  { name: 'claude-3-sonnet', avgPromptTokens: 250, avgCompletionTokens: 150 },
];

// Error scenarios
const ERROR_SCENARIOS = [
  { status: 429, statusText: 'Rate Limit Exceeded', probability: 0.02 },
  { status: 500, statusText: 'Internal Server Error', probability: 0.01 },
  { status: 503, statusText: 'Service Unavailable', probability: 0.005 },
];

// Hallucination scenarios (wrong responses)
const HALLUCINATION_SCENARIOS = [
  { queryPattern: /order.*status/i, wrongResponse: 'Your order #12345 has been delivered yesterday.', probability: 0.03 },
  { queryPattern: /price|cost|pricing/i, wrongResponse: 'The premium plan costs $49/month.', probability: 0.02 },
  { queryPattern: /shipping|delivery/i, wrongResponse: 'Shipping takes 2-3 business days worldwide.', probability: 0.025 },
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

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function shouldIncludeError() {
  if (!CONFIG.enableErrors) return null;
  for (const scenario of ERROR_SCENARIOS) {
    if (Math.random() < scenario.probability) {
      return scenario;
    }
  }
  return null;
}

function shouldIncludeHallucination(query) {
  if (!CONFIG.enableHallucinations) return null;
  for (const scenario of HALLUCINATION_SCENARIOS) {
    if (scenario.queryPattern.test(query) && Math.random() < scenario.probability) {
      return scenario;
    }
  }
  return null;
}

function generateRealisticLatency(model) {
  // More complex models have higher latency
  const baseLatency = model.includes('gpt-4') ? 1200 : model.includes('claude-3-opus') ? 1500 : 800;
  const variation = randomInt(-200, 500);
  return Math.max(300, baseLatency + variation);
}

function generateTraceData(params) {
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
  const hallucination = shouldIncludeHallucination(query);
  if (hallucination) {
    response = hallucination.wrongResponse;
  }

  const errorScenario = shouldIncludeError();
  const status = errorScenario ? errorScenario.status : 200;
  const statusText = errorScenario ? errorScenario.statusText : 'OK';

  const modelConfig = MODELS.find(m => m.name === model) || MODELS[0];
  const tokensPrompt = modelConfig.avgPromptTokens + randomInt(-50, 100);
  const tokensCompletion = modelConfig.avgCompletionTokens + randomInt(-30, 80);
  const tokensTotal = tokensPrompt + tokensCompletion;
  const latencyMs = status === 200 ? generateRealisticLatency(model) : randomInt(100, 500);
  const timeToFirstTokenMs = status === 200 ? randomInt(200, 600) : null;
  const streamingDurationMs = status === 200 ? latencyMs - (timeToFirstTokenMs || 0) : null;

  return {
    traceId,
    spanId: traceId,
    parentSpanId: null,
    timestamp: new Date().toISOString(),
    tenantId: '00000000-0000-0000-0000-000000000000', // Will be overridden by JWT
    projectId: '00000000-0000-0000-0000-000000000000', // Will be overridden by JWT
    environment: Math.random() > 0.2 ? 'prod' : 'dev', // 80% prod, 20% dev
    query,
    context,
    response,
    responseLength: response.length,
    model,
    tokensPrompt,
    tokensCompletion,
    tokensTotal,
    latencyMs,
    timeToFirstTokenMs,
    streamingDurationMs,
    status,
    statusText,
    finishReason: status === 200 ? 'stop' : null,
    conversationId,
    sessionId,
    userId,
    messageIndex,
  };
}

async function sendTrace(traceData, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${API_URL}/api/v1/traces/ingest`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(traceData),
      });

      const data = await response.json();

      if (response.ok) {
        stats.success++;
        return { success: true, data };
      } else {
        const errorType = `${response.status}_${data.error || 'unknown'}`;
        stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
        
        if (response.status >= 500 && attempt < retries - 1) {
          // Retry on server errors
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        
        stats.errors++;
        return { success: false, error: data, status: response.status };
      }
    } catch (error) {
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      stats.errors++;
      const errorType = `network_error_${error.message}`;
      stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
      return { success: false, error: error.message };
    }
  }
}

async function simulateConversation(userId, conversationIndex) {
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
    const traceData = generateTraceData({
      traceId,
      conversationId,
      sessionId,
      userId,
      messageIndex,
      template,
      queryIndex: messageIndex - 1,
      model,
    });

    stats.total++;
    const result = await sendTrace(traceData);
    results.push(result);

    // Rate limiting
    if (messageIndex < numMessages) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitMs));
    }

    // Small delay between messages in conversation (simulate user thinking time)
    if (messageIndex < numMessages) {
      await new Promise(resolve => setTimeout(resolve, randomInt(500, 3000)));
    }
  }

  return results;
}

async function simulateUser(userIndex) {
  const userId = `user-${userIndex}-${generateUUID().substring(0, 8)}`;
  const results = [];

  for (let convIndex = 0; convIndex < CONFIG.conversationsPerUser; convIndex++) {
    try {
      const convResults = await simulateConversation(userId, convIndex);
      results.push(...convResults);
    } catch (error) {
      console.error(`❌ Error in conversation ${convIndex} for user ${userId}:`, error.message);
    }
  }

  return results;
}

async function runSimulation() {
  console.log('\n🚀 Starting Comprehensive Load Simulation');
  console.log('==========================================\n');
  console.log('Configuration:');
  console.log(`  Users: ${CONFIG.numUsers}`);
  console.log(`  Conversations per user: ${CONFIG.conversationsPerUser}`);
  console.log(`  Messages per conversation: ${CONFIG.minMessagesPerConversation}-${CONFIG.maxMessagesPerConversation}`);
  console.log(`  Rate limit: ${CONFIG.rateLimitMs}ms between requests`);
  console.log(`  Concurrent requests: ${CONFIG.concurrentRequests}`);
  console.log(`  Errors enabled: ${CONFIG.enableErrors}`);
  console.log(`  Hallucinations enabled: ${CONFIG.enableHallucinations}`);
  console.log(`  API URL: ${API_URL}\n`);

  const startTime = Date.now();
  const userPromises = [];

  // Simulate users with controlled concurrency
  for (let i = 0; i < CONFIG.numUsers; i += CONFIG.concurrentRequests) {
    const batch = [];
    for (let j = 0; j < CONFIG.concurrentRequests && i + j < CONFIG.numUsers; j++) {
      batch.push(simulateUser(i + j));
    }

    const batchResults = await Promise.all(batch);
    
    // Progress reporting
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (stats.total / elapsed).toFixed(1);
    const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;
    
    console.log(`📊 Progress: ${i + batch.length}/${CONFIG.numUsers} users | ${stats.total} traces | ${stats.success} success | ${stats.errors} errors | ${rate} traces/sec | ${successRate}% success rate`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Final statistics
  console.log('\n✅ Simulation Complete!');
  console.log('=======================\n');
  console.log('Statistics:');
  console.log(`  Total traces sent: ${stats.total}`);
  console.log(`  Successful: ${stats.success} (${((stats.success / stats.total) * 100).toFixed(1)}%)`);
  console.log(`  Errors: ${stats.errors} (${((stats.errors / stats.total) * 100).toFixed(1)}%)`);
  console.log(`  Unique conversations: ${stats.conversationIds.size}`);
  console.log(`  Unique users: ${stats.userIds.size}`);
  console.log(`  Total time: ${totalTime}s`);
  console.log(`  Average rate: ${(stats.total / parseFloat(totalTime)).toFixed(1)} traces/sec\n`);

  if (Object.keys(stats.errorsByType).length > 0) {
    console.log('Error breakdown:');
    for (const [errorType, count] of Object.entries(stats.errorsByType)) {
      console.log(`  ${errorType}: ${count}`);
    }
    console.log('');
  }

  // Determine dashboard URL based on API URL
  let dashboardUrl = API_URL;
  if (API_URL.includes('observa-api')) {
    dashboardUrl = API_URL.replace('observa-api', 'observa-app');
  } else if (API_URL.includes('localhost:3000')) {
    dashboardUrl = API_URL.replace('localhost:3000', 'localhost:3001');
  } else {
    dashboardUrl = 'https://observa-app.vercel.app';
  }

  console.log('💡 Next steps:');
  console.log(`  1. View traces at: ${dashboardUrl}/dashboard/traces`);
  console.log(`  2. View conversations at: ${dashboardUrl}/dashboard/conversations`);
  console.log(`  3. Check analytics at: ${dashboardUrl}/dashboard/analytics\n`);
}

// Run the simulation
runSimulation().catch(error => {
  console.error('\n❌ Fatal error during simulation:', error);
  console.error(error.stack);
  process.exit(1);
});


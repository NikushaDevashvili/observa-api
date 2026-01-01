/**
 * Simple test script to send a trace to the Observa API
 * 
 * Usage:
 *   node scripts/test-trace.js <JWT_TOKEN>
 * 
 * Or set JWT_TOKEN environment variable:
 *   JWT_TOKEN=your_token node scripts/test-trace.js
 */

const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;
const API_URL = process.env.API_URL || 'http://localhost:3000';

if (!JWT_TOKEN) {
  console.error('Error: JWT_TOKEN is required');
  console.error('Usage: node scripts/test-trace.js <JWT_TOKEN>');
  console.error('   or: JWT_TOKEN=your_token node scripts/test-trace.js');
  process.exit(1);
}

async function sendTestTrace() {
  const traceId = `test-trace-${Date.now()}`;
  
  const traceData = {
    traceId: traceId,
    spanId: `span-${Date.now()}`,
    parentSpanId: null,
    query: "What is the capital of France?",
    context: "France is a country in Europe. Paris is its capital city.",
    response: "The capital of France is Paris.",
    model: "gpt-4",
    tokensPrompt: 50,
    tokensCompletion: 20,
    tokensTotal: 70,
    latencyMs: 1200,
    status: 200,
    timestamp: new Date().toISOString(),
    conversationId: `conv-${Date.now()}`,
    sessionId: `session-${Date.now()}`,
  };

  try {
    console.log(`Sending test trace to ${API_URL}/api/v1/traces/ingest...`);
    console.log(`Trace ID: ${traceId}`);
    
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
      console.log('✅ Trace sent successfully!');
      console.log('Response:', JSON.stringify(data, null, 2));
      console.log(`\n💡 View trace at: http://localhost:3001/dashboard/traces/${traceId}`);
    } else {
      console.error('❌ Failed to send trace');
      console.error('Status:', response.status);
      console.error('Response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error sending trace:', error.message);
    process.exit(1);
  }
}

// Send a trace with an issue (hallucination)
async function sendTraceWithIssue() {
  const traceId = `test-trace-issue-${Date.now()}`;
  
  const traceData = {
    traceId: traceId,
    spanId: `span-${Date.now()}`,
    parentSpanId: null,
    query: "What is the capital of France?",
    context: "France is a country in Europe. Paris is its capital city.",
    response: "The capital of France is London.", // Wrong answer (hallucination)
    model: "gpt-4",
    tokensPrompt: 50,
    tokensCompletion: 25,
    tokensTotal: 75,
    latencyMs: 1500,
    status: 200,
    timestamp: new Date().toISOString(),
    conversationId: `conv-${Date.now()}`,
    sessionId: `session-${Date.now()}`,
  };

  try {
    console.log(`\nSending trace with potential issue...`);
    console.log(`Trace ID: ${traceId}`);
    
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
      console.log('✅ Trace with issue sent successfully!');
      console.log('Response:', JSON.stringify(data, null, 2));
      console.log(`\n💡 View trace at: http://localhost:3001/dashboard/traces/${traceId}`);
      console.log(`💡 View issues at: http://localhost:3001/dashboard/issues`);
    } else {
      console.error('❌ Failed to send trace');
      console.error('Status:', response.status);
      console.error('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error sending trace:', error.message);
  }
}

async function main() {
  await sendTestTrace();
  await sendTraceWithIssue();
  
  console.log('\n✅ Testing complete!');
  console.log('\nNext steps:');
  console.log('1. Check the dashboard at http://localhost:3001/dashboard');
  console.log('2. View traces at http://localhost:3001/dashboard/traces');
  console.log('3. View issues at http://localhost:3001/dashboard/issues');
}

main().catch(console.error);


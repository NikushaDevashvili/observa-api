#!/bin/bash

# Quick test script for conversation tracking
# Usage: ./test_conversation_flow.sh

set -e

# Configuration
API_URL="${API_URL:-https://observa-api.vercel.app}"
API_KEY="${API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY environment variable not set"
  echo "Usage: API_KEY=your-key ./test_conversation_flow.sh"
  exit 1
fi

echo "🧪 Testing Conversation Tracking Flow"
echo "======================================"
echo ""

# Generate unique IDs
TIMESTAMP=$(date +%s)
CONVERSATION_ID="conv-test-$TIMESTAMP"
SESSION_ID="session-test-$TIMESTAMP"
USER_ID="user-test-123"

echo "📝 Conversation ID: $CONVERSATION_ID"
echo "📝 Session ID: $SESSION_ID"
echo "📝 User ID: $USER_ID"
echo ""

# Test 1: Send first message
echo "1️⃣ Sending first message..."
RESPONSE1=$(curl -s -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"traceId\": \"trace-$TIMESTAMP-001\",
    \"spanId\": \"span-001\",
    \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
    \"query\": \"What is the capital of France?\",
    \"context\": \"France is a country in Europe. The capital city of France is Paris.\",
    \"response\": \"The capital of France is Paris.\",
    \"model\": \"gpt-3.5-turbo\",
    \"tokensPrompt\": 20,
    \"tokensCompletion\": 10,
    \"tokensTotal\": 30,
    \"latencyMs\": 500,
    \"responseLength\": 30,
    \"conversationId\": \"$CONVERSATION_ID\",
    \"sessionId\": \"$SESSION_ID\",
    \"userId\": \"$USER_ID\",
    \"messageIndex\": 1
  }")

if echo "$RESPONSE1" | grep -q "success"; then
  echo "✅ First message sent successfully"
else
  echo "❌ Failed to send first message: $RESPONSE1"
  exit 1
fi

# Test 2: Send second message
echo ""
echo "2️⃣ Sending second message..."
RESPONSE2=$(curl -s -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"traceId\": \"trace-$TIMESTAMP-002\",
    \"spanId\": \"span-002\",
    \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
    \"query\": \"What is the population of Paris?\",
    \"context\": \"Paris is the capital of France. The population of Paris is approximately 2.1 million people.\",
    \"response\": \"The population of Paris is approximately 2.1 million people.\",
    \"model\": \"gpt-3.5-turbo\",
    \"tokensPrompt\": 25,
    \"tokensCompletion\": 15,
    \"tokensTotal\": 40,
    \"latencyMs\": 600,
    \"responseLength\": 60,
    \"conversationId\": \"$CONVERSATION_ID\",
    \"sessionId\": \"$SESSION_ID\",
    \"userId\": \"$USER_ID\",
    \"messageIndex\": 2
  }")

if echo "$RESPONSE2" | grep -q "success"; then
  echo "✅ Second message sent successfully"
else
  echo "❌ Failed to send second message: $RESPONSE2"
  exit 1
fi

# Test 3: Send third message
echo ""
echo "3️⃣ Sending third message..."
RESPONSE3=$(curl -s -X POST "$API_URL/api/v1/traces/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"traceId\": \"trace-$TIMESTAMP-003\",
    \"spanId\": \"span-003\",
    \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
    \"query\": \"What is the Eiffel Tower?\",
    \"context\": \"The Eiffel Tower is a famous landmark in Paris, France. It was built in 1889.\",
    \"response\": \"The Eiffel Tower is a famous landmark in Paris, France, built in 1889.\",
    \"model\": \"gpt-3.5-turbo\",
    \"tokensPrompt\": 30,
    \"tokensCompletion\": 20,
    \"tokensTotal\": 50,
    \"latencyMs\": 700,
    \"responseLength\": 70,
    \"conversationId\": \"$CONVERSATION_ID\",
    \"sessionId\": \"$SESSION_ID\",
    \"userId\": \"$USER_ID\",
    \"messageIndex\": 3
  }")

if echo "$RESPONSE3" | grep -q "success"; then
  echo "✅ Third message sent successfully"
else
  echo "❌ Failed to send third message: $RESPONSE3"
  exit 1
fi

echo ""
echo "⏳ Waiting 30 seconds for analysis to complete..."
sleep 30

echo ""
echo "✅ All messages sent successfully!"
echo ""
echo "📊 Next steps:"
echo "1. Login to https://observa-app.vercel.app/dashboard/conversations"
echo "2. Look for conversation: $CONVERSATION_ID"
echo "3. Click 'View →' to see the full conversation thread"
echo ""
echo "🔍 Or test via API:"
echo "curl -X GET \"$API_URL/api/v1/conversations/$CONVERSATION_ID\" \\"
echo "  -H \"Authorization: Bearer YOUR_SESSION_TOKEN\""


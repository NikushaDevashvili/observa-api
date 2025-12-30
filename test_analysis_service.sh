#!/bin/bash

# Test script for analysis service health checks
# Usage: ./test_analysis_service.sh

set -e

ANALYSIS_URL="${ANALYSIS_SERVICE_URL:-http://localhost:8000}"

if [ -z "$ANALYSIS_SERVICE_URL" ]; then
  echo "⚠️  ANALYSIS_SERVICE_URL not set, using default: $ANALYSIS_URL"
  echo "Set ANALYSIS_SERVICE_URL environment variable to test your deployed service"
fi

echo "🧪 Testing Analysis Service"
echo "============================"
echo "Service URL: $ANALYSIS_URL"
echo ""

# Test 1: Health check
echo "1️⃣ Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -s -X GET "$ANALYSIS_URL/health")
echo "Response: $HEALTH_RESPONSE"

if echo "$HEALTH_RESPONSE" | grep -q "status.*ok"; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  exit 1
fi

# Test 2: Readiness check
echo ""
echo "2️⃣ Testing /ready endpoint..."
READY_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$ANALYSIS_URL/ready")
HTTP_STATUS=$(echo "$READY_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
READY_BODY=$(echo "$READY_RESPONSE" | grep -v "HTTP_STATUS")

echo "HTTP Status: $HTTP_STATUS"
echo "Response: $READY_BODY"

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Service is ready (all models loaded)"
elif [ "$HTTP_STATUS" = "503" ]; then
  echo "⚠️  Service not ready (models still loading)"
  echo "This is expected if service just started. Wait 30-60 seconds and try again."
else
  echo "❌ Unexpected status code: $HTTP_STATUS"
  exit 1
fi

# Test 3: Model status check
echo ""
echo "3️⃣ Checking model status..."
if echo "$READY_BODY" | grep -q "models"; then
  echo "✅ Model status included in response"
  echo "$READY_BODY" | grep -o '"models":{[^}]*}' || echo "$READY_BODY"
else
  echo "⚠️  Model status not found in response"
fi

echo ""
echo "✅ Health check tests completed!"
echo ""
echo "📊 Expected model status:"
echo "  - hallucination: loaded/ready"
echo "  - context: loaded/ready"
echo "  - faithfulness: loaded/ready"
echo "  - drift: loaded/ready"
echo "  - cost: loaded/ready"


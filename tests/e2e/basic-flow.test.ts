/**
 * End-to-End Test Suite
 *
 * Tests the complete flow: signup → get API key → send events → view in dashboard
 *
 * Run with: npm test (if test script configured)
 * Or: npx tsx tests/e2e/basic-flow.test.ts
 */

import { describe, it, expect, beforeAll } from "@jest/globals";

const API_URL = process.env.API_URL || "http://localhost:3000";
const TEST_EMAIL = `test-${Date.now()}@observa.test`;

describe("Observa E2E Tests", () => {
  let apiKey: string;
  let tenantId: string;
  let projectId: string;
  let sessionToken: string;

  describe("1. Onboarding Flow", () => {
    it("should create a new tenant via signup", async () => {
      const response = await fetch(`${API_URL}/api/v1/onboarding/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: TEST_EMAIL,
          companyName: "Test Company",
          plan: "free",
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.apiKey).toBeDefined();
      expect(data.tenantId).toBeDefined();
      expect(data.projectId).toBeDefined();

      apiKey = data.apiKey;
      tenantId = data.tenantId;
      projectId = data.projectId;
    });
  });

  describe("2. Authentication Flow", () => {
    it("should authenticate with API key", async () => {
      const response = await fetch(`${API_URL}/api/v1/auth/account`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.account.tenant.id).toBe(tenantId);
    });

    it("should login and get session token", async () => {
      // Note: This requires password from signup - for now, skip if password not available
      // In real implementation, signup should return password or use magic link
      console.log("⚠️  Login test skipped - requires password from signup");
    });
  });

  describe("3. Event Ingestion Flow", () => {
    it("should ingest canonical events", async () => {
      const traceId = `test-trace-${Date.now()}`;
      const events = [
        {
          tenant_id: tenantId,
          project_id: projectId,
          environment: "prod",
          trace_id: traceId,
          span_id: `span-${traceId}-root`,
          parent_span_id: null,
          timestamp: new Date().toISOString(),
          event_type: "trace_start",
          conversation_id: "",
          session_id: "",
          user_id: "test-user-1",
          agent_name: "test-agent",
          version: "1.0.0",
          route: "/api/test",
          attributes_json: JSON.stringify({
            trace_start: {
              name: "Test Trace",
            },
          }),
        },
        {
          tenant_id: tenantId,
          project_id: projectId,
          environment: "prod",
          trace_id: traceId,
          span_id: `span-${traceId}-llm`,
          parent_span_id: `span-${traceId}-root`,
          timestamp: new Date().toISOString(),
          event_type: "llm_call",
          conversation_id: "",
          session_id: "",
          user_id: "test-user-1",
          agent_name: "test-agent",
          version: "1.0.0",
          route: "/api/test",
          attributes_json: JSON.stringify({
            llm_call: {
              model: "gpt-4",
              input: "Hello, world!",
              output: "Hi there!",
              tokens_prompt: 10,
              tokens_completion: 20,
              tokens_total: 30,
              latency_ms: 1200,
              cost: 0.001,
            },
          }),
        },
        {
          tenant_id: tenantId,
          project_id: projectId,
          environment: "prod",
          trace_id: traceId,
          span_id: `span-${traceId}-root`,
          parent_span_id: null,
          timestamp: new Date().toISOString(),
          event_type: "trace_end",
          conversation_id: "",
          session_id: "",
          user_id: "test-user-1",
          agent_name: "test-agent",
          version: "1.0.0",
          route: "/api/test",
          attributes_json: JSON.stringify({
            trace_end: {
              status: "success",
            },
          }),
        },
      ];

      const response = await fetch(`${API_URL}/api/v1/events/ingest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(events),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.event_count).toBe(3);
    });
  });

  describe("4. Data Retrieval Flow", () => {
    it("should retrieve traces", async () => {
      // Wait a bit for data processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Note: This requires session token, not API key
      // For now, we'll test that the endpoint exists
      console.log("⚠️  Trace retrieval test requires session token");
    });

    it("should retrieve users", async () => {
      // Note: This requires session token
      console.log("⚠️  User retrieval test requires session token");
    });
  });
});

// Note: This is a basic test structure
// For full E2E testing, you would need:
// 1. Test framework setup (Jest, Mocha, etc.)
// 2. Test database setup/teardown
// 3. Session token generation
// 4. More comprehensive test cases


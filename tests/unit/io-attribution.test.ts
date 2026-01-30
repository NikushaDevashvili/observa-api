/**
 * Integration tests for input/output attribution (Langfuse parity)
 *
 * Verifies that:
 * - Trace-level input = user question, output = final answer
 * - TraceRecord includes session_id, user_id, environment
 *
 * Run with: npx tsx tests/unit/io-attribution.test.ts
 */

import { adaptObservaTraceToAgentPrism } from "../../src/services/agentPrismAdapter";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runTests() {
  // Test 1: traceRecord input/output from summary
  const trace1 = {
    summary: {
      trace_id: "test-1",
      tenant_id: "t1",
      project_id: "p1",
      start_time: "2024-01-01T00:00:00Z",
      end_time: "2024-01-01T00:00:01Z",
      total_latency_ms: 1000,
      total_tokens: 50,
      query: "User question here",
      response: "Final answer here",
    },
    spans: [
      {
        span_id: "root",
        parent_span_id: null,
        name: "Trace",
        start_time: "2024-01-01T00:00:00Z",
        end_time: "2024-01-01T00:00:01Z",
        duration_ms: 1000,
        isRootTrace: true,
        input: "User question here",
        output: "Final answer here",
      },
    ],
    signals: [],
  } as any;

  const result1 = adaptObservaTraceToAgentPrism(trace1);
  assert(
    result1.traceRecord.input === "User question here",
    "Expected traceRecord.input to be user question",
  );
  assert(
    result1.traceRecord.output === "Final answer here",
    "Expected traceRecord.output to be final answer",
  );
  console.log("✓ Test 1: traceRecord input/output from summary");

  // Test 2: session_id, user_id, environment in traceRecord
  const trace2 = {
    summary: {
      trace_id: "test-2",
      tenant_id: "t1",
      project_id: "p1",
      start_time: "2024-01-01T00:00:00Z",
      end_time: "2024-01-01T00:00:01Z",
      total_latency_ms: 500,
      session_id: "sess-123",
      user_id: "user-456",
      environment: "prod",
    },
    spans: [
      {
        span_id: "root",
        parent_span_id: null,
        name: "Trace",
        start_time: "2024-01-01T00:00:00Z",
        end_time: "2024-01-01T00:00:01Z",
        duration_ms: 500,
        isRootTrace: true,
      },
    ],
    signals: [],
  } as any;

  const result2 = adaptObservaTraceToAgentPrism(trace2);
  assert(
    result2.traceRecord.session_id === "sess-123",
    "Expected session_id in traceRecord",
  );
  assert(
    result2.traceRecord.user_id === "user-456",
    "Expected user_id in traceRecord",
  );
  assert(
    result2.traceRecord.environment === "prod",
    "Expected environment in traceRecord",
  );
  console.log("✓ Test 2: session_id, user_id, environment in traceRecord");

  console.log("\nAll I/O attribution tests passed.");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

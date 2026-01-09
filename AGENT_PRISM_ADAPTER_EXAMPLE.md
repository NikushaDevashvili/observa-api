# Agent-Prism Data Adapter Example

This document provides a concrete example of how to transform your Observa API trace format into agent-prism's expected format.

## Data Format Comparison

### Your Current Format (from API)

```typescript
// GET /api/v1/traces/:traceId?format=tree
{
  summary: {
    trace_id: "abc123",
    tenant_id: "tenant1",
    project_id: "project1",
    start_time: "2026-01-01T10:00:00.000Z",  // ISO string
    end_time: "2026-01-01T10:00:01.500Z",    // ISO string
    total_latency_ms: 1500,
    total_tokens: 727,
    model: "claude-3-opus",
    query: "User query text",
    response: "Response text",
    conversation_id: "conv123",
    session_id: "sess123",
    user_id: "user123",
    environment: "prod"
  },
  spans: [
    {
      id: "span-root",
      span_id: "span-root",
      parent_span_id: null,
      name: "Trace",
      start_time: "2026-01-01T10:00:00.000Z",  // ISO string
      end_time: "2026-01-01T10:00:01.500Z",    // ISO string
      duration_ms: 1500,
      events: [...],
      children: [
        {
          id: "span-retrieval",
          span_id: "span-retrieval",
          parent_span_id: "span-root",
          name: "Retrieval",
          start_time: "2026-01-01T10:00:00.000Z",
          end_time: "2026-01-01T10:00:00.180Z",
          duration_ms: 180,
          retrieval: {
            k: 5,
            latency_ms: 180,
            retrieval_context_ids: ["ctx1", "ctx2"],
            similarity_scores: [0.95, 0.89]
          },
          children: []
        },
        {
          id: "span-llm",
          span_id: "span-llm",
          parent_span_id: "span-root",
          name: "LLM Call: claude-3-opus",
          start_time: "2026-01-01T10:00:00.180Z",
          end_time: "2026-01-01T10:00:01.337Z",
          duration_ms: 1157,
          llm_call: {
            model: "claude-3-opus",
            input: "User query",
            output: "Response",
            input_tokens: 150,
            output_tokens: 577,
            total_tokens: 727,
            latency_ms: 1157,
            finish_reason: "stop"
          },
          children: []
        }
      ],
      metadata: {
        environment: "prod",
        conversation_id: "conv123"
      }
    }
  ],
  allSpans: [...],
  spansById: {...},
  signals: [...],
  analysis: {...}
}
```

### Agent-Prism Expected Format

```typescript
import type { TraceRecord, TraceSpan } from "@evilmartians/agent-prism-types";

{
  traceRecord: {
    id: "abc123",
    name: "User query text",
    spansCount: 3,
    durationMs: 1500,
    agentDescription: "claude-3-opus"
  },
  spans: [
    {
      id: "span-root",
      parentId: null,  // Note: parentId (camelCase)
      name: "Trace",
      startTime: 1704110400000,  // Unix timestamp in ms
      endTime: 1704110401500,    // Unix timestamp in ms
      duration: 1500,            // Duration in ms
      attributes: {
        // All metadata and type-specific data goes here
        environment: "prod",
        conversation_id: "conv123",
        // OpenTelemetry semantic conventions
        "gen_ai.request.model": "claude-3-opus",
        "gen_ai.usage.input_tokens": 150,
        "gen_ai.usage.output_tokens": 577
      },
      children: [
        {
          id: "span-retrieval",
          parentId: "span-root",
          name: "Retrieval",
          startTime: 1704110400000,
          endTime: 1704110400180,
          duration: 180,
          attributes: {
            "retrieval.top_k": 5,
            "retrieval.latency_ms": 180,
            // Custom attributes
            retrieval_context_ids: ["ctx1", "ctx2"],
            similarity_scores: [0.95, 0.89]
          },
          children: []
        },
        // ... more spans
      ]
    }
  ]
}
```

## Adapter Implementation

### TypeScript Adapter Function

```typescript
// adapter.ts
import type { TraceRecord, TraceSpan } from "@evilmartians/agent-prism-types";

// Your API response type (adjust to match your actual types)
interface ObservaTrace {
  summary: {
    trace_id: string;
    tenant_id: string;
    project_id: string;
    start_time: string;
    end_time: string;
    total_latency_ms: number | null;
    total_tokens: number | null;
    model: string | null;
    query: string | null;
    response: string | null;
    conversation_id?: string | null;
    session_id?: string | null;
    user_id?: string | null;
    environment?: string | null;
  };
  spans: ObservaSpan[];
  allSpans?: ObservaSpan[];
  spansById?: Record<string, ObservaSpan>;
  signals?: any[];
  analysis?: any;
}

interface ObservaSpan {
  id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string; // ISO string
  end_time: string; // ISO string
  duration_ms: number;
  events?: any[];
  children?: ObservaSpan[];
  metadata?: Record<string, any>;
  // Type-specific flattened data
  llm_call?: {
    model: string;
    input?: string | null;
    output?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
    latency_ms?: number | null;
    finish_reason?: string | null;
    cost?: number | null;
  };
  tool_call?: {
    tool_name: string;
    args?: any;
    result?: any;
    latency_ms?: number | null;
    result_status?: string;
  };
  retrieval?: {
    k?: number | null;
    top_k?: number | null;
    latency_ms?: number | null;
    retrieval_context_ids?: string[] | null;
    similarity_scores?: number[] | null;
  };
  output?: {
    final_output?: string | null;
    output_length?: number | null;
  };
}

/**
 * Convert ISO timestamp string to Unix milliseconds
 */
function isoToUnixMs(isoString: string): number {
  return new Date(isoString).getTime();
}

/**
 * Transform a single Observa span to Agent-Prism TraceSpan
 */
function transformSpan(span: ObservaSpan): TraceSpan {
  const startTime = isoToUnixMs(span.start_time);
  const endTime = isoToUnixMs(span.end_time);

  // Start with metadata as base attributes
  const attributes: Record<string, any> = {
    ...(span.metadata || {}),
    span_id: span.span_id,
    duration_ms: span.duration_ms,
  };

  // Add LLM call attributes (map to OpenTelemetry semantic conventions)
  if (span.llm_call) {
    const llm = span.llm_call;
    attributes["gen_ai.request.model"] = llm.model;
    attributes["gen_ai.usage.input_tokens"] = llm.input_tokens;
    attributes["gen_ai.usage.output_tokens"] = llm.output_tokens;
    attributes["gen_ai.usage.total_tokens"] = llm.total_tokens;
    attributes["gen_ai.response.finish_reasons"] = llm.finish_reason;
    attributes["gen_ai.usage.cost"] = llm.cost;

    // Also keep original structure for compatibility
    attributes["llm_call.model"] = llm.model;
    attributes["llm_call.input"] = llm.input;
    attributes["llm_call.output"] = llm.output;
    attributes["llm_call.input_tokens"] = llm.input_tokens;
    attributes["llm_call.output_tokens"] = llm.output_tokens;
    attributes["llm_call.total_tokens"] = llm.total_tokens;
    attributes["llm_call.latency_ms"] = llm.latency_ms;
    attributes["llm_call.finish_reason"] = llm.finish_reason;
    attributes["llm_call.cost"] = llm.cost;
  }

  // Add tool call attributes
  if (span.tool_call) {
    const tool = span.tool_call;
    attributes["tool.call.name"] = tool.tool_name;
    attributes["tool.call.args"] = tool.args;
    attributes["tool.call.result"] = tool.result;
    attributes["tool.call.latency_ms"] = tool.latency_ms;
    attributes["tool.call.result_status"] = tool.result_status;
  }

  // Add retrieval attributes
  if (span.retrieval) {
    const retrieval = span.retrieval;
    attributes["retrieval.top_k"] = retrieval.top_k || retrieval.k;
    attributes["retrieval.latency_ms"] = retrieval.latency_ms;
    attributes["retrieval.context_ids"] = retrieval.retrieval_context_ids;
    attributes["retrieval.similarity_scores"] = retrieval.similarity_scores;
  }

  // Add output attributes
  if (span.output) {
    attributes["output.final_output"] = span.output.final_output;
    attributes["output.output_length"] = span.output.output_length;
  }

  // Build TraceSpan object
  const traceSpan: TraceSpan = {
    id: span.span_id || span.id,
    parentId: span.parent_span_id,
    name: span.name,
    startTime,
    endTime,
    duration: span.duration_ms,
    attributes,
    // Recursively transform children
    children: span.children?.map(transformSpan) || [],
  };

  return traceSpan;
}

/**
 * Main adapter function: Convert Observa trace format to Agent-Prism format
 */
export function adaptObservaTraceToAgentPrism(observaTrace: ObservaTrace): {
  traceRecord: TraceRecord;
  spans: TraceSpan[];
} {
  const { summary, spans } = observaTrace;

  // Transform summary to TraceRecord
  const traceRecord: TraceRecord = {
    id: summary.trace_id,
    name: summary.query || "Trace", // Use query as trace name
    spansCount: spans.length,
    durationMs: summary.total_latency_ms || 0,
    agentDescription: summary.model || "", // Model name as agent description
  };

  // Transform all spans (recursive transformation handles children)
  const transformedSpans = spans.map(transformSpan);

  return {
    traceRecord,
    spans: transformedSpans,
  };
}
```

## Usage in React Component

```typescript
// TraceDetailPage.tsx
import { TraceViewer } from "./components/agent-prism/TraceViewer";
import { adaptObservaTraceToAgentPrism } from "./adapter";

export function TraceDetailPage({ traceId }: { traceId: string }) {
  const [traceData, setTraceData] = useState(null);

  useEffect(() => {
    // Fetch from your API
    fetch(`/api/v1/traces/${traceId}?format=tree`)
      .then((res) => res.json())
      .then((data) => {
        // Transform using adapter
        const agentPrismData = adaptObservaTraceToAgentPrism(data.trace);
        setTraceData(agentPrismData);
      });
  }, [traceId]);

  if (!traceData) return <div>Loading...</div>;

  return (
    <TraceViewer
      data={[traceData]} // Agent-Prism expects array of traces
    />
  );
}
```

## Alternative: Using OpenTelemetry Adapter

If you want to leverage agent-prism's OpenTelemetry adapter, you'd need to convert to OTLP format first:

```typescript
import { openTelemetrySpanAdapter } from "@evilmartians/agent-prism-data";

// Convert to OTLP-like format
function convertToOTLP(observaTrace: ObservaTrace): any {
  // This is a simplified example - full OTLP has more structure
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "observa" } },
          ],
        },
        scopeSpans: [
          {
            spans: observaTrace.spans.map((span) => ({
              traceId: observaTrace.summary.trace_id,
              spanId: span.span_id,
              parentSpanId: span.parent_span_id,
              name: span.name,
              startTimeUnixNano: isoToUnixMs(span.start_time) * 1000000, // OTLP uses nanoseconds
              endTimeUnixNano: isoToUnixMs(span.end_time) * 1000000,
              attributes: buildOTLPAttributes(span),
            })),
          },
        ],
      },
    ],
  };
}

function buildOTLPAttributes(span: ObservaSpan): any[] {
  const attrs: any[] = [];

  if (span.llm_call) {
    attrs.push({
      key: "gen_ai.request.model",
      value: { stringValue: span.llm_call.model },
    });
    attrs.push({
      key: "gen_ai.usage.input_tokens",
      value: { intValue: span.llm_call.input_tokens?.toString() },
    });
    // ... more attributes
  }

  return attrs;
}

// Then use the adapter
const otlpData = convertToOTLP(observaTrace);
const spans = openTelemetrySpanAdapter.convertRawDocumentsToSpans(otlpData);
```

**Note:** The direct adapter approach (first example) is simpler and more straightforward for your use case.

## Handling Signals and Analysis

Agent-Prism doesn't have built-in support for your `signals` and `analysis` objects. You have a few options:

### Option 1: Use Badges

```typescript
import type { BadgeProps } from "@evilmartians/agent-prism-types";

function getBadgesFromSignals(signals: any[]): BadgeProps[] {
  return signals.map((signal) => ({
    label: signal.signal_type,
    variant: signal.severity === "high" ? "error" : "warning",
    // Custom styling based on signal type
  }));
}

// Then use in TraceViewer
<TraceViewer
  data={[
    {
      ...traceData,
      badges: getBadgesFromSignals(observaTrace.signals || []),
    },
  ]}
/>;
```

### Option 2: Extend DetailsView

Create a custom wrapper that extends agent-prism's DetailsView to show analysis:

```typescript
import { DetailsView } from "./components/agent-prism/DetailsView";
import { AnalysisPanel } from "./AnalysisPanel"; // Your custom component

export function ExtendedDetailsView({
  span,
  analysis,
}: {
  span: TraceSpan;
  analysis?: any;
}) {
  return (
    <div>
      <DetailsView data={span} />
      {analysis && <AnalysisPanel analysis={analysis} />}
    </div>
  );
}
```

### Option 3: Add to Attributes

Include analysis results in span attributes:

```typescript
if (analysis) {
  attributes["analysis.is_hallucination"] = analysis.isHallucination;
  attributes["analysis.quality_score"] = analysis.qualityScore;
  // ... more analysis fields
}
```

## Testing the Adapter

```typescript
// adapter.test.ts
import { adaptObservaTraceToAgentPrism } from "./adapter";

describe("Adapter", () => {
  it("transforms Observa trace to Agent-Prism format", () => {
    const observaTrace = {
      summary: {
        trace_id: "test-123",
        start_time: "2026-01-01T10:00:00.000Z",
        end_time: "2026-01-01T10:00:01.000Z",
        total_latency_ms: 1000,
        model: "gpt-4",
        query: "Test query",
      },
      spans: [
        {
          id: "span-1",
          span_id: "span-1",
          parent_span_id: null,
          name: "Trace",
          start_time: "2026-01-01T10:00:00.000Z",
          end_time: "2026-01-01T10:00:01.000Z",
          duration_ms: 1000,
          children: [],
        },
      ],
    };

    const result = adaptObservaTraceToAgentPrism(observaTrace);

    expect(result.traceRecord.id).toBe("test-123");
    expect(result.traceRecord.name).toBe("Test query");
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].startTime).toBe(
      new Date("2026-01-01T10:00:00.000Z").getTime()
    );
  });
});
```

## Key Transformation Points

1. **Timestamps**: ISO string → Unix milliseconds (`new Date(isoString).getTime()`)
2. **Field Names**: `parent_span_id` → `parentId` (camelCase)
3. **Attributes**: Flatten `llm_call`, `tool_call`, etc. into `attributes` object
4. **Semantic Conventions**: Use OpenTelemetry naming (`gen_ai.request.model`, etc.)
5. **Children**: Recursive transformation maintains hierarchy
6. **TraceRecord**: Map `summary` → `TraceRecord` with required fields

## Next Steps

1. Copy the adapter function to your frontend codebase
2. Adjust types to match your exact API response
3. Test with real trace data
4. Integrate with TraceViewer component
5. Handle edge cases (missing fields, null values, etc.)







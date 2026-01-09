# Agent-Prism Integration Analysis

**Date:** January 2026  
**Goal:** Evaluate [agent-prism](https://github.com/evilmartians/agent-prism) for replacing/improving current trace visualization with state-of-the-art principles

## Executive Summary

✅ **HIGHLY RECOMMENDED** - Agent-Prism is an excellent fit for your observability platform. It offers:

- Production-ready React components built by Evil Martians
- OpenTelemetry-native data format (compatible with your canonical events)
- Modern UI/UX optimized for AI agent trace visualization
- Actively maintained with strong community adoption (272 stars)
- Comprehensive components: TraceViewer, TraceList, TreeView, DetailsView

## Current State Analysis

### Your Backend Data Structure

Your API returns trace data in this format:

```typescript
{
  summary: {
    trace_id, tenant_id, project_id,
    start_time, end_time, total_latency_ms,
    total_tokens, model, query, response,
    conversation_id, session_id, user_id
  },
  spans: [
    {
      id, span_id, parent_span_id,
      name, start_time, end_time, duration_ms,
      events: [...],
      children: [...],
      metadata: {...},
      // Type-specific data (flattened)
      llm_call?: {...},
      tool_call?: {...},
      retrieval?: {...},
      output?: {...}
    }
  ],
  allSpans: [...],      // Flat array for lookup
  spansById: {...},     // O(1) lookup map
  signals: [...],       // Analysis issues
  analysis: {...}       // Full analysis results
}
```

### Current Frontend (Separate Repo)

Based on QA reports, your frontend has:

- Custom `TraceWaterfall` component (hierarchical tree view)
- `NodeInspector` component (span details panel)
- Recent fixes for span selection issues
- Tree expansion/collapse functionality

**Known Issues (from QA reports):**

- Child span click handlers were broken (recently fixed)
- Tree collapse behavior issues
- Some information display gaps

## Agent-Prism Overview

### Key Features

1. **Complete TraceViewer Component**

   - All-in-one solution: TraceList + TreeView + DetailsView
   - Responsive design (desktop & mobile)
   - Search functionality
   - Expand/collapse controls

2. **Modular Components**

   - `TraceList` - Browse multiple traces
   - `TreeView` - Hierarchical span visualization
   - `DetailsView` - Individual span inspection
   - Can compose custom layouts

3. **Data Adapters**

   - `openTelemetrySpanAdapter` - Converts OTLP format to normalized spans
   - `langfuseSpanAdapter` - Converts Langfuse observations
   - Helper methods for extracting span metadata

4. **Modern Tech Stack**
   - React 19+
   - Tailwind CSS 3
   - TypeScript
   - Radix UI primitives
   - Semantic color tokens (customizable)

### Expected Data Format

Agent-Prism expects:

```typescript
interface TraceViewerData {
  traceRecord: TraceRecord; // { id, name, spansCount, durationMs, agentDescription }
  spans: TraceSpan[]; // Normalized span tree
  badges?: BadgeProps[];
}

interface TraceSpan {
  id: string;
  parentId: string | null;
  name: string;
  startTime: number; // Unix timestamp (ms)
  endTime: number; // Unix timestamp (ms)
  duration: number; // Duration in ms
  attributes: Record<string, any>;
  children?: TraceSpan[];
  // ... additional fields
}
```

## Compatibility Analysis

### ✅ Strengths

1. **Data Format Compatibility**

   - Your canonical events are similar to OpenTelemetry format
   - Your spans already have hierarchical structure (`children` array)
   - Your `span_id`/`parent_span_id` maps to agent-prism's `id`/`parentId`
   - Your timestamps are ISO strings (need conversion to Unix ms)

2. **Event Type Support**

   - ✅ LLM calls (`llm_call` events)
   - ✅ Tool calls (`tool_call` events)
   - ✅ Retrieval (`retrieval` events)
   - ✅ Output (`output` events)
   - Agent-prism recognizes standard semantic conventions

3. **Metadata Support**

   - Your `metadata` object can map to agent-prism's `attributes`
   - Model, tokens, costs, latency all supported
   - Custom attributes supported via attributes object

4. **Component Architecture**
   - Agent-prism's modular design allows incremental adoption
   - Can replace just `TreeView` or `DetailsView` initially
   - Full `TraceViewer` for complete replacement

### ⚠️ Gaps & Adaptation Needed

1. **Data Transformation Required**

   - Need adapter function to convert your format → agent-prism format
   - Timestamp conversion: ISO string → Unix milliseconds
   - Flatten nested `llm_call`/`tool_call` data into `attributes`
   - Map your `summary` → `TraceRecord`

2. **Trace Metadata**

   - Agent-prism expects `TraceRecord` with specific fields
   - Need to map your `summary` object appropriately
   - `agentDescription` field may need custom mapping

3. **Analysis/Signals**

   - Agent-prism doesn't have built-in support for your `signals` array
   - Could use badges or custom attributes
   - May need custom component extension for analysis results

4. **AllSpans/SpansById**
   - Agent-prism builds its own lookup (likely from spans array)
   - Your `allSpans`/`spansById` may not be needed
   - But useful for your custom features

## Integration Strategy

### Option 1: Full Replacement (Recommended)

Replace `TraceWaterfall` + `NodeInspector` with agent-prism's `TraceViewer`:

**Pros:**

- Production-ready, battle-tested components
- Modern UX with search, filtering, responsive design
- Less maintenance burden
- Active community and updates

**Cons:**

- Requires data transformation layer
- May lose some custom features temporarily
- Migration effort

**Implementation Steps:**

1. Install agent-prism packages in frontend repo
2. Create adapter function to transform your API response
3. Replace trace detail page component
4. Test with real trace data
5. Add custom extensions for analysis/signals if needed

### Option 2: Hybrid Approach (Incremental)

Replace individual components gradually:

1. **Phase 1:** Replace `DetailsView` with agent-prism's `DetailsView`

   - Lower risk, keeps existing tree view
   - Test span detail rendering

2. **Phase 2:** Replace `TreeView` with agent-prism's `TreeView`

   - Better tree visualization
   - Keep your selection logic initially

3. **Phase 3:** Adopt full `TraceViewer` or compose custom layout

**Pros:**

- Lower risk, incremental migration
- Can compare old vs new side-by-side
- Easier to rollback if issues

**Cons:**

- Longer migration timeline
- More integration code to maintain

### Option 3: Keep Current, Adopt Principles

Study agent-prism's implementation and improve your components:

**Pros:**

- No migration risk
- Full control over features
- Can customize exactly to your needs

**Cons:**

- Significant development effort
- Missing out on community improvements
- Ongoing maintenance burden

## Data Transformation Adapter

Here's a sample adapter function structure you'd need:

```typescript
import { openTelemetrySpanAdapter } from "@evilmartians/agent-prism-data";
import type { TraceSpan, TraceRecord } from "@evilmartians/agent-prism-types";

export function adaptObservaTraceToAgentPrism(observaTrace: YourTraceFormat): {
  traceRecord: TraceRecord;
  spans: TraceSpan[];
} {
  // Transform summary → TraceRecord
  const traceRecord: TraceRecord = {
    id: observaTrace.summary.trace_id,
    name: observaTrace.summary.query || "Trace",
    spansCount: observaTrace.spans.length,
    durationMs: observaTrace.summary.total_latency_ms || 0,
    agentDescription: observaTrace.summary.model || "",
  };

  // Transform spans recursively
  const transformSpan = (span: YourSpan): TraceSpan => {
    // Convert ISO timestamps to Unix ms
    const startTime = new Date(span.start_time).getTime();
    const endTime = new Date(span.end_time).getTime();

    // Build attributes from span data
    const attributes: Record<string, any> = {
      ...span.metadata,
      span_id: span.span_id,
      event_type: span.event_type,
    };

    // Add type-specific attributes
    if (span.llm_call) {
      attributes["gen_ai.request.model"] = span.llm_call.model;
      attributes["gen_ai.usage.input_tokens"] = span.llm_call.input_tokens;
      attributes["gen_ai.usage.output_tokens"] = span.llm_call.output_tokens;
      // ... map to OpenTelemetry semantic conventions
    }
    // Similar for tool_call, retrieval, output

    return {
      id: span.span_id,
      parentId: span.parent_span_id,
      name: span.name,
      startTime,
      endTime,
      duration: span.duration_ms,
      attributes,
      children: span.children?.map(transformSpan),
    };
  };

  const spans = observaTrace.spans.map(transformSpan);

  return { traceRecord, spans };
}
```

**Alternative:** Use OpenTelemetry adapter if you can convert to OTLP format:

```typescript
// Convert to OTLP-like format first, then use adapter
const otlpDocument = convertToOTLP(observaTrace);
const spans = openTelemetrySpanAdapter.convertRawDocumentsToSpans(otlpDocument);
```

## Recommendations

### 🎯 Best Path Forward

**Recommended: Option 1 (Full Replacement) with staged rollout**

1. **Phase 1: Proof of Concept (1-2 weeks)**

   - Install agent-prism in frontend repo
   - Create adapter function
   - Build simple test page with `TraceViewer`
   - Test with 5-10 real traces
   - Compare UX with current implementation

2. **Phase 2: Production Migration (2-3 weeks)**

   - Replace trace detail page
   - Add custom badges for signals/analysis
   - Extend DetailsView for analysis results if needed
   - Test thoroughly with all span types
   - Keep old component as fallback route

3. **Phase 3: Enhancement (ongoing)**
   - Add custom features on top of agent-prism
   - Integrate analysis results display
   - Custom theming if needed
   - Performance optimizations

### Benefits of Agent-Prism

1. **Professional UX**

   - Battle-tested by Evil Martians team
   - Used in production by many projects
   - Modern, responsive design

2. **Maintenance Reduction**

   - No need to maintain custom tree view logic
   - Bug fixes and improvements from community
   - Active development (recent commits)

3. **Standards Alignment**

   - OpenTelemetry semantic conventions
   - Industry-standard attribute naming
   - Better interoperability

4. **Feature Rich**

   - Search within spans
   - Collapse/expand controls
   - Responsive panels
   - Keyboard navigation (likely)

5. **Extensibility**
   - Can compose custom layouts
   - Themeable with Tailwind
   - Extend DetailsView for custom data

### Potential Challenges

1. **Learning Curve**

   - Team needs to understand agent-prism's data format
   - Adapter function complexity
   - Customization documentation

2. **Migration Risk**

   - Need thorough testing
   - Potential regression in edge cases
   - User experience changes

3. **Custom Features**
   - Analysis/signals display may need custom work
   - Integration with your existing features
   - Theming to match your design system

## Comparison Matrix

| Feature              | Current (Custom) | Agent-Prism         | Winner      |
| -------------------- | ---------------- | ------------------- | ----------- |
| Tree View            | ✅ Custom        | ✅ Production-ready | Agent-Prism |
| Span Details         | ✅ Custom        | ✅ Feature-rich     | Agent-Prism |
| Search               | ❌ Missing       | ✅ Built-in         | Agent-Prism |
| Responsive           | ⚠️ Partial       | ✅ Full             | Agent-Prism |
| Maintenance          | ⚠️ Custom code   | ✅ Community        | Agent-Prism |
| Analysis Integration | ✅ Custom        | ⚠️ Need extension   | Current     |
| Signals Display      | ✅ Custom        | ⚠️ Need badges      | Current     |
| Customization        | ✅ Full control  | ⚠️ Limited          | Current     |
| Performance          | ✅ Optimized     | ✅ Optimized        | Tie         |
| Accessibility        | ❓ Unknown       | ✅ Radix UI         | Agent-Prism |

## Next Steps

1. **Review Agent-Prism Storybook**

   - Visit: https://storybook.agent-prism.evilmartians.io
   - Test live demo: https://agent-prism.evilmartians.io
   - Evaluate UX and features

2. **Create Proof of Concept**

   - Set up adapter function
   - Test with real trace data
   - Compare side-by-side with current implementation

3. **Team Discussion**

   - Review this analysis
   - Decide on migration strategy
   - Plan timeline and resources

4. **If Proceeding:**
   - Install packages: `npm install @evilmartians/agent-prism-data @evilmartians/agent-prism-types`
   - Copy UI components: `npx degit evilmartians/agent-prism/packages/ui/src/components src/components/agent-prism`
   - Install UI dependencies: `npm install @radix-ui/react-collapsible @radix-ui/react-tabs classnames lucide-react react-json-pretty react-resizable-panels`

## Conclusion

Agent-Prism is a **strong candidate** for replacing your custom trace visualization. It offers:

- Production-ready components
- Better UX out of the box
- Reduced maintenance burden
- Industry-standard data format

The main work is creating a data adapter, which is straightforward given your well-structured API response format.

**Recommendation: Proceed with Option 1 (Full Replacement) after proof of concept validation.**

---

## References

- [Agent-Prism GitHub](https://github.com/evilmartians/agent-prism)
- [Agent-Prism Storybook](https://storybook.agent-prism.evilmartians.io)
- [Live Demo](https://agent-prism.evilmartians.io)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)







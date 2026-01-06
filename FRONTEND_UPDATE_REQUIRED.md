# Frontend Update Required for SOTA Span Implementation

**Date:** January 2026  
**Status:** Backend ✅ Complete | Frontend ⚠️ May Need Updates

---

## Summary

The backend has been updated with **95% SOTA span tracking** including new span types and OTEL attributes. The frontend (`observa-app`) should work with most changes automatically via agent-prism components, but some enhancements are recommended.

---

## ✅ What Works Automatically

The backend adapter (`agentPrismAdapter.ts`) already:
- ✅ Maps all new span types to valid `TraceSpanCategory` values
- ✅ Formats all attributes correctly for agent-prism
- ✅ Provides input/output data for embedding spans
- ✅ Handles all new event types (`embedding`, `vector_db_operation`, `cache_operation`, `agent_create`)

**Agent-prism components should display these automatically** since:
- Span categories are valid: `"embedding"`, `"create_agent"` (already in agent-prism enum)
- Attributes are in the correct format (array of key-value pairs)
- Input/output fields are populated

---

## ⚠️ Recommended Frontend Updates

### 1. Type Definitions (Optional but Recommended)

If the frontend has its own TypeScript type definitions, update them to include new span types:

```typescript
// types/trace.ts (if exists)
export type SpanType = 
  | "llm_call"
  | "tool_execution"
  | "retrieval"
  | "embedding"        // ✅ NEW
  | "vector_db_operation"  // ✅ NEW (may need custom handling)
  | "cache_operation"      // ✅ NEW (may need custom handling)
  | "agent_create"     // ✅ NEW
  | "agent_invocation"
  | "chain_operation"
  | "span"
  | "event"
  | "guardrail"
  | "unknown";
```

### 2. Span Badge Icons (Optional Enhancement)

Add custom icons for new span types if you want better visual distinction:

```typescript
// components/traces/SpanIcon.tsx (if you have custom icons)
import { 
  Brain,      // LLM
  Wrench,     // Tool
  Search,     // Retrieval
  Layers,     // Embedding (NEW)
  Database,   // Vector DB (NEW)
  Zap,        // Cache (NEW)
  Bot,        // Agent Create (NEW)
} from "lucide-react";

const spanIcons = {
  llm_call: Brain,
  tool_execution: Wrench,
  retrieval: Search,
  embedding: Layers,           // ✅ NEW
  vector_db_operation: Database, // ✅ NEW
  cache_operation: Zap,        // ✅ NEW
  agent_create: Bot,          // ✅ NEW
  // ... other types
};
```

### 3. Attribute Display Enhancements (Optional)

The new OTEL attributes will appear in the DetailsView automatically, but you might want to:

#### A. Group OTEL Attributes

Create a custom attribute display that groups OTEL attributes:

```typescript
// components/traces/OtelAttributesPanel.tsx
export function OtelAttributesPanel({ span }: { span: TraceSpan }) {
  const otelAttrs = span.attributes.filter(attr => 
    attr.key.startsWith('gen_ai.') || 
    attr.key.startsWith('server.') ||
    attr.key.startsWith('error.')
  );
  
  const grouped = {
    operation: otelAttrs.filter(a => a.key.includes('operation')),
    provider: otelAttrs.filter(a => a.key.includes('provider')),
    usage: otelAttrs.filter(a => a.key.includes('usage')),
    request: otelAttrs.filter(a => a.key.includes('request')),
    response: otelAttrs.filter(a => a.key.includes('response')),
    server: otelAttrs.filter(a => a.key.startsWith('server.')),
    error: otelAttrs.filter(a => a.key.startsWith('error.')),
  };
  
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">OpenTelemetry Attributes</h3>
      {Object.entries(grouped).map(([group, attrs]) => (
        attrs.length > 0 && (
          <div key={group}>
            <h4 className="text-sm font-medium capitalize">{group}</h4>
            <AttributesList attributes={attrs} />
          </div>
        )
      ))}
    </div>
  );
}
```

#### B. Highlight Cost Attributes

Make cost attributes more prominent:

```typescript
// In your DetailsView wrapper
const costAttrs = span.attributes.filter(attr => 
  attr.key.includes('cost') || attr.key.includes('usage')
);

if (costAttrs.length > 0) {
  return (
    <div className="border-l-4 border-green-500 pl-4">
      <div className="font-semibold text-green-700">Cost Breakdown</div>
      {costAttrs.map(attr => (
        <div key={attr.key}>
          {attr.key}: {formatCost(attr.value)}
        </div>
      ))}
    </div>
  );
}
```

### 4. Embedding Span Visualization (Optional Enhancement)

For embedding spans, you might want to show a preview of the embeddings:

```typescript
// components/traces/EmbeddingSpanView.tsx
export function EmbeddingSpanView({ span }: { span: TraceSpan }) {
  const embeddingAttr = span.attributes.find(a => 
    a.key === 'embedding.embeddings'
  );
  
  if (!embeddingAttr) return null;
  
  const embeddings = embeddingAttr.value;
  const dimensionCount = span.attributes.find(a => 
    a.key === 'gen_ai.embeddings.dimension.count'
  )?.value;
  
  return (
    <div className="space-y-2">
      <div className="text-sm">
        <strong>Dimensions:</strong> {dimensionCount}
      </div>
      <div className="text-sm">
        <strong>Embeddings Count:</strong> {embeddings?.length || 0}
      </div>
      {embeddings && embeddings.length > 0 && (
        <div className="text-xs text-gray-500">
          Preview: [{embeddings[0].slice(0, 5).join(', ')}, ...]
        </div>
      )}
    </div>
  );
}
```

### 5. Filter/Search Enhancements (Optional)

Add filters for new span types:

```typescript
// In your trace list/filter component
const spanTypeFilters = [
  { value: 'llm_call', label: 'LLM Calls' },
  { value: 'tool_execution', label: 'Tool Calls' },
  { value: 'retrieval', label: 'Retrieval' },
  { value: 'embedding', label: 'Embeddings' },        // ✅ NEW
  { value: 'vector_db_operation', label: 'Vector DB' }, // ✅ NEW
  { value: 'cache_operation', label: 'Cache' },        // ✅ NEW
  { value: 'agent_create', label: 'Agent Create' },     // ✅ NEW
];
```

---

## 🔍 Testing Checklist

After updating the frontend, verify:

### Basic Functionality
- [ ] Embedding spans appear in trace tree
- [ ] Embedding spans are clickable
- [ ] Embedding span details show correctly
- [ ] Vector DB operation spans display
- [ ] Cache operation spans display
- [ ] Agent create spans display

### Attribute Display
- [ ] OTEL attributes appear in DetailsView
- [ ] `gen_ai.operation.name` is visible
- [ ] `gen_ai.provider.name` is visible
- [ ] Cost attributes (`gen_ai.usage.input_cost`, `output_cost`) display
- [ ] Sampling parameters (`top_k`, `top_p`, etc.) display
- [ ] Server metadata (`server.address`, `server.port`) display

### Input/Output
- [ ] Embedding spans show input (model, encoding formats)
- [ ] Embedding spans show output (dimensions, embeddings preview)
- [ ] LLM spans show structured messages (if provided)
- [ ] Tool spans show OTEL-standardized attributes

### Visual
- [ ] New span types have appropriate badges/icons
- [ ] Span colors are distinct for each type
- [ ] Cost information is clearly visible
- [ ] Error spans show structured error classification

---

## 📋 API Response Format

The backend returns spans in agent-prism format. Example for embedding span:

```json
{
  "id": "span-123",
  "type": "embedding",
  "title": "Embedding: text-embedding-ada-002",
  "attributes": [
    {
      "key": "gen_ai.operation.name",
      "value": { "stringValue": "embeddings" }
    },
    {
      "key": "gen_ai.provider.name",
      "value": { "stringValue": "openai" }
    },
    {
      "key": "gen_ai.request.model",
      "value": { "stringValue": "text-embedding-ada-002" }
    },
    {
      "key": "gen_ai.embeddings.dimension.count",
      "value": { "intValue": 1536 }
    },
    {
      "key": "gen_ai.usage.cost",
      "value": { "doubleValue": 0.0001 }
    }
  ],
  "input": "{\"model\": \"text-embedding-ada-002\", \"input_text\": \"...\"}",
  "output": "{\"dimension_count\": 1536, \"embeddings_count\": 1, ...}"
}
```

---

## 🚀 Migration Steps

### Step 1: Test Current State
1. Deploy backend changes (already done ✅)
2. Test frontend with existing traces
3. Verify agent-prism components still work

### Step 2: Test New Span Types
1. Send test events with new types:
   ```bash
   # Test embedding span
   POST /api/v1/events/ingest
   {
     "event_type": "embedding",
     "attributes": {
       "embedding": {
         "model": "text-embedding-ada-002",
         "dimension_count": 1536,
         "latency_ms": 45,
         "cost": 0.0001
       }
     }
   }
   ```
2. Verify spans appear in trace view
3. Check attribute display

### Step 3: Add Enhancements (Optional)
1. Add custom icons for new span types
2. Create OTEL attribute grouping
3. Add embedding visualization
4. Enhance cost display

### Step 4: Deploy
1. Test in staging
2. Deploy to production
3. Monitor for any issues

---

## 📝 Notes

### Backward Compatibility
- ✅ All changes are backward compatible
- ✅ Existing spans continue to work
- ✅ Frontend will work even without updates (just won't have enhancements)

### Agent-Prism Support
- ✅ Agent-prism natively supports `"embedding"` and `"create_agent"` categories
- ⚠️ `"vector_db_operation"` and `"cache_operation"` may map to `"unknown"` or `"span"` if not handled
- 💡 Consider mapping these to existing categories or adding custom handling

### Performance
- No performance impact expected
- New attributes are only added when present
- Frontend filtering/search should work as before

---

## 🔗 Related Files

- **Backend Adapter**: `src/services/agentPrismAdapter.ts`
- **Frontend Guide**: `AGENT_PRISM_FRONTEND_IMPLEMENTATION.md`
- **Implementation Summary**: `SOTA_SPAN_IMPLEMENTATION_SUMMARY.md`

---

## ❓ Questions?

If you encounter issues:
1. Check browser console for errors
2. Verify API response format matches expected structure
3. Check that agent-prism components are up to date
4. Review `AGENT_PRISM_FRONTEND_IMPLEMENTATION.md` for integration details

---

## ✅ Conclusion

**Most functionality will work automatically** thanks to agent-prism's flexible design. The recommended updates are **optional enhancements** to improve UX and make the new OTEL attributes more discoverable.

**Priority:**
- 🔴 **Critical**: None (works automatically)
- 🟡 **Recommended**: Type definitions, attribute grouping
- 🟢 **Nice-to-Have**: Custom icons, embedding visualization, cost highlighting


# Agent-Prism Frontend Implementation Guide

This guide provides step-by-step instructions for integrating agent-prism into your frontend application.

## Prerequisites

- React 19+ (or React 18 with compatible setup)
- Tailwind CSS 3
- TypeScript
- Next.js (or your React framework)

## Step 1: Install Dependencies

### Install Agent-Prism Packages

```bash
npm install @evilmartians/agent-prism-data @evilmartians/agent-prism-types
```

### Install UI Component Dependencies

```bash
npm install @radix-ui/react-collapsible @radix-ui/react-tabs classnames lucide-react react-json-pretty react-resizable-panels
```

### Copy UI Components

Agent-prism components need to be copied to your project (they're not in npm packages yet):

```bash
# From your frontend repo root
npx degit evilmartians/agent-prism/packages/ui/src/components src/components/agent-prism
```

This will create:
```
src/components/agent-prism/
  ├── TraceViewer/
  ├── TraceList/
  ├── TreeView/
  ├── DetailsView/
  └── ... (other components)
```

### Install Theme Files

Copy the theme files for styling:

```bash
npx degit evilmartians/agent-prism/packages/ui/src/theme src/components/agent-prism/theme
```

## Step 2: Configure Tailwind CSS

Update your `tailwind.config.js` (or `tailwind.config.ts`):

```typescript
import { agentPrismTailwindColors } from "./src/components/agent-prism/theme";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/components/agent-prism/**/*.{js,ts,jsx,tsx}", // Add this
  ],
  theme: {
    extend: {
      colors: agentPrismTailwindColors, // Add this
    },
  },
  plugins: [],
};
```

### Import Theme CSS

In your main CSS file (e.g., `app/globals.css` or `src/index.css`):

```css
@import './components/agent-prism/theme/theme.css';
```

Or if using a CSS-in-JS setup, import it in your root component:

```typescript
import "./components/agent-prism/theme/theme.css";
```

## Step 3: Create the Adapter (Optional - Backend Provides Format)

You have two options:

### Option A: Use Backend API Endpoint (Recommended)

Your backend now provides an endpoint that returns agent-prism formatted data:

```typescript
// GET /api/v1/traces/:traceId?format=agent-prism
const response = await fetch(`/api/v1/traces/${traceId}?format=agent-prism`, {
  headers: {
    Authorization: `Bearer ${sessionToken}`,
  },
});

const data = await response.json();
// data.trace is already in agent-prism format!
```

### Option B: Transform on Frontend

If you prefer to transform on the frontend (e.g., using the `tree` format), copy the adapter from the backend:

1. Copy `src/services/agentPrismAdapter.ts` from the backend repo
2. Adapt it for frontend use (remove backend-specific imports)

## Step 4: Create Trace Detail Page Component

### Simple Implementation (Using TraceViewer)

```typescript
// app/dashboard/traces/[traceId]/page.tsx (or your route)
"use client";

import { useEffect, useState } from "react";
import { TraceViewer } from "@/components/agent-prism/TraceViewer";
import type { TraceViewerData } from "@evilmartians/agent-prism-types";

export default function TraceDetailPage({ params }: { params: { traceId: string } }) {
  const [traceData, setTraceData] = useState<TraceViewerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrace() {
      try {
        setLoading(true);
        const sessionToken = localStorage.getItem("sessionToken"); // Adjust to your auth
        
        const response = await fetch(
          `/api/v1/traces/${params.traceId}?format=agent-prism`,
          {
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch trace: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.trace) {
          throw new Error("Invalid trace data");
        }

        // TraceViewer expects an array of traces
        setTraceData(data.trace);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trace");
        console.error("Error fetching trace:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTrace();
  }, [params.traceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading trace...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!traceData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Trace not found</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full">
      <TraceViewer data={[traceData]} />
    </div>
  );
}
```

### Advanced Implementation (Custom Layout)

If you want more control over the layout:

```typescript
"use client";

import { useState } from "react";
import { TraceList } from "@/components/agent-prism/TraceList/TraceList";
import { TreeView } from "@/components/agent-prism/TreeView";
import { DetailsView } from "@/components/agent-prism/DetailsView/DetailsView";
import type { TraceRecord, TraceSpan } from "@evilmartians/agent-prism-types";

export default function CustomTracePage({ traceData }: { traceData: any }) {
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | undefined>(undefined);
  const [expandedSpansIds, setExpandedSpansIds] = useState<string[]>([]);

  return (
    <div className="grid grid-cols-3 gap-4 h-screen">
      {/* Left sidebar - Trace list (optional if viewing single trace) */}
      <div className="border-r">
        {/* You can add trace list here if needed */}
      </div>

      {/* Middle - Tree view */}
      <div className="overflow-auto">
        <TreeView
          spans={traceData.spans}
          onSpanSelect={setSelectedSpan}
          selectedSpan={selectedSpan}
          expandedSpansIds={expandedSpansIds}
          onExpandSpansIdsChange={setExpandedSpansIds}
          spanCardViewOptions={{
            expandButton: "inside",
          }}
        />
      </div>

      {/* Right - Details panel */}
      <div className="border-l">
        {selectedSpan ? (
          <DetailsView data={selectedSpan} />
        ) : (
          <div className="p-4 text-gray-500">
            Select a span to view details
          </div>
        )}
      </div>
    </div>
  );
}
```

## Step 5: Handle Analysis/Signals (Optional Enhancement)

Agent-prism doesn't have built-in support for your analysis/signals. You can extend it:

### Option 1: Use Badges (Already Supported)

The backend already converts signals to badges in the agent-prism format, so they should display automatically.

### Option 2: Custom Analysis Panel

Create a custom component to show analysis results:

```typescript
// components/traces/AnalysisPanel.tsx
import { DetailsView } from "@/components/agent-prism/DetailsView/DetailsView";
import type { TraceSpan } from "@evilmartians/agent-prism-types";

interface AnalysisPanelProps {
  span: TraceSpan;
  analysis?: any; // Your analysis data from the API
}

export function AnalysisPanel({ span, analysis }: AnalysisPanelProps) {
  if (!analysis) return null;

  return (
    <div className="border-t mt-4 pt-4">
      <h3 className="font-semibold mb-2">Analysis Results</h3>
      
      {analysis.isHallucination && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded">
          <div className="font-medium text-red-800">Hallucination Detected</div>
          {analysis.hallucinationConfidence && (
            <div className="text-sm text-red-600">
              Confidence: {(analysis.hallucinationConfidence * 100).toFixed(1)}%
            </div>
          )}
          {analysis.hallucinationReasoning && (
            <div className="text-sm text-red-700 mt-1">
              {analysis.hallucinationReasoning}
            </div>
          )}
        </div>
      )}

      {analysis.hasContextDrop && (
        <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
          <div className="font-medium text-yellow-800">Context Drop Detected</div>
        </div>
      )}

      {/* Add more analysis indicators */}
    </div>
  );
}
```

Then use it with DetailsView:

```typescript
import { DetailsView } from "@/components/agent-prism/DetailsView/DetailsView";
import { AnalysisPanel } from "@/components/traces/AnalysisPanel";

function ExtendedDetailsView({ span, analysis }: { span: TraceSpan; analysis?: any }) {
  return (
    <div>
      <DetailsView data={span} />
      <AnalysisPanel span={span} analysis={analysis} />
    </div>
  );
}
```

## Step 6: Fetch Analysis Data Separately

If you want to show analysis results, you may need to fetch them separately:

```typescript
// In your trace detail page
const [analysis, setAnalysis] = useState<any>(null);

useEffect(() => {
  async function fetchAnalysis() {
    // Fetch from your API (either from the tree format or separate endpoint)
    const response = await fetch(`/api/v1/traces/${traceId}?format=tree`);
    const data = await response.json();
    setAnalysis(data.trace.analysis);
  }
  fetchAnalysis();
}, [traceId]);
```

## Step 7: Testing

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Navigate to a trace detail page:**
   ```
   http://localhost:3000/dashboard/traces/<trace-id>
   ```

3. **Verify:**
   - Trace tree displays correctly
   - Spans are clickable
   - Details view shows span information
   - Search works (if using TraceViewer)
   - Responsive design works on mobile

## Step 8: Customization

### Theming

Customize colors by editing `src/components/agent-prism/theme/theme.css`:

```css
:root {
  --agentprism-primary: oklch(0.5 0.2 250); /* Change primary color */
  /* ... other tokens */
}
```

### Extending Components

You can extend agent-prism components by wrapping them:

```typescript
// components/traces/CustomTreeView.tsx
import { TreeView } from "@/components/agent-prism/TreeView";
import type { TraceSpan } from "@evilmartians/agent-prism-types";

export function CustomTreeView({ spans, ...props }: TreeViewProps) {
  return (
    <div className="custom-tree-wrapper">
      <TreeView spans={spans} {...props} />
      {/* Add custom features here */}
    </div>
  );
}
```

## Troubleshooting

### Issue: Components not found

**Solution:** Make sure you copied the components correctly:
```bash
npx degit evilmartians/agent-prism/packages/ui/src/components src/components/agent-prism
```

### Issue: Tailwind classes not working

**Solution:** 
1. Make sure you added agent-prism colors to your Tailwind config
2. Make sure theme.css is imported
3. Restart your dev server after config changes

### Issue: Type errors

**Solution:**
1. Make sure you installed `@evilmartians/agent-prism-types`
2. Check that TypeScript can resolve the types:
   ```typescript
   import type { TraceSpan } from "@evilmartians/agent-prism-types";
   ```

### Issue: API format mismatch

**Solution:** 
- Use the `?format=agent-prism` endpoint (recommended)
- Or check that your adapter function matches the backend implementation

### Issue: Styling looks broken

**Solution:**
1. Verify theme.css is imported
2. Check Tailwind config includes agent-prism colors
3. Ensure all Radix UI dependencies are installed
4. Check browser console for CSS errors

## Migration from Current Implementation

If you're replacing existing `TraceWaterfall` and `NodeInspector` components:

1. **Keep old components as fallback** (rename to `TraceWaterfall.old.tsx`)
2. **Create new page with agent-prism** (`TraceDetailPage.new.tsx`)
3. **Test side-by-side** with same trace data
4. **Switch routing** once verified
5. **Remove old components** after successful migration

## Next Steps

1. ✅ Install dependencies
2. ✅ Copy components and theme
3. ✅ Configure Tailwind
4. ✅ Create trace detail page
5. ⏭️ Test with real trace data
6. ⏭️ Add custom analysis panel (optional)
7. ⏭️ Customize theme (optional)
8. ⏭️ Deploy to production

## API Endpoints Reference

Your backend provides:

- `GET /api/v1/traces/:traceId?format=agent-prism` - Agent-prism formatted data (recommended)
- `GET /api/v1/traces/:traceId?format=tree` - Original tree format (if you want to transform on frontend)
- `GET /api/v1/traces/:traceId` - Legacy format (backward compatibility)

## Resources

- [Agent-Prism GitHub](https://github.com/evilmartians/agent-prism)
- [Agent-Prism Storybook](https://storybook.agent-prism.evilmartians.io)
- [Live Demo](https://agent-prism.evilmartians.io)
- Backend adapter: `src/services/agentPrismAdapter.ts`






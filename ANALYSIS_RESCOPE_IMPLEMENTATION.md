# Analysis Rescope Implementation (SOTA)

**Date:** January 2, 2025  
**Status:** ✅ Implemented

## Overview

Refactored analysis system from "always-on truth checker" to **event-driven Layer 3/4 signals dispatcher** with job queue architecture.

## Architecture

### Before (Old Approach)
- ❌ Always-on analysis for every trace
- ❌ Direct synchronous calls to Python service
- ❌ Stored results in `analysis_results` table as primary data
- ❌ Blocked ingestion pipeline
- ❌ No cost control or sampling

### After (SOTA Approach)
- ✅ **Event-driven**: Only triggers on high-severity signals or explicit requests
- ✅ **Job queue**: Async processing via BullMQ/Redis
- ✅ **Layer 3/4 only**: Cheap embeddings + expensive judges (not always-on)
- ✅ **Signal-based storage**: Results stored as signals, not primary trace data
- ✅ **Sampling support**: Can sample traces for QA/regression
- ✅ **Non-blocking**: Never blocks ingestion pipeline
- ✅ **Cost-efficient**: Only analyzes when needed

## Components

### 1. AnalysisDispatcher (`src/services/analysisDispatcher.ts`)

**Purpose:** Queue analysis jobs based on triggers

**Key Functions:**
- `queueAnalysisForHighSeveritySignal()` - Queue when high-severity signals detected
- `queueAnalysisForExplicitRequest()` - Queue for user-initiated analysis
- `queueSampledAnalysis()` - Queue for sampled traces (QA/regression)

**Features:**
- Graceful degradation if Redis not available
- Priority-based job queuing (high-severity gets priority)
- Job retry with exponential backoff
- Queue statistics for monitoring

### 2. AnalysisWorker (`src/services/analysisWorker.ts`)

**Purpose:** Process analysis jobs from queue

**Key Functions:**
- `processLayer3()` - Cheap semantic signals (embeddings, clustering, drift)
- `processLayer4()` - Expensive checks (LLM judges, classifiers)
- `storeAnalysisSignals()` - Store results as signals (not in analysis_results)

**Features:**
- Concurrent processing (up to 5 jobs)
- Rate limiting (10 jobs/minute)
- Automatic retry on failure
- Stores results as Layer 3/4 signals

### 3. SignalsService Integration

**Updated:** `src/services/signalsService.ts`

**Changes:**
- Detects high-severity signals (severity: "high" or "medium")
- Automatically queues analysis jobs when high-severity signals detected
- Extracts trace data from events for analysis
- Non-blocking (doesn't fail ingestion if queue unavailable)

## Data Flow

```
1. Events ingested → SignalsService.processEvents()
2. Layer 2 signals generated (latency, errors, loops, spikes)
3. High-severity signals detected → AnalysisDispatcher.queueAnalysisForHighSeveritySignal()
4. Job queued in Redis/BullMQ
5. AnalysisWorker picks up job
6. Layer 3/4 processing (embeddings, judges)
7. Results stored as signals (not in analysis_results)
```

## Layer 3 vs Layer 4

### Layer 3: Cheap Semantic Signals
- **When:** Sampled traces, explicit requests
- **Cost:** Low (cached embeddings)
- **Examples:**
  - Embedding clustering
  - Semantic drift detection
  - Duplicate/spam detection
- **Stored as:** Signals with `layer: "layer3"`

### Layer 4: Expensive Checks
- **When:** High-severity signals, explicit requests
- **Cost:** High (LLM judges, classifiers)
- **Examples:**
  - Faithfulness scoring
  - Context relevance scoring
  - Quality scoring
  - Potential hallucination detection
- **Stored as:** Signals with `layer: "layer4"`

## Configuration

### Environment Variables

```bash
# Required for job queue (optional - graceful degradation if not set)
REDIS_URL=redis://localhost:6379
# or for serverless
UPSTASH_REDIS_URL=redis://default:xxx@xxx.upstash.io:6379

# Required for analysis service
ANALYSIS_SERVICE_URL=http://localhost:8000
```

### Analysis Service Endpoints

The Python analysis service should expose:

- `POST /analyze/layer3` - Layer 3 processing (embeddings)
- `POST /analyze/layer4` - Layer 4 processing (judges)

## Running the Worker

### Development
```bash
npm run worker
# or with watch
npm run worker:watch
```

### Production
Run as separate service/container:
```bash
node dist/worker.js
```

## Migration from Old System

### Old Code (Remove)
```typescript
// ❌ Old approach - direct call
AnalysisService.analyzeTrace(trace).catch((error) => {
  console.error("Failed to analyze:", error);
});
```

### New Code (Automatic)
```typescript
// ✅ New approach - event-driven via SignalsService
// No code needed - automatically triggered by high-severity signals
```

## Signal Storage Format

Analysis results are stored as signals with this structure:

```typescript
{
  tenant_id: string;
  project_id: string;
  trace_id: string;
  span_id: string;
  signal_name: "faithfulness_score" | "context_relevance_score" | "quality_score" | "potential_hallucination" | "embedding_cluster" | "semantic_drift" | "duplicate_output";
  signal_type: "threshold";
  signal_value: number | boolean;
  signal_severity: "low" | "medium" | "high";
  metadata: {
    score?: number;
    reasoning?: string;
    cluster_id?: string;
    // ... other metadata
  };
  layer: "layer3" | "layer4";
}
```

## Benefits

1. **Cost Efficiency**: Only analyzes when needed (high-severity or explicit)
2. **Scalability**: Job queue handles bursts, retries, rate limiting
3. **Non-blocking**: Never blocks ingestion pipeline
4. **Flexibility**: Can add new analysis types without schema changes
5. **Observability**: All results stored as signals (queryable, filterable)
6. **Sampling**: Can sample traces for QA/regression testing

## Monitoring

### Queue Statistics
```typescript
import { getQueueStats } from "./services/analysisDispatcher.js";

const stats = await getQueueStats();
// { waiting: 5, active: 2, completed: 100, failed: 3 }
```

### Signal Queries
Query analysis signals via Tinybird:
```sql
SELECT * FROM canonical_events
WHERE event_type = 'error'
  AND JSON_EXTRACT_STRING(attributes_json, '$.signal.layer') IN ('layer3', 'layer4')
  AND trace_id = 'xxx'
```

## Future Enhancements

1. **Postgres-based queue fallback** (if Redis unavailable)
2. **Batch processing** (process multiple traces together)
3. **Custom analysis triggers** (user-defined rules)
4. **Analysis result caching** (avoid re-analyzing similar traces)
5. **Multi-region queue support** (for global deployments)

## Testing

### Test Queue
```typescript
import { queueAnalysisForExplicitRequest } from "./services/analysisDispatcher.js";

await queueAnalysisForExplicitRequest(
  "trace-id",
  "tenant-id",
  "project-id",
  ["layer4"],
  { query: "...", response: "..." }
);
```

### Test Worker
```bash
# Start worker
npm run worker

# Queue a test job (via API or directly)
# Worker should pick it up and process
```

## Troubleshooting

### Queue Not Processing
- Check Redis connection: `redis-cli ping`
- Check worker is running: `npm run worker`
- Check logs for errors

### Analysis Service Not Called
- Verify `ANALYSIS_SERVICE_URL` is set
- Check worker logs for connection errors
- Verify analysis service endpoints exist

### Signals Not Stored
- Check Tinybird connection
- Verify `CanonicalEventService.forwardToTinybird()` is working
- Check worker logs for storage errors

## Status

✅ **Completed:**
- AnalysisDispatcher service
- AnalysisWorker service
- SignalsService integration
- Worker entry point
- Environment configuration
- Documentation

🔄 **Next Steps:**
- Deploy worker as separate service
- Configure Redis (Upstash for serverless)
- Update Python analysis service to support Layer 3/4 endpoints
- Monitor queue performance
- Add Postgres-based queue fallback (optional)



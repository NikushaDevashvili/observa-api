# Analysis Rescope - Finalization Checklist

**Date:** January 2, 2025  
**Status:** 🟡 90% Complete - Final touches needed

## ✅ Completed Items

1. ✅ AnalysisDispatcher service created
2. ✅ AnalysisWorker service created
3. ✅ Worker entry point created
4. ✅ SignalsService integration (triggers dispatcher)
5. ✅ Removed direct AnalysisService.analyzeTrace() calls
6. ✅ TypeScript compilation passes
7. ✅ Build successful
8. ✅ Documentation created

## 🔧 Remaining Items to Finalize

### 1. Clean Up Unused Imports (Quick Fix)

**File:** `src/routes/traces.ts`
- ❌ Still imports `AnalysisService` but doesn't use it
- **Action:** Remove unused import

### 2. Deprecate Old AnalysisService (Backward Compatibility)

**File:** `src/services/analysisService.ts`
- ⚠️ Still used by `TraceQueryService.getAnalysisResults()` for reading old data
- **Action:** 
  - Add deprecation notice to class
  - Keep `getAnalysisResults()` methods for backward compatibility
  - Document that new analysis results come from signals

### 3. Add API Endpoint for Explicit Analysis Requests

**New File:** `src/routes/analysis.ts` (or add to existing routes)
- ❌ Users need a way to explicitly request analysis
- **Action:** Create endpoint like `POST /api/v1/analysis/analyze` that:
  - Accepts trace_id
  - Queues analysis job via `queueAnalysisForExplicitRequest()`
  - Returns job status

### 4. Update TraceQueryService to Read Signals

**File:** `src/services/traceQueryService.ts`
- ⚠️ Currently reads from `analysis_results` table (backward compatibility)
- **Action:** 
  - Add method to read analysis signals from Tinybird
  - Optionally migrate to signals-based queries
  - Keep backward compatibility for now

### 5. Worker Deployment Instructions

**File:** `ANALYSIS_RESCOPE_IMPLEMENTATION.md`
- ❌ Missing deployment instructions
- **Action:** Add section on:
  - How to deploy worker as separate service
  - Vercel/Serverless considerations
  - Docker deployment option
  - Monitoring worker health

### 6. Test Worker Startup

**Action:** 
- Test that worker can start: `npm run worker`
- Verify Redis connection (or graceful degradation)
- Test job processing flow

### 7. Environment Variable Documentation

**File:** `ENV_QUICK_REFERENCE.md` or `ENV_SETUP_GUIDE.md`
- ❌ Missing Redis/Upstash configuration
- **Action:** Add:
  - `REDIS_URL` or `UPSTASH_REDIS_URL` setup
  - `ANALYSIS_SERVICE_URL` for Layer 3/4 endpoints
  - Optional vs required flags

### 8. Add Queue Monitoring Endpoint

**New:** Add to `src/routes/analysis.ts` or admin routes
- ❌ No way to monitor queue health
- **Action:** Create `GET /api/v1/analysis/queue/stats` that:
  - Returns queue statistics (waiting, active, completed, failed)
  - Shows if queue is available

### 9. Error Handling Improvements

**Files:** `analysisDispatcher.ts`, `analysisWorker.ts`
- ⚠️ Basic error handling exists
- **Action:** 
  - Add retry logic for failed jobs
  - Add dead letter queue for permanently failed jobs
  - Add alerting for queue failures

### 10. Migration Guide for Python Analysis Service

**New File:** `ANALYSIS_SERVICE_MIGRATION.md`
- ❌ Python service needs to support new endpoints
- **Action:** Document:
  - New endpoint structure: `/analyze/layer3` and `/analyze/layer4`
  - Request/response format
  - Migration from old `/analyze` endpoint

## Priority Order

### High Priority (Must Do)
1. ✅ Remove unused import (1 min)
2. ✅ Add explicit analysis API endpoint (30 min)
3. ✅ Add deprecation notice to AnalysisService (5 min)
4. ✅ Test worker startup (10 min)

### Medium Priority (Should Do)
5. Add queue monitoring endpoint (20 min)
6. Update environment variable docs (10 min)
7. Add worker deployment instructions (30 min)

### Low Priority (Nice to Have)
8. Update TraceQueryService to read signals (1-2 hours)
9. Improve error handling (1 hour)
10. Create Python service migration guide (30 min)

## Quick Wins (Do These First)

1. **Remove unused import** - 1 line change
2. **Add deprecation notice** - 5 lines
3. **Test worker** - Run `npm run worker` and verify it starts

## Estimated Time to 100% Complete

- **Quick wins:** 15 minutes
- **High priority:** 1 hour
- **Medium priority:** 1 hour
- **Low priority:** 3-4 hours

**Total:** ~5-6 hours to fully finalize

## Testing Checklist

- [ ] Worker starts without errors
- [ ] Queue initializes (or degrades gracefully)
- [ ] High-severity signals trigger analysis jobs
- [ ] Explicit analysis endpoint works
- [ ] Queue stats endpoint works
- [ ] Worker processes jobs successfully
- [ ] Signals are stored correctly
- [ ] Backward compatibility maintained (old analysis_results still readable)



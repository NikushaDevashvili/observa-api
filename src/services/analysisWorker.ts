/**
 * Analysis Worker (Layer 3/4 Processing)
 * 
 * Processes analysis jobs from the queue
 * - Layer 3: Cheap semantic signals (embeddings, clustering)
 * - Layer 4: Expensive checks (LLM judges, classifiers)
 * 
 * Stores results as signals (not in analysis_results table)
 */

import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { AnalysisJob } from "./analysisDispatcher.js";
import { SignalsService, Signal } from "./signalsService.js";
import { CanonicalEventService } from "./canonicalEventService.js";
import { TinybirdCanonicalEvent, EventType } from "../types/events.js";

let analysisWorker: Worker<AnalysisJob> | null = null;
let redisClient: Redis | null = null;

/**
 * Initialize analysis worker
 * This should be called in a separate process/worker (not in API server)
 */
export function initializeAnalysisWorker(): void {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

  if (!redisUrl) {
    console.warn(
      "[AnalysisWorker] REDIS_URL not set - worker will not start"
    );
    return;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    analysisWorker = new Worker<AnalysisJob>(
      "analysis-jobs",
      async (job: Job<AnalysisJob>) => {
        return await processAnalysisJob(job.data);
      },
      {
        connection: redisClient,
        concurrency: 5, // Process up to 5 jobs concurrently
        limiter: {
          max: 10, // Max 10 jobs
          duration: 60000, // Per minute (rate limit to avoid overwhelming analysis service)
        },
      }
    );

    // Event handlers
    analysisWorker.on("completed", (job) => {
      console.log(
        `[AnalysisWorker] ✅ Completed analysis job for trace ${job.data.trace_id}`
      );
    });

    analysisWorker.on("failed", (job, err) => {
      console.error(
        `[AnalysisWorker] ❌ Failed analysis job for trace ${job?.data.trace_id}:`,
        err
      );
    });

    analysisWorker.on("error", (err) => {
      console.error("[AnalysisWorker] Worker error:", err);
    });

    console.log("[AnalysisWorker] ✅ Analysis worker initialized and listening for jobs");
  } catch (error) {
    console.error("[AnalysisWorker] ❌ Failed to initialize worker:", error);
  }
}

/**
 * Process a single analysis job
 */
async function processAnalysisJob(job: AnalysisJob): Promise<void> {
  const { trace_id, tenant_id, project_id, layers, trigger } = job;

  console.log(
    `[AnalysisWorker] Processing analysis job for trace ${trace_id} (layers: ${layers.join(", ")}, trigger: ${trigger})`
  );

  const signals: Signal[] = [];

  // Process Layer 3: Cheap semantic signals (embeddings, clustering)
  if (layers.includes("layer3")) {
    try {
      const layer3Signals = await processLayer3(job);
      signals.push(...layer3Signals);
    } catch (error) {
      console.error(
        `[AnalysisWorker] Layer 3 processing failed for trace ${trace_id}:`,
        error
      );
      // Don't throw - continue with Layer 4 if needed
    }
  }

  // Process Layer 4: Expensive checks (LLM judges, classifiers)
  if (layers.includes("layer4")) {
    try {
      const layer4Signals = await processLayer4(job);
      signals.push(...layer4Signals);
    } catch (error) {
      console.error(
        `[AnalysisWorker] Layer 4 processing failed for trace ${trace_id}:`,
        error
      );
      // Don't throw - store what we have
    }
  }

  // Store signals as canonical events
  if (signals.length > 0) {
    await storeAnalysisSignals(signals, job);
    console.log(
      `[AnalysisWorker] ✅ Stored ${signals.length} analysis signals for trace ${trace_id}`
    );
  } else {
    console.log(
      `[AnalysisWorker] No signals generated for trace ${trace_id}`
    );
  }
}

/**
 * Process Layer 3: Cheap semantic signals
 * - Embeddings for clustering
 * - Semantic drift detection
 * - Duplicate/spam detection
 */
async function processLayer3(job: AnalysisJob): Promise<Signal[]> {
  const signals: Signal[] = [];
  const analysisServiceUrl = process.env.ANALYSIS_SERVICE_URL;

  if (!analysisServiceUrl) {
    console.warn(
      "[AnalysisWorker] ANALYSIS_SERVICE_URL not set, skipping Layer 3"
    );
    return signals;
  }

  try {
    // Call analysis service for Layer 3 (embeddings)
    const response = await fetch(`${analysisServiceUrl}/analyze/layer3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trace_id: job.trace_id,
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        query: job.query,
        context: job.context,
        response: job.response,
        model: job.model,
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout for Layer 3
    });

    if (!response.ok) {
      throw new Error(`Analysis service returned ${response.status}`);
    }

    const result = await response.json();

    // Convert analysis results to signals
    if (result.embedding_cluster_id) {
      signals.push({
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        trace_id: job.trace_id,
        span_id: job.span_id || job.trace_id,
        signal_name: "embedding_cluster",
        signal_type: "threshold",
        signal_value: result.embedding_cluster_id,
        signal_severity: "low",
        metadata: {
          cluster_id: result.embedding_cluster_id,
          similarity_score: result.similarity_score,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (result.semantic_drift_score !== undefined) {
      signals.push({
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        trace_id: job.trace_id,
        span_id: job.span_id || job.trace_id,
        signal_name: "semantic_drift",
        signal_type: "threshold",
        signal_value: result.semantic_drift_score,
        signal_severity: result.semantic_drift_score > 0.7 ? "high" : "medium",
        metadata: {
          drift_score: result.semantic_drift_score,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (result.is_duplicate) {
      signals.push({
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        trace_id: job.trace_id,
        span_id: job.span_id || job.trace_id,
        signal_name: "duplicate_output",
        signal_type: "threshold",
        signal_value: true,
        signal_severity: "low",
        metadata: {
          duplicate_count: result.duplicate_count,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(
      `[AnalysisWorker] Layer 3 processing error for trace ${job.trace_id}:`,
      error
    );
    // Don't throw - return empty signals
  }

  return signals;
}

/**
 * Process Layer 4: Expensive checks (LLM judges, classifiers)
 * Only run for high-severity traces or explicit requests
 */
async function processLayer4(job: AnalysisJob): Promise<Signal[]> {
  const signals: Signal[] = [];
  const analysisServiceUrl = process.env.ANALYSIS_SERVICE_URL;

  if (!analysisServiceUrl) {
    console.warn(
      "[AnalysisWorker] ANALYSIS_SERVICE_URL not set, skipping Layer 4"
    );
    return signals;
  }

  try {
    // Call analysis service for Layer 4 (judges)
    const response = await fetch(`${analysisServiceUrl}/analyze/layer4`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trace_id: job.trace_id,
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        query: job.query,
        context: job.context,
        response: job.response,
        model: job.model,
        tokens_total: job.tokens_total,
        latency_ms: job.latency_ms,
        cost: job.cost,
        trigger: job.trigger,
        signal_names: job.signal_names,
      }),
      signal: AbortSignal.timeout(60000), // 60s timeout for Layer 4
    });

    if (!response.ok) {
      throw new Error(`Analysis service returned ${response.status}`);
    }

    const result = await response.json();

    // Convert analysis results to signals (not storing in analysis_results)
    // These are Layer 4 signals, stored as signals only

    if (result.faithfulness_score !== undefined) {
      signals.push({
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        trace_id: job.trace_id,
        span_id: job.span_id || job.trace_id,
        signal_name: "faithfulness_score",
        signal_type: "threshold",
        signal_value: result.faithfulness_score,
        signal_severity: result.faithfulness_score < 0.5 ? "high" : result.faithfulness_score < 0.7 ? "medium" : "low",
        metadata: {
          score: result.faithfulness_score,
          reasoning: result.faithfulness_reasoning,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (result.context_relevance_score !== undefined) {
      signals.push({
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        trace_id: job.trace_id,
        span_id: job.span_id || job.trace_id,
        signal_name: "context_relevance_score",
        signal_type: "threshold",
        signal_value: result.context_relevance_score,
        signal_severity: result.context_relevance_score < 0.5 ? "high" : result.context_relevance_score < 0.7 ? "medium" : "low",
        metadata: {
          score: result.context_relevance_score,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (result.quality_score !== undefined) {
      signals.push({
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        trace_id: job.trace_id,
        span_id: job.span_id || job.trace_id,
        signal_name: "quality_score",
        signal_type: "threshold",
        signal_value: result.quality_score,
        signal_severity: result.quality_score < 3 ? "high" : result.quality_score < 4 ? "medium" : "low",
        metadata: {
          score: result.quality_score,
          coherence: result.coherence_score,
          relevance: result.relevance_score,
          helpfulness: result.helpfulness_score,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Note: We're NOT storing hallucination flags as primary data
    // If needed, it can be a signal, but it's not the core of the system
    if (result.is_hallucination !== undefined && result.is_hallucination) {
      signals.push({
        tenant_id: job.tenant_id,
        project_id: job.project_id,
        trace_id: job.trace_id,
        span_id: job.span_id || job.trace_id,
        signal_name: "potential_hallucination",
        signal_type: "threshold",
        signal_value: true,
        signal_severity: (result.hallucination_confidence || 0) > 0.8 ? "high" : "medium",
        metadata: {
          confidence: result.hallucination_confidence,
          reasoning: result.hallucination_reasoning,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(
      `[AnalysisWorker] Layer 4 processing error for trace ${job.trace_id}:`,
      error
    );
    // Don't throw - return what we have
  }

  return signals;
}

/**
 * Store analysis signals as canonical events
 */
async function storeAnalysisSignals(
  signals: Signal[],
  job: AnalysisJob
): Promise<void> {
  const signalEvents: TinybirdCanonicalEvent[] = signals.map((signal) => ({
    tenant_id: signal.tenant_id,
    project_id: signal.project_id,
    environment: (job.environment as "dev" | "prod") || "prod",
    trace_id: signal.trace_id,
    span_id: signal.span_id,
    parent_span_id: null,
    timestamp: signal.timestamp,
    event_type: "error" as EventType, // Using error type as placeholder for signals
    conversation_id: job.conversation_id || null,
    session_id: job.session_id || null,
    user_id: job.user_id || null,
    agent_name: job.agent_name || null,
    version: job.version || null,
    route: job.route || null,
    attributes_json: JSON.stringify({
      signal: {
        signal_name: signal.signal_name,
        signal_type: signal.signal_type,
        signal_value: signal.signal_value,
        signal_severity: signal.signal_severity,
        metadata: signal.metadata,
        layer: signal.signal_name.includes("embedding") || signal.signal_name.includes("drift") || signal.signal_name.includes("duplicate") ? "layer3" : "layer4",
      },
    }),
  }));

  try {
    await CanonicalEventService.forwardToTinybird(signalEvents);
  } catch (error) {
    console.error(
      `[AnalysisWorker] Failed to store analysis signals for trace ${job.trace_id}:`,
      error
    );
    throw error; // Re-throw so job can be retried
  }
}

/**
 * Cleanup: Close worker and Redis connection
 */
export async function closeAnalysisWorker(): Promise<void> {
  if (analysisWorker) {
    await analysisWorker.close();
    analysisWorker = null;
  }
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}


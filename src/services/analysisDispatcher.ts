/**
 * Analysis Dispatcher (Layer 3/4 Signals)
 *
 * SOTA Architecture: Event-driven analysis job queue
 * - Only triggers on high-severity signals or explicit requests
 * - Uses job queue (BullMQ/Redis) for async processing
 * - Supports sampling for cost efficiency
 * - Stores results as signals, not as primary trace data
 *
 * Layer 3: Cheap semantic signals (sampled embeddings)
 * Layer 4: Expensive checks (LLM judges) - only for high-severity
 */

import { Queue, QueueOptions } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env.js";

export interface AnalysisJob {
  trace_id: string;
  tenant_id: string;
  project_id: string;
  span_id?: string;
  conversation_id?: string;
  session_id?: string;
  user_id?: string;

  // Trigger reason
  trigger:
    | "high_severity_signal"
    | "explicit_request"
    | "sampled"
    | "dataset_promotion";
  signal_severity?: "high" | "medium" | "low";
  signal_names?: string[]; // Which signals triggered this

  // Analysis layers to run
  layers: ("layer3" | "layer4")[];

  // Trace data (for analysis)
  query?: string;
  context?: string;
  response?: string;
  model?: string;
  tokens_total?: number;
  latency_ms?: number;
  cost?: number;

  // Metadata
  environment?: string;
  route?: string;
  agent_name?: string;
  version?: string;
}

let analysisQueue: Queue<AnalysisJob> | null = null;
let redisClient: Redis | null = null;

/**
 * Initialize Redis connection and job queue
 * Gracefully degrades if Redis is not available
 */
export function initializeAnalysisQueue(): void {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

  if (!redisUrl) {
    console.warn(
      "[AnalysisDispatcher] REDIS_URL not set - analysis jobs will be queued in-memory (not persistent)"
    );
    // For serverless, we can use in-memory queue or Postgres-based queue
    // For now, we'll just log and skip queue initialization
    return;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: true,
    });

    const queueOptions: QueueOptions = {
      connection: redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000, // Keep max 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    };

    analysisQueue = new Queue<AnalysisJob>("analysis-jobs", queueOptions);

    console.log("[AnalysisDispatcher] ✅ Analysis job queue initialized");
  } catch (error) {
    console.error(
      "[AnalysisDispatcher] ❌ Failed to initialize Redis queue:",
      error
    );
    console.warn(
      "[AnalysisDispatcher] Analysis jobs will not be queued (graceful degradation)"
    );
  }
}

/**
 * Queue an analysis job
 * Returns true if queued successfully, false if queue unavailable
 */
export async function queueAnalysisJob(job: AnalysisJob): Promise<boolean> {
  if (!analysisQueue) {
    console.warn(
      `[AnalysisDispatcher] Queue not available, skipping analysis for trace ${job.trace_id}`
    );
    return false;
  }

  try {
    await analysisQueue.add("analyze-trace", job, {
      jobId: `analysis-${job.trace_id}-${Date.now()}`, // Unique job ID
      priority: job.trigger === "high_severity_signal" ? 1 : 5, // Higher priority for high-severity
    });

    console.log(
      `[AnalysisDispatcher] ✅ Queued analysis job for trace ${
        job.trace_id
      } (trigger: ${job.trigger}, layers: ${job.layers.join(", ")})`
    );
    return true;
  } catch (error) {
    console.error(
      `[AnalysisDispatcher] ❌ Failed to queue analysis job for trace ${job.trace_id}:`,
      error
    );
    return false;
  }
}

/**
 * Queue analysis based on high-severity signals
 * This is called by SignalsService when high-severity signals are detected
 */
export async function queueAnalysisForHighSeveritySignal(
  traceId: string,
  tenantId: string,
  projectId: string,
  signalNames: string[],
  signalSeverity: "high" | "medium",
  traceData: {
    span_id?: string;
    conversation_id?: string;
    session_id?: string;
    user_id?: string;
    query?: string;
    context?: string;
    response?: string;
    model?: string;
    tokens_total?: number;
    latency_ms?: number;
    cost?: number;
    environment?: string;
    route?: string;
    agent_name?: string;
    version?: string;
  }
): Promise<boolean> {
  // Only queue Layer 4 (expensive judges) for high-severity signals
  // Layer 3 (embeddings) can be done separately if needed
  const layers: ("layer3" | "layer4")[] =
    signalSeverity === "high" ? ["layer4"] : [];

  if (layers.length === 0) {
    return false; // Don't queue if no layers to run
  }

  return queueAnalysisJob({
    trace_id: traceId,
    tenant_id: tenantId,
    project_id: projectId,
    span_id: traceData.span_id,
    conversation_id: traceData.conversation_id,
    session_id: traceData.session_id,
    user_id: traceData.user_id,
    trigger: "high_severity_signal",
    signal_severity: signalSeverity,
    signal_names: signalNames,
    layers,
    query: traceData.query,
    context: traceData.context,
    response: traceData.response,
    model: traceData.model,
    tokens_total: traceData.tokens_total,
    latency_ms: traceData.latency_ms,
    cost: traceData.cost,
    environment: traceData.environment as "dev" | "prod" | undefined,
    route: traceData.route,
    agent_name: traceData.agent_name,
    version: traceData.version,
  });
}

/**
 * Queue analysis for explicit user request (e.g., "Analyze this trace" button)
 */
export async function queueAnalysisForExplicitRequest(
  traceId: string,
  tenantId: string,
  projectId: string,
  layers: ("layer3" | "layer4")[],
  traceData: {
    span_id?: string;
    conversation_id?: string;
    query?: string;
    context?: string;
    response?: string;
    model?: string;
    tokens_total?: number;
    latency_ms?: number;
    cost?: number;
  }
): Promise<boolean> {
  return queueAnalysisJob({
    trace_id: traceId,
    tenant_id: tenantId,
    project_id: projectId,
    span_id: traceData.span_id,
    conversation_id: traceData.conversation_id,
    trigger: "explicit_request",
    layers,
    query: traceData.query,
    context: traceData.context,
    response: traceData.response,
    model: traceData.model,
    tokens_total: traceData.tokens_total,
    latency_ms: traceData.latency_ms,
    cost: traceData.cost,
  });
}

/**
 * Queue sampled analysis (for QA/regression testing)
 * Samples a percentage of traces for analysis
 */
export async function queueSampledAnalysis(
  traceId: string,
  tenantId: string,
  projectId: string,
  sampleRate: number, // 0.0 to 1.0
  traceData: {
    span_id?: string;
    query?: string;
    context?: string;
    response?: string;
    model?: string;
  }
): Promise<boolean> {
  // Only queue if random sample passes
  if (Math.random() > sampleRate) {
    return false;
  }

  return queueAnalysisJob({
    trace_id: traceId,
    tenant_id: tenantId,
    project_id: projectId,
    span_id: traceData.span_id,
    trigger: "sampled",
    layers: ["layer3"], // Only cheap embeddings for sampling
    query: traceData.query,
    context: traceData.context,
    response: traceData.response,
    model: traceData.model,
  });
}

/**
 * Get queue statistics (for monitoring)
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
} | null> {
  if (!analysisQueue) {
    return null;
  }

  try {
    const [waiting, active, completed, failed] = await Promise.all([
      analysisQueue.getWaitingCount(),
      analysisQueue.getActiveCount(),
      analysisQueue.getCompletedCount(),
      analysisQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  } catch (error) {
    console.error("[AnalysisDispatcher] Failed to get queue stats:", error);
    return null;
  }
}

/**
 * Cleanup: Close Redis connection
 */
export async function closeAnalysisQueue(): Promise<void> {
  if (analysisQueue) {
    await analysisQueue.close();
    analysisQueue = null;
  }
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}


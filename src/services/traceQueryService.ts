/**
 * Trace Query Service
 *
 * Handles querying traces using the new canonical events architecture.
 * Queries canonical events from Tinybird and merges with analysis results from Postgres.
 */

import { TinybirdRepository } from "./tinybirdRepository.js";
import { query } from "../db/client.js";
import { CanonicalEvent } from "../types/events.js";

export interface TraceSummary {
  trace_id: string;
  tenant_id: string;
  project_id: string;
  timestamp: string;
  analyzed_at?: string | null;

  // Aggregated from events
  model?: string | null;
  query?: string | null; // User query from first LLM call input
  response?: string | null; // Final response from output event or last LLM call
  finish_reason?: string | null; // Finish reason from last LLM call
  latency_ms?: number | null;
  tokens_total?: number | null;
  tokens_prompt?: number | null;
  tokens_completion?: number | null;
  total_cost?: number | null; // Aggregated cost from all LLM calls
  estimated_cost_usd?: number | null; // Estimated cost from tokens_total+model (fallback)
  issue_count?: number | null; // Count of issue flags on the trace
  message_index?: number | null;
  response_length?: number | null;
  time_to_first_token_ms?: number | null;
  quality_score?: number | null;
  status?: number | null;
  status_text?: string | null;

  // From analysis_results (if available)
  is_hallucination?: boolean | null;
  hallucination_confidence?: number | null;
  has_context_drop?: boolean;
  has_faithfulness_issue?: boolean;
  has_model_drift?: boolean;
  has_cost_anomaly?: boolean;
  context_relevance_score?: string | null;
  answer_faithfulness_score?: number | null;

  // Metadata
  conversation_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  environment?: string | null;
}

export type TraceListSortBy =
  | "timestamp"
  | "latency"
  | "cost"
  | "quality_score"
  | "tokens_total"
  | "issue_count";

export interface TraceListQueryOptions {
  projectId?: string | null;
  limit?: number;
  offset?: number;
  issueType?: string;

  startDate?: string;
  endDate?: string;
  models?: string[];
  userIds?: string[];
  environments?: string[];
  conversationId?: string;

  minCost?: number;
  maxCost?: number;
  minLatencyMs?: number;
  maxLatencyMs?: number;
  minQualityScore?: number;
  maxQualityScore?: number;

  search?: string;

  sortBy?: TraceListSortBy;
  sortOrder?: "asc" | "desc";
  includeStats?: boolean;
}

export interface TraceListStats {
  totalTraces: number;
  avgLatencyMs: number | null;
  totalCostUsd: number | null;
  avgQualityScore: number | null;
  issueCount: number;
  errorRate: number; // percentage
}

export interface AvailableModel {
  model: string;
  count: number;
  lastSeen: string | null;
}

export class TraceQueryService {
  private static normalizeList(values: unknown): string[] | undefined {
    if (values === undefined || values === null) return undefined;
    if (Array.isArray(values)) {
      return values
        .flatMap((v) => String(v).split(","))
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return String(values)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private static estimatedCostSql(): string {
    // Estimated cost based on total tokens only (approximation).
    // NOTE: This is intentionally simple. For exact costs, rely on per-span cost
    // captured in canonical events (llm_call cost attributes).
    return `
      (COALESCE(tokens_total, 0)::numeric / 1000.0) *
      (
        CASE
          WHEN lower(model) = 'gpt-4' THEN 0.03
          WHEN lower(model) = 'gpt-4-turbo' THEN 0.01
          WHEN lower(model) = 'gpt-4o' THEN 0.015
          WHEN lower(model) = 'gpt-4o-mini' THEN 0.003
          WHEN lower(model) = 'gpt-3.5-turbo' THEN 0.002
          WHEN lower(model) = 'gpt-3.5' THEN 0.002
          WHEN lower(model) = 'claude-3-opus' THEN 0.03
          WHEN lower(model) = 'claude-3-sonnet' THEN 0.012
          WHEN lower(model) = 'claude-3-haiku' THEN 0.0025
          ELSE 0.002
        END
      )
    `;
  }

  private static issueCountSql(): string {
    return `
      (
        (CASE WHEN is_hallucination = true THEN 1 ELSE 0 END) +
        (CASE WHEN has_context_drop = true THEN 1 ELSE 0 END) +
        (CASE WHEN has_faithfulness_issue = true THEN 1 ELSE 0 END) +
        (CASE WHEN has_model_drift = true THEN 1 ELSE 0 END) +
        (CASE WHEN has_cost_anomaly = true THEN 1 ELSE 0 END) +
        (CASE WHEN has_latency_anomaly = true THEN 1 ELSE 0 END) +
        (CASE WHEN has_quality_degradation = true THEN 1 ELSE 0 END) +
        (CASE WHEN has_prompt_injection = true THEN 1 ELSE 0 END) +
        (CASE WHEN has_context_overflow = true THEN 1 ELSE 0 END)
      )
    `;
  }

  private static buildPerformanceAnalysis(summary: any, allSpans: any[]): any {
    const totalLatencyMs =
      typeof summary?.total_latency_ms === "number" ? summary.total_latency_ms : null;
    let slowest = null as any;
    for (const s of allSpans) {
      const d = typeof s?.duration_ms === "number" ? s.duration_ms : null;
      if (d === null) continue;
      if (!slowest || d > slowest.duration_ms) slowest = s;
    }

    const bottleneckDurationMs =
      typeof slowest?.duration_ms === "number" ? slowest.duration_ms : null;
    const bottleneckPercentage =
      totalLatencyMs && bottleneckDurationMs !== null && totalLatencyMs > 0
        ? (bottleneckDurationMs / totalLatencyMs) * 100
        : null;

    const suggestions: string[] = [];
    if (slowest) {
      const name = slowest.name || slowest.displayName || slowest.type || "span";
      if (bottleneckPercentage !== null && bottleneckPercentage >= 50) {
        suggestions.push(
          `Most time is spent in "${name}" (~${bottleneckPercentage.toFixed(
            1
          )}% of total). Consider caching, batching, or reducing work in this step.`
        );
      } else if (bottleneckDurationMs !== null && bottleneckDurationMs >= 1000) {
        suggestions.push(
          `"${name}" took ${bottleneckDurationMs}ms. Consider adding timeouts, retries with backoff, and caching where applicable.`
        );
      }

      const t = String(slowest.type || slowest.event_type || "").toLowerCase();
      if (t.includes("retrieval")) {
        suggestions.push(
          `Retrieval was a bottleneck. Consider smaller top-k, better indexes, caching, or pre-filtering before retrieval.`
        );
      }
      if (t.includes("tool")) {
        suggestions.push(
          `Tool execution was a bottleneck. Consider parallelizing tool calls or adding memoization for deterministic results.`
        );
      }
      if (t.includes("llm")) {
        suggestions.push(
          `LLM call was a bottleneck. Consider faster models, shorter prompts, or streaming + early stopping for UX.`
        );
      }
    }

    return {
      bottleneckSpanId: slowest?.id || slowest?.span_id || null,
      bottleneckDurationMs,
      bottleneckPercentage,
      suggestions,
    };
  }

  private static buildCostBreakdown(summary: any, allSpans: any[]): any {
    let total = typeof summary?.total_cost === "number" ? summary.total_cost : 0;
    const byType: Record<string, number> = {};
    const bySpan: Array<{ spanId: string; name: string; costUsd: number }> = [];

    for (const s of allSpans) {
      // Try multiple locations since span formats differ across paths.
      const cost =
        s?.cost_usd ??
        s?.llm_call?.cost ??
        s?.details?.cost ??
        s?.attributes?.cost ??
        null;
      const costNum = typeof cost === "number" ? cost : null;
      if (costNum === null || !Number.isFinite(costNum) || costNum <= 0) continue;

      // Ensure total includes per-span if summary total isn't populated.
      if (!summary?.total_cost) total += costNum;

      const typeKey = String(s?.type || s?.event_type || "unknown").toLowerCase();
      byType[typeKey] = (byType[typeKey] || 0) + costNum;
      bySpan.push({
        spanId: s?.id || s?.span_id || "unknown",
        name: s?.displayName || s?.name || typeKey,
        costUsd: costNum,
      });

      // Normalize to top-level cost field for frontend convenience
      if (s.cost_usd === undefined) s.cost_usd = costNum;
    }

    bySpan.sort((a, b) => b.costUsd - a.costUsd);

    return {
      totalCostUsd: total > 0 ? Number(total.toFixed(6)) : null,
      byType: Object.fromEntries(
        Object.entries(byType).map(([k, v]) => [k, Number(v.toFixed(6))])
      ),
      topSpans: bySpan.slice(0, 5),
    };
  }

  private static buildTokenEfficiency(summary: any, allSpans: any[]): any {
    const totalTokens =
      typeof summary?.total_tokens === "number" ? summary.total_tokens : null;

    let promptTokens = 0;
    let completionTokens = 0;
    for (const s of allSpans) {
      const llm = s?.llm_call || s?.details;
      const it = llm?.input_tokens ?? llm?.tokens_prompt ?? null;
      const ot = llm?.output_tokens ?? llm?.tokens_completion ?? null;
      if (typeof it === "number") promptTokens += it;
      if (typeof ot === "number") completionTokens += ot;
    }

    const inputChars = typeof summary?.query === "string" ? summary.query.length : 0;
    const outputChars =
      typeof summary?.response === "string" ? summary.response.length : 0;
    const totalChars = inputChars + outputChars;

    const tokensPerCharacter =
      totalTokens !== null && totalChars > 0 ? totalTokens / totalChars : null;

    const inputEfficiency =
      promptTokens > 0 && inputChars > 0 ? promptTokens / inputChars : null;
    const outputEfficiency =
      completionTokens > 0 && outputChars > 0 ? completionTokens / outputChars : null;

    // Simple benchmark heuristic
    let benchmarkComparison: "above_average" | "average" | "below_average" = "average";
    if (tokensPerCharacter !== null) {
      if (tokensPerCharacter > 1.2) benchmarkComparison = "below_average";
      else if (tokensPerCharacter < 0.6) benchmarkComparison = "above_average";
    }

    return {
      tokensPerCharacter,
      inputEfficiency,
      outputEfficiency,
      benchmarkComparison,
    };
  }

  private static buildQualityExplanation(analysis: any): any | null {
    if (!analysis) return null;
    const qualityScore = analysis.qualityScore ?? analysis.quality_score ?? null;
    const coherence = analysis.coherenceScore ?? analysis.coherence_score ?? null;
    const relevance = analysis.relevanceScore ?? analysis.relevance_score ?? null;
    const helpfulness = analysis.helpfulnessScore ?? analysis.helpfulness_score ?? null;

    const scoreExplain = (label: string, score: any): { score: number | null; explanation: string } => {
      if (typeof score !== "number") {
        return { score: null, explanation: `${label} score not available.` };
      }
      if (score < 0.5) return { score, explanation: `${label} is low; users may perceive this response as weak.` };
      if (score < 0.7) return { score, explanation: `${label} is moderate; there is room to improve.` };
      return { score, explanation: `${label} is strong.` };
    };

    const improvements: string[] = [];
    if (analysis.hasContextDrop) improvements.push("Improve retrieval quality and ensure relevant context is included.");
    if (analysis.hasFaithfulnessIssue) improvements.push("Add citations/grounding and tighten instructions to avoid unsupported claims.");
    if (analysis.hasPromptInjection) improvements.push("Add prompt-injection guardrails and input sanitization.");
    if (analysis.hasContextOverflow) improvements.push("Reduce prompt size with summarization or better chunk selection.");
    if (analysis.hasLatencyAnomaly) improvements.push("Optimize slow spans (retrieval/tool/LLM) and add caching where possible.");
    if (analysis.hasCostAnomaly) improvements.push("Consider cheaper models, shorter prompts, and token budgeting.");

    return {
      overallScore: typeof qualityScore === "number" ? qualityScore : null,
      breakdown: {
        coherence: scoreExplain("Coherence", coherence),
        relevance: scoreExplain("Relevance", relevance),
        helpfulness: scoreExplain("Helpfulness", helpfulness),
      },
      improvements,
    };
  }

  private static buildTraceListWhereClause(
    tenantId: string,
    opts: TraceListQueryOptions
  ): { whereClause: string; params: any[]; nextIndex: number } {
    let whereClause = `WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    const projectId = opts.projectId ?? null;
    if (projectId) {
      whereClause += ` AND project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    // Time range (uses timestamp column)
    if (opts.startDate) {
      whereClause += ` AND timestamp >= $${paramIndex}`;
      params.push(new Date(opts.startDate));
      paramIndex++;
    }
    if (opts.endDate) {
      whereClause += ` AND timestamp <= $${paramIndex}`;
      params.push(new Date(opts.endDate));
      paramIndex++;
    }

    // Multi-select filters
    if (opts.models && opts.models.length > 0) {
      whereClause += ` AND lower(model) = ANY($${paramIndex})`;
      params.push(opts.models.map((m) => m.toLowerCase()));
      paramIndex++;
    }

    if (opts.userIds && opts.userIds.length > 0) {
      whereClause += ` AND user_id = ANY($${paramIndex})`;
      params.push(opts.userIds);
      paramIndex++;
    }

    if (opts.environments && opts.environments.length > 0) {
      whereClause += ` AND environment = ANY($${paramIndex})`;
      params.push(opts.environments);
      paramIndex++;
    }

    if (opts.conversationId) {
      whereClause += ` AND conversation_id = $${paramIndex}`;
      params.push(opts.conversationId);
      paramIndex++;
    }

    // Numeric filters
    if (typeof opts.minLatencyMs === "number") {
      whereClause += ` AND latency_ms >= $${paramIndex}`;
      params.push(opts.minLatencyMs);
      paramIndex++;
    }
    if (typeof opts.maxLatencyMs === "number") {
      whereClause += ` AND latency_ms <= $${paramIndex}`;
      params.push(opts.maxLatencyMs);
      paramIndex++;
    }

    if (typeof opts.minQualityScore === "number") {
      whereClause += ` AND quality_score >= $${paramIndex}`;
      params.push(opts.minQualityScore);
      paramIndex++;
    }
    if (typeof opts.maxQualityScore === "number") {
      whereClause += ` AND quality_score <= $${paramIndex}`;
      params.push(opts.maxQualityScore);
      paramIndex++;
    }

    // Cost filters use estimated cost expression (tokens_total+model)
    if (typeof opts.minCost === "number") {
      whereClause += ` AND (${this.estimatedCostSql()}) >= $${paramIndex}`;
      params.push(opts.minCost);
      paramIndex++;
    }
    if (typeof opts.maxCost === "number") {
      whereClause += ` AND (${this.estimatedCostSql()}) <= $${paramIndex}`;
      params.push(opts.maxCost);
      paramIndex++;
    }

    // Text search across query/response/context
    if (opts.search && opts.search.trim().length > 0) {
      const needle = `%${opts.search.trim()}%`;
      whereClause += ` AND (query ILIKE $${paramIndex} OR response ILIKE $${paramIndex} OR context ILIKE $${paramIndex})`;
      params.push(needle);
      paramIndex++;
    }

    // Filter by issue type (single or comma-separated)
    if (opts.issueType) {
      const issueTypes = this.normalizeList(opts.issueType);
      if (issueTypes && issueTypes.length > 0) {
        const issuePredicates: string[] = [];
        for (const it of issueTypes) {
          switch (it) {
            case "hallucination":
              issuePredicates.push(`is_hallucination = true`);
              break;
            case "context_drop":
              issuePredicates.push(`has_context_drop = true`);
              break;
            case "faithfulness":
              issuePredicates.push(`has_faithfulness_issue = true`);
              break;
            case "drift":
              issuePredicates.push(`has_model_drift = true`);
              break;
            case "cost_anomaly":
              issuePredicates.push(`has_cost_anomaly = true`);
              break;
            case "latency_anomaly":
              issuePredicates.push(`has_latency_anomaly = true`);
              break;
            case "quality_degradation":
              issuePredicates.push(`has_quality_degradation = true`);
              break;
          }
        }
        if (issuePredicates.length > 0) {
          whereClause += ` AND (${issuePredicates.join(" OR ")})`;
        }
      }
    }

    return { whereClause, params, nextIndex: paramIndex };
  }

  static async getTracesV2(
    tenantId: string,
    opts: TraceListQueryOptions
  ): Promise<{ traces: TraceSummary[]; total: number; stats?: TraceListStats }> {
    try {
      const limit = typeof opts.limit === "number" ? opts.limit : 50;
      const offset = typeof opts.offset === "number" ? opts.offset : 0;
      const sortBy: TraceListSortBy = opts.sortBy || "timestamp";
      const sortOrder = (opts.sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

      const { whereClause, params, nextIndex } = this.buildTraceListWhereClause(
        tenantId,
        opts
      );

      const estimatedCost = this.estimatedCostSql();
      const issueCount = this.issueCountSql();

      const sortColumnSql: Record<TraceListSortBy, string> = {
        timestamp: `COALESCE(timestamp, analyzed_at)`,
        latency: `latency_ms`,
        cost: `estimated_cost_usd`,
        quality_score: `quality_score`,
        tokens_total: `tokens_total`,
        issue_count: `issue_count`,
      };

      const orderBy = `ORDER BY ${sortColumnSql[sortBy]} ${sortOrder} NULLS LAST`;

      const traces = await query(
        `SELECT 
          trace_id,
          tenant_id,
          project_id,
          analyzed_at,
          timestamp,
          model,
          query,
          response,
          finish_reason,
          tokens_total,
          tokens_prompt,
          tokens_completion,
          latency_ms,
          time_to_first_token_ms,
          response_length,
          status,
          status_text,
          quality_score,
          message_index,
          is_hallucination,
          hallucination_confidence,
          has_context_drop,
          has_faithfulness_issue,
          has_model_drift,
          has_cost_anomaly,
          has_latency_anomaly,
          has_quality_degradation,
          has_prompt_injection,
          has_context_overflow,
          context_relevance_score,
          answer_faithfulness_score,
          conversation_id,
          session_id,
          user_id,
          environment,
          (${estimatedCost})::float8 as estimated_cost_usd,
          (${issueCount})::int as issue_count
        FROM analysis_results
        ${whereClause}
        ${orderBy}
        LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
        [...params, limit, offset]
      );

      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM analysis_results ${whereClause}`,
        params
      );
      const total = parseInt(countResult[0]?.count || "0", 10);

      let stats: TraceListStats | undefined;
      if (opts.includeStats) {
        const statsRows = await query(
          `SELECT
            COUNT(*)::int as total_traces,
            AVG(latency_ms)::float8 as avg_latency_ms,
            AVG(quality_score)::float8 as avg_quality_score,
            SUM((${estimatedCost}))::float8 as total_cost_usd,
            SUM(CASE WHEN (${issueCount}) > 0 THEN 1 ELSE 0 END)::int as issue_count,
            SUM(CASE WHEN status IS NOT NULL AND status >= 400 THEN 1 ELSE 0 END)::int as error_count
          FROM analysis_results
          ${whereClause}`,
          params
        );
        const s = statsRows?.[0] as any;
        const totalTraces = Number(s?.total_traces || 0);
        const errorCount = Number(s?.error_count || 0);
        stats = {
          totalTraces,
          avgLatencyMs:
            s?.avg_latency_ms === null || s?.avg_latency_ms === undefined
              ? null
              : Number(s.avg_latency_ms),
          totalCostUsd:
            s?.total_cost_usd === null || s?.total_cost_usd === undefined
              ? null
              : Number(s.total_cost_usd),
          avgQualityScore:
            s?.avg_quality_score === null || s?.avg_quality_score === undefined
              ? null
              : Number(s.avg_quality_score),
          issueCount: Number(s?.issue_count || 0),
          errorRate: totalTraces > 0 ? (errorCount / totalTraces) * 100 : 0,
        };
      }

      return {
        traces: traces.map((t: any) => ({
          trace_id: t.trace_id,
          tenant_id: t.tenant_id,
          project_id: t.project_id,
          timestamp: t.timestamp?.toISOString() || new Date().toISOString(),
          analyzed_at: t.analyzed_at?.toISOString() || null,
          model: t.model,
          query: t.query,
          response: t.response,
          finish_reason: t.finish_reason,
          latency_ms: t.latency_ms,
          tokens_total: t.tokens_total,
          tokens_prompt: t.tokens_prompt,
          tokens_completion: t.tokens_completion,
          time_to_first_token_ms: t.time_to_first_token_ms,
          response_length: t.response_length,
          status: t.status,
          status_text: t.status_text,
          quality_score: t.quality_score,
          estimated_cost_usd: t.estimated_cost_usd,
          issue_count: t.issue_count,
          message_index: t.message_index,
          is_hallucination: t.is_hallucination,
          hallucination_confidence: t.hallucination_confidence,
          has_context_drop: t.has_context_drop || false,
          has_faithfulness_issue: t.has_faithfulness_issue || false,
          has_model_drift: t.has_model_drift || false,
          has_cost_anomaly: t.has_cost_anomaly || false,
          context_relevance_score: t.context_relevance_score,
          answer_faithfulness_score: t.answer_faithfulness_score,
          conversation_id: t.conversation_id,
          session_id: t.session_id,
          user_id: t.user_id,
          environment: t.environment,
        })) as TraceSummary[],
        total,
        stats,
      };
    } catch (error) {
      console.error("[TraceQueryService] Error querying traces v2:", error);
      throw error;
    }
  }

  static async getAvailableModels(params: {
    tenantId: string;
    projectId?: string | null;
    environment?: string | null;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<AvailableModel[]> {
    const { tenantId, projectId, environment, startDate, endDate } = params;
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

    let whereClause = `WHERE tenant_id = $1 AND model IS NOT NULL AND NULLIF(TRIM(model), '') IS NOT NULL`;
    const values: any[] = [tenantId];
    let idx = 2;

    if (projectId) {
      whereClause += ` AND project_id = $${idx}`;
      values.push(projectId);
      idx++;
    }

    if (environment) {
      whereClause += ` AND environment = $${idx}`;
      values.push(environment);
      idx++;
    }

    if (startDate) {
      whereClause += ` AND timestamp >= $${idx}`;
      values.push(new Date(startDate));
      idx++;
    }

    if (endDate) {
      whereClause += ` AND timestamp <= $${idx}`;
      values.push(new Date(endDate));
      idx++;
    }

    const rows = await query(
      `SELECT
        model,
        COUNT(*)::int as count,
        MAX(COALESCE(timestamp, analyzed_at)) as last_seen
      FROM analysis_results
      ${whereClause}
      GROUP BY model
      ORDER BY count DESC, model ASC
      LIMIT $${idx}`,
      [...values, limit]
    );

    return rows.map((r: any) => ({
      model: String(r.model),
      count: Number(r.count || 0),
      lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null,
    })) as AvailableModel[];
  }

  /**
   * Get trace summaries for a tenant/project
   *
   * NOTE: Currently falls back to analysis_results table for backward compatibility.
   * TODO: Migrate to canonical events from Tinybird once data migration is complete.
   */
  static async getTraces(
    tenantId: string,
    projectId?: string | null,
    limit: number = 50,
    offset: number = 0,
    issueType?: string
  ): Promise<{ traces: TraceSummary[]; total: number }> {
    const result = await this.getTracesV2(tenantId, {
      projectId: projectId ?? null,
      limit,
      offset,
      issueType,
      includeStats: false,
    });
    return { traces: result.traces, total: result.total };
  }

  /**
   * Get a single trace detail
   *
   * NOTE: Currently queries from analysis_results table for backward compatibility.
   * TODO: Migrate to canonical events from Tinybird once data migration is complete.
   */
  static async getTraceDetail(
    traceId: string,
    tenantId: string,
    projectId?: string | null
  ): Promise<any | null> {
    try {
      let whereClause = `WHERE trace_id = $1 AND tenant_id = $2`;
      const params: any[] = [traceId, tenantId];

      if (projectId) {
        whereClause += ` AND project_id = $3`;
        params.push(projectId);
      }

      const rows = await query(
        `SELECT * FROM analysis_results ${whereClause} LIMIT 1`,
        params
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      console.error("[TraceQueryService] Error querying trace detail:", error);
      throw error;
    }
  }

  static async getConversationContext(params: {
    tenantId: string;
    projectId?: string | null;
    conversationId: string;
    traceId: string;
  }): Promise<any> {
    const { tenantId, projectId, conversationId, traceId } = params;

    let whereClause = `WHERE tenant_id = $1 AND conversation_id = $2`;
    const values: any[] = [tenantId, conversationId];
    let idx = 3;
    if (projectId) {
      whereClause += ` AND project_id = $${idx}`;
      values.push(projectId);
      idx++;
    }

    const rows = await query(
      `SELECT trace_id, message_index, timestamp, latency_ms, tokens_total, model, status,
              is_hallucination, has_context_drop, has_faithfulness_issue, has_model_drift, has_cost_anomaly,
              has_latency_anomaly, has_quality_degradation, has_prompt_injection, has_context_overflow
       FROM analysis_results
       ${whereClause}
       ORDER BY COALESCE(message_index, 2147483647) ASC, COALESCE(timestamp, analyzed_at) ASC`,
      values
    );

    const totalMessages = rows.length;
    const currentIdx = rows.findIndex((r: any) => r.trace_id === traceId);
    const current = currentIdx >= 0 ? rows[currentIdx] : null;

    const previousTraceId =
      currentIdx > 0 ? rows[currentIdx - 1].trace_id : null;
    const nextTraceId =
      currentIdx >= 0 && currentIdx < rows.length - 1
        ? rows[currentIdx + 1].trace_id
        : null;

    // Aggregate conversation metrics
    const estimatedCost = this.estimatedCostSql();
    const issueCount = this.issueCountSql();
    const metricsRows = await query(
      `SELECT
        SUM(tokens_total)::bigint as total_tokens,
        AVG(latency_ms)::float8 as avg_latency_ms,
        SUM((${estimatedCost}))::float8 as total_cost_usd,
        SUM(CASE WHEN (${issueCount}) > 0 THEN 1 ELSE 0 END)::int as issue_count
      FROM analysis_results
      ${whereClause}`,
      values
    );
    const m = metricsRows?.[0] as any;

    return {
      id: conversationId,
      messageIndex: current?.message_index ?? null,
      totalMessages,
      previousTraceId,
      nextTraceId,
      conversationMetrics: {
        totalTokens: m?.total_tokens ? Number(m.total_tokens) : 0,
        avgLatencyMs:
          m?.avg_latency_ms === null || m?.avg_latency_ms === undefined
            ? null
            : Number(m.avg_latency_ms),
        totalCostUsd:
          m?.total_cost_usd === null || m?.total_cost_usd === undefined
            ? null
            : Number(m.total_cost_usd),
        issueCount: Number(m?.issue_count || 0),
      },
    };
  }

  /**
   * Get trace detail with tree structure (spans and events)
   * Returns structured data for waterfall/timeline view
   *
   * First tries to get canonical events from Tinybird for full hierarchical structure.
   * Falls back to analysis_results for backward compatibility.
   */
  static async getTraceDetailTree(
    traceId: string,
    tenantId: string,
    projectId?: string | null
  ): Promise<any | null> {
    try {
      // Try to get canonical events from Tinybird first
      const { TinybirdRepository } = await import("./tinybirdRepository.js");

      let canonicalEvents: any[] = [];
      try {
        const eventsData: any = await TinybirdRepository.getTraceEvents(
          traceId,
          tenantId,
          projectId || null
        );

        // Tinybird returns data in format: { data: [...], meta: [...] }
        if (eventsData && Array.isArray(eventsData)) {
          canonicalEvents = eventsData;
        } else if (
          eventsData &&
          typeof eventsData === "object" &&
          Array.isArray(eventsData.data)
        ) {
          canonicalEvents = eventsData.data;
        }

        if (canonicalEvents.length > 0) {
          console.log(
            `[TraceQueryService] ✅ Found ${canonicalEvents.length} canonical events for trace ${traceId}`
          );
        } else {
          console.log(
            `[TraceQueryService] ⚠️  No canonical events found in Tinybird for trace ${traceId}, falling back to analysis_results`
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[TraceQueryService] ❌ Error fetching canonical events from Tinybird for trace ${traceId}:`,
          errorMessage
        );
        console.log(
          `[TraceQueryService] Falling back to analysis_results table`
        );
      }

      // If we have canonical events, build tree from them
      if (canonicalEvents.length > 0) {
        return await this.buildTreeFromCanonicalEvents(
          canonicalEvents,
          traceId,
          tenantId,
          projectId || null
        );
      }

      // Fallback: Build from analysis_results (backward compatibility)
      let traceData = await this.getTraceDetail(traceId, tenantId, projectId);

      if (!traceData) {
        return null;
      }

      // Build tree structure from the trace data
      // For now, we have one span (the main trace), but structure supports multiple spans
      const rootSpan = {
        span_id: traceData.span_id || traceData.trace_id,
        parent_span_id: traceData.parent_span_id || null,
        name: traceData.query ? "LLM Call" : "Trace",
        start_time: traceData.timestamp || traceData.analyzed_at,
        end_time: traceData.timestamp
          ? new Date(
              new Date(traceData.timestamp).getTime() +
                (traceData.latency_ms || 0)
            ).toISOString()
          : traceData.analyzed_at,
        duration_ms: traceData.latency_ms || 0,
        events: [] as any[],
        metadata: {
          model: traceData.model,
          environment: traceData.environment,
          conversation_id: traceData.conversation_id,
          session_id: traceData.session_id,
          user_id: traceData.user_id,
          message_index: traceData.message_index,
          status: traceData.status,
          status_text: traceData.status_text,
          finish_reason: traceData.finish_reason,
          response_id: traceData.response_id,
          system_fingerprint: traceData.system_fingerprint,
          metadata: traceData.metadata_json
            ? JSON.parse(traceData.metadata_json)
            : null,
          headers: traceData.headers_json
            ? JSON.parse(traceData.headers_json)
            : null,
        },
      };

      // Add LLM call event if model/query/response present
      if (traceData.model || traceData.query || traceData.response) {
        rootSpan.events.push({
          event_type: "llm_call",
          timestamp: traceData.timestamp || traceData.analyzed_at,
          attributes: {
            llm_call: {
              model: traceData.model,
              input: traceData.query,
              output: traceData.response,
              input_tokens: traceData.tokens_prompt,
              output_tokens: traceData.tokens_completion,
              total_tokens: traceData.tokens_total,
              latency_ms: traceData.latency_ms,
              time_to_first_token_ms: traceData.time_to_first_token_ms,
              streaming_duration_ms: traceData.streaming_duration_ms,
              finish_reason: traceData.finish_reason,
              response_id: traceData.response_id,
              system_fingerprint: traceData.system_fingerprint,
              // Include context if available
              context: traceData.context || null,
            },
          },
        });
      }

      // Add retrieval event if context present
      if (traceData.context) {
        rootSpan.events.push({
          event_type: "retrieval",
          timestamp: traceData.timestamp || traceData.analyzed_at,
          attributes: {
            retrieval: {
              retrieval_context_ids: null,
              retrieval_context: traceData.context, // Include actual context
              context_length: traceData.context.length,
              latency_ms: 0, // Unknown from analysis_results
            },
          },
        });
      }

      // Add output event if response present
      if (traceData.response) {
        rootSpan.events.push({
          event_type: "output",
          timestamp: traceData.timestamp || traceData.analyzed_at,
          attributes: {
            output: {
              final_output: traceData.response,
              output_length: traceData.response_length,
            },
          },
        });
      }

      // Build summary metadata
      const summary = {
        trace_id: traceData.trace_id,
        tenant_id: traceData.tenant_id,
        project_id: traceData.project_id,
        environment: traceData.environment,
        conversation_id: traceData.conversation_id,
        session_id: traceData.session_id,
        user_id: traceData.user_id,
        message_index: traceData.message_index,
        start_time: traceData.timestamp || traceData.analyzed_at,
        end_time: traceData.timestamp
          ? new Date(
              new Date(traceData.timestamp).getTime() +
                (traceData.latency_ms || 0)
            ).toISOString()
          : traceData.analyzed_at,
        total_latency_ms: traceData.latency_ms || 0,
        total_tokens: traceData.tokens_total || 0,
        total_cost: null, // Not in analysis_results
        model: traceData.model,
        query: traceData.query || null, // User query (from analysis_results)
        response: traceData.response || null, // Final response (from analysis_results)
        finish_reason: traceData.finish_reason,
        status: traceData.status,
        status_text: traceData.status_text,
        response_length: traceData.response_length,
        time_to_first_token_ms: traceData.time_to_first_token_ms,
        streaming_duration_ms: traceData.streaming_duration_ms,
        analyzed_at: traceData.analyzed_at?.toISOString() || null,
      };

      // Build analysis/signals
      const signals = [];
      if (traceData.is_hallucination === true) {
        signals.push({
          signal_type: "hallucination",
          severity: "high",
          confidence: traceData.hallucination_confidence,
          reasoning: traceData.hallucination_reasoning,
        });
      }
      if (traceData.has_context_drop) {
        signals.push({
          signal_type: "context_drop",
          severity: "medium",
          score: traceData.context_relevance_score,
        });
      }
      if (traceData.has_faithfulness_issue) {
        signals.push({
          signal_type: "faithfulness",
          severity: "medium",
          score: traceData.answer_faithfulness_score,
        });
      }
      if (traceData.has_model_drift) {
        signals.push({
          signal_type: "model_drift",
          severity: "low",
          score: traceData.drift_score,
        });
      }
      if (traceData.has_cost_anomaly) {
        signals.push({
          signal_type: "cost_anomaly",
          severity: "medium",
          score: traceData.anomaly_score,
        });
      }

      return {
        summary,
        spans: [rootSpan],
        signals,
        // Legacy analysis data for backward compatibility
        analysis: {
          isHallucination: traceData.is_hallucination,
          hallucinationConfidence: traceData.hallucination_confidence,
          hallucinationReasoning: traceData.hallucination_reasoning,
          qualityScore: traceData.quality_score,
          coherenceScore: traceData.coherence_score,
          relevanceScore: traceData.relevance_score,
          helpfulnessScore: traceData.helpfulness_score,
          hasContextDrop: traceData.has_context_drop,
          hasModelDrift: traceData.has_model_drift,
          hasPromptInjection: traceData.has_prompt_injection,
          hasContextOverflow: traceData.has_context_overflow,
          hasFaithfulnessIssue: traceData.has_faithfulness_issue,
          hasCostAnomaly: traceData.has_cost_anomaly,
          hasLatencyAnomaly: traceData.has_latency_anomaly,
          hasQualityDegradation: traceData.has_quality_degradation,
          contextRelevanceScore: traceData.context_relevance_score,
          answerFaithfulnessScore: traceData.answer_faithfulness_score,
          driftScore: traceData.drift_score,
          anomalyScore: traceData.anomaly_score,
          analysisModel: traceData.analysis_model,
          analysisVersion: traceData.analysis_version,
          processingTimeMs: traceData.processing_time_ms,
        },
      };
    } catch (error) {
      console.error(
        "[TraceQueryService] Error querying trace detail tree:",
        error
      );
      throw error;
    }
  }

  /**
   * Build hierarchical tree structure from canonical events
   * Creates spans with parent-child relationships and attaches events to spans
   */
  private static async buildTreeFromCanonicalEvents(
    events: any[],
    traceId: string,
    tenantId: string,
    projectId: string | null
  ): Promise<any> {
    if (events.length === 0) {
      return null;
    }

    // CRITICAL: Filter events to ensure we only process events for this specific trace
    // This prevents including events from other traces that might share conversation_id
    const filteredEvents = events.filter((event: any) => {
      // Ensure event belongs to this trace
      return event.trace_id === traceId;
    });

    if (filteredEvents.length !== events.length) {
      console.warn(
        `[TraceQueryService] Filtered ${
          events.length - filteredEvents.length
        } events that don't belong to trace ${traceId}`
      );
    }

    // CRITICAL: Deduplicate events by creating a unique key
    // This prevents processing the same event multiple times
    const eventMap = new Map<string, any>();
    for (const event of filteredEvents) {
      // Create unique key: trace_id + span_id + event_type + timestamp
      const eventKey = `${event.trace_id}-${event.span_id}-${event.event_type}-${event.timestamp}`;
      if (!eventMap.has(eventKey)) {
        eventMap.set(eventKey, event);
      } else {
        console.warn(
          `[TraceQueryService] Duplicate event detected and skipped: ${eventKey}`
        );
      }
    }
    const uniqueEvents = Array.from(eventMap.values());

    if (uniqueEvents.length !== filteredEvents.length) {
      console.warn(
        `[TraceQueryService] Removed ${
          filteredEvents.length - uniqueEvents.length
        } duplicate events`
      );
    }

    // Parse events and extract attributes
    const parsedEvents = uniqueEvents.map((event: any) => {
      let attributes = {};
      try {
        if (typeof event.attributes_json === "string") {
          // Validate JSON string before parsing
          const jsonStr = event.attributes_json.trim();
          if (jsonStr && jsonStr.length > 0) {
            attributes = JSON.parse(jsonStr);
          }
        } else if (event.attributes) {
          attributes = event.attributes;
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        const jsonPreview = typeof event.attributes_json === "string" 
          ? event.attributes_json.substring(0, 200) 
          : "not a string";
        console.error(
          `[TraceQueryService] Failed to parse attributes_json for event ${event.event_type} (trace: ${event.trace_id}, span: ${event.span_id}):`,
          errorMsg
        );
        console.error(
          `[TraceQueryService] Invalid JSON preview (first 200 chars):`,
          jsonPreview
        );
        // Set empty attributes to prevent downstream errors
        attributes = {};
      }

      return {
        ...event,
        attributes,
      };
    });

    // Find trace_start and trace_end for summary
    const traceStart = parsedEvents.find(
      (e: any) => e.event_type === "trace_start"
    );
    const traceEnd = parsedEvents.find(
      (e: any) => e.event_type === "trace_end"
    );
    const llmCall = parsedEvents.find((e: any) => e.event_type === "llm_call");
    const firstEvent = parsedEvents[0];
    const lastEvent = parsedEvents[parsedEvents.length - 1];

    // Build spans map (span_id -> span object)
    const spansMap = new Map<string, any>();
    const spanEventsMap = new Map<string, any[]>();

    // Find the root span ID (from events with parent_span_id === null)
    const originalRootSpanId = parsedEvents.find(
      (e: any) => e.parent_span_id === null
    )?.span_id;

    // FIRST: Create root "Trace" span if it doesn't exist
    // This ensures parent spans exist before creating children
    if (originalRootSpanId && !spansMap.has(originalRootSpanId)) {
      const firstEvent =
        parsedEvents.find((e: any) => e.span_id === originalRootSpanId) ||
        parsedEvents[0];
      spansMap.set(originalRootSpanId, {
        id: originalRootSpanId,
        span_id: originalRootSpanId,
        parent_span_id: null,
        name: "Trace",
        start_time:
          firstEvent?.timestamp ||
          parsedEvents[0]?.timestamp ||
          new Date().toISOString(),
        end_time:
          parsedEvents[parsedEvents.length - 1]?.timestamp ||
          new Date().toISOString(),
        duration_ms: 0,
        events: [],
        children: [],
        metadata: {
          environment: firstEvent?.environment || parsedEvents[0]?.environment,
          conversation_id:
            firstEvent?.conversation_id || parsedEvents[0]?.conversation_id,
          session_id: firstEvent?.session_id || parsedEvents[0]?.session_id,
          user_id: firstEvent?.user_id || parsedEvents[0]?.user_id,
        },
        type: "trace",
        details: {},
        hasDetails: false,
        selectable: true,
      });
      spanEventsMap.set(originalRootSpanId, []);
    }

    // First pass: create all spans and attach events
    // For root span events (parent_span_id === null), create separate spans for each event type
    // This allows the frontend to display and click on each event type separately
    for (const event of parsedEvents) {
      let spanId = event.span_id;
      let parentSpanId = event.parent_span_id;

      // If this is a root span event (parent_span_id === null), create a unique span for each event type
      // This makes each event type (retrieval, llm_call, output, feedback, etc.) a separate clickable node
      if (
        event.parent_span_id === null &&
        (event.event_type === "retrieval" ||
          event.event_type === "llm_call" ||
          event.event_type === "tool_call" ||
          event.event_type === "output" ||
          event.event_type === "feedback")
      ) {
        // Create a unique span ID for this event type
        spanId = `${event.span_id}-${event.event_type}`;
        parentSpanId = event.span_id; // Make the original span_id the parent
      }

      if (!spansMap.has(spanId)) {
        // Determine span name based on event type
        let spanName = "Span";
        if (event.event_type === "llm_call") {
          const model = event.attributes?.llm_call?.model || "unknown";
          spanName = `LLM Call: ${model}`;
        } else if (event.event_type === "tool_call") {
          const toolName = event.attributes?.tool_call?.tool_name || "unknown";
          spanName = `Tool: ${toolName}`;
        } else if (event.event_type === "retrieval") {
          spanName = "Retrieval";
        } else if (event.event_type === "output") {
          spanName = "Output";
        } else if (event.event_type === "feedback") {
          const feedbackType = event.attributes?.feedback?.type || "unknown";
          const feedbackTypeLabel = feedbackType.charAt(0).toUpperCase() + feedbackType.slice(1);
          spanName = `Feedback: ${feedbackTypeLabel}`;
        } else if (event.parent_span_id === null) {
          spanName = "Trace";
        }

        spansMap.set(spanId, {
          id: spanId, // Add id field for frontend compatibility
          span_id: spanId,
          parent_span_id: parentSpanId,
          name: spanName,
          start_time: event.timestamp,
          end_time: event.timestamp,
          duration_ms: 0,
          events: [],
          children: [],
          metadata: {
            environment: event.environment,
            conversation_id: event.conversation_id,
            session_id: event.session_id,
            user_id: event.user_id,
          },
          // Include original span_id for frontend matching
          original_span_id: event.span_id,
          // Include event type for easy filtering/identification
          event_type: event.event_type,
        });
        spanEventsMap.set(spanId, []);
      }

      // Add event to span with unique ID
      const eventId = `${spanId}-${event.event_type}-${event.timestamp}`;
      spanEventsMap.get(spanId)!.push({
        id: eventId, // Add unique id for each event
        event_type: event.event_type,
        timestamp: event.timestamp,
        attributes: event.attributes,
        span_id: event.span_id, // Include original span_id for reference
        original_span_id: event.span_id, // Keep original for frontend matching
      });
    }

    // Second pass: calculate span durations, attach events, and extract detailed information
    for (const [spanId, span] of spansMap.entries()) {
      const spanEvents = spanEventsMap.get(spanId)!;

      // Sort events by timestamp
      spanEvents.sort(
        (a: any, b: any) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Attach events to span with full details
      span.events = spanEvents;

      // Extract detailed information from events based on type
      const llmCallEvent = spanEvents.find(
        (e: any) => e.event_type === "llm_call"
      );
      const toolCallEvent = spanEvents.find(
        (e: any) => e.event_type === "tool_call"
      );
      const retrievalEvent = spanEvents.find(
        (e: any) => e.event_type === "retrieval"
      );
      const outputEvent = spanEvents.find(
        (e: any) => e.event_type === "output"
      );
      const traceStartEvent = spanEvents.find(
        (e: any) => e.event_type === "trace_start"
      );
      const traceEndEvent = spanEvents.find(
        (e: any) => e.event_type === "trace_end"
      );
      const errorEvent = spanEvents.find(
        (e: any) => e.event_type === "error"
      );
      const feedbackEvent = spanEvents.find(
        (e: any) => e.event_type === "feedback"
      );

      // Extract feedback details
      if (feedbackEvent?.attributes?.feedback) {
        const feedbackAttrs = feedbackEvent.attributes.feedback;
        span.feedback = {
          type: feedbackAttrs.type || null,
          outcome: feedbackAttrs.outcome || null,
          rating: feedbackAttrs.rating !== undefined && feedbackAttrs.rating !== null 
            ? parseFloat(String(feedbackAttrs.rating)) 
            : null,
          comment: feedbackAttrs.comment || null,
        };
      }

      // Extract LLM call details
      if (llmCallEvent?.attributes?.llm_call) {
        const llmAttrs = llmCallEvent.attributes.llm_call;
        span.llm_call = {
          model: llmAttrs.model,
          input: llmAttrs.input || null,
          output: llmAttrs.output || null,
          input_tokens: llmAttrs.input_tokens || null,
          output_tokens: llmAttrs.output_tokens || null,
          total_tokens: llmAttrs.total_tokens || null,
          latency_ms: llmAttrs.latency_ms || null,
          time_to_first_token_ms: llmAttrs.time_to_first_token_ms || null,
          streaming_duration_ms: llmAttrs.streaming_duration_ms || null,
          finish_reason: llmAttrs.finish_reason || null,
          response_id: llmAttrs.response_id || null,
          system_fingerprint: llmAttrs.system_fingerprint || null,
          temperature: llmAttrs.temperature || null,
          max_tokens: llmAttrs.max_tokens || null,
          cost: llmAttrs.cost || null,
        };
      }

      // Extract tool call details
      if (toolCallEvent?.attributes?.tool_call) {
        const toolAttrs = toolCallEvent.attributes.tool_call;
        span.tool_call = {
          tool_name: toolAttrs.tool_name,
          args: toolAttrs.args || null,
          result: toolAttrs.result || null,
          result_status: toolAttrs.result_status,
          latency_ms: toolAttrs.latency_ms || null,
          error_message: toolAttrs.error_message || null,
        };
      }

      // Extract retrieval details
      if (retrievalEvent?.attributes?.retrieval) {
        const retrievalAttrs = retrievalEvent.attributes.retrieval;
        span.retrieval = {
          k: retrievalAttrs.k || retrievalAttrs.top_k || null,
          top_k: retrievalAttrs.top_k || retrievalAttrs.k || null,
          latency_ms: retrievalAttrs.latency_ms || null,
          retrieval_context_ids: retrievalAttrs.retrieval_context_ids || null,
          similarity_scores: retrievalAttrs.similarity_scores || null,
          // Note: retrieval_context might be in a different field or redacted
          retrieval_context: retrievalAttrs.retrieval_context || null,
        };
        // Ensure retrieval data is available even if event is not found directly
        if (
          !span.retrieval.retrieval_context &&
          retrievalEvent.attributes?.retrieval?.retrieval_context
        ) {
          span.retrieval.retrieval_context =
            retrievalEvent.attributes.retrieval.retrieval_context;
        }
      }

      // Extract output details
      if (outputEvent?.attributes?.output) {
        const outputAttrs = outputEvent.attributes.output;
        span.output = {
          final_output: outputAttrs.final_output || null,
          output_length: outputAttrs.output_length || null,
        };
      }

      // Extract trace lifecycle details
      if (traceStartEvent?.attributes?.trace_start) {
        span.trace_start = {
          name: traceStartEvent.attributes.trace_start.name || null,
          metadata: traceStartEvent.attributes.trace_start.metadata || null,
        };
      }

      if (traceEndEvent?.attributes?.trace_end) {
        span.trace_end = {
          total_latency_ms:
            traceEndEvent.attributes.trace_end.total_latency_ms || null,
          total_tokens: traceEndEvent.attributes.trace_end.total_tokens || null,
        };
      }

      // Extract error details
      if (errorEvent?.attributes?.error) {
        span.error = {
          error_type: errorEvent.attributes.error.error_type || null,
          error_message: errorEvent.attributes.error.error_message || null,
          stack_trace: errorEvent.attributes.error.stack_trace || null,
          context: errorEvent.attributes.error.context || null,
        };
      }

      // Calculate span duration from events
      if (spanEvents.length > 0) {
        const startTime = new Date(spanEvents[0].timestamp);
        const endTime = new Date(spanEvents[spanEvents.length - 1].timestamp);

        // For tool_call events, use latency from attributes
        if (toolCallEvent?.attributes?.tool_call?.latency_ms) {
          span.duration_ms = toolCallEvent.attributes.tool_call.latency_ms;
          span.end_time = new Date(
            startTime.getTime() + span.duration_ms
          ).toISOString();
        } else if (llmCallEvent?.attributes?.llm_call?.latency_ms) {
          span.duration_ms = llmCallEvent.attributes.llm_call.latency_ms;
          span.end_time = new Date(
            startTime.getTime() + span.duration_ms
          ).toISOString();
        } else if (retrievalEvent?.attributes?.retrieval?.latency_ms) {
          span.duration_ms = retrievalEvent.attributes.retrieval.latency_ms;
          span.end_time = new Date(
            startTime.getTime() + span.duration_ms
          ).toISOString();
        } else {
          span.duration_ms = endTime.getTime() - startTime.getTime();
          span.end_time = endTime.toISOString();
        }

        span.start_time = startTime.toISOString();
      }

      // Add all event timestamps for timeline visualization
      // Use trace start time as reference for all spans (for consistent timeline)
      const traceStartTime =
        traceStart?.timestamp || firstEvent?.timestamp || span.start_time;
      span.event_timestamps = spanEvents.map((e: any) => ({
        id: e.id,
        event_type: e.event_type,
        timestamp: e.timestamp,
        relative_time_ms:
          new Date(e.timestamp).getTime() - new Date(traceStartTime).getTime(),
      }));

      // Also add relative time from span start for span-level calculations
      span.relative_start_time_ms =
        new Date(span.start_time).getTime() -
        new Date(traceStartTime).getTime();
      span.relative_end_time_ms =
        new Date(span.end_time).getTime() - new Date(traceStartTime).getTime();

      // Langfuse-style: Flatten ALL data to top level of span for direct access
      // This ensures frontend can access everything directly like span.model, span.input, etc.
      span.hasDetails = true;
      span.selectable = true;

      if (span.llm_call) {
        span.type = "llm_call";
        // Flatten ALL LLM call data to top level (Langfuse approach)
        span.model = span.llm_call.model;
        span.input = span.llm_call.input;
        span.output = span.llm_call.output;
        span.input_tokens = span.llm_call.input_tokens;
        span.output_tokens = span.llm_call.output_tokens;
        span.total_tokens = span.llm_call.total_tokens;
        span.latency_ms = span.llm_call.latency_ms;
        span.time_to_first_token_ms = span.llm_call.time_to_first_token_ms;
        span.streaming_duration_ms = span.llm_call.streaming_duration_ms;
        span.finish_reason = span.llm_call.finish_reason;
        span.response_id = span.llm_call.response_id;
        span.system_fingerprint = span.llm_call.system_fingerprint;
        span.temperature = span.llm_call.temperature;
        span.max_tokens = span.llm_call.max_tokens;
        span.cost = span.llm_call.cost;
        // Keep nested structure for compatibility
        span.details = span.llm_call;
        span.hasInput = !!span.llm_call.input;
        span.hasOutput = !!span.llm_call.output;
      } else if (span.tool_call) {
        span.type = "tool_call";
        // Flatten ALL tool call data to top level
        span.tool_name = span.tool_call.tool_name;
        span.tool_args = span.tool_call.args;
        span.tool_result = span.tool_call.result;
        span.tool_status = span.tool_call.result_status;
        span.latency_ms = span.tool_call.latency_ms;
        span.error_message = span.tool_call.error_message;
        // Keep nested structure for compatibility
        span.details = span.tool_call;
        span.hasArgs = !!span.tool_call.args;
        span.hasResult = !!span.tool_call.result;
        // Ensure tool_call span has all necessary fields for frontend
        span.hasDetails = true;
        span.selectable = true;
      } else if (span.retrieval) {
        span.type = "retrieval";
        // Flatten ALL retrieval data to top level
        span.top_k = span.retrieval.top_k;
        span.k = span.retrieval.k;
        span.retrieval_context = span.retrieval.retrieval_context;
        span.retrieval_context_ids = span.retrieval.retrieval_context_ids;
        span.similarity_scores = span.retrieval.similarity_scores;
        span.latency_ms = span.retrieval.latency_ms;
        // Keep nested structure for compatibility
        span.details = span.retrieval;
        span.hasContext = !!span.retrieval.retrieval_context;
        // Ensure retrieval span has all necessary fields for frontend
        span.hasDetails = true;
        span.selectable = true;
      } else if (span.output) {
        span.type = "output";
        // Flatten ALL output data to top level
        span.final_output = span.output.final_output;
        span.output_length = span.output.output_length;
        // Keep nested structure for compatibility
        span.details = span.output;
        span.hasOutput = !!span.output.final_output;
      } else if (span.feedback) {
        span.type = "feedback";
        // Flatten ALL feedback data to top level
        span.feedback_type = span.feedback.type;
        span.feedback_outcome = span.feedback.outcome;
        span.feedback_rating = span.feedback.rating;
        span.feedback_comment = span.feedback.comment;
        // Keep nested structure for compatibility
        span.details = span.feedback;
        span.hasFeedback = true;
        span.hasComment = !!span.feedback.comment;
        // Ensure feedback span has all necessary fields for frontend
        span.hasDetails = true;
        span.selectable = true;
      } else {
        span.type = "trace";
        // For root trace spans, only show trace-level metadata, not child data
        span.details = {
          ...span.metadata,
          trace_id: traceId,
          tenant_id: tenantId,
          project_id: projectId,
        };
        // Root trace span should show it has children, but not include their data
        span.hasDetails = true;
        span.hasChildren = span.children && span.children.length > 0;
      }

      // Ensure events array has full attribute data for frontend that reads from events
      // Many frontends look for data in span.events[0].attributes.eventType
      span.events = spanEvents.map((e: any) => ({
        ...e,
        // Include full attributes for each event type at top level
        llm_call:
          e.event_type === "llm_call" ? e.attributes?.llm_call : undefined,
        tool_call:
          e.event_type === "tool_call" ? e.attributes?.tool_call : undefined,
        retrieval:
          e.event_type === "retrieval" ? e.attributes?.retrieval : undefined,
        output: e.event_type === "output" ? e.attributes?.output : undefined,
        feedback:
          e.event_type === "feedback" ? e.attributes?.feedback : undefined,
        // Keep original attributes structure for compatibility
        attributes: e.attributes,
      }));

      // For frontends that read from the first event, ensure it has the data
      if (spanEvents.length > 0 && span.events.length > 0) {
        const firstEvent = span.events[0];
        // If this span has type-specific data, ensure first event has it too
        if (span.llm_call && firstEvent.event_type === "llm_call") {
          firstEvent.llm_call = span.llm_call;
        }
        if (span.tool_call && firstEvent.event_type === "tool_call") {
          firstEvent.tool_call = span.tool_call;
        }
        if (span.feedback && firstEvent.event_type === "feedback") {
          firstEvent.feedback = span.feedback;
        }
        if (span.retrieval && firstEvent.event_type === "retrieval") {
          firstEvent.retrieval = span.retrieval;
        }
        if (span.output && firstEvent.event_type === "output") {
          firstEvent.output = span.output;
        }
      }
    }

    // Third pass: build parent-child relationships
    // Calculate root trace span duration from all child spans
    if (originalRootSpanId && spansMap.has(originalRootSpanId)) {
      const rootSpan = spansMap.get(originalRootSpanId)!;
      // Update root span duration to cover all child spans
      const allChildSpans = Array.from(spansMap.values()).filter(
        (s: any) => s.parent_span_id === originalRootSpanId
      );
      if (allChildSpans.length > 0) {
        const earliestStart = Math.min(
          ...allChildSpans.map((s: any) => new Date(s.start_time).getTime())
        );
        const latestEnd = Math.max(
          ...allChildSpans.map((s: any) => new Date(s.end_time).getTime())
        );
        rootSpan.start_time = new Date(earliestStart).toISOString();
        rootSpan.end_time = new Date(latestEnd).toISOString();
        rootSpan.duration_ms = latestEnd - earliestStart;
      } else {
        // Fallback to trace start/end events
        rootSpan.start_time =
          traceStart?.timestamp || firstEvent?.timestamp || rootSpan.start_time;
        rootSpan.end_time =
          traceEnd?.timestamp || lastEvent?.timestamp || rootSpan.end_time;
        if (traceStart && traceEnd) {
          rootSpan.duration_ms =
            new Date(traceEnd.timestamp).getTime() -
            new Date(traceStart.timestamp).getTime();
        }
      }

      // For root trace span, ensure details only contain trace-level metadata
      // Don't include children data in details to prevent showing all traces
      rootSpan.details = {
        trace_id: traceId,
        tenant_id: tenantId,
        project_id: projectId,
        environment: rootSpan.metadata.environment,
        conversation_id: rootSpan.metadata.conversation_id,
        session_id: rootSpan.metadata.session_id,
        user_id: rootSpan.metadata.user_id,
        start_time: rootSpan.start_time,
        end_time: rootSpan.end_time,
        duration_ms: rootSpan.duration_ms,
        child_count: allChildSpans.length,
      };
      // Mark that this is a root trace span (for frontend to handle differently)
      rootSpan.isRootTrace = true;
    }

    const rootSpans: any[] = [];
    for (const [spanId, span] of spansMap.entries()) {
      if (span.parent_span_id === null) {
        rootSpans.push(span);
      } else {
        const parentSpan = spansMap.get(span.parent_span_id);
        if (parentSpan) {
          if (!parentSpan.children) {
            parentSpan.children = [];
          }
          // CRITICAL: Check if span is already in children to prevent duplicates
          const existingChild = parentSpan.children.find(
            (c: any) => c.id === span.id || c.span_id === span.span_id
          );
          if (!existingChild) {
            parentSpan.children.push(span);
          } else {
            console.warn(
              `[TraceQueryService] Duplicate child span detected and skipped: ${span.id} in parent ${parentSpan.id}`
            );
          }
        } else {
          // Parent not found, treat as root
          rootSpans.push(span);
        }
      }
    }

    // Build summary from events
    const llmAttrs = llmCall?.attributes?.llm_call;
    const traceEndAttrs = traceEnd?.attributes?.trace_end;

    // Find output event for response
    const outputEvent = parsedEvents.find(
      (e: any) => e.event_type === "output"
    );

    // Calculate total cost from all LLM calls
    const allLLMEvents = parsedEvents.filter(
      (e: any) => e.event_type === "llm_call"
    );
    let totalCost = 0;
    allLLMEvents.forEach((event: any) => {
      const attrs = event.attributes?.llm_call || {};
      if (attrs.cost) {
        totalCost += attrs.cost;
      }
    });

    const summary = {
      trace_id: traceId,
      tenant_id: tenantId,
      project_id: projectId || firstEvent?.project_id || "",
      environment: firstEvent?.environment || "prod",
      conversation_id: firstEvent?.conversation_id || null,
      session_id: firstEvent?.session_id || null,
      user_id: firstEvent?.user_id || null,
      start_time:
        traceStart?.timestamp ||
        firstEvent?.timestamp ||
        new Date().toISOString(),
      end_time:
        traceEnd?.timestamp || lastEvent?.timestamp || new Date().toISOString(),
      total_latency_ms:
        traceEndAttrs?.total_latency_ms ||
        (traceStart && traceEnd
          ? new Date(traceEnd.timestamp).getTime() -
            new Date(traceStart.timestamp).getTime()
          : 0),
      total_tokens: traceEndAttrs?.total_tokens || llmAttrs?.total_tokens || 0,
      total_cost: totalCost > 0 ? totalCost : null,
      model: llmAttrs?.model || null,
      query: llmAttrs?.input || null, // User query from first LLM call input
      response:
        outputEvent?.attributes?.output?.final_output ||
        llmAttrs?.output ||
        null, // Final response
      finish_reason: llmAttrs?.finish_reason || null, // Finish reason from LLM call
    };

    // Get analysis results if available
    let analysisData: any = {};
    try {
      const traceData = await this.getTraceDetail(traceId, tenantId, projectId);
      if (traceData) {
        analysisData = {
          isHallucination: traceData.is_hallucination,
          hallucinationConfidence: traceData.hallucination_confidence,
          hallucinationReasoning: traceData.hallucination_reasoning,
          qualityScore: traceData.quality_score,
          coherenceScore: traceData.coherence_score,
          relevanceScore: traceData.relevance_score,
          helpfulnessScore: traceData.helpfulness_score,
          hasContextDrop: traceData.has_context_drop,
          hasModelDrift: traceData.has_model_drift,
          hasPromptInjection: traceData.has_prompt_injection,
          hasContextOverflow: traceData.has_context_overflow,
          hasFaithfulnessIssue: traceData.has_faithfulness_issue,
          hasCostAnomaly: traceData.has_cost_anomaly,
          hasLatencyAnomaly: traceData.has_latency_anomaly,
          hasQualityDegradation: traceData.has_quality_degradation,
          contextRelevanceScore: traceData.context_relevance_score,
          answerFaithfulnessScore: traceData.answer_faithfulness_score,
          driftScore: traceData.drift_score,
          anomalyScore: traceData.anomaly_score,
          analysisModel: traceData.analysis_model,
          analysisVersion: traceData.analysis_version,
          processingTimeMs: traceData.processing_time_ms,
        };
      }
    } catch (error) {
      console.warn(
        "[TraceQueryService] Could not fetch analysis results:",
        error
      );
    }

    // Build signals from analysis
    const signals: any[] = [];
    if (analysisData.isHallucination === true) {
      signals.push({
        signal_type: "hallucination",
        severity: "high",
        confidence: analysisData.hallucinationConfidence,
        reasoning: analysisData.hallucinationReasoning,
      });
    }
    if (analysisData.hasContextDrop) {
      signals.push({
        signal_type: "context_drop",
        severity: "medium",
        score: analysisData.contextRelevanceScore,
      });
    }
    if (analysisData.hasFaithfulnessIssue) {
      signals.push({
        signal_type: "faithfulness",
        severity: "medium",
        score: analysisData.answerFaithfulnessScore,
      });
    }

    // Create a flat array of all spans for easy lookup by frontend
    // This ensures the frontend can find any span by ID, regardless of hierarchy
    const allSpans = Array.from(spansMap.values());

    // Ensure all spans have consistent identifiers and are properly structured
    // Add additional lookup fields for frontend compatibility
    for (const span of allSpans) {
      // Ensure id and span_id are both set and consistent
      if (!span.id) span.id = span.span_id;
      if (!span.span_id) span.span_id = span.id;

      // Add a unique key field that frontends often use for React keys
      span.key = span.id;

      // Ensure selectable flag is set for all spans
      if (span.selectable === undefined) {
        span.selectable = true;
      }

      // Ensure hasDetails is set appropriately
      if (span.hasDetails === undefined) {
        span.hasDetails = !!(
          span.details ||
          span.llm_call ||
          span.tool_call ||
          span.retrieval ||
          span.output
        );
      }

      // CRITICAL: Ensure details object exists and is populated
      // Many frontends check span.details to determine if span has data
      if (!span.details || Object.keys(span.details).length === 0) {
        // If details is empty but we have type-specific data, populate it
        if (span.llm_call) {
          span.details = span.llm_call;
        } else if (span.tool_call) {
          span.details = span.tool_call;
        } else if (span.retrieval) {
          span.details = span.retrieval;
        } else if (span.output) {
          span.details = span.output;
        } else if (span.metadata) {
          span.details = span.metadata;
        } else {
          span.details = {
            type: span.type,
            name: span.name,
            duration_ms: span.duration_ms,
          };
        }
      }

      // Ensure span has a display name for frontend rendering
      if (!span.displayName) {
        span.displayName = span.name;
      }
    }

    // Create a lookup map by ID for O(1) access
    // Index by multiple identifiers to support different frontend matching strategies
    const spansById: Record<string, any> = {};
    for (const span of allSpans) {
      // Index by current ID (synthetic or original)
      spansById[span.id] = span;
      spansById[span.span_id] = span;

      // Also index by original span_id if different (for child spans)
      if (span.original_span_id && span.original_span_id !== span.id) {
        spansById[span.original_span_id] = span;
      }

      // Index by name for some frontends that use name as identifier
      if (span.name) {
        spansById[span.name] = span;
        // Also create a compound key: "name-event_type" for more specific matching
        if (span.event_type) {
          spansById[`${span.name}-${span.event_type}`] = span;
        }
      }

      // Index by event_type for event-based lookups
      if (span.event_type) {
        spansById[span.event_type] = span;
      }
    }

    // Phase 1/2: Enrich with deeper insights for trace detail UX
    const costBreakdown = this.buildCostBreakdown(summary, allSpans);
    const performanceAnalysis = this.buildPerformanceAnalysis(summary, allSpans);
    const tokenEfficiency = this.buildTokenEfficiency(summary, allSpans);
    const qualityExplanation = this.buildQualityExplanation(analysisData);

    // CRITICAL FIX: Return root spans in main spans array to avoid duplicates
    // Frontend renders tree from rootSpans/children, but needs to find spans by ID
    // Solution: Use rootSpans for tree structure, allSpans/spansById for lookup
    return {
      summary,
      // Return ONLY root spans in main spans array (for tree structure)
      // This prevents frontend from rendering duplicates (spans + children)
      spans: rootSpans.length > 0 ? rootSpans : allSpans,
      // Include flat array of ALL spans (including children) for lookup
      // Frontend should use allSpans or spansById to find child spans by ID
      allSpans: allSpans,
      // Include lookup map for O(1) span access by multiple identifiers
      // Frontend can use: trace.spansById[spanId] to get any span instantly
      spansById: spansById,
      signals,
      analysis: analysisData,
      costBreakdown,
      performanceAnalysis,
      tokenEfficiency,
      qualityExplanation,
      // Metadata about the trace structure
      _meta: {
        totalSpans: allSpans.length,
        rootSpans: rootSpans.length,
        hasChildren: rootSpans.some(
          (s: any) => s.children && s.children.length > 0
        ),
      },
    };
  }

  /**
   * Aggregate canonical events into a trace summary
   */
  private static aggregateEventsToTrace(
    events: any[],
    traceId: string,
    tenantId: string,
    projectId: string | null
  ): Partial<TraceSummary> {
    if (events.length === 0) {
      return {
        trace_id: traceId,
        tenant_id: tenantId,
        project_id: projectId || "",
      };
    }

    // Find trace_start event for metadata
    const traceStartEvent = events.find(
      (e: any) => e.event_type === "trace_start"
    );

    // Find LLM call events
    const llmEvents = events.filter((e: any) => e.event_type === "llm_call");

    // Find output events
    const outputEvents = events.filter((e: any) => e.event_type === "output");

    // Aggregate LLM call data
    let model: string | null = null;
    let query: string | null = null; // User query from first LLM call input
    let response: string | null = null; // Final response
    let finishReason: string | null = null; // Finish reason from last LLM call
    let totalLatency = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;

    llmEvents.forEach((event: any, index: number) => {
      const attrs = event.attributes?.llm_call || {};
      if (attrs.model && !model) {
        model = attrs.model;
      }
      // Extract query from FIRST LLM call input (user's question)
      if (index === 0 && attrs.input && !query) {
        query = attrs.input;
      }
      // Extract finish reason from LAST LLM call
      if (index === llmEvents.length - 1 && attrs.finish_reason) {
        finishReason = attrs.finish_reason;
      }
      if (attrs.latency_ms) {
        totalLatency += attrs.latency_ms;
      }
      if (attrs.input_tokens) {
        totalInputTokens += attrs.input_tokens;
      }
      if (attrs.output_tokens) {
        totalOutputTokens += attrs.output_tokens;
      }
      if (attrs.total_tokens) {
        totalTokens += attrs.total_tokens;
      }
      if (attrs.cost) {
        totalCost += attrs.cost;
      }
    });

    // Extract response from output events (prefer output event over LLM output)
    if (outputEvents.length > 0) {
      const lastOutput = outputEvents[outputEvents.length - 1];
      response = lastOutput.attributes?.output?.final_output || null;
    }
    // Fallback to last LLM call output if no output event
    if (!response && llmEvents.length > 0) {
      const lastLLM = llmEvents[llmEvents.length - 1];
      response = lastLLM.attributes?.llm_call?.output || null;
    }

    // Get earliest timestamp
    const timestamps = events.map((e: any) => e.timestamp).sort();
    const timestamp = timestamps[0] || new Date().toISOString();

    // Extract metadata from trace_start or first event
    const firstEvent = traceStartEvent || events[0];
    const metadata = firstEvent || {};

    return {
      trace_id: traceId,
      tenant_id: tenantId,
      project_id: projectId || metadata.project_id || "",
      timestamp,
      model,
      query: query, // User query from first LLM call
      response: response, // Final response from output event or last LLM call
      finish_reason: finishReason, // Finish reason from last LLM call
      latency_ms: totalLatency > 0 ? totalLatency : null,
      tokens_total: totalTokens > 0 ? totalTokens : null,
      tokens_prompt: totalInputTokens > 0 ? totalInputTokens : null,
      tokens_completion: totalOutputTokens > 0 ? totalOutputTokens : null,
      total_cost: totalCost > 0 ? totalCost : null,
      conversation_id: metadata.conversation_id || null,
      session_id: metadata.session_id || null,
      user_id: metadata.user_id || null,
      environment: metadata.environment || null,
    };
  }

  /**
   * Get analysis results from Postgres for given trace IDs
   */
  private static async getAnalysisResults(
    tenantId: string,
    traceIds: string[],
    projectId?: string | null
  ): Promise<any[]> {
    if (traceIds.length === 0) {
      return [];
    }

    const placeholders = traceIds.map((_, i) => `$${i + 2}`).join(", ");
    let whereClause = `WHERE tenant_id = $1 AND trace_id IN (${placeholders})`;
    const params: any[] = [tenantId, ...traceIds];

    if (projectId) {
      whereClause += ` AND project_id = $${params.length + 1}`;
      params.push(projectId);
    }

    const results = await query(
      `SELECT 
        trace_id,
        analyzed_at,
        is_hallucination,
        hallucination_confidence,
        has_context_drop,
        has_faithfulness_issue,
        has_model_drift,
        has_cost_anomaly,
        context_relevance_score,
        answer_faithfulness_score
      FROM analysis_results
      ${whereClause}`,
      params
    );

    return results;
  }

  /**
   * Filter traces by issue type
   */
  private static filterByIssueType(
    traces: TraceSummary[],
    issueType: string
  ): TraceSummary[] {
    switch (issueType) {
      case "hallucination":
        return traces.filter((t) => t.is_hallucination === true);
      case "context_drop":
        return traces.filter((t) => t.has_context_drop === true);
      case "faithfulness":
        return traces.filter((t) => t.has_faithfulness_issue === true);
      case "drift":
        return traces.filter((t) => t.has_model_drift === true);
      case "cost_anomaly":
        return traces.filter((t) => t.has_cost_anomaly === true);
      default:
        return traces;
    }
  }
}

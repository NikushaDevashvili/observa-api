/**
 * Trace Query Service
 *
 * Handles querying traces using the new canonical events architecture.
 * Queries canonical events from Tinybird and merges with analysis results from Postgres.
 */

import { TinybirdRepository } from "./tinybirdRepository.js";
import { query } from "../db/client.js";
import { CanonicalEvent } from "../types/events.js";
import { DefensiveJSONParser } from "../utils/defensiveJsonParser.js";

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
      typeof summary?.total_latency_ms === "number"
        ? summary.total_latency_ms
        : null;
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
      const name =
        slowest.name || slowest.displayName || slowest.type || "span";
      if (bottleneckPercentage !== null && bottleneckPercentage >= 50) {
        suggestions.push(
          `Most time is spent in "${name}" (~${bottleneckPercentage.toFixed(
            1,
          )}% of total). Consider caching, batching, or reducing work in this step.`,
        );
      } else if (
        bottleneckDurationMs !== null &&
        bottleneckDurationMs >= 1000
      ) {
        suggestions.push(
          `"${name}" took ${bottleneckDurationMs}ms. Consider adding timeouts, retries with backoff, and caching where applicable.`,
        );
      }

      const t = String(slowest.type || slowest.event_type || "").toLowerCase();
      if (t.includes("retrieval")) {
        suggestions.push(
          `Retrieval was a bottleneck. Consider smaller top-k, better indexes, caching, or pre-filtering before retrieval.`,
        );
      }
      if (t.includes("tool")) {
        suggestions.push(
          `Tool execution was a bottleneck. Consider parallelizing tool calls or adding memoization for deterministic results.`,
        );
      }
      if (t.includes("llm")) {
        suggestions.push(
          `LLM call was a bottleneck. Consider faster models, shorter prompts, or streaming + early stopping for UX.`,
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
    let total =
      typeof summary?.total_cost === "number" ? summary.total_cost : 0;
    const byType: Record<string, number> = {};
    const bySpan: Array<{ spanId: string; name: string; costUsd: number }> = [];

    for (const s of allSpans) {
      // Try multiple locations since span formats differ across paths.
      // Include non-LLM cost sources like embeddings and vector DB operations.
      const cost =
        s?.cost_usd ??
        s?.cost ??
        s?.llm_call?.cost ??
        s?.embedding?.cost ??
        s?.vector_db_operation?.cost ??
        s?.cache_operation?.saved_cost ??
        s?.details?.cost ??
        s?.attributes?.cost ??
        null;
      const costNum = typeof cost === "number" ? cost : null;
      if (costNum === null || !Number.isFinite(costNum) || costNum <= 0)
        continue;

      // Ensure total includes per-span if summary total isn't populated.
      if (!summary?.total_cost) total += costNum;

      const typeKey = String(
        s?.type || s?.event_type || "unknown",
      ).toLowerCase();
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
        Object.entries(byType).map(([k, v]) => [k, Number(v.toFixed(6))]),
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

    const inputChars =
      typeof summary?.query === "string" ? summary.query.length : 0;
    const outputChars =
      typeof summary?.response === "string" ? summary.response.length : 0;
    const totalChars = inputChars + outputChars;

    const tokensPerCharacter =
      totalTokens !== null && totalChars > 0 ? totalTokens / totalChars : null;

    const inputEfficiency =
      promptTokens > 0 && inputChars > 0 ? promptTokens / inputChars : null;
    const outputEfficiency =
      completionTokens > 0 && outputChars > 0
        ? completionTokens / outputChars
        : null;

    // Simple benchmark heuristic
    let benchmarkComparison: "above_average" | "average" | "below_average" =
      "average";
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
    const qualityScore =
      analysis.qualityScore ?? analysis.quality_score ?? null;
    const coherence =
      analysis.coherenceScore ?? analysis.coherence_score ?? null;
    const relevance =
      analysis.relevanceScore ?? analysis.relevance_score ?? null;
    const helpfulness =
      analysis.helpfulnessScore ?? analysis.helpfulness_score ?? null;

    const scoreExplain = (
      label: string,
      score: any,
    ): { score: number | null; explanation: string } => {
      if (typeof score !== "number") {
        return { score: null, explanation: `${label} score not available.` };
      }
      if (score < 0.5)
        return {
          score,
          explanation: `${label} is low; users may perceive this response as weak.`,
        };
      if (score < 0.7)
        return {
          score,
          explanation: `${label} is moderate; there is room to improve.`,
        };
      return { score, explanation: `${label} is strong.` };
    };

    const improvements: string[] = [];
    if (analysis.hasContextDrop)
      improvements.push(
        "Improve retrieval quality and ensure relevant context is included.",
      );
    if (analysis.hasFaithfulnessIssue)
      improvements.push(
        "Add citations/grounding and tighten instructions to avoid unsupported claims.",
      );
    if (analysis.hasPromptInjection)
      improvements.push(
        "Add prompt-injection guardrails and input sanitization.",
      );
    if (analysis.hasContextOverflow)
      improvements.push(
        "Reduce prompt size with summarization or better chunk selection.",
      );
    if (analysis.hasLatencyAnomaly)
      improvements.push(
        "Optimize slow spans (retrieval/tool/LLM) and add caching where possible.",
      );
    if (analysis.hasCostAnomaly)
      improvements.push(
        "Consider cheaper models, shorter prompts, and token budgeting.",
      );

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
    opts: TraceListQueryOptions,
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
    opts: TraceListQueryOptions,
  ): Promise<{
    traces: TraceSummary[];
    total: number;
    stats?: TraceListStats;
  }> {
    try {
      const limit = typeof opts.limit === "number" ? opts.limit : 50;
      const offset = typeof opts.offset === "number" ? opts.offset : 0;
      const sortBy: TraceListSortBy = opts.sortBy || "timestamp";
      const sortOrder =
        (opts.sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

      const { whereClause, params, nextIndex } = this.buildTraceListWhereClause(
        tenantId,
        opts,
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
        [...params, limit, offset],
      );

      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM analysis_results ${whereClause}`,
        params,
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
          params,
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
      [...values, limit],
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
    issueType?: string,
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
    projectId?: string | null,
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
        params,
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
      values,
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
      values,
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
   * Gets canonical events from Tinybird to build full hierarchical structure.
   * Returns null if no events found in Tinybird.
   */
  static async getTraceDetailTree(
    traceId: string,
    tenantId: string,
    projectId?: string | null,
  ): Promise<any | null> {
    try {
      // Get canonical events from Tinybird
      const { TinybirdRepository } = await import("./tinybirdRepository.js");

      let canonicalEvents: any[] = [];
      try {
        const eventsData: any = await TinybirdRepository.getTraceEvents(
          traceId,
          tenantId,
          projectId || null,
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

        if (canonicalEvents.length === 0) {
          console.log(
            `[TraceQueryService] ⚠️  No canonical events found in Tinybird for trace ${traceId}`,
          );
          return null;
        }

        console.log(
          `[TraceQueryService] ✅ Found ${canonicalEvents.length} canonical events for trace ${traceId}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[TraceQueryService] ❌ Error fetching canonical events from Tinybird for trace ${traceId}:`,
          errorMessage,
        );
        return null;
      }

      // Build tree from canonical events
      // #region agent log
      try {
        const eventTypes: Record<string, number> = {};
        let feedbackCount = 0;
        for (const evt of canonicalEvents) {
          eventTypes[evt.event_type] = (eventTypes[evt.event_type] || 0) + 1;
          if (evt.event_type === "feedback") feedbackCount += 1;
        }
        fetch(
          "http://127.0.0.1:7243/ingest/58308b77-6db1-45c3-a89e-548ba2d1edd2",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "traceQueryService.ts:getTraceDetailTree",
              message: "canonical events summary",
              data: {
                traceId,
                eventTypes,
                feedbackCount,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "M",
            }),
          },
        ).catch(() => {});
      } catch {
        // ignore debug logging errors
      }
      // #endregion

      const tree = await this.buildTreeFromCanonicalEvents(
        canonicalEvents,
        traceId,
        tenantId,
        projectId || null,
      );
      // #region agent log
      try {
        const allSpans = tree?.allSpans || tree?.spans || [];
        const spanTypes: Record<string, number> = {};
        let feedbackSpans = 0;
        for (const span of allSpans) {
          const type = span.event_type || span.type || "unknown";
          spanTypes[type] = (spanTypes[type] || 0) + 1;
          if (type === "feedback") feedbackSpans += 1;
        }
        fetch(
          "http://127.0.0.1:7243/ingest/58308b77-6db1-45c3-a89e-548ba2d1edd2",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "traceQueryService.ts:getTraceDetailTree",
              message: "trace tree span summary",
              data: {
                traceId,
                spanTypes,
                feedbackSpans,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "N",
            }),
          },
        ).catch(() => {});
      } catch {
        // ignore debug logging errors
      }
      // #endregion

      return tree;
    } catch (error) {
      console.error(
        "[TraceQueryService] Error querying trace detail tree:",
        error,
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
    projectId: string | null,
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
        } events that don't belong to trace ${traceId}`,
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
          `[TraceQueryService] Duplicate event detected and skipped: ${eventKey}`,
        );
      }
    }
    const uniqueEvents = Array.from(eventMap.values());

    if (uniqueEvents.length !== filteredEvents.length) {
      console.warn(
        `[TraceQueryService] Removed ${
          filteredEvents.length - uniqueEvents.length
        } duplicate events`,
      );
    }

    const repairMalformedJsonString = (input: string): string => {
      let result = "";
      let inString = false;
      let escaped = false;

      for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if (escaped) {
          // If we just saw a backslash, verify escape validity when inside a string
          if (inString) {
            const nextChar = ch;
            const isValidEscape =
              nextChar === '"' ||
              nextChar === "\\" ||
              nextChar === "/" ||
              nextChar === "b" ||
              nextChar === "f" ||
              nextChar === "n" ||
              nextChar === "r" ||
              nextChar === "t" ||
              nextChar === "u";

            if (!isValidEscape) {
              // Escape the backslash itself to preserve the literal
              result += "\\\\";
              result += nextChar;
              escaped = false;
              continue;
            }
          }

          result += ch;
          escaped = false;
          continue;
        }

        if (ch === "\\") {
          result += ch;
          escaped = true;
          continue;
        }

        if (ch === '"') {
          if (inString) {
            // If this quote isn't followed by a valid string terminator, escape it
            let j = i + 1;
            while (j < input.length && /\s/.test(input[j])) {
              j++;
            }
            const nextNonWhitespace = j < input.length ? input[j] : "";
            const isStringTerminator =
              nextNonWhitespace === "," ||
              nextNonWhitespace === "}" ||
              nextNonWhitespace === "]" ||
              nextNonWhitespace === "";

            if (!isStringTerminator) {
              result += '\\"';
              continue;
            }
          }

          inString = !inString;
          result += ch;
          continue;
        }

        if (inString) {
          if (ch === "\n") {
            result += "\\n";
            continue;
          }
          if (ch === "\r") {
            result += "\\r";
            continue;
          }
          if (ch === "\t") {
            result += "\\t";
            continue;
          }
          if (ch === "\b") {
            result += "\\b";
            continue;
          }
          if (ch === "\f") {
            result += "\\f";
            continue;
          }
          if (ch === "\u2028") {
            result += "\\u2028";
            continue;
          }
          if (ch === "\u2029") {
            result += "\\u2029";
            continue;
          }
        }

        result += ch;
      }

      return result;
    };

    const unescapeJsonStringFragment = (fragment: string): string => {
      let result = "";
      for (let i = 0; i < fragment.length; i++) {
        const ch = fragment[i];
        if (ch !== "\\") {
          result += ch;
          continue;
        }

        const next = fragment[i + 1];
        if (next === undefined) {
          result += "\\";
          continue;
        }

        if (next === '"' || next === "\\" || next === "/") {
          result += next;
          i++;
          continue;
        }
        if (next === "b") {
          result += "\b";
          i++;
          continue;
        }
        if (next === "f") {
          result += "\f";
          i++;
          continue;
        }
        if (next === "n") {
          result += "\n";
          i++;
          continue;
        }
        if (next === "r") {
          result += "\r";
          i++;
          continue;
        }
        if (next === "t") {
          result += "\t";
          i++;
          continue;
        }
        if (next === "u") {
          const hex = fragment.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            result += String.fromCharCode(parseInt(hex, 16));
            i += 5;
            continue;
          }
        }

        // Invalid escape, keep the backslash and next char
        result += "\\" + next;
        i++;
      }

      return result;
    };

    const repairFunctionCallArguments = (input: string): string => {
      let result = "";
      let cursor = 0;

      while (cursor < input.length) {
        const keyIndex = input.indexOf('"arguments"', cursor);
        if (keyIndex === -1) {
          result += input.slice(cursor);
          break;
        }

        // Copy everything up to the key
        result += input.slice(cursor, keyIndex);
        result += '"arguments"';

        const colonIndex = input.indexOf(":", keyIndex);
        if (colonIndex === -1) {
          result += input.slice(keyIndex + '"arguments"'.length);
          break;
        }

        result += input.slice(keyIndex + '"arguments"'.length, colonIndex + 1);

        let i = colonIndex + 1;
        while (i < input.length && /\s/.test(input[i])) i++;

        // If not a string value, just continue scanning
        if (input[i] !== '"') {
          cursor = i;
          continue;
        }

        const startQuote = i;
        i++;

        let escaped = false;
        let braceDepth = 0;
        let fragment = "";

        for (; i < input.length; i++) {
          const ch = input[i];

          if (escaped) {
            fragment += "\\" + ch;
            escaped = false;
            continue;
          }

          if (ch === "\\") {
            escaped = true;
            continue;
          }

          if (ch === "{") {
            braceDepth += 1;
          } else if (ch === "}") {
            if (braceDepth > 0) braceDepth -= 1;
          }

          if (ch === '"' && braceDepth === 0) {
            // End of string value
            const unescaped = unescapeJsonStringFragment(fragment);
            let repairedValue = JSON.stringify(unescaped);
            try {
              const parsedArgs = JSON.parse(unescaped);
              repairedValue = JSON.stringify(parsedArgs);
            } catch {
              // If parsing failed, check if it's malformed JSON missing outer braces
              // Pattern: "key":"value" (should be {"key":"value"})
              const trimmed = unescaped.trim();
              if (
                trimmed.startsWith('"') &&
                !trimmed.startsWith('"{') &&
                trimmed.includes(":") &&
                trimmed.length > 3
              ) {
                // Try wrapping in braces
                try {
                  const wrapped = `{${trimmed}}`;
                  const parsedArgs = JSON.parse(wrapped);
                  repairedValue = JSON.stringify(parsedArgs);
                } catch {
                  // If wrapping fails, try to reconstruct manually
                  // Extract key and value using regex
                  const keyValueMatch = trimmed.match(/^"([^"]+)"\s*:\s*(.+)$/);
                  if (keyValueMatch && keyValueMatch[1]) {
                    const key: string = keyValueMatch[1];
                    let val: any = keyValueMatch[2] || "";

                    // Try to parse the value
                    try {
                      // If value is quoted, extract it
                      if (val.startsWith('"') && val.endsWith('"')) {
                        val = val
                          .slice(1, -1)
                          .replace(/\\"/g, '"')
                          .replace(/\\\\/g, "\\");
                      } else {
                        // Try parsing as JSON (for numbers, booleans, etc.)
                        try {
                          val = JSON.parse(val);
                        } catch {
                          // Keep as string
                        }
                      }
                      const reconstructed = { [key]: val };
                      repairedValue = JSON.stringify(reconstructed);
                    } catch {
                      // If reconstruction fails, keep as string (original behavior)
                    }
                  }
                }
              }
              // If none of the fixes worked, keep as string (original behavior)
            }

            result += repairedValue;
            cursor = i + 1;
            break;
          }

          fragment += ch;
        }

        if (cursor <= startQuote) {
          // Failed to find closing quote; force a safe placeholder and advance
          result += "null";
          cursor = startQuote + 1;
        }
      }

      return result;
    };

    const stripArgumentsStringValues = (input: string): string => {
      let output = "";
      let i = 0;
      let inString = false;
      let escaped = false;

      while (i < input.length) {
        const ch = input[i];

        if (inString) {
          output += ch;
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          i += 1;
          continue;
        }

        if (ch === '"') {
          // Potential key
          if (input.startsWith('"arguments"', i)) {
            output += '"arguments"';
            i += '"arguments"'.length;

            // Copy whitespace/colon
            while (i < input.length && /\s/.test(input[i])) {
              output += input[i];
              i += 1;
            }
            if (input[i] === ":") {
              output += ":";
              i += 1;
            }
            while (i < input.length && /\s/.test(input[i])) {
              output += input[i];
              i += 1;
            }

            if (input[i] === '"') {
              // Check if this looks like a malformed JSON string (e.g., ""key":"value"")
              // We need to capture the full string value to potentially repair it
              const stringStart = i;
              i += 1; // skip opening quote

              let localEscaped = false;
              let stringContent = "";
              let foundClosingQuote = false;

              while (i < input.length) {
                const c = input[i];
                if (localEscaped) {
                  stringContent += "\\" + c;
                  localEscaped = false;
                } else if (c === "\\") {
                  localEscaped = true;
                  stringContent += c;
                } else if (c === '"') {
                  // Check if this is a closing quote or part of the content
                  // If the next char is also '"', it might be the start of a key in malformed JSON
                  if (
                    i + 1 < input.length &&
                    input[i + 1] === '"' &&
                    stringContent.trim().length > 0 &&
                    stringContent.includes(":")
                  ) {
                    // This looks like malformed JSON - continue collecting
                    stringContent += c;
                  } else {
                    // This is the closing quote
                    foundClosingQuote = true;
                    i += 1; // consume closing quote
                    break;
                  }
                } else {
                  stringContent += c;
                }
                i += 1;
              }

              // Check if the string content looks like malformed JSON (missing outer braces)
              const trimmed = stringContent.trim();
              if (
                trimmed.startsWith('"') &&
                !trimmed.startsWith('"{') &&
                trimmed.includes(":") &&
                trimmed.length > 3
              ) {
                // Try to repair it by extracting key and value, then reconstructing
                const keyValueMatch = trimmed.match(/^"([^"]+)"\s*:\s*(.+)$/);
                if (keyValueMatch && keyValueMatch[1]) {
                  const key: string = keyValueMatch[1];
                  let val: any = keyValueMatch[2] || "";

                  // Parse the value
                  if (val.startsWith('"') && val.endsWith('"')) {
                    val = val
                      .slice(1, -1)
                      .replace(/\\"/g, '"')
                      .replace(/\\\\/g, "\\");
                  } else {
                    try {
                      val = JSON.parse(val);
                    } catch {
                      // Keep as string
                    }
                  }

                  // Reconstruct as valid JSON object
                  try {
                    const repaired = JSON.stringify({ [key]: val });
                    output += repaired; // Use the repaired version
                  } catch {
                    // If reconstruction fails, try wrapping in braces
                    try {
                      const wrapped = `{${trimmed}}`;
                      JSON.parse(wrapped); // Validate it's parseable
                      output += wrapped;
                    } catch {
                      // Last resort: use empty object
                      output += "{}";
                    }
                  }
                } else {
                  // Try wrapping in braces as fallback
                  try {
                    const wrapped = `{${trimmed}}`;
                    JSON.parse(wrapped);
                    output += wrapped;
                  } catch {
                    output += "{}";
                  }
                }
              } else {
                // Not malformed, use empty object (original behavior)
                output += "{}";
              }

              if (!foundClosingQuote) {
                // If we didn't find a closing quote, we've consumed the rest
                break;
              }
              continue;
            }
          }

          inString = true;
          output += ch;
          i += 1;
          continue;
        }

        output += ch;
        i += 1;
      }

      return output;
    };

    // Parse events and extract attributes
    const parsedEvents = uniqueEvents.map((event: any) => {
      let attributes: Record<string, unknown> = {};

      try {
        if (typeof event.attributes_json === "string") {
          const parsed = DefensiveJSONParser.parse<Record<string, unknown>>(
            event.attributes_json,
            { fallback: {} },
          );
          if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            Object.keys(parsed).length > 0
          ) {
            attributes = parsed;
          } else {
            attributes = {};
          }
        } else if (event.attributes && typeof event.attributes === "object") {
          const parsed = DefensiveJSONParser.parse<Record<string, unknown>>(
            event.attributes,
            { fallback: {} },
          );
          if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            Object.keys(parsed).length > 0
          ) {
            attributes = parsed;
          } else {
            attributes = {};
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(
          `[TraceQueryService] Defensive parse failed for event ${event.event_type} (trace: ${event.trace_id}, span: ${event.span_id}):`,
          errorMsg,
        );
        attributes = {};
      }

      return {
        ...event,
        attributes,
      };
    });

    // Find trace_start and trace_end for summary
    const traceStart = parsedEvents.find(
      (e: any) => e.event_type === "trace_start",
    );
    const traceEnd = parsedEvents.find(
      (e: any) => e.event_type === "trace_end",
    );
    const llmCall = parsedEvents.find((e: any) => e.event_type === "llm_call");
    const firstEvent = parsedEvents[0];
    const lastEvent = parsedEvents[parsedEvents.length - 1];

    // Build spans map (span_id -> span object)
    const spansMap = new Map<string, any>();
    const spanEventsMap = new Map<string, any[]>();

    // Find the root span ID (from events with parent_span_id === null)
    const originalRootSpanId = parsedEvents.find(
      (e: any) => e.parent_span_id === null,
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
    const rootEventTypes = new Set([
      "retrieval",
      "llm_call",
      "tool_call",
      "output",
      "feedback",
      "embedding",
      "vector_db_operation",
      "cache_operation",
      "agent_create",
      "error",
    ]);
    for (const event of parsedEvents) {
      let spanId = event.span_id;
      let parentSpanId = event.parent_span_id;

      if (parentSpanId === "" || parentSpanId === "null") {
        parentSpanId = null;
      }

      // If this is a root span event (parent_span_id === null), create a unique span for each event type
      // This makes each event type (retrieval, llm_call, output, feedback, etc.) a separate clickable node
      if (
        event.parent_span_id === null &&
        rootEventTypes.has(event.event_type)
      ) {
        // Create a unique span ID for this event type
        spanId = `${event.span_id}-${event.event_type}`;
        parentSpanId = event.span_id; // Make the original span_id the parent
      }

      if (!spansMap.has(spanId)) {
        // Determine span name based on event type
        let spanName = "Span";
        if (event.event_type === "llm_call") {
          // Debug logging for llm_call events
          if (!event.attributes) {
            console.warn(
              `[TraceQueryService] ⚠️  llm_call event (trace: ${event.trace_id}, span: ${event.span_id}) has no attributes after parsing`,
            );
          } else if (!event.attributes.llm_call) {
            console.warn(
              `[TraceQueryService] ⚠️  llm_call event (trace: ${event.trace_id}, span: ${event.span_id}) has attributes but no llm_call key. Attributes keys:`,
              Object.keys(event.attributes),
            );
            console.warn(
              `[TraceQueryService] Full attributes:`,
              JSON.stringify(event.attributes, null, 2).substring(0, 500),
            );
          }
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
          const feedbackTypeLabel =
            feedbackType.charAt(0).toUpperCase() + feedbackType.slice(1);
          spanName = `Feedback: ${feedbackTypeLabel}`;
        } else if (event.event_type === "embedding") {
          const model = event.attributes?.embedding?.model || "unknown";
          spanName = `Embedding: ${model}`;
        } else if (event.event_type === "vector_db_operation") {
          const op = event.attributes?.vector_db_operation?.operation_type;
          spanName = `Vector DB: ${op || "operation"}`;
        } else if (event.event_type === "cache_operation") {
          const status = event.attributes?.cache_operation?.hit_status;
          spanName = `Cache: ${status || "operation"}`;
        } else if (event.event_type === "agent_create") {
          const agentName =
            event.attributes?.agent_create?.agent_name || "agent";
          spanName = `Agent Create: ${agentName}`;
        } else if (event.event_type === "error") {
          // Try to extract error details for better naming
          const errorData = event.attributes?.error || event.attributes?.signal;
          if (errorData) {
            const errorType = errorData.error_type || errorData.signal_type || "Error";
            const errorMessage = errorData.error_message || errorData.signal_name;
            if (errorMessage) {
              spanName = `Error: ${errorType} - ${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? "..." : ""}`;
            } else {
              spanName = `Error: ${errorType}`;
            }
          } else {
            spanName = "Error";
          }
        } else if (event.parent_span_id === null) {
          spanName = "Trace";
        }

        const safeParentSpanId = parentSpanId === spanId ? null : parentSpanId;
        const spanData: any = {
          id: spanId, // Add id field for frontend compatibility
          span_id: spanId,
          parent_span_id: safeParentSpanId,
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
        };

        // Add feedback-specific metadata for frontend styling
        if (event.event_type === "feedback" && event.attributes?.feedback) {
          const feedback = event.attributes.feedback;
          spanData.feedback_metadata = {
            type: feedback.type, // "like", "dislike", "rating", "correction"
            outcome: feedback.outcome, // "success", "failure", "partial"
            rating: feedback.rating || null,
            has_comment: !!feedback.comment,
            comment: feedback.comment || null,
            // Icon suggestions for frontend
            icon:
              feedback.type === "like"
                ? "👍"
                : feedback.type === "dislike"
                  ? "👎"
                  : feedback.type === "rating"
                    ? "⭐"
                    : "✏️",
            // Color suggestions for frontend
            color_class:
              feedback.type === "like"
                ? "text-green-600"
                : feedback.type === "dislike"
                  ? "text-red-600"
                  : feedback.type === "rating"
                    ? "text-yellow-600"
                    : "text-blue-600",
            bg_color_class:
              feedback.type === "like"
                ? "bg-green-50 border-green-200"
                : feedback.type === "dislike"
                  ? "bg-red-50 border-red-200"
                  : feedback.type === "rating"
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-blue-50 border-blue-200",
          };
        }

        spansMap.set(spanId, spanData);
        spanEventsMap.set(spanId, []);
      }

      // Add event to span with unique ID
      const eventId = `${spanId}-${event.event_type}-${event.timestamp}`;

      // Enhanced logging for llm_call events to verify attributes are preserved
      const isLlmCall = event.event_type === "llm_call";
      if (isLlmCall) {
        console.log(
          `[TraceQueryService] Adding llm_call event to span ${spanId}:`,
        );
        console.log(
          `[TraceQueryService] event.attributes type: ${typeof event.attributes}`,
        );
        console.log(
          `[TraceQueryService] event.attributes keys: ${Object.keys(event.attributes || {}).join(", ")}`,
        );
        console.log(
          `[TraceQueryService] event.attributes.llm_call exists: ${!!event.attributes?.llm_call}`,
        );
      }

      spanEventsMap.get(spanId)!.push({
        id: eventId, // Add unique id for each event
        event_type: event.event_type,
        timestamp: event.timestamp,
        attributes: event.attributes,
        attributes_json: event.attributes_json,
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
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // Attach events to span with full details
      span.events = spanEvents;

      // Extract detailed information from events based on type
      const llmCallEvent = spanEvents.find(
        (e: any) => e.event_type === "llm_call",
      );
      const toolCallEvent = spanEvents.find(
        (e: any) => e.event_type === "tool_call",
      );
      const retrievalEvent = spanEvents.find(
        (e: any) => e.event_type === "retrieval",
      );
      const outputEvent = spanEvents.find(
        (e: any) => e.event_type === "output",
      );
      const traceStartEvent = spanEvents.find(
        (e: any) => e.event_type === "trace_start",
      );
      const traceEndEvent = spanEvents.find(
        (e: any) => e.event_type === "trace_end",
      );
      const errorEvent = spanEvents.find((e: any) => e.event_type === "error");
      const feedbackEvent = spanEvents.find(
        (e: any) => e.event_type === "feedback",
      );

      // Extract feedback details
      if (feedbackEvent?.attributes?.feedback) {
        const feedbackAttrs = feedbackEvent.attributes.feedback;
        span.feedback = {
          type: feedbackAttrs.type || null,
          outcome: feedbackAttrs.outcome || null,
          rating:
            feedbackAttrs.rating !== undefined && feedbackAttrs.rating !== null
              ? parseFloat(String(feedbackAttrs.rating))
              : null,
          comment: feedbackAttrs.comment || null,
        };
      }

      // Extract LLM call details
      if (llmCallEvent) {
        // Debug logging if llm_call event exists but attributes are missing
        if (!llmCallEvent.attributes) {
          console.warn(
            `[TraceQueryService] ⚠️  llmCallEvent (span: ${spanId}) has no attributes property`,
          );
        } else if (!llmCallEvent.attributes.llm_call) {
          console.warn(
            `[TraceQueryService] ⚠️  llmCallEvent (span: ${spanId}) attributes missing llm_call key. Available keys:`,
            Object.keys(llmCallEvent.attributes),
          );
          console.warn(
            `[TraceQueryService] attributes_json raw value:`,
            typeof llmCallEvent.attributes_json === "string"
              ? llmCallEvent.attributes_json.substring(0, 500)
              : "not a string",
          );
        }
      }
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
          // TIER 1: OTEL Semantic Conventions
          operation_name: llmAttrs.operation_name || null,
          provider_name: llmAttrs.provider_name || null,
          response_model: llmAttrs.response_model || null,
          // TIER 2: Sampling parameters
          top_k: llmAttrs.top_k || null,
          top_p: llmAttrs.top_p || null,
          frequency_penalty: llmAttrs.frequency_penalty || null,
          presence_penalty: llmAttrs.presence_penalty || null,
          stop_sequences: llmAttrs.stop_sequences || null,
          seed: llmAttrs.seed || null,
          // TIER 2: Structured cost tracking
          input_cost: llmAttrs.input_cost || null,
          output_cost: llmAttrs.output_cost || null,
          // TIER 1: Structured message objects
          input_messages: llmAttrs.input_messages || null,
          output_messages: llmAttrs.output_messages || null,
          system_instructions: llmAttrs.system_instructions || null,
          // TIER 2: Server metadata
          server_address: llmAttrs.server_address || null,
          server_port: llmAttrs.server_port || null,
          // TIER 2: Conversation grouping
          conversation_id_otel: llmAttrs.conversation_id_otel || null,
          choice_count: llmAttrs.choice_count || null,
          // Tool definitions provided to the model
          tool_definitions: llmAttrs.tool_definitions || llmAttrs.tools || null,
          tools: llmAttrs.tools || llmAttrs.tool_definitions || null,
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
          // TIER 2: OTEL Tool Standardization
          operation_name: toolAttrs.operation_name || null,
          tool_type: toolAttrs.tool_type || null,
          tool_description: toolAttrs.tool_description || null,
          tool_call_id: toolAttrs.tool_call_id || null,
          error_type: toolAttrs.error_type || null,
          error_category: toolAttrs.error_category || null,
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
          // TIER 2: Retrieval enrichment
          embedding_model: retrievalAttrs.embedding_model || null,
          embedding_dimensions: retrievalAttrs.embedding_dimensions || null,
          vector_metric: retrievalAttrs.vector_metric || null,
          rerank_score: retrievalAttrs.rerank_score || null,
          fusion_method: retrievalAttrs.fusion_method || null,
          deduplication_removed_count:
            retrievalAttrs.deduplication_removed_count || null,
          quality_score: retrievalAttrs.quality_score || null,
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

      // TIER 1: Extract embedding details
      const embeddingEvent = spanEvents.find(
        (e) => e.event_type === "embedding",
      );
      if (embeddingEvent?.attributes?.embedding) {
        const embeddingAttrs = embeddingEvent.attributes.embedding;
        span.embedding = {
          model: embeddingAttrs.model,
          dimension_count: embeddingAttrs.dimension_count || null,
          encoding_formats: embeddingAttrs.encoding_formats || null,
          input_tokens: embeddingAttrs.input_tokens || null,
          output_tokens: embeddingAttrs.output_tokens || null,
          latency_ms: embeddingAttrs.latency_ms || null,
          cost: embeddingAttrs.cost || null,
          input_text: embeddingAttrs.input_text || null,
          input_hash: embeddingAttrs.input_hash || null,
          embeddings: embeddingAttrs.embeddings || null,
          embeddings_hash: embeddingAttrs.embeddings_hash || null,
          operation_name: embeddingAttrs.operation_name || null,
          provider_name: embeddingAttrs.provider_name || null,
        };
      }

      // TIER 3: Extract vector DB operation details
      const vectorDbEvent = spanEvents.find(
        (e) => e.event_type === "vector_db_operation",
      );
      if (vectorDbEvent?.attributes?.vector_db_operation) {
        const vdbAttrs = vectorDbEvent.attributes.vector_db_operation;
        span.vector_db_operation = {
          operation_type: vdbAttrs.operation_type,
          index_name: vdbAttrs.index_name || null,
          index_version: vdbAttrs.index_version || null,
          vector_dimensions: vdbAttrs.vector_dimensions || null,
          vector_metric: vdbAttrs.vector_metric || null,
          results_count: vdbAttrs.results_count || null,
          scores: vdbAttrs.scores || null,
          latency_ms: vdbAttrs.latency_ms || null,
          cost: vdbAttrs.cost || null,
          api_version: vdbAttrs.api_version || null,
          provider_name: vdbAttrs.provider_name || null,
        };
      }

      // TIER 3: Extract cache operation details
      const cacheEvent = spanEvents.find(
        (e) => e.event_type === "cache_operation",
      );
      if (cacheEvent?.attributes?.cache_operation) {
        const cacheAttrs = cacheEvent.attributes.cache_operation;
        span.cache_operation = {
          cache_backend: cacheAttrs.cache_backend || null,
          cache_key: cacheAttrs.cache_key || null,
          cache_namespace: cacheAttrs.cache_namespace || null,
          hit_status: cacheAttrs.hit_status,
          latency_ms: cacheAttrs.latency_ms || null,
          saved_cost: cacheAttrs.saved_cost || null,
          ttl: cacheAttrs.ttl || null,
          eviction_info: cacheAttrs.eviction_info || null,
        };
      }

      // TIER 3: Extract agent creation details
      const agentCreateEvent = spanEvents.find(
        (e) => e.event_type === "agent_create",
      );
      if (agentCreateEvent?.attributes?.agent_create) {
        const agentAttrs = agentCreateEvent.attributes.agent_create;
        span.agent_create = {
          agent_name: agentAttrs.agent_name,
          agent_config: agentAttrs.agent_config || null,
          tools_bound: agentAttrs.tools_bound || null,
          model_config: agentAttrs.model_config || null,
          operation_name: agentAttrs.operation_name || null,
        };
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
          // TIER 2: Structured error classification
          error_category: errorEvent.attributes.error.error_category || null,
          error_code: errorEvent.attributes.error.error_code || null,
        };
      } else if (errorEvent?.attributes?.signal) {
        // Convert signal events to error format
        // Signals are stored as event_type="error" with attributes.signal
        const signal = errorEvent.attributes.signal;
        const signalMetadata = signal.metadata || {};
        span.error = {
          error_type: signalMetadata.error_type || signal.signal_type || "error",
          error_message:
            signalMetadata.error_message ||
            signalMetadata.tool_name
              ? `Tool error: ${signalMetadata.tool_name} - ${signalMetadata.error_message || signal.signal_name}`
              : signal.signal_name || "Error signal",
          stack_trace: signalMetadata.stack_trace || null,
          context: {
            ...signalMetadata,
            signal_name: signal.signal_name,
            signal_type: signal.signal_type,
            signal_severity: signal.signal_severity,
            signal_value: signal.signal_value,
          },
          // TIER 2: Structured error classification
          error_category: signalMetadata.error_category || signal.signal_type || null,
          error_code: signal.signal_name || null,
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
            startTime.getTime() + span.duration_ms,
          ).toISOString();
        } else if (llmCallEvent?.attributes?.llm_call?.latency_ms) {
          span.duration_ms = llmCallEvent.attributes.llm_call.latency_ms;
          span.end_time = new Date(
            startTime.getTime() + span.duration_ms,
          ).toISOString();
        } else if (retrievalEvent?.attributes?.retrieval?.latency_ms) {
          span.duration_ms = retrievalEvent.attributes.retrieval.latency_ms;
          span.end_time = new Date(
            startTime.getTime() + span.duration_ms,
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

        // CRITICAL: Populate input/output fields comprehensively for frontend
        // Input: All arguments with tool name
        if (span.tool_call.args !== null && span.tool_call.args !== undefined) {
          const toolInput: any = {
            tool_name: span.tool_call.tool_name,
            ...(typeof span.tool_call.args === "object" &&
            span.tool_call.args !== null
              ? span.tool_call.args
              : { args: span.tool_call.args }),
          };
          span.input = JSON.stringify(toolInput, null, 2);
        } else {
          span.input = JSON.stringify(
            { tool_name: span.tool_call.tool_name },
            null,
            2,
          );
        }

        // Output: Complete result with all metadata
        const toolOutput: any = {};

        // For search tools, ensure all results are preserved
        if (
          span.tool_call.tool_name === "web_search" ||
          span.tool_call.tool_name?.includes("search") ||
          span.tool_call.tool_name?.includes("Search")
        ) {
          if (span.tool_call.result) {
            if (
              typeof span.tool_call.result === "object" &&
              span.tool_call.result !== null
            ) {
              // Preserve all fields from result
              Object.assign(toolOutput, span.tool_call.result);

              // Ensure results array is complete (not truncated)
              if (Array.isArray(span.tool_call.result.results)) {
                toolOutput.results = span.tool_call.result.results;
                toolOutput.total_results = span.tool_call.result.results.length;
              }

              // Preserve all result fields (items_found, data, urls, snippets, etc.)
              if (span.tool_call.result.items_found !== undefined) {
                toolOutput.items_found = span.tool_call.result.items_found;
              }
              if (span.tool_call.result.data !== undefined) {
                toolOutput.data = span.tool_call.result.data;
              }
              if (span.tool_call.result.metadata !== undefined) {
                toolOutput.metadata = span.tool_call.result.metadata;
              }
              if (span.tool_call.result.query !== undefined) {
                toolOutput.query = span.tool_call.result.query;
              }
              if (span.tool_call.result.urls !== undefined) {
                toolOutput.urls = span.tool_call.result.urls;
              }
              if (span.tool_call.result.snippets !== undefined) {
                toolOutput.snippets = span.tool_call.result.snippets;
              }
            } else {
              toolOutput.result = span.tool_call.result;
            }
          }
        } else {
          // For all other tools, preserve complete result structure
          if (
            span.tool_call.result !== null &&
            span.tool_call.result !== undefined
          ) {
            if (typeof span.tool_call.result === "object") {
              Object.assign(toolOutput, span.tool_call.result);
            } else {
              toolOutput.result = span.tool_call.result;
            }
          }
        }

        // Always include execution metadata
        toolOutput.execution = {
          status: span.tool_call.result_status,
          latency_ms: span.tool_call.latency_ms,
          tool_name: span.tool_call.tool_name,
          ...(span.tool_call.error_message && {
            error_message: span.tool_call.error_message,
          }),
        };

        // Include error details if present
        if (
          span.tool_call.result_status === "error" ||
          span.tool_call.result_status === "timeout"
        ) {
          toolOutput.error = {
            status: span.tool_call.result_status,
            message: span.tool_call.error_message || "No result returned",
          };
        }

        if (Object.keys(toolOutput).length > 0) {
          span.output = JSON.stringify(toolOutput, null, 2);
        } else {
          // Fallback: Show at least execution metadata
          span.output = JSON.stringify(toolOutput.execution, null, 2);
        }

        span.hasInput = !!span.input;
        span.hasOutput = !!span.output;

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

        // CRITICAL FIX: Populate input/output fields for frontend display
        // Input: Query/metadata (k, top_k)
        const retrievalInput: any = {};
        if (span.retrieval.k !== null && span.retrieval.k !== undefined) {
          retrievalInput.k = span.retrieval.k;
        }
        if (
          span.retrieval.top_k !== null &&
          span.retrieval.top_k !== undefined
        ) {
          retrievalInput.top_k = span.retrieval.top_k;
        }
        if (Object.keys(retrievalInput).length > 0) {
          span.input = JSON.stringify(retrievalInput, null, 2);
        }

        // Output: Retrieval context or formatted summary
        if (span.retrieval.retrieval_context) {
          span.output =
            typeof span.retrieval.retrieval_context === "string"
              ? span.retrieval.retrieval_context
              : JSON.stringify(span.retrieval.retrieval_context, null, 2);
        } else {
          // Create formatted summary with available data
          const retrievalOutput: any = {};
          if (
            span.retrieval.retrieval_context_ids &&
            span.retrieval.retrieval_context_ids.length > 0
          ) {
            retrievalOutput.retrieved_documents =
              span.retrieval.retrieval_context_ids;
            retrievalOutput.document_count =
              span.retrieval.retrieval_context_ids.length;
          }
          if (
            span.retrieval.similarity_scores &&
            span.retrieval.similarity_scores.length > 0
          ) {
            retrievalOutput.similarity_scores =
              span.retrieval.similarity_scores;
            retrievalOutput.avg_similarity =
              span.retrieval.similarity_scores.reduce(
                (a: number, b: number) => a + b,
                0,
              ) / span.retrieval.similarity_scores.length;
            retrievalOutput.max_similarity = Math.max(
              ...span.retrieval.similarity_scores,
            );
            retrievalOutput.min_similarity = Math.min(
              ...span.retrieval.similarity_scores,
            );
          }
          if (
            span.retrieval.latency_ms !== null &&
            span.retrieval.latency_ms !== undefined
          ) {
            retrievalOutput.latency_ms = span.retrieval.latency_ms;
          }
          if (Object.keys(retrievalOutput).length > 0) {
            span.output = JSON.stringify(retrievalOutput, null, 2);
          } else {
            // Fallback: Basic metadata
            span.output = JSON.stringify(
              {
                type: "retrieval",
                latency_ms: span.retrieval.latency_ms,
                k: span.retrieval.k || span.retrieval.top_k,
              },
              null,
              2,
            );
          }
        }

        span.hasInput = !!span.input;
        span.hasOutput = !!span.output;

        // Keep nested structure for compatibility
        span.details = span.retrieval;
        span.hasContext = !!span.retrieval.retrieval_context;
        // Ensure retrieval span has all necessary fields for frontend
        span.hasDetails = true;
        span.selectable = true;
      } else if (span.embedding) {
        span.type = "embedding";
        // Flatten ALL embedding data to top level
        span.model = span.embedding.model;
        span.dimension_count = span.embedding.dimension_count;
        span.input_tokens = span.embedding.input_tokens;
        span.output_tokens = span.embedding.output_tokens;
        span.latency_ms = span.embedding.latency_ms;
        span.cost = span.embedding.cost;

        // Input: Embedding input text or metadata
        const embeddingInput: any = {
          model: span.embedding.model,
        };
        if (span.embedding.input_text) {
          embeddingInput.input_text = span.embedding.input_text;
        } else if (span.embedding.input_hash) {
          embeddingInput.input_hash = span.embedding.input_hash;
        }
        if (span.embedding.encoding_formats) {
          embeddingInput.encoding_formats = span.embedding.encoding_formats;
        }
        span.input = JSON.stringify(embeddingInput, null, 2);

        // Output: Embedding results
        const embeddingOutput: any = {
          dimension_count: span.embedding.dimension_count,
          input_tokens: span.embedding.input_tokens,
          output_tokens: span.embedding.output_tokens,
          latency_ms: span.embedding.latency_ms,
        };
        if (span.embedding.cost !== null && span.embedding.cost !== undefined) {
          embeddingOutput.cost = span.embedding.cost;
        }
        if (span.embedding.embeddings) {
          // Show summary if embeddings are available
          embeddingOutput.embeddings_count = span.embedding.embeddings.length;
          embeddingOutput.embeddings_preview = span.embedding.embeddings
            .slice(0, 3)
            .map(
              (emb: number[]) =>
                `[${emb.slice(0, 5).join(", ")}, ...] (${emb.length} dims)`,
            );
        } else if (span.embedding.embeddings_hash) {
          embeddingOutput.embeddings_hash = span.embedding.embeddings_hash;
        }
        span.output = JSON.stringify(embeddingOutput, null, 2);

        span.hasInput = !!span.input;
        span.hasOutput = !!span.output;

        // Keep nested structure for compatibility
        span.details = span.embedding;
        span.hasDetails = true;
        span.selectable = true;
      } else if (span.vector_db_operation) {
        span.type = "vector_db_operation";
        // Flatten ALL vector DB data to top level
        span.operation_type = span.vector_db_operation.operation_type;
        span.index_name = span.vector_db_operation.index_name;
        span.vector_dimensions = span.vector_db_operation.vector_dimensions;
        span.vector_metric = span.vector_db_operation.vector_metric;
        span.results_count = span.vector_db_operation.results_count;
        span.latency_ms = span.vector_db_operation.latency_ms;
        span.cost = span.vector_db_operation.cost ?? null;

        const vectorInput: any = {
          operation_type: span.vector_db_operation.operation_type,
          index_name: span.vector_db_operation.index_name,
          vector_dimensions: span.vector_db_operation.vector_dimensions,
          vector_metric: span.vector_db_operation.vector_metric,
          provider_name: span.vector_db_operation.provider_name,
          api_version: span.vector_db_operation.api_version,
        };
        span.input = JSON.stringify(vectorInput, null, 2);

        const vectorOutput: any = {
          results_count: span.vector_db_operation.results_count,
          scores: span.vector_db_operation.scores,
          latency_ms: span.vector_db_operation.latency_ms,
        };
        if (
          span.vector_db_operation.cost !== null &&
          span.vector_db_operation.cost !== undefined
        ) {
          vectorOutput.cost = span.vector_db_operation.cost;
        }
        span.output = JSON.stringify(vectorOutput, null, 2);

        span.hasInput = !!span.input;
        span.hasOutput = !!span.output;
        span.details = span.vector_db_operation;
        span.hasDetails = true;
        span.selectable = true;
      } else if (span.cache_operation) {
        span.type = "cache_operation";
        // Flatten ALL cache data to top level
        span.cache_backend = span.cache_operation.cache_backend;
        span.cache_key = span.cache_operation.cache_key;
        span.cache_namespace = span.cache_operation.cache_namespace;
        span.hit_status = span.cache_operation.hit_status;
        span.latency_ms = span.cache_operation.latency_ms;
        span.saved_cost = span.cache_operation.saved_cost ?? null;

        const cacheInput: any = {
          cache_backend: span.cache_operation.cache_backend,
          cache_key: span.cache_operation.cache_key,
          cache_namespace: span.cache_operation.cache_namespace,
          ttl: span.cache_operation.ttl,
        };
        span.input = JSON.stringify(cacheInput, null, 2);

        const cacheOutput: any = {
          hit_status: span.cache_operation.hit_status,
          latency_ms: span.cache_operation.latency_ms,
          saved_cost: span.cache_operation.saved_cost ?? null,
          eviction_info: span.cache_operation.eviction_info ?? null,
        };
        span.output = JSON.stringify(cacheOutput, null, 2);

        span.hasInput = !!span.input;
        span.hasOutput = !!span.output;
        span.details = span.cache_operation;
        span.hasDetails = true;
        span.selectable = true;
      } else if (span.agent_create) {
        span.type = "agent_create";
        // Flatten ALL agent creation data to top level
        span.agent_name = span.agent_create.agent_name;
        span.tools_bound = span.agent_create.tools_bound;
        span.model_config = span.agent_create.model_config;

        const agentInput: any = {
          agent_name: span.agent_create.agent_name,
          agent_config: span.agent_create.agent_config,
          tools_bound: span.agent_create.tools_bound,
          model_config: span.agent_create.model_config,
        };
        span.input = JSON.stringify(agentInput, null, 2);

        const agentOutput: any = {
          operation_name: span.agent_create.operation_name ?? null,
          tools_bound: span.agent_create.tools_bound ?? null,
        };
        span.output = JSON.stringify(agentOutput, null, 2);

        span.hasInput = !!span.input;
        span.hasOutput = !!span.output;
        span.details = span.agent_create;
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
      } else if (span.error) {
        span.type = "error";
        // Flatten ALL error data to top level
        span.error_type = span.error.error_type;
        span.error_message = span.error.error_message;
        span.error_category = span.error.error_category ?? null;
        span.error_code = span.error.error_code ?? null;

        const errorOutput: any = {
          error_type: span.error.error_type,
          error_message: span.error.error_message,
          error_category: span.error.error_category ?? null,
          error_code: span.error.error_code ?? null,
          stack_trace: span.error.stack_trace ?? null,
          context: span.error.context ?? null,
        };
        span.output = JSON.stringify(errorOutput, null, 2);
        span.hasOutput = !!span.output;

        span.details = span.error;
        span.hasDetails = true;
        span.selectable = true;
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
        embedding:
          e.event_type === "embedding" ? e.attributes?.embedding : undefined,
        vector_db_operation:
          e.event_type === "vector_db_operation"
            ? e.attributes?.vector_db_operation
            : undefined,
        cache_operation:
          e.event_type === "cache_operation"
            ? e.attributes?.cache_operation
            : undefined,
        agent_create:
          e.event_type === "agent_create"
            ? e.attributes?.agent_create
            : undefined,
        output: e.event_type === "output" ? e.attributes?.output : undefined,
        feedback:
          e.event_type === "feedback" ? e.attributes?.feedback : undefined,
        error: e.event_type === "error" ? e.attributes?.error : undefined,
        trace_start:
          e.event_type === "trace_start"
            ? e.attributes?.trace_start
            : undefined,
        trace_end:
          e.event_type === "trace_end" ? e.attributes?.trace_end : undefined,
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
        if (span.embedding && firstEvent.event_type === "embedding") {
          firstEvent.embedding = span.embedding;
        }
        if (
          span.vector_db_operation &&
          firstEvent.event_type === "vector_db_operation"
        ) {
          firstEvent.vector_db_operation = span.vector_db_operation;
        }
        if (
          span.cache_operation &&
          firstEvent.event_type === "cache_operation"
        ) {
          firstEvent.cache_operation = span.cache_operation;
        }
        if (span.agent_create && firstEvent.event_type === "agent_create") {
          firstEvent.agent_create = span.agent_create;
        }
        if (span.error && firstEvent.event_type === "error") {
          firstEvent.error = span.error;
        }
        if (span.trace_start && firstEvent.event_type === "trace_start") {
          firstEvent.trace_start = span.trace_start;
        }
        if (span.trace_end && firstEvent.event_type === "trace_end") {
          firstEvent.trace_end = span.trace_end;
        }
      }
    }

    // CRITICAL FIX: Attach child events to their parent spans
    // This ensures feedback, tool calls, and other child events are visible on parent spans
    // Events with parent_span_id should have their data attached to the parent span
    for (const event of parsedEvents) {
      if (!event.parent_span_id || event.parent_span_id === null) {
        continue; // Skip events without parents
      }

      // CRITICAL: Verify event belongs to this trace before matching
      if (event.trace_id !== traceId) {
        continue; // Skip events from different traces
      }

      // Find the parent span - use EXACT matching only (no startsWith - too dangerous!)
      // CRITICAL: Match the exact span the user clicked on, not based on timestamp
      // Priority order for matching:
      // 1. Exact match on span ID (most common for normal spans)
      // 2. Exact match on original_span_id (most reliable for synthetic child spans)
      // 3. Exact match on span_id field
      let parentSpan = spansMap.get(event.parent_span_id);

      if (!parentSpan) {
        // Try finding by exact match on original_span_id
        // CRITICAL: In a single trace, each LLM call should have a UNIQUE original_span_id
        // So there should only be ONE match per original_span_id
        const matchingSpans: Array<{ span: any; isLLMCall: boolean }> = [];

        for (const [spanId, span] of spansMap.entries()) {
          if (span.original_span_id === event.parent_span_id) {
            const isLLMCall = !!(
              span.llm_call ||
              span.type === "llm_call" ||
              span.event_type === "llm_call"
            );
            matchingSpans.push({ span, isLLMCall });
          }
        }

        if (matchingSpans.length === 0) {
          // No match found - will try other methods below
        } else if (matchingSpans.length === 1) {
          // Perfect! Only one match - use it (this is the normal case)
          parentSpan = matchingSpans[0].span;
        } else {
          // Multiple matches (shouldn't happen, but handle it gracefully)
          // For feedback events, prefer LLM call spans
          if (event.event_type === "feedback") {
            const llmCallSpans = matchingSpans.filter((m) => m.isLLMCall);
            if (llmCallSpans.length === 1) {
              parentSpan = llmCallSpans[0].span;
            } else if (llmCallSpans.length > 1) {
              // Multiple LLM call spans with same original_span_id - this is a data issue
              // Log warning and use the first one
              console.warn(
                `[TraceQueryService] Multiple LLM call spans found with same original_span_id: ${event.parent_span_id}. ` +
                  `This should not happen in a single trace. Using first match. Trace: ${traceId}`,
              );
              parentSpan = llmCallSpans[0].span;
            } else {
              // No LLM call spans, use first match
              parentSpan = matchingSpans[0].span;
            }
          } else {
            // For non-feedback events, use first match
            parentSpan = matchingSpans[0].span;
          }
        }
      }

      if (!parentSpan) {
        // Try finding by exact match on span_id field
        for (const [spanId, span] of spansMap.entries()) {
          if (span.span_id === event.parent_span_id) {
            parentSpan = span;
            break;
          }
        }
      }

      if (!parentSpan) {
        // Last resort: try exact match on id field (but this should have been caught above)
        for (const [spanId, span] of spansMap.entries()) {
          if (span.id === event.parent_span_id) {
            parentSpan = span;
            break;
          }
        }
      }

      if (!parentSpan) {
        const rootSpan =
          originalRootSpanId && spansMap.has(originalRootSpanId)
            ? spansMap.get(originalRootSpanId)
            : null;
        if (rootSpan) {
          parentSpan = rootSpan;
          parentSpan.feedback_unlinked = true;
          parentSpan.unlinked_feedback_count =
            (parentSpan.unlinked_feedback_count || 0) + 1;
          console.warn(
            `[TraceQueryService] Parent span not found for feedback event. ` +
              `Attaching to root span instead. Event trace_id: ${event.trace_id}, ` +
              `event span_id: ${event.span_id}, parent_span_id: ${event.parent_span_id}, ` +
              `traceId: ${traceId}.`,
          );
        } else {
          console.warn(
            `[TraceQueryService] Parent span not found for feedback event. ` +
              `Event trace_id: ${event.trace_id}, event span_id: ${event.span_id}, ` +
              `parent_span_id: ${event.parent_span_id}, traceId: ${traceId}. ` +
              `Available spans: ${Array.from(spansMap.keys())
                .slice(0, 5)
                .join(", ")}...`,
          );
          continue;
        }
      }

      // CRITICAL: Verify parent span belongs to the same trace
      // This is a safety check to prevent cross-trace matching
      // Note: spans might not have trace_id directly, but events in the span should
      const parentSpanEvents = parentSpan.events || [];
      const parentEventTraceId = parentSpanEvents[0]?.trace_id;
      if (parentEventTraceId && parentEventTraceId !== traceId) {
        console.warn(
          `[TraceQueryService] Parent span trace_id mismatch! ` +
            `Event trace_id: ${traceId}, Parent span trace_id: ${parentEventTraceId}`,
        );
        continue;
      }

      // Attach feedback events to parent span
      if (event.event_type === "feedback" && event.attributes?.feedback) {
        // CRITICAL: Only attach feedback to an LLM call span.
        // If the parent span is missing or not an LLM call, attach to trace root instead.
        const parentIsLlmCall = !!(
          parentSpan &&
          (parentSpan.llm_call ||
            parentSpan.type === "llm_call" ||
            parentSpan.event_type === "llm_call")
        );
        if (
          !parentIsLlmCall &&
          originalRootSpanId &&
          spansMap.has(originalRootSpanId)
        ) {
          parentSpan = spansMap.get(originalRootSpanId);
          if (parentSpan) {
            parentSpan.feedback_unlinked = true;
            parentSpan.unlinked_feedback_count =
              (parentSpan.unlinked_feedback_count || 0) + 1;
          }
        }

        if (!parentSpan) {
          continue;
        }

        // CRITICAL: Only attach feedback if parent span doesn't already have feedback
        // OR if this feedback is more recent (based on timestamp)
        const existingFeedback = parentSpan.feedback;
        if (existingFeedback) {
          // Check if new feedback is more recent
          const existingFeedbackEvent = parentSpan.events?.find(
            (e: any) => e.event_type === "feedback",
          );
          if (existingFeedbackEvent) {
            const existingTimestamp = new Date(
              existingFeedbackEvent.timestamp,
            ).getTime();
            const newTimestamp = new Date(event.timestamp).getTime();

            // Only update if new feedback is more recent
            if (newTimestamp <= existingTimestamp) {
              continue; // Skip older feedback
            }
          }
        }

        const feedbackAttrs = event.attributes.feedback;
        parentSpan.feedback = {
          type: feedbackAttrs.type || null,
          outcome: feedbackAttrs.outcome || null,
          rating:
            feedbackAttrs.rating !== undefined && feedbackAttrs.rating !== null
              ? parseFloat(String(feedbackAttrs.rating))
              : null,
          comment: feedbackAttrs.comment || null,
        };

        // Also update flattened fields for all span types that can have feedback
        // This ensures frontend can access feedback via span.feedback_type, etc.
        parentSpan.feedback_type = parentSpan.feedback.type;
        parentSpan.feedback_outcome = parentSpan.feedback.outcome;
        parentSpan.feedback_rating = parentSpan.feedback.rating;
        parentSpan.feedback_comment = parentSpan.feedback.comment;
        parentSpan.hasFeedback = true;
        parentSpan.hasComment = !!parentSpan.feedback.comment;

        // Also add feedback event to parent span's events if not already there
        const existingFeedbackEvent = parentSpan.events?.find(
          (e: any) =>
            e.event_type === "feedback" &&
            e.span_id === event.span_id &&
            e.timestamp === event.timestamp,
        );
        if (!existingFeedbackEvent) {
          if (!parentSpan.events) parentSpan.events = [];
          parentSpan.events.push({
            id: `${event.span_id}-feedback-${event.timestamp}`,
            event_type: "feedback",
            timestamp: event.timestamp,
            attributes: event.attributes,
            span_id: event.span_id,
            original_span_id: event.span_id,
            feedback: event.attributes.feedback,
          });
          // Sort events by timestamp after adding
          parentSpan.events.sort(
            (a: any, b: any) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        }
      }

      // Attach tool call events to parent span if they're not already there
      // This ensures tool calls are visible on LLM call parent spans
      if (
        event.event_type === "tool_call" &&
        event.attributes?.tool_call &&
        parentSpan.llm_call
      ) {
        // Check if this tool call is already in parent span's events
        const existingToolCallEvent = parentSpan.events?.find(
          (e: any) =>
            e.event_type === "tool_call" &&
            e.span_id === event.span_id &&
            e.timestamp === event.timestamp,
        );
        if (!existingToolCallEvent) {
          if (!parentSpan.events) parentSpan.events = [];
          parentSpan.events.push({
            id: `${event.span_id}-tool_call-${event.timestamp}`,
            event_type: "tool_call",
            timestamp: event.timestamp,
            attributes: event.attributes,
            span_id: event.span_id,
            original_span_id: event.span_id,
            tool_call: event.attributes.tool_call,
          });
          // Sort events by timestamp after adding
          parentSpan.events.sort(
            (a: any, b: any) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        }
      }

      // Attach output events to parent span if they're not already there
      if (
        event.event_type === "output" &&
        event.attributes?.output &&
        !parentSpan.output
      ) {
        const outputAttrs = event.attributes.output;
        parentSpan.output = {
          final_output: outputAttrs.final_output || null,
          output_length: outputAttrs.output_length || null,
        };

        // Also add output event to parent span's events if not already there
        const existingOutputEvent = parentSpan.events?.find(
          (e: any) =>
            e.event_type === "output" &&
            e.span_id === event.span_id &&
            e.timestamp === event.timestamp,
        );
        if (!existingOutputEvent) {
          if (!parentSpan.events) parentSpan.events = [];
          parentSpan.events.push({
            id: `${event.span_id}-output-${event.timestamp}`,
            event_type: "output",
            timestamp: event.timestamp,
            attributes: event.attributes,
            span_id: event.span_id,
            original_span_id: event.span_id,
            output: event.attributes.output,
          });
          // Sort events by timestamp after adding
          parentSpan.events.sort(
            (a: any, b: any) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        }
      }
    }

    // Third pass: build parent-child relationships
    // Calculate root trace span duration from all child spans
    if (originalRootSpanId && spansMap.has(originalRootSpanId)) {
      const rootSpan = spansMap.get(originalRootSpanId)!;
      // Update root span duration to cover all child spans
      const allChildSpans = Array.from(spansMap.values()).filter(
        (s: any) => s.parent_span_id === originalRootSpanId,
      );
      if (allChildSpans.length > 0) {
        const earliestStart = Math.min(
          ...allChildSpans.map((s: any) => new Date(s.start_time).getTime()),
        );
        const latestEnd = Math.max(
          ...allChildSpans.map((s: any) => new Date(s.end_time).getTime()),
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
      // CRITICAL FIX: Ensure all spans have consistent ID fields before building tree
      // This ensures child spans in tree structure match what's in allSpans/spansById
      if (!span.id) span.id = span.span_id;
      if (!span.span_id) span.span_id = span.id;
      span.key = span.id; // Add key field for React compatibility

      if (span.parent_span_id === null) {
        rootSpans.push(span);
      } else {
        if (span.parent_span_id === span.id) {
          span.parent_span_id = null;
          rootSpans.push(span);
          continue;
        }
        // Try to find parent span - check multiple possible parent IDs
        let parentSpan = spansMap.get(span.parent_span_id);

        // If parent not found by direct ID, try by original_span_id
        if (!parentSpan && span.original_span_id) {
          parentSpan = spansMap.get(span.original_span_id);
        }

        // If still not found, try finding parent by checking if parent_span_id matches any span's id or span_id
        if (!parentSpan) {
          for (const [id, potentialParent] of spansMap.entries()) {
            if (
              potentialParent.id === span.parent_span_id ||
              potentialParent.span_id === span.parent_span_id ||
              id === span.parent_span_id ||
              potentialParent.original_span_id === span.parent_span_id
            ) {
              parentSpan = potentialParent;
              break;
            }
          }
        }

        // CRITICAL: For tool call spans, also try matching parent by checking if parent_span_id
        // matches the original_span_id of any LLM call span (handles synthetic IDs)
        if (!parentSpan && span.event_type === "tool_call") {
          for (const [id, potentialParent] of spansMap.entries()) {
            // Check if this is an LLM call span and if its original_span_id matches our parent_span_id
            if (
              (potentialParent.llm_call ||
                potentialParent.type === "llm_call" ||
                potentialParent.event_type === "llm_call") &&
              (potentialParent.original_span_id === span.parent_span_id ||
                potentialParent.span_id === span.parent_span_id)
            ) {
              parentSpan = potentialParent;
              break;
            }
          }
        }

        if (parentSpan) {
          if (parentSpan === span || parentSpan.id === span.id) {
            console.warn(
              `[TraceQueryService] Span has self parent reference; skipping child link. span_id=${span.id}`,
            );
            rootSpans.push(span);
            continue;
          }
          if (!parentSpan.children) {
            parentSpan.children = [];
          }
          // CRITICAL: Check if span is already in children to prevent duplicates
          const existingChild = parentSpan.children.find(
            (c: any) => c.id === span.id || c.span_id === span.span_id,
          );
          if (!existingChild) {
            // CRITICAL FIX: Ensure child span has all required fields before adding to tree
            // This ensures the child span in tree matches what's in allSpans/spansById
            parentSpan.children.push(span);
          } else {
            console.warn(
              `[TraceQueryService] Duplicate child span detected and skipped: ${span.id} in parent ${parentSpan.id}`,
            );
          }
        } else {
          // Parent not found, attach to root if available
          const rootSpan =
            originalRootSpanId && spansMap.has(originalRootSpanId)
              ? spansMap.get(originalRootSpanId)
              : null;
          if (rootSpan) {
            if (!rootSpan.children) rootSpan.children = [];
            rootSpan.children.push(span);
            span.unlinked_parent = true;
            console.warn(
              `[TraceQueryService] Parent span not found for ${span.id}. ` +
                `Attaching to root span instead. Parent ID: ${span.parent_span_id}`,
            );
          } else {
            console.warn(
              `[TraceQueryService] Parent span not found for ${span.id}, treating as root. Parent ID: ${span.parent_span_id}`,
            );
            rootSpans.push(span);
          }
        }
      }
    }

    // Build summary from events
    const llmAttrs = llmCall?.attributes?.llm_call;
    const traceEndAttrs = traceEnd?.attributes?.trace_end;

    // Find output event for response
    const outputEvent = parsedEvents.find(
      (e: any) => e.event_type === "output",
    );

    // Calculate total cost from all cost-bearing events (LLM, embeddings, vector DB, cache savings)
    let totalCost: number | null =
      typeof traceEndAttrs?.total_cost === "number"
        ? traceEndAttrs.total_cost
        : null;
    if (totalCost === null) {
      let runningTotal = 0;
      const costEvents = parsedEvents.filter((e: any) =>
        [
          "llm_call",
          "embedding",
          "vector_db_operation",
          "cache_operation",
        ].includes(e.event_type),
      );
      for (const event of costEvents) {
        if (event.event_type === "llm_call") {
          const cost = event.attributes?.llm_call?.cost;
          if (typeof cost === "number" && Number.isFinite(cost)) {
            runningTotal += cost;
          }
        } else if (event.event_type === "embedding") {
          const cost = event.attributes?.embedding?.cost;
          if (typeof cost === "number" && Number.isFinite(cost)) {
            runningTotal += cost;
          }
        } else if (event.event_type === "vector_db_operation") {
          const cost = event.attributes?.vector_db_operation?.cost;
          if (typeof cost === "number" && Number.isFinite(cost)) {
            runningTotal += cost;
          }
        } else if (event.event_type === "cache_operation") {
          const cost = event.attributes?.cache_operation?.saved_cost;
          if (typeof cost === "number" && Number.isFinite(cost)) {
            runningTotal += cost;
          }
        }
      }
      totalCost = runningTotal > 0 ? runningTotal : null;
    }

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
      total_cost: totalCost,
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
        error,
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
    const toolCallSpans = allSpans.filter((span) => span.tool_call);
    const toolCallsByParent = new Map<string, any[]>();

    for (const toolSpan of toolCallSpans) {
      if (toolSpan.parent_span_id) {
        if (!toolCallsByParent.has(toolSpan.parent_span_id)) {
          toolCallsByParent.set(toolSpan.parent_span_id, []);
        }
        toolCallsByParent.get(toolSpan.parent_span_id)!.push(toolSpan);
      }
      if (
        toolSpan.original_span_id &&
        toolSpan.original_span_id !== toolSpan.parent_span_id
      ) {
        if (!toolCallsByParent.has(toolSpan.original_span_id)) {
          toolCallsByParent.set(toolSpan.original_span_id, []);
        }
        toolCallsByParent.get(toolSpan.original_span_id)!.push(toolSpan);
      }
    }

    // Ensure all spans have consistent identifiers and are properly structured
    // Add additional lookup fields for frontend compatibility
    for (const span of allSpans) {
      // Ensure id and span_id are both set and consistent
      if (!span.id) span.id = span.span_id;
      if (!span.span_id) span.span_id = span.id;

      // Add a unique key field that frontends often use for React keys
      span.key = span.id;

      // CRITICAL FIX: Ensure child spans have a unique, stable identifier
      // Child spans created from root events have synthetic IDs - ensure they're consistent
      if (span.parent_span_id && span.id && span.original_span_id) {
        // This is a child span - ensure ID consistency
        // The ID should match the pattern: parentId-eventType
        if (!span.id.includes("-") && span.event_type) {
          // If ID doesn't follow pattern, reconstruct it
          span.id = `${span.original_span_id}-${span.event_type}`;
          span.span_id = span.id;
          span.key = span.id;
        }
      }

      // Ensure selectable flag is set for all spans (all spans should be clickable)
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
          span.output ||
          span.feedback
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
        } else if (span.feedback) {
          span.details = span.feedback;
        } else if (span.metadata) {
          span.details = span.metadata;
        } else {
          span.details = {
            type: span.type || span.event_type,
            name: span.name,
            duration_ms: span.duration_ms,
            span_id: span.span_id,
            parent_span_id: span.parent_span_id,
          };
        }
      }

      if (span.llm_call) {
        const toolDefs =
          span.llm_call.tool_definitions || span.llm_call.tools || null;
        if (Array.isArray(toolDefs)) {
          span.available_tools = toolDefs;
          span.available_tool_names = toolDefs
            .map(
              (def: any) => def?.name || def?.function?.name || def?.tool?.name,
            )
            .filter(Boolean);
        } else {
          span.available_tools = null;
          span.available_tool_names = [];
        }

        // Extract attempted tool calls from output_messages
        const attemptedToolCalls: Array<{
          tool_name: string;
          tool_call_id?: string | null;
          function_name?: string | null;
          arguments?: any;
        }> = [];
        if (Array.isArray(span.llm_call.output_messages)) {
          for (const msg of span.llm_call.output_messages) {
            // Extract from additional_kwargs.tool_calls
            if (msg?.additional_kwargs?.tool_calls && Array.isArray(msg.additional_kwargs.tool_calls)) {
              for (const tc of msg.additional_kwargs.tool_calls) {
                if (tc?.function) {
                  // Parse arguments if it's a string
                  let parsedArgs = tc.function.arguments;
                  if (typeof parsedArgs === "string") {
                    try {
                      parsedArgs = JSON.parse(parsedArgs);
                    } catch {
                      // Keep as string if parsing fails
                    }
                  }
                  attemptedToolCalls.push({
                    tool_name: tc.function.name || "unknown",
                    tool_call_id: tc.id || null,
                    function_name: tc.function.name || null,
                    arguments: parsedArgs || null,
                  });
                }
              }
            }
            // Extract from additional_kwargs.function_call (legacy format)
            if (msg?.additional_kwargs?.function_call) {
              const fc = msg.additional_kwargs.function_call;
              // Parse arguments if it's a string
              let parsedArgs = fc.arguments;
              if (typeof parsedArgs === "string") {
                try {
                  parsedArgs = JSON.parse(parsedArgs);
                } catch {
                  // Keep as string if parsing fails
                }
              }
              attemptedToolCalls.push({
                tool_name: fc.name || "unknown",
                tool_call_id: null,
                function_name: fc.name || null,
                arguments: parsedArgs || null,
              });
            }
            // Extract from tool_calls (direct property)
            if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                if (tc?.function) {
                  // Parse arguments if it's a string
                  let parsedArgs = tc.function.arguments;
                  if (typeof parsedArgs === "string") {
                    try {
                      parsedArgs = JSON.parse(parsedArgs);
                    } catch {
                      // Keep as string if parsing fails
                    }
                  }
                  attemptedToolCalls.push({
                    tool_name: tc.function.name || "unknown",
                    tool_call_id: tc.id || null,
                    function_name: tc.function.name || null,
                    arguments: parsedArgs || null,
                  });
                }
              }
            }
          }
        }
        span.attempted_tool_calls = attemptedToolCalls.length > 0 ? attemptedToolCalls : null;

        const executedToolSpans = [
          ...(toolCallsByParent.get(span.id) || []),
          ...(toolCallsByParent.get(span.span_id) || []),
          ...(span.original_span_id
            ? toolCallsByParent.get(span.original_span_id) || []
            : []),
        ];
        const seenToolKeys = new Set<string>();
        span.executed_tools = executedToolSpans
          .map((toolSpan: any) => {
            const tool = toolSpan.tool_call || {};
            const key =
              tool.tool_call_id ||
              `${tool.tool_name || "unknown"}-${toolSpan.id || toolSpan.span_id}`;
            if (seenToolKeys.has(key)) return null;
            seenToolKeys.add(key);
            return {
              tool_name: tool.tool_name || "unknown",
              result_status: tool.result_status || "unknown",
              latency_ms: tool.latency_ms ?? null,
              error_message: tool.error_message || null,
              tool_call_id: tool.tool_call_id || null,
            };
          })
          .filter(Boolean);

        // Extract system instructions from input_messages if not already set
        if (!span.llm_call.system_instructions && Array.isArray(span.llm_call.input_messages)) {
          const systemMessages = span.llm_call.input_messages.filter(
            (msg: any) => msg.role === "system" || msg.role === "System",
          );
          if (systemMessages.length > 0) {
            span.llm_call.system_instructions = systemMessages.map((msg: any) => {
              if (typeof msg.content === "string") return msg.content;
              if (Array.isArray(msg.content)) {
                return msg.content
                  .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
                  .filter(Boolean)
                  .join("\n");
              }
              return msg.text || msg.content || "";
            });
          }
        }

        // Also extract output text from output_messages if output is missing
        if (!span.llm_call.output && Array.isArray(span.llm_call.output_messages)) {
          const outputTexts = span.llm_call.output_messages
            .map((msg: any) => {
              if (typeof msg.content === "string") return msg.content;
              if (Array.isArray(msg.content)) {
                return msg.content
                  .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
                  .filter(Boolean)
                  .join("\n");
              }
              return msg.text || "";
            })
            .filter(Boolean);
          if (outputTexts.length > 0) {
            span.llm_call.output = outputTexts.join("\n");
          }
        }
      }

      if (!span.status) {
        if (
          span.error ||
          span.error_message ||
          span.error_type ||
          span.tool_call?.result_status === "error" ||
          span.tool_call?.result_status === "timeout" ||
          span.llm_call?.finish_reason === "error" ||
          span.event_type === "error" ||
          span.type === "error"
        ) {
          span.status =
            span.tool_call?.result_status === "timeout" ? "timeout" : "error";
        } else if (span.tool_call?.result_status) {
          span.status = span.tool_call.result_status;
        } else {
          span.status = "success";
        }
      }

      // Ensure span has a display name for frontend rendering
      if (!span.displayName) {
        span.displayName = span.name;
      }

      // CRITICAL FIX: Add explicit reference fields for frontend lookup
      // Some frontends may look for these fields to verify span identity
      span._id = span.id; // Alternative ID field some frontends use
      span._spanId = span.span_id; // Alternative span_id field

      // Add parent reference for easier navigation
      if (span.parent_span_id) {
        span._parentId = span.parent_span_id;
      }

      // Mark child spans explicitly for frontend handling
      if (span.parent_span_id) {
        span.isChild = true;
      } else {
        span.isChild = false;
      }
    }

    // Create a lookup map by ID for O(1) access
    // Index by multiple identifiers to support different frontend matching strategies
    const spansById: Record<string, any> = {};
    for (const span of allSpans) {
      // CRITICAL: Index by current ID (synthetic or original) - this is the primary key
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

      // Index by event_type with parent context for child spans (to avoid conflicts)
      // For child spans, create unique keys like "parentId-event_type"
      if (span.event_type) {
        if (span.parent_span_id) {
          // Child span: index by parent-event_type combination for uniqueness
          spansById[`${span.parent_span_id}-${span.event_type}`] = span;
          // Also index by event_type for backward compatibility (last one wins)
          spansById[span.event_type] = span;
        } else {
          // Root span: index by event_type
          spansById[span.event_type] = span;
        }
      }

      // CRITICAL FIX: Index by synthetic child span ID pattern
      // Child spans created from root events have IDs like "traceId-event_type"
      // Ensure this pattern is always indexed
      if (span.id.includes("-") && span.parent_span_id) {
        // This is likely a synthetic child span (e.g., "trace-123-retrieval")
        // The ID is already indexed above, but ensure parent-based lookups work
        const parts = span.id.split("-");
        if (parts.length >= 2) {
          const parentPart = parts.slice(0, -1).join("-");
          const eventTypePart = parts[parts.length - 1];
          // Index by the pattern frontends might use
          spansById[`${parentPart}-${eventTypePart}`] = span;
        }
      }

      // Additional indexing for child spans: index by position in tree
      // Some frontends might use array indices or position-based IDs
      if (span.parent_span_id) {
        const parentSpan = allSpans.find(
          (s) =>
            s.id === span.parent_span_id || s.span_id === span.parent_span_id,
        );
        if (parentSpan && parentSpan.children) {
          const childIndex = parentSpan.children.findIndex(
            (c: any) => c.id === span.id || c.span_id === span.span_id,
          );
          if (childIndex >= 0) {
            // Index by parent-child position pattern
            spansById[`${span.parent_span_id}-child-${childIndex}`] = span;
          }
        }
      }
    }

    // Phase 1/2: Enrich with deeper insights for trace detail UX
    const costBreakdown = this.buildCostBreakdown(summary, allSpans);
    const performanceAnalysis = this.buildPerformanceAnalysis(
      summary,
      allSpans,
    );
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
          (s: any) => s.children && s.children.length > 0,
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
    projectId: string | null,
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
      (e: any) => e.event_type === "trace_start",
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
    // aaaa
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
    projectId?: string | null,
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
      params,
    );

    return results;
  }

  /**
   * Filter traces by issue type
   */
  private static filterByIssueType(
    traces: TraceSummary[],
    issueType: string,
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

import { Router, Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { query } from "../db/client.js";

const router = Router();

/**
 * GET /api/v1/analytics/overview
 * Get analytics overview for the authenticated user
 * Includes ML analysis metrics
 */
router.get("/overview", async (req: Request, res: Response) => {
  try {
    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    // Get time range (default: last 30 days)
    const days = parseInt(req.query.days as string) || 30;

    // Total traces analyzed
    const totalResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analysis_results 
       WHERE tenant_id = $1 AND analyzed_at > NOW() - INTERVAL '${days} days'`,
      [user.tenantId]
    );
    const totalTraces = parseInt(totalResult[0]?.count || "0", 10);

    // Hallucination rate
    const hallucinationResult = await query<{
      total: string;
      hallucinations: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_hallucination = true) as hallucinations
       FROM analysis_results
       WHERE tenant_id = $1 AND analyzed_at > NOW() - INTERVAL '${days} days'`,
      [user.tenantId]
    );
    const total = parseInt(hallucinationResult[0]?.total || "0", 10);
    const hallucinations = parseInt(
      hallucinationResult[0]?.hallucinations || "0",
      10
    );
    const hallucinationRate = total > 0 ? (hallucinations / total) * 100 : 0;

    // Average quality score
    const qualityResult = await query<{ avg: string }>(
      `SELECT AVG(quality_score) as avg FROM analysis_results
       WHERE tenant_id = $1 AND quality_score IS NOT NULL 
       AND analyzed_at > NOW() - INTERVAL '${days} days'`,
      [user.tenantId]
    );
    const avgQuality = qualityResult[0]?.avg
      ? parseFloat(qualityResult[0].avg)
      : null;

    // Issue counts
    const issuesResult = await query<{
      context_drop: string;
      faithfulness: string;
      drift: string;
      cost_anomaly: string;
    }>(
      `SELECT 
        COUNT(*) FILTER (WHERE has_context_drop = true) as context_drop,
        COUNT(*) FILTER (WHERE has_faithfulness_issue = true) as faithfulness,
        COUNT(*) FILTER (WHERE has_model_drift = true) as drift,
        COUNT(*) FILTER (WHERE has_cost_anomaly = true) as cost_anomaly
       FROM analysis_results
       WHERE tenant_id = $1 AND analyzed_at > NOW() - INTERVAL '${days} days'`,
      [user.tenantId]
    );

    const issues = issuesResult[0] || {
      context_drop: "0",
      faithfulness: "0",
      drift: "0",
      cost_anomaly: "0",
    };

    res.json({
      success: true,
      period: `${days} days`,
      metrics: {
        totalTraces,
        hallucinationRate: parseFloat(hallucinationRate.toFixed(2)),
        avgQualityScore: avgQuality ? Math.round(avgQuality) : null,
        issues: {
          hallucinations: hallucinations,
          contextDrop: parseInt(issues.context_drop, 10),
          faithfulness: parseInt(issues.faithfulness, 10),
          drift: parseInt(issues.drift, 10),
          costAnomaly: parseInt(issues.cost_anomaly, 10),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/analytics/trends
 * Get trends over time for analytics
 */
router.get("/trends", async (req: Request, res: Response) => {
  try {
    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    // Get time range (default: last 30 days)
    const days = parseInt(req.query.days as string) || 30;
    const interval = req.query.interval as string || "day"; // day, week, month

    // Get daily trends
    const trends = await query(
      `SELECT 
        DATE(analyzed_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_hallucination = true) as hallucinations,
        AVG(quality_score) as avg_quality,
        AVG(hallucination_confidence) as avg_hallucination_confidence
       FROM analysis_results
       WHERE tenant_id = $1 
       AND analyzed_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(analyzed_at)
       ORDER BY date ASC`,
      [user.tenantId]
    );

    res.json({
      success: true,
      trends: trends.map((row: any) => ({
        date: row.date,
        total: parseInt(row.total, 10),
        hallucinations: parseInt(row.hallucinations, 10),
        avgQuality: row.avg_quality ? Math.round(parseFloat(row.avg_quality)) : null,
        avgHallucinationConfidence: row.avg_hallucination_confidence
          ? parseFloat(row.avg_hallucination_confidence)
          : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching trends:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;


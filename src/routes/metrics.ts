import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

/**
 * GET /api/v1/metrics
 * System metrics endpoint
 * Returns key performance and usage metrics
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Get tenant count
    const tenantCountResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM tenants"
    );
    const tenantCount = parseInt(tenantCountResult[0]?.count || "0", 10);

    // Get project count
    const projectCountResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM projects"
    );
    const projectCount = parseInt(projectCountResult[0]?.count || "0", 10);

    // Get analysis results count
    const analysisCountResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM analysis_results"
    );
    const analysisCount = parseInt(analysisCountResult[0]?.count || "0", 10);

    // Get recent analysis results (last 24 hours)
    const recentAnalysisResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analysis_results 
       WHERE analyzed_at > NOW() - INTERVAL '24 hours'`
    );
    const recentAnalysis = parseInt(recentAnalysisResult[0]?.count || "0", 10);

    // Get hallucination rate (from analysis results)
    const hallucinationResult = await query<{
      total: string;
      hallucinations: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_hallucination = true) as hallucinations
       FROM analysis_results`
    );
    const total = parseInt(hallucinationResult[0]?.total || "0", 10);
    const hallucinations = parseInt(
      hallucinationResult[0]?.hallucinations || "0",
      10
    );
    const hallucinationRate =
      total > 0 ? (hallucinations / total) * 100 : 0;

    res.json({
      timestamp: new Date().toISOString(),
      tenants: {
        total: tenantCount,
      },
      projects: {
        total: projectCount,
      },
      analysis: {
        total: analysisCount,
        last24Hours: recentAnalysis,
        hallucinationRate: parseFloat(hallucinationRate.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({
      error: "Failed to fetch metrics",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

export default router;


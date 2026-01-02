/**
 * Analysis Worker Entry Point
 *
 * Run this as a separate process to process analysis jobs from the queue
 *
 * Usage:
 *   npm run worker
 *   or
 *   tsx src/worker.ts
 *
 * In production, run this as a separate service/container
 */

// Load and validate environment variables
import "./config/env.js";

import { initializeAnalysisWorker } from "./services/analysisWorker.js";

console.log("🔧 Starting Analysis Worker...");

// Initialize worker
initializeAnalysisWorker();

// Keep process alive
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  const { closeAnalysisWorker } = await import("./services/analysisWorker.js");
  await closeAnalysisWorker();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  const { closeAnalysisWorker } = await import("./services/analysisWorker.js");
  await closeAnalysisWorker();
  process.exit(0);
});

console.log("✅ Analysis Worker started and listening for jobs");

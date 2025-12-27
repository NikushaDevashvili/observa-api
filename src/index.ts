import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import onboardingRouter from "./routes/onboarding.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/v1/onboarding", onboardingRouter);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Observa API running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🎯 Onboarding API: http://localhost:${PORT}/api/v1/onboarding`);
});


// Load and validate environment variables FIRST
// This will exit if validation fails
import "./config/env.js";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import onboardingRouter from "./routes/onboarding.js";
import tenantsRouter from "./routes/tenants.js";
import tracesRouter from "./routes/traces.js";

const app = express();

// Trust proxy for Vercel (required for rate limiting to work correctly)
app.set("trust proxy", true);

// SOTA Security Middleware
// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", apiLimiter);

// Request size limit (prevent DoS via large payloads)
app.use(express.json({ limit: "10mb" }));

// Strict CORS
app.use(
  cors({
    origin:
      process.env.ALLOWED_ORIGINS?.split(",") ||
      (process.env.NODE_ENV === "production" ? [] : ["http://localhost:3001"]),
    credentials: true,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // 24 hours
  })
);

// Root route - API information
app.get("/", (req, res) => {
  res.json({
    name: "Observa API",
    version: "0.0.1",
    status: "ok",
    endpoints: {
      health: "/health",
      onboarding: "/api/v1/onboarding",
      tenants: "/api/v1/tenants",
      traces: "/api/v1/traces",
    },
    documentation: "https://github.com/NikushaDevashvili/observa-api",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/v1/onboarding", onboardingRouter);
app.use("/api/v1/tenants", tenantsRouter);
app.use("/api/v1/traces", tracesRouter);

// Export app for Vercel serverless
export default app;

// Start server only if not in Vercel environment
if (process.env.VERCEL !== "1") {
  const PORT = env.PORT;
  const server = app.listen(PORT, () => {
    console.log(`🚀 Observa API running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(
      `🎯 Onboarding API: http://localhost:${PORT}/api/v1/onboarding`
    );
    console.log(`🔐 Tenants API: http://localhost:${PORT}/api/v1/tenants`);
    console.log(`📊 Traces API: http://localhost:${PORT}/api/v1/traces`);
    console.log(`✅ Environment variables validated and loaded`);
  });

  // Handle server errors
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.error(`💡 Try one of these solutions:`);
      console.error(
        `   1. Kill the process using port ${PORT}: lsof -ti:${PORT} | xargs kill`
      );
      console.error(`   2. Use a different port: PORT=3001 npm run dev`);
      process.exit(1);
    } else {
      console.error("❌ Server error:", error);
      process.exit(1);
    }
  });
}

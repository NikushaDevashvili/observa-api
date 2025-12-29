// Load and validate environment variables FIRST
// This will exit if validation fails
import "./config/env.js";

// Initialize Sentry BEFORE other imports
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { env } from "./config/env.js";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    integrations: [
      // Add profiling integration
      nodeProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring
    // Set sampling rate for profiling
    profilesSampleRate: 1.0, // Capture 100% of profiles
  });
  console.log("✅ Sentry initialized for error monitoring");
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import onboardingRouter from "./routes/onboarding.js";
import tenantsRouter from "./routes/tenants.js";
import tracesRouter from "./routes/traces.js";
import metricsRouter from "./routes/metrics.js";
import authRouter from "./routes/auth.js";
import analyticsRouter from "./routes/analytics.js";
import { initializeSchema } from "./db/schema.js";
import { testConnection } from "./db/client.js";

const app = express();

// Sentry will automatically capture errors via the error handler below

// Initialize database schema on startup (non-blocking)
// This runs asynchronously so the server can start even if DB is slow to connect
(async () => {
  try {
    console.log("🔌 Attempting database connection...");
    const connected = await testConnection();
    if (connected) {
      await initializeSchema();
      console.log("✅ Database connected and schema initialized");
    } else {
      console.error("❌ Database connection failed - check DATABASE_URL");
      console.error("💡 The API will still start but database operations will fail");
    }
  } catch (error: any) {
    console.error("❌ Database initialization error:", error?.message || error);
    if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED") {
      console.error("💡 Check your DATABASE_URL - connection refused");
    } else if (error?.code === "28P01") {
      console.error("💡 Check your DATABASE_URL - authentication failed");
    } else {
      console.error("💡 Error details:", error);
    }
    console.error("⚠️  The API will continue but database features won't work");
    // Don't exit - let the API start so we can see health endpoint
  }
})();

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

// CORS configuration
// For trace ingestion, we allow all origins since it's authenticated via JWT
// For other endpoints, use strict CORS
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins =
      process.env.ALLOWED_ORIGINS?.split(",") ||
      (process.env.NODE_ENV === "production" ? [] : ["http://localhost:3001"]);

    // In production, if no ALLOWED_ORIGINS is set, allow all (since endpoints are authenticated)
    if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Root route - API information
app.get("/", (req, res) => {
  res.json({
    name: "Observa API",
    version: "0.0.1",
    status: "ok",
    endpoints: {
      health: "/health",
      metrics: "/api/v1/metrics",
      auth: "/api/v1/auth",
      analytics: "/api/v1/analytics",
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

// Startup diagnostics endpoint (for debugging)
app.get("/diagnostics", (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL === "1",
    },
    environmentVariables: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasTinybirdToken: !!process.env.TINYBIRD_ADMIN_TOKEN,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasSentryDsn: !!process.env.SENTRY_DSN,
      databaseUrlLength: process.env.DATABASE_URL?.length || 0,
      jwtSecretLength: process.env.JWT_SECRET?.length || 0,
    },
    status: "ok",
  };
  res.json(diagnostics);
});

// API Routes
app.use("/api/v1/onboarding", onboardingRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/tenants", tenantsRouter);
app.use("/api/v1/traces", tracesRouter);
app.use("/api/v1/metrics", metricsRouter);
app.use("/api/v1/analytics", analyticsRouter);

// Error handler middleware (must be last)
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    // Log error to Sentry if configured
    if (env.SENTRY_DSN) {
      Sentry.captureException(err);
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

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

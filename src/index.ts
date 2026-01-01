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
import conversationsRouter from "./routes/conversations.js";
import eventsRouter from "./routes/events.js";
import sessionsRouter from "./routes/sessions.js";
import { initializeSchema } from "./db/schema.js";
import { testConnection } from "./db/client.js";

const app = express();

// Sentry will automatically capture errors via the error handler below

// Initialize database schema on startup
// In serverless, this runs on cold start, so we need to ensure it completes
let schemaInitialized = false;
let schemaInitializationPromise: Promise<void> | null = null;

async function ensureSchemaInitialized(): Promise<void> {
  if (schemaInitialized) return;

  // If initialization is already in progress, wait for it
  if (schemaInitializationPromise) {
    try {
      await schemaInitializationPromise;
      return;
    } catch (error) {
      // If previous initialization failed, try again
      console.warn("Previous schema initialization failed, retrying...");
      schemaInitializationPromise = null;
    }
  }

  // Start initialization
  schemaInitializationPromise = (async () => {
    try {
      console.log("🔌 Attempting database connection...");
      console.log("💡 DATABASE_URL is set:", !!process.env.DATABASE_URL);
      console.log(
        "💡 DATABASE_URL length:",
        process.env.DATABASE_URL?.length || 0
      );

      // Test connection with timeout (longer timeout for Neon cold starts)
      const connectionPromise = testConnection();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(new Error("Database connection timeout after 15 seconds")),
          15000
        );
      });

      await Promise.race([connectionPromise, timeoutPromise]);

      // If we get here, connection succeeded
      console.log("✅ Database connection successful, initializing schema...");

      // Initialize schema with timeout (longer for migrations)
      const schemaPromise = initializeSchema();
      const schemaTimeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(new Error("Schema initialization timeout after 45 seconds")),
          45000
        );
      });

      await Promise.race([schemaPromise, schemaTimeoutPromise]);

      schemaInitialized = true;
      console.log("✅ Database connected and schema initialized");
    } catch (error: any) {
      console.error(
        "❌ Database initialization error:",
        error?.message || error
      );
      // Re-throw to trigger 503 response
      throw error;
    }
  })();

  await schemaInitializationPromise;
}

// Initialize on module load (for serverless cold starts)
// In Vercel, this runs when the function is first invoked
if (process.env.VERCEL === "1") {
  // In Vercel, initialize in background but don't block
  ensureSchemaInitialized().catch((err) => {
    console.error("Failed to initialize schema on startup:", err);
  });
} else {
  // In non-serverless, wait for initialization
  ensureSchemaInitialized().catch((err) => {
    console.error("Failed to initialize schema:", err);
    process.exit(1);
  });
}

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
// For Vercel, we need to configure trust proxy properly
// Vercel uses X-Forwarded-For header, so we trust the first proxy
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // Trust only the first proxy (Vercel) to prevent IP spoofing
  validate: {
    trustProxy: false, // Disable trust proxy validation warning
  },
  // Use X-Forwarded-For header for IP detection (Vercel provides this)
  keyGenerator: (req) => {
    // Get IP from X-Forwarded-For header (Vercel sets this)
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const ip = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(",")[0].trim();
      return ip || req.ip || "unknown";
    }
    return req.ip || "unknown";
  },
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
      events: "/api/v1/events",
      conversations: "/api/v1/conversations",
      sessions: "/api/v1/sessions",
    },
    documentation: "https://github.com/NikushaDevashvili/observa-api",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Schema initialization endpoint (for manual trigger)
app.get("/api/v1/admin/init-schema", async (req, res) => {
  try {
    // Reset initialization state to force re-initialization
    schemaInitialized = false;
    schemaInitializationPromise = null;

    console.log("Manual schema initialization requested...");
    await ensureSchemaInitialized();

    res.json({
      success: true,
      message: "Database schema initialized successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Schema initialization error:", error);
    const errorMessage = error?.message || "Unknown error";
    const errorCode = error?.code || "UNKNOWN";

    res.status(500).json({
      success: false,
      error: errorMessage,
      code: errorCode,
      details: {
        message: "Schema initialization failed",
        hint:
          errorCode === "42P01"
            ? "Table does not exist - this should be created by schema initialization"
            : errorCode === "28P01"
            ? "Database authentication failed - verify DATABASE_URL credentials"
            : errorCode === "ENOTFOUND" || errorCode === "ECONNREFUSED"
            ? "Cannot connect to database - verify DATABASE_URL is correct and database is accessible"
            : "Check Vercel logs for full error details",
        troubleshooting: [
          "1. Verify DATABASE_URL is set correctly in Vercel environment variables",
          "2. Check that the database is accessible from Vercel",
          "3. Verify database credentials are correct",
          "4. Check Vercel function logs for detailed error messages",
        ],
      },
    });
  }
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

// Middleware to ensure schema is initialized before handling database requests
// Skip for health check and schema init endpoint
app.use(async (req, res, next) => {
  // Skip schema check for these endpoints
  if (
    req.path === "/health" ||
    req.path === "/" ||
    req.path === "/api/v1/admin/init-schema" ||
    req.path.startsWith("/diagnostics")
  ) {
    return next();
  }

  // For all other endpoints, ensure schema is initialized
  // Use a shorter timeout for the middleware check to prevent hanging
  try {
    const initPromise = ensureSchemaInitialized();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Schema initialization check timeout")),
        5000 // 5 second timeout for middleware check
      );
    });

    await Promise.race([initPromise, timeoutPromise]);
    next();
  } catch (error: any) {
    console.error("Schema not initialized, returning 503:", error);
    const errorMessage = error?.message || "Unknown error";
    const errorCode = error?.code || "UNKNOWN";

    // If it's a timeout, provide helpful message
    if (errorMessage.includes("timeout")) {
      return res.status(503).json({
        error:
          "Database initialization is taking longer than expected. Please try again in a moment.",
        message:
          "The database is being initialized. This usually takes a few seconds. Please retry your request.",
        details: {
          hint: "If this persists, the database connection may be slow. Check Vercel logs for details.",
          retryAfter: "5 seconds",
        },
      });
    }

    res.status(503).json({
      error: "Database not ready. Please try again in a moment.",
      message:
        "If this persists, call /api/v1/admin/init-schema to initialize the database schema.",
      details: {
        error: errorMessage,
        code: errorCode,
        hint:
          errorCode === "42P01"
            ? "Table does not exist - schema needs initialization"
            : errorCode === "28P01"
            ? "Database authentication failed - check DATABASE_URL"
            : errorCode === "ENOTFOUND" || errorCode === "ECONNREFUSED"
            ? "Cannot connect to database - check DATABASE_URL"
            : "Check Vercel logs for more details",
      },
    });
  }
});

// API Routes
app.use("/api/v1/onboarding", onboardingRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/tenants", tenantsRouter);
app.use("/api/v1/traces", tracesRouter);
app.use("/api/v1/events", eventsRouter);
app.use("/api/v1/metrics", metricsRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/conversations", conversationsRouter);
app.use("/api/v1/sessions", sessionsRouter);

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

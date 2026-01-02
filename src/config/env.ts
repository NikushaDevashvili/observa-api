// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config();

import { z } from "zod";

/**
 * Environment variable schema with validation
 * This ensures all required env vars are present and valid at startup
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z
    .string()
    .default("3000")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  TINYBIRD_ADMIN_TOKEN: z.string().min(1, {
    message: "TINYBIRD_ADMIN_TOKEN is required",
  }),
  TINYBIRD_HOST: z
    .string()
    .url({ message: "TINYBIRD_HOST must be a valid URL" })
    .default("https://api.europe-west2.gcp.tinybird.co"),
  TINYBIRD_DATASOURCE_NAME: z.string().default("traces"),
  TINYBIRD_CANONICAL_EVENTS_DATASOURCE: z.string().default("canonical_events"),
  JWT_SECRET: z.string().min(32, {
    message: "JWT_SECRET must be at least 32 characters for security",
  }),
  JWT_EXPIRES_IN: z.string().default("90d"),
  DATABASE_URL: z.string().url({
    message: "DATABASE_URL must be a valid PostgreSQL connection string",
  }),
  SENTRY_DSN: z
    .string()
    .url({
      message: "SENTRY_DSN must be a valid Sentry DSN URL",
    })
    .optional(),
  SENTRY_ENVIRONMENT: z.string().default("production"),
  REDIS_URL: z.string().url().optional(),
  UPSTASH_REDIS_URL: z.string().url().optional(),
  ANALYSIS_SERVICE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingVars = error.issues.map((issue) => {
      const path = issue.path.join(".");
      return `  - ${path}: ${issue.message}`;
    });
    
    const errorMessage = `❌ Missing or invalid environment variables:\n${missingVars.join("\n")}\n\n💡 Please add these in Vercel Dashboard → Settings → Environment Variables`;
    
    console.error(errorMessage);
    
    // In Vercel/serverless, we need to throw but make it clear
    // The function will fail but at least we'll see the error in logs
    if (process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      // Log to console for Vercel logs
      console.error("\n🔧 To fix this:");
      console.error("1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables");
      console.error("2. Add the missing variables listed above");
      console.error("3. Redeploy the project");
    }
    
    // Don't exit in serverless - let Vercel handle it
    // But throw so the error is visible in logs
    throw new Error(
      `Environment validation failed. Missing: ${error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
  }
  throw error;
}

export { env };

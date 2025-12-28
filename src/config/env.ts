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
  JWT_SECRET: z.string().min(32, {
    message: "JWT_SECRET must be at least 32 characters for security",
  }),
  JWT_EXPIRES_IN: z.string().default("90d"),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Invalid environment variables:");
    error.issues.forEach((issue) => {
      const path = issue.path.join(".");
      console.error(`  - ${path}: ${issue.message}`);
    });
    console.error(
      "\n💡 Please check your .env file and ensure all required variables are set."
    );
    // Don't exit in serverless environments (Vercel)
    if (process.env.VERCEL !== "1" && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      process.exit(1);
    }
    // In serverless, throw the error so it can be caught
    throw new Error(
      `Environment validation failed: ${error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`
    );
  }
  throw error;
}

export { env };

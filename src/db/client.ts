import { Pool, PoolClient } from "pg";
import { env } from "../config/env.js";

/**
 * Database client singleton
 * Manages PostgreSQL connection pool
 */
let pool: Pool | null = null;

/**
 * Get or create database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    // Detect if using Neon (has 'neon.tech' in URL) or pooler connection
    const isNeon = env.DATABASE_URL.includes("neon.tech");
    const isPooler = env.DATABASE_URL.includes("pooler");

    pool = new Pool({
      connectionString: env.DATABASE_URL,
      // Connection pool settings
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      // Increase timeout for Neon databases (they can be slower on cold starts)
      connectionTimeoutMillis: isNeon ? 30000 : 10000, // 30 seconds for Neon, 10 for others
      // SSL configuration (required for Neon)
      ssl: isNeon ? { rejectUnauthorized: false } : undefined,
      // Additional settings for Neon pooler connections
      ...(isPooler
        ? {
            // For pooler connections, use connection string as-is
            // Neon pooler handles connection management
          }
        : {}),
    });

    // Handle pool errors
    pool.on("error", (err) => {
      console.error("Unexpected error on idle database client", err);
    });
  }

  return pool;
}

/**
 * Execute a query with automatic connection management
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return await pool.connect();
}

/**
 * Close all database connections
 * Useful for graceful shutdown
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Test database connection
 * Returns true if connection succeeds, throws error if it fails (with details)
 */
export async function testConnection(retries: number = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await query("SELECT NOW()");
      if (result.length > 0) {
        console.log("✅ Database connection test successful");
        return true;
      }
      throw new Error("Database query returned no results");
    } catch (error: any) {
      const isLastAttempt = attempt === retries;

      // If it's a timeout and not the last attempt, retry
      if (
        !isLastAttempt &&
        (error?.message?.includes("timeout") ||
          error?.message?.includes("Connection terminated") ||
          error?.code === "ETIMEDOUT")
      ) {
        const waitTime = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
        console.log(
          `⚠️  Database connection attempt ${attempt}/${retries} failed, retrying in ${waitTime}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      // If last attempt or non-timeout error, throw with details
      console.error(
        `❌ Database connection test failed (attempt ${attempt}/${retries}):`,
        error
      );
      const errorMessage = error?.message || "Unknown database error";
      const errorCode = error?.code || "UNKNOWN";

      // Provide helpful error messages
      if (errorCode === "28P01") {
        throw new Error(
          `Database authentication failed (${errorCode}): ${errorMessage}. Check DATABASE_URL credentials.`
        );
      } else if (errorCode === "ENOTFOUND" || errorCode === "ECONNREFUSED") {
        throw new Error(
          `Cannot connect to database (${errorCode}): ${errorMessage}. Check DATABASE_URL host and port.`
        );
      } else if (
        errorCode === "ETIMEDOUT" ||
        errorMessage?.includes("timeout") ||
        errorMessage?.includes("Connection terminated")
      ) {
        if (isLastAttempt) {
          throw new Error(
            `Database connection timeout after ${retries} attempts: ${errorMessage}. Neon databases can be slow on cold starts. Please try again in a moment.`
          );
        }
        // Continue to retry
        continue;
      } else if (error?.message?.includes("password")) {
        throw new Error(
          `Database authentication failed: ${errorMessage}. Check DATABASE_URL password.`
        );
      } else if (error?.message?.includes("does not exist")) {
        throw new Error(
          `Database does not exist: ${errorMessage}. Check DATABASE_URL database name.`
        );
      } else {
        throw new Error(
          `Database connection failed (${errorCode}): ${errorMessage}`
        );
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error("Database connection failed after all retries");
}

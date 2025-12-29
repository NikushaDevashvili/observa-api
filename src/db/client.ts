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
      connectionTimeoutMillis: isNeon ? 10000 : 5000, // 10 seconds for Neon, 5 for others
      // SSL configuration (required for Neon)
      ssl: isNeon ? { rejectUnauthorized: false } : undefined,
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
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query("SELECT NOW()");
    if (result.length > 0) {
      console.log("✅ Database connection test successful");
      return true;
    }
    throw new Error("Database query returned no results");
  } catch (error: any) {
    console.error("❌ Database connection test failed:", error);
    // Re-throw with more context
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
      throw new Error(
        `Database connection timeout: ${errorMessage}. This can happen with Neon databases on cold starts. Try again in a moment.`
      );
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

import bcrypt from "bcryptjs";
import { query } from "../db/client.js";
import { TokenService } from "./tokenService.js";
import { TenantService } from "./tenantService.js";
import crypto from "crypto";

export interface User {
  id: string;
  email: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

/**
 * Authentication Service
 * Handles user authentication, password hashing, and session management
 */
export class AuthService {
  private static readonly SALT_ROUNDS = 10;
  private static readonly SESSION_EXPIRY_DAYS = 90;
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
  
  // Secure session cache: key = tokenHash, value = { user, expires, tokenHash }
  // Using tokenHash as key prevents cache poisoning and ensures tenant isolation
  private static sessionCache = new Map<string, { 
    user: User; 
    expires: number;
    tokenHash: string;
  }>();
  
  // Cache cleanup interval (runs every 10 minutes)
  private static cacheCleanupInterval: NodeJS.Timeout | null = null;
  
  /**
   * Initialize cache cleanup interval
   */
  private static initializeCacheCleanup(): void {
    if (this.cacheCleanupInterval) return;
    
    // Clean up expired cache entries every 10 minutes
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, value] of this.sessionCache.entries()) {
        if (value.expires <= now) {
          this.sessionCache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[AuthService] Cleaned up ${cleaned} expired session cache entries`);
      }
    }, 10 * 60 * 1000);
  }

  /**
   * Hash a password
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Verify a password
   */
  static async verifyPassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Create a new user account
   */
  static async signup(data: {
    email: string;
    password: string;
    companyName: string;
    plan?: string;
  }): Promise<{
    user: User;
    apiKey: string;
    sessionToken: string;
    tenantId: string;
    projectId: string;
  }> {
    // Check if user already exists
    const existingUser = await this.getUserByEmail(data.email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Generate slug from company name
    const slug = this.generateSlug(data.companyName);

    // Ensure slug is unique
    const uniqueSlug = await this.ensureUniqueSlug(slug);

    // Create tenant
    const tenant = await TenantService.createTenant({
      name: data.companyName,
      slug: uniqueSlug,
      plan: data.plan ?? "free",
      email: data.email,
    });

    // Create default project
    const project = await TenantService.createProject({
      tenantId: tenant.id,
      name: "Production",
      environment: "prod",
    });

    // Provision tokens
    const { apiKey } = await TenantService.provisionTokens({
      tenantId: tenant.id,
      projectId: project.id,
      environment: "prod",
    });

    // Create user account linked to tenant
    const userId = crypto.randomUUID();
    const now = new Date();

    await query(
      `INSERT INTO users (id, email, password_hash, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        data.email,
        passwordHash,
        tenant.id,
        now,
        now,
      ]
    );

    const user: User = {
      id: userId,
      email: data.email,
      tenantId: tenant.id,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    // Create session
    const sessionToken = await this.createSession(userId);

    return {
      user,
      apiKey,
      sessionToken,
      tenantId: tenant.id,
      projectId: project.id,
    };
  }

  /**
   * Login a user
   */
  static async login(
    email: string,
    password: string
  ): Promise<{
    user: User;
    sessionToken: string;
    apiKey: string;
  }> {
    // Get user by email
    const user = await this.getUserByEmail(email);
    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Get password hash
    const rows = await query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [user.id]
    );

    if (rows.length === 0) {
      throw new Error("Invalid email or password");
    }

    // Verify password
    const isValid = await this.verifyPassword(password, rows[0].password_hash);
    if (!isValid) {
      throw new Error("Invalid email or password");
    }

    // Update last login
    await query(
      `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [user.id]
    );

    user.lastLoginAt = new Date();

    // Create session
    const sessionToken = await this.createSession(user.id);

    // Get API key for this tenant
    const tenant = await TenantService.getTenant(user.tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }

    // Get first project for this tenant
    const projects = await query<{ id: string; environment: string }>(
      `SELECT id, environment FROM projects WHERE tenant_id = $1 LIMIT 1`,
      [user.tenantId]
    );

    if (projects.length === 0) {
      throw new Error("No project found for tenant");
    }

    const project = projects[0];

    // Generate API key
    const apiKey = TokenService.generateToken({
      tenantId: user.tenantId,
      projectId: project.id,
      environment: (project.environment as "dev" | "prod") || "prod",
    });

    return {
      user,
      sessionToken,
      apiKey,
    };
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<User | null> {
    const rows = await query<User>(
      `SELECT id, email, tenant_id as "tenantId", created_at as "createdAt", 
              updated_at as "updatedAt", last_login_at as "lastLoginAt"
       FROM users WHERE email = $1`,
      [email]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      email: row.email,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastLoginAt: row.lastLoginAt,
    };
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<User | null> {
    const rows = await query<User>(
      `SELECT id, email, tenant_id as "tenantId", created_at as "createdAt", 
              updated_at as "updatedAt", last_login_at as "lastLoginAt"
       FROM users WHERE id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      email: row.email,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastLoginAt: row.lastLoginAt,
    };
  }

  /**
   * Create a session for a user
   */
  static async createSession(userId: string): Promise<string> {
    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.SESSION_EXPIRY_DAYS);

    // Store session
    await query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    return sessionToken;
  }

  /**
   * Validate session token with secure caching
   * Cache key is tokenHash to prevent cache poisoning
   */
  static async validateSession(sessionToken: string): Promise<User | null> {
    // Initialize cache cleanup if not already done
    this.initializeCacheCleanup();
    
    const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");

    // Check cache first - use tokenHash as key for security
    const cached = this.sessionCache.get(tokenHash);
    if (cached && cached.expires > Date.now()) {
      // Defense in depth: verify token hash matches
      if (cached.tokenHash === tokenHash) {
        return cached.user;
      } else {
        // Security violation detected - remove bad cache entry
        this.sessionCache.delete(tokenHash);
        console.error(`[AuthService] Security: Cache token hash mismatch detected`);
      }
    }

    // Cache miss or expired - query database
    const rows = await query<{ user_id: string; expires_at: Date }>(
      `SELECT user_id, expires_at FROM sessions 
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return null;
    }

    const session = rows[0];
    const user = await this.getUserById(session.user_id);
    
    // Cache the result if user found
    if (user) {
      this.sessionCache.set(tokenHash, {
        user,
        expires: Date.now() + this.CACHE_TTL,
        tokenHash // Store hash for validation
      });
    }
    
    return user;
  }

  /**
   * Invalidate session cache entry
   */
  private static invalidateSessionCache(sessionToken: string): void {
    const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    this.sessionCache.delete(tokenHash);
  }

  /**
   * Invalidate all cached sessions for a user
   */
  private static invalidateUserCache(userId: string): void {
    // Remove all cached sessions for this user
    for (const [key, value] of this.sessionCache.entries()) {
      if (value.user.id === userId) {
        this.sessionCache.delete(key);
      }
    }
  }

  /**
   * Revoke a session and invalidate cache
   */
  static async revokeSession(sessionToken: string): Promise<void> {
    // Invalidate cache first
    this.invalidateSessionCache(sessionToken);
    
    const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    await query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  }

  /**
   * Revoke all sessions for a user and invalidate cache
   */
  static async revokeAllSessions(userId: string): Promise<void> {
    // Invalidate cache first
    this.invalidateUserCache(userId);
    
    await query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }
  
  /**
   * Invalidate cache when password is changed (call this after password update)
   */
  static invalidateUserSessionsOnPasswordChange(userId: string): void {
    this.invalidateUserCache(userId);
  }

  /**
   * Generate URL-friendly slug from company name
   */
  private static generateSlug(companyName: string): string {
    return companyName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
  }

  /**
   * Ensure slug is unique by appending a number if needed
   */
  private static async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    
    // Validate slug is not empty
    if (!slug) {
      throw new Error(
        "Company name must contain at least one alphanumeric character"
      );
    }
    
    // Check if slug exists
    while (true) {
      const existing = await query(
        `SELECT id FROM tenants WHERE slug = $1`,
        [slug]
      );
      
      if (existing.length === 0) {
        // Slug is available
        return slug;
      }
      
      // Slug exists, try with number suffix
      slug = `${baseSlug}-${counter}`;
      counter++;
      
      // Safety limit to prevent infinite loop
      if (counter > 1000) {
        // Fallback to UUID-based slug
        const uuid = crypto.randomUUID().substring(0, 8);
        slug = `${baseSlug}-${uuid}`;
        break;
      }
    }
    
    return slug;
  }
}


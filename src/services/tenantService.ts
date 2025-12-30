import { Tenant, Project, TenantToken } from "../types.js";
import { env } from "../config/env.js";
import { TokenService } from "./tokenService.js";
import { TinybirdTokenService } from "./tinybirdTokenService.js";
import { query, getClient } from "../db/client.js";

/**
 * Tenant Service
 * Manages tenants, projects, and token provisioning
 * Uses PostgreSQL database for persistent storage
 */
export class TenantService {
  /**
   * Create a new tenant
   */
  static async createTenant(data: {
    name: string;
    slug: string;
    plan?: string;
    email?: string;
  }): Promise<Tenant> {
    const id = crypto.randomUUID();
    const now = new Date();

    await query(
      `INSERT INTO tenants (id, name, slug, plan, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        data.name,
        data.slug,
        data.plan ?? "free",
        data.email ?? null,
        now,
        now,
      ]
    );

    return {
      id,
      name: data.name,
      slug: data.slug,
      plan: data.plan ?? "free",
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get tenant by ID
   */
  static async getTenant(tenantId: string): Promise<Tenant | null> {
    const rows = await query<Tenant>(
      `SELECT id, name, slug, plan, created_at as "createdAt", updated_at as "updatedAt"
       FROM tenants WHERE id = $1`,
      [tenantId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Create a project for a tenant
   */
  static async createProject(data: {
    tenantId: string;
    name: string;
    environment: "dev" | "prod";
  }): Promise<Project> {
    // Verify tenant exists
    const tenant = await this.getTenant(data.tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${data.tenantId} not found`);
    }

    const id = crypto.randomUUID();
    const now = new Date();

    await query(
      `INSERT INTO projects (id, tenant_id, name, environment, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, data.tenantId, data.name, data.environment, now]
    );

    return {
      id,
      tenantId: data.tenantId,
      name: data.name,
      environment: data.environment,
      createdAt: now,
    };
  }

  /**
   * Get project by ID
   */
  static async getProject(projectId: string): Promise<Project | null> {
    const rows = await query<Project>(
      `SELECT id, tenant_id as "tenantId", name, environment, created_at as "createdAt"
       FROM projects WHERE id = $1`,
      [projectId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      environment: row.environment as "dev" | "prod",
      createdAt: row.createdAt,
    };
  }

  /**
   * Get all projects for a tenant
   */
  static async getProjectsByTenant(tenantId: string): Promise<Project[]> {
    const rows = await query<Project>(
      `SELECT id, tenant_id as "tenantId", name, environment, created_at as "createdAt"
       FROM projects WHERE tenant_id = $1
       ORDER BY environment DESC, created_at ASC`,
      [tenantId]
    );

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      environment: row.environment as "dev" | "prod",
      createdAt: row.createdAt,
    }));
  }

  /**
   * Provision tokens for a tenant/project
   *
   * This creates:
   * 1. Tinybird token automatically via TinybirdTokenService
   * 2. JWT token for customer SDK (with tenant context)
   * 3. Stores Tinybird token mapping (for backend to use)
   */
  static async provisionTokens(data: {
    tenantId: string;
    projectId: string;
    environment?: "dev" | "prod";
  }): Promise<{ apiKey: string; tenantId: string; projectId: string }> {
    // Verify tenant and project exist
    const tenant = await this.getTenant(data.tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${data.tenantId} not found`);
    }

    const project = await this.getProject(data.projectId);
    if (!project) {
      throw new Error(`Project ${data.projectId} not found`);
    }

    // Automatically create Tinybird token for this tenant
    const { token: tinybirdToken, tokenId: tinybirdTokenId } =
      await TinybirdTokenService.createTokenForTenant(data.tenantId);

    // Generate JWT token for customer
    const apiKey = TokenService.generateToken({
      tenantId: data.tenantId,
      projectId: data.projectId,
      environment: data.environment ?? project.environment,
    });

    // Store Tinybird token mapping in database
    await query(
      `INSERT INTO tenant_tokens (tenant_id, tinybird_token, tinybird_token_id, jwt_secret, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id) 
       DO UPDATE SET 
         tinybird_token = EXCLUDED.tinybird_token,
         tinybird_token_id = EXCLUDED.tinybird_token_id,
         jwt_secret = EXCLUDED.jwt_secret`,
      [
        data.tenantId,
        tinybirdToken,
        tinybirdTokenId ?? null,
        env.JWT_SECRET, // In production, use per-tenant secrets
        new Date(),
      ]
    );

    return {
      apiKey,
      tenantId: data.tenantId,
      projectId: data.projectId,
    };
  }

  /**
   * Get Tinybird token for a tenant
   */
  static async getTinybirdToken(tenantId: string): Promise<string | null> {
    const rows = await query<{ tinybird_token: string }>(
      `SELECT tinybird_token FROM tenant_tokens WHERE tenant_id = $1`,
      [tenantId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].tinybird_token;
  }

  /**
   * Get all tenants (for admin/debugging)
   */
  static async listTenants(): Promise<Tenant[]> {
    const rows = await query<Tenant>(
      `SELECT id, name, slug, plan, created_at as "createdAt", updated_at as "updatedAt"
       FROM tenants ORDER BY created_at DESC`
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Revoke all tokens for a tenant
   * Revokes both JWT (by clearing from storage) and Tinybird token
   *
   * @param tenantId - The tenant ID
   */
  static async revokeTenantTokens(tenantId: string): Promise<void> {
    // Get tenant token from database
    const rows = await query<{ tinybird_token_id: string | null }>(
      `SELECT tinybird_token_id FROM tenant_tokens WHERE tenant_id = $1`,
      [tenantId]
    );

    if (rows.length === 0) {
      throw new Error(`No tokens found for tenant ${tenantId}`);
    }

    const tenantToken = rows[0];

    // Revoke Tinybird token if token ID is available
    if (tenantToken.tinybird_token_id) {
      try {
        await TinybirdTokenService.revokeTokenForTenant(
          tenantToken.tinybird_token_id
        );
      } catch (error) {
        // Log error but continue with cleanup
        console.error(
          `Failed to revoke Tinybird token for tenant ${tenantId}:`,
          error
        );
      }
    }

    // Remove from database (this effectively revokes the JWT since it can't be validated without the stored mapping)
    await query(`DELETE FROM tenant_tokens WHERE tenant_id = $1`, [tenantId]);
  }
}

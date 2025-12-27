import { Tenant, Project, TenantToken } from "../types.js";
import { TokenService } from "./tokenService.js";
import { TinybirdTokenService } from "./tinybirdTokenService.js";

// In-memory storage for MVP (replace with database in production)
const tenants: Map<string, Tenant> = new Map();
const projects: Map<string, Project> = new Map();
const tenantTokens: Map<string, TenantToken> = new Map();

/**
 * Tenant Service
 * Manages tenants, projects, and token provisioning
 *
 * TODO: Replace in-memory storage with database (PostgreSQL)
 */
export class TenantService {
  /**
   * Create a new tenant
   */
  static async createTenant(data: {
    name: string;
    slug: string;
    plan?: string;
  }): Promise<Tenant> {
    const tenant: Tenant = {
      id: crypto.randomUUID(),
      name: data.name,
      slug: data.slug,
      plan: data.plan ?? "free",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    tenants.set(tenant.id, tenant);
    return tenant;
  }

  /**
   * Get tenant by ID
   */
  static async getTenant(tenantId: string): Promise<Tenant | null> {
    return tenants.get(tenantId) ?? null;
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

    const project: Project = {
      id: crypto.randomUUID(),
      tenantId: data.tenantId,
      name: data.name,
      environment: data.environment,
      createdAt: new Date(),
    };

    projects.set(project.id, project);
    return project;
  }

  /**
   * Get project by ID
   */
  static async getProject(projectId: string): Promise<Project | null> {
    return projects.get(projectId) ?? null;
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

    // Store Tinybird token mapping
    const tenantToken: TenantToken = {
      tenantId: data.tenantId,
      jwtSecret: process.env.JWT_SECRET || "change-me", // In production, use per-tenant secrets
      tinybirdToken,
      tinybirdTokenId,
      createdAt: new Date(),
    };

    tenantTokens.set(data.tenantId, tenantToken);

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
    const token = tenantTokens.get(tenantId);
    return token?.tinybirdToken ?? null;
  }

  /**
   * Get all tenants (for admin/debugging)
   */
  static async listTenants(): Promise<Tenant[]> {
    return Array.from(tenants.values());
  }

  /**
   * Revoke all tokens for a tenant
   * Revokes both JWT (by clearing from storage) and Tinybird token
   *
   * @param tenantId - The tenant ID
   */
  static async revokeTenantTokens(tenantId: string): Promise<void> {
    const tenantToken = tenantTokens.get(tenantId);
    if (!tenantToken) {
      throw new Error(`No tokens found for tenant ${tenantId}`);
    }

    // Revoke Tinybird token if token ID is available
    if (tenantToken.tinybirdTokenId) {
      try {
        await TinybirdTokenService.revokeTokenForTenant(
          tenantToken.tinybirdTokenId
        );
      } catch (error) {
        // Log error but continue with cleanup
        console.error(
          `Failed to revoke Tinybird token for tenant ${tenantId}:`,
          error
        );
      }
    }

    // Remove from storage (this effectively revokes the JWT since it can't be validated without the stored mapping)
    tenantTokens.delete(tenantId);
  }
}


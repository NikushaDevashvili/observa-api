import { TenantService } from "./tenantService.js";
import { query } from "../db/client.js";

/**
 * Onboarding Service
 * Orchestrates the complete customer signup flow
 */
export class OnboardingService {
  /**
   * Complete signup flow:
   * 1. Validate email format
   * 2. Generate slug from company name
   * 3. Create tenant
   * 4. Create default project ("Production")
   * 5. Automatically provision tokens (Tinybird + JWT)
   * 6. Return API key + tenant info
   */
  static async signup(data: {
    email: string;
    companyName: string;
    plan?: string;
  }): Promise<{
    apiKey: string;
    tenantId: string;
    projectId: string;
    environment: "prod";
    message: string;
  }> {
    // 1. Email validation
    if (!this.isValidEmail(data.email)) {
      throw new Error("Invalid email format");
    }

    // 2. Validate company name
    if (!data.companyName || !data.companyName.trim()) {
      throw new Error("Company name cannot be empty");
    }

    // 3. Generate slug from company name
    let slug = this.generateSlug(data.companyName);

    // Validate slug is not empty
    if (!slug) {
      throw new Error(
        "Company name must contain at least one alphanumeric character"
      );
    }

    // 4. Handle duplicate slugs by appending a number
    slug = await this.ensureUniqueSlug(slug);

    // 5. Create tenant
    const tenant = await TenantService.createTenant({
      name: data.companyName,
      slug,
      plan: data.plan ?? "free",
      email: data.email,
    });

    // 6. Create default project
    const project = await TenantService.createProject({
      tenantId: tenant.id,
      name: "Production",
      environment: "prod",
    });

    // 7. Automatically provision tokens
    // This will automatically create Tinybird token via TinybirdTokenService
    const { apiKey } = await TenantService.provisionTokens({
      tenantId: tenant.id,
      projectId: project.id,
      environment: "prod",
    });

    return {
      apiKey,
      tenantId: tenant.id,
      projectId: project.id,
      environment: "prod",
      message: "Welcome! Your API key is ready to use.",
    };
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
    const { query } = await import("../db/client.js");
    
    let slug = baseSlug;
    let counter = 1;
    
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

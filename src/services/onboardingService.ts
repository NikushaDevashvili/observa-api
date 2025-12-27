import { TenantService } from "./tenantService.js";

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

    // 2. Generate slug from company name
    const slug = this.generateSlug(data.companyName);

    // 3. Create tenant
    const tenant = await TenantService.createTenant({
      name: data.companyName,
      slug,
      plan: data.plan ?? "free",
    });

    // 4. Create default project
    const project = await TenantService.createProject({
      tenantId: tenant.id,
      name: "Production",
      environment: "prod",
    });

    // 5. Automatically provision tokens
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
}


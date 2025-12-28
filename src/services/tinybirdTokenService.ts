import { env } from "../config/env.js";

/**
 * Response from Tinybird API when creating a token
 */
interface TinybirdTokenResponse {
  token: string;
  id: string;
}

/**
 * Tinybird Token Service
 * Manages Tinybird token creation and revocation for tenants
 *
 * Uses TINYBIRD_ADMIN_TOKEN to create per-tenant tokens via Tinybird API
 */
export class TinybirdTokenService {
  /**
   * Create a Tinybird token for a tenant
   *
   * @param tenantId - The tenant ID
   * @returns The created token and token ID
   * @throws Error if TINYBIRD_ADMIN_TOKEN is not configured or API call fails
   */
  static async createTokenForTenant(
    tenantId: string
  ): Promise<{ token: string; tokenId: string }> {
    const tokenName = `tenant-${tenantId}`;
    // Tinybird scope format: DATASOURCES:APPEND:datasource_name
    const scope = `DATASOURCES:APPEND:${env.TINYBIRD_DATASOURCE_NAME}`;
    const url = `${env.TINYBIRD_HOST}/v0/tokens`;

    try {
      // Tinybird API expects form data, not JSON
      const formData = new URLSearchParams();
      formData.append("name", tokenName);
      formData.append("scope", scope);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TINYBIRD_ADMIN_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Failed to create Tinybird token: ${response.status} ${errorText}`
        );
      }

      const data = (await response.json()) as TinybirdTokenResponse;

      return {
        token: data.token,
        tokenId: data.id,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error creating Tinybird token: ${errorMessage}`);
    }
  }

  /**
   * Revoke a Tinybird token for a tenant
   *
   * @param tokenId - The Tinybird token ID to revoke
   * @throws Error if TINYBIRD_ADMIN_TOKEN is not configured or API call fails
   */
  static async revokeTokenForTenant(tokenId: string): Promise<void> {
    const url = `${env.TINYBIRD_HOST}/v0/tokens/${encodeURIComponent(tokenId)}`;

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${env.TINYBIRD_ADMIN_TOKEN}`,
        },
      });

      if (!response.ok) {
        // 404 is acceptable (token already deleted)
        if (response.status === 404) {
          return;
        }

        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Failed to revoke Tinybird token: ${response.status} ${errorText}`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error revoking Tinybird token: ${errorMessage}`);
    }
  }
}

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;
const TINYBIRD_DATASOURCE_NAME =
  process.env.TINYBIRD_DATASOURCE_NAME || "traces";

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
    if (!TINYBIRD_ADMIN_TOKEN) {
      throw new Error(
        "TINYBIRD_ADMIN_TOKEN is not configured. Please set it in your environment variables."
      );
    }

    const tokenName = `tenant-${tenantId}`;
    const url = `${TINYBIRD_HOST}/v0/tokens`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: tokenName,
          permissions: ["append"],
          datasources: [TINYBIRD_DATASOURCE_NAME],
        }),
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
    if (!TINYBIRD_ADMIN_TOKEN) {
      throw new Error(
        "TINYBIRD_ADMIN_TOKEN is not configured. Please set it in your environment variables."
      );
    }

    const url = `${TINYBIRD_HOST}/v0/tokens/${encodeURIComponent(tokenId)}`;

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
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


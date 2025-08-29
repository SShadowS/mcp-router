/**
 * OAuth Token Injector for MCP Server connections
 *
 * This service handles injecting OAuth access tokens into MCP server
 * connections and automatically refreshing them when needed.
 */

import { OAuthService } from "./oauth-service";
import type { MCPServerConfig } from "@mcp_router/shared";

export interface TokenInjectionResult {
  headers: Record<string, string>;
  refreshHandler?: () => Promise<string | null>;
}

export class OAuthTokenInjector {
  private static instance: OAuthTokenInjector | null = null;
  private oauthService: OAuthService;

  private constructor() {
    this.oauthService = OAuthService.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): OAuthTokenInjector {
    if (!OAuthTokenInjector.instance) {
      OAuthTokenInjector.instance = new OAuthTokenInjector();
    }
    return OAuthTokenInjector.instance;
  }

  /**
   * Inject OAuth token into request headers for a server
   */
  async injectToken(
    serverId: string,
    existingHeaders: Record<string, string> = {},
  ): Promise<TokenInjectionResult> {
    const headers = { ...existingHeaders };

    try {
      // Check if server has OAuth configuration
      const hasOAuth = await this.oauthService.hasOAuthConfiguration(serverId);
      if (!hasOAuth) {
        return { headers };
      }

      // Get access token
      const accessToken = await this.oauthService.getAccessToken(serverId);
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      // Return headers with refresh handler
      return {
        headers,
        refreshHandler: async () => {
          try {
            const result = await this.oauthService.refreshToken(serverId);
            if (result?.accessToken) {
              return result.accessToken;
            }
          } catch (error) {
            console.error("Failed to refresh OAuth token:", error);
          }
          return null;
        },
      };
    } catch (error) {
      console.error("Failed to inject OAuth token:", error);
      return { headers };
    }
  }

  /**
   * Handle 401 Unauthorized response by refreshing token
   */
  async handleUnauthorized(serverId: string): Promise<string | null> {
    try {
      const result = await this.oauthService.refreshToken(serverId);
      if (result?.accessToken) {
        return result.accessToken;
      }
    } catch (error) {
      console.error("Failed to refresh token on 401:", error);
    }
    return null;
  }

  /**
   * Check if server requires OAuth authentication
   */
  async requiresOAuth(serverId: string): Promise<boolean> {
    return this.oauthService.hasOAuthConfiguration(serverId);
  }

  /**
   * Get OAuth status for health checks
   */
  async getOAuthHealth(serverId: string): Promise<{
    configured: boolean;
    authenticated: boolean;
    tokenValid: boolean;
    expiresAt?: number;
  }> {
    const configured = await this.oauthService.hasOAuthConfiguration(serverId);
    if (!configured) {
      return {
        configured: false,
        authenticated: false,
        tokenValid: false,
      };
    }

    const hasToken = await this.oauthService.hasValidToken(serverId);
    const status = await this.oauthService.getOAuthStatus(serverId);

    return {
      configured: true,
      authenticated: status?.authenticated || false,
      tokenValid: hasToken,
      expiresAt: status?.expiresAt,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Cleanup if needed
  }
}

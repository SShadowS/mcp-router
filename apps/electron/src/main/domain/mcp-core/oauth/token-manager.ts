/**
 * Token Manager Service
 * Manages OAuth token lifecycle including storage, retrieval, refresh, and validation
 */

import { OAuthToken, OAuthConfig, OAUTH_CONSTANTS } from "./oauth-types";
import { getServerOAuthRepository } from "../../../infrastructure/database";
import { OAuthFlowService } from "./oauth-flow";
import { net } from "electron";

export class TokenManagerService {
  private tokenRefreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private refreshPromises: Map<string, Promise<OAuthToken>> = new Map();
  private flowService: OAuthFlowService;

  constructor() {
    this.flowService = new OAuthFlowService();
    this.startTokenMaintenanceInterval();
  }

  /**
   * Get a valid access token for a server
   * Automatically refreshes if expired or about to expire
   */
  async getValidToken(serverId: string): Promise<string | null> {
    const oauthRepo = getServerOAuthRepository();

    // Get current token
    const token = oauthRepo.getTokenByServerId(serverId);
    if (!token) {
      console.log(`No token found for server ${serverId}`);
      return null;
    }

    // Check if token needs refresh
    if (this.shouldRefreshToken(token)) {
      console.log(`Token for server ${serverId} needs refresh`);

      // Check if refresh is already in progress
      const existingRefresh = this.refreshPromises.get(serverId);
      if (existingRefresh) {
        console.log(`Waiting for existing refresh for server ${serverId}`);
        const refreshedToken = await existingRefresh;
        return refreshedToken.accessToken;
      }

      // Get OAuth config
      const config = oauthRepo.getConfigByServerId(serverId);
      if (!config || !token.refreshToken) {
        console.error(
          `Cannot refresh token for server ${serverId}: missing config or refresh token`,
        );
        return null;
      }

      // Refresh the token
      try {
        const refreshedToken = await this.refreshToken(config, token);
        return refreshedToken.accessToken;
      } catch (error) {
        console.error(`Failed to refresh token for server ${serverId}:`, error);
        // Return existing token if refresh fails and it's not expired
        if (!this.isTokenExpired(token)) {
          return token.accessToken;
        }
        return null;
      }
    }

    // Update last used timestamp
    oauthRepo.updateTokenLastUsed(serverId);

    return token.accessToken;
  }

  /**
   * Store a new token
   */
  async storeToken(serverId: string, token: OAuthToken): Promise<OAuthToken> {
    const oauthRepo = getServerOAuthRepository();
    const savedToken = oauthRepo.saveToken({ ...token, serverId });

    // Schedule refresh if token has expiry
    if (savedToken.expiresAt) {
      this.scheduleTokenRefresh(serverId, savedToken);
    }

    return savedToken;
  }

  /**
   * Refresh an access token
   */
  async refreshToken(
    config: OAuthConfig,
    token: OAuthToken,
  ): Promise<OAuthToken> {
    const serverId = config.serverId;

    // Store refresh promise to prevent duplicate refreshes
    const refreshPromise = this.performTokenRefresh(config, token);
    this.refreshPromises.set(serverId, refreshPromise);

    try {
      const refreshedToken = await refreshPromise;

      // Schedule next refresh
      if (refreshedToken.expiresAt) {
        this.scheduleTokenRefresh(serverId, refreshedToken);
      }

      return refreshedToken;
    } finally {
      // Clean up refresh promise
      this.refreshPromises.delete(serverId);
    }
  }

  /**
   * Perform the actual token refresh
   */
  private async performTokenRefresh(
    config: OAuthConfig,
    token: OAuthToken,
  ): Promise<OAuthToken> {
    if (!token.refreshToken) {
      throw new Error("No refresh token available");
    }

    const maxRetries = OAUTH_CONSTANTS.MAX_REFRESH_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `Refreshing token for server ${config.serverId} (attempt ${attempt}/${maxRetries})`,
        );

        const refreshedToken = await this.flowService.refreshAccessToken(
          config,
          token.refreshToken,
        );

        console.log(
          `Successfully refreshed token for server ${config.serverId}`,
        );
        return refreshedToken;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        console.error(`Token refresh attempt ${attempt} failed:`, lastError);

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Token refresh failed after all retries");
  }

  /**
   * Validate a token by introspection (if supported)
   */
  async validateToken(config: OAuthConfig, token: string): Promise<boolean> {
    if (!config.introspectionEndpoint) {
      // No introspection endpoint, assume valid
      return true;
    }

    try {
      const response = await this.introspectToken(
        config.introspectionEndpoint,
        token,
        config.clientId,
        config.clientSecret,
      );

      return response.active === true;
    } catch (error) {
      console.error("Token introspection failed:", error);
      return false;
    }
  }

  /**
   * Revoke a token
   */
  async revokeToken(serverId: string): Promise<boolean> {
    const oauthRepo = getServerOAuthRepository();

    const token = oauthRepo.getTokenByServerId(serverId);
    const config = oauthRepo.getConfigByServerId(serverId);

    if (!token || !config) {
      return false;
    }

    // Cancel any scheduled refresh
    this.cancelTokenRefresh(serverId);

    // Revoke at authorization server if endpoint is available
    if (config.revocationEndpoint) {
      try {
        await this.revokeTokenAtServer(
          config.revocationEndpoint,
          token.accessToken,
          config.clientId,
          config.clientSecret,
        );
      } catch (error) {
        console.error("Token revocation at server failed:", error);
        // Continue with local deletion even if server revocation fails
      }
    }

    // Delete from local storage
    return oauthRepo.deleteToken(serverId);
  }

  /**
   * Check if token should be refreshed
   */
  private shouldRefreshToken(token: OAuthToken): boolean {
    if (!token.expiresAt) {
      // No expiry, don't refresh
      return false;
    }

    const now = Date.now();
    const expiryBuffer = OAUTH_CONSTANTS.DEFAULT_EXPIRY_BUFFER * 1000; // Convert to ms

    // Refresh if expired or within buffer period of expiry
    return token.expiresAt <= now + expiryBuffer;
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(token: OAuthToken): boolean {
    if (!token.expiresAt) {
      return false;
    }

    return token.expiresAt <= Date.now();
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(serverId: string, token: OAuthToken): void {
    // Cancel existing timer
    this.cancelTokenRefresh(serverId);

    if (!token.expiresAt || !token.refreshToken) {
      return;
    }

    // Calculate when to refresh (5 minutes before expiry)
    const now = Date.now();
    const refreshTime =
      token.expiresAt - OAUTH_CONSTANTS.DEFAULT_EXPIRY_BUFFER * 1000;
    const delay = Math.max(refreshTime - now, 0);

    if (delay > 0) {
      console.log(
        `Scheduling token refresh for server ${serverId} in ${delay}ms`,
      );

      const timer = setTimeout(async () => {
        console.log(`Auto-refreshing token for server ${serverId}`);

        const oauthRepo = getServerOAuthRepository();
        const config = oauthRepo.getConfigByServerId(serverId);

        if (config) {
          try {
            await this.refreshToken(config, token);
          } catch (error) {
            console.error(`Auto-refresh failed for server ${serverId}:`, error);
          }
        }
      }, delay);

      this.tokenRefreshTimers.set(serverId, timer);
    }
  }

  /**
   * Cancel scheduled token refresh
   */
  private cancelTokenRefresh(serverId: string): void {
    const timer = this.tokenRefreshTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.tokenRefreshTimers.delete(serverId);
    }
  }

  /**
   * Start interval to check for expired tokens
   */
  private startTokenMaintenanceInterval(): void {
    setInterval(() => {
      this.checkAndRefreshExpiredTokens();
    }, OAUTH_CONSTANTS.TOKEN_REFRESH_INTERVAL);
  }

  /**
   * Check all tokens and refresh expired ones
   */
  private async checkAndRefreshExpiredTokens(): Promise<void> {
    const oauthRepo = getServerOAuthRepository();
    const expiredTokens = oauthRepo.getExpiredTokens();

    for (const token of expiredTokens) {
      if (token.refreshToken) {
        const config = oauthRepo.getConfigByServerId(token.serverId);
        if (config) {
          try {
            await this.refreshToken(config, token);
          } catch (error) {
            console.error(
              `Failed to refresh expired token for server ${token.serverId}:`,
              error,
            );
          }
        }
      }
    }
  }

  /**
   * Introspect token at authorization server
   */
  private async introspectToken(
    introspectionEndpoint: string,
    token: string,
    clientId: string,
    clientSecret?: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const formData = new URLSearchParams();
      formData.append("token", token);
      formData.append("token_type_hint", "access_token");

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      };

      if (clientSecret) {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString(
          "base64",
        );
        headers["Authorization"] = `Basic ${auth}`;
      } else {
        formData.append("client_id", clientId);
      }

      const request = net.request({
        method: "POST",
        url: introspectionEndpoint,
        headers,
      });

      let responseData = "";

      request.on("response", (response) => {
        response.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        response.on("end", () => {
          try {
            const data = JSON.parse(responseData);
            resolve(data);
          } catch (error) {
            reject(new Error("Invalid introspection response"));
          }
        });

        response.on("error", reject);
      });

      request.on("error", reject);
      request.write(formData.toString());
      request.end();
    });
  }

  /**
   * Revoke token at authorization server
   */
  private async revokeTokenAtServer(
    revocationEndpoint: string,
    token: string,
    clientId: string,
    clientSecret?: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const formData = new URLSearchParams();
      formData.append("token", token);
      formData.append("token_type_hint", "access_token");

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (clientSecret) {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString(
          "base64",
        );
        headers["Authorization"] = `Basic ${auth}`;
      } else {
        formData.append("client_id", clientId);
      }

      const request = net.request({
        method: "POST",
        url: revocationEndpoint,
        headers,
      });

      request.on("response", (response) => {
        if (response.statusCode === 200) {
          resolve();
        } else {
          reject(
            new Error(`Revocation failed with status ${response.statusCode}`),
          );
        }
      });

      request.on("error", reject);
      request.write(formData.toString());
      request.end();
    });
  }

  /**
   * Clean up all timers and resources
   */
  cleanup(): void {
    // Cancel all refresh timers
    for (const timer of this.tokenRefreshTimers.values()) {
      clearTimeout(timer);
    }
    this.tokenRefreshTimers.clear();
    this.refreshPromises.clear();
  }
}

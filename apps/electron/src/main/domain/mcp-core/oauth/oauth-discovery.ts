/**
 * OAuth Discovery Service
 * Implements OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * and Protected Resource Metadata (RFC 9728) discovery
 */

import { net } from "electron";
import {
  OAuthServerMetadata,
  ProtectedResourceMetadata,
  OAuthProvider,
  OAUTH_PROVIDERS,
} from "./oauth-types";

export class OAuthDiscoveryService {
  private readonly WELL_KNOWN_PATH = "/.well-known";
  private readonly OAUTH_AS_PATH = "/oauth-authorization-server";
  private readonly OAUTH_RESOURCE_PATH = "/oauth-protected-resource";
  private readonly OPENID_CONFIG_PATH = "/openid-configuration";

  // Cache discovered metadata for 24 hours
  private metadataCache: Map<string, { data: any; timestamp: number }> =
    new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Discover OAuth server metadata from a server URL
   * Tries multiple discovery endpoints in order of preference
   */
  async discoverAuthServer(
    serverUrl: string,
  ): Promise<OAuthServerMetadata | null> {
    // Check cache first
    const cached = this.getCachedMetadata(serverUrl);
    if (cached) {
      return cached as OAuthServerMetadata;
    }

    // Try discovery endpoints in order
    const discoveryUrls = [
      `${serverUrl}${this.WELL_KNOWN_PATH}${this.OAUTH_AS_PATH}`,
      `${serverUrl}${this.WELL_KNOWN_PATH}${this.OPENID_CONFIG_PATH}`,
      `${serverUrl}/.well-known/oauth2-metadata`, // Legacy
    ];

    for (const url of discoveryUrls) {
      try {
        const metadata = await this.fetchMetadata(url);
        if (metadata && this.isValidAuthServerMetadata(metadata)) {
          this.cacheMetadata(serverUrl, metadata);
          return metadata as OAuthServerMetadata;
        }
      } catch (error) {
        // Continue to next URL
        console.debug(`Discovery failed for ${url}:`, error);
      }
    }

    return null;
  }

  /**
   * Fetch Protected Resource Metadata to find authorization servers
   * RFC 9728 - OAuth 2.0 Protected Resource Metadata
   */
  async fetchProtectedResourceMetadata(
    serverUrl: string,
  ): Promise<ProtectedResourceMetadata | null> {
    const cacheKey = `${serverUrl}_resource`;
    const cached = this.getCachedMetadata(cacheKey);
    if (cached) {
      return cached as ProtectedResourceMetadata;
    }

    const url = `${serverUrl}${this.WELL_KNOWN_PATH}${this.OAUTH_RESOURCE_PATH}`;

    try {
      const metadata = await this.fetchMetadata(url);
      if (metadata && this.isValidResourceMetadata(metadata)) {
        this.cacheMetadata(cacheKey, metadata);
        return metadata as ProtectedResourceMetadata;
      }
    } catch (error) {
      console.error("Failed to fetch protected resource metadata:", error);
    }

    return null;
  }

  /**
   * Fetch authorization server metadata from a specific URL
   */
  async fetchAuthServerMetadata(
    metadataUrl: string,
  ): Promise<OAuthServerMetadata | null> {
    try {
      const metadata = await this.fetchMetadata(metadataUrl);
      if (metadata && this.isValidAuthServerMetadata(metadata)) {
        return metadata as OAuthServerMetadata;
      }
    } catch (error) {
      console.error("Failed to fetch auth server metadata:", error);
    }

    return null;
  }

  /**
   * Get predefined OAuth endpoints for known providers
   */
  getProviderEndpoints(
    provider: OAuthProvider,
  ): Partial<OAuthServerMetadata> | null {
    const template = OAUTH_PROVIDERS[provider];
    if (!template || provider === OAuthProvider.CUSTOM) {
      return null;
    }

    return {
      issuer: template.authorizationEndpoint.split("/").slice(0, 3).join("/"),
      authorizationEndpoint: template.authorizationEndpoint,
      tokenEndpoint: template.tokenEndpoint,
      userInfoEndpoint: template.userInfoEndpoint,
      revocationEndpoint: template.revocationEndpoint,
      scopesSupported: template.defaultScopes,
      responseTypesSupported: ["code"],
      grantTypesSupported: ["authorization_code", "refresh_token"],
      codeChallengeMethodsSupported: template.usePKCE ? ["S256"] : undefined,
    };
  }

  /**
   * Discover and merge metadata from multiple sources
   */
  async discoverCompleteMetadata(
    serverUrl: string,
    provider?: OAuthProvider,
  ): Promise<OAuthServerMetadata | null> {
    // Start with provider template if available
    let metadata: Partial<OAuthServerMetadata> = {};

    if (provider && provider !== OAuthProvider.CUSTOM) {
      const providerEndpoints = this.getProviderEndpoints(provider);
      if (providerEndpoints) {
        metadata = { ...providerEndpoints };
      }
    }

    // Try to discover from the server
    const discovered = await this.discoverAuthServer(serverUrl);
    if (discovered) {
      // Merge discovered metadata with provider template
      metadata = { ...metadata, ...discovered };
    }

    // If we still don't have required endpoints, try protected resource metadata
    if (!metadata.authorizationEndpoint || !metadata.tokenEndpoint) {
      const resourceMetadata =
        await this.fetchProtectedResourceMetadata(serverUrl);
      if (
        resourceMetadata &&
        resourceMetadata.authorizationServers?.length > 0
      ) {
        // Fetch metadata from the first authorization server
        const authServerMetadata = await this.fetchAuthServerMetadata(
          resourceMetadata.authorizationServers[0],
        );
        if (authServerMetadata) {
          metadata = { ...metadata, ...authServerMetadata };
        }
      }
    }

    // Validate we have minimum required fields
    if (this.isValidAuthServerMetadata(metadata)) {
      return metadata as OAuthServerMetadata;
    }

    return null;
  }

  /**
   * Fetch metadata from a URL
   */
  private async fetchMetadata(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: "GET",
        url,
        headers: {
          Accept: "application/json",
          "User-Agent": "MCP-Router/1.0",
        },
      });

      let responseData = "";

      request.on("response", (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
          );
          return;
        }

        response.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        response.on("end", () => {
          try {
            const data = JSON.parse(responseData);
            resolve(data);
          } catch (error) {
            reject(new Error("Invalid JSON response"));
          }
        });

        response.on("error", (error) => {
          reject(error);
        });
      });

      request.on("error", (error) => {
        reject(error);
      });

      // Set timeout
      request.on("close", () => {
        // Handle close event if needed
      });

      request.end();
    });
  }

  /**
   * Validate authorization server metadata
   */
  private isValidAuthServerMetadata(metadata: any): boolean {
    return (
      metadata &&
      typeof metadata === "object" &&
      typeof metadata.authorizationEndpoint === "string" &&
      typeof metadata.tokenEndpoint === "string"
    );
  }

  /**
   * Validate protected resource metadata
   */
  private isValidResourceMetadata(metadata: any): boolean {
    return (
      metadata &&
      typeof metadata === "object" &&
      Array.isArray(metadata.authorizationServers) &&
      metadata.authorizationServers.length > 0
    );
  }

  /**
   * Get cached metadata if still valid
   */
  private getCachedMetadata(key: string): any | null {
    const cached = this.metadataCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    // Remove expired cache
    if (cached) {
      this.metadataCache.delete(key);
    }

    return null;
  }

  /**
   * Cache metadata
   */
  private cacheMetadata(key: string, data: any): void {
    this.metadataCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear metadata cache
   */
  clearCache(): void {
    this.metadataCache.clear();
  }

  /**
   * Build authorization URL with parameters
   */
  buildAuthorizationUrl(
    authEndpoint: string,
    params: {
      clientId: string;
      redirectUri: string;
      scope: string;
      state: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
      responseType?: string;
      additionalParams?: Record<string, string>;
    },
  ): string {
    const url = new URL(authEndpoint);

    // Required parameters
    url.searchParams.append("client_id", params.clientId);
    url.searchParams.append("redirect_uri", params.redirectUri);
    url.searchParams.append("scope", params.scope);
    url.searchParams.append("state", params.state);
    url.searchParams.append("response_type", params.responseType || "code");

    // PKCE parameters
    if (params.codeChallenge) {
      url.searchParams.append("code_challenge", params.codeChallenge);
      url.searchParams.append(
        "code_challenge_method",
        params.codeChallengeMethod || "S256",
      );
    }

    // Additional parameters
    if (params.additionalParams) {
      Object.entries(params.additionalParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    return url.toString();
  }
}

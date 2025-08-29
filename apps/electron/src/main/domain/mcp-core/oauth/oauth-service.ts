/**
 * OAuth Service - Main orchestrator for OAuth functionality
 * Coordinates between discovery, flow, token management, and registration services
 */

import {
  OAuthConfig,
  OAuthToken,
  OAuthProvider,
  OAuthGrantType,
  OAuthStatus,
  OAuthFlowResult,
  OAuthServerMetadata,
} from "./oauth-types";
import { OAuthDiscoveryService } from "./oauth-discovery";
import { OAuthFlowService } from "./oauth-flow";
import { TokenManagerService } from "./token-manager";
import { ClientRegistrationService } from "./client-registration";
import { getServerOAuthRepository } from "../../../infrastructure/database";
import { OAuthSecurityService, OAuthSecurityEvent } from "./oauth-security";
import { OAuthBackupService } from "./oauth-backup";
import { OAuthMigrationService } from "./oauth-migration";
import { v4 as uuidv4 } from "uuid";

export class OAuthService {
  private static instance: OAuthService | null = null;

  private discoveryService: OAuthDiscoveryService;
  private flowService: OAuthFlowService;
  private tokenManager: TokenManagerService;
  private registrationService: ClientRegistrationService;
  private securityService: OAuthSecurityService;
  private backupService: OAuthBackupService;
  private migrationService: OAuthMigrationService;

  private constructor() {
    this.discoveryService = new OAuthDiscoveryService();
    this.flowService = new OAuthFlowService();
    this.tokenManager = new TokenManagerService();
    this.registrationService = new ClientRegistrationService();
    this.securityService = OAuthSecurityService.getInstance();
    this.backupService = OAuthBackupService.getInstance();
    this.migrationService = OAuthMigrationService.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): OAuthService {
    if (!OAuthService.instance) {
      OAuthService.instance = new OAuthService();
    }
    return OAuthService.instance;
  }

  /**
   * Configure OAuth for a server
   */
  async configureOAuth(
    serverId: string,
    provider: OAuthProvider,
    config: Partial<OAuthConfig>,
  ): Promise<OAuthConfig> {
    const oauthRepo = getServerOAuthRepository();

    // Build complete configuration
    const fullConfig: OAuthConfig = {
      id: config.id || uuidv4(),
      serverId,
      provider,
      authServerUrl: config.authServerUrl,
      clientId: config.clientId || "",
      clientSecret: config.clientSecret,
      scopes: config.scopes || [],
      grantType: config.grantType || OAuthGrantType.AUTHORIZATION_CODE,
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      revocationEndpoint: config.revocationEndpoint,
      introspectionEndpoint: config.introspectionEndpoint,
      userInfoEndpoint: config.userInfoEndpoint,
      usePKCE: config.usePKCE !== false,
      dynamicRegistration: config.dynamicRegistration,
      audience: config.audience,
      additionalParams: config.additionalParams,
    };

    // Discover endpoints if not provided
    if (!fullConfig.authorizationEndpoint || !fullConfig.tokenEndpoint) {
      const metadata = await this.discoverEndpoints(
        config.authServerUrl || serverId,
        provider,
      );

      if (metadata) {
        fullConfig.authorizationEndpoint =
          fullConfig.authorizationEndpoint || metadata.authorizationEndpoint;
        fullConfig.tokenEndpoint =
          fullConfig.tokenEndpoint || metadata.tokenEndpoint;
        fullConfig.revocationEndpoint =
          fullConfig.revocationEndpoint || metadata.revocationEndpoint;
        fullConfig.introspectionEndpoint =
          fullConfig.introspectionEndpoint || metadata.introspectionEndpoint;
        fullConfig.userInfoEndpoint =
          fullConfig.userInfoEndpoint || metadata.userInfoEndpoint;
      }
    }

    // Check if dynamic registration is needed
    if (
      await this.registrationService.shouldRegisterClient(
        fullConfig,
        fullConfig.authServerUrl,
      )
    ) {
      try {
        const registration = await this.registrationService.registerClient(
          fullConfig.authServerUrl!,
          fullConfig,
        );

        fullConfig.clientId = registration.clientId;
        fullConfig.clientSecret = registration.clientSecret;

        this.securityService.logSecurityEvent({
          eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
          severity: "info",
          serverId,
          details: {
            action: "dynamic_registration",
            provider,
            success: true,
          },
        });
      } catch (error) {
        console.error("Dynamic registration failed:", error);

        this.securityService.logSecurityEvent({
          eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
          severity: "warning",
          serverId,
          details: {
            action: "dynamic_registration",
            provider,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
        // Continue without registration
      }
    }

    // Save configuration
    const savedConfig = oauthRepo.saveConfig(fullConfig);

    this.securityService.logSecurityEvent({
      eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
      severity: "info",
      serverId,
      details: {
        action: "config_saved",
        provider,
        scopes: fullConfig.scopes,
        grantType: fullConfig.grantType,
        usePKCE: fullConfig.usePKCE,
        dynamicRegistration: fullConfig.dynamicRegistration,
      },
    });

    return savedConfig;
  }

  /**
   * Authenticate with OAuth server
   */
  async authenticate(
    serverId: string,
    scopes?: string[],
  ): Promise<OAuthFlowResult> {
    const oauthRepo = getServerOAuthRepository();
    const config = oauthRepo.getConfigByServerId(serverId);

    // Log authentication start
    this.securityService.logSecurityEvent({
      eventType: OAuthSecurityEvent.AUTHENTICATION_STARTED,
      severity: "info",
      serverId,
      details: {
        scopes: scopes || config?.scopes || [],
        provider: config?.provider,
      },
    });

    if (!config) {
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.AUTHENTICATION_FAILED,
        severity: "warning",
        serverId,
        details: {
          error: "not_configured",
          errorDescription: "OAuth not configured for this server",
        },
      });

      return {
        success: false,
        error: {
          error: "not_configured",
          errorDescription: "OAuth not configured for this server",
        },
      };
    }

    if (!config.authorizationEndpoint || !config.tokenEndpoint) {
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.AUTHENTICATION_FAILED,
        severity: "warning",
        serverId,
        details: {
          error: "incomplete_config",
          errorDescription: "OAuth endpoints not configured",
        },
      });

      return {
        success: false,
        error: {
          error: "incomplete_config",
          errorDescription: "OAuth endpoints not configured",
        },
      };
    }

    // Check rate limit
    const rateLimitKey = `auth:${serverId}`;
    const rateLimit = this.securityService.checkRateLimit(
      rateLimitKey,
      this.securityService["rateLimits"].maxAuthAttemptsPerDay,
      24 * 60 * 60 * 1000, // 24 hours
    );

    if (!rateLimit.allowed) {
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.RATE_LIMIT_EXCEEDED,
        severity: "warning",
        serverId,
        details: {
          type: "authentication",
          resetTime: rateLimit.resetTime,
        },
      });

      return {
        success: false,
        error: {
          error: "rate_limit_exceeded",
          errorDescription:
            "Too many authentication attempts. Please try again later.",
        },
      };
    }

    // Initiate OAuth flow
    const result = await this.flowService.initiateAuthFlow(
      config,
      config.authorizationEndpoint,
      scopes,
    );

    if (result.success && result.token) {
      // Store token
      await this.tokenManager.storeToken(serverId, result.token);

      // Log successful authentication
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.AUTHENTICATION_COMPLETED,
        severity: "info",
        serverId,
        details: {
          provider: config.provider,
          scopes: result.token.scopes || scopes || [],
          tokenType: result.token.tokenType,
          expiresIn: result.token.expiresIn,
        },
      });
    } else {
      // Log failed authentication
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.AUTHENTICATION_FAILED,
        severity: "error",
        serverId,
        details: {
          error: result.error?.error || "unknown",
          errorDescription: result.error?.errorDescription,
        },
      });
    }

    return result;
  }

  /**
   * Get valid access token for a server
   */
  async getAccessToken(serverId: string): Promise<string | null> {
    return this.tokenManager.getValidToken(serverId);
  }

  /**
   * Refresh access token
   */
  async refreshToken(serverId: string): Promise<OAuthToken | null> {
    const oauthRepo = getServerOAuthRepository();
    const config = oauthRepo.getConfigByServerId(serverId);
    const token = oauthRepo.getTokenByServerId(serverId);

    if (!config || !token) {
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.TOKEN_VALIDATION_FAILED,
        severity: "warning",
        serverId,
        details: {
          reason: !config ? "no_config" : "no_token",
        },
      });
      return null;
    }

    // Check rate limit for refresh
    const rateLimitKey = `refresh:${serverId}`;
    const rateLimit = this.securityService.checkRateLimit(
      rateLimitKey,
      30, // 30 refreshes per hour
      60 * 60 * 1000, // 1 hour
    );

    if (!rateLimit.allowed) {
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.RATE_LIMIT_EXCEEDED,
        severity: "warning",
        serverId,
        details: {
          type: "token_refresh",
          resetTime: rateLimit.resetTime,
        },
      });
      return null;
    }

    try {
      const refreshedToken = await this.tokenManager.refreshToken(
        config,
        token,
      );

      if (refreshedToken) {
        this.securityService.logSecurityEvent({
          eventType: OAuthSecurityEvent.TOKEN_REFRESHED,
          severity: "info",
          serverId,
          details: {
            provider: config.provider,
            expiresIn: refreshedToken.expiresIn,
            refreshCount: refreshedToken.refreshCount || 0,
          },
        });
      } else {
        this.securityService.logSecurityEvent({
          eventType: OAuthSecurityEvent.TOKEN_VALIDATION_FAILED,
          severity: "error",
          serverId,
          details: {
            reason: "refresh_failed",
          },
        });
      }

      return refreshedToken;
    } catch (error) {
      console.error("Token refresh failed:", error);

      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.TOKEN_VALIDATION_FAILED,
        severity: "error",
        serverId,
        details: {
          reason: "refresh_error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      return null;
    }
  }

  /**
   * Revoke OAuth access for a server
   */
  async revokeAccess(serverId: string): Promise<boolean> {
    try {
      const result = await this.tokenManager.revokeToken(serverId);

      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.TOKEN_REVOKED,
        severity: "info",
        serverId,
        details: {
          success: result,
          reason: "manual_revocation",
        },
      });

      return result;
    } catch (error) {
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.TOKEN_REVOKED,
        severity: "error",
        serverId,
        details: {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      return false;
    }
  }

  /**
   * Get OAuth status for a server
   */
  async getOAuthStatus(serverId: string): Promise<OAuthStatus> {
    const oauthRepo = getServerOAuthRepository();
    const config = oauthRepo.getConfigByServerId(serverId);
    const token = oauthRepo.getTokenByServerId(serverId);

    if (!config) {
      return {
        authenticated: false,
        error: "Not configured",
      };
    }

    if (!token) {
      return {
        authenticated: false,
        provider: config.provider,
        error: "Not authenticated",
      };
    }

    // Check token validity
    const isValid = await this.tokenManager.validateToken(
      config,
      token.accessToken,
    );

    return {
      authenticated: isValid,
      expiresAt: token.expiresAt,
      lastRefresh: token.updatedAt,
      provider: config.provider,
      scopes: token.scopes,
      error: isValid ? undefined : "Token invalid or expired",
    };
  }

  /**
   * Discover OAuth endpoints
   */
  async discoverEndpoints(
    serverUrl: string,
    provider?: OAuthProvider,
  ): Promise<OAuthServerMetadata | null> {
    return this.discoveryService.discoverCompleteMetadata(serverUrl, provider);
  }

  /**
   * Update OAuth configuration
   */
  async updateConfiguration(
    serverId: string,
    updates: Partial<OAuthConfig>,
  ): Promise<OAuthConfig | null> {
    const oauthRepo = getServerOAuthRepository();
    const existing = oauthRepo.getConfigByServerId(serverId);

    if (!existing) {
      return null;
    }

    const updated: OAuthConfig = {
      ...existing,
      ...updates,
      serverId, // Ensure serverId doesn't change
      id: existing.id, // Ensure id doesn't change
    };

    return oauthRepo.saveConfig(updated);
  }

  /**
   * Remove OAuth configuration
   */
  async removeConfiguration(serverId: string): Promise<boolean> {
    const oauthRepo = getServerOAuthRepository();

    // Get configuration before deletion for logging
    const config = oauthRepo.getConfigByServerId(serverId);
    const provider = config?.provider;

    // Revoke token first
    await this.revokeAccess(serverId);

    // Delete client registration if exists
    if (config?.additionalParams?.registrationClientUri) {
      try {
        await this.registrationService.deleteClientRegistration(serverId);

        this.securityService.logSecurityEvent({
          eventType: OAuthSecurityEvent.CONFIGURATION_DELETED,
          severity: "info",
          serverId,
          details: {
            action: "client_registration_deleted",
            provider,
          },
        });
      } catch (error) {
        this.securityService.logSecurityEvent({
          eventType: OAuthSecurityEvent.CONFIGURATION_DELETED,
          severity: "warning",
          serverId,
          details: {
            action: "client_registration_delete_failed",
            provider,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    // Delete configuration
    const result = oauthRepo.deleteConfig(serverId);

    this.securityService.logSecurityEvent({
      eventType: OAuthSecurityEvent.CONFIGURATION_DELETED,
      severity: "info",
      serverId,
      details: {
        action: "config_deleted",
        provider,
        success: result,
      },
    });

    return result;
  }

  /**
   * Check if server has OAuth configured
   */
  hasOAuthConfiguration(serverId: string): boolean {
    const oauthRepo = getServerOAuthRepository();
    return oauthRepo.hasOAuthConfig(serverId);
  }

  /**
   * Check if server has valid token
   */
  hasValidToken(serverId: string): boolean {
    const oauthRepo = getServerOAuthRepository();
    return oauthRepo.hasValidToken(serverId);
  }

  /**
   * Get all OAuth configurations
   */
  getAllConfigurations(): OAuthConfig[] {
    const oauthRepo = getServerOAuthRepository();
    return oauthRepo.getAllConfigs();
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.tokenManager.cleanup();
    this.discoveryService.clearCache();
  }

  /**
   * Export OAuth configuration (without sensitive data)
   */
  exportConfiguration(serverId: string): Partial<OAuthConfig> | null {
    const oauthRepo = getServerOAuthRepository();
    const config = oauthRepo.getConfigByServerId(serverId);

    if (!config) {
      return null;
    }

    // Return config without sensitive fields
    const { clientSecret, ...safeConfig } = config;
    return {
      ...safeConfig,
      additionalParams: config.additionalParams
        ? Object.fromEntries(
            Object.entries(config.additionalParams).filter(
              ([key]) =>
                !key.toLowerCase().includes("token") &&
                !key.toLowerCase().includes("secret"),
            ),
          )
        : undefined,
    };
  }

  /**
   * Import OAuth configuration
   */
  async importConfiguration(
    serverId: string,
    importedConfig: Partial<OAuthConfig>,
  ): Promise<OAuthConfig> {
    // Merge with existing or create new
    const oauthRepo = getServerOAuthRepository();
    const existing = oauthRepo.getConfigByServerId(serverId);

    const config: OAuthConfig = {
      id: existing?.id || uuidv4(),
      serverId,
      provider: importedConfig.provider || OAuthProvider.CUSTOM,
      authServerUrl: importedConfig.authServerUrl,
      clientId: importedConfig.clientId || existing?.clientId || "",
      clientSecret: existing?.clientSecret, // Keep existing secret
      scopes: importedConfig.scopes || [],
      grantType: importedConfig.grantType || OAuthGrantType.AUTHORIZATION_CODE,
      authorizationEndpoint: importedConfig.authorizationEndpoint,
      tokenEndpoint: importedConfig.tokenEndpoint,
      revocationEndpoint: importedConfig.revocationEndpoint,
      introspectionEndpoint: importedConfig.introspectionEndpoint,
      userInfoEndpoint: importedConfig.userInfoEndpoint,
      usePKCE: importedConfig.usePKCE !== false,
      dynamicRegistration: importedConfig.dynamicRegistration,
      audience: importedConfig.audience,
      additionalParams: importedConfig.additionalParams,
    };

    return oauthRepo.saveConfig(config);
  }
}

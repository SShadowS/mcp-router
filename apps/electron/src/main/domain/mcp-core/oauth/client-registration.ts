/**
 * Dynamic Client Registration Service
 * Implements OAuth 2.0 Dynamic Client Registration Protocol (RFC 7591)
 */

import { net, app } from "electron";
import {
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  OAuthConfig,
  OAuthProvider,
} from "./oauth-types";
import { getServerOAuthRepository } from "../../../infrastructure/database";

export class ClientRegistrationService {
  private readonly APP_NAME = "MCP Router";
  private readonly APP_VERSION = app.getVersion();
  private readonly APP_URI = "https://github.com/Datalite-Labs/mcp-router";

  // Default redirect URIs for desktop app
  private readonly REDIRECT_URIS = [
    "http://localhost:42424/oauth/callback",
    "http://127.0.0.1:42424/oauth/callback",
    "urn:ietf:wg:oauth:2.0:oob", // Out-of-band for desktop apps
  ];

  /**
   * Register a new OAuth client dynamically
   */
  async registerClient(
    registrationEndpoint: string,
    config: Partial<OAuthConfig>,
    initialAccessToken?: string,
  ): Promise<ClientRegistrationResponse> {
    const request = this.buildRegistrationRequest(config);

    try {
      const response = await this.sendRegistrationRequest(
        registrationEndpoint,
        request,
        initialAccessToken,
      );

      // Save the registered client info
      if (response.clientId && config.serverId) {
        await this.saveRegisteredClient(config.serverId, response);
      }

      return response;
    } catch (error) {
      console.error("Client registration failed:", error);
      throw error;
    }
  }

  /**
   * Check if dynamic registration is needed and supported
   */
  async shouldRegisterClient(
    config: OAuthConfig,
    registrationEndpoint?: string,
  ): Promise<boolean> {
    // Don't register if we already have client credentials
    if (
      config.clientId &&
      (config.clientSecret || config.grantType === "authorization_code")
    ) {
      return false;
    }

    // Check if server supports dynamic registration
    return !!registrationEndpoint && config.dynamicRegistration !== false;
  }

  /**
   * Build registration request based on configuration
   */
  private buildRegistrationRequest(
    config: Partial<OAuthConfig>,
  ): ClientRegistrationRequest {
    const request: ClientRegistrationRequest = {
      clientName: `${this.APP_NAME} - ${config.serverId || "MCP Server"}`,
      clientUri: this.APP_URI,
      redirectUris: this.REDIRECT_URIS,
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      scope: config.scopes?.join(" "),
      tokenEndpointAuthMethod: config.clientSecret
        ? "client_secret_basic"
        : "none",
      softwareId: "mcp-router",
      softwareVersion: this.APP_VERSION,
      contacts: ["support@mcp-router.io"],
    };

    // Add provider-specific settings
    if (config.provider === OAuthProvider.GITHUB) {
      request.logoUri = "https://github.com/fluidicon.png";
    }

    // Add PKCE support indication
    if (config.usePKCE !== false) {
      request.tokenEndpointAuthMethod = "none"; // PKCE doesn't require client secret
    }

    return request;
  }

  /**
   * Send registration request to the authorization server
   */
  private async sendRegistrationRequest(
    endpoint: string,
    request: ClientRegistrationRequest,
    initialAccessToken?: string,
  ): Promise<ClientRegistrationResponse> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": `${this.APP_NAME}/${this.APP_VERSION}`,
      };

      // Add initial access token if provided
      if (initialAccessToken) {
        headers["Authorization"] = `Bearer ${initialAccessToken}`;
      }

      const netRequest = net.request({
        method: "POST",
        url: endpoint,
        headers,
      });

      let responseData = "";

      netRequest.on("response", (response) => {
        response.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        response.on("end", () => {
          try {
            const data = JSON.parse(responseData);

            if (response.statusCode !== 201 && response.statusCode !== 200) {
              reject(
                new Error(
                  data.error_description ||
                    data.error ||
                    `Registration failed with status ${response.statusCode}`,
                ),
              );
              return;
            }

            // Map response to ClientRegistrationResponse
            const registrationResponse: ClientRegistrationResponse = {
              clientId: data.client_id,
              clientSecret: data.client_secret,
              clientIdIssuedAt: data.client_id_issued_at,
              clientSecretExpiresAt: data.client_secret_expires_at,
              redirectUris: data.redirect_uris || this.REDIRECT_URIS,
              tokenEndpointAuthMethod: data.token_endpoint_auth_method,
              grantTypes: data.grant_types,
              responseTypes: data.response_types,
              clientName: data.client_name,
              clientUri: data.client_uri,
              logoUri: data.logo_uri,
              scope: data.scope,
              contacts: data.contacts,
              tosUri: data.tos_uri,
              policyUri: data.policy_uri,
              registrationAccessToken: data.registration_access_token,
              registrationClientUri: data.registration_client_uri,
            };

            resolve(registrationResponse);
          } catch (error) {
            reject(new Error("Invalid registration response"));
          }
        });

        response.on("error", (error) => {
          reject(error);
        });
      });

      netRequest.on("error", (error) => {
        reject(error);
      });

      netRequest.write(JSON.stringify(request));
      netRequest.end();
    });
  }

  /**
   * Save registered client information
   */
  private async saveRegisteredClient(
    serverId: string,
    response: ClientRegistrationResponse,
  ): Promise<void> {
    const oauthRepo = getServerOAuthRepository();

    // Get existing config
    const existingConfig = oauthRepo.getConfigByServerId(serverId);
    if (!existingConfig) {
      console.error(`No OAuth config found for server ${serverId}`);
      return;
    }

    // Update with registered client info
    const updatedConfig: OAuthConfig = {
      ...existingConfig,
      clientId: response.clientId,
      clientSecret: response.clientSecret || existingConfig.clientSecret,
      additionalParams: {
        ...existingConfig.additionalParams,
        ...(response.registrationAccessToken && {
          registrationAccessToken: response.registrationAccessToken,
        }),
        ...(response.registrationClientUri && {
          registrationClientUri: response.registrationClientUri,
        }),
        ...(response.clientSecretExpiresAt && {
          clientSecretExpiresAt: response.clientSecretExpiresAt.toString(),
        }),
      },
    };

    // Save updated config
    oauthRepo.saveConfig(updatedConfig);

    // Set reminder for client secret expiry if applicable
    if (response.clientSecretExpiresAt) {
      this.scheduleSecretRenewal(serverId, response.clientSecretExpiresAt);
    }
  }

  /**
   * Update client registration
   */
  async updateClientRegistration(
    serverId: string,
    updates: Partial<ClientRegistrationRequest>,
  ): Promise<ClientRegistrationResponse> {
    const oauthRepo = getServerOAuthRepository();
    const config = oauthRepo.getConfigByServerId(serverId);

    if (!config || !config.additionalParams?.registrationClientUri) {
      throw new Error("No registration information found for this server");
    }

    const registrationAccessToken =
      config.additionalParams.registrationAccessToken;
    if (!registrationAccessToken) {
      throw new Error("No registration access token available");
    }

    // Build update request
    const request: ClientRegistrationRequest = {
      ...this.buildRegistrationRequest(config),
      ...updates,
    };

    // Send update request
    const response = await this.sendUpdateRequest(
      config.additionalParams.registrationClientUri,
      request,
      registrationAccessToken,
    );

    // Save updated client info
    await this.saveRegisteredClient(serverId, response);

    return response;
  }

  /**
   * Send update request to registration endpoint
   */
  private async sendUpdateRequest(
    endpoint: string,
    request: ClientRegistrationRequest,
    accessToken: string,
  ): Promise<ClientRegistrationResponse> {
    return new Promise((resolve, reject) => {
      const netRequest = net.request({
        method: "PUT",
        url: endpoint,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": `${this.APP_NAME}/${this.APP_VERSION}`,
        },
      });

      let responseData = "";

      netRequest.on("response", (response) => {
        response.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        response.on("end", () => {
          try {
            const data = JSON.parse(responseData);

            if (response.statusCode !== 200) {
              reject(
                new Error(
                  data.error_description ||
                    data.error ||
                    `Update failed with status ${response.statusCode}`,
                ),
              );
              return;
            }

            resolve(data as ClientRegistrationResponse);
          } catch (error) {
            reject(new Error("Invalid update response"));
          }
        });

        response.on("error", reject);
      });

      netRequest.on("error", reject);
      netRequest.write(JSON.stringify(request));
      netRequest.end();
    });
  }

  /**
   * Delete client registration
   */
  async deleteClientRegistration(serverId: string): Promise<boolean> {
    const oauthRepo = getServerOAuthRepository();
    const config = oauthRepo.getConfigByServerId(serverId);

    if (!config || !config.additionalParams?.registrationClientUri) {
      return false;
    }

    const registrationAccessToken =
      config.additionalParams.registrationAccessToken;
    if (!registrationAccessToken) {
      return false;
    }

    try {
      await this.sendDeleteRequest(
        config.additionalParams.registrationClientUri,
        registrationAccessToken,
      );

      // Clear client credentials from config
      const updatedConfig: OAuthConfig = {
        ...config,
        clientId: "",
        clientSecret: undefined,
        additionalParams: {
          ...config.additionalParams,
        },
      };

      // Remove registration fields
      delete updatedConfig.additionalParams?.registrationAccessToken;
      delete updatedConfig.additionalParams?.registrationClientUri;

      oauthRepo.saveConfig(updatedConfig);
      return true;
    } catch (error) {
      console.error("Failed to delete client registration:", error);
      return false;
    }
  }

  /**
   * Send delete request to registration endpoint
   */
  private async sendDeleteRequest(
    endpoint: string,
    accessToken: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: "DELETE",
        url: endpoint,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": `${this.APP_NAME}/${this.APP_VERSION}`,
        },
      });

      request.on("response", (response) => {
        if (response.statusCode === 204 || response.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Delete failed with status ${response.statusCode}`));
        }
      });

      request.on("error", reject);
      request.end();
    });
  }

  /**
   * Schedule client secret renewal reminder
   */
  private scheduleSecretRenewal(serverId: string, expiresAt: number): void {
    const now = Date.now() / 1000; // Convert to seconds
    const timeUntilExpiry = (expiresAt - now) * 1000; // Convert back to ms

    // Remind 7 days before expiry
    const reminderTime = timeUntilExpiry - 7 * 24 * 60 * 60 * 1000;

    if (reminderTime > 0) {
      setTimeout(() => {
        console.warn(
          `Client secret for server ${serverId} will expire in 7 days`,
        );
        // TODO: Notify user through UI
      }, reminderTime);
    }
  }
}

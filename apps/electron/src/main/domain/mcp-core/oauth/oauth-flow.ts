/**
 * OAuth Flow Service
 * Handles OAuth 2.1 authorization flows including PKCE
 */

import { BrowserWindow, shell, app, net } from "electron";
import * as http from "http";
import { URL } from "url";
import {
  OAuthConfig,
  OAuthToken,
  OAuthAuthState,
  OAuthGrantType,
  TokenRequest,
  TokenResponse,
  OAuthError,
  OAuthFlowResult,
  OAUTH_CONSTANTS,
} from "./oauth-types";
import {
  generateSecureRandom,
  generateCodeChallenge,
} from "./oauth-encryption";
import { getServerOAuthRepository } from "../../../infrastructure/database";

export class OAuthFlowService {
  private authWindow: BrowserWindow | null = null;
  private localServer: http.Server | null = null;
  private authStateMap: Map<string, OAuthAuthState> = new Map();

  // Local redirect URI for desktop app
  private readonly REDIRECT_PORT = 42424;
  private readonly REDIRECT_PATH = "/oauth/callback";
  private readonly REDIRECT_URI = `http://localhost:${this.REDIRECT_PORT}${this.REDIRECT_PATH}`;

  /**
   * Initiate OAuth authorization flow
   */
  async initiateAuthFlow(
    config: OAuthConfig,
    authorizationEndpoint: string,
    scopes?: string[],
  ): Promise<OAuthFlowResult> {
    try {
      // Generate state and PKCE parameters
      const state = generateSecureRandom(OAUTH_CONSTANTS.STATE_LENGTH);
      const codeVerifier =
        config.usePKCE !== false
          ? generateSecureRandom(OAUTH_CONSTANTS.VERIFIER_LENGTH)
          : undefined;
      const codeChallenge = codeVerifier
        ? generateCodeChallenge(codeVerifier)
        : undefined;

      // Store auth state
      const authState: OAuthAuthState = {
        serverId: config.serverId,
        state,
        codeVerifier,
        codeChallenge,
        redirectUri: this.REDIRECT_URI,
        scopes: scopes || config.scopes,
        createdAt: Date.now(),
      };

      this.authStateMap.set(state, authState);

      // Also persist to database for recovery
      const oauthRepo = getServerOAuthRepository();
      oauthRepo.saveAuthState(authState);

      // Build authorization URL
      const authUrl = this.buildAuthorizationUrl(authorizationEndpoint, {
        clientId: config.clientId,
        redirectUri: this.REDIRECT_URI,
        scope: (scopes || config.scopes).join(" "),
        state,
        codeChallenge,
        codeChallengeMethod: codeChallenge ? "S256" : undefined,
        responseType: "code",
        additionalParams: config.additionalParams,
      });

      // Start local server to receive callback
      await this.startCallbackServer();

      // Open authorization URL
      const code = await this.openAuthWindow(authUrl, state);

      if (!code) {
        throw new Error("Authorization cancelled or failed");
      }

      // Exchange code for token
      const token = await this.exchangeCodeForToken(config, code, codeVerifier);

      return {
        success: true,
        token,
      };
    } catch (error) {
      console.error("OAuth flow failed:", error);
      return {
        success: false,
        error: {
          error: "flow_failed",
          errorDescription:
            error instanceof Error ? error.message : "Unknown error",
        },
      };
    } finally {
      this.cleanup();
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(
    url: string,
  ): Promise<{ code: string; state: string } | OAuthError> {
    const parsedUrl = new URL(url);

    // Check for error response
    const error = parsedUrl.searchParams.get("error");
    if (error) {
      return {
        error,
        errorDescription:
          parsedUrl.searchParams.get("error_description") || undefined,
        errorUri: parsedUrl.searchParams.get("error_uri") || undefined,
        state: parsedUrl.searchParams.get("state") || undefined,
      };
    }

    // Extract code and state
    const code = parsedUrl.searchParams.get("code");
    const state = parsedUrl.searchParams.get("state");

    if (!code || !state) {
      return {
        error: "invalid_request",
        errorDescription: "Missing code or state parameter",
      };
    }

    return { code, state };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForToken(
    config: OAuthConfig,
    code: string,
    codeVerifier?: string,
  ): Promise<OAuthToken> {
    const tokenRequest: TokenRequest = {
      grantType: OAuthGrantType.AUTHORIZATION_CODE,
      code,
      redirectUri: this.REDIRECT_URI,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      codeVerifier,
      scope: config.scopes.join(" "),
      audience: config.audience,
    };

    const tokenResponse = await this.makeTokenRequest(
      config.tokenEndpoint!,
      tokenRequest,
    );

    // Create OAuth token from response
    const token: OAuthToken = {
      serverId: config.serverId,
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      idToken: tokenResponse.idToken,
      tokenType: tokenResponse.tokenType,
      expiresAt: tokenResponse.expiresIn
        ? Date.now() + tokenResponse.expiresIn * 1000
        : undefined,
      scopes: tokenResponse.scope?.split(" "),
      issuedAt: Date.now(),
    };

    // Save token to database
    const oauthRepo = getServerOAuthRepository();
    return oauthRepo.saveToken(token);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    config: OAuthConfig,
    refreshToken: string,
  ): Promise<OAuthToken> {
    const tokenRequest: TokenRequest = {
      grantType: OAuthGrantType.REFRESH_TOKEN,
      refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scope: config.scopes.join(" "),
    };

    const tokenResponse = await this.makeTokenRequest(
      config.tokenEndpoint!,
      tokenRequest,
    );

    // Update token
    const token: OAuthToken = {
      serverId: config.serverId,
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken || refreshToken, // Keep old refresh token if not returned
      tokenType: tokenResponse.tokenType,
      expiresAt: tokenResponse.expiresIn
        ? Date.now() + tokenResponse.expiresIn * 1000
        : undefined,
      scopes: tokenResponse.scope?.split(" "),
      issuedAt: Date.now(),
    };

    // Save updated token
    const oauthRepo = getServerOAuthRepository();
    oauthRepo.incrementRefreshCount(config.serverId);
    return oauthRepo.saveToken(token);
  }

  /**
   * Make token request to token endpoint
   */
  private async makeTokenRequest(
    tokenEndpoint: string,
    request: TokenRequest,
  ): Promise<TokenResponse> {
    return new Promise((resolve, reject) => {
      const formData = new URLSearchParams();

      // Add grant type
      formData.append("grant_type", request.grantType);

      // Add parameters based on grant type
      if (request.code) formData.append("code", request.code);
      if (request.redirectUri)
        formData.append("redirect_uri", request.redirectUri);
      if (request.codeVerifier)
        formData.append("code_verifier", request.codeVerifier);
      if (request.refreshToken)
        formData.append("refresh_token", request.refreshToken);
      if (request.scope) formData.append("scope", request.scope);
      if (request.audience) formData.append("audience", request.audience);

      // Client authentication
      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "MCP-Router/1.0",
      };

      // Use basic auth if client secret is provided
      if (request.clientSecret) {
        const auth = Buffer.from(
          `${request.clientId}:${request.clientSecret}`,
        ).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      } else {
        // Otherwise include client_id in body
        formData.append("client_id", request.clientId);
      }

      const netRequest = net.request({
        method: "POST",
        url: tokenEndpoint,
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

            if (response.statusCode !== 200) {
              reject(
                new Error(
                  data.error_description ||
                    data.error ||
                    "Token request failed",
                ),
              );
              return;
            }

            // Map response to TokenResponse
            const tokenResponse: TokenResponse = {
              accessToken: data.access_token,
              tokenType: data.token_type,
              expiresIn: data.expires_in,
              refreshToken: data.refresh_token,
              scope: data.scope,
              idToken: data.id_token,
              ...data, // Include any additional fields
            };

            resolve(tokenResponse);
          } catch (error) {
            reject(new Error("Invalid token response"));
          }
        });

        response.on("error", (error) => {
          reject(error);
        });
      });

      netRequest.on("error", (error) => {
        reject(error);
      });

      netRequest.write(formData.toString());
      netRequest.end();
    });
  }

  /**
   * Open browser window for authorization
   */
  private async openAuthWindow(
    authUrl: string,
    state: string,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      // Create browser window
      this.authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        show: false,
      });

      // Load authorization URL
      this.authWindow.loadURL(authUrl);
      this.authWindow.show();

      // Set up timeout
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error("Authorization timeout"));
      }, OAUTH_CONSTANTS.AUTH_TIMEOUT);

      // Listen for redirect
      this.authWindow.webContents.on("will-redirect", async (event, url) => {
        if (url.startsWith(this.REDIRECT_URI)) {
          event.preventDefault();
          clearTimeout(timeout);

          const result = await this.handleCallback(url);

          if ("error" in result) {
            this.cleanup();
            reject(new Error(result.errorDescription || result.error));
          } else if (result.state === state) {
            this.cleanup();
            resolve(result.code);
          } else {
            this.cleanup();
            reject(new Error("State mismatch"));
          }
        }
      });

      // Handle window closed
      this.authWindow.on("closed", () => {
        clearTimeout(timeout);
        this.authWindow = null;
        resolve(null); // User cancelled
      });
    });
  }

  /**
   * Start local HTTP server for callback
   */
  private async startCallbackServer(): Promise<void> {
    return new Promise((resolve) => {
      this.localServer = http.createServer((req, res) => {
        if (req.url?.startsWith(this.REDIRECT_PATH)) {
          // Send success response to browser
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>Authorization Successful</h1>
                <p>You can close this window and return to MCP Router.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);

          // Close auth window if still open
          if (this.authWindow && !this.authWindow.isDestroyed()) {
            this.authWindow.close();
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.localServer.listen(this.REDIRECT_PORT, "localhost", () => {
        resolve();
      });
    });
  }

  /**
   * Build authorization URL
   */
  private buildAuthorizationUrl(
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

    Object.entries(params).forEach(([key, value]) => {
      if (value && key !== "additionalParams" && typeof value === "string") {
        // Convert camelCase to snake_case
        const paramKey = key.replace(
          /[A-Z]/g,
          (letter) => `_${letter.toLowerCase()}`,
        );
        url.searchParams.append(paramKey, value);
      }
    });

    // Add additional parameters
    if (params.additionalParams) {
      Object.entries(params.additionalParams).forEach(([key, value]) => {
        if (typeof value === "string") {
          url.searchParams.append(key, value);
        }
      });
    }

    return url.toString();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Close auth window
    if (this.authWindow && !this.authWindow.isDestroyed()) {
      this.authWindow.close();
    }
    this.authWindow = null;

    // Stop local server
    if (this.localServer) {
      this.localServer.close();
      this.localServer = null;
    }

    // Clear auth states older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [state, authState] of this.authStateMap.entries()) {
      if (authState.createdAt < oneHourAgo) {
        this.authStateMap.delete(state);
      }
    }
  }

  /**
   * Validate and retrieve auth state
   */
  validateAuthState(state: string): OAuthAuthState | null {
    const authState = this.authStateMap.get(state);

    if (!authState) {
      // Try to retrieve from database
      const oauthRepo = getServerOAuthRepository();
      return oauthRepo.getAndDeleteAuthState(state);
    }

    // Remove from memory map
    this.authStateMap.delete(state);

    return authState;
  }
}

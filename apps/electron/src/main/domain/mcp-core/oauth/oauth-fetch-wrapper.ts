/**
 * OAuth-aware fetch wrapper that handles token refresh on 401 responses
 */

import { OAuthTokenInjector } from "./oauth-token-injector";

export interface OAuthFetchOptions {
  serverId: string;
  maxRetries?: number;
}

/**
 * Create an OAuth-aware fetch function that automatically handles token refresh
 */
export function createOAuthFetch(options: OAuthFetchOptions): typeof fetch {
  const { serverId, maxRetries = 1 } = options;
  const tokenInjector = OAuthTokenInjector.getInstance();

  return async function oauthFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      // Inject OAuth token into headers
      const { headers: oauthHeaders } = await tokenInjector.injectToken(
        serverId,
        (init?.headers as Record<string, string>) || {},
      );

      // Make the request with OAuth headers
      const response = await fetch(input, {
        ...init,
        headers: oauthHeaders,
      });

      // If we get a 401, try to refresh the token
      if (response.status === 401 && retryCount < maxRetries) {
        console.log(
          `Got 401 for server ${serverId}, attempting token refresh...`,
        );

        const newToken = await tokenInjector.handleUnauthorized(serverId);
        if (newToken) {
          // Update headers with new token
          oauthHeaders["Authorization"] = `Bearer ${newToken}`;
          retryCount++;
          continue; // Retry the request
        }
      }

      return response;
    }

    // If we've exhausted retries, return the last response (likely a 401)
    return fetch(input, init);
  };
}

/**
 * Create an OAuth-aware EventSource for SSE connections
 */
export function createOAuthEventSource(
  url: string | URL,
  options: OAuthFetchOptions & EventSourceInit = { serverId: "" },
): EventSource {
  const { serverId, ...eventSourceInit } = options;

  // EventSource doesn't support custom headers directly,
  // so we need to add the token to the URL as a query parameter
  // or use a polyfill that supports headers

  // For now, we'll create a standard EventSource
  // In production, you might want to use a polyfill like 'eventsource'
  // that supports custom headers

  return new EventSource(url, eventSourceInit);
}

/**
 * Middleware for handling OAuth in MCP connections
 */
export class OAuthMiddleware {
  private tokenInjector: OAuthTokenInjector;

  constructor() {
    this.tokenInjector = OAuthTokenInjector.getInstance();
  }

  /**
   * Wrap a transport's fetch method to include OAuth handling
   */
  wrapTransportFetch(
    serverId: string,
    originalFetch: typeof fetch = fetch,
  ): typeof fetch {
    return createOAuthFetch({ serverId });
  }

  /**
   * Check if a server is properly authenticated
   */
  async isAuthenticated(serverId: string): Promise<boolean> {
    const health = await this.tokenInjector.getOAuthHealth(serverId);
    return health.configured && health.authenticated && health.tokenValid;
  }

  /**
   * Ensure a server is authenticated before connecting
   */
  async ensureAuthenticated(serverId: string): Promise<boolean> {
    const isAuth = await this.isAuthenticated(serverId);

    if (!isAuth) {
      const requiresOAuth = await this.tokenInjector.requiresOAuth(serverId);
      if (requiresOAuth) {
        console.warn(
          `Server ${serverId} requires OAuth authentication but is not authenticated`,
        );
        return false;
      }
    }

    return true;
  }
}

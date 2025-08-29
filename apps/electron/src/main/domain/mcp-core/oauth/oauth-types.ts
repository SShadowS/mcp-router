/**
 * OAuth authentication types and interfaces for MCP servers
 */

/**
 * OAuth grant types supported by MCP Router
 */
export enum OAuthGrantType {
  AUTHORIZATION_CODE = "authorization_code",
  CLIENT_CREDENTIALS = "client_credentials",
  REFRESH_TOKEN = "refresh_token",
}

/**
 * OAuth provider templates for common services
 */
export enum OAuthProvider {
  CUSTOM = "custom",
  GITHUB = "github",
  GOOGLE = "google",
  MICROSOFT = "microsoft",
  SLACK = "slack",
  GITLAB = "gitlab",
  BITBUCKET = "bitbucket",
}

/**
 * OAuth configuration for an MCP server
 */
export interface OAuthConfig {
  id?: string;
  serverId: string;
  provider: OAuthProvider;
  authServerUrl?: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  grantType: OAuthGrantType;

  // Discovery endpoints (can be auto-discovered)
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  revocationEndpoint?: string;
  introspectionEndpoint?: string;
  userInfoEndpoint?: string;

  // Advanced options
  usePKCE?: boolean;
  dynamicRegistration?: boolean;
  audience?: string;
  additionalParams?: Record<string, string>;

  // Metadata
  createdAt?: number;
  updatedAt?: number;
}

/**
 * OAuth token information
 */
export interface OAuthToken {
  id?: string;
  serverId: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  expiresAt?: number;
  expiresIn?: number; // Seconds until expiration
  scopes?: string[];

  // Additional token metadata
  issuedAt?: number;
  notBefore?: number;
  audience?: string;
  issuer?: string;
  subject?: string;

  // Tracking
  lastUsed?: number;
  refreshCount?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * OAuth authorization state for PKCE and state validation
 */
export interface OAuthAuthState {
  serverId: string;
  state: string;
  codeVerifier?: string;
  codeChallenge?: string;
  redirectUri: string;
  scopes: string[];
  createdAt: number;
}

/**
 * OAuth server metadata (from discovery)
 */
export interface OAuthServerMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  tokenEndpointAuthMethodsSupported?: string[];
  jwksUri?: string;
  registrationEndpoint?: string;
  scopesSupported?: string[];
  responseTypesSupported?: string[];
  grantTypesSupported?: string[];
  revocationEndpoint?: string;
  revocationEndpointAuthMethodsSupported?: string[];
  introspectionEndpoint?: string;
  introspectionEndpointAuthMethodsSupported?: string[];
  codeChallengeMethodsSupported?: string[];
  userInfoEndpoint?: string;
}

/**
 * Protected Resource Metadata (RFC 9728)
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorizationServers: string[];
  bearerMethodsSupported?: string[];
  resourceDocumentation?: string;
  resourcePolicy?: string;
  oauth2Requirements?: {
    scopesRequired?: string[];
    audienceRequired?: string[];
  };
}

/**
 * OAuth error response
 */
export interface OAuthError {
  error: string;
  errorDescription?: string;
  errorUri?: string;
  state?: string;
}

/**
 * OAuth token request parameters
 */
export interface TokenRequest {
  grantType: OAuthGrantType;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
  scope?: string;
  clientId: string;
  clientSecret?: string;
  audience?: string;
}

/**
 * OAuth token response
 */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  idToken?: string;
  [key: string]: any;
}

/**
 * Dynamic client registration request (RFC 7591)
 */
export interface ClientRegistrationRequest {
  clientName: string;
  clientUri?: string;
  logoUri?: string;
  redirectUris: string[];
  tokenEndpointAuthMethod?: string;
  grantTypes: string[];
  responseTypes: string[];
  scope?: string;
  contacts?: string[];
  tosUri?: string;
  policyUri?: string;
  softwareId?: string;
  softwareVersion?: string;
}

/**
 * Dynamic client registration response
 */
export interface ClientRegistrationResponse {
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
  redirectUris: string[];
  tokenEndpointAuthMethod?: string;
  grantTypes: string[];
  responseTypes: string[];
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  scope?: string;
  contacts?: string[];
  tosUri?: string;
  policyUri?: string;
  registrationAccessToken?: string;
  registrationClientUri?: string;
}

/**
 * OAuth provider configuration template
 */
export interface OAuthProviderTemplate {
  name: string;
  displayName: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint?: string;
  revocationEndpoint?: string;
  defaultScopes: string[];
  scopeDelimiter?: string;
  authorizationParams?: Record<string, string>;
  tokenParams?: Record<string, string>;
  usePKCE?: boolean;
  icon?: string;
  color?: string;
  documentation?: string;
}

/**
 * OAuth flow result
 */
export interface OAuthFlowResult {
  success: boolean;
  token?: OAuthToken;
  error?: OAuthError;
  message?: string;
}

/**
 * OAuth status for UI display
 */
export interface OAuthStatus {
  authenticated: boolean;
  expiresAt?: number;
  lastRefresh?: number;
  provider?: OAuthProvider;
  scopes?: string[];
  error?: string;
}

/**
 * Predefined OAuth provider templates
 */
export const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderTemplate> = {
  [OAuthProvider.CUSTOM]: {
    name: "custom",
    displayName: "Custom OAuth Provider",
    authorizationEndpoint: "",
    tokenEndpoint: "",
    defaultScopes: [],
    usePKCE: true,
  },
  [OAuthProvider.GITHUB]: {
    name: "github",
    displayName: "GitHub",
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    userInfoEndpoint: "https://api.github.com/user",
    defaultScopes: ["read:user", "repo"],
    scopeDelimiter: " ",
    usePKCE: false,
    icon: "github",
    color: "#24292e",
    documentation:
      "https://docs.github.com/en/developers/apps/building-oauth-apps",
  },
  [OAuthProvider.GOOGLE]: {
    name: "google",
    displayName: "Google",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    revocationEndpoint: "https://oauth2.googleapis.com/revoke",
    defaultScopes: ["openid", "email", "profile"],
    scopeDelimiter: " ",
    authorizationParams: {
      access_type: "offline",
      prompt: "consent",
    },
    usePKCE: true,
    icon: "google",
    color: "#4285f4",
    documentation: "https://developers.google.com/identity/protocols/oauth2",
  },
  [OAuthProvider.MICROSOFT]: {
    name: "microsoft",
    displayName: "Microsoft",
    authorizationEndpoint:
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoEndpoint: "https://graph.microsoft.com/v1.0/me",
    defaultScopes: ["openid", "email", "profile", "offline_access"],
    scopeDelimiter: " ",
    usePKCE: true,
    icon: "microsoft",
    color: "#0078d4",
    documentation:
      "https://docs.microsoft.com/en-us/azure/active-directory/develop/",
  },
  [OAuthProvider.SLACK]: {
    name: "slack",
    displayName: "Slack",
    authorizationEndpoint: "https://slack.com/oauth/v2/authorize",
    tokenEndpoint: "https://slack.com/api/oauth.v2.access",
    revocationEndpoint: "https://slack.com/api/auth.revoke",
    defaultScopes: ["chat:write", "channels:read", "users:read"],
    scopeDelimiter: ",",
    usePKCE: false,
    icon: "slack",
    color: "#4a154b",
    documentation: "https://api.slack.com/authentication/oauth-v2",
  },
  [OAuthProvider.GITLAB]: {
    name: "gitlab",
    displayName: "GitLab",
    authorizationEndpoint: "https://gitlab.com/oauth/authorize",
    tokenEndpoint: "https://gitlab.com/oauth/token",
    userInfoEndpoint: "https://gitlab.com/api/v4/user",
    revocationEndpoint: "https://gitlab.com/oauth/revoke",
    defaultScopes: ["read_user", "api"],
    scopeDelimiter: " ",
    usePKCE: true,
    icon: "gitlab",
    color: "#fc6d26",
    documentation: "https://docs.gitlab.com/ee/api/oauth2.html",
  },
  [OAuthProvider.BITBUCKET]: {
    name: "bitbucket",
    displayName: "Bitbucket",
    authorizationEndpoint: "https://bitbucket.org/site/oauth2/authorize",
    tokenEndpoint: "https://bitbucket.org/site/oauth2/access_token",
    defaultScopes: ["account", "repository"],
    scopeDelimiter: " ",
    usePKCE: false,
    icon: "bitbucket",
    color: "#0052cc",
    documentation:
      "https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/",
  },
};

/**
 * OAuth constants
 */
export const OAUTH_CONSTANTS = {
  STATE_LENGTH: 32,
  VERIFIER_LENGTH: 64,
  DEFAULT_EXPIRY_BUFFER: 300, // 5 minutes before expiry
  MAX_REFRESH_RETRIES: 3,
  TOKEN_REFRESH_INTERVAL: 1000 * 60 * 5, // Check every 5 minutes
  AUTH_TIMEOUT: 1000 * 60 * 10, // 10 minute timeout for auth flow
  REDIRECT_URI: "http://localhost:42424/oauth/callback",
  PKCE_CHALLENGE_METHOD: "S256",
} as const;

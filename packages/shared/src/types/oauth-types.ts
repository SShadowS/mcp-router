/**
 * OAuth types for shared package
 * Re-export from main OAuth implementation
 */

export interface OAuthConfig {
  id?: string;
  serverId: string;
  provider: OAuthProvider | string;
  authServerUrl?: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  grantType?: OAuthGrantType | string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  revocationEndpoint?: string;
  introspectionEndpoint?: string;
  userInfoEndpoint?: string;
  usePKCE?: boolean;
  dynamicRegistration?: boolean;
  audience?: string;
  additionalParams?: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
}

export interface OAuthToken {
  id?: string;
  serverId: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  expiresAt?: number;
  scopes?: string[];
  issuedAt?: number;
  notBefore?: number;
  audience?: string;
  issuer?: string;
  subject?: string;
  lastUsed?: number;
  refreshCount?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface OAuthStatus {
  authenticated: boolean;
  expiresAt?: number;
  lastRefresh?: number;
  provider?: OAuthProvider | string;
  scopes?: string[];
  error?: string;
}

export interface OAuthFlowResult {
  success: boolean;
  token?: OAuthToken;
  error?: OAuthError;
  message?: string;
}

export interface OAuthError {
  error: string;
  errorDescription?: string;
  errorUri?: string;
  state?: string;
}

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

export enum OAuthProvider {
  CUSTOM = "custom",
  GITHUB = "github",
  GOOGLE = "google",
  MICROSOFT = "microsoft",
  SLACK = "slack",
  GITLAB = "gitlab",
  BITBUCKET = "bitbucket",
}

export enum OAuthGrantType {
  AUTHORIZATION_CODE = "authorization_code",
  CLIENT_CREDENTIALS = "client_credentials",
  REFRESH_TOKEN = "refresh_token",
}

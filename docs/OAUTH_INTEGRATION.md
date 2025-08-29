# OAuth Integration for MCP Servers

## Overview

MCP Router provides comprehensive OAuth 2.1 authentication support for MCP servers that require OAuth authentication. This feature handles the entire OAuth flow, token management, and secure storage on behalf of users, allowing MCP servers to authenticate with external services seamlessly.

## Features

- **OAuth 2.1 Support**: Full implementation of OAuth 2.1 authorization flows
- **PKCE Support**: Enhanced security with Proof Key for Code Exchange
- **Automatic Token Refresh**: Tokens are automatically refreshed before expiration
- **Secure Storage**: Tokens are encrypted using AES-256-GCM and stored locally
- **Provider Templates**: Pre-configured settings for popular providers (GitHub, Google, Microsoft, Slack, GitLab, Bitbucket)
- **Dynamic Client Registration**: Support for RFC 7591 automatic client registration
- **Discovery Support**: Automatic endpoint discovery via RFC 8414

## Architecture

### Components

1. **OAuth Service** (`oauth-service.ts`)
   - Main orchestrator for OAuth operations
   - Manages configurations, tokens, and authentication flows

2. **OAuth Flow Service** (`oauth-flow.ts`)
   - Handles authorization code flow with PKCE
   - Manages browser-based authentication

3. **Token Manager** (`token-manager.ts`)
   - Token lifecycle management
   - Automatic refresh with exponential backoff
   - Token validation and expiration tracking

4. **OAuth Discovery** (`oauth-discovery.ts`)
   - Automatic endpoint discovery
   - Supports `.well-known` configuration endpoints

5. **Token Injector** (`oauth-token-injector.ts`)
   - Injects OAuth tokens into MCP server requests
   - Handles token refresh on 401 responses

6. **Database Layer** (`server-oauth-repository.ts`)
   - Secure storage with encryption
   - SQLite-based persistence

## User Guide

### Configuring OAuth for an MCP Server

1. **Open Server List**: Navigate to the home page showing your MCP servers
2. **Click OAuth Status Icon**: Each server has an OAuth status indicator (shield icon)
3. **Configure OAuth**: Click the icon to open the OAuth configuration modal
4. **Select Provider**: Choose from pre-configured providers or select "Custom"
5. **Enter Credentials**:
   - **Client ID**: OAuth application client ID
   - **Client Secret**: OAuth application client secret (optional for public clients)
   - **Scopes**: Required OAuth scopes (comma-separated)
6. **Discovery**: Click "Discover Endpoints" to automatically fetch OAuth endpoints
7. **Save Configuration**: Click "Save" to store the configuration
8. **Authenticate**: Click "Authenticate" to start the OAuth flow

### Authentication Flow

1. **Initiate Authentication**: Click "Authenticate" in the OAuth configuration modal
2. **Browser Window**: A browser window opens for the OAuth provider login
3. **Authorize**: Log in and authorize the application
4. **Callback**: MCP Router handles the callback and stores tokens
5. **Status Update**: OAuth status indicator shows authenticated state

### Token Management

- **Automatic Refresh**: Tokens are automatically refreshed before expiration
- **Manual Refresh**: Click the refresh icon in the OAuth status indicator
- **Revoke Access**: Click "Revoke" to remove OAuth access

## MCP Server Integration

### How MCP Servers Receive OAuth Tokens

MCP servers automatically receive OAuth tokens in the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

The token injection happens transparently:
1. When connecting to an MCP server, MCP Router checks for OAuth configuration
2. If configured and authenticated, the access token is injected
3. On 401 responses, tokens are automatically refreshed and requests retried

### Server Types Supported

- **Remote Servers** (SSE transport): OAuth tokens in HTTP headers
- **Remote-Streamable Servers** (HTTP transport): OAuth tokens in HTTP headers
- **Local Servers**: Not applicable (use environment variables for auth)

## Provider Configuration

### GitHub

```javascript
{
  provider: 'github',
  authServerUrl: 'https://github.com',
  scopes: ['repo', 'user']
}
```

### Google

```javascript
{
  provider: 'google',
  authServerUrl: 'https://accounts.google.com',
  scopes: ['openid', 'email', 'profile']
}
```

### Microsoft

```javascript
{
  provider: 'microsoft',
  authServerUrl: 'https://login.microsoftonline.com/common',
  scopes: ['openid', 'email', 'profile']
}
```

### Custom Provider

```javascript
{
  provider: 'custom',
  authServerUrl: 'https://auth.example.com',
  authorizationEndpoint: 'https://auth.example.com/authorize',
  tokenEndpoint: 'https://auth.example.com/token',
  scopes: ['read', 'write']
}
```

## Security Considerations

### Token Storage

- Tokens are encrypted using AES-256-GCM
- Encryption keys are derived from machine-specific identifiers
- Tokens are stored in local SQLite database
- Database file has restricted permissions

### PKCE Implementation

- Code verifier: 128 random bytes (base64url encoded)
- Code challenge: SHA-256 hash of verifier (base64url encoded)
- Prevents authorization code interception attacks

### Token Refresh

- Refresh tokens are used when available
- Automatic refresh before expiration (5-minute buffer)
- Exponential backoff on refresh failures
- Maximum 3 retry attempts

## API Reference

### OAuth Status

The OAuth status is included in the server object:

```typescript
interface MCPServer {
  // ... other fields
  oauthStatus?: {
    configured: boolean;
    authenticated: boolean;
    tokenValid: boolean;
    expiresAt?: number;
  };
}
```

### IPC Handlers

#### Configure OAuth
```typescript
window.electronAPI.configureOAuth(
  serverId: string,
  provider: string,
  config: Partial<OAuthConfig>
): Promise<OAuthConfig>
```

#### Authenticate
```typescript
window.electronAPI.authenticateOAuth(
  serverId: string,
  scopes?: string[]
): Promise<OAuthFlowResult>
```

#### Get Status
```typescript
window.electronAPI.getOAuthStatus(
  serverId: string
): Promise<OAuthStatus>
```

#### Refresh Token
```typescript
window.electronAPI.refreshOAuthToken(
  serverId: string
): Promise<OAuthFlowResult>
```

#### Revoke Access
```typescript
window.electronAPI.revokeOAuthAccess(
  serverId: string
): Promise<boolean>
```

## Troubleshooting

### Common Issues

1. **"Failed to discover endpoints"**
   - Verify the OAuth server URL is correct
   - Check if the server supports discovery
   - Manually enter endpoints if discovery fails

2. **"Authentication failed"**
   - Verify client ID and secret are correct
   - Check if redirect URI is registered with OAuth provider
   - Ensure required scopes are available

3. **"Token expired"**
   - Click refresh icon to manually refresh
   - Check if refresh token is still valid
   - Re-authenticate if refresh fails

4. **"401 Unauthorized"**
   - Token may have expired
   - Scopes may be insufficient
   - OAuth configuration may be incorrect

### Debug Logging

OAuth operations are logged to the console and application logs:
- Token refresh attempts
- Authentication flow steps
- Discovery results
- Error details

## Development

### Adding a New Provider Template

1. Add provider to `OAuthProvider` enum in `oauth-types.ts`
2. Create template in `OAUTH_PROVIDER_TEMPLATES` in `oauth-types.ts`
3. Update UI provider list in `OAuthConfigModal.tsx`

### Testing OAuth Flow

1. Create test OAuth application with provider
2. Set redirect URI to `http://localhost:11223/oauth/callback`
3. Configure MCP server with OAuth
4. Test authentication flow
5. Verify token injection in server requests
6. Test token refresh on expiration

## References

- [OAuth 2.1 Specification](https://oauth.net/2.1/)
- [RFC 7636: PKCE](https://tools.ietf.org/html/rfc7636)
- [RFC 8414: Authorization Server Metadata](https://tools.ietf.org/html/rfc8414)
- [RFC 7591: Dynamic Client Registration](https://tools.ietf.org/html/rfc7591)
- [RFC 7009: Token Revocation](https://tools.ietf.org/html/rfc7009)
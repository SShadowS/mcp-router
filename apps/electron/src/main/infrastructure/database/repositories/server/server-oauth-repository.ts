/**
 * Repository for managing OAuth configurations and tokens for servers
 */

import { v4 as uuidv4 } from "uuid";
import { BaseRepository } from "../../core/base-repository";
import { SqliteManager } from "../../core/sqlite-manager";
import {
  OAuthConfig,
  OAuthToken,
  OAuthAuthState,
  OAuthProvider,
  OAuthGrantType,
} from "../../../../domain/mcp-core/oauth/oauth-types";
import {
  encryptOAuthConfig,
  decryptOAuthConfig,
  encryptOAuthData,
  decryptOAuthData,
} from "../../../../domain/mcp-core/oauth/oauth-encryption";

// Use a type that ensures id is always defined for the repository
type OAuthConfigEntity = OAuthConfig & { id: string };

export class ServerOAuthRepository extends BaseRepository<OAuthConfigEntity> {
  constructor(db: SqliteManager) {
    super(db, "server_oauth_configs");
  }

  /**
   * Initialize the OAuth tables (handled by migration)
   */
  protected initializeTable(): void {
    // Table initialization is handled by database migration
    // This is just to satisfy the abstract method requirement
  }

  /**
   * Map database row to entity
   */
  protected mapRowToEntity(row: any): OAuthConfigEntity {
    return this.mapRowToConfig(row) as OAuthConfigEntity;
  }

  /**
   * Map entity to database row
   */
  protected mapEntityToRow(entity: OAuthConfigEntity): any {
    const encrypted = encryptOAuthConfig(entity);
    return {
      id: entity.id,
      server_id: entity.serverId,
      provider: entity.provider,
      auth_server_url: entity.authServerUrl,
      client_id: entity.clientId,
      client_secret: encrypted.clientSecret,
      scopes: JSON.stringify(entity.scopes),
      grant_type: entity.grantType,
      authorization_endpoint: entity.authorizationEndpoint,
      token_endpoint: entity.tokenEndpoint,
      revocation_endpoint: entity.revocationEndpoint,
      introspection_endpoint: entity.introspectionEndpoint,
      user_info_endpoint: entity.userInfoEndpoint,
      use_pkce: entity.usePKCE ? 1 : 0,
      dynamic_registration: entity.dynamicRegistration ? 1 : 0,
      audience: entity.audience,
      additional_params: entity.additionalParams
        ? JSON.stringify(entity.additionalParams)
        : null,
      created_at: entity.createdAt || Date.now(),
      updated_at: entity.updatedAt || Date.now(),
    };
  }

  // ============================================
  // OAuth Configuration Methods
  // ============================================

  /**
   * Save or update OAuth configuration for a server
   */
  saveConfig(config: OAuthConfig): OAuthConfig {
    const id = config.id || uuidv4();
    const now = Date.now();

    // Encrypt sensitive fields
    const encryptedConfig = encryptOAuthConfig({
      ...config,
      id,
      createdAt: config.createdAt || now,
      updatedAt: now,
    });

    // Serialize complex fields to JSON
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO server_oauth_configs (
        id, server_id, provider, auth_server_url, client_id, client_secret,
        scopes, grant_type, authorization_endpoint, token_endpoint,
        revocation_endpoint, introspection_endpoint, user_info_endpoint,
        use_pkce, dynamic_registration, audience, additional_params,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      encryptedConfig.serverId,
      encryptedConfig.provider,
      encryptedConfig.authServerUrl,
      encryptedConfig.clientId,
      encryptedConfig.clientSecret,
      JSON.stringify(encryptedConfig.scopes),
      encryptedConfig.grantType,
      encryptedConfig.authorizationEndpoint,
      encryptedConfig.tokenEndpoint,
      encryptedConfig.revocationEndpoint,
      encryptedConfig.introspectionEndpoint,
      encryptedConfig.userInfoEndpoint,
      encryptedConfig.usePKCE ? 1 : 0,
      encryptedConfig.dynamicRegistration ? 1 : 0,
      encryptedConfig.audience,
      encryptedConfig.additionalParams
        ? JSON.stringify(encryptedConfig.additionalParams)
        : null,
      encryptedConfig.createdAt,
      encryptedConfig.updatedAt,
    );

    return this.getConfigByServerId(config.serverId)!;
  }

  /**
   * Get OAuth configuration by server ID
   */
  getConfigByServerId(serverId: string): OAuthConfig | null {
    const stmt = this.db.prepare(`
      SELECT * FROM server_oauth_configs WHERE server_id = ?
    `);

    const row = stmt.get(serverId) as any;
    if (!row) return null;

    return this.mapRowToConfig(row);
  }

  /**
   * Get OAuth configuration by ID
   */
  getConfigById(id: string): OAuthConfig | null {
    const stmt = this.db.prepare(`
      SELECT * FROM server_oauth_configs WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapRowToConfig(row);
  }

  /**
   * Delete OAuth configuration for a server
   */
  deleteConfig(serverId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM server_oauth_configs WHERE server_id = ?
    `);

    const result = stmt.run(serverId);
    return result.changes > 0;
  }

  /**
   * Get all OAuth configurations
   */
  getAllConfigs(): OAuthConfig[] {
    const stmt = this.db.prepare(`
      SELECT * FROM server_oauth_configs ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => this.mapRowToConfig(row));
  }

  // ============================================
  // OAuth Token Methods
  // ============================================

  /**
   * Save or update OAuth token for a server
   */
  saveToken(token: OAuthToken): OAuthToken {
    const id = token.id || uuidv4();
    const now = Date.now();

    // Encrypt sensitive token data
    const encryptedToken = {
      ...token,
      id,
      accessToken: encryptOAuthData(token.accessToken),
      refreshToken: token.refreshToken
        ? encryptOAuthData(token.refreshToken)
        : null,
      idToken: token.idToken ? encryptOAuthData(token.idToken) : null,
      createdAt: token.createdAt || now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO server_oauth_tokens (
        id, server_id, access_token, refresh_token, id_token, token_type,
        expires_at, scopes, issued_at, not_before, audience, issuer, subject,
        last_used, refresh_count, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      encryptedToken.serverId,
      encryptedToken.accessToken,
      encryptedToken.refreshToken,
      encryptedToken.idToken,
      encryptedToken.tokenType,
      encryptedToken.expiresAt,
      encryptedToken.scopes ? JSON.stringify(encryptedToken.scopes) : null,
      encryptedToken.issuedAt,
      encryptedToken.notBefore,
      encryptedToken.audience,
      encryptedToken.issuer,
      encryptedToken.subject,
      encryptedToken.lastUsed,
      encryptedToken.refreshCount || 0,
      encryptedToken.createdAt,
      encryptedToken.updatedAt,
    );

    return this.getTokenByServerId(token.serverId)!;
  }

  /**
   * Get OAuth token by server ID
   */
  getTokenByServerId(serverId: string): OAuthToken | null {
    const stmt = this.db.prepare(`
      SELECT * FROM server_oauth_tokens WHERE server_id = ?
    `);

    const row = stmt.get(serverId) as any;
    if (!row) return null;

    return this.mapRowToToken(row);
  }

  /**
   * Update token last used timestamp
   */
  updateTokenLastUsed(serverId: string): void {
    const stmt = this.db.prepare(`
      UPDATE server_oauth_tokens 
      SET last_used = ?, updated_at = ?
      WHERE server_id = ?
    `);

    const now = Date.now();
    stmt.run(now, now, serverId);
  }

  /**
   * Increment token refresh count
   */
  incrementRefreshCount(serverId: string): void {
    const stmt = this.db.prepare(`
      UPDATE server_oauth_tokens 
      SET refresh_count = refresh_count + 1, updated_at = ?
      WHERE server_id = ?
    `);

    stmt.run(Date.now(), serverId);
  }

  /**
   * Delete OAuth token for a server
   */
  deleteToken(serverId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM server_oauth_tokens WHERE server_id = ?
    `);

    const result = stmt.run(serverId);
    return result.changes > 0;
  }

  /**
   * Get all tokens
   */
  getAllTokens(): OAuthToken[] {
    const stmt = this.db.prepare(`
      SELECT * FROM server_oauth_tokens
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => this.mapRowToToken(row));
  }

  /**
   * Get all expired tokens
   */
  getExpiredTokens(): OAuthToken[] {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT * FROM server_oauth_tokens 
      WHERE expires_at IS NOT NULL AND expires_at < ?
      ORDER BY expires_at ASC
    `);

    const rows = stmt.all(now) as any[];
    return rows.map((row) => this.mapRowToToken(row));
  }

  // ============================================
  // OAuth Auth State Methods (for PKCE flow)
  // ============================================

  /**
   * Save OAuth authorization state for PKCE validation
   */
  saveAuthState(state: OAuthAuthState): void {
    const id = uuidv4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO oauth_auth_states (
        id, server_id, state, code_verifier, code_challenge,
        redirect_uri, scopes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      state.serverId,
      state.state,
      state.codeVerifier ? encryptOAuthData(state.codeVerifier) : null,
      state.codeChallenge,
      state.redirectUri,
      JSON.stringify(state.scopes),
      now,
    );
  }

  /**
   * Get and delete auth state by state parameter
   */
  getAndDeleteAuthState(state: string): OAuthAuthState | null {
    const stmt = this.db.prepare(`
      SELECT * FROM oauth_auth_states WHERE state = ?
    `);

    const row = stmt.get(state) as any;
    if (!row) return null;

    // Delete the state after retrieving
    const deleteStmt = this.db.prepare(`
      DELETE FROM oauth_auth_states WHERE state = ?
    `);
    deleteStmt.run(state);

    return {
      serverId: row.server_id,
      state: row.state,
      codeVerifier: row.code_verifier
        ? decryptOAuthData(row.code_verifier)
        : undefined,
      codeChallenge: row.code_challenge,
      redirectUri: row.redirect_uri,
      scopes: JSON.parse(row.scopes),
      createdAt: row.created_at,
    };
  }

  /**
   * Clean up old auth states (older than 1 hour)
   */
  cleanupOldAuthStates(): number {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const stmt = this.db.prepare(`
      DELETE FROM oauth_auth_states WHERE created_at < ?
    `);

    const result = stmt.run(oneHourAgo);
    return result.changes;
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Map database row to OAuthConfig object
   */
  private mapRowToConfig(row: any): OAuthConfig {
    const config: OAuthConfig = {
      id: row.id,
      serverId: row.server_id,
      provider: row.provider as OAuthProvider,
      authServerUrl: row.auth_server_url,
      clientId: row.client_id,
      clientSecret: row.client_secret,
      scopes: JSON.parse(row.scopes),
      grantType: row.grant_type as OAuthGrantType,
      authorizationEndpoint: row.authorization_endpoint,
      tokenEndpoint: row.token_endpoint,
      revocationEndpoint: row.revocation_endpoint,
      introspectionEndpoint: row.introspection_endpoint,
      userInfoEndpoint: row.user_info_endpoint,
      usePKCE: row.use_pkce === 1,
      dynamicRegistration: row.dynamic_registration === 1,
      audience: row.audience,
      additionalParams: row.additional_params
        ? JSON.parse(row.additional_params)
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // Decrypt sensitive fields
    return decryptOAuthConfig(config);
  }

  /**
   * Map database row to OAuthToken object
   */
  private mapRowToToken(row: any): OAuthToken {
    return {
      id: row.id,
      serverId: row.server_id,
      accessToken: decryptOAuthData(row.access_token),
      refreshToken: row.refresh_token
        ? decryptOAuthData(row.refresh_token)
        : undefined,
      idToken: row.id_token ? decryptOAuthData(row.id_token) : undefined,
      tokenType: row.token_type,
      expiresAt: row.expires_at,
      scopes: row.scopes ? JSON.parse(row.scopes) : undefined,
      issuedAt: row.issued_at,
      notBefore: row.not_before,
      audience: row.audience,
      issuer: row.issuer,
      subject: row.subject,
      lastUsed: row.last_used,
      refreshCount: row.refresh_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Check if a server has OAuth configuration
   */
  hasOAuthConfig(serverId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM server_oauth_configs WHERE server_id = ?
    `);

    const result = stmt.get(serverId) as any;
    return result.count > 0;
  }

  /**
   * Check if a server has a valid token
   */
  hasValidToken(serverId: string): boolean {
    const token = this.getTokenByServerId(serverId);
    if (!token) return false;

    // Check if token is expired
    if (token.expiresAt && token.expiresAt < Date.now()) {
      return false;
    }

    return true;
  }
}

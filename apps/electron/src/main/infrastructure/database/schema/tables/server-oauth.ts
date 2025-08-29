import { DatabaseTableSchema } from "@mcp_router/shared";

/**
 * Server OAuth configurations table schema
 * Stores OAuth configuration for servers that require OAuth authentication
 */
export const SERVER_OAUTH_CONFIGS_SCHEMA: DatabaseTableSchema = {
  createSQL: `
    CREATE TABLE IF NOT EXISTS server_oauth_configs (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      auth_server_url TEXT,
      client_id TEXT NOT NULL,
      client_secret TEXT,
      scopes TEXT NOT NULL,
      grant_type TEXT NOT NULL,
      authorization_endpoint TEXT,
      token_endpoint TEXT,
      revocation_endpoint TEXT,
      introspection_endpoint TEXT,
      user_info_endpoint TEXT,
      use_pkce INTEGER DEFAULT 1,
      dynamic_registration INTEGER DEFAULT 0,
      audience TEXT,
      additional_params TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `,
  indexes: [
    "CREATE INDEX IF NOT EXISTS idx_server_oauth_configs_server_id ON server_oauth_configs(server_id)",
    "CREATE INDEX IF NOT EXISTS idx_server_oauth_configs_provider ON server_oauth_configs(provider)",
  ],
};

/**
 * Server OAuth tokens table schema
 * Stores OAuth tokens for authenticated servers
 */
export const SERVER_OAUTH_TOKENS_SCHEMA: DatabaseTableSchema = {
  createSQL: `
    CREATE TABLE IF NOT EXISTS server_oauth_tokens (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      id_token TEXT,
      token_type TEXT NOT NULL,
      expires_at INTEGER,
      scopes TEXT,
      issued_at INTEGER,
      not_before INTEGER,
      audience TEXT,
      issuer TEXT,
      subject TEXT,
      last_used INTEGER,
      refresh_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `,
  indexes: [
    "CREATE INDEX IF NOT EXISTS idx_server_oauth_tokens_server_id ON server_oauth_tokens(server_id)",
    "CREATE INDEX IF NOT EXISTS idx_server_oauth_tokens_expires_at ON server_oauth_tokens(expires_at)",
  ],
};

/**
 * OAuth authorization states table schema
 * Stores temporary OAuth state for PKCE and state validation during auth flow
 */
export const OAUTH_AUTH_STATES_SCHEMA: DatabaseTableSchema = {
  createSQL: `
    CREATE TABLE IF NOT EXISTS oauth_auth_states (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      state TEXT NOT NULL UNIQUE,
      code_verifier TEXT,
      code_challenge TEXT,
      redirect_uri TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `,
  indexes: [
    "CREATE INDEX IF NOT EXISTS idx_oauth_auth_states_state ON oauth_auth_states(state)",
    "CREATE INDEX IF NOT EXISTS idx_oauth_auth_states_server_id ON oauth_auth_states(server_id)",
    "CREATE INDEX IF NOT EXISTS idx_oauth_auth_states_created_at ON oauth_auth_states(created_at)",
  ],
};

/**
 * Required columns definition (empty as these are new tables)
 */
export const SERVER_OAUTH_CONFIGS_REQUIRED_COLUMNS: string[] = [];
export const SERVER_OAUTH_TOKENS_REQUIRED_COLUMNS: string[] = [];
export const OAUTH_AUTH_STATES_REQUIRED_COLUMNS: string[] = [];

import { DatabaseTableSchema } from "@mcp_router/shared";

/**
 * Server tools table schema definition
 * Stores tool enable/disable preferences per server
 * Supports both global (client_id = NULL) and client-specific preferences
 */
export const SERVER_TOOLS_SCHEMA: DatabaseTableSchema = {
  createSQL: `
    CREATE TABLE IF NOT EXISTS server_tools (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      original_description TEXT,
      custom_name TEXT,
      custom_description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      UNIQUE(server_id, tool_name)
    )
  `,
  indexes: [
    "CREATE INDEX IF NOT EXISTS idx_server_tools_server_id ON server_tools(server_id)",
    "CREATE INDEX IF NOT EXISTS idx_server_tools_enabled ON server_tools(enabled)",
  ],
};

/**
 * Required columns definition
 */
export const SERVER_TOOLS_REQUIRED_COLUMNS: string[] = [];

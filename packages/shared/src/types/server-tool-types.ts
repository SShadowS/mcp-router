/**
 * Server tool preference types
 */

/**
 * Server tool configuration
 */
export interface ServerTool {
  id: string;
  serverId: string;
  toolName: string;
  clientId?: string; // Optional client ID for client-specific preferences
  enabled: boolean;
  originalDescription?: string; // The original description from the MCP tool
  customName?: string;
  customDescription?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Tool preference update request
 */
export interface ToolPreferenceUpdate {
  toolName: string;
  clientId?: string; // Optional client ID for client-specific preferences
  enabled: boolean;
  originalDescription?: string;
  customName?: string;
  customDescription?: string;
}

/**
 * Bulk tool preference update
 */
export interface BulkToolUpdate {
  serverId: string;
  clientId?: string; // Optional client ID for client-specific preferences
  updates: ToolPreferenceUpdate[];
}

/**
 * Tool with metadata
 */
export interface ToolWithMetadata {
  name: string;
  description?: string;
  inputSchema?: any;
  enabled: boolean;
  customName?: string;
  customDescription?: string;
  serverName: string;
  serverId: string;
}

/**
 * Tool filter options
 */
export interface ToolFilterOptions {
  showDisabled?: boolean;
  searchQuery?: string;
  serverIds?: string[];
}

/**
 * Tool statistics
 */
export interface ToolStatistics {
  total: number;
  enabled: number;
  disabled: number;
  customized: number;
}

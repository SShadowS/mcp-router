/**
 * Client management types
 */

import { Token } from "./token-types";

/**
 * Basic client information
 */
export interface Client {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Client with associated tokens
 */
export interface ClientWithTokens extends Client {
  tokens: Token[];
  tokenCount?: number;
  activeTokenCount?: number;
}

/**
 * Client with server access information
 */
export interface ClientWithAccess extends Client {
  serverAccess: string[]; // Server IDs this client can access
}

/**
 * Complete client information
 */
export interface ClientComplete extends ClientWithTokens, ClientWithAccess {}

/**
 * Client creation DTO
 */
export interface ClientCreateDto {
  name: string;
  description?: string;
  serverAccess?: string[]; // Optional initial server access
}

/**
 * Client update DTO
 */
export interface ClientUpdateDto {
  name?: string;
  description?: string;
  serverAccess?: string[];
}

/**
 * Client tool preference (extends ServerTool for client-specific)
 */
export interface ClientToolPreference {
  clientId: string;
  serverId: string;
  toolName: string;
  enabled: boolean;
  customName?: string;
  customDescription?: string;
  isInherited?: boolean; // Whether this is inherited from global settings
}

/**
 * Client statistics
 */
export interface ClientStatistics {
  totalClients: number;
  activeClients: number;
  totalTokens: number;
  activeTokens: number;
}

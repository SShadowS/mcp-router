/**
 * Augment the global Window interface so TypeScript knows about "window.electronAPI".
 */

import { TokenScope } from "@mcp_router/shared";
import { AppSettings } from "@mcp_router/shared";
import {
  Agent,
  AgentConfig,
  DeployedAgent,
  CreateServerInput,
  Client,
  ClientWithTokens,
  ClientCreateDto,
  ClientUpdateDto,
  Token,
} from "@mcp_router/shared";
import { McpAppsManagerResult, McpApp } from "@/main/domain/mcp-apps-service";
import { ServerPackageUpdates } from "./lib/utils/backend/package-version-resolver";

declare global {
  interface Window {
    electronAPI: {
      // Authentication
      login: (idp?: string) => Promise<boolean>;
      logout: () => Promise<boolean>;
      getAuthStatus: (forceRefresh?: boolean) => Promise<{
        authenticated: boolean;
        userId?: string;
        user?: any;
        token?: string;
      }>;
      handleAuthToken: (token: string, state?: string) => Promise<boolean>;
      onAuthStatusChanged: (
        callback: (status: {
          loggedIn: boolean;
          userId?: string;
          user?: any;
        }) => void,
      ) => () => void;

      listMcpServers: () => Promise<any>;
      startMcpServer: (id: string) => Promise<boolean>;
      stopMcpServer: (id: string) => Promise<boolean>;
      addMcpServer: (input: CreateServerInput) => Promise<any>;
      serverSelectFile: (options: any) => Promise<any>;
      removeMcpServer: (id: string) => Promise<any>;
      updateMcpServerConfig: (id: string, config: any) => Promise<any>;
      fetchMcpServersFromIndex: (
        page?: number,
        limit?: number,
        search?: string,
        isVerified?: boolean,
      ) => Promise<any>;
      fetchMcpServerVersionDetails: (
        displayId: string,
        version: string,
      ) => Promise<any>;

      getRequestLogs: (options?: {
        clientId?: string;
        serverId?: string;
        requestType?: string;
        startDate?: Date;
        endDate?: Date;
        responseStatus?: "success" | "error";
        cursor?: string;
        limit?: number;
      }) => Promise<{
        logs: any[];
        total: number;
        nextCursor?: string;
        hasMore: boolean;
      }>;

      // Settings Management
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<boolean>;
      incrementPackageManagerOverlayCount: () => Promise<{
        success: boolean;
        count: number;
      }>;

      // MCP Apps Management
      listMcpApps: () => Promise<McpApp[]>;
      addMcpAppConfig: (appName: string) => Promise<McpAppsManagerResult>;
      deleteMcpApp: (appName: string) => Promise<boolean>;
      [key: string]: any;
      updateAppServerAccess: (
        appName: string,
        serverIds: string[],
      ) => Promise<McpAppsManagerResult>;
      unifyAppConfig: (appName: string) => Promise<McpAppsManagerResult>;

      // Command checking
      checkCommandExists: (command: string) => Promise<boolean>;

      // Agent Management
      listAgents: () => Promise<Agent[]>;
      getAgent: (id: string) => Promise<Agent | undefined>;
      createAgent: (agentConfig: Omit<AgentConfig, "id">) => Promise<Agent>;
      updateAgent: (
        id: string,
        config: Partial<AgentConfig>,
      ) => Promise<Agent | undefined>;
      deleteAgent: (id: string) => Promise<boolean>;
      shareAgent: (id: string) => Promise<string>;
      importAgent: (shareCode: string) => Promise<DeployedAgent | undefined>;

      // Agent Deployment
      deployAgent: (id: string) => Promise<DeployedAgent | undefined>;
      getDeployedAgents: () => Promise<DeployedAgent[] | undefined>;
      updateDeployedAgent: (
        id: string,
        config: any,
      ) => Promise<DeployedAgent | undefined>;
      deleteDeployedAgent: (id: string) => Promise<boolean>;

      // Package Version Resolution
      resolvePackageVersionsInArgs: (
        argsString: string,
        packageManager: "pnpm" | "uvx",
      ) => Promise<{ success: boolean; resolvedArgs?: string; error?: string }>;
      checkMcpServerPackageUpdates: (
        args: string[],
        packageManager: "pnpm" | "uvx",
      ) => Promise<{
        success: boolean;
        updates?: ServerPackageUpdates;
      }>;

      // Agent Tool Management
      getAgentMCPServerTools: (
        agentId: string,
        serverId: string,
        isDev?: boolean,
      ) => Promise<{ success: boolean; tools: any[]; error?: string }>;
      executeAgentTool: (
        agentId: string,
        toolName: string,
        args: Record<string, any>,
      ) => Promise<{ success: boolean; result?: any; error?: string }>;

      // Background Chat
      startBackgroundChat: (
        sessionId: string | undefined,
        agentId: string,
        query: string,
      ) => Promise<{ success: boolean; error?: string }>;
      stopBackgroundChat: (
        agentId: string,
      ) => Promise<{ success: boolean; error?: string }>;
      onBackgroundChatStart: (callback: (data: any) => void) => () => void;
      onBackgroundChatStop: (callback: (data: any) => void) => () => void;

      // Session Messages (Local Database)
      fetchSessionMessages: (sessionId: string) => Promise<any[]>;
      getSessions: (
        agentId: string,
        options?: any,
      ) => Promise<{ sessions: any[]; hasMore: boolean; nextCursor?: string }>;
      createSession: (agentId: string, initialMessages?: any[]) => Promise<any>;
      updateSessionMessages: (
        sessionId: string,
        messages: any[],
      ) => Promise<any>;
      deleteSession: (sessionId: string) => Promise<boolean>;

      // Chat Stream Communication (Background -> Main)
      sendChatStreamStart: (
        streamData: any,
      ) => Promise<{ success: boolean; error?: string }>;
      sendChatStreamChunk: (
        chunkData: any,
      ) => Promise<{ success: boolean; error?: string }>;
      sendChatStreamEnd: (
        endData: any,
      ) => Promise<{ success: boolean; error?: string }>;
      sendChatStreamError: (
        errorData: any,
      ) => Promise<{ success: boolean; error?: string }>;

      // Chat Stream Listeners (Main -> Background)
      onChatStreamStart: (callback: (data: any) => void) => () => void;
      onChatStreamChunk: (callback: (data: any) => void) => () => void;
      onChatStreamEnd: (callback: (data: any) => void) => () => void;
      onChatStreamError: (callback: (data: any) => void) => () => void;

      // Token Scope Management
      updateTokenScopes: (
        tokenId: string,
        scopes: TokenScope[],
      ) => Promise<McpAppsManagerResult>;

      // Feedback
      submitFeedback: (feedback: string) => Promise<boolean>;

      // Update Management
      checkForUpdates: () => Promise<{ updateAvailable: boolean }>;
      installUpdate: () => Promise<boolean>;
      onUpdateAvailable: (callback: (available: boolean) => void) => () => void;

      // Protocol URL handling
      onProtocolUrl: (callback: (url: string) => void) => () => void;

      // Package Manager Management
      checkPackageManagers: () => Promise<{
        node: boolean;
        pnpm: boolean;
        uv: boolean;
      }>;
      installPackageManagers: () => Promise<{
        success: boolean;
        installed: { node: boolean; pnpm: boolean; uv: boolean };
        errors?: { node?: string; pnpm?: string; uv?: string };
      }>;
      restartApp: () => Promise<boolean>;

      // Workspace Management
      listWorkspaces: () => Promise<any[]>;
      createWorkspace: (config: any) => Promise<any>;
      updateWorkspace: (
        id: string,
        updates: any,
      ) => Promise<{ success: boolean }>;
      deleteWorkspace: (id: string) => Promise<{ success: boolean }>;
      switchWorkspace: (id: string) => Promise<{ success: boolean }>;
      getCurrentWorkspace: () => Promise<any>;
      getWorkspaceCredentials: (
        id: string,
      ) => Promise<{ token: string | null }>;
      onWorkspaceSwitched: (callback: (workspace: any) => void) => () => void;
      onWorkspaceConfigChanged: (callback: (config: any) => void) => () => void;

      // Hook Management
      listHooks: () => Promise<any[]>;
      getHook: (id: string) => Promise<any>;
      createHook: (hookData: any) => Promise<any>;
      updateHook: (id: string, updates: any) => Promise<any>;
      deleteHook: (id: string) => Promise<boolean>;
      setHookEnabled: (id: string, enabled: boolean) => Promise<any>;
      reorderHooks: (hookIds: string[]) => Promise<any[]>;

      // Tool Management
      getServerTools: (serverId: string, clientId?: string) => Promise<any[]>;
      getToolStatistics: (serverId: string, clientId?: string) => Promise<any>;
      updateToolPreference: (serverId: string, preference: any, clientId?: string) => Promise<any>;
      bulkUpdateTools: (update: { serverId: string; clientId?: string; updates: any[] }) => Promise<any[]>;
      enableAllTools: (serverId: string, clientId?: string) => Promise<void>;

      // OAuth Management
      configureOAuth: (serverId: string, provider: string, config: any) => Promise<any>;
      authenticateOAuth: (serverId: string, scopes?: string[]) => Promise<any>;
      getOAuthStatus: (serverId: string) => Promise<any>;
      getOAuthAccessToken: (serverId: string) => Promise<string | null>;
      refreshOAuthToken: (serverId: string) => Promise<any>;
      revokeOAuthAccess: (serverId: string) => Promise<boolean>;
      discoverOAuthEndpoints: (serverUrl: string, provider?: string) => Promise<any>;
      getOAuthConfiguration: (serverId: string) => Promise<any>;
      updateOAuthConfiguration: (serverId: string, updates: any) => Promise<any>;
      removeOAuthConfiguration: (serverId: string) => Promise<boolean>;
      hasOAuthConfiguration: (serverId: string) => Promise<boolean>;
      hasValidOAuthToken: (serverId: string) => Promise<boolean>;
      getAllOAuthConfigurations: () => Promise<any[]>;
      importOAuthConfiguration: (serverId: string, config: any) => Promise<any>;
      
      // OAuth Session Management
      oauth: {
        getAllSessions: () => Promise<Array<{
          serverId: string;
          serverName: string;
          provider: string;
          authenticated: boolean;
          expiresAt?: number;
          lastRefresh?: number;
          scopes?: string[];
          error?: string;
        }>>;
        getSecurityMetrics: () => Promise<{
          keyVersion: number;
          lastKeyRotation: number;
          nextKeyRotation: number;
          totalAuditLogs: number;
          recentSecurityEvents: { [key: string]: number };
          rateLimitStatus: { [key: string]: any };
        }>;
        getAuditLogs: (filters?: any) => Promise<Array<{
          id: string;
          timestamp: number;
          eventType: string;
          serverId?: string;
          severity: 'info' | 'warning' | 'error' | 'critical';
          details: Record<string, any>;
        }>>;
        rotateEncryptionKeys: () => Promise<boolean>;
        createBackup: () => Promise<string | null>;
        selectAndRestoreBackup: () => Promise<{
          success: boolean;
          restored: { configs: number; tokens: number };
        } | null>;
        getMigrationStatus: () => Promise<{
          currentVersion: string;
          targetVersion: string;
          pendingMigrations: Array<{ version: string; description: string }>;
          appliedMigrations: string[];
          lastMigration: number;
          canRollback: boolean;
        }>;
        runMigration: () => Promise<{
          success: boolean;
          fromVersion: string;
          toVersion: string;
          migrationsApplied: string[];
          errors?: string[];
          warnings?: string[];
        }>;
        exportSecurityReport: () => Promise<string | null>;
        refreshToken: (serverId: string) => Promise<any>;
        revokeAccess: (serverId: string) => Promise<boolean>;
      };
      
      disableAllTools: (serverId: string, clientId?: string) => Promise<void>;
      resetToolPreferences: (serverId: string, clientId?: string) => Promise<boolean>;
      isToolEnabled: (serverId: string, toolName: string, clientId?: string) => Promise<boolean>;
      getAvailableTools: (serverId: string, clientId?: string) => Promise<any[]>;

      // Client Management
      listClients: () => Promise<ClientWithTokens[]>;
      getClient: (id: string) => Promise<ClientWithTokens | null>;
      createClient: (dto: ClientCreateDto) => Promise<ClientWithTokens>;
      updateClient: (id: string, dto: ClientUpdateDto) => Promise<ClientWithTokens>;
      deleteClient: (id: string) => Promise<void>;
      getClientStats: () => Promise<{
        totalClients: number;
        activeClients: number;
        totalTokens: number;
        activeTokens: number;
      }>;

      // Token Management (for clients)
      generateToken: (params: { clientId: string; serverIds?: string[] }) => Promise<Token>;
      revokeToken: (tokenId: string) => Promise<void>;
      getClientTokens: (clientId: string) => Promise<Token[]>;
    };
  }
}

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";
import { CreateServerInput } from "@mcp_router/shared";
import { TokenScope } from "@mcp_router/shared";

// Consolidate everything into one contextBridge call

contextBridge.exposeInMainWorld("electronAPI", {
  // Authentication
  login: (idp?: string) => ipcRenderer.invoke("auth:login", idp),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getAuthStatus: (forceRefresh?: boolean) =>
    ipcRenderer.invoke("auth:status", forceRefresh),
  handleAuthToken: (token: string, state?: string) =>
    ipcRenderer.invoke("auth:handle-token", token, state),
  onAuthStatusChanged: (callback: (status: any) => void) => {
    const listener = (_: any, status: any) => callback(status);
    ipcRenderer.on("auth:status-changed", listener);
    return () => {
      ipcRenderer.removeListener("auth:status-changed", listener);
    };
  },

  // MCP Server Management
  listMcpServers: () => ipcRenderer.invoke("mcp:list"),
  startMcpServer: (id: string) => ipcRenderer.invoke("mcp:start", id),
  stopMcpServer: (id: string) => ipcRenderer.invoke("mcp:stop", id),
  addMcpServer: (input: CreateServerInput) =>
    ipcRenderer.invoke("mcp:add", input),
  serverSelectFile: (options: any) =>
    ipcRenderer.invoke("server:selectFile", options),
  removeMcpServer: (id: string) => ipcRenderer.invoke("mcp:remove", id),
  updateMcpServerConfig: (id: string, config: any) =>
    ipcRenderer.invoke("mcp:update-config", id, config),
  fetchMcpServersFromIndex: (
    page?: number,
    limit?: number,
    search?: string,
    isVerified?: boolean,
  ) =>
    ipcRenderer.invoke("mcp:fetch-from-index", page, limit, search, isVerified),
  fetchMcpServerVersionDetails: (displayId: string, version: string) =>
    ipcRenderer.invoke("mcp:fetch-server-version-details", displayId, version),

  // Package Version Resolution
  resolvePackageVersionsInArgs: (
    argsString: string,
    packageManager: "pnpm" | "uvx",
  ) =>
    ipcRenderer.invoke("package:resolve-versions", argsString, packageManager),
  checkMcpServerPackageUpdates: (
    args: string[],
    packageManager: "pnpm" | "uvx",
  ) => ipcRenderer.invoke("package:check-updates", args, packageManager),

  // Logging
  getRequestLogs: (options?: {
    clientId?: string;
    serverId?: string;
    requestType?: string;
    startDate?: Date;
    endDate?: Date;
    responseStatus?: "success" | "error";
    cursor?: string;
    limit?: number;
  }) => ipcRenderer.invoke("requestLogs:get", options),

  // Settings Management
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: any) =>
    ipcRenderer.invoke("settings:save", settings),
  incrementPackageManagerOverlayCount: () =>
    ipcRenderer.invoke("settings:increment-package-manager-overlay-count"),

  // MCP Apps Management
  listMcpApps: () => ipcRenderer.invoke("mcp-apps:list"),
  addMcpAppConfig: (appName: string) =>
    ipcRenderer.invoke("mcp-apps:add", appName),
  deleteMcpApp: (appName: string) =>
    ipcRenderer.invoke("mcp-apps:delete", appName),
  updateAppServerAccess: (appName: string, serverIds: string[]) =>
    ipcRenderer.invoke("mcp-apps:update-server-access", appName, serverIds),
  unifyAppConfig: (appName: string) =>
    ipcRenderer.invoke("mcp-apps:unify", appName),

  // Agent Management
  listAgents: () => ipcRenderer.invoke("agent:list"),
  getAgent: (id: string) => ipcRenderer.invoke("agent:get", id),
  createAgent: (agentConfig: any) =>
    ipcRenderer.invoke("agent:create", agentConfig),
  updateAgent: (id: string, config: any) =>
    ipcRenderer.invoke("agent:update", id, config),
  deleteAgent: (id: string) => ipcRenderer.invoke("agent:delete", id),
  shareAgent: (id: string) => ipcRenderer.invoke("agent:share", id),
  importAgent: (shareCode: string) =>
    ipcRenderer.invoke("agent:import", shareCode),

  // Agent Deployment
  deployAgent: (id: string) => ipcRenderer.invoke("agent:deploy", id),
  getDeployedAgents: () => ipcRenderer.invoke("agent:deployed-list"),
  updateDeployedAgent: (id: string, config: any) =>
    ipcRenderer.invoke("agent:deployed-update", id, config),
  deleteDeployedAgent: (id: string) =>
    ipcRenderer.invoke("agent:deployed-delete", id),

  // Agent Tool Management
  getAgentMCPServerTools: (
    agentId: string,
    serverId: string,
    isDev?: boolean,
  ) =>
    ipcRenderer.invoke("agent:get-mcp-server-tools", agentId, serverId, isDev),
  executeAgentTool: (
    agentId: string,
    toolName: string,
    args: Record<string, any>,
  ) => ipcRenderer.invoke("agent:execute-tools", agentId, toolName, args),

  // Background Chat
  startBackgroundChat: (
    sessionId: string | undefined,
    agentId: string,
    query: string,
  ) =>
    ipcRenderer.invoke(
      "agent:background-chat-start",
      sessionId,
      agentId,
      query,
    ),
  stopBackgroundChat: (agentId: string) =>
    ipcRenderer.invoke("agent:background-chat-stop", agentId),
  onBackgroundChatStart: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on("background-chat:start", listener);
    return () => {
      ipcRenderer.removeListener("background-chat:start", listener);
    };
  },
  onBackgroundChatStop: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on("background-chat:stop", listener);
    return () => {
      ipcRenderer.removeListener("background-chat:stop", listener);
    };
  },

  // Session Messages (Local Database)
  getSessions: (agentId: string, options?: any) =>
    ipcRenderer.invoke("agent:get-sessions", agentId, options),
  createSession: (agentId: string, initialMessages?: any[]) =>
    ipcRenderer.invoke("agent:create-session", agentId, initialMessages),
  updateSessionMessages: (sessionId: string, messages: any[]) =>
    ipcRenderer.invoke("agent:update-session-messages", sessionId, messages),
  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke("agent:delete-session", sessionId),

  // Chat Stream Communication (Background -> Main)
  sendChatStreamStart: (streamData: any) =>
    ipcRenderer.invoke("agent:chat-stream-start", streamData),
  sendChatStreamChunk: (chunkData: any) =>
    ipcRenderer.invoke("agent:chat-stream-chunk", chunkData),
  sendChatStreamEnd: (endData: any) =>
    ipcRenderer.invoke("agent:chat-stream-end", endData),
  sendChatStreamError: (errorData: any) =>
    ipcRenderer.invoke("agent:chat-stream-error", errorData),

  // Chat Stream Listeners (Main -> Background)
  onChatStreamStart: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on("chat-stream:start", listener);
    return () => {
      ipcRenderer.removeListener("chat-stream:start", listener);
    };
  },
  onChatStreamChunk: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on("chat-stream:chunk", listener);
    return () => {
      ipcRenderer.removeListener("chat-stream:chunk", listener);
    };
  },
  onChatStreamEnd: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on("chat-stream:end", listener);
    return () => {
      ipcRenderer.removeListener("chat-stream:end", listener);
    };
  },
  onChatStreamError: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on("chat-stream:error", listener);
    return () => {
      ipcRenderer.removeListener("chat-stream:error", listener);
    };
  },

  // Command check
  checkCommandExists: (command: string) =>
    ipcRenderer.invoke("command:exists", command),

  // Token Scope Management
  updateTokenScopes: (tokenId: string, scopes: TokenScope[]) =>
    ipcRenderer.invoke("token:updateScopes", tokenId, scopes),

  // Feedback
  submitFeedback: (feedback: string) =>
    ipcRenderer.invoke("feedback:submit", feedback),

  // Update Management
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateAvailable: (callback: (available: boolean) => void) => {
    const listener = (_: any, available: boolean) => callback(available);
    ipcRenderer.on("update:downloaded", listener);
    return () => {
      ipcRenderer.removeListener("update:downloaded", listener);
    };
  },

  // Package Manager Management
  checkPackageManagers: () => ipcRenderer.invoke("packageManager:checkAll"),
  installPackageManagers: () => ipcRenderer.invoke("packageManager:installAll"),
  restartApp: () => ipcRenderer.invoke("packageManager:restart"),

  // Protocol URL handling
  onProtocolUrl: (callback: (url: string) => void) => {
    const listener = (_: any, url: string) => callback(url);
    ipcRenderer.on("protocol:url", listener);
    return () => {
      ipcRenderer.removeListener("protocol:url", listener);
    };
  },

  // System
  getPlatform: () => ipcRenderer.invoke("system:getPlatform"),

  // Client Management
  listClients: () => ipcRenderer.invoke("client:list"),
  getClient: (id: string) => ipcRenderer.invoke("client:get", id),
  createClient: (dto: any) => ipcRenderer.invoke("client:create", dto),
  updateClient: (id: string, dto: any) => ipcRenderer.invoke("client:update", id, dto),
  deleteClient: (id: string) => ipcRenderer.invoke("client:delete", id),
  getClientStats: () => ipcRenderer.invoke("client:stats"),

  // Token Management (for clients)
  generateToken: (params: { clientId: string; serverIds?: string[] }) => 
    ipcRenderer.invoke("token:generate", params),
  revokeToken: (tokenId: string) => ipcRenderer.invoke("token:revoke", tokenId),
  getClientTokens: (clientId: string) => ipcRenderer.invoke("token:listByClient", clientId),

  // Workspace Management
  listWorkspaces: () => ipcRenderer.invoke("workspace:list"),
  createWorkspace: (config: any) =>
    ipcRenderer.invoke("workspace:create", config),
  updateWorkspace: (id: string, updates: any) =>
    ipcRenderer.invoke("workspace:update", id, updates),
  deleteWorkspace: (id: string) => ipcRenderer.invoke("workspace:delete", id),
  switchWorkspace: (id: string) => ipcRenderer.invoke("workspace:switch", id),
  getCurrentWorkspace: () => ipcRenderer.invoke("workspace:current"),
  getWorkspaceCredentials: (id: string) =>
    ipcRenderer.invoke("workspace:get-credentials", id),
  onWorkspaceSwitched: (callback: (workspace: any) => void) => {
    const listener = (_: any, workspace: any) => callback(workspace);
    ipcRenderer.on("workspace:switched", listener);
    return () => {
      ipcRenderer.removeListener("workspace:switched", listener);
    };
  },

  // Hook Management
  listHooks: () => ipcRenderer.invoke("hook:list"),
  getHook: (id: string) => ipcRenderer.invoke("hook:get", id),
  createHook: (hookData: any) => ipcRenderer.invoke("hook:create", hookData),
  updateHook: (id: string, updates: any) =>
    ipcRenderer.invoke("hook:update", id, updates),
  deleteHook: (id: string) => ipcRenderer.invoke("hook:delete", id),
  setHookEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke("hook:setEnabled", id, enabled),
  reorderHooks: (hookIds: string[]) =>
    ipcRenderer.invoke("hook:reorder", hookIds),

  // Tool Management
  getServerTools: (serverId: string, clientId?: string) =>
    ipcRenderer.invoke("tool:getServerTools", serverId, clientId),
  getToolStatistics: (serverId: string, clientId?: string) =>
    ipcRenderer.invoke("tool:getStatistics", serverId, clientId),
  updateToolPreference: (serverId: string, preference: any, clientId?: string) =>
    ipcRenderer.invoke("tool:updatePreference", serverId, preference, clientId),
  bulkUpdateTools: (update: { serverId: string; clientId?: string; updates: any[] }) =>
    ipcRenderer.invoke("tool:bulkUpdate", update),
  enableAllTools: (serverId: string, clientId?: string) =>
    ipcRenderer.invoke("tool:enableAll", serverId, clientId),
  disableAllTools: (serverId: string, clientId?: string) =>
    ipcRenderer.invoke("tool:disableAll", serverId, clientId),
  resetToolPreferences: (serverId: string, clientId?: string) =>
    ipcRenderer.invoke("tool:resetPreferences", serverId, clientId),
  isToolEnabled: (serverId: string, toolName: string, clientId?: string) =>
    ipcRenderer.invoke("tool:isEnabled", serverId, toolName, clientId),
  getAvailableTools: (serverId: string, clientId?: string) =>
    ipcRenderer.invoke("tool:getAvailableTools", serverId, clientId),
});

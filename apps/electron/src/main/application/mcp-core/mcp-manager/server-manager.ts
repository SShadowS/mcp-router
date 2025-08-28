import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { MCPServer, MCPServerConfig } from "@mcp_router/shared";
import {
  getServerService,
  ServerService,
} from "@/main/domain/mcp-core/server/server-service";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  connectToMCPServer,
  substituteArgsParameters,
} from "@/main/domain/mcp-core/client/mcp-client-util";
import { LoggingService } from "./logging";
import { getToolFilterService } from "@/main/domain/mcp-core/tool/tool-filter-service";

/**
 * Core server lifecycle management
 */
export class ServerManager {
  private servers: Map<string, MCPServer> = new Map();
  private clients: Map<string, Client> = new Map();
  private serverNameToIdMap: Map<string, string> = new Map();
  private serverStatusMap: Map<string, boolean> = new Map();
  private serversDir: string;
  private serverService!: ServerService;
  private loggingService: LoggingService;

  constructor() {
    this.serversDir = path.join(app.getPath("userData"), "mcp-servers");
    if (!fs.existsSync(this.serversDir)) {
      fs.mkdirSync(this.serversDir, { recursive: true });
    }
    this.loggingService = new LoggingService(this.serverNameToIdMap);
  }

  /**
   * Initialize async operations
   */
  public async initializeAsync(): Promise<void> {
    try {
      console.log("[ServerManager] Initializing...");

      // Initialize server service
      this.serverService = getServerService();

      // Load servers from database
      await this.loadServersFromDatabase();

      console.log("[ServerManager] Initialization complete");
    } catch (error) {
      console.error("Failed to initialize Server Manager:", error);
    }
  }

  /**
   * Load servers from database
   */
  private async loadServersFromDatabase(): Promise<void> {
    try {
      console.log("[ServerManager] Loading servers from database...");
      const servers = this.serverService.getAllServers();
      console.log(
        `[ServerManager] Found ${servers.length} servers in database`,
      );

      for (const server of servers) {
        // Initialize all servers as stopped when loading
        server.status = "stopped";
        server.logs = [];
        this.servers.set(server.id, server);

        // Update server name to ID mapping
        this.updateServerNameMapping(server);

        // Auto start servers if configured
        if (server.autoStart && !server.disabled) {
          await this.startServer(server.id);
        }
      }

      console.log(`[ServerManager] ${servers.length} servers loaded`);
    } catch (error) {
      console.error("Error loading servers:", error);
    }
  }

  /**
   * Update server name to ID mapping
   */
  private updateServerNameMapping(server: MCPServer): void {
    this.serverNameToIdMap.set(server.name, server.id);
  }

  /**
   * Get server ID by name
   */
  public getServerIdByName(name: string): string | undefined {
    return this.serverNameToIdMap.get(name);
  }

  /**
   * Clear all servers from memory (used when switching workspaces)
   */
  public clearAllServers(): void {
    // Stop all running servers
    for (const [id] of this.clients) {
      try {
        this.stopServer(id);
      } catch (error) {
        console.error(`Failed to stop server ${id}:`, error);
      }
    }

    // Clear all maps
    this.servers.clear();
    this.clients.clear();
    this.serverNameToIdMap.clear();
    this.serverStatusMap.clear();
  }

  /**
   * Get a list of all MCP servers
   */
  public getServers(): MCPServer[] {
    // Get latest server info from database
    const dbServers = this.serverService.getAllServers();

    // Add servers from database that aren't in memory
    dbServers.forEach((server: any) => {
      if (!this.servers.has(server.id)) {
        this.servers.set(server.id, {
          ...server,
          status: "stopped",
          logs: [],
        });
        this.updateServerNameMapping(server);
      }
    });

    // Return servers with their current runtime status preserved
    return Array.from(this.servers.values()).map((server) => {
      const currentServer = this.servers.get(server.id);
      return currentServer || server;
    });
  }

  /**
   * Add a new MCP server
   */
  public addServer(config: MCPServerConfig): MCPServer {
    const newServer = this.serverService.addServer(config);
    this.servers.set(newServer.id, newServer);
    this.updateServerNameMapping(newServer);
    return newServer;
  }

  /**
   * Remove an MCP server
   */
  public removeServer(id: string): boolean {
    const server = this.servers.get(id);

    // Stop the server if it's running
    if (this.clients.has(id)) {
      this.stopServer(id);
    }

    // Remove server from all tokens
    this.removeServerFromTokens(id);

    // Remove from database
    const removed = this.serverService.deleteServer(id);

    // Remove from memory if successful
    if (removed && server) {
      this.serverNameToIdMap.delete(server.name);
      this.servers.delete(id);
    }

    return removed;
  }

  /**
   * Remove server ID from all tokens
   */
  private removeServerFromTokens(serverId: string): void {
    try {
      const tokenService =
        require("@/main/domain/mcp-core/token/token-service").getTokenService();
      const allTokens = tokenService.listTokens();

      for (const token of allTokens) {
        if (token.serverIds.includes(serverId)) {
          const updatedServerIds = token.serverIds.filter(
            (id: string) => id !== serverId,
          );
          tokenService.updateTokenServerAccess(token.id, updatedServerIds);
        }
      }
    } catch (error) {
      console.error(
        `Failed to update tokens for server removal ${serverId}:`,
        error,
      );
    }
  }

  /**
   * Start an MCP server
   */
  public async startServer(id: string, clientId?: string): Promise<boolean> {
    const server = this.servers.get(id);
    if (!server || server.disabled) {
      throw new Error(server ? "Server is disabled" : "Server not found");
    }

    // If already running, do nothing
    if (this.clients.has(id)) {
      return true;
    }

    server.status = "starting";
    const result = await this.connectToServerWithResult(id);

    if (result.status === "error") {
      server.status = "error";
      server.errorMessage = result.error;
      throw new Error(result.error);
    }

    this.clients.set(id, result.client);
    server.status = "running";
    server.errorMessage = undefined;

    // Register the client
    this.serverStatusMap.set(server.name, true);

    // Record log
    this.loggingService.recordRequestLog({
      timestamp: new Date().toISOString(),
      requestType: "StartServer",
      params: { serverName: server.name },
      result: "success",
      duration: 0,
      clientId: clientId || "unknownClient",
    });

    // Fetch and initialize tools after successful server start
    this.fetchAndInitializeTools(id, server.name, result.client);

    return true;
  }

  /**
   * Stop an MCP server
   */
  public stopServer(id: string, clientId?: string): boolean {
    const server = this.servers.get(id);
    if (!server) {
      return false;
    }

    const client = this.clients.get(id);
    if (!client) {
      server.status = "stopped";
      return true;
    }

    try {
      server.status = "stopping";

      // Unregister the client
      this.serverStatusMap.set(server.name, false);

      // Record log
      this.loggingService.recordRequestLog({
        timestamp: new Date().toISOString(),
        requestType: "StopServer",
        params: { serverName: server.name },
        result: "success",
        duration: 0,
        clientId: clientId || "unknownClient",
      });

      // Disconnect the client
      client.close();
      this.clients.delete(id);
      server.status = "stopped";
      return true;
    } catch (error) {
      server.status = "error";
      return false;
    }
  }

  /**
   * Update an MCP server's configuration
   */
  public updateServer(
    id: string,
    config: Partial<MCPServerConfig>,
  ): MCPServer | undefined {
    const oldServer = this.servers.get(id);
    if (oldServer && config.name && oldServer.name !== config.name) {
      this.serverNameToIdMap.delete(oldServer.name);
    }

    const updatedServer = this.serverService.updateServer(id, config);
    if (!updatedServer) {
      return undefined;
    }

    const server = this.servers.get(id);
    if (server) {
      const status = server.status;
      const logs = server.logs || [];
      Object.assign(server, updatedServer, { status, logs });
      this.updateServerNameMapping(server);
    }

    return updatedServer;
  }

  /**
   * Update tool permissions for a server
   */
  public updateServerToolPermissions(
    id: string,
    toolPermissions: Record<string, boolean>,
  ): MCPServer | null {
    const server = this.servers.get(id);
    if (!server) {
      return null;
    }

    const updatedConfig: Partial<MCPServerConfig> = { toolPermissions };
    const updatedServer = this.serverService.updateServer(id, updatedConfig);

    if (!updatedServer) {
      return null;
    }

    server.toolPermissions = toolPermissions;
    return server;
  }

  /**
   * Get the status of a specific MCP server
   */
  public getServerStatus(
    id: string,
  ): "running" | "starting" | "stopping" | "stopped" | "error" {
    const server = this.servers.get(id);
    return server?.status || "error";
  }

  /**
   * Connect to an MCP server
   */
  private async connectToServerWithResult(
    id: string,
  ): Promise<
    { status: "success"; client: Client } | { status: "error"; error: string }
  > {
    const server = this.servers.get(id);
    if (!server) {
      return { status: "error", error: "Server not found" };
    }

    try {
      const result = await connectToMCPServer(
        {
          id: server.id,
          name: server.name,
          serverType: server.serverType,
          command: server.command,
          args: server.args
            ? substituteArgsParameters(
                server.args,
                server.env || {},
                server.inputParams || {},
              )
            : undefined,
          remoteUrl: server.remoteUrl,
          bearerToken: server.bearerToken,
          env: server.env,
          inputParams: server.inputParams,
        },
        "mcp-router",
      );

      return result;
    } catch (error) {
      return {
        status: "error",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Get all maps for sharing with other components
   */
  public getMaps() {
    return {
      servers: this.servers,
      clients: this.clients,
      serverNameToIdMap: this.serverNameToIdMap,
      serverStatusMap: this.serverStatusMap,
    };
  }

  /**
   * Fetch and initialize tools for a server
   */
  private async fetchAndInitializeTools(
    serverId: string,
    serverName: string,
    client: Client,
  ): Promise<void> {
    try {
      console.log(`Fetching tools for server ${serverName}...`);

      // Fetch tools from the running client
      const response = await client.listTools();
      const tools = response.tools || [];

      // Debug: Log the raw response and tool structure
      console.log(
        "[ServerManager] Raw listTools response:",
        JSON.stringify(response, null, 2),
      );

      if (tools.length > 0) {
        console.log(`Fetched ${tools.length} tools from server ${serverName}`);
        console.log(
          "[ServerManager] First tool structure:",
          JSON.stringify(tools[0], null, 2),
        );

        // Initialize tool preferences for new tools
        const toolFilterService = getToolFilterService();
        toolFilterService.initializeServerTools(serverId, tools);

        // Clean up removed tools
        const currentToolNames = tools.map((t) => t.name);
        toolFilterService.cleanupRemovedTools(serverId, currentToolNames);

        console.log(`Tool preferences initialized for server ${serverName}`);
      } else {
        console.log(`No tools found for server ${serverName}`);
      }
    } catch (error) {
      console.error(`Failed to fetch tools for server ${serverName}:`, error);
      // Don't fail the server start operation if tool fetch fails
    }
  }

  /**
   * Shutdown all servers
   */
  public async shutdown(): Promise<void> {
    for (const [id] of this.clients) {
      this.stopServer(id);
    }
  }
}

import { ipcMain, dialog, BrowserWindow } from "electron";
import { MCPServerConfig, CreateServerInput } from "@mcp_router/shared";
import {
  fetchMcpServersFromIndex,
  fetchMcpServerVersionDetails,
} from "@/main/application/mcp-core/registry/mcp-fetcher";
import { processDxtFile } from "@/main/application/mcp-core/server-processors/dxt-processor";
import { getToolFilterService } from "@/main/domain/mcp-core/tool/tool-filter-service";
import { fetchToolsFromRunningServer } from "./tool-fetch-helper";
import { logInfo, logError } from "@/main/utils/logger";

export function setupMcpServerHandlers(): void {
  const getMCPServerManager = () => (global as any).getMCPServerManager();

  ipcMain.handle("mcp:list", () => {
    const mcpServerManager = getMCPServerManager();
    return mcpServerManager.getServers();
  });

  ipcMain.handle("mcp:start", async (_, id: string) => {
    const mcpServerManager = getMCPServerManager();
    const result = await mcpServerManager.startServer(id, "MCP Router UI");

    // If server started successfully, fetch and initialize tools
    if (result) {
      try {
        const servers = mcpServerManager.getServers();
        const server = servers.find((s: any) => s.id === id);

        if (server && server.status === "running") {
          logInfo(
            `Server ${server.name} started successfully, fetching tools...`,
          );

          const tools = await fetchToolsFromRunningServer(id, server.name);

          if (tools.length > 0) {
            logInfo(`Fetched ${tools.length} tools from server ${server.name}`);

            // Initialize tool preferences for new tools
            const toolFilterService = getToolFilterService();
            toolFilterService.initializeServerTools(id, tools);

            // Clean up removed tools
            const currentToolNames = tools.map((t) => t.name);
            toolFilterService.cleanupRemovedTools(id, currentToolNames);

            logInfo(`Tool preferences initialized for server ${server.name}`);
          } else {
            logInfo(`No tools found for server ${server.name}`);
          }
        }
      } catch (error) {
        logError(`Failed to fetch tools after server start`, error);
        // Don't fail the server start operation if tool fetch fails
      }
    }

    return result;
  });

  ipcMain.handle("mcp:stop", (_, id: string) => {
    const mcpServerManager = getMCPServerManager();
    const result = mcpServerManager.stopServer(id, "MCP Router UI");
    return result;
  });

  ipcMain.handle("mcp:add", async (_, input: CreateServerInput) => {
    const mcpServerManager = getMCPServerManager();
    let server = null;

    try {
      let serverConfig: MCPServerConfig;

      // Process based on input type
      if (input.type === "dxt" && input.dxtFile) {
        // Process DXT file
        serverConfig = await processDxtFile(input.dxtFile);
      } else if (input.type === "config" && input.config) {
        // Use config directly (validation will be done by addServer)
        serverConfig = input.config;
      } else {
        throw new Error("Invalid input: missing config or dxtFile");
      }

      // Add the server to the manager
      server = mcpServerManager.addServer(serverConfig);

      // For remote servers, test the connection
      if (serverConfig.serverType !== "local") {
        await mcpServerManager.startServer(server.id);
        mcpServerManager.stopServer(server.id);
      }

      return server;
    } catch (error: any) {
      if (server && server?.id && server?.serverType !== "local") {
        mcpServerManager.removeServer(server?.id);
      }
      throw error;
    }
  });

  ipcMain.handle("mcp:remove", (_, id: string) => {
    const mcpServerManager = getMCPServerManager();
    const result = mcpServerManager.removeServer(id);
    return result;
  });

  ipcMain.handle(
    "mcp:update-config",
    (_, id: string, config: Partial<MCPServerConfig>) => {
      const mcpServerManager = getMCPServerManager();
      const result = mcpServerManager.updateServer(id, config);
      return result;
    },
  );

  ipcMain.handle(
    "mcp:fetch-from-index",
    async (
      _,
      page?: number,
      limit?: number,
      search?: string,
      isVerified?: boolean,
    ) => {
      return await fetchMcpServersFromIndex(page, limit, search, isVerified);
    },
  );

  ipcMain.handle(
    "mcp:fetch-server-version-details",
    async (_, displayId: string, version: string) => {
      return await fetchMcpServerVersionDetails(displayId, version);
    },
  );

  // ファイル/ディレクトリ選択ダイアログ
  ipcMain.handle(
    "server:selectFile",
    async (
      _event,
      options?: {
        title?: string;
        mode?: "file" | "directory";
        filters?: { name: string; extensions: string[] }[];
      },
    ) => {
      const browserWindow = BrowserWindow.getFocusedWindow();
      if (!browserWindow) {
        return { success: false, error: "No focused window" };
      }

      try {
        const isDirectory = options?.mode === "directory";
        const result = await dialog.showOpenDialog(browserWindow, {
          title:
            options?.title ||
            (isDirectory ? "Select Directory" : "Select File"),
          properties: isDirectory ? ["openDirectory"] : ["openFile"],
          filters:
            !isDirectory && options?.filters
              ? options.filters
              : [{ name: "All Files", extensions: ["*"] }],
        });

        if (result.canceled) {
          return { success: false, canceled: true };
        }

        return { success: true, path: result.filePaths[0] };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );
}

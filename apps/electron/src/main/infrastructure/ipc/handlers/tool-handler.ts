import { ipcMain, IpcMainInvokeEvent } from "electron";
import {
  ServerTool,
  ToolPreferenceUpdate,
  ToolStatistics,
  BulkToolUpdate,
} from "@mcp_router/shared";
import { getToolFilterService } from "@/main/domain/mcp-core/tool/tool-filter-service";
import { getServerService } from "@/main/domain/mcp-core/server/server-service";
import { logInfo, logError } from "@/main/utils/logger";
import { fetchToolsFromRunningServer } from "./tool-fetch-helper";

/**
 * Register tool management IPC handlers
 */
export function registerToolHandlers(): void {
  const toolFilterService = getToolFilterService();

  /**
   * Get all tool preferences for a server
   * First tries to fetch from aggregator if server is running to ensure fresh data
   */
  ipcMain.handle(
    "tool:getServerTools",
    async (
      _event: IpcMainInvokeEvent,
      serverId: string,
    ): Promise<ServerTool[]> => {
      try {
        logInfo(`Getting tool preferences for server: ${serverId}`);

        // Get server info
        const serverService = getServerService();
        const server = serverService.getServerById(serverId);

        if (!server) {
          logError(`Server not found: ${serverId}`);
          return [];
        }

        // If server is running, fetch fresh tools directly
        if (server.status === "running") {
          logInfo(`Server ${server.name} is running, fetching fresh tools`);

          try {
            // Try to fetch tools from the running server
            const tools = await fetchToolsFromRunningServer(
              serverId,
              server.name,
            );

            if (tools.length > 0) {
              logInfo(
                `Fetched ${tools.length} tools from server ${server.name}`,
              );

              // Initialize tool preferences for new tools
              toolFilterService.initializeServerTools(serverId, tools);

              // Clean up removed tools
              const currentToolNames = tools.map((t) => t.name);
              toolFilterService.cleanupRemovedTools(serverId, currentToolNames);
            } else {
              logInfo(
                `No tools fetched from server ${server.name}, it may not have any tools`,
              );
            }
          } catch (error) {
            logError(`Failed to fetch tools from server ${server.name}`, error);
          }
        } else {
          logInfo(
            `Server ${server.name} is not running, returning cached preferences`,
          );
        }

        // Return the preferences from database (now updated if server was running)
        const preferences =
          toolFilterService.getServerToolPreferences(serverId);
        logInfo(
          `Returning ${preferences.length} tool preferences for server ${server.name}`,
        );

        // Debug log to check if descriptions are present
        if (preferences.length > 0) {
          const sampleTool = preferences[0];
          logInfo(
            `Sample tool data - Name: ${sampleTool.toolName}, OriginalDesc: ${sampleTool.originalDescription?.substring(0, 50)}...`,
          );
        }

        return preferences;
      } catch (error) {
        logError("Failed to get server tools", error);
        throw error;
      }
    },
  );

  /**
   * Get tool statistics for a server
   */
  ipcMain.handle(
    "tool:getStatistics",
    async (
      _event: IpcMainInvokeEvent,
      serverId: string,
    ): Promise<ToolStatistics> => {
      try {
        logInfo(`Getting tool statistics for server: ${serverId}`);
        return toolFilterService.getToolStatistics(serverId);
      } catch (error) {
        logError("Failed to get tool statistics", error);
        throw error;
      }
    },
  );

  /**
   * Update a single tool preference
   */
  ipcMain.handle(
    "tool:updatePreference",
    async (
      _event: IpcMainInvokeEvent,
      serverId: string,
      preference: ToolPreferenceUpdate,
    ): Promise<ServerTool | undefined> => {
      try {
        logInfo(
          `Updating tool preference: ${preference.toolName} for server: ${serverId}`,
        );
        return toolFilterService.updateToolPreference(serverId, preference);
      } catch (error) {
        logError("Failed to update tool preference", error);
        throw error;
      }
    },
  );

  /**
   * Bulk update tool preferences
   */
  ipcMain.handle(
    "tool:bulkUpdate",
    async (
      _event: IpcMainInvokeEvent,
      update: BulkToolUpdate,
    ): Promise<ServerTool[]> => {
      try {
        logInfo(
          `Bulk updating ${update.updates.length} tool preferences for server: ${update.serverId}`,
        );
        return toolFilterService.bulkUpdateToolPreferences(
          update.serverId,
          update.updates,
        );
      } catch (error) {
        logError("Failed to bulk update tools", error);
        throw error;
      }
    },
  );

  /**
   * Enable all tools for a server
   */
  ipcMain.handle(
    "tool:enableAll",
    async (_event: IpcMainInvokeEvent, serverId: string): Promise<void> => {
      try {
        logInfo(`Enabling all tools for server: ${serverId}`);
        toolFilterService.enableAllTools(serverId);
      } catch (error) {
        logError("Failed to enable all tools", error);
        throw error;
      }
    },
  );

  /**
   * Disable all tools for a server
   */
  ipcMain.handle(
    "tool:disableAll",
    async (_event: IpcMainInvokeEvent, serverId: string): Promise<void> => {
      try {
        logInfo(`Disabling all tools for server: ${serverId}`);
        toolFilterService.disableAllTools(serverId);
      } catch (error) {
        logError("Failed to disable all tools", error);
        throw error;
      }
    },
  );

  /**
   * Reset tool preferences for a server
   */
  ipcMain.handle(
    "tool:resetPreferences",
    async (_event: IpcMainInvokeEvent, serverId: string): Promise<boolean> => {
      try {
        logInfo(`Resetting tool preferences for server: ${serverId}`);
        return toolFilterService.resetToolPreferences(serverId);
      } catch (error) {
        logError("Failed to reset tool preferences", error);
        throw error;
      }
    },
  );

  /**
   * Check if a specific tool is enabled
   */
  ipcMain.handle(
    "tool:isEnabled",
    async (
      _event: IpcMainInvokeEvent,
      serverId: string,
      toolName: string,
    ): Promise<boolean> => {
      try {
        return toolFilterService.isToolEnabled(serverId, toolName);
      } catch (error) {
        logError("Failed to check tool status", error);
        throw error;
      }
    },
  );

  /**
   * Get available tools from a connected server
   * This fetches the actual tools from the MCP server
   */
  ipcMain.handle(
    "tool:getAvailableTools",
    async (_event: IpcMainInvokeEvent, serverId: string): Promise<any[]> => {
      try {
        logInfo(`Getting available tools from server: ${serverId}`);

        // This would need to be implemented to fetch tools from the actual MCP server
        // For now, we'll return the stored preferences
        const preferences =
          toolFilterService.getServerToolPreferences(serverId);
        return preferences.map((p) => ({
          name: p.toolName,
          enabled: p.enabled,
          customName: p.customName,
          customDescription: p.customDescription,
        }));
      } catch (error) {
        logError("Failed to get available tools", error);
        throw error;
      }
    },
  );
}

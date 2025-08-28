import { SingletonService } from "@/main/application/core/singleton-service";
import {
  ServerTool,
  ToolPreferenceUpdate,
  ToolWithMetadata,
  ToolStatistics,
} from "@mcp_router/shared";
import { getServerToolsRepository } from "@/main/infrastructure/database";
import { logInfo, logError } from "@/main/utils/logger";

/**
 * Service for managing tool filtering and preferences
 */
export class ToolFilterService extends SingletonService<
  ServerTool,
  string,
  ToolFilterService
> {
  private toolPreferencesCache: Map<string, Map<string, ServerTool>> =
    new Map();

  protected constructor() {
    super();
  }

  protected getEntityName(): string {
    return "ToolFilter";
  }

  public static getInstance(): ToolFilterService {
    return (this as any).getInstanceBase();
  }

  public static resetInstance(): void {
    this.resetInstanceBase(ToolFilterService);
  }

  /**
   * Get all tool preferences for a server
   * @param serverId Server ID
   * @param clientId Optional client ID for client-specific preferences
   */
  public getServerToolPreferences(
    serverId: string,
    clientId?: string,
  ): ServerTool[] {
    try {
      return getServerToolsRepository().getServerTools(serverId, clientId);
    } catch (error) {
      return this.handleError(
        `Getting preferences for server ${serverId}`,
        error,
        [],
      );
    }
  }

  /**
   * Get preference for a specific tool
   * @param serverId Server ID
   * @param toolName Tool name
   * @param clientId Optional client ID for client-specific preferences
   */
  public getToolPreference(
    serverId: string,
    toolName: string,
    clientId?: string,
  ): ServerTool | undefined {
    try {
      // Cache key includes clientId
      const cacheKey = `${serverId}:${clientId || "global"}`;
      const serverCache = this.toolPreferencesCache.get(cacheKey);
      if (serverCache?.has(toolName)) {
        return serverCache.get(toolName);
      }

      // Get from database
      const preference = getServerToolsRepository().getServerTool(
        serverId,
        toolName,
        clientId,
      );

      // Update cache if found
      if (preference) {
        this.updateCache(cacheKey, toolName, preference);
      }

      return preference;
    } catch (error) {
      return this.handleError(
        `Getting preference for tool ${toolName}`,
        error,
        undefined,
      );
    }
  }

  /**
   * Check if a tool is enabled (default: true if no preference exists)
   * @param serverId Server ID
   * @param toolName Tool name
   * @param clientId Optional client ID for client-specific preferences
   */
  public isToolEnabled(
    serverId: string,
    toolName: string,
    clientId?: string,
  ): boolean {
    const preference = this.getToolPreference(serverId, toolName, clientId);
    return preference ? preference.enabled : true; // Default to enabled
  }

  /**
   * Update tool preference
   */
  public updateToolPreference(
    serverId: string,
    preference: ToolPreferenceUpdate,
  ): ServerTool | undefined {
    try {
      const result = getServerToolsRepository().upsertToolPreference(
        serverId,
        preference,
      );

      // Update cache
      if (result) {
        const cacheKey = `${serverId}:${preference.clientId || "global"}`;
        this.updateCache(cacheKey, preference.toolName, result);
        logInfo(
          `Tool preference updated: ${preference.toolName} for server ${serverId}${preference.clientId ? ` (client: ${preference.clientId})` : ""}`,
        );
      }

      return result;
    } catch (error) {
      return this.handleError(
        `Updating preference for tool ${preference.toolName}`,
        error,
        undefined,
      );
    }
  }

  /**
   * Bulk update tool preferences
   */
  public bulkUpdateToolPreferences(
    serverId: string,
    preferences: ToolPreferenceUpdate[],
    clientId?: string,
  ): ServerTool[] {
    try {
      const results = getServerToolsRepository().bulkUpdateToolPreferences(
        serverId,
        preferences,
        clientId,
      );

      // Clear cache for this server/client combination to force refresh
      const cacheKey = `${serverId}:${clientId || "global"}`;
      this.toolPreferencesCache.delete(cacheKey);

      logInfo(
        `Bulk updated ${preferences.length} tool preferences for server ${serverId}${clientId ? ` (client: ${clientId})` : ""}`,
      );
      return results;
    } catch (error) {
      return this.handleError(
        `Bulk updating preferences for server ${serverId}`,
        error,
        [],
      );
    }
  }

  /**
   * Enable all tools for a server
   */
  public enableAllTools(serverId: string): void {
    try {
      getServerToolsRepository().enableAllTools(serverId);
      this.toolPreferencesCache.delete(serverId);
      logInfo(`All tools enabled for server ${serverId}`);
    } catch (error) {
      this.handleError(`Enabling all tools for server ${serverId}`, error);
    }
  }

  /**
   * Disable all tools for a server
   */
  public disableAllTools(serverId: string): void {
    try {
      getServerToolsRepository().disableAllTools(serverId);
      this.toolPreferencesCache.delete(serverId);
      logInfo(`All tools disabled for server ${serverId}`);
    } catch (error) {
      this.handleError(`Disabling all tools for server ${serverId}`, error);
    }
  }

  /**
   * Filter tools based on preferences
   */
  public filterTools(
    tools: any[],
    serverId: string,
    serverName: string,
    clientId?: string,
  ): ToolWithMetadata[] {
    const preferences = this.getServerToolPreferences(serverId, clientId);
    const preferenceMap = new Map(preferences.map((p) => [p.toolName, p]));

    return tools
      .map((tool) => {
        const preference = preferenceMap.get(tool.name);
        const enabled = preference ? preference.enabled : true;

        const toolWithMetadata: ToolWithMetadata = {
          name: preference?.customName || tool.name,
          description: preference?.customDescription || tool.description,
          inputSchema: tool.inputSchema,
          enabled,
          customName: preference?.customName,
          customDescription: preference?.customDescription,
          serverName,
          serverId,
        };

        return toolWithMetadata;
      })
      .filter((tool) => tool.enabled); // Only return enabled tools
  }

  /**
   * Get tool statistics for a server
   */
  public getToolStatistics(serverId: string): ToolStatistics {
    try {
      return getServerToolsRepository().getToolStatistics(serverId);
    } catch (error) {
      return this.handleError(
        `Getting tool statistics for server ${serverId}`,
        error,
        {
          total: 0,
          enabled: 0,
          disabled: 0,
          customized: 0,
        },
      );
    }
  }

  /**
   * Initialize tool preferences for a new server
   * This is called when a server is first connected and tools are discovered
   */
  public initializeServerTools(
    serverId: string,
    tools: any[],
    defaultEnabled: boolean = true,
  ): void {
    try {
      const existingPreferences = this.getServerToolPreferences(serverId);
      const existingToolMap = new Map(
        existingPreferences.map((p) => [p.toolName, p]),
      );

      const preferences: ToolPreferenceUpdate[] = tools
        .map((tool) => {
          const existing = existingToolMap.get(tool.name);

          // For existing tools, update description if it changed (or if it was previously empty)
          if (existing) {
            const descriptionChanged =
              existing.originalDescription !== tool.description;
            const wasEmpty = !existing.originalDescription && tool.description;

            if (descriptionChanged || wasEmpty) {
              return {
                toolName: tool.name,
                enabled: existing.enabled, // Preserve enabled state
                originalDescription: tool.description,
                customName: existing.customName, // Preserve custom name
                customDescription: existing.customDescription, // Preserve custom description
              };
            }
            return null; // No update needed
          }

          // For new tools, create with defaults
          logInfo(
            `[ToolFilterService] Tool "${tool.name}" description: ${tool.description}`,
          );
          return {
            toolName: tool.name,
            enabled: defaultEnabled,
            originalDescription: tool.description,
          };
        })
        .filter((p) => p !== null) as ToolPreferenceUpdate[];

      if (preferences.length > 0) {
        this.bulkUpdateToolPreferences(serverId, preferences);

        const newTools = preferences.filter(
          (p) => !existingToolMap.has(p.toolName),
        );
        const updatedTools = preferences.filter((p) =>
          existingToolMap.has(p.toolName),
        );

        if (newTools.length > 0) {
          logInfo(
            `Initialized ${newTools.length} new tool preferences for server ${serverId}`,
          );
        }
        if (updatedTools.length > 0) {
          logInfo(
            `Updated ${updatedTools.length} existing tool descriptions for server ${serverId}`,
          );
        }
      }
    } catch (error) {
      this.handleError(`Initializing tools for server ${serverId}`, error);
    }
  }

  /**
   * Clean up tool preferences for removed tools
   */
  public cleanupRemovedTools(serverId: string, currentTools: string[]): void {
    try {
      const preferences = this.getServerToolPreferences(serverId);
      const currentToolSet = new Set(currentTools);

      const toRemove = preferences.filter(
        (p) => !currentToolSet.has(p.toolName),
      );

      if (toRemove.length > 0) {
        toRemove.forEach((p) => {
          getServerToolsRepository().deleteToolPreference(serverId, p.toolName);
        });

        // Clear cache
        this.toolPreferencesCache.delete(serverId);

        logInfo(
          `Cleaned up ${toRemove.length} removed tool preferences for server ${serverId}`,
        );
      }
    } catch (error) {
      this.handleError(`Cleaning up tools for server ${serverId}`, error);
    }
  }

  /**
   * Reset tool preferences for a server
   */
  public resetToolPreferences(serverId: string): boolean {
    try {
      const result =
        getServerToolsRepository().deleteServerToolPreferences(serverId);
      this.toolPreferencesCache.delete(serverId);
      logInfo(`Tool preferences reset for server ${serverId}`);
      return result;
    } catch (error) {
      return this.handleError(
        `Resetting preferences for server ${serverId}`,
        error,
        false,
      );
    }
  }

  /**
   * Update cache
   */
  private updateCache(
    serverId: string,
    toolName: string,
    preference: ServerTool,
  ): void {
    if (!this.toolPreferencesCache.has(serverId)) {
      this.toolPreferencesCache.set(serverId, new Map());
    }
    this.toolPreferencesCache.get(serverId)!.set(toolName, preference);
  }

  /**
   * Clear all caches
   */
  public clearCache(): void {
    this.toolPreferencesCache.clear();
  }
}

/**
 * Get singleton instance of ToolFilterService
 */
export function getToolFilterService(): ToolFilterService {
  return ToolFilterService.getInstance();
}

import { BaseRepository } from "../../core/base-repository";
import { SqliteManager } from "../../core/sqlite-manager";
import { ServerTool, ToolPreferenceUpdate } from "@mcp_router/shared";
import { v4 as uuidv4 } from "uuid";

/**
 * Repository for managing server tool preferences
 */
export class ServerToolsRepository extends BaseRepository<ServerTool> {
  constructor(db: SqliteManager) {
    super(db, "server_tools");
  }

  /**
   * Initialize the server_tools table
   */
  protected initializeTable(): void {
    // Table initialization is handled by database migration
    // This is just to satisfy the abstract method requirement
  }

  /**
   * Map database row to ServerTool entity
   */
  protected mapRowToEntity(row: any): ServerTool {
    return this.mapRowToServerTool(row);
  }

  /**
   * Map ServerTool entity to database row
   */
  protected mapEntityToRow(entity: ServerTool): Record<string, any> {
    return {
      id: entity.id,
      server_id: entity.serverId,
      tool_name: entity.toolName,
      enabled: entity.enabled ? 1 : 0,
      original_description: entity.originalDescription || null,
      custom_name: entity.customName || null,
      custom_description: entity.customDescription || null,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }
  /**
   * Get all tool preferences for a server
   * @param serverId Server ID
   * @param clientId Optional client ID for client-specific preferences
   */
  public getServerTools(serverId: string, clientId?: string): ServerTool[] {
    let stmt;
    if (clientId) {
      // Get both global and client-specific preferences
      stmt = this.db.prepare(`
        SELECT * FROM server_tools 
        WHERE server_id = ? 
        AND (client_id IS NULL OR client_id = ?)
        ORDER BY tool_name, client_id DESC
      `);
      const rows = stmt.all(serverId, clientId) as any[];
      // De-duplicate, preferring client-specific over global
      const toolMap = new Map<string, ServerTool>();
      rows.forEach((row) => {
        const tool = this.mapRowToServerTool(row);
        if (!toolMap.has(tool.toolName) || tool.clientId) {
          toolMap.set(tool.toolName, tool);
        }
      });
      return Array.from(toolMap.values());
    } else {
      // Get only global preferences
      stmt = this.db.prepare(`
        SELECT * FROM server_tools 
        WHERE server_id = ? AND client_id IS NULL
        ORDER BY tool_name
      `);
      const rows = stmt.all(serverId) as any[];
      return rows.map(this.mapRowToServerTool);
    }
  }

  /**
   * Get a specific tool preference
   * @param serverId Server ID
   * @param toolName Tool name
   * @param clientId Optional client ID for client-specific preferences
   */
  public getServerTool(
    serverId: string,
    toolName: string,
    clientId?: string,
  ): ServerTool | undefined {
    if (clientId) {
      // First try to get client-specific preference
      const clientStmt = this.db.prepare(`
        SELECT * FROM server_tools 
        WHERE server_id = ? AND tool_name = ? AND client_id = ?
      `);
      const clientRow = clientStmt.get(serverId, toolName, clientId) as any;
      if (clientRow) {
        return this.mapRowToServerTool(clientRow);
      }

      // Fall back to global preference
      const globalStmt = this.db.prepare(`
        SELECT * FROM server_tools 
        WHERE server_id = ? AND tool_name = ? AND client_id IS NULL
      `);
      const globalRow = globalStmt.get(serverId, toolName) as any;
      return globalRow ? this.mapRowToServerTool(globalRow) : undefined;
    } else {
      // Get only global preference
      const stmt = this.db.prepare(`
        SELECT * FROM server_tools 
        WHERE server_id = ? AND tool_name = ? AND client_id IS NULL
      `);
      const row = stmt.get(serverId, toolName) as any;
      return row ? this.mapRowToServerTool(row) : undefined;
    }
  }

  /**
   * Add or update a tool preference
   */
  public upsertToolPreference(
    serverId: string,
    preference: ToolPreferenceUpdate,
  ): ServerTool {
    const now = Date.now();
    const existing = this.getServerTool(
      serverId,
      preference.toolName,
      preference.clientId,
    );

    if (existing) {
      // Update existing
      const updateStmt = this.db.prepare(`
        UPDATE server_tools 
        SET enabled = ?, 
            original_description = COALESCE(?, original_description),
            custom_name = ?, 
            custom_description = ?, 
            updated_at = ?
        WHERE server_id = ? AND tool_name = ? AND ${preference.clientId ? "client_id = ?" : "client_id IS NULL"}
      `);

      const params = [
        preference.enabled ? 1 : 0,
        preference.originalDescription || null,
        preference.customName || null,
        preference.customDescription || null,
        now,
        serverId,
        preference.toolName,
      ];

      if (preference.clientId) {
        params.push(preference.clientId);
      }

      updateStmt.run(...params);

      return this.getServerTool(
        serverId,
        preference.toolName,
        preference.clientId,
      )!;
    } else {
      // Insert new
      const id = uuidv4();
      const stmt = this.db.prepare(`
        INSERT INTO server_tools (
          id, server_id, tool_name, client_id, enabled, 
          original_description, custom_name, custom_description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        serverId,
        preference.toolName,
        preference.clientId || null,
        preference.enabled ? 1 : 0,
        preference.originalDescription || null,
        preference.customName || null,
        preference.customDescription || null,
        now,
        now,
      );

      return this.getServerTool(
        serverId,
        preference.toolName,
        preference.clientId,
      )!;
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
    // Group preferences by whether they have the same clientId
    const clientPrefs = preferences.filter((p) => p.clientId === clientId);

    const updateStmt = this.db.prepare(`
      UPDATE server_tools 
      SET enabled = ?, 
          original_description = COALESCE(?, original_description),
          custom_name = ?, 
          custom_description = ?, 
          updated_at = ?
      WHERE server_id = ? AND tool_name = ? AND ${clientId ? "client_id = ?" : "client_id IS NULL"}
    `);

    const insertStmt = this.db.prepare(`
      INSERT INTO server_tools (
        id, server_id, tool_name, client_id, enabled, 
        original_description, custom_name, custom_description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();

    this.db.transaction(() => {
      for (const pref of clientPrefs) {
        const existing = this.getServerTool(serverId, pref.toolName, clientId);

        if (existing) {
          const params = [
            pref.enabled ? 1 : 0,
            pref.originalDescription || null,
            pref.customName || null,
            pref.customDescription || null,
            now,
            serverId,
            pref.toolName,
          ];
          if (clientId) {
            params.push(clientId);
          }
          updateStmt.run(...params);
        } else {
          insertStmt.run(
            uuidv4(),
            serverId,
            pref.toolName,
            clientId || null,
            pref.enabled ? 1 : 0,
            pref.originalDescription || null,
            pref.customName || null,
            pref.customDescription || null,
            now,
            now,
          );
        }
      }
    });

    return this.getServerTools(serverId, clientId);
  }

  /**
   * Delete tool preferences for a server
   */
  public deleteServerToolPreferences(serverId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM server_tools WHERE server_id = ?
    `);

    const result = stmt.run(serverId);
    return result.changes > 0;
  }

  /**
   * Delete a specific tool preference
   */
  public deleteToolPreference(serverId: string, toolName: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM server_tools 
      WHERE server_id = ? AND tool_name = ?
    `);

    const result = stmt.run(serverId, toolName);
    return result.changes > 0;
  }

  /**
   * Get tool statistics for a server
   */
  public getToolStatistics(serverId: string): {
    total: number;
    enabled: number;
    disabled: number;
    customized: number;
  } {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled,
        SUM(CASE WHEN enabled = 0 THEN 1 ELSE 0 END) as disabled,
        SUM(CASE WHEN custom_name IS NOT NULL OR custom_description IS NOT NULL THEN 1 ELSE 0 END) as customized
      FROM server_tools 
      WHERE server_id = ?
    `);

    const row = stmt.get(serverId) as any;
    return {
      total: row.total || 0,
      enabled: row.enabled || 0,
      disabled: row.disabled || 0,
      customized: row.customized || 0,
    };
  }

  /**
   * Enable all tools for a server
   */
  public enableAllTools(serverId: string): void {
    const stmt = this.db.prepare(`
      UPDATE server_tools 
      SET enabled = 1, updated_at = ?
      WHERE server_id = ?
    `);

    stmt.run(Date.now(), serverId);
  }

  /**
   * Disable all tools for a server
   */
  public disableAllTools(serverId: string): void {
    const stmt = this.db.prepare(`
      UPDATE server_tools 
      SET enabled = 0, updated_at = ?
      WHERE server_id = ?
    `);

    stmt.run(Date.now(), serverId);
  }

  /**
   * Map database row to ServerTool object (helper method)
   */
  private mapRowToServerTool(row: any): ServerTool {
    return {
      id: row.id,
      serverId: row.server_id,
      toolName: row.tool_name,
      clientId: row.client_id,
      enabled: row.enabled === 1,
      originalDescription: row.original_description,
      customName: row.custom_name,
      customDescription: row.custom_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

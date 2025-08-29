import { ipcMain, dialog } from "electron";
import { OAuthService } from "../../../domain/mcp-core/oauth";
import { OAuthSecurityService } from "../../../domain/mcp-core/oauth/oauth-security";
import { OAuthBackupService } from "../../../domain/mcp-core/oauth/oauth-backup";
import { OAuthMigrationService } from "../../../domain/mcp-core/oauth/oauth-migration";
import { getServerRepository } from "../../database";
import type {
  OAuthConfig,
  OAuthStatus,
  OAuthFlowResult,
  OAuthServerMetadata,
  OAuthProvider,
} from "@mcp_router/shared";

/**
 * OAuth IPC handler for managing OAuth authentication
 */
export class OAuthHandler {
  private oauthService: OAuthService;
  private securityService: OAuthSecurityService;
  private backupService: OAuthBackupService;
  private migrationService: OAuthMigrationService;

  constructor() {
    this.oauthService = OAuthService.getInstance();
    this.securityService = OAuthSecurityService.getInstance();
    this.backupService = OAuthBackupService.getInstance();
    this.migrationService = OAuthMigrationService.getInstance();
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Configure OAuth for a server
    ipcMain.handle(
      "oauth:configure",
      async (
        _,
        serverId: string,
        provider: OAuthProvider | string,
        config: Partial<OAuthConfig>,
      ) => {
        try {
          // Cast config to match the expected type
          const configWithCast = config.provider
            ? { ...config, provider: config.provider as OAuthProvider }
            : config;
          return await this.oauthService.configureOAuth(
            serverId,
            provider as OAuthProvider,
            configWithCast as any,
          );
        } catch (error) {
          console.error("Failed to configure OAuth:", error);
          throw error;
        }
      },
    );

    // Authenticate with OAuth provider
    ipcMain.handle(
      "oauth:authenticate",
      async (_, serverId: string, scopes?: string[]) => {
        try {
          return await this.oauthService.authenticate(serverId, scopes);
        } catch (error) {
          console.error("OAuth authentication failed:", error);
          throw error;
        }
      },
    );

    // Get OAuth status for a server
    ipcMain.handle("oauth:getStatus", async (_, serverId: string) => {
      try {
        return await this.oauthService.getOAuthStatus(serverId);
      } catch (error) {
        console.error("Failed to get OAuth status:", error);
        throw error;
      }
    });

    // Get access token for a server
    ipcMain.handle("oauth:getAccessToken", async (_, serverId: string) => {
      try {
        return await this.oauthService.getAccessToken(serverId);
      } catch (error) {
        console.error("Failed to get access token:", error);
        throw error;
      }
    });

    // Refresh token for a server
    ipcMain.handle("oauth:refreshToken", async (_, serverId: string) => {
      try {
        return await this.oauthService.refreshToken(serverId);
      } catch (error) {
        console.error("Failed to refresh token:", error);
        throw error;
      }
    });

    // Revoke OAuth access for a server
    ipcMain.handle("oauth:revokeAccess", async (_, serverId: string) => {
      try {
        return await this.oauthService.revokeAccess(serverId);
      } catch (error) {
        console.error("Failed to revoke OAuth access:", error);
        throw error;
      }
    });

    // Discover OAuth endpoints
    ipcMain.handle(
      "oauth:discoverEndpoints",
      async (_, serverUrl: string, provider?: OAuthProvider) => {
        try {
          return await this.oauthService.discoverEndpoints(serverUrl, provider);
        } catch (error) {
          console.error("Failed to discover OAuth endpoints:", error);
          throw error;
        }
      },
    );

    // Get OAuth configuration for a server
    ipcMain.handle("oauth:getConfiguration", async (_, serverId: string) => {
      try {
        return await this.oauthService.exportConfiguration(serverId);
      } catch (error) {
        console.error("Failed to get OAuth configuration:", error);
        throw error;
      }
    });

    // Update OAuth configuration
    ipcMain.handle(
      "oauth:updateConfiguration",
      async (_, serverId: string, updates: Partial<OAuthConfig>) => {
        try {
          // Cast provider if present
          const updatesWithCast = updates.provider
            ? { ...updates, provider: updates.provider as OAuthProvider }
            : updates;
          return await this.oauthService.updateConfiguration(
            serverId,
            updatesWithCast as any,
          );
        } catch (error) {
          console.error("Failed to update OAuth configuration:", error);
          throw error;
        }
      },
    );

    // Remove OAuth configuration
    ipcMain.handle("oauth:removeConfiguration", async (_, serverId: string) => {
      try {
        return await this.oauthService.removeConfiguration(serverId);
      } catch (error) {
        console.error("Failed to remove OAuth configuration:", error);
        throw error;
      }
    });

    // Check if server has OAuth configuration
    ipcMain.handle("oauth:hasConfiguration", async (_, serverId: string) => {
      try {
        return this.oauthService.hasOAuthConfiguration(serverId);
      } catch (error) {
        console.error("Failed to check OAuth configuration:", error);
        throw error;
      }
    });

    // Check if server has valid token
    ipcMain.handle("oauth:hasValidToken", async (_, serverId: string) => {
      try {
        return this.oauthService.hasValidToken(serverId);
      } catch (error) {
        console.error("Failed to check valid token:", error);
        throw error;
      }
    });

    // Get all OAuth configurations
    ipcMain.handle("oauth:getAllConfigurations", async () => {
      try {
        return this.oauthService.getAllConfigurations();
      } catch (error) {
        console.error("Failed to get all OAuth configurations:", error);
        throw error;
      }
    });

    // Import OAuth configuration
    ipcMain.handle(
      "oauth:importConfiguration",
      async (_, serverId: string, config: Partial<OAuthConfig>) => {
        try {
          // Cast provider if present
          const configWithCast = config.provider
            ? { ...config, provider: config.provider as OAuthProvider }
            : config;
          return await this.oauthService.importConfiguration(
            serverId,
            configWithCast as any,
          );
        } catch (error) {
          console.error("Failed to import OAuth configuration:", error);
          throw error;
        }
      },
    );

    // Get all OAuth sessions
    ipcMain.handle("oauth:getAllSessions", async () => {
      try {
        const serversRepo = getServerRepository();
        const servers = await serversRepo.getAllServers();
        const sessions = await Promise.all(
          servers.map(async (server) => {
            const status = await this.oauthService.getOAuthStatus(server.id);
            return {
              serverId: server.id,
              serverName: server.name,
              provider: status.provider || "unknown",
              authenticated: status.authenticated,
              expiresAt: status.expiresAt,
              lastRefresh: status.lastRefresh,
              scopes: status.scopes,
              error: status.error,
            };
          }),
        );
        return sessions.filter((s) =>
          this.oauthService.hasOAuthConfiguration(s.serverId),
        );
      } catch (error) {
        console.error("Failed to get all OAuth sessions:", error);
        throw error;
      }
    });

    // Get security metrics
    ipcMain.handle("oauth:getSecurityMetrics", async () => {
      try {
        return this.securityService.getSecurityMetrics();
      } catch (error) {
        console.error("Failed to get security metrics:", error);
        throw error;
      }
    });

    // Get audit logs
    ipcMain.handle("oauth:getAuditLogs", async (_, filters?: any) => {
      try {
        return this.securityService.getAuditLogs(filters);
      } catch (error) {
        console.error("Failed to get audit logs:", error);
        throw error;
      }
    });

    // Rotate encryption keys
    ipcMain.handle("oauth:rotateEncryptionKeys", async () => {
      try {
        await this.securityService.rotateEncryptionKeys();
        return true;
      } catch (error) {
        console.error("Failed to rotate encryption keys:", error);
        throw error;
      }
    });

    // Create backup
    ipcMain.handle("oauth:createBackup", async () => {
      try {
        const result = await dialog.showSaveDialog({
          title: "Save OAuth Backup",
          defaultPath: `oauth-backup-${Date.now()}.json`,
          filters: [
            { name: "JSON Files", extensions: ["json"] },
            { name: "All Files", extensions: ["*"] },
          ],
        });

        if (!result.canceled && result.filePath) {
          return await this.backupService.createBackup({
            includeTokens: true,
            encrypt: true,
            outputPath: result.filePath,
          });
        }
        return null;
      } catch (error) {
        console.error("Failed to create backup:", error);
        throw error;
      }
    });

    // Select and restore backup
    ipcMain.handle("oauth:selectAndRestoreBackup", async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: "Select OAuth Backup",
          filters: [
            { name: "JSON Files", extensions: ["json"] },
            { name: "All Files", extensions: ["*"] },
          ],
          properties: ["openFile"],
        });

        if (!result.canceled && result.filePaths[0]) {
          return await this.backupService.restoreBackup(result.filePaths[0], {
            overwrite: false,
            validateChecksum: true,
          });
        }
        return null;
      } catch (error) {
        console.error("Failed to restore backup:", error);
        throw error;
      }
    });

    // Get migration status
    ipcMain.handle("oauth:getMigrationStatus", async () => {
      try {
        return this.migrationService.getMigrationStatus();
      } catch (error) {
        console.error("Failed to get migration status:", error);
        throw error;
      }
    });

    // Run migration
    ipcMain.handle("oauth:runMigration", async () => {
      try {
        return await this.migrationService.migrate();
      } catch (error) {
        console.error("Failed to run migration:", error);
        throw error;
      }
    });

    // Export security report
    ipcMain.handle("oauth:exportSecurityReport", async () => {
      try {
        const report = this.securityService.exportSecurityReport();
        const result = await dialog.showSaveDialog({
          title: "Export Security Report",
          defaultPath: `oauth-security-report-${Date.now()}.json`,
          filters: [
            { name: "JSON Files", extensions: ["json"] },
            { name: "All Files", extensions: ["*"] },
          ],
        });

        if (!result.canceled && result.filePath) {
          const fs = require("fs");
          fs.writeFileSync(result.filePath, report);
          return result.filePath;
        }
        return null;
      } catch (error) {
        console.error("Failed to export security report:", error);
        throw error;
      }
    });
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.oauthService.cleanup();
  }
}

// Export singleton instance
let oauthHandler: OAuthHandler | null = null;

export function getOAuthHandler(): OAuthHandler {
  if (!oauthHandler) {
    oauthHandler = new OAuthHandler();
  }
  return oauthHandler;
}

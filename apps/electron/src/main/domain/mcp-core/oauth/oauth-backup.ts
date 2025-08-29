/**
 * OAuth Backup and Recovery Service
 *
 * Handles backup, export, import, and recovery of OAuth configurations and tokens
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { app, dialog } from "electron";
import { getServerOAuthRepository } from "../../../infrastructure/database";
import { EncryptionUtil } from "./oauth-encryption";
import { OAuthSecurityService, OAuthSecurityEvent } from "./oauth-security";
import type { OAuthConfig, OAuthToken } from "./oauth-types";

interface BackupMetadata {
  version: string;
  createdAt: number;
  machineId: string;
  appVersion: string;
  totalConfigs: number;
  totalTokens: number;
  checksum: string;
}

interface OAuthBackup {
  metadata: BackupMetadata;
  configs: OAuthConfig[];
  tokens: OAuthToken[];
  encrypted: boolean;
  encryptionMethod?: string;
}

interface BackupOptions {
  includeTokens: boolean;
  encrypt: boolean;
  password?: string;
  outputPath?: string;
}

interface RestoreOptions {
  overwrite: boolean;
  password?: string;
  validateChecksum: boolean;
}

interface BackupHistory {
  id: string;
  timestamp: number;
  path: string;
  size: number;
  metadata: BackupMetadata;
  automatic: boolean;
}

export class OAuthBackupService {
  private static instance: OAuthBackupService | null = null;
  private encryptionUtil: EncryptionUtil;
  private securityService: OAuthSecurityService;
  private backupHistory: BackupHistory[] = [];
  private readonly backupDir: string;
  private readonly historyPath: string;
  private autoBackupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.encryptionUtil = new EncryptionUtil();
    this.securityService = OAuthSecurityService.getInstance();

    const userDataPath = app.getPath("userData");
    this.backupDir = path.join(userDataPath, "oauth-backups");
    this.historyPath = path.join(this.backupDir, "backup-history.json");

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    // Load backup history
    this.loadBackupHistory();

    // Start automatic backups
    this.startAutoBackup();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): OAuthBackupService {
    if (!OAuthBackupService.instance) {
      OAuthBackupService.instance = new OAuthBackupService();
    }
    return OAuthBackupService.instance;
  }

  /**
   * Load backup history
   */
  private loadBackupHistory(): void {
    try {
      if (fs.existsSync(this.historyPath)) {
        const data = fs.readFileSync(this.historyPath, "utf-8");
        this.backupHistory = JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load backup history:", error);
      this.backupHistory = [];
    }
  }

  /**
   * Save backup history
   */
  private saveBackupHistory(): void {
    try {
      fs.writeFileSync(
        this.historyPath,
        JSON.stringify(this.backupHistory, null, 2),
      );
    } catch (error) {
      console.error("Failed to save backup history:", error);
    }
  }

  /**
   * Start automatic backup
   */
  private startAutoBackup(): void {
    // Backup every 24 hours
    this.autoBackupInterval = setInterval(
      () => {
        this.createAutomaticBackup();
      },
      24 * 60 * 60 * 1000,
    );

    // Initial backup check
    this.checkAndCreateBackup();
  }

  /**
   * Check if backup is needed and create one
   */
  private async checkAndCreateBackup(): Promise<void> {
    const lastBackup = this.backupHistory
      .filter((b) => b.automatic)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    const now = Date.now();
    const daysSinceLastBackup = lastBackup
      ? (now - lastBackup.timestamp) / (24 * 60 * 60 * 1000)
      : Infinity;

    if (daysSinceLastBackup > 1) {
      await this.createAutomaticBackup();
    }
  }

  /**
   * Create automatic backup
   */
  private async createAutomaticBackup(): Promise<void> {
    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .split(".")[0];
      const filename = `auto-backup-${timestamp}.json`;
      const outputPath = path.join(this.backupDir, filename);

      await this.createBackup({
        includeTokens: true,
        encrypt: true,
        outputPath,
      });

      // Clean up old automatic backups (keep last 7)
      this.cleanupOldBackups(7);

      console.log("Automatic OAuth backup created:", filename);
    } catch (error) {
      console.error("Failed to create automatic backup:", error);
    }
  }

  /**
   * Create backup
   */
  async createBackup(options: BackupOptions): Promise<string> {
    const oauthRepo = getServerOAuthRepository();

    // Get all OAuth data
    const configs = oauthRepo.getAllConfigs();
    const tokens = options.includeTokens ? oauthRepo.getAllTokens() : [];

    // Create backup object
    const backup: OAuthBackup = {
      metadata: {
        version: "1.0.0",
        createdAt: Date.now(),
        machineId: this.getMachineId(),
        appVersion: app.getVersion(),
        totalConfigs: configs.length,
        totalTokens: tokens.length,
        checksum: "",
      },
      configs: configs.map((config: OAuthConfig) => ({
        ...config,
        // Remove sensitive data if not encrypted
        clientSecret: options.encrypt ? config.clientSecret : undefined,
      })),
      tokens: tokens.map((token: OAuthToken) => ({
        ...token,
        // Decrypt tokens for backup if needed
        accessToken: options.encrypt
          ? this.encryptionUtil.decrypt(token.accessToken)
          : "[REDACTED]",
        refreshToken:
          token.refreshToken && options.encrypt
            ? this.encryptionUtil.decrypt(token.refreshToken)
            : undefined,
      })),
      encrypted: options.encrypt,
      encryptionMethod: options.encrypt ? "AES-256-GCM" : undefined,
    };

    // Calculate checksum
    backup.metadata.checksum = this.calculateChecksum(backup);

    // Serialize backup
    let backupData = JSON.stringify(backup, null, 2);

    // Encrypt if requested
    if (options.encrypt && options.password) {
      backupData = await this.encryptBackup(backupData, options.password);
    }

    // Determine output path
    let outputPath = options.outputPath;
    if (!outputPath) {
      const result = await dialog.showSaveDialog({
        title: "Save OAuth Backup",
        defaultPath: path.join(
          app.getPath("documents"),
          `oauth-backup-${Date.now()}.json`,
        ),
        filters: [
          { name: "JSON Files", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (result.canceled || !result.filePath) {
        throw new Error("Backup canceled by user");
      }

      outputPath = result.filePath;
    }

    // Write backup file
    fs.writeFileSync(outputPath, backupData);

    // Record in history
    const stats = fs.statSync(outputPath);
    const historyEntry: BackupHistory = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      path: outputPath,
      size: stats.size,
      metadata: backup.metadata,
      automatic:
        !options.outputPath || options.outputPath.includes("auto-backup"),
    };

    this.backupHistory.push(historyEntry);
    this.saveBackupHistory();

    // Log security event
    this.securityService.logSecurityEvent({
      eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
      severity: "info",
      details: {
        action: "backup_created",
        path: outputPath,
        configs: configs.length,
        tokens: tokens.length,
      },
    });

    return outputPath;
  }

  /**
   * Restore from backup
   */
  async restoreBackup(
    backupPath: string,
    options: RestoreOptions,
  ): Promise<{
    success: boolean;
    restored: { configs: number; tokens: number };
  }> {
    try {
      // Read backup file
      let backupData = fs.readFileSync(backupPath, "utf-8");

      // Check if encrypted
      if (backupData.startsWith("{")) {
        // Not encrypted, parse directly
      } else if (options.password) {
        // Decrypt
        backupData = await this.decryptBackup(backupData, options.password);
      } else {
        throw new Error("Backup is encrypted but no password provided");
      }

      // Parse backup
      const backup: OAuthBackup = JSON.parse(backupData);

      // Validate checksum
      if (options.validateChecksum) {
        const calculatedChecksum = this.calculateChecksum(backup);
        if (calculatedChecksum !== backup.metadata.checksum) {
          throw new Error("Backup checksum validation failed");
        }
      }

      // Restore data
      const oauthRepo = getServerOAuthRepository();
      let restoredConfigs = 0;
      let restoredTokens = 0;

      // Restore configs
      for (const config of backup.configs) {
        if (
          options.overwrite ||
          !oauthRepo.getConfigByServerId(config.serverId)
        ) {
          oauthRepo.saveConfig(config);
          restoredConfigs++;
        }
      }

      // Restore tokens if included
      if (backup.tokens.length > 0) {
        for (const token of backup.tokens) {
          if (
            options.overwrite ||
            !oauthRepo.getTokenByServerId(token.serverId)
          ) {
            // Re-encrypt tokens with current key
            const encryptedToken = {
              ...token,
              accessToken: this.encryptionUtil.encrypt(token.accessToken),
              refreshToken: token.refreshToken
                ? this.encryptionUtil.encrypt(token.refreshToken)
                : undefined,
            };
            oauthRepo.saveToken(encryptedToken);
            restoredTokens++;
          }
        }
      }

      // Log security event
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
        severity: "info",
        details: {
          action: "backup_restored",
          path: backupPath,
          restoredConfigs,
          restoredTokens,
        },
      });

      return {
        success: true,
        restored: {
          configs: restoredConfigs,
          tokens: restoredTokens,
        },
      };
    } catch (error) {
      console.error("Failed to restore backup:", error);

      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
        severity: "error",
        details: {
          action: "backup_restore_failed",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      throw error;
    }
  }

  /**
   * Export configurations (without tokens)
   */
  async exportConfigurations(): Promise<string> {
    return this.createBackup({
      includeTokens: false,
      encrypt: false,
    });
  }

  /**
   * Import configurations
   */
  async importConfigurations(filePath: string): Promise<number> {
    const result = await this.restoreBackup(filePath, {
      overwrite: false,
      validateChecksum: true,
    });

    return result.restored.configs;
  }

  /**
   * Calculate checksum for backup
   */
  private calculateChecksum(backup: OAuthBackup): string {
    const data = JSON.stringify({
      configs: backup.configs,
      tokens: backup.tokens,
    });

    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Encrypt backup data
   */
  private async encryptBackup(data: string, password: string): Promise<string> {
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    // Combine salt, iv, authTag, and encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, "base64"),
    ]);

    return combined.toString("base64");
  }

  /**
   * Decrypt backup data
   */
  private async decryptBackup(
    encryptedData: string,
    password: string,
  ): Promise<string> {
    const combined = Buffer.from(encryptedData, "base64");

    const salt = combined.slice(0, 32);
    const iv = combined.slice(32, 48);
    const authTag = combined.slice(48, 64);
    const encrypted = combined.slice(64);

    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Get machine ID for backup identification
   */
  private getMachineId(): string {
    // Use a combination of platform and hostname
    const os = require("os");
    const data = `${os.platform()}-${os.hostname()}`;

    return crypto
      .createHash("sha256")
      .update(data)
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Clean up old automatic backups
   */
  private cleanupOldBackups(keepCount: number): void {
    const autoBackups = this.backupHistory
      .filter((b) => b.automatic)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (autoBackups.length > keepCount) {
      const toDelete = autoBackups.slice(keepCount);

      for (const backup of toDelete) {
        try {
          if (fs.existsSync(backup.path)) {
            fs.unlinkSync(backup.path);
          }

          // Remove from history
          const index = this.backupHistory.findIndex((b) => b.id === backup.id);
          if (index !== -1) {
            this.backupHistory.splice(index, 1);
          }
        } catch (error) {
          console.error("Failed to delete old backup:", error);
        }
      }

      this.saveBackupHistory();
    }
  }

  /**
   * Get backup history
   */
  getBackupHistory(): BackupHistory[] {
    return [...this.backupHistory].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Delete backup
   */
  deleteBackup(backupId: string): boolean {
    const backup = this.backupHistory.find((b) => b.id === backupId);

    if (!backup) {
      return false;
    }

    try {
      if (fs.existsSync(backup.path)) {
        fs.unlinkSync(backup.path);
      }

      const index = this.backupHistory.findIndex((b) => b.id === backupId);
      if (index !== -1) {
        this.backupHistory.splice(index, 1);
        this.saveBackupHistory();
      }

      return true;
    } catch (error) {
      console.error("Failed to delete backup:", error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
      this.autoBackupInterval = null;
    }

    this.saveBackupHistory();
  }
}

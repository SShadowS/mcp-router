/**
 * OAuth Migration Service
 *
 * Handles data migrations, version upgrades, and compatibility
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { getServerOAuthRepository } from "../../../infrastructure/database";
import { OAuthBackupService } from "./oauth-backup";
import { OAuthSecurityService, OAuthSecurityEvent } from "./oauth-security";
import type { OAuthConfig, OAuthToken } from "./oauth-types";

interface MigrationVersion {
  version: string;
  description: string;
  migrate: (data: any) => Promise<any>;
  rollback?: (data: any) => Promise<any>;
}

interface MigrationState {
  currentVersion: string;
  appliedMigrations: string[];
  lastMigration: number;
  rollbackHistory: Array<{
    version: string;
    timestamp: number;
    data: any;
  }>;
}

interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  migrationsApplied: string[];
  errors?: string[];
  warnings?: string[];
}

export class OAuthMigrationService {
  private static instance: OAuthMigrationService | null = null;
  private backupService: OAuthBackupService;
  private securityService: OAuthSecurityService;
  private migrationState: MigrationState;
  private readonly statePath: string;
  private readonly currentVersion = "2.0.0";

  // Define all migrations
  private migrations: MigrationVersion[] = [
    {
      version: "1.0.0",
      description: "Initial OAuth implementation",
      migrate: async (data) => data, // No-op for initial version
    },
    {
      version: "1.1.0",
      description: "Add PKCE support and dynamic registration",
      migrate: async (data) => {
        // Add PKCE fields if missing
        if (data.configs) {
          data.configs = data.configs.map((config: any) => ({
            ...config,
            usePKCE: config.usePKCE ?? true,
            dynamicRegistration: config.dynamicRegistration ?? false,
          }));
        }
        return data;
      },
      rollback: async (data) => {
        // Remove PKCE fields
        if (data.configs) {
          data.configs = data.configs.map((config: any) => {
            const { usePKCE, dynamicRegistration, ...rest } = config;
            return rest;
          });
        }
        return data;
      },
    },
    {
      version: "1.2.0",
      description: "Add audience and additional parameters support",
      migrate: async (data) => {
        // Add new OAuth fields
        if (data.configs) {
          data.configs = data.configs.map((config: any) => ({
            ...config,
            audience: config.audience || undefined,
            additionalParams: config.additionalParams || {},
          }));
        }
        return data;
      },
      rollback: async (data) => {
        // Remove new fields
        if (data.configs) {
          data.configs = data.configs.map((config: any) => {
            const { audience, additionalParams, ...rest } = config;
            return rest;
          });
        }
        return data;
      },
    },
    {
      version: "2.0.0",
      description:
        "Enhanced security with encryption key rotation and audit logging",
      migrate: async (data) => {
        // Add security metadata to tokens
        if (data.tokens) {
          data.tokens = data.tokens.map((token: any) => ({
            ...token,
            lastUsed: token.lastUsed || Date.now(),
            refreshCount: token.refreshCount || 0,
          }));
        }

        // Add metadata fields to configs
        if (data.configs) {
          data.configs = data.configs.map((config: any) => ({
            ...config,
            createdAt: config.createdAt || Date.now(),
            updatedAt: config.updatedAt || Date.now(),
          }));
        }

        return data;
      },
      rollback: async (data) => {
        // Remove security metadata
        if (data.tokens) {
          data.tokens = data.tokens.map((token: any) => {
            const { lastUsed, refreshCount, ...rest } = token;
            return rest;
          });
        }

        if (data.configs) {
          data.configs = data.configs.map((config: any) => {
            const { createdAt, updatedAt, ...rest } = config;
            return rest;
          });
        }

        return data;
      },
    },
  ];

  private constructor() {
    this.backupService = OAuthBackupService.getInstance();
    this.securityService = OAuthSecurityService.getInstance();

    const userDataPath = app.getPath("userData");
    this.statePath = path.join(userDataPath, "oauth-migration-state.json");

    // Load migration state
    this.migrationState = this.loadMigrationState();

    // Check and run migrations on startup
    this.checkAndRunMigrations();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): OAuthMigrationService {
    if (!OAuthMigrationService.instance) {
      OAuthMigrationService.instance = new OAuthMigrationService();
    }
    return OAuthMigrationService.instance;
  }

  /**
   * Load migration state
   */
  private loadMigrationState(): MigrationState {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load migration state:", error);
    }

    // Default state
    return {
      currentVersion: "1.0.0",
      appliedMigrations: [],
      lastMigration: Date.now(),
      rollbackHistory: [],
    };
  }

  /**
   * Save migration state
   */
  private saveMigrationState(): void {
    try {
      fs.writeFileSync(
        this.statePath,
        JSON.stringify(this.migrationState, null, 2),
      );
    } catch (error) {
      console.error("Failed to save migration state:", error);
    }
  }

  /**
   * Check and run pending migrations
   */
  private async checkAndRunMigrations(): Promise<void> {
    const pendingMigrations = this.getPendingMigrations();

    if (pendingMigrations.length > 0) {
      console.log(`Found ${pendingMigrations.length} pending OAuth migrations`);

      const result = await this.migrate();

      if (result.success) {
        console.log("OAuth migrations completed successfully");
      } else {
        console.error("OAuth migrations failed:", result.errors);
      }
    }
  }

  /**
   * Get pending migrations
   */
  getPendingMigrations(): MigrationVersion[] {
    const currentIndex = this.migrations.findIndex(
      (m) => m.version === this.migrationState.currentVersion,
    );

    if (currentIndex === -1) {
      // Unknown version, assume we need all migrations
      return this.migrations;
    }

    // Return migrations after current version
    return this.migrations.slice(currentIndex + 1);
  }

  /**
   * Run migrations
   */
  async migrate(targetVersion?: string): Promise<MigrationResult> {
    const fromVersion = this.migrationState.currentVersion;
    const toVersion = targetVersion || this.currentVersion;
    const result: MigrationResult = {
      success: false,
      fromVersion,
      toVersion,
      migrationsApplied: [],
      errors: [],
      warnings: [],
    };

    try {
      // Create backup before migration
      console.log("Creating backup before migration...");
      await this.backupService.createBackup({
        includeTokens: true,
        encrypt: true,
        outputPath: path.join(
          app.getPath("userData"),
          "oauth-backups",
          `pre-migration-${Date.now()}.json`,
        ),
      });

      // Get current data
      const oauthRepo = getServerOAuthRepository();
      let data = {
        configs: oauthRepo.getAllConfigs(),
        tokens: oauthRepo.getAllTokens(),
      };

      // Get migrations to apply
      const pendingMigrations = this.getPendingMigrations();
      const migrationsToApply = targetVersion
        ? pendingMigrations.filter((m) => m.version <= targetVersion)
        : pendingMigrations;

      // Apply migrations sequentially
      for (const migration of migrationsToApply) {
        console.log(
          `Applying migration ${migration.version}: ${migration.description}`,
        );

        try {
          // Store rollback data
          this.migrationState.rollbackHistory.push({
            version: migration.version,
            timestamp: Date.now(),
            data: JSON.parse(JSON.stringify(data)), // Deep clone
          });

          // Apply migration
          data = await migration.migrate(data);

          // Update state
          this.migrationState.currentVersion = migration.version;
          this.migrationState.appliedMigrations.push(migration.version);
          this.migrationState.lastMigration = Date.now();

          result.migrationsApplied.push(migration.version);

          // Save intermediate state
          this.saveMigrationState();
        } catch (error) {
          const errorMsg = `Migration ${migration.version} failed: ${error}`;
          console.error(errorMsg);
          result.errors?.push(errorMsg);

          // Attempt rollback
          await this.rollback(fromVersion);
          throw new Error(errorMsg);
        }
      }

      // Save migrated data
      console.log("Saving migrated data...");

      // Clear existing data
      for (const config of oauthRepo.getAllConfigs()) {
        oauthRepo.deleteConfig(config.id!);
      }
      for (const token of oauthRepo.getAllTokens()) {
        oauthRepo.deleteToken(token.id!);
      }

      // Save new data
      for (const config of data.configs) {
        oauthRepo.saveConfig(config);
      }
      for (const token of data.tokens) {
        oauthRepo.saveToken(token);
      }

      // Update final state
      this.migrationState.currentVersion = toVersion;
      this.saveMigrationState();

      // Log security event
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
        severity: "info",
        details: {
          action: "migration_completed",
          fromVersion,
          toVersion,
          migrationsApplied: result.migrationsApplied,
        },
      });

      result.success = true;
    } catch (error) {
      console.error("Migration failed:", error);

      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
        severity: "error",
        details: {
          action: "migration_failed",
          fromVersion,
          toVersion,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      if (!result.errors?.length) {
        result.errors?.push(
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }

    return result;
  }

  /**
   * Rollback to a specific version
   */
  async rollback(targetVersion: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      fromVersion: this.migrationState.currentVersion,
      toVersion: targetVersion,
      migrationsApplied: [],
      errors: [],
      warnings: [],
    };

    try {
      console.log(`Rolling back to version ${targetVersion}...`);

      // Find rollback point
      const rollbackPoint = this.migrationState.rollbackHistory
        .reverse()
        .find((r) => r.version === targetVersion);

      if (!rollbackPoint) {
        throw new Error(`No rollback data found for version ${targetVersion}`);
      }

      // Get migrations to rollback
      const currentIndex = this.migrations.findIndex(
        (m) => m.version === this.migrationState.currentVersion,
      );
      const targetIndex = this.migrations.findIndex(
        (m) => m.version === targetVersion,
      );

      if (currentIndex === -1 || targetIndex === -1) {
        throw new Error("Invalid version for rollback");
      }

      // Apply rollbacks in reverse order
      const migrationsToRollback = this.migrations
        .slice(targetIndex + 1, currentIndex + 1)
        .reverse();

      let data = rollbackPoint.data;

      for (const migration of migrationsToRollback) {
        if (migration.rollback) {
          console.log(`Rolling back migration ${migration.version}`);

          try {
            data = await migration.rollback(data);
            result.migrationsApplied.push(`rollback-${migration.version}`);
          } catch (error) {
            const errorMsg = `Rollback of ${migration.version} failed: ${error}`;
            console.error(errorMsg);
            result.errors?.push(errorMsg);
            throw new Error(errorMsg);
          }
        } else {
          result.warnings?.push(`No rollback defined for ${migration.version}`);
        }
      }

      // Save rolled back data
      const oauthRepo = getServerOAuthRepository();

      // Clear existing data
      for (const config of oauthRepo.getAllConfigs()) {
        oauthRepo.deleteConfig(config.id!);
      }
      for (const token of oauthRepo.getAllTokens()) {
        oauthRepo.deleteToken(token.id!);
      }

      // Save rolled back data
      for (const config of data.configs) {
        oauthRepo.saveConfig(config);
      }
      for (const token of data.tokens) {
        oauthRepo.saveToken(token);
      }

      // Update state
      this.migrationState.currentVersion = targetVersion;
      this.migrationState.appliedMigrations =
        this.migrationState.appliedMigrations.filter((v) => v <= targetVersion);
      this.saveMigrationState();

      // Log security event
      this.securityService.logSecurityEvent({
        eventType: OAuthSecurityEvent.CONFIGURATION_CHANGED,
        severity: "warning",
        details: {
          action: "migration_rollback",
          fromVersion: result.fromVersion,
          toVersion: targetVersion,
        },
      });

      result.success = true;
    } catch (error) {
      console.error("Rollback failed:", error);

      if (!result.errors?.length) {
        result.errors?.push(
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }

    return result;
  }

  /**
   * Get migration status
   */
  getMigrationStatus(): {
    currentVersion: string;
    targetVersion: string;
    pendingMigrations: Array<{ version: string; description: string }>;
    appliedMigrations: string[];
    lastMigration: number;
    canRollback: boolean;
  } {
    const pendingMigrations = this.getPendingMigrations();

    return {
      currentVersion: this.migrationState.currentVersion,
      targetVersion: this.currentVersion,
      pendingMigrations: pendingMigrations.map((m) => ({
        version: m.version,
        description: m.description,
      })),
      appliedMigrations: this.migrationState.appliedMigrations,
      lastMigration: this.migrationState.lastMigration,
      canRollback: this.migrationState.rollbackHistory.length > 0,
    };
  }

  /**
   * Export migration report
   */
  exportMigrationReport(): string {
    const status = this.getMigrationStatus();

    const report = {
      generatedAt: new Date().toISOString(),
      status,
      migrationHistory: this.migrationState.rollbackHistory.map((r) => ({
        version: r.version,
        timestamp: new Date(r.timestamp).toISOString(),
        dataSnapshot: {
          configs: r.data.configs?.length || 0,
          tokens: r.data.tokens?.length || 0,
        },
      })),
      availableMigrations: this.migrations.map((m) => ({
        version: m.version,
        description: m.description,
        hasRollback: !!m.rollback,
      })),
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Cleanup old rollback data
   */
  cleanupRollbackHistory(keepCount: number = 5): void {
    if (this.migrationState.rollbackHistory.length > keepCount) {
      this.migrationState.rollbackHistory =
        this.migrationState.rollbackHistory.slice(-keepCount);
      this.saveMigrationState();
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.saveMigrationState();
  }
}

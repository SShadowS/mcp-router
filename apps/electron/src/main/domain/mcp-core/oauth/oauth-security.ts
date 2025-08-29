/**
 * OAuth Security Service
 *
 * Handles advanced security features for OAuth including:
 * - Encryption key rotation
 * - Token validation
 * - Security audit logging
 * - Rate limiting
 */

import * as crypto from "crypto";
import { app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { getServerOAuthRepository } from "../../../infrastructure/database";
import { EncryptionUtil } from "./oauth-encryption";
import type { OAuthToken, OAuthConfig } from "./oauth-types";

interface KeyRotationConfig {
  rotationIntervalDays: number;
  keyVersion: number;
  lastRotation: number;
  nextRotation: number;
}

interface SecurityAuditLog {
  id: string;
  timestamp: number;
  eventType: OAuthSecurityEvent;
  serverId?: string;
  userId?: string;
  details: Record<string, any>;
  severity: "info" | "warning" | "error" | "critical";
  ipAddress?: string;
  userAgent?: string;
}

export enum OAuthSecurityEvent {
  TOKEN_CREATED = "token_created",
  TOKEN_REFRESHED = "token_refreshed",
  TOKEN_REVOKED = "token_revoked",
  TOKEN_EXPIRED = "token_expired",
  TOKEN_VALIDATION_FAILED = "token_validation_failed",
  KEY_ROTATED = "key_rotated",
  SUSPICIOUS_ACTIVITY = "suspicious_activity",
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
  AUTHENTICATION_STARTED = "authentication_started",
  AUTHENTICATION_COMPLETED = "authentication_completed",
  AUTHENTICATION_FAILED = "authentication_failed",
  CONFIGURATION_CHANGED = "configuration_changed",
  CONFIGURATION_DELETED = "configuration_deleted",
}

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRefreshesPerHour: number;
  maxAuthAttemptsPerDay: number;
}

export class OAuthSecurityService {
  private static instance: OAuthSecurityService | null = null;
  private keyRotationConfig: KeyRotationConfig;
  private auditLogs: SecurityAuditLog[] = [];
  private rateLimitTracking: Map<string, { count: number; resetTime: number }> =
    new Map();
  private readonly auditLogPath: string;
  private readonly keyStorePath: string;
  private encryptionUtil: EncryptionUtil;

  private readonly rateLimits: RateLimitConfig = {
    maxRequestsPerMinute: 60,
    maxRefreshesPerHour: 30,
    maxAuthAttemptsPerDay: 10,
  };

  private constructor() {
    const userDataPath = app.getPath("userData");
    this.auditLogPath = path.join(userDataPath, "oauth-audit.log");
    this.keyStorePath = path.join(userDataPath, "oauth-keys.json");
    this.encryptionUtil = new EncryptionUtil();

    // Load or initialize key rotation config
    this.keyRotationConfig = this.loadKeyRotationConfig();

    // Schedule key rotation check
    this.scheduleKeyRotation();

    // Load audit logs
    this.loadAuditLogs();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): OAuthSecurityService {
    if (!OAuthSecurityService.instance) {
      OAuthSecurityService.instance = new OAuthSecurityService();
    }
    return OAuthSecurityService.instance;
  }

  /**
   * Load key rotation configuration
   */
  private loadKeyRotationConfig(): KeyRotationConfig {
    try {
      if (fs.existsSync(this.keyStorePath)) {
        const data = fs.readFileSync(this.keyStorePath, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load key rotation config:", error);
    }

    // Default configuration
    const now = Date.now();
    const config: KeyRotationConfig = {
      rotationIntervalDays: 90, // Rotate keys every 90 days
      keyVersion: 1,
      lastRotation: now,
      nextRotation: now + 90 * 24 * 60 * 60 * 1000,
    };

    this.saveKeyRotationConfig(config);
    return config;
  }

  /**
   * Save key rotation configuration
   */
  private saveKeyRotationConfig(config: KeyRotationConfig): void {
    try {
      fs.writeFileSync(this.keyStorePath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error("Failed to save key rotation config:", error);
    }
  }

  /**
   * Schedule automatic key rotation
   */
  private scheduleKeyRotation(): void {
    // Check every hour if key rotation is needed
    setInterval(
      () => {
        this.checkAndRotateKeys();
      },
      60 * 60 * 1000,
    );

    // Initial check
    this.checkAndRotateKeys();
  }

  /**
   * Check if key rotation is needed and perform it
   */
  private async checkAndRotateKeys(): Promise<void> {
    const now = Date.now();

    if (now >= this.keyRotationConfig.nextRotation) {
      console.log("Starting OAuth encryption key rotation...");
      await this.rotateEncryptionKeys();
    }
  }

  /**
   * Rotate encryption keys
   */
  async rotateEncryptionKeys(): Promise<void> {
    try {
      const oauthRepo = getServerOAuthRepository();

      // Generate new encryption key
      const newKey = crypto.randomBytes(32);
      const newKeyVersion = this.keyRotationConfig.keyVersion + 1;

      // Get all encrypted tokens
      const allConfigs = oauthRepo.getAllConfigs();
      const allTokens = oauthRepo.getAllTokens();

      // Re-encrypt all tokens with new key
      for (const token of allTokens) {
        if (token.accessToken) {
          // Decrypt with old key
          const decrypted = this.encryptionUtil.decrypt(token.accessToken);

          // Update encryption util with new key
          this.encryptionUtil = new EncryptionUtil(); // This will generate a new key

          // Re-encrypt with new key
          const reEncrypted = this.encryptionUtil.encrypt(decrypted);

          // Update token
          oauthRepo.saveToken({
            ...token,
            accessToken: reEncrypted,
            refreshToken: token.refreshToken
              ? this.encryptionUtil.encrypt(
                  this.encryptionUtil.decrypt(token.refreshToken),
                )
              : undefined,
          });
        }
      }

      // Update key rotation config
      const now = Date.now();
      this.keyRotationConfig = {
        ...this.keyRotationConfig,
        keyVersion: newKeyVersion,
        lastRotation: now,
        nextRotation:
          now +
          this.keyRotationConfig.rotationIntervalDays * 24 * 60 * 60 * 1000,
      };

      this.saveKeyRotationConfig(this.keyRotationConfig);

      // Log the rotation event
      this.logSecurityEvent({
        eventType: OAuthSecurityEvent.KEY_ROTATED,
        severity: "info",
        details: {
          oldVersion: newKeyVersion - 1,
          newVersion: newKeyVersion,
          tokensRotated: allTokens.length,
        },
      });

      console.log(`Key rotation completed. New version: ${newKeyVersion}`);
    } catch (error) {
      console.error("Key rotation failed:", error);
      this.logSecurityEvent({
        eventType: OAuthSecurityEvent.KEY_ROTATED,
        severity: "error",
        details: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  /**
   * Log a security event
   */
  logSecurityEvent(event: Omit<SecurityAuditLog, "id" | "timestamp">): void {
    const log: SecurityAuditLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...event,
    };

    this.auditLogs.push(log);

    // Write to file
    this.appendAuditLog(log);

    // Keep only last 10000 logs in memory
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-5000);
    }

    // Alert on critical events
    if (log.severity === "critical") {
      console.error("CRITICAL OAuth Security Event:", log);
      // Could trigger additional alerts here (email, notification, etc.)
    }
  }

  /**
   * Append audit log to file
   */
  private appendAuditLog(log: SecurityAuditLog): void {
    try {
      const logLine = JSON.stringify(log) + "\n";
      fs.appendFileSync(this.auditLogPath, logLine);
    } catch (error) {
      console.error("Failed to write audit log:", error);
    }
  }

  /**
   * Load audit logs from file
   */
  private loadAuditLogs(): void {
    try {
      if (fs.existsSync(this.auditLogPath)) {
        const data = fs.readFileSync(this.auditLogPath, "utf-8");
        const lines = data.split("\n").filter((line) => line.trim());

        // Load only recent logs (last 1000)
        const recentLines = lines.slice(-1000);
        this.auditLogs = recentLines
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter((log) => log !== null) as SecurityAuditLog[];
      }
    } catch (error) {
      console.error("Failed to load audit logs:", error);
    }
  }

  /**
   * Get audit logs
   */
  getAuditLogs(filters?: {
    serverId?: string;
    eventType?: OAuthSecurityEvent;
    severity?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): SecurityAuditLog[] {
    let logs = [...this.auditLogs];

    if (filters) {
      if (filters.serverId) {
        logs = logs.filter((log) => log.serverId === filters.serverId);
      }
      if (filters.eventType) {
        logs = logs.filter((log) => log.eventType === filters.eventType);
      }
      if (filters.severity) {
        logs = logs.filter((log) => log.severity === filters.severity);
      }
      if (filters.startTime) {
        logs = logs.filter((log) => log.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        logs = logs.filter((log) => log.timestamp <= filters.endTime!);
      }
      if (filters.limit) {
        logs = logs.slice(-filters.limit);
      }
    }

    return logs.reverse(); // Most recent first
  }

  /**
   * Check rate limit
   */
  checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const tracking = this.rateLimitTracking.get(key);

    if (!tracking || now > tracking.resetTime) {
      // New window
      this.rateLimitTracking.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });

      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: now + windowMs,
      };
    }

    // Existing window
    if (tracking.count >= limit) {
      // Rate limit exceeded
      this.logSecurityEvent({
        eventType: OAuthSecurityEvent.RATE_LIMIT_EXCEEDED,
        severity: "warning",
        details: {
          key,
          limit,
          windowMs,
        },
      });

      return {
        allowed: false,
        remaining: 0,
        resetTime: tracking.resetTime,
      };
    }

    // Increment count
    tracking.count++;

    return {
      allowed: true,
      remaining: limit - tracking.count,
      resetTime: tracking.resetTime,
    };
  }

  /**
   * Validate token security
   */
  validateTokenSecurity(token: OAuthToken): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check token expiration
    if (token.expiresAt && token.expiresAt < Date.now()) {
      issues.push("Token has expired");
    }

    // Check token age
    if (token.issuedAt) {
      const age = Date.now() - token.issuedAt;
      const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days

      if (age > maxAge) {
        issues.push("Token is too old and should be refreshed");
      }
    }

    // Check refresh count
    if (token.refreshCount && token.refreshCount > 100) {
      issues.push("Token has been refreshed too many times");
    }

    // Check for suspicious patterns
    if (!token.tokenType || token.tokenType.toLowerCase() !== "bearer") {
      issues.push("Invalid token type");
    }

    if (issues.length > 0) {
      this.logSecurityEvent({
        eventType: OAuthSecurityEvent.TOKEN_VALIDATION_FAILED,
        severity: "warning",
        serverId: token.serverId,
        details: { issues },
      });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Clean up old audit logs
   */
  cleanupAuditLogs(daysToKeep: number = 90): void {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    // Filter in-memory logs
    this.auditLogs = this.auditLogs.filter((log) => log.timestamp > cutoffTime);

    // Rewrite audit log file with filtered logs
    try {
      const logLines = this.auditLogs
        .map((log) => JSON.stringify(log) + "\n")
        .join("");
      fs.writeFileSync(this.auditLogPath, logLines);
    } catch (error) {
      console.error("Failed to cleanup audit logs:", error);
    }
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): {
    keyVersion: number;
    lastKeyRotation: number;
    nextKeyRotation: number;
    totalAuditLogs: number;
    recentSecurityEvents: { [key: string]: number };
    rateLimitStatus: { [key: string]: any };
  } {
    const now = Date.now();
    const last24Hours = now - 24 * 60 * 60 * 1000;

    // Count recent security events
    const recentEvents = this.auditLogs.filter(
      (log) => log.timestamp > last24Hours,
    );
    const eventCounts: { [key: string]: number } = {};

    for (const event of recentEvents) {
      eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
    }

    // Get active rate limits
    const rateLimitStatus: { [key: string]: any } = {};
    for (const [key, tracking] of this.rateLimitTracking.entries()) {
      if (tracking.resetTime > now) {
        rateLimitStatus[key] = {
          count: tracking.count,
          resetTime: tracking.resetTime,
          remaining: tracking.resetTime - now,
        };
      }
    }

    return {
      keyVersion: this.keyRotationConfig.keyVersion,
      lastKeyRotation: this.keyRotationConfig.lastRotation,
      nextKeyRotation: this.keyRotationConfig.nextRotation,
      totalAuditLogs: this.auditLogs.length,
      recentSecurityEvents: eventCounts,
      rateLimitStatus,
    };
  }

  /**
   * Export security report
   */
  exportSecurityReport(): string {
    const metrics = this.getSecurityMetrics();
    const recentLogs = this.getAuditLogs({ limit: 100 });

    const report = {
      generatedAt: new Date().toISOString(),
      metrics,
      recentAuditLogs: recentLogs,
      configuration: {
        rotationIntervalDays: this.keyRotationConfig.rotationIntervalDays,
        rateLimits: this.rateLimits,
      },
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Save any pending audit logs
    this.cleanupAuditLogs();
  }
}

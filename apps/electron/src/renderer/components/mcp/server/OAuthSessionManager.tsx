import React, { useState, useEffect } from "react";
import {
  Shield,
  Key,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Lock,
  Unlock,
  FileText,
  Download,
  Upload,
  TrendingUp,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Badge,
  Progress,
  ScrollArea,
  Separator,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@mcp_router/ui";
import { toast } from "sonner";

interface OAuthSession {
  serverId: string;
  serverName: string;
  provider: string;
  authenticated: boolean;
  expiresAt?: number;
  lastRefresh?: number;
  scopes?: string[];
  error?: string;
}

interface SecurityMetrics {
  keyVersion: number;
  lastKeyRotation: number;
  nextKeyRotation: number;
  totalAuditLogs: number;
  recentSecurityEvents: { [key: string]: number };
  rateLimitStatus: { [key: string]: any };
}

interface AuditLog {
  id: string;
  timestamp: number;
  eventType: string;
  serverId?: string;
  severity: "info" | "warning" | "error" | "critical";
  details: Record<string, any>;
}

interface MigrationStatus {
  currentVersion: string;
  targetVersion: string;
  pendingMigrations: Array<{ version: string; description: string }>;
  appliedMigrations: string[];
  lastMigration: number;
  canRollback: boolean;
}

export const OAuthSessionManager: React.FC = () => {
  const [sessions, setSessions] = useState<OAuthSession[]>([]);
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [migrationStatus, setMigrationStatus] =
    useState<MigrationStatus | null>(null);
  const [selectedSession, setSelectedSession] = useState<OAuthSession | null>(
    null,
  );
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("sessions");

  useEffect(() => {
    loadOAuthData();
    const interval = setInterval(loadOAuthData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadOAuthData = async () => {
    try {
      // Load sessions
      const sessionsData = await window.electronAPI.oauth.getAllSessions();
      setSessions(sessionsData);

      // Load security metrics
      const metricsData = await window.electronAPI.oauth.getSecurityMetrics();
      setMetrics(metricsData);

      // Load recent audit logs
      const logsData = await window.electronAPI.oauth.getAuditLogs({
        limit: 100,
      });
      setAuditLogs(logsData);

      // Load migration status
      const migrationData = await window.electronAPI.oauth.getMigrationStatus();
      setMigrationStatus(migrationData);
    } catch (error) {
      console.error("Failed to load OAuth data:", error);
      toast.error("Failed to load OAuth sessions");
    }
  };

  const handleRefreshToken = async (serverId: string) => {
    setIsLoading(true);
    try {
      await window.electronAPI.oauth.refreshToken(serverId);
      toast.success("Token refreshed successfully");
      await loadOAuthData();
    } catch (error) {
      toast.error("Failed to refresh token");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeAccess = async () => {
    if (!selectedSession) return;

    setIsLoading(true);
    try {
      await window.electronAPI.oauth.revokeAccess(selectedSession.serverId);
      toast.success("OAuth access revoked");
      setShowRevokeDialog(false);
      setSelectedSession(null);
      await loadOAuthData();
    } catch (error) {
      toast.error("Failed to revoke access");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRotateKeys = async () => {
    setIsLoading(true);
    try {
      await window.electronAPI.oauth.rotateEncryptionKeys();
      toast.success("Encryption keys rotated successfully");
      await loadOAuthData();
    } catch (error) {
      toast.error("Failed to rotate encryption keys");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setIsLoading(true);
    try {
      const path = await window.electronAPI.oauth.createBackup();
      toast.success(`Backup created at ${path}`);
      setShowBackupDialog(false);
    } catch (error) {
      toast.error("Failed to create backup");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.oauth.selectAndRestoreBackup();
      if (result && result.success) {
        toast.success(
          `Restored ${result.restored.configs} configs and ${result.restored.tokens} tokens`,
        );
        await loadOAuthData();
      }
    } catch (error) {
      toast.error("Failed to restore backup");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunMigration = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.oauth.runMigration();
      if (result.success) {
        toast.success(
          `Migration completed. Applied ${result.migrationsApplied.length} migrations`,
        );
        await loadOAuthData();
      } else {
        toast.error(`Migration failed: ${result.errors?.join(", ")}`);
      }
    } catch (error) {
      toast.error("Failed to run migration");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getTimeUntil = (timestamp: number) => {
    const now = Date.now();
    const diff = timestamp - now;

    if (diff <= 0) return "Expired";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-600";
      case "error":
        return "text-red-500";
      case "warning":
        return "text-yellow-500";
      default:
        return "text-blue-500";
    }
  };

  const getEventIcon = (eventType: string) => {
    if (eventType.includes("TOKEN")) return <Key className="h-4 w-4" />;
    if (eventType.includes("AUTH")) return <Lock className="h-4 w-4" />;
    if (eventType.includes("CONFIG")) return <FileText className="h-4 w-4" />;
    if (eventType.includes("RATE_LIMIT"))
      return <AlertTriangle className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          OAuth Session Management
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBackupDialog(true)}
          >
            <Download className="h-4 w-4 mr-2" />
            Backup
          </Button>
          <Button variant="outline" size="sm" onClick={handleRestoreBackup}>
            <Upload className="h-4 w-4 mr-2" />
            Restore
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadOAuthData}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="migration">Migration</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active OAuth Sessions</CardTitle>
              <CardDescription>
                Manage OAuth tokens and authentication sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <Card key={session.serverId} className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">
                              {session.serverName}
                            </h3>
                            <Badge
                              variant={
                                session.authenticated ? "default" : "secondary"
                              }
                            >
                              {session.provider}
                            </Badge>
                            {session.authenticated ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </div>

                          {session.authenticated && session.expiresAt && (
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                Expires in: {getTimeUntil(session.expiresAt)}
                              </p>
                              {session.lastRefresh && (
                                <p>
                                  Last refresh:{" "}
                                  {formatTimestamp(session.lastRefresh)}
                                </p>
                              )}
                              {session.scopes && session.scopes.length > 0 && (
                                <p>Scopes: {session.scopes.join(", ")}</p>
                              )}
                            </div>
                          )}

                          {session.error && (
                            <p className="text-sm text-red-500 mt-2">
                              {session.error}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {session.authenticated && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleRefreshToken(session.serverId)
                                }
                                disabled={isLoading}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedSession(session);
                                  setShowRevokeDialog(true);
                                }}
                                disabled={isLoading}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}

                  {sessions.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No OAuth sessions configured
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          {metrics && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Encryption Keys</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">Current Key Version</p>
                      <p className="text-2xl font-bold">{metrics.keyVersion}</p>
                    </div>
                    <Button
                      onClick={handleRotateKeys}
                      disabled={isLoading}
                      variant="outline"
                    >
                      <Key className="h-4 w-4 mr-2" />
                      Rotate Keys
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Last Rotation</span>
                      <span>{formatTimestamp(metrics.lastKeyRotation)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Next Rotation</span>
                      <span>{formatTimestamp(metrics.nextKeyRotation)}</span>
                    </div>
                    <Progress
                      value={
                        ((Date.now() - metrics.lastKeyRotation) /
                          (metrics.nextKeyRotation - metrics.lastKeyRotation)) *
                        100
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Security Events (Last 24h)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.recentSecurityEvents).map(
                      ([event, count]) => (
                        <div
                          key={event}
                          className="flex justify-between items-center"
                        >
                          <span className="text-sm flex items-center gap-2">
                            {getEventIcon(event)}
                            {event.replace(/_/g, " ").toLowerCase()}
                          </span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ),
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Rate Limits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.rateLimitStatus).map(
                      ([key, status]: [string, any]) => (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{key}</span>
                            <span>{status.count} requests</span>
                          </div>
                          <Progress value={(status.count / 60) * 100} />
                          <p className="text-xs text-muted-foreground">
                            Resets in {Math.round(status.remaining / 1000)}s
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>
                Recent OAuth security events and activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="border rounded p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          {getEventIcon(log.eventType)}
                          <span
                            className={`text-sm font-medium ${getSeverityColor(log.severity)}`}
                          >
                            {log.eventType.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>

                      {log.serverId && (
                        <p className="text-xs text-muted-foreground">
                          Server: {log.serverId}
                        </p>
                      )}

                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="text-xs bg-muted rounded p-2">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="migration" className="space-y-4">
          {migrationStatus && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Migration Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium">Current Version</p>
                      <p className="text-xl font-bold">
                        {migrationStatus.currentVersion}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Target Version</p>
                      <p className="text-xl font-bold">
                        {migrationStatus.targetVersion}
                      </p>
                    </div>
                  </div>

                  {migrationStatus.pendingMigrations.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-sm font-medium mb-2">
                          Pending Migrations
                        </p>
                        <div className="space-y-2">
                          {migrationStatus.pendingMigrations.map(
                            (migration) => (
                              <div
                                key={migration.version}
                                className="flex items-center gap-2"
                              >
                                <TrendingUp className="h-4 w-4 text-blue-500" />
                                <span className="text-sm">
                                  {migration.version}: {migration.description}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                        <Button
                          className="mt-4"
                          onClick={handleRunMigration}
                          disabled={isLoading}
                        >
                          Run Migrations
                        </Button>
                      </div>
                    </>
                  )}

                  {migrationStatus.appliedMigrations.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-sm font-medium mb-2">
                          Applied Migrations
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {migrationStatus.appliedMigrations.map((version) => (
                            <Badge key={version} variant="secondary">
                              {version}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Revoke Access Dialog */}
      <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke OAuth Access</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke OAuth access for{" "}
              {selectedSession?.serverName}? This will delete the stored tokens
              and require re-authentication.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevokeDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeAccess}
              disabled={isLoading}
            >
              Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup Dialog */}
      <Dialog open={showBackupDialog} onOpenChange={setShowBackupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create OAuth Backup</DialogTitle>
            <DialogDescription>
              Create a backup of all OAuth configurations and tokens. The backup
              will be encrypted for security.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBackupDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateBackup} disabled={isLoading}>
              Create Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

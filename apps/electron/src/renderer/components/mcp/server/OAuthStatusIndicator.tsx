import React, { useEffect, useState } from "react";
import {
  Shield,
  ShieldOff,
  ShieldAlert,
  RefreshCw,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@mcp_router/ui";
import type { OAuthStatus } from "@mcp_router/shared";

interface OAuthStatusIndicatorProps {
  serverId: string;
  serverName?: string;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
  onAuthenticate?: () => void;
  onConfigure?: () => void;
}

export const OAuthStatusIndicator: React.FC<OAuthStatusIndicatorProps> = ({
  serverId,
  serverName,
  size = "md",
  showDetails = false,
  onAuthenticate,
  onConfigure,
}) => {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStatus();
    // Refresh status every minute if authenticated
    const interval = setInterval(() => {
      if (status?.authenticated) {
        fetchStatus();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [serverId]);

  const fetchStatus = async () => {
    try {
      const oauthStatus = await window.electronAPI.getOAuthStatus(serverId);
      setStatus(oauthStatus);
    } catch (error) {
      console.error("Failed to fetch OAuth status:", error);
      setStatus({
        authenticated: false,
        error: "Failed to fetch status",
      });
    }
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    try {
      await window.electronAPI.refreshOAuthToken(serverId);
      await fetchStatus();
    } catch (error) {
      console.error("Failed to refresh token:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusIcon = () => {
    const iconSize =
      size === "sm" ? "h-4 w-4" : size === "md" ? "h-5 w-5" : "h-6 w-6";

    if (!status) {
      return <Shield className={`${iconSize} text-gray-400`} />;
    }

    if (status.authenticated) {
      // Check if token is expiring soon (within 5 minutes)
      if (status.expiresAt) {
        const expiresIn = status.expiresAt - Date.now();
        if (expiresIn < 5 * 60 * 1000) {
          return (
            <ShieldAlert
              className={`${iconSize} text-yellow-500 animate-pulse`}
            />
          );
        }
      }
      return <Shield className={`${iconSize} text-green-500`} />;
    }

    if (status.error) {
      return <ShieldOff className={`${iconSize} text-red-500`} />;
    }

    return <ShieldOff className={`${iconSize} text-gray-400`} />;
  };

  const getStatusText = () => {
    if (!status) return "Loading...";

    if (status.authenticated) {
      if (status.expiresAt) {
        const expiresIn = status.expiresAt - Date.now();
        if (expiresIn < 0) {
          return "Token expired";
        }
        if (expiresIn < 5 * 60 * 1000) {
          return `Expires in ${Math.floor(expiresIn / 60000)} minutes`;
        }
        if (expiresIn < 60 * 60 * 1000) {
          return `Expires in ${Math.floor(expiresIn / 60000)} minutes`;
        }
        return "Authenticated";
      }
      return "Authenticated";
    }

    return status.error || "Not authenticated";
  };

  const getStatusColor = () => {
    if (!status) return "text-gray-500";

    if (status.authenticated) {
      if (status.expiresAt) {
        const expiresIn = status.expiresAt - Date.now();
        if (expiresIn < 5 * 60 * 1000) {
          return "text-yellow-500";
        }
      }
      return "text-green-500";
    }

    return status.error ? "text-red-500" : "text-gray-500";
  };

  const formatTimeRemaining = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
    return "Less than a minute";
  };

  if (!showDetails) {
    // Simple icon indicator with tooltip
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={
                status?.authenticated ? handleRefreshToken : onAuthenticate
              }
              disabled={loading || refreshing}
              className="p-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
            >
              {refreshing ? (
                <RefreshCw
                  className={`${size === "sm" ? "h-4 w-4" : "h-5 w-5"} animate-spin`}
                />
              ) : (
                getStatusIcon()
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-medium">{getStatusText()}</p>
              {status?.authenticated && status.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expires in{" "}
                  {formatTimeRemaining(status.expiresAt - Date.now())}
                </p>
              )}
              {status?.provider && (
                <p className="text-xs text-muted-foreground">
                  Provider: {status.provider}
                </p>
              )}
              {status?.scopes && status.scopes.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Scopes: {status.scopes.join(", ")}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Detailed status display
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{getStatusIcon()}</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className={`font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </p>
              {status?.authenticated && status.expiresAt && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {formatTimeRemaining(status.expiresAt - Date.now())}
                  </span>
                </div>
              )}
            </div>

            {serverName && (
              <p className="text-sm text-muted-foreground">{serverName}</p>
            )}

            {status?.provider && (
              <p className="text-xs text-muted-foreground">
                Provider: {status.provider}
              </p>
            )}

            {status?.scopes && status.scopes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {status.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="px-2 py-0.5 text-xs bg-muted rounded-full"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            )}

            {status?.lastRefresh && (
              <p className="text-xs text-muted-foreground">
                Last refresh:{" "}
                {new Date(status.lastRefresh).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {status?.authenticated ? (
            <>
              <button
                onClick={handleRefreshToken}
                disabled={refreshing}
                className="p-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                title="Refresh token"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
              {onConfigure && (
                <button
                  onClick={onConfigure}
                  className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
                >
                  Configure
                </button>
              )}
            </>
          ) : (
            <>
              {onAuthenticate && (
                <button
                  onClick={onAuthenticate}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  Authenticate
                </button>
              )}
              {onConfigure && (
                <button
                  onClick={onConfigure}
                  className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
                >
                  Configure
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Warning for expiring tokens */}
      {status?.authenticated &&
        status.expiresAt &&
        (() => {
          const expiresIn = status.expiresAt - Date.now();
          if (expiresIn < 5 * 60 * 1000 && expiresIn > 0) {
            return (
              <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <div className="flex items-center gap-2 text-xs text-yellow-800 dark:text-yellow-200">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Token expiring soon. Click refresh to renew.</span>
                </div>
              </div>
            );
          }
          if (expiresIn <= 0) {
            return (
              <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <div className="flex items-center gap-2 text-xs text-red-800 dark:text-red-200">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Token has expired. Please re-authenticate.</span>
                </div>
              </div>
            );
          }
          return null;
        })()}
    </div>
  );
};

/**
 * Authentication Indicator Component
 *
 * Displays appropriate authentication status based on the server's auth method:
 * - No authentication: No icon or unlocked padlock
 * - Bearer Token: Key icon with status
 * - OAuth: Shield icon with OAuth status
 */

import React, { useEffect, useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Key,
  LockOpen,
  RefreshCw,
} from "lucide-react";
import { MCPServer, OAuthStatus } from "@mcp_router/shared";
import { cn } from "@mcp_router/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@mcp_router/ui";
import { useTranslation } from "react-i18next";

interface AuthenticationIndicatorProps {
  server: MCPServer;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
  onAuthenticate?: () => void;
  onConfigure?: () => void;
}

export enum AuthenticationType {
  NONE = "none",
  BEARER_TOKEN = "bearer_token",
  OAUTH = "oauth",
}

/**
 * Detect the authentication type for a server
 */
export function getAuthenticationType(server: MCPServer): AuthenticationType {
  // Check if server has OAuth configuration
  if (server.oauthStatus?.configured) {
    return AuthenticationType.OAUTH;
  }

  // Check if server uses bearer token (for remote servers)
  if (server.serverType === "remote" && server.bearerToken) {
    return AuthenticationType.BEARER_TOKEN;
  }

  // Check if server requires bearer token but doesn't have one
  if (server.serverType === "remote" && !server.bearerToken) {
    // Remote servers typically require some form of authentication
    return AuthenticationType.BEARER_TOKEN;
  }

  // Check for API keys or tokens in environment variables
  // Common patterns for API key/token environment variables
  const authEnvPatterns = [
    "API_KEY",
    "APIKEY",
    "TOKEN",
    "AUTH_TOKEN",
    "ACCESS_TOKEN",
    "SECRET",
    "CLIENT_SECRET",
    "API_SECRET",
    "KEY",
    "BEARER",
    "AUTHORIZATION",
    "AUTH",
    "CREDENTIALS",
    "PASSWORD",
  ];

  if (server.env) {
    const envKeys = Object.keys(server.env);
    const hasAuthEnv = envKeys.some((key) => {
      const upperKey = key.toUpperCase();
      return authEnvPatterns.some((pattern) => upperKey.includes(pattern));
    });

    if (hasAuthEnv) {
      return AuthenticationType.BEARER_TOKEN; // Use key icon for API keys/tokens
    }
  }

  return AuthenticationType.NONE;
}

/**
 * Check if a server requires authentication
 */
export function requiresAuthentication(server: MCPServer): boolean {
  return getAuthenticationType(server) !== AuthenticationType.NONE;
}

export const AuthenticationIndicator: React.FC<
  AuthenticationIndicatorProps
> = ({
  server,
  size = "md",
  showDetails = false,
  onAuthenticate,
  onConfigure,
}) => {
  const { t } = useTranslation();
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [hasOAuthConfig, setHasOAuthConfig] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const authType = getAuthenticationType(server);
  const iconSize =
    size === "sm" ? "h-4 w-4" : size === "md" ? "h-5 w-5" : "h-6 w-6";

  // Check if OAuth is configured for this server
  useEffect(() => {
    const checkOAuthConfig = async () => {
      try {
        const configured = await window.electronAPI.hasOAuthConfiguration(
          server.id,
        );
        setHasOAuthConfig(configured);
        if (configured) {
          fetchOAuthStatus();
        }
      } catch (error) {
        console.error("Failed to check OAuth configuration:", error);
      }
    };

    checkOAuthConfig();

    // Refresh status every minute if authenticated
    const interval = setInterval(() => {
      if (hasOAuthConfig && oauthStatus?.authenticated) {
        fetchOAuthStatus();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [server.id]);

  const fetchOAuthStatus = async () => {
    try {
      const status = await window.electronAPI.getOAuthStatus(server.id);
      setOauthStatus(status);
    } catch (error) {
      console.error("Failed to fetch OAuth status:", error);
      setOauthStatus({
        authenticated: false,
        error: "Failed to fetch status",
      });
    }
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    try {
      await window.electronAPI.refreshOAuthToken(server.id);
      await fetchOAuthStatus();
    } catch (error) {
      console.error("Failed to refresh token:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // Don't show indicator for servers without authentication
  if (authType === AuthenticationType.NONE && !showDetails) {
    return null;
  }

  // Bearer Token / API Key Authentication
  if (authType === AuthenticationType.BEARER_TOKEN) {
    // Check if it's a remote server with bearer token or has API key in env
    const isRemoteBearer = server.serverType === "remote";
    const hasToken = isRemoteBearer ? Boolean(server.bearerToken) : true;

    // Check if there are any API keys in environment variables
    const hasApiKeyInEnv =
      server.env &&
      Object.keys(server.env).some((key) => {
        const upperKey = key.toUpperCase();
        return [
          "API_KEY",
          "APIKEY",
          "TOKEN",
          "AUTH_TOKEN",
          "ACCESS_TOKEN",
          "SECRET",
          "CLIENT_SECRET",
          "API_SECRET",
          "KEY",
          "BEARER",
          "AUTHORIZATION",
          "AUTH",
          "CREDENTIALS",
          "PASSWORD",
        ].some((pattern) => upperKey.includes(pattern));
      });

    const isConfigured = isRemoteBearer ? hasToken : hasApiKeyInEnv;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "p-1.5 rounded-full transition-colors",
                isConfigured
                  ? "text-emerald-500 hover:bg-emerald-500/10"
                  : "text-orange-500 hover:bg-orange-500/10",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onConfigure?.();
              }}
            >
              <Key className={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {isConfigured
                ? t("auth.bearerToken.configured")
                : t("auth.bearerToken.required")}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // OAuth Authentication
  if (authType === AuthenticationType.OAUTH) {
    const getOAuthIcon = () => {
      if (!oauthStatus) {
        return <Shield className={cn(iconSize, "text-gray-400")} />;
      }

      if (oauthStatus.authenticated) {
        // Check if token is expiring soon (within 5 minutes)
        if (oauthStatus.expiresAt) {
          const expiresIn = oauthStatus.expiresAt - Date.now();
          if (expiresIn < 5 * 60 * 1000) {
            return (
              <ShieldAlert
                className={cn(iconSize, "text-yellow-500 animate-pulse")}
              />
            );
          }
        }
        return <ShieldCheck className={cn(iconSize, "text-emerald-500")} />;
      }

      if (oauthStatus.error) {
        return <ShieldX className={cn(iconSize, "text-red-500")} />;
      }

      return <ShieldX className={cn(iconSize, "text-orange-500")} />;
    };

    const getTooltipContent = () => {
      if (!oauthStatus) {
        return t("auth.oauth.loading");
      }

      if (oauthStatus.authenticated) {
        if (oauthStatus.expiresAt) {
          const expiresIn = oauthStatus.expiresAt - Date.now();
          if (expiresIn < 5 * 60 * 1000) {
            return t("auth.oauth.expiringSoon");
          }
        }
        return t("auth.oauth.authenticated");
      }

      if (oauthStatus.error) {
        return oauthStatus.error;
      }

      return t("auth.oauth.notAuthenticated");
    };

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "p-1.5 rounded-full transition-colors relative",
                oauthStatus?.authenticated
                  ? "hover:bg-emerald-500/10"
                  : "hover:bg-orange-500/10",
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (oauthStatus?.authenticated) {
                  onConfigure?.();
                } else {
                  onAuthenticate?.();
                }
              }}
            >
              {getOAuthIcon()}
              {refreshing && (
                <RefreshCw className="h-3 w-3 absolute -bottom-1 -right-1 animate-spin" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p>{getTooltipContent()}</p>
              {showDetails &&
                oauthStatus?.authenticated &&
                oauthStatus.expiresAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("auth.oauth.expiresAt", {
                      time: new Date(oauthStatus.expiresAt).toLocaleString(),
                    })}
                  </p>
                )}
              {oauthStatus?.authenticated && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRefreshToken();
                  }}
                >
                  {t("auth.oauth.refresh")}
                </button>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // No Authentication (only shown when showDetails is true)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="p-1.5 text-gray-400">
            <LockOpen className={iconSize} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("auth.none.noAuthRequired")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

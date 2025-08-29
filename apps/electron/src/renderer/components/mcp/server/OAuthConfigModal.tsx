import React, { useState, useEffect } from "react";
import {
  X,
  Shield,
  AlertCircle,
  Check,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type {
  OAuthConfig,
  OAuthProvider,
  OAuthStatus,
} from "@mcp_router/shared";

interface OAuthConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  initialConfig?: Partial<OAuthConfig>;
  onSave?: (config: Partial<OAuthConfig>) => Promise<void>;
}

const OAUTH_PROVIDERS = [
  { value: "custom", label: "Custom OAuth Provider", icon: "🔧" },
  { value: "github", label: "GitHub", icon: "🐙" },
  { value: "google", label: "Google", icon: "🔍" },
  { value: "microsoft", label: "Microsoft", icon: "🪟" },
  { value: "slack", label: "Slack", icon: "💬" },
  { value: "gitlab", label: "GitLab", icon: "🦊" },
  { value: "bitbucket", label: "Bitbucket", icon: "🪣" },
] as const;

const DEFAULT_SCOPES: Record<string, string[]> = {
  github: ["read:user", "repo"],
  google: ["openid", "email", "profile"],
  microsoft: ["openid", "email", "profile", "offline_access"],
  slack: ["chat:write", "channels:read", "users:read"],
  gitlab: ["read_user", "api"],
  bitbucket: ["account", "repository"],
  custom: [],
};

export const OAuthConfigModal: React.FC<OAuthConfigModalProps> = ({
  isOpen,
  onClose,
  serverId,
  serverName,
  initialConfig,
  onSave,
}) => {
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus | null>(null);

  const [config, setConfig] = useState<Partial<OAuthConfig>>({
    provider: "custom" as OAuthProvider,
    authServerUrl: "",
    clientId: "",
    clientSecret: "",
    scopes: [],
    usePKCE: true,
    dynamicRegistration: false,
    ...initialConfig,
  });

  const [customScope, setCustomScope] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isOpen && serverId) {
      fetchOAuthStatus();
    }
  }, [isOpen, serverId]);

  const fetchOAuthStatus = async () => {
    try {
      const status = await window.electronAPI.getOAuthStatus(serverId);
      setOAuthStatus(status);
    } catch (error) {
      console.error("Failed to fetch OAuth status:", error);
    }
  };

  const handleProviderChange = (provider: string) => {
    setConfig((prev) => ({
      ...prev,
      provider: provider as OAuthProvider,
      scopes: DEFAULT_SCOPES[provider] || [],
    }));
  };

  const handleScopeToggle = (scope: string) => {
    setConfig((prev) => ({
      ...prev,
      scopes: prev.scopes?.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...(prev.scopes || []), scope],
    }));
  };

  const handleAddCustomScope = () => {
    if (customScope.trim()) {
      setConfig((prev) => ({
        ...prev,
        scopes: [...(prev.scopes || []), customScope.trim()],
      }));
      setCustomScope("");
    }
  };

  const handleDiscoverEndpoints = async () => {
    if (!config.authServerUrl) {
      toast.error("Please enter the OAuth server URL");
      return;
    }

    setDiscovering(true);
    try {
      const metadata = await window.electronAPI.discoverOAuthEndpoints(
        config.authServerUrl,
        config.provider,
      );

      if (metadata) {
        setConfig((prev) => ({
          ...prev,
          authorizationEndpoint: metadata.authorizationEndpoint,
          tokenEndpoint: metadata.tokenEndpoint,
          revocationEndpoint: metadata.revocationEndpoint,
          introspectionEndpoint: metadata.introspectionEndpoint,
          userInfoEndpoint: metadata.userInfoEndpoint,
        }));

        toast.success("OAuth endpoints discovered successfully");
      } else {
        toast.warning(
          "Could not discover endpoints. Please enter them manually.",
        );
      }
    } catch (error) {
      toast.error("Failed to discover OAuth endpoints");
    } finally {
      setDiscovering(false);
    }
  };

  const handleSave = async () => {
    // Validate required fields
    if (config.provider === "custom" && !config.authServerUrl) {
      toast.error("OAuth server URL is required for custom providers");
      return;
    }

    if (!config.dynamicRegistration && !config.clientId) {
      toast.error(
        "Client ID is required when dynamic registration is disabled",
      );
      return;
    }

    setLoading(true);
    try {
      if (onSave) {
        await onSave(config);
      }
      toast.success("OAuth configuration saved successfully");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save OAuth configuration",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.authenticateOAuth(
        serverId,
        config.scopes,
      );
      if (result.success) {
        toast.success("Successfully authenticated with OAuth provider");
        fetchOAuthStatus();
      } else {
        toast.error(result.error?.errorDescription || "Authentication failed");
      }
    } catch (error) {
      toast.error("Failed to authenticate");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    setLoading(true);
    try {
      await window.electronAPI.revokeOAuthAccess(serverId);
      toast.success("OAuth access revoked successfully");
      fetchOAuthStatus();
    } catch (error) {
      toast.error("Failed to revoke OAuth access");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-background rounded-lg shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-background border-b">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold">OAuth Configuration</h2>
              <p className="text-sm text-muted-foreground">{serverName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* OAuth Status */}
        {oauthStatus && (
          <div
            className={`mx-6 mt-6 p-4 rounded-lg border ${
              oauthStatus.authenticated
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {oauthStatus.authenticated ? (
                  <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                )}
                <div>
                  <p className="font-medium">
                    {oauthStatus.authenticated
                      ? "Authenticated"
                      : "Not Authenticated"}
                  </p>
                  {oauthStatus.expiresAt && (
                    <p className="text-sm text-muted-foreground">
                      Expires:{" "}
                      {new Date(oauthStatus.expiresAt).toLocaleString()}
                    </p>
                  )}
                  {oauthStatus.scopes && (
                    <p className="text-sm text-muted-foreground">
                      Scopes: {oauthStatus.scopes.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {oauthStatus.authenticated ? (
                  <>
                    <button
                      onClick={handleAuthenticate}
                      disabled={loading}
                      className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                      />
                    </button>
                    <button
                      onClick={handleRevoke}
                      disabled={loading}
                      className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleAuthenticate}
                    disabled={loading}
                    className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    Authenticate
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">OAuth Provider</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {OAUTH_PROVIDERS.map((provider) => (
                <button
                  key={provider.value}
                  onClick={() => handleProviderChange(provider.value)}
                  className={`p-3 rounded-lg border transition-all ${
                    config.provider === provider.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{provider.icon}</span>
                    <span className="text-sm font-medium">
                      {provider.label}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* OAuth Server URL (for custom provider) */}
          {config.provider === "custom" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">OAuth Server URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={config.authServerUrl || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      authServerUrl: e.target.value,
                    }))
                  }
                  placeholder="https://oauth.example.com"
                  className="flex-1 px-3 py-2 rounded-md border bg-background"
                />
                <button
                  onClick={handleDiscoverEndpoints}
                  disabled={discovering || !config.authServerUrl}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 disabled:opacity-50"
                >
                  {discovering ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    "Discover"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Client Credentials */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dynamicRegistration"
                checked={config.dynamicRegistration}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    dynamicRegistration: e.target.checked,
                  }))
                }
                className="rounded border-gray-300"
              />
              <label
                htmlFor="dynamicRegistration"
                className="text-sm font-medium"
              >
                Use Dynamic Client Registration
              </label>
            </div>

            {!config.dynamicRegistration && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Client ID</label>
                  <input
                    type="text"
                    value={config.clientId || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        clientId: e.target.value,
                      }))
                    }
                    placeholder="Your OAuth Client ID"
                    className="w-full px-3 py-2 rounded-md border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Client Secret (optional)
                  </label>
                  <input
                    type="password"
                    value={config.clientSecret || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        clientSecret: e.target.value,
                      }))
                    }
                    placeholder="Your OAuth Client Secret"
                    className="w-full px-3 py-2 rounded-md border bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty if using PKCE (recommended for desktop apps)
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Scopes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Scopes</label>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(config.scopes || []).map((scope) => (
                  <div
                    key={scope}
                    className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm flex items-center gap-2"
                  >
                    <span>{scope}</span>
                    <button
                      onClick={() => handleScopeToggle(scope)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customScope}
                  onChange={(e) => setCustomScope(e.target.value)}
                  onKeyPress={(e) =>
                    e.key === "Enter" && handleAddCustomScope()
                  }
                  placeholder="Add custom scope"
                  className="flex-1 px-3 py-2 rounded-md border bg-background"
                />
                <button
                  onClick={handleAddCustomScope}
                  disabled={!customScope.trim()}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* PKCE */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="usePKCE"
              checked={config.usePKCE !== false}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, usePKCE: e.target.checked }))
              }
              className="rounded border-gray-300"
            />
            <label htmlFor="usePKCE" className="text-sm font-medium">
              Use PKCE (Proof Key for Code Exchange)
            </label>
          </div>

          {/* Advanced Settings */}
          <div className="space-y-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
            >
              <span>{showAdvanced ? "Hide" : "Show"} Advanced Settings</span>
              <ExternalLink className="h-3 w-3" />
            </button>

            {showAdvanced && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Authorization Endpoint
                  </label>
                  <input
                    type="url"
                    value={config.authorizationEndpoint || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        authorizationEndpoint: e.target.value,
                      }))
                    }
                    placeholder="https://oauth.example.com/authorize"
                    className="w-full px-3 py-2 rounded-md border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Token Endpoint</label>
                  <input
                    type="url"
                    value={config.tokenEndpoint || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        tokenEndpoint: e.target.value,
                      }))
                    }
                    placeholder="https://oauth.example.com/token"
                    className="w-full px-3 py-2 rounded-md border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Revocation Endpoint (optional)
                  </label>
                  <input
                    type="url"
                    value={config.revocationEndpoint || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        revocationEndpoint: e.target.value,
                      }))
                    }
                    placeholder="https://oauth.example.com/revoke"
                    className="w-full px-3 py-2 rounded-md border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Audience (optional)
                  </label>
                  <input
                    type="text"
                    value={config.audience || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        audience: e.target.value,
                      }))
                    }
                    placeholder="API audience identifier"
                    className="w-full px-3 py-2 rounded-md border bg-background"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 p-6 bg-background border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
};

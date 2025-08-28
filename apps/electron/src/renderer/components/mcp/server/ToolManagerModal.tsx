import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  ToggleLeft,
  ToggleRight,
  Settings2,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@mcp_router/ui";
import {
  Button,
  Input,
  Badge,
  ScrollArea,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Separator,
} from "@mcp_router/ui";
import {
  ServerTool,
  ToolStatistics,
  ToolPreferenceUpdate,
  ClientWithTokens,
} from "@mcp_router/shared";
import { useToast, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@mcp_router/ui";
import { useClientStore } from "@/renderer/stores/client-store";

interface ToolManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  clientId?: string;
}

export const ToolManagerModal: React.FC<ToolManagerModalProps> = ({
  isOpen,
  onClose,
  serverId,
  serverName,
  clientId: initialClientId,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { clients, fetchClients } = useClientStore();

  const [tools, setTools] = useState<ServerTool[]>([]);
  const [statistics, setStatistics] = useState<ToolStatistics | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(initialClientId);
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, ToolPreferenceUpdate>
  >(new Map());

  // Load clients on mount
  useEffect(() => {
    if (isOpen && clients.length === 0) {
      fetchClients();
    }
  }, [isOpen, clients.length, fetchClients]);

  // Load tools and statistics
  useEffect(() => {
    if (isOpen && serverId) {
      loadTools();
    }
  }, [isOpen, serverId, selectedClientId]);

  const loadTools = async () => {
    setLoading(true);
    try {
      const [toolsData, statsData] = await Promise.all([
        window.electronAPI.getServerTools(serverId, selectedClientId),
        window.electronAPI.getToolStatistics(serverId, selectedClientId),
      ]);

      setTools(toolsData);
      setStatistics(statsData);
    } catch (error) {
      console.error("Failed to load tools:", error);
      toast({
        title: t("tools.loadError"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter tools based on search and active tab
  const filteredTools = useMemo(() => {
    let filtered = tools;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tool) =>
          tool.toolName.toLowerCase().includes(query) ||
          tool.customName?.toLowerCase().includes(query) ||
          tool.customDescription?.toLowerCase().includes(query),
      );
    }

    // Apply tab filter
    switch (activeTab) {
      case "enabled":
        filtered = filtered.filter((t) => {
          const pending = pendingChanges.get(t.toolName);
          return pending ? pending.enabled : t.enabled;
        });
        break;
      case "disabled":
        filtered = filtered.filter((t) => {
          const pending = pendingChanges.get(t.toolName);
          return pending ? !pending.enabled : !t.enabled;
        });
        break;
      case "customized":
        filtered = filtered.filter((t) => t.customName || t.customDescription);
        break;
    }

    return filtered;
  }, [tools, searchQuery, activeTab, pendingChanges]);

  // Handle tool toggle
  const handleToolToggle = (toolName: string, enabled: boolean) => {
    const existing = pendingChanges.get(toolName);
    const tool = tools.find((t) => t.toolName === toolName);

    const update: ToolPreferenceUpdate = {
      toolName,
      enabled,
      customName: existing?.customName ?? tool?.customName,
      customDescription: existing?.customDescription ?? tool?.customDescription,
    };

    setPendingChanges(new Map(pendingChanges.set(toolName, update)));
  };

  // Handle bulk operations
  const handleEnableAll = () => {
    const updates = new Map(pendingChanges);
    filteredTools.forEach((tool) => {
      updates.set(tool.toolName, {
        toolName: tool.toolName,
        enabled: true,
        customName: tool.customName,
        customDescription: tool.customDescription,
      });
    });
    setPendingChanges(updates);
  };

  const handleDisableAll = () => {
    const updates = new Map(pendingChanges);
    filteredTools.forEach((tool) => {
      updates.set(tool.toolName, {
        toolName: tool.toolName,
        enabled: false,
        customName: tool.customName,
        customDescription: tool.customDescription,
      });
    });
    setPendingChanges(updates);
  };

  // Save changes
  const handleSave = async () => {
    if (pendingChanges.size === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await window.electronAPI.bulkUpdateTools({
        serverId,
        clientId: selectedClientId,
        updates: Array.from(pendingChanges.values()),
      });

      toast({
        title: t("tools.saveSuccess"),
        description: t("tools.changesSaved", { count: pendingChanges.size }),
      });

      // Reload to get fresh data
      await loadTools();
      setPendingChanges(new Map());
      onClose();
    } catch (error) {
      console.error("Failed to save tool preferences:", error);
      toast({
        title: t("tools.saveError"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Reset preferences
  const handleReset = async () => {
    if (!confirm(t("tools.resetConfirm"))) return;

    setLoading(true);
    try {
      await window.electronAPI.resetToolPreferences(serverId, selectedClientId);
      toast({
        title: t("tools.resetSuccess"),
      });
      await loadTools();
      setPendingChanges(new Map());
    } catch (error) {
      console.error("Failed to reset preferences:", error);
      toast({
        title: t("tools.resetError"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get current state of a tool (considering pending changes)
  const getToolState = (tool: ServerTool) => {
    const pending = pendingChanges.get(tool.toolName);
    return {
      enabled: pending ? pending.enabled : tool.enabled,
      customName: pending?.customName ?? tool.customName,
      customDescription: pending?.customDescription ?? tool.customDescription,
    };
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {t("tools.manageTools")} - {serverName}
          </DialogTitle>
          <DialogDescription>{t("tools.description")}</DialogDescription>
        </DialogHeader>

        {/* Client Selector */}
        {clients.length > 0 && (
          <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium">{t("tools.configureFor", "Configure for:")}</span>
            <Select
              value={selectedClientId || "global"}
              onValueChange={(value) => setSelectedClientId(value === "global" ? undefined : value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  <span className="font-medium">Global Settings</span>
                </SelectItem>
                <Separator />
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    <span className="font-medium">{client.name}</span>
                    {client.activeTokenCount && client.activeTokenCount > 0 && (
                      <Badge variant="outline" className="ml-2">
                        {client.activeTokenCount} active
                      </Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedClientId && (
              <span className="text-xs text-muted-foreground ml-2">
                Client-specific settings override global settings
              </span>
            )}
          </div>
        )}

        {/* Statistics */}
        {statistics && (
          <div className="flex gap-4 p-4 bg-muted rounded-lg">
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold">{statistics.total}</div>
              <div className="text-xs text-muted-foreground">
                {t("tools.total")}
              </div>
            </div>
            <Separator orientation="vertical" />
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold text-green-600">
                {statistics.enabled}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("tools.enabled")}
              </div>
            </div>
            <Separator orientation="vertical" />
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold text-red-600">
                {statistics.disabled}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("tools.disabled")}
              </div>
            </div>
            <Separator orientation="vertical" />
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {statistics.customized}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("tools.customized")}
              </div>
            </div>
          </div>
        )}

        {/* Search and Actions */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("tools.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableAll}
            disabled={loading || filteredTools.length === 0}
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            {t("tools.enableAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisableAll}
            disabled={loading || filteredTools.length === 0}
          >
            <XCircle className="h-4 w-4 mr-1" />
            {t("tools.disableAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            {t("tools.reset")}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              {t("tools.all")} ({tools.length})
            </TabsTrigger>
            <TabsTrigger value="enabled">
              {t("tools.enabled")} ({statistics?.enabled || 0})
            </TabsTrigger>
            <TabsTrigger value="disabled">
              {t("tools.disabled")} ({statistics?.disabled || 0})
            </TabsTrigger>
            <TabsTrigger value="customized">
              {t("tools.customized")} ({statistics?.customized || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <div className="flex justify-center items-center h-32">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredTools.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {searchQuery
                    ? t("tools.noSearchResults")
                    : t("tools.noTools")}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTools.map((tool) => {
                    const state = getToolState(tool);
                    const hasChanges = pendingChanges.has(tool.toolName);

                    return (
                      <div
                        key={tool.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          hasChanges
                            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                            : ""
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {state.customName || tool.toolName}
                            </span>
                            {state.customName && (
                              <Badge variant="outline" className="text-xs">
                                {tool.toolName}
                              </Badge>
                            )}
                            {hasChanges && (
                              <Badge variant="default" className="text-xs">
                                {t("tools.modified")}
                              </Badge>
                            )}
                          </div>
                          {(state.customDescription ||
                            tool.originalDescription) && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {state.customDescription ||
                                tool.originalDescription ||
                                t("tools.noDescription")}
                            </p>
                          )}
                        </div>
                        <Switch
                          checked={state.enabled}
                          onCheckedChange={(checked) =>
                            handleToolToggle(tool.toolName, checked)
                          }
                          disabled={loading}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <div className="flex justify-between items-center w-full">
            <div className="text-sm text-muted-foreground">
              {pendingChanges.size > 0 && (
                <span>
                  {t("tools.pendingChanges", { count: pendingChanges.size })}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || pendingChanges.size === 0}
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t("common.saving")}
                  </>
                ) : (
                  t("common.save")
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useState, useEffect } from "react";
import { Copy, Plus, Trash2, Shield, Eye, EyeOff } from "lucide-react";
import { Button, Label, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Checkbox } from "@mcp_router/ui";
import { useClientStore } from "@/renderer/stores/client-store";
import { useServerStore } from "@/renderer/stores";
import { ClientWithTokens, Token } from "@mcp_router/shared";
import { toast } from "sonner";

interface TokenManagementModalProps {
  client: ClientWithTokens;
  onClose: () => void;
}

export default function TokenManagementModal({
  client,
  onClose,
}: TokenManagementModalProps) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [showTokenValues, setShowTokenValues] = useState<Record<string, boolean>>({});
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  const { generateToken, revokeToken, getClientTokens } = useClientStore();
  const { servers } = useServerStore();

  useEffect(() => {
    loadTokens();
  }, [client.id]);

  const loadTokens = async () => {
    try {
      setIsLoading(true);
      const clientTokens = await getClientTokens(client.id);
      setTokens(clientTokens);
    } catch (err) {
      console.error("Failed to load tokens:", err);
      toast.error("Failed to load tokens");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateToken = async () => {
    setIsGenerating(true);
    try {
      const newToken = await generateToken(client.id, selectedServerIds);
      setTokens([...tokens, newToken]);
      setSelectedServerIds([]);
      setShowGenerateDialog(false);
      
      // Show the token value and copy to clipboard
      setShowTokenValues({ ...showTokenValues, [newToken.id]: true });
      await navigator.clipboard.writeText(newToken.id);
      
      toast.success("Token Generated", {
        description: "Token has been generated and copied to clipboard. Store it securely!",
      });
    } catch (err) {
      console.error("Failed to generate token:", err);
      toast.error("Failed to generate token");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    if (!window.confirm("Are you sure you want to revoke this token? This action cannot be undone.")) {
      return;
    }

    try {
      await revokeToken(tokenId);
      setTokens(tokens.filter((t) => t.id !== tokenId));
      toast.success("Token Revoked", {
        description: "Token has been successfully revoked",
      });
    } catch (err) {
      console.error("Failed to revoke token:", err);
      toast.error("Failed to revoke token");
    }
  };

  const handleCopyToken = async (tokenId: string) => {
    try {
      await navigator.clipboard.writeText(tokenId);
      toast.success("Token copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy token");
    }
  };

  const toggleTokenVisibility = (tokenId: string) => {
    setShowTokenValues({
      ...showTokenValues,
      [tokenId]: !showTokenValues[tokenId],
    });
  };

  const handleServerToggle = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId]
    );
  };

  const maskToken = (tokenId: string) => {
    if (tokenId.length <= 12) return "••••••••";
    return `${tokenId.substring(0, 8)}••••${tokenId.substring(tokenId.length - 4)}`;
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Token Management - {client.name}</DialogTitle>
          <DialogDescription>
            Manage access tokens for this client. Tokens provide authenticated access to MCP Router services.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Statistics */}
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-gray-400" />
              <span>Active Tokens: {tokens.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Total Tokens: {tokens.length}</span>
            </div>
          </div>

          {/* Generate Token Button */}
          <div className="flex justify-end">
            <Button onClick={() => setShowGenerateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Generate Token
            </Button>
          </div>

          {/* Tokens Table */}
          {isLoading ? (
            <div className="text-center py-8">Loading tokens...</div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No tokens yet. Generate your first token to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Server Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-mono text-sm">
                        <span>
                          {showTokenValues[token.id]
                            ? token.id
                            : maskToken(token.id)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleTokenVisibility(token.id)}
                        >
                          {showTokenValues[token.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToken(token.id)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {token.serverIds && token.serverIds.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {token.serverIds.map((serverId) => {
                            const server = servers.find((s: any) => s.id === serverId);
                            return (
                              <Badge key={serverId} variant="secondary" className="text-xs">
                                {server?.name || serverId}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-gray-400">All servers</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        Active
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(token.issuedAt * 1000).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeToken(token.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Generate Token Dialog */}
          {showGenerateDialog && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Generate New Token</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label>Server Access</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Select which servers this token can access (leave empty for all servers)
                    </p>
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                      {servers.map((server) => (
                        <div key={server.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`token-server-${server.id}`}
                            checked={selectedServerIds.includes(server.id)}
                            onCheckedChange={() => handleServerToggle(server.id)}
                            disabled={isGenerating}
                          />
                          <Label
                            htmlFor={`token-server-${server.id}`}
                            className="flex-1 cursor-pointer font-normal"
                          >
                            {server.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowGenerateDialog(false)}
                      disabled={isGenerating}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleGenerateToken} disabled={isGenerating}>
                      {isGenerating ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
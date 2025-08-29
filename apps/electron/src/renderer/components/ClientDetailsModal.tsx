import { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Checkbox,
} from "@mcp_router/ui";
import { useClientStore } from "@/renderer/stores/client-store";
import { ClientWithTokens } from "@mcp_router/shared";
import { useServerStore } from "@/renderer/stores";

interface ClientDetailsModalProps {
  client: ClientWithTokens | null;
  onClose: () => void;
}

export default function ClientDetailsModal({
  client,
  onClose,
}: ClientDetailsModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createClient, updateClient } = useClientStore();
  const { servers } = useServerStore();

  useEffect(() => {
    if (client) {
      setName(client.name);
      setDescription(client.description || "");
      // For existing clients, we'll need to fetch their server access from tokens
      // This would require additional API calls to get token details
    } else {
      setName("");
      setDescription("");
      setSelectedServerIds([]);
    }
  }, [client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Client name is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (client) {
        // Update existing client
        await updateClient(client.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          serverAccess:
            selectedServerIds.length > 0 ? selectedServerIds : undefined,
        });
      } else {
        // Create new client
        await createClient({
          name: name.trim(),
          description: description.trim() || undefined,
          serverAccess:
            selectedServerIds.length > 0 ? selectedServerIds : undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleServerToggle = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId],
    );
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {client ? "Edit Client" : "Create New Client"}
          </DialogTitle>
          <DialogDescription>
            {client
              ? "Update the client information and server access"
              : "Configure a new API client with access to specific MCP servers"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Client Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              placeholder="My API Client"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              placeholder="Optional description of what this client is used for"
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {!client && servers.length > 0 && (
            <div className="space-y-2">
              <Label>Server Access</Label>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select which MCP servers this client can access
              </p>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {servers.map((server: any) => (
                  <div key={server.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`server-${server.id}`}
                      checked={selectedServerIds.includes(server.id)}
                      onCheckedChange={() => handleServerToggle(server.id)}
                      disabled={isSubmitting}
                    />
                    <Label
                      htmlFor={`server-${server.id}`}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      {server.name}
                      {server.description && (
                        <span className="text-sm text-gray-500 ml-2">
                          ({server.description})
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
              {selectedServerIds.length === 0 && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  No servers selected. You can grant access later by generating
                  tokens.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? client
                  ? "Updating..."
                  : "Creating..."
                : client
                  ? "Update Client"
                  : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

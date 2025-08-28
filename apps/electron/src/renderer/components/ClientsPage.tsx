import { useState, useEffect } from "react";
import { Plus, Search, Users, Key, Shield, Trash2, Edit } from "lucide-react";
import { Button } from "@mcp_router/ui";
import { Input } from "@mcp_router/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@mcp_router/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mcp_router/ui";
import { Badge } from "@mcp_router/ui";
import { useClientStore } from "@/renderer/stores/client-store";
import ClientDetailsModal from "./ClientDetailsModal";
import TokenManagementModal from "./TokenManagementModal";
import { ClientWithTokens } from "@mcp_router/shared";

export default function ClientsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showClientModal, setShowClientModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithTokens | null>(null);
  
  const {
    clients,
    selectedClient,
    isLoading,
    error,
    fetchClients,
    deleteClient,
    selectClient,
    clearError,
  } = useClientStore();

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateClient = () => {
    setEditingClient(null);
    setShowClientModal(true);
  };

  const handleEditClient = (client: ClientWithTokens) => {
    setEditingClient(client);
    setShowClientModal(true);
  };

  const handleManageTokens = (client: ClientWithTokens) => {
    selectClient(client);
    setShowTokenModal(true);
  };

  const handleDeleteClient = async (clientId: string) => {
    if (window.confirm("Are you sure you want to delete this client? All associated tokens will be revoked.")) {
      try {
        await deleteClient(clientId);
      } catch (err) {
        console.error("Failed to delete client:", err);
      }
    }
  };

  const handleCloseModal = () => {
    setShowClientModal(false);
    setEditingClient(null);
    fetchClients(); // Refresh the list
  };

  const handleCloseTokenModal = () => {
    setShowTokenModal(false);
    fetchClients(); // Refresh to update token counts
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Client Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage API clients and their access tokens
          </p>
        </div>
        <Button onClick={handleCreateClient}>
          <Plus className="mr-2 h-4 w-4" />
          New Client
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients.filter(c => c.activeTokenCount && c.activeTokenCount > 0).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients.reduce((sum, c) => sum + (c.tokenCount || 0), 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients.reduce((sum, c) => sum + (c.activeTokenCount || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={clearError}
            className="mt-2"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>
            API clients with access to MCP Router services
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading clients...</div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? "No clients found matching your search" : "No clients yet. Create your first client to get started."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        {client.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.description || <span className="text-gray-400">No description</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-gray-400" />
                        <span>{client.activeTokenCount || 0} / {client.tokenCount || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.activeTokenCount && client.activeTokenCount > 0 ? "default" : "secondary"}>
                        {client.activeTokenCount && client.activeTokenCount > 0 ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(client.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleManageTokens(client)}
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClient(client)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClient(client.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      {showClientModal && (
        <ClientDetailsModal
          client={editingClient}
          onClose={handleCloseModal}
        />
      )}
      
      {showTokenModal && selectedClient && (
        <TokenManagementModal
          client={selectedClient}
          onClose={handleCloseTokenModal}
        />
      )}
    </div>
  );
}
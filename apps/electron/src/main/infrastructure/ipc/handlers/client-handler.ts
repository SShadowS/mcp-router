import { ipcMain } from "electron";
import { v4 as uuidv4 } from "uuid";
import {
  Client,
  ClientWithTokens,
  ClientCreateDto,
  ClientUpdateDto,
} from "@mcp_router/shared";
import { getSqliteManager } from "../../database";
import { getTokenService } from "@/main/domain/mcp-core/token/token-service";

/**
 * Client management IPC handler
 */
export class ClientHandler {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // List all clients
    ipcMain.handle("client:list", async () => {
      return this.listClients();
    });

    // Get single client
    ipcMain.handle("client:get", async (_, id: string) => {
      return this.getClient(id);
    });

    // Create client
    ipcMain.handle("client:create", async (_, dto: ClientCreateDto) => {
      return this.createClient(dto);
    });

    // Update client
    ipcMain.handle("client:update", async (_, id: string, dto: ClientUpdateDto) => {
      return this.updateClient(id, dto);
    });

    // Delete client
    ipcMain.handle("client:delete", async (_, id: string) => {
      return this.deleteClient(id);
    });

    // Get client statistics
    ipcMain.handle("client:stats", async () => {
      return this.getStatistics();
    });
  }

  /**
   * List all clients with their token counts
   */
  private async listClients(): Promise<ClientWithTokens[]> {
    const db = getSqliteManager("mcprouter");
    
    // Get all unique client IDs from tokens
    const tokenData = db.all<{ client_id: string; token_count: number }>(
      `SELECT client_id, COUNT(*) as token_count 
       FROM tokens 
       GROUP BY client_id`
    );

    // Create a map of client IDs to their metadata
    const clientsMap = new Map<string, ClientWithTokens>();

    // Add clients from tokens table
    for (const row of tokenData) {
      clientsMap.set(row.client_id, {
        id: row.client_id,
        name: row.client_id, // Default to ID if no name stored
        description: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tokens: [],
        tokenCount: row.token_count,
        activeTokenCount: row.token_count, // All tokens are considered active for now
      });
    }

    // Check if we have a clients table (we'll create this later if needed)
    const hasClientsTable = db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='clients'"
    );

    if (hasClientsTable) {
      // Get client metadata from clients table
      const clients = db.all<Client>("SELECT * FROM clients");
      
      for (const client of clients) {
        const existing = clientsMap.get(client.id);
        if (existing) {
          // Update with proper metadata
          existing.name = client.name;
          existing.description = client.description;
          existing.createdAt = client.createdAt;
          existing.updatedAt = client.updatedAt;
        } else {
          // Client exists in table but has no tokens
          clientsMap.set(client.id, {
            ...client,
            tokens: [],
            tokenCount: 0,
            activeTokenCount: 0,
          });
        }
      }
    }

    return Array.from(clientsMap.values());
  }

  /**
   * Get a single client with tokens
   */
  private async getClient(id: string): Promise<ClientWithTokens | null> {
    const clients = await this.listClients();
    return clients.find(c => c.id === id) || null;
  }

  /**
   * Create a new client
   */
  private async createClient(dto: ClientCreateDto): Promise<ClientWithTokens> {
    const db = getSqliteManager("mcprouter");
    
    // Ensure clients table exists
    this.ensureClientsTable();

    const now = Date.now();
    const client: Client = {
      id: uuidv4(),
      name: dto.name,
      description: dto.description,
      createdAt: now,
      updatedAt: now,
    };

    // Insert into database
    db.execute(
      `INSERT INTO clients (id, name, description, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [client.id, client.name, client.description || null, client.createdAt, client.updatedAt]
    );

    // Generate an initial token if serverAccess was provided
    let token = null;
    if (dto.serverAccess && dto.serverAccess.length > 0) {
      const tokenService = getTokenService();
      token = tokenService.generateToken({
        clientId: client.id,
        serverIds: dto.serverAccess,
      });
    }

    return {
      ...client,
      tokens: token ? [token] : [],
      tokenCount: token ? 1 : 0,
      activeTokenCount: token ? 1 : 0,
    };
  }

  /**
   * Update a client
   */
  private async updateClient(id: string, dto: ClientUpdateDto): Promise<ClientWithTokens> {
    const db = getSqliteManager("mcprouter");
    
    // Ensure clients table exists
    this.ensureClientsTable();

    const existing = await this.getClient(id);
    if (!existing) {
      throw new Error(`Client ${id} not found`);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (dto.name !== undefined) {
      updates.push("name = ?");
      values.push(dto.name);
    }

    if (dto.description !== undefined) {
      updates.push("description = ?");
      values.push(dto.description);
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      values.push(Date.now());
      values.push(id);

      db.execute(
        `UPDATE clients SET ${updates.join(", ")} WHERE id = ?`,
        values
      );
    }

    // Update server access if provided
    if (dto.serverAccess !== undefined) {
      const tokenService = getTokenService();
      const tokens = tokenService.listTokens().filter(t => t.clientId === id);
      
      // Update all tokens for this client
      for (const token of tokens) {
        tokenService.updateTokenServerAccess(token.id, dto.serverAccess);
      }
    }

    return (await this.getClient(id))!;
  }

  /**
   * Delete a client and all associated tokens
   */
  private async deleteClient(id: string): Promise<void> {
    const db = getSqliteManager("mcprouter");
    
    // Delete all tokens for this client
    const tokenService = getTokenService();
    tokenService.deleteClientTokens(id);

    // Delete from clients table if it exists
    const hasClientsTable = db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='clients'"
    );

    if (hasClientsTable) {
      db.execute("DELETE FROM clients WHERE id = ?", [id]);
    }
  }

  /**
   * Get client statistics
   */
  private async getStatistics() {
    const clients = await this.listClients();
    
    return {
      totalClients: clients.length,
      activeClients: clients.filter(c => c.activeTokenCount && c.activeTokenCount > 0).length,
      totalTokens: clients.reduce((sum, c) => sum + (c.tokenCount || 0), 0),
      activeTokens: clients.reduce((sum, c) => sum + (c.activeTokenCount || 0), 0),
    };
  }

  /**
   * Ensure clients table exists
   */
  private ensureClientsTable(): void {
    const db = getSqliteManager("mcprouter");
    
    db.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create index
    db.execute(
      "CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)"
    );
  }
}

// Export singleton instance
let clientHandler: ClientHandler | null = null;

export function initializeClientHandler(): void {
  if (!clientHandler) {
    clientHandler = new ClientHandler();
  }
}

export function getClientHandler(): ClientHandler | null {
  return clientHandler;
}
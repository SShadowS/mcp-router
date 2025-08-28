import { create } from "zustand";
import {
  Client,
  ClientWithTokens,
  ClientCreateDto,
  ClientUpdateDto,
  Token,
} from "@mcp_router/shared";

interface ClientStoreState {
  clients: ClientWithTokens[];
  selectedClient: ClientWithTokens | null;
  isLoading: boolean;
  error: string | null;
}

interface ClientStoreActions {
  // Client CRUD
  fetchClients: () => Promise<void>;
  createClient: (client: ClientCreateDto) => Promise<ClientWithTokens>;
  updateClient: (id: string, updates: ClientUpdateDto) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  selectClient: (client: ClientWithTokens | null) => void;

  // Token management
  generateToken: (clientId: string, serverIds?: string[]) => Promise<Token>;
  revokeToken: (tokenId: string) => Promise<void>;
  getClientTokens: (clientId: string) => Promise<Token[]>;

  // Utility
  clearError: () => void;
  reset: () => void;
}

interface ClientStore extends ClientStoreState, ClientStoreActions {}

const initialState: ClientStoreState = {
  clients: [],
  selectedClient: null,
  isLoading: false,
  error: null,
};

export const useClientStore = create<ClientStore>((set, get) => ({
  ...initialState,

  fetchClients: async () => {
    set({ isLoading: true, error: null });
    try {
      const clients = await window.electronAPI.listClients();
      set({ clients, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to fetch clients",
        isLoading: false,
      });
    }
  },

  createClient: async (clientDto: ClientCreateDto) => {
    set({ isLoading: true, error: null });
    try {
      const newClient = await window.electronAPI.createClient(clientDto);
      set((state) => ({
        clients: [...state.clients, newClient],
        isLoading: false,
      }));
      return newClient;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to create client",
        isLoading: false,
      });
      throw error;
    }
  },

  updateClient: async (id: string, updates: ClientUpdateDto) => {
    set({ isLoading: true, error: null });
    try {
      const updatedClient = await window.electronAPI.updateClient(id, updates);
      set((state) => ({
        clients: state.clients.map((c) => (c.id === id ? updatedClient : c)),
        selectedClient:
          state.selectedClient?.id === id ? updatedClient : state.selectedClient,
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to update client",
        isLoading: false,
      });
      throw error;
    }
  },

  deleteClient: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI.deleteClient(id);
      set((state) => ({
        clients: state.clients.filter((c) => c.id !== id),
        selectedClient: state.selectedClient?.id === id ? null : state.selectedClient,
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to delete client",
        isLoading: false,
      });
      throw error;
    }
  },

  selectClient: (client) => {
    set({ selectedClient: client });
  },

  generateToken: async (clientId: string, serverIds?: string[]) => {
    try {
      const token = await window.electronAPI.generateToken({
        clientId,
        serverIds: serverIds || [],
      });
      
      // Refresh the client to update token count
      const clients = await window.electronAPI.listClients();
      set({ clients });
      
      return token;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to generate token",
      });
      throw error;
    }
  },

  revokeToken: async (tokenId: string) => {
    try {
      await window.electronAPI.revokeToken(tokenId);
      
      // Refresh clients to update token counts
      const clients = await window.electronAPI.listClients();
      set({ clients });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to revoke token",
      });
      throw error;
    }
  },

  getClientTokens: async (clientId: string) => {
    try {
      return await window.electronAPI.getClientTokens(clientId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to fetch tokens",
      });
      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set(initialState);
  },
}));

// Selectors
export const clientSelectors = {
  getClientById: (id: string) => (state: ClientStore) =>
    state.clients.find((c) => c.id === id),
  
  getActiveClients: () => (state: ClientStore) =>
    state.clients.filter((c) => c.activeTokenCount && c.activeTokenCount > 0),
  
  getTotalTokenCount: () => (state: ClientStore) =>
    state.clients.reduce((sum, c) => sum + (c.tokenCount || 0), 0),
};
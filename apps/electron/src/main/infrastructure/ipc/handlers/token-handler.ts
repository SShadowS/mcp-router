import { ipcMain } from "electron";
import { getTokenService } from "@/main/domain/mcp-core/token/token-service";
import { TokenScope, Token } from "@mcp_router/shared";

export function setupTokenHandlers(): void {
  // Generate a new token
  ipcMain.handle(
    "token:generate",
    (_, params: { clientId: string; serverIds?: string[] }): Token => {
      try {
        const tokenService = getTokenService();
        return tokenService.generateToken({
          clientId: params.clientId,
          serverIds: params.serverIds || [],
        });
      } catch (error: any) {
        console.error("Failed to generate token:", error);
        throw error;
      }
    },
  );

  // Revoke a token
  ipcMain.handle("token:revoke", (_, tokenId: string): void => {
    try {
      const tokenService = getTokenService();
      tokenService.deleteToken(tokenId);
    } catch (error: any) {
      console.error("Failed to revoke token:", error);
      throw error;
    }
  });

  // List tokens for a client
  ipcMain.handle("token:listByClient", (_, clientId: string): Token[] => {
    try {
      const tokenService = getTokenService();
      const allTokens = tokenService.listTokens();
      return allTokens.filter((token: Token) => token.clientId === clientId);
    } catch (error: any) {
      console.error("Failed to list tokens:", error);
      throw error;
    }
  });

  // Update token scopes (existing functionality)
  ipcMain.handle(
    "token:updateScopes",
    (_, tokenId: string, scopes: TokenScope[]) => {
      try {
        const tokenService = getTokenService();
        const success = tokenService.updateTokenScopes(tokenId, scopes);

        if (success) {
          // Get the updated token
          const tokens = tokenService.listTokens();
          const token = tokens.find((t: any) => t.id === tokenId);

          // Get the app name from the token client ID (assuming client ID = app name)
          const appName = token?.clientId;

          // Build a basic McpApp object to return
          if (token && appName) {
            return {
              success: true,
              message: "Token scopes updated successfully",
              app: {
                name: appName,
                installed: true,
                configured: true,
                configPath: "", // Required field but we don't have it here
                token: token.id,
                serverIds: token.serverIds,
                scopes: token.scopes,
              },
            };
          }
        }

        return {
          success: false,
          message: "Failed to update token scopes",
        };
      } catch (error: any) {
        console.error("Failed to update token scopes:", error);
        return {
          success: false,
          message: `Error updating token scopes: ${error.message}`,
        };
      }
    },
  );
}

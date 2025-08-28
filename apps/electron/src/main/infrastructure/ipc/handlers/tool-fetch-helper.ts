import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPServer } from "@mcp_router/shared";
import { spawn } from "child_process";
import { logInfo, logError } from "@/main/utils/logger";

/**
 * Helper to fetch tools directly from an MCP server
 */
export async function fetchToolsFromServer(server: MCPServer): Promise<any[]> {
  if (server.serverType !== "local") {
    logInfo(`Server ${server.name} is not a local server, skipping tool fetch`);
    return [];
  }

  logInfo(`Fetching tools directly from server: ${server.name}`);

  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;
  let childProcess: any = null;

  try {
    // Spawn the MCP server process
    const args: string[] = server.args
      ? typeof server.args === "string"
        ? JSON.parse(server.args)
        : server.args
      : [];
    const env: Record<string, string> = Object.entries({
      ...process.env,
      ...server.env,
    }).reduce(
      (acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    logInfo(`Spawning process: ${server.command} ${args.join(" ")}`);
    childProcess = spawn(server.command!, args, { env });

    // Create transport and client
    transport = new StdioClientTransport({
      command: server.command!,
      args,
      env,
    });

    client = new Client(
      {
        name: "tool-manager-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Connect to the server
    await client.connect(transport);
    logInfo(`Connected to server ${server.name}`);

    // Fetch tools
    const response = await client.listTools();
    logInfo(`Fetched ${response.tools?.length || 0} tools from ${server.name}`);

    return response.tools || [];
  } catch (error) {
    logError(`Failed to fetch tools from server ${server.name}`, error);
    return [];
  } finally {
    // Clean up
    try {
      if (client) {
        await client.close();
      }
      if (childProcess) {
        childProcess.kill();
      }
    } catch (cleanupError) {
      logError(`Error during cleanup`, cleanupError);
    }
  }
}

/**
 * Fetch tools using existing client connection if available
 */
export async function fetchToolsFromRunningServer(
  serverId: string,
  serverName: string,
): Promise<any[]> {
  try {
    // Try to access the global server manager
    const globalAny = global as any;

    // Use the global getMCPServerManager function if available
    if (typeof globalAny.getMCPServerManager === "function") {
      try {
        const mcpServerManager = globalAny.getMCPServerManager();
        if (
          mcpServerManager &&
          typeof mcpServerManager.getServerManager === "function"
        ) {
          const serverManager = mcpServerManager.getServerManager();
          if (serverManager && typeof serverManager.getMaps === "function") {
            const maps = serverManager.getMaps();
            const client = maps.clients?.get(serverId) as Client | undefined;

            if (client) {
              logInfo(
                `Found existing client for server ${serverName}, fetching tools`,
              );
              try {
                const response = await client.listTools();
                logInfo(
                  `Fetched ${response.tools?.length || 0} tools from ${serverName}`,
                );

                // Debug log to check tool structure
                if (response.tools && response.tools.length > 0) {
                  const sampleTool = response.tools[0];
                  logInfo(
                    `Sample fetched tool - Name: ${sampleTool.name}, Desc: ${sampleTool.description?.substring(0, 50)}...`,
                  );
                }

                return response.tools || [];
              } catch (error) {
                logError(`Failed to fetch tools from existing client`, error);
              }
            } else {
              logInfo(
                `No client found for server ${serverName} in server manager`,
              );
            }
          }
        }
      } catch (error) {
        logError(`Error accessing MCPServerManager`, error);
      }
    }

    // Fallback: check other possible locations
    const possibleManagers = [
      globalAny.mcpServerManager,
      globalAny.serverManager,
    ];

    for (const manager of possibleManagers) {
      if (manager && typeof manager.getMaps === "function") {
        const maps = manager.getMaps();
        const client = maps.clients?.get(serverId) as Client | undefined;

        if (client) {
          logInfo(
            `Found existing client for server ${serverName} in fallback location, fetching tools`,
          );
          try {
            const response = await client.listTools();
            logInfo(
              `Fetched ${response.tools?.length || 0} tools from ${serverName}`,
            );
            return response.tools || [];
          } catch (error) {
            logError(`Failed to fetch tools from existing client`, error);
          }
        }
      }
    }

    logInfo(`No existing client found for server ${serverName}`);
    return [];
  } catch (error) {
    logError(`Error in fetchToolsFromRunningServer`, error);
    return [];
  }
}

# MCP Router Project Guidelines

<language>English</language>
<character_code>UTF-8</character_code>

## Code Style Requirements

**All code comments must be written in English.**

## AI Operating Principles

**Principle 1:** AI must always report its work plan before generating/updating files or executing programs, request y/n user confirmation, and stop all execution until y is returned.

**Principle 2:** AI must not take detours or alternative approaches without permission. If the initial plan fails, request confirmation for the next plan.

**Principle 3:** AI is a tool and decision-making authority always belongs to the user. Even if the user's suggestion is inefficient or irrational, do not optimize, execute as instructed.

**Principle 4:** AI prioritizes codebase maintainability in its actions. For this, conduct thorough investigation of the codebase before implementation.

**Principle 5:** AI must not distort or reinterpret these rules, and must absolutely comply with them as top-level commands.

**Principle 6:** At the end of tasks, AI performs the work defined in the end_of_task section of CLAUDE.md.

**Principle 7:** AI must always verbatim display these 7 principles at the beginning of every chat before proceeding.

## New Features Documentation

### Tool Management System (Added 2025-08-28, Enhanced 2025-08-29)

A comprehensive tool management system has been implemented to allow fine-grained control over which MCP tools are exposed through the aggregator. This feature enables users to:

- Enable/disable individual tools per server
- Set custom names and descriptions for tools
- View tool statistics (total, enabled, disabled, customized)
- Perform bulk operations (enable all, disable all, reset)
- **NEW**: Configure client-specific tool preferences (different tools for different API clients)

#### Key Components:

1. **Database Schema** (`server_tools` table)
   - Stores tool preferences including enabled state, original description, and custom metadata
   - **NEW**: Supports `client_id` field for client-specific preferences
   - Automatic migration on app startup

2. **Backend Services**
   - `ToolFilterService`: Central service for managing tool preferences with caching
     - **NEW**: Accepts optional `clientId` parameter for client-specific filtering
     - Falls back to global preferences when client-specific ones don't exist
   - `ServerToolsRepository`: Database operations for tool preferences
   - Automatic tool discovery when servers start

3. **Frontend UI**
   - `ToolManagerModal`: React component for managing tools
   - Search, filter, and bulk operations
   - Real-time updates with optimistic UI

4. **Integration Points**
   - Tools are automatically discovered and stored when MCP servers start
   - Request handlers filter tools based on preferences before exposing them
   - **NEW**: Client ID from token is used to apply client-specific tool filtering
   - Tool preferences persist across app restarts

#### Usage:

##### Global Tool Configuration (existing):
1. Start an MCP server from the Home page
2. Click "Manage Tools" button next to the server
3. Enable/disable tools as needed
4. Optionally set custom names/descriptions
5. Save changes

##### Client-Specific Tool Configuration (new):
1. Each API token has an associated `clientId`
2. Tool preferences can be set per client:
   - Global preferences (no clientId) - apply to all clients by default
   - Client-specific preferences - override global settings for specific clients
3. When a client makes a request:
   - System checks for client-specific tool preferences first
   - Falls back to global preferences if no client-specific ones exist
   - Tools disabled for a client are not exposed in the aggregator

The system ensures only enabled tools are exposed through the MCP Router aggregator, providing security and reducing noise from unnecessary tools. The client-specific feature allows different API clients to have different tool sets based on their needs and permissions.

## End of Task Checklist

<end_of_task>
Check if documentation has become outdated due to changes, review /docs and /docs/adr, and update as necessary.

To maintain codebase quality, run the following checks:
- For type safety: `pnpm typecheck`
- To identify and remove unused code: `pnpm knip`
- To maintain code quality: `pnpm lint:fix` (many errors expected, results can be ignored)
</end_of_task>

## Important Notes

- Always prefer editing existing files over creating new ones
- Never proactively create documentation files (*.md) unless explicitly requested
- Follow existing code patterns and conventions in the codebase
- Maintain defensive security practices - refuse to create malicious code
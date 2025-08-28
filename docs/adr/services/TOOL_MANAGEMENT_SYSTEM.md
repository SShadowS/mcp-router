# Tool Management System

## Status
Accepted

## Context
MCP Router aggregates tools from multiple MCP servers, exposing all tools from all connected servers to clients. However, users need fine-grained control over which tools are exposed, as:
- Some tools may be redundant across servers
- Security concerns may require limiting tool exposure
- Performance can be improved by reducing unnecessary tool listings
- Users want to customize tool names and descriptions

## Decision
Implement a tool filtering and management system that allows users to:
1. Enable/disable individual tools per server
2. Customize tool names and descriptions
3. Bulk manage tool preferences
4. Persist preferences across sessions

## Architecture

### Database Schema
```sql
CREATE TABLE server_tools (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  original_description TEXT,
  custom_name TEXT,
  custom_description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  UNIQUE(server_id, tool_name)
);
```

### Service Layer
- **ToolFilterService**: Manages tool preferences and filtering logic
  - Caches preferences in memory for performance
  - Handles initialization of new tools
  - Cleans up removed tools
  - Provides statistics and bulk operations

### Request Handling
- **RequestHandlers**: Enhanced to filter tools based on preferences
  - Checks tool enabled state before listing
  - Validates tool access before execution
  - Applies custom names/descriptions

### UI Components
- **ToolManagerModal**: React component for managing tools
  - Search and filter capabilities
  - Bulk enable/disable operations
  - Visual indicators for tool states
  - Optimistic UI updates

### IPC Communication
- **tool-handler**: Electron IPC handlers for tool management
  - `tool:getServerTools`: Get tool preferences
  - `tool:updatePreference`: Update single tool
  - `tool:bulkUpdate`: Bulk update tools
  - `tool:enableAll`/`tool:disableAll`: Bulk operations
  - `tool:resetPreferences`: Reset to defaults

## Implementation Details

### Tool Discovery
When a server connects, the system:
1. Fetches available tools from the server
2. Initializes preferences for new tools (default: enabled)
3. Cleans up preferences for removed tools
4. Caches preferences for performance

### Tool Filtering
During tool listing (`handleListTools`):
1. Check each tool's enabled state
2. Apply custom names/descriptions if set
3. Filter out disabled tools from response
4. Maintain tool-to-server mapping

### Tool Execution
Before executing a tool (`handleCallTool`):
1. Verify the tool is enabled
2. Return error if tool is disabled
3. Process normally if enabled

### Performance Considerations
- In-memory caching of preferences
- Lazy loading for large tool lists
- Debounced bulk operations
- Virtual scrolling in UI

## Consequences

### Positive
- Fine-grained control over tool exposure
- Improved security through tool limiting
- Better performance with fewer tools
- Enhanced user experience with customization
- Backward compatible (all tools enabled by default)

### Negative
- Additional database overhead
- Increased complexity in request handling
- UI complexity for managing many tools
- Potential confusion if tools are unexpectedly disabled

## Migration Strategy
1. Database migration adds `server_tools` table
2. Existing installations default to all tools enabled
3. No breaking changes to API or existing functionality
4. Gradual adoption through UI interaction

## Security Considerations
- Tool preferences are workspace-specific
- Token system can further restrict tool access
- Disabled tools cannot be executed even if directly called
- Audit trail through database timestamps

## Future Enhancements
- Tool categories and grouping
- Tool usage analytics
- Preset configurations
- Tool dependency management
- Export/import tool configurations
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools } from "./tools/reads.js";

/**
 * Build an MCP server instance bound to a single teammate's Swapcard API key.
 * One instance is created per connection session; tools close over `apiKey`.
 */
export function buildServer(apiKey: string): McpServer {
  const server = new McpServer(
    { name: "swapcard-mcp", version: "0.1.0" },
    {
      instructions:
        "Tools for the Swapcard organizer API. Start with list_communities, then (Phase 1+) " +
        "search_events to obtain an eventId used by the other tools.",
    },
  );

  registerReadTools(server, apiKey);

  return server;
}

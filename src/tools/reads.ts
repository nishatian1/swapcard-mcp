import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { swapcardGraphQL } from "../swapcard/client.js";
import { jsonResult, errorResult } from "./helpers.js";

/**
 * Read-only tools. Phase 0 ships `list_communities`; Phase 1 adds the remaining
 * search/list tools (events, people, exhibitors, sessions, meetings, sponsors).
 */
export function registerReadTools(server: McpServer, apiKey: string): void {
  server.registerTool(
    "list_communities",
    {
      title: "List Swapcard communities",
      description:
        "List the Swapcard communities this API key can access (id + name). " +
        "Use a returned community id as the communityId argument for other tools.",
      inputSchema: {
        first: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max communities to return (page size, default server-side)."),
        after: z
          .string()
          .optional()
          .describe("Pagination cursor: pass pageInfo.endCursor from a previous call."),
      },
    },
    async ({ first, after }) => {
      try {
        const query = `query ListCommunities($cursor: CursorPaginationInput) {
  communities(cursor: $cursor) {
    nodes { id name }
    pageInfo { hasNextPage endCursor }
  }
}`;
        const cursor =
          first !== undefined || after !== undefined ? { first, after } : undefined;
        const { data } = await swapcardGraphQL<{ communities: unknown }>(apiKey, query, {
          cursor,
        });
        return jsonResult(data.communities);
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}

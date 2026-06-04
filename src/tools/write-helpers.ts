import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { swapcardGraphQL } from "../swapcard/client.js";
import { jsonResult, errorResult } from "./helpers.js";
import { jsonObject } from "../swapcard/pagination.js";

/** Standard PayloadError selection (most create/update/delete payloads). */
export const PE = `errors { code message path input subCode inputId }`;
/** Validation-error selection (import/upsert results). */
export const VE = `errors { inputId message path errorCode }`;

/** Throw a clear error if a required argument is missing for the chosen action. */
export function req<T>(v: T | undefined | null, name: string): T {
  if (v === undefined || v === null) {
    throw new Error(`Missing required argument "${name}" for this action.`);
  }
  return v;
}

export interface ActionDef {
  /** If set, the action is destructive: a human-readable phrase like "deletes event people". Requires confirm:true. */
  destructive?: string;
  build: (a: Record<string, unknown>) => { query: string; variables: Record<string, unknown> };
}

/** Register a consolidated manage_* tool that dispatches on an `action` argument. */
export function manageTool(
  server: McpServer,
  apiKey: string,
  def: {
    name: string;
    title: string;
    description: string;
    schema: z.ZodRawShape;
    actions: Record<string, ActionDef>;
  },
): void {
  server.registerTool(
    def.name,
    { title: def.title, description: def.description, inputSchema: def.schema },
    async (args: Record<string, unknown>) => {
      try {
        const action = def.actions[args.action as string];
        if (!action) {
          return errorResult(
            new Error(`Unknown action "${String(args.action)}". Valid: ${Object.keys(def.actions).join(", ")}.`),
          );
        }
        if (action.destructive && args.confirm !== true) {
          return errorResult(
            new Error(`Refused: this action ${action.destructive}. Re-run with confirm:true to proceed.`),
          );
        }
        const { query, variables } = action.build(args);
        const { data } = await swapcardGraphQL(apiKey, query, variables);
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}

/** Reusable Zod fields shared across write tools. */
export const wf = {
  input: jsonObject
    .optional()
    .describe("The GraphQL input object for this action (see the action list for its type; use introspect_schema to view fields)."),
  data: z
    .array(jsonObject)
    .optional()
    .describe("Array payload for import/upsert actions (see the action list for the item input type)."),
  eventId: z.string().optional().describe("Event id (required by some actions)."),
  communityId: z.string().optional().describe("Community id (required by some actions)."),
  id: z.string().optional().describe("A single entity id (e.g. a document id for update actions)."),
  ids: z.array(z.string()).optional().describe("Entity ids (for delete actions)."),
  validateOnly: z
    .boolean()
    .optional()
    .describe("If true, validate the payload without persisting (import/upsert actions only)."),
  confirm: z.boolean().optional().describe("Must be true to run a destructive delete action."),
};

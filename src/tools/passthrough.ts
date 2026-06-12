import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { swapcardGraphQL } from "../swapcard/client.js";
import { jsonResult, errorResult } from "./helpers.js";

/** Render a GraphQL TypeRef introspection object into a readable type string, e.g. "[EventPersonFilter!]!". */
function sig(t: unknown): string {
  const ref = t as { kind?: string; name?: string; ofType?: unknown } | null;
  if (!ref) return "?";
  if (ref.kind === "NON_NULL") return sig(ref.ofType) + "!";
  if (ref.kind === "LIST") return "[" + sig(ref.ofType) + "]";
  return ref.name ?? "?";
}

const TYPE_REF = `kind name ofType{ kind name ofType{ kind name ofType{ kind name ofType{ kind name ofType{ kind name } } } } }`;

/** Read passthrough (graphql_query) + schema discovery (introspect_schema). */
export function registerPassthroughTools(server: McpServer, apiKey: string): void {
  // --- graphql_query ------------------------------------------------------
  server.registerTool(
    "graphql_query",
    {
      title: "Run a raw GraphQL query",
      annotations: { readOnlyHint: true },
      description:
        "Execute an arbitrary read-only GraphQL query against the Swapcard Content API " +
        "(https://developer.swapcard.com/event-admin/graphql). Use this for anything the featured " +
        "tools don't cover. Mutations are rejected here — use graphql_mutation instead. " +
        "Use introspect_schema to discover fields and types.",
      inputSchema: {
        query: z.string().describe("A GraphQL query document (read-only)."),
        variables: z.record(z.unknown()).optional().describe("Variables object for the query."),
      },
    },
    async ({ query, variables }) => {
      try {
        if (/^\s*(#[^\n]*\n\s*)*mutation\b/i.test(query)) {
          return errorResult(new Error("This is a mutation. Use the graphql_mutation tool for writes."));
        }
        const { data } = await swapcardGraphQL(apiKey, query, variables);
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // --- graphql_mutation ---------------------------------------------------
  server.registerTool(
    "graphql_mutation",
    {
      title: "Run a raw GraphQL mutation",
      description:
        "Execute an arbitrary GraphQL mutation against the Swapcard Content API. The full-write escape " +
        "hatch for operations the manage_* tools don't cover (products, promo codes, ticket types, " +
        "custom fields, groups, etc.). REQUIRES confirm:true. Use introspect_schema('Mutation') to " +
        "discover operations and their input types.",
      inputSchema: {
        query: z.string().describe("A GraphQL mutation document."),
        variables: z.record(z.unknown()).optional().describe("Variables object for the mutation."),
        confirm: z.boolean().optional().describe("Must be true to execute the mutation."),
      },
    },
    async ({ query, variables, confirm }) => {
      try {
        if (!/^\s*(#[^\n]*\n\s*)*mutation\b/i.test(query)) {
          return errorResult(new Error("Not a mutation. Use graphql_query for read-only operations."));
        }
        if (confirm !== true) {
          return errorResult(new Error("Refused: graphql_mutation requires confirm:true to execute."));
        }
        const { data } = await swapcardGraphQL(apiKey, query, variables);
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // --- introspect_schema --------------------------------------------------
  server.registerTool(
    "introspect_schema",
    {
      title: "Introspect the Swapcard schema",
      annotations: { readOnlyHint: true },
      description:
        "Discover the Swapcard GraphQL schema. With no argument, lists all root query + mutation names. " +
        "With a typeName (e.g. 'EventPersonFilter', 'Mutation', 'Event'), returns that type's fields, " +
        "argument types, input fields, and enum values. Use this to learn filter shapes and unfeatured operations.",
      inputSchema: {
        typeName: z
          .string()
          .optional()
          .describe("A GraphQL type name to inspect (e.g. 'Mutation', 'EventPersonFilter'). Omit to list roots."),
      },
    },
    async ({ typeName }) => {
      try {
        if (!typeName) {
          const query = `{ __schema { queryType { fields { name } } mutationType { fields { name } } } }`;
          const data = (await swapcardGraphQL<{
            __schema: {
              queryType: { fields: { name: string }[] };
              mutationType: { fields: { name: string }[] };
            };
          }>(apiKey, query)).data;
          return jsonResult({
            queries: data.__schema.queryType.fields.map((f) => f.name),
            mutations: data.__schema.mutationType.fields.map((f) => f.name),
          });
        }

        const query = `query Introspect($name:String!) {
  __type(name:$name) {
    name kind description
    fields { name args { name type { ${TYPE_REF} } } type { ${TYPE_REF} } }
    inputFields { name type { ${TYPE_REF} } defaultValue }
    enumValues { name }
    possibleTypes { name }
  }
}`;
        const t = (
          await swapcardGraphQL<{ __type: GqlType | null }>(apiKey, query, { name: typeName })
        ).data.__type;
        if (!t) return errorResult(new Error(`Type "${typeName}" not found.`));

        const lines: string[] = [`${t.kind} ${t.name}${t.description ? ` — ${t.description}` : ""}`];
        for (const f of t.fields ?? []) {
          const args = (f.args ?? []).map((a) => `${a.name}: ${sig(a.type)}`).join(", ");
          lines.push(`  ${f.name}(${args}): ${sig(f.type)}`);
        }
        for (const inf of t.inputFields ?? []) {
          const dv = inf.defaultValue ? ` = ${inf.defaultValue}` : "";
          lines.push(`  IN ${inf.name}: ${sig(inf.type)}${dv}`);
        }
        if (t.enumValues?.length) lines.push(`  ENUM: ${t.enumValues.map((e) => e.name).join(", ")}`);
        if (t.possibleTypes?.length) lines.push(`  UNION OF: ${t.possibleTypes.map((p) => p.name).join(", ")}`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}

interface GqlType {
  name: string;
  kind: string;
  description?: string | null;
  fields?: { name: string; args?: { name: string; type: unknown }[]; type: unknown }[] | null;
  inputFields?: { name: string; type: unknown; defaultValue?: string | null }[] | null;
  enumValues?: { name: string }[] | null;
  possibleTypes?: { name: string }[] | null;
}

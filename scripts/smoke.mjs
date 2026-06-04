// End-to-end smoke test: connect with the real MCP client and exercise every read tool.
//   SWAPCARD_API_KEY=<key> node scripts/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://localhost:8090/mcp";
const key = process.env.SWAPCARD_API_KEY;
if (!key) {
  console.error("Set SWAPCARD_API_KEY env to run the smoke test.");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${key}` } },
});
const client = new Client({ name: "swapcard-smoke", version: "1.0.0" });
await client.connect(transport);
console.log("✓ Connected:", url);

const { tools } = await client.listTools();
console.log(`✓ ${tools.length} tools:`, tools.map((t) => t.name).join(", "), "\n");

let failures = 0;

function summarize(text) {
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) return `${j.length} items`;
    if (j.nodes) return `${j.nodes.length} nodes (totalCount ${j.totalCount ?? "?"})`;
    if (j.queries) return `${j.queries.length} queries, ${j.mutations.length} mutations`;
    return Object.keys(j).join(", ");
  } catch {
    return text.split("\n")[0].slice(0, 80);
  }
}

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    if (res.isError) {
      failures++;
      console.log(`✗ ${name} ${JSON.stringify(args)}`);
      console.log("   " + text.replace(/\n/g, "\n   ").slice(0, 400));
      return null;
    }
    console.log(`✓ ${name} ${JSON.stringify(args)} → ${summarize(text)}`);
    return text;
  } catch (e) {
    failures++;
    console.log(`✗ ${name} threw: ${e.message}`);
    return null;
  }
}

// Discovery
const communitiesText = await call("list_communities");
const communities = communitiesText ? JSON.parse(communitiesText).nodes : [];
const community = communities.find((c) => c.name === "Bench") ?? communities[0];

const eventsText = await call("search_events", { pageSize: 5 });
const events = eventsText ? JSON.parse(eventsText) : [];
const event = events[0];

// Event-scoped
if (event) {
  await call("search_people", { eventId: event.id, first: 3 });
  await call("search_meetings", { eventId: event.id, first: 3 });
  await call("list_sponsors", { eventId: event.id });
} else {
  console.log("… no events accessible; skipping people/meetings/sponsors");
}

// Community-scoped
if (community) {
  await call("search_exhibitors", { communityId: community.id, first: 3 });
  await call("search_sessions", { communityId: community.id, first: 3 });
} else {
  console.log("… no community; skipping exhibitors/sessions");
}

// Passthrough
await call("introspect_schema");
await call("introspect_schema", { typeName: "EventPersonFilter" });
await call("graphql_query", { query: "{ communities { nodes { id name } } }" });

// graphql_query must REJECT mutations (isError is the expected, correct outcome here)
{
  const res = await client.callTool({ name: "graphql_query", arguments: { query: "mutation { x }" } });
  if (res.isError) console.log("✓ graphql_query correctly rejected a mutation");
  else {
    failures++;
    console.log("✗ graphql_query did NOT reject a mutation");
  }
}

await client.close();
console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all read tools OK");
process.exit(failures ? 1 : 0);

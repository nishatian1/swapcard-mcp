// Measure real per-tool-call latency through the full MCP stack.
//   BASE/MCP_URL + SWAPCARD_API_KEY=<key> node scripts/timing.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "https://mcp.fhsagents.site/swapcard";
const key = process.env.SWAPCARD_API_KEY;
if (!key) { console.error("Set SWAPCARD_API_KEY"); process.exit(1); }

const ms = (a, b) => `${(b - a).toFixed(0)}ms`;
const now = () => Date.now();

const t0 = now();
const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${key}` } },
});
const client = new Client({ name: "timing", version: "1.0.0" });
await client.connect(transport);
console.log(`handshake (initialize): ${ms(t0, now())}`);

async function timeCall(label, name, args) {
  const a = now();
  const r = await client.callTool({ name, arguments: args });
  console.log(`${label}: ${ms(a, now())}${r.isError ? " (ERROR)" : ""}`);
}

// repeat list_communities 5x to see warm vs cold (connection reuse)
for (let i = 1; i <= 5; i++) await timeCall(`list_communities #${i}`, "list_communities", {});
await timeCall("search_exhibitors first:20", "search_exhibitors", { communityId: "Q29tbXVuaXR5Xzc4MzM=", first: 20 });
await timeCall("search_sessions first:20", "search_sessions", { communityId: "Q29tbXVuaXR5Xzc4MzM=", first: 20 });
await timeCall("introspect_schema (no arg)", "introspect_schema", {});

await client.close();

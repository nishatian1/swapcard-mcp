// Smoke test: connect to the running MCP server with the real SDK client,
// list tools, and call list_communities. Run the server first, then:
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
console.log("✓ Tools:", tools.map((t) => t.name).join(", "));

console.log("\nCalling list_communities …");
const res = await client.callTool({ name: "list_communities", arguments: {} });
for (const c of res.content) if (c.type === "text") console.log(c.text);
if (res.isError) console.error("⚠ tool returned isError");

await client.close();
process.exit(res.isError ? 1 : 0);

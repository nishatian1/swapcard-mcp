// Analytics smoke: call get_analytics for a past event with real activity.
//   SWAPCARD_API_KEY=<key> node scripts/smoke-analytics.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://localhost:8090/mcp";
const key = process.env.SWAPCARD_API_KEY;
if (!key) { console.error("Set SWAPCARD_API_KEY"); process.exit(1); }

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${key}` } },
});
const client = new Client({ name: "swapcard-analytics-smoke", version: "1.0.0" });
await client.connect(transport);

// FHS World 2024, a 6-hour window during the live event
const res = await client.callTool({
  name: "get_analytics",
  arguments: {
    eventIds: ["RXZlbnRfMTc1MTM1Mw=="],
    timeGt: "2024-11-19T04:00:00.000Z",
    timeLt: "2024-11-19T10:00:00.000Z",
    limit: 80,
    maxSeconds: 20,
  },
});
const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
if (res.isError) { console.error("✗ get_analytics error:\n" + text); process.exit(1); }

const o = JSON.parse(text);
console.log(`✓ get_analytics: count=${o.count} truncated=${o.truncated} reason=${o.reason}`);
console.log(`  timeRange: ${o.timeRange.from} .. ${o.timeRange.to}`);
console.log(`  uniqueUsers: ${o.summary.uniqueUsers}`);
console.log(`  byEvent:`, JSON.stringify(o.summary.byEvent));
console.log(`  lastCursor: ${o.lastCursor ? o.lastCursor.slice(0, 24) + "…" : null}`);

await client.close();
process.exit(o.count > 0 ? 0 : 2);

// Write-tool smoke test — SAFE: only touches "Your Demo Community"; uses validateOnly
// and a create→delete roundtrip; verifies delete-gating refuses without confirm.
//   SWAPCARD_API_KEY=<key> node scripts/smoke-writes.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://localhost:8090/mcp";
const key = process.env.SWAPCARD_API_KEY;
if (!key) {
  console.error("Set SWAPCARD_API_KEY env to run the smoke test.");
  process.exit(1);
}

const DEMO_COMMUNITY = "Q29tbXVuaXR5XzM4NjM2"; // Your Demo Community
const DEMO_EVENT = "RXZlbnRfMTQ5NDA1NQ=="; // Second Demo Events (lite)

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${key}` } },
});
const client = new Client({ name: "swapcard-write-smoke", version: "1.0.0" });
await client.connect(transport);

let failures = 0;
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => {
  failures++;
  console.log(`✗ ${m}`);
};

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return { isError: !!res.isError, text };
}

// --- tool inventory ---
const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.log(`Tools (${names.length}): ${names.join(", ")}\n`);
for (const t of [
  "manage_people", "manage_exhibitors", "manage_exhibitor_links", "manage_sessions",
  "manage_meetings", "manage_locations", "manage_documents", "manage_roles",
  "manage_webhooks", "send_push_notification", "graphql_mutation",
]) {
  names.includes(t) ? ok(`registered: ${t}`) : bad(`MISSING tool: ${t}`);
}

// --- delete gating (no data touched) ---
console.log("\n# gating");
let r = await call("manage_people", { action: "delete", eventId: DEMO_EVENT, ids: ["x"] });
r.isError && /confirm:true/.test(r.text) ? ok("manage_people delete refused without confirm") : bad(`delete gate: ${r.text}`);

r = await call("graphql_mutation", { query: "mutation { __typename }" });
r.isError && /confirm:true/.test(r.text) ? ok("graphql_mutation refused without confirm") : bad(`mutation gate: ${r.text}`);

r = await call("manage_meetings", { action: "create" });
r.isError && /Missing required argument "input"/.test(r.text) ? ok("manage_meetings create requires input") : bad(`missing-arg: ${r.text}`);

try {
  const rr = await call("manage_people", { action: "nope" });
  rr.isError ? ok("invalid action rejected (schema enum)") : bad(`invalid action NOT rejected: ${rr.text}`);
} catch {
  ok("invalid action rejected (schema enum)");
}

// --- validateOnly import (no persistence) ---
console.log("\n# validateOnly import");
r = await call("manage_people", {
  action: "import",
  eventId: DEMO_EVENT,
  validateOnly: true,
  data: [{ inputId: "t1", create: { isUser: false, firstName: "MCP", lastName: "Test", email: "mcp-test@example.invalid" } }],
});
if (r.isError) bad(`import validateOnly errored: ${r.text}`);
else ok(`import validateOnly returned: ${r.text.replace(/\s+/g, " ").slice(0, 160)}`);

// --- create -> delete roundtrip (fully reversible webhook on Demo event) ---
console.log("\n# webhook create/delete roundtrip");
r = await call("manage_webhooks", {
  action: "create",
  input: {
    eventId: DEMO_EVENT,
    endpoint: "https://example.com/swapcard-mcp-smoke",
    hooks: ["PROFILE_UPDATE"],
    name: "mcp-smoke-test",
    enabled: false,
  },
});
let webhookId = null;
try {
  webhookId = JSON.parse(r.text).createWebhook?.webhook?.id ?? null;
} catch { /* ignore */ }
if (r.isError || !webhookId) {
  bad(`webhook create failed: ${r.text.slice(0, 200)}`);
} else {
  ok(`webhook created: ${webhookId}`);
  // gate check: delete without confirm must refuse
  const g = await call("manage_webhooks", { action: "delete", input: { webhookId } });
  g.isError && /confirm:true/.test(g.text) ? ok("webhook delete refused without confirm") : bad(`webhook delete gate: ${g.text}`);
  // real delete with confirm
  const d = await call("manage_webhooks", { action: "delete", confirm: true, input: { webhookId } });
  const errs = (() => { try { return JSON.parse(d.text).deleteWebhook?.errors ?? []; } catch { return [{ message: d.text }]; } })();
  !d.isError && errs.length === 0 ? ok(`webhook deleted (cleanup ok): ${webhookId}`) : bad(`webhook delete failed: ${d.text.slice(0, 200)}`);
}

await client.close();
console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all write-tool checks passed");
process.exit(failures ? 1 : 0);

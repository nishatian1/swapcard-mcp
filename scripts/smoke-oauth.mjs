// Simulate the full claude.ai web OAuth flow end-to-end:
// discovery -> DCR -> authorize (paste-key page) -> submit -> token -> MCP call -> refresh.
//   SWAPCARD_API_KEY=<key> node scripts/smoke-oauth.mjs
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.BASE ?? "http://localhost:8090";
const MCP = process.env.MCP_URL ?? BASE + "/mcp";
const KEY = process.env.SWAPCARD_API_KEY;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const RESOURCE = process.env.RESOURCE ?? MCP;
if (!KEY) { console.error("Set SWAPCARD_API_KEY"); process.exit(1); }

let fails = 0;
const ok = (m) => console.log("✓", m);
const bad = (m) => { fails++; console.log("✗", m); };
const form = (o) => new URLSearchParams(o).toString();
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

// 1) discovery (AS metadata is at root; protected-resource metadata may be path-suffixed)
const asm = await (await fetch(BASE + "/.well-known/oauth-authorization-server")).json();
asm.authorization_endpoint && asm.token_endpoint && asm.registration_endpoint
  ? ok("AS metadata discovered") : bad("discovery missing endpoints");

// 2) Dynamic Client Registration
const reg = await (await fetch(asm.registration_endpoint, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ client_name: "oauth-smoke", redirect_uris: [REDIRECT],
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    token_endpoint_auth_method: "none" }),
})).json();
const clientId = reg.client_id;
clientId ? ok(`DCR -> ${clientId.slice(0, 18)}…`) : bad(`DCR failed: ${JSON.stringify(reg)}`);

// 3) PKCE + authorize (GET) -> paste-key HTML
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const authUrl = new URL(asm.authorization_endpoint);
for (const [k, v] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT,
  code_challenge: challenge, code_challenge_method: "S256", state: "xyz123", resource: RESOURCE }))
  authUrl.searchParams.set(k, v);
const aResp = await fetch(authUrl, { redirect: "manual" });
const aHtml = await aResp.text();
aResp.status === 200 && /Swapcard API key/.test(aHtml) ? ok("authorize -> paste-key page")
  : bad(`authorize page status ${aResp.status}: ${aHtml.slice(0, 120)}`);

// 4) submit INVALID key -> 400 re-render
const badResp = await fetch(BASE + "/oauth/key", { method: "POST", headers: FORM, redirect: "manual",
  body: form({ client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, state: "xyz123", scope: "", resource: RESOURCE, apiKey: "not-a-real-key" }) });
badResp.status === 400 && /rejected/i.test(await badResp.text())
  ? ok("invalid key -> error re-render") : bad(`invalid-key status ${badResp.status}`);

// 5) submit VALID key -> 302 with code+state
const subResp = await fetch(BASE + "/oauth/key", { method: "POST", headers: FORM, redirect: "manual",
  body: form({ client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, state: "xyz123", scope: "", resource: RESOURCE, apiKey: KEY }) });
const loc = subResp.headers.get("location");
let code = null;
if (subResp.status === 302 && loc) {
  const u = new URL(loc);
  code = u.searchParams.get("code");
  code && u.searchParams.get("state") === "xyz123" ? ok("valid key -> 302 with code+state") : bad(`redirect: ${loc}`);
} else bad(`submit status ${subResp.status}`);

// 6) token exchange (with PKCE verifier)
const tok = await (await fetch(asm.token_endpoint, { method: "POST", headers: FORM,
  body: form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }) })).json();
tok.access_token ? ok(`token exchange -> access_token (refresh: ${tok.refresh_token ? "yes" : "no"})`)
  : bad(`token exchange: ${JSON.stringify(tok)}`);

// 7) PKCE negative: bad verifier must fail (use a fresh code first)
const subResp2 = await fetch(BASE + "/oauth/key", { method: "POST", headers: FORM, redirect: "manual",
  body: form({ client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, state: "s", scope: "", resource: RESOURCE, apiKey: KEY }) });
const code2 = new URL(subResp2.headers.get("location")).searchParams.get("code");
const badTok = await (await fetch(asm.token_endpoint, { method: "POST", headers: FORM,
  body: form({ grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, client_id: clientId, code_verifier: "wrong-verifier" }) })).json();
badTok.access_token ? bad("PKCE NOT enforced (wrong verifier accepted!)") : ok("PKCE enforced (wrong verifier rejected)");

// 8) authenticated MCP call with the OAuth access token
const transport = new StreamableHTTPClientTransport(new URL(MCP), { requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } } });
const client = new Client({ name: "oauth-smoke", version: "1.0.0" });
await client.connect(transport);
const tools = await client.listTools();
const res = await client.callTool({ name: "list_communities", arguments: {} });
const txt = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
tools.tools.length === 21 && /nodes/.test(txt)
  ? ok(`MCP via OAuth token: ${tools.tools.length} tools, list_communities works`) : bad(`MCP via OAuth: ${txt.slice(0, 100)}`);
await client.close();

// 9) refresh token
if (tok.refresh_token) {
  const r = await (await fetch(asm.token_endpoint, { method: "POST", headers: FORM,
    body: form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: clientId }) })).json();
  r.access_token ? ok("refresh_token -> new access_token") : bad(`refresh: ${JSON.stringify(r)}`);
}

console.log(fails ? `\n✗ ${fails} failure(s)` : "\n✓ full OAuth flow passed");
process.exit(fails ? 1 : 0);

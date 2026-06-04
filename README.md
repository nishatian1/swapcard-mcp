# Swapcard MCP

An MCP server that exposes the **Swapcard organizer API** (Content + Analytics) as tools so a team can
operate Swapcard from inside Claude (Desktop, Code, and — once Phase 4 lands — claude.ai web).

**🟢 Live:** `https://mcp.fhsagents.site/swapcard` (deployed on KVM8, Docker + Caddy).

- **Auth model:** the Swapcard API key *is* the credential. The server is stateless and stores no key;
  each connection supplies the key (via the `Authorization` header), which the server forwards to Swapcard.
- **Transport:** MCP Streamable HTTP (`@modelcontextprotocol/sdk`).
- Full design + decisions: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). Tool scope: [`tools-shortlist.md`](./tools-shortlist.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold, GraphQL client, per-request key auth, `list_communities` | ✅ done |
| 1 | All 7 read tools + `graphql_query` + `introspect_schema` | ✅ done |
| 2 | 9 `manage_*` write tools + `send_push_notification` + `graphql_mutation` | ✅ done |
| 3 | `get_analytics` (bounded streaming export) | ✅ done — **all 21 tools complete** |
| 5a | Dockerize + Caddy deploy on `mcp.fhsagents.site/swapcard` | ✅ **live** (Desktop/Code) |
| 4 | Web "paste your key" OAuth wrapper (claude.ai browser) | ⏳ next |

## Develop

```bash
npm install
cp .env.example .env        # optional: set SWAPCARD_API_KEY as a dev fallback
npm run dev                 # tsx watch, serves MCP at http://localhost:8090/mcp
# or
npm run build && npm start
```

### Smoke test
With the server running:
```bash
SWAPCARD_API_KEY=<your-swapcard-key> node scripts/smoke.mjs
```
Connects with the real MCP SDK client, lists tools, and calls `list_communities`.

## Connect from Claude (Desktop / Code)

Until the web wrapper (Phase 4) ships, connect via the `mcp-remote` bridge with your key as a header:

```jsonc
{
  "mcpServers": {
    "swapcard": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.fhsagents.site/swapcard",
               "--header", "Authorization: Bearer <your-swapcard-key>"]
    }
  }
}
```

## Environment

| Var | Required | Purpose |
|---|---|---|
| `PORT` | no (8090) | HTTP listen port |
| `MCP_PATH` | no (`/mcp`) | Path the MCP endpoint is served at |
| `PUBLIC_BASE_URL` | Phase 4 | Public URL, used to build OAuth metadata |
| `TOKEN_ENCRYPTION_SECRET` | Phase 4 | Signs/encrypts web session tokens |
| `SWAPCARD_API_KEY` | no | Dev-only fallback key when a request carries none |

## Layout

```
src/
  index.ts            HTTP bootstrap, Streamable HTTP transport, sessions
  server.ts           builds an McpServer bound to one request's key
  auth.ts             extracts the Swapcard key from the Authorization header
  config.ts           env
  swapcard/           GraphQL client + endpoints
  tools/              tool registrations (reads, manage_*, analytics, passthrough)
scripts/smoke.mjs     MCP client smoke test
```

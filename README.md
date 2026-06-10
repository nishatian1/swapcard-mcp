# Swapcard MCP

An [MCP](https://modelcontextprotocol.io) server that exposes the **[Swapcard](https://www.swapcard.com) organizer API** (Content + Analytics) as tools, so event teams can operate Swapcard from inside Claude (claude.ai web, Claude Desktop, Claude Code) or any other MCP client.

**🟢 Reference deployment:** `https://mcp.bhatti.cloud/swapcard`

## What it does

21 tools over the Swapcard Event Admin GraphQL API:

| Group | Tools |
|---|---|
| **Reads** (7) | `list_communities`, `search_events`, `search_people`, `search_exhibitors`, `search_sessions`, `search_meetings`, `list_sponsors` |
| **Writes** (10) | `manage_people`, `manage_exhibitors`, `manage_exhibitor_links`, `manage_sessions`, `manage_meetings`, `manage_locations`, `manage_documents`, `manage_roles`, `manage_webhooks`, `send_push_notification` |
| **Analytics** (1) | `get_analytics` — bounded streaming export of user-action events |
| **Escape hatches** (3) | `graphql_query`, `graphql_mutation` (gated), `introspect_schema` |

Design choices worth knowing:

- **The Swapcard API key *is* the credential.** The server is stateless and multi-tenant: it stores no keys. Each connection supplies a key, which is forwarded to Swapcard per request. Anyone without a valid Swapcard key gets nothing.
- **claude.ai web can't paste headers**, so the server ships a minimal OAuth 2.1 wrapper (dynamic client registration + PKCE + `/.well-known` metadata) whose "authorize" page just asks you to paste your Swapcard key. The key is validated against Swapcard, then carried inside an AES-256-GCM-encrypted token — still no database.
- **Destructive actions are gated**: every delete (and the raw `graphql_mutation` tool) refuses to run without an explicit `confirm: true` argument.
- **Anything the featured tools don't cover** (products, promo codes, ticket types, custom fields…) is reachable via `introspect_schema` + the GraphQL passthrough tools.

## Connect from Claude

You need a Swapcard organizer API key (create one at [studio.swapcard.com/api-keys](https://studio.swapcard.com/api-keys)).

### claude.ai (web) or Claude Desktop — custom connector

Settings → **Connectors** → **Add custom connector** → URL `https://mcp.bhatti.cloud/swapcard` (or your own deployment).
Claude runs an OAuth flow that shows a **"Paste your Swapcard API key"** page; paste the key once and you're connected.

### Claude Desktop / Claude Code — config (no OAuth)

```jsonc
{
  "mcpServers": {
    "swapcard": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.bhatti.cloud/swapcard",
               "--header", "Authorization: Bearer <your-swapcard-key>"]
    }
  }
}
```

## Self-host

```bash
cp .env.example .env   # set TOKEN_ENCRYPTION_SECRET and PUBLIC_BASE_URL
docker compose up -d --build
```

Put a TLS-terminating reverse proxy in front of port 8090 and point `PUBLIC_BASE_URL` at the public URL. Example Caddy route (path-based, so other MCP servers can share the host):

```caddy
mcp.example.com {
    handle /swapcard* {
        uri strip_prefix /swapcard
        reverse_proxy swapcard-mcp:8090 {
            flush_interval -1
        }
    }
}
```

### Environment

| Var | Required | Purpose |
|---|---|---|
| `PORT` | no (8090) | HTTP listen port |
| `MCP_PATH` | no (`/mcp`) | Path the MCP endpoint is served at |
| `PUBLIC_BASE_URL` | prod | Public URL, used to build OAuth metadata |
| `TOKEN_ENCRYPTION_SECRET` | **prod** | Encrypts web session tokens (`openssl rand -hex 32`). The server refuses to boot in production without it. |
| `SWAPCARD_API_KEY` | no | Dev-only fallback key when a request carries none |
| `WARMUP_API_KEY` | no | Key for the keep-alive heartbeat that avoids a ~1.5 s cold start on the first call after idle |

## Develop

```bash
npm install
cp .env.example .env        # optional: set SWAPCARD_API_KEY as a dev fallback
npm run dev                 # tsx watch, serves MCP at http://localhost:8090/mcp
# or
npm run build && npm start
```

Smoke tests (real MCP SDK client against a running server):

```bash
SWAPCARD_API_KEY=<key> node scripts/smoke.mjs            # reads
SWAPCARD_API_KEY=<key> node scripts/smoke-writes.mjs     # writes (uses a demo community)
SWAPCARD_API_KEY=<key> node scripts/smoke-analytics.mjs  # analytics export
node scripts/smoke-oauth.mjs                             # OAuth wrapper flow
```

## Layout

```
src/
  index.ts            HTTP bootstrap, Streamable HTTP transport, sessions, auth resolution
  server.ts           builds an McpServer bound to one connection's key
  config.ts           env loading + production guards
  oauth/              OAuth 2.1 wrapper: provider, stateless AES-GCM tokens, paste-key page
  swapcard/           GraphQL client (retry/backoff, rate-limit surfacing), keep-alive, pagination
  tools/              tool registrations (reads, manage_*, analytics, passthrough)
scripts/              smoke tests + timing harness
```

Design history: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) · tool scope rationale: [`tools-shortlist.md`](./tools-shortlist.md).

## Security notes

- The server never persists Swapcard keys: desktop clients send them per-request; web clients hold them inside AES-256-GCM tokens encrypted with `TOKEN_ENCRYPTION_SECRET`.
- Rotating `TOKEN_ENCRYPTION_SECRET` invalidates all outstanding web tokens (users just reconnect).
- A Swapcard organizer key grants broad access to your organization's events — treat it like a password, and prefer one key per team with rotation via [studio.swapcard.com/api-keys](https://studio.swapcard.com/api-keys).

## License

[MIT](./LICENSE)

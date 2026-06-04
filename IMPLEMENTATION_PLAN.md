# Swapcard MCP Server — Implementation Plan

Status: **DRAFT — awaiting approval before any code is written.**
Decided context: TypeScript/Node · remote HTTP server on KVM8 behind Caddy · **the shared Swapcard API key
*is* the credential** (entered at connect; web via paste-key OAuth wrapper, desktop via `mcp-remote` header) ·
stateless multi-tenant (stores no key) · consolidated tools · reads + writes on (deletes require `confirm:true`) ·
local git · Leads API parked (phase 2).

---

## 1. Architecture overview

```
Teammate's Claude client ──HTTPS──> Caddy (swapcard-mcp.fhsagents.site)
   (bearer token in header)            │  enforces Bearer token, TLS
                                        ▼
                              Node MCP server (Docker, local port)
                                        │  holds shared Swapcard org key
                                        ▼
                         Swapcard APIs (event-admin/graphql + export/analytics)
```

- **Transport:** MCP **Streamable HTTP** (official `@modelcontextprotocol/sdk`). Stateless-friendly so it sits cleanly behind Caddy.
- **Auth model — the Swapcard API key *is* the credential.** The server is **stateless / multi-tenant** and stores no key. Teammates are each given the shared Swapcard key and supply it when connecting; the server forwards it to Swapcard on every request. No valid key ⇒ nothing works (so the endpoint being public is not a risk).
  - *Desktop / Code:* key passed as an `Authorization` header via the `mcp-remote` stdio bridge.
  - *Web:* a thin **OAuth-shaped wrapper** (DCR + PKCE + `/.well-known` metadata) whose authorize page simply asks the user to **paste the key**; the server validates it against Swapcard, then issues a signed session token carrying the key (encrypted with a server secret). No database.
- **Delete gating:** destructive actions are enabled but require an explicit `confirm: true` arg. Without it the tool refuses and explains exactly what it would delete.

## 2. Project layout

```
swapcard-mcp/
├── src/
│   ├── index.ts            # HTTP bootstrap, Streamable HTTP transport, auth middleware
│   ├── server.ts           # McpServer instance + tool registration
│   ├── config.ts           # env loading + validation
│   ├── auth.ts             # bearer-token check
│   ├── swapcard/
│   │   ├── client.ts       # GraphQL fetch wrapper: auth header, rate-limit/429 backoff, errors
│   │   ├── endpoints.ts    # endpoint URLs
│   │   └── operations.ts   # typed GraphQL query/mutation strings + variable builders
│   └── tools/
│       ├── reads.ts        # list_communities, search_events/people/exhibitors/sessions/meetings, list_sponsors
│       ├── people.ts       # manage_people
│       ├── exhibitors.ts   # manage_exhibitors, manage_exhibitor_links
│       ├── sessions.ts     # manage_sessions
│       ├── meetings.ts     # manage_meetings
│       ├── locations.ts    # manage_locations
│       ├── documents.ts    # manage_documents
│       ├── roles.ts        # manage_roles
│       ├── notifications.ts# send_push_notification
│       ├── webhooks.ts     # manage_webhooks
│       ├── analytics.ts    # get_analytics (streaming export, bounded)
│       └── passthrough.ts  # graphql_query, graphql_mutation, introspect_schema
├── package.json · tsconfig.json
├── Dockerfile · docker-compose.yml · .env.example
└── README.md  (setup + how teammates connect)
```

## 3. Tool implementation pattern

- Each tool registered with a **Zod** input schema → MCP exposes clean JSON Schema to Claude.
- Consolidated `manage_*` tools use a discriminated union on `action`; only the fields for that action are required.
- Every write returns the affected entity/ids; errors are surfaced as readable messages (GraphQL `errors[]` mapped to tool error).
- Build step: introspect each featured operation's **INPUT_OBJECT** type so the GraphQL variables match Swapcard exactly (the schema is the source of truth; passthrough covers anything we miss).

## 4. GraphQL client concerns

- Single `Authorization: <key>` header (raw key, not Bearer).
- Honor rate limits: read `X-RateLimit-*`, retry 429 with exponential backoff; surface remaining budget on demand.
- Respect per-query limits (depth 20, cost 10k) — keep default selection sets modest; reads accept a `fields`/`pageSize` arg.
- `get_analytics`: stream newline-JSON, **enforce a max-record cap + required time window** so it can't run unbounded.

## 5. Deployment (KVM8)

- New Docker Compose service `swapcard-mcp` on an internal port (e.g. 8090).
- Caddy route on the shared host `mcp.fhsagents.site`, path `/swapcard/*` → reverse_proxy to the container (TLS via Caddy). Path-based so other MCP servers can live under `/hubspot`, etc.
- Env via `.env` on the server: `TOKEN_ENCRYPTION_SECRET` (signs/encrypts web session tokens), `PUBLIC_BASE_URL`, `PORT`; optional `SWAPCARD_API_KEY` dev fallback. **No stored teammate keys.**
- Document app in `/root/CLAUDE.md` per the VPS convention.

## 6. Client connection (web + desktop) — "paste your key"

The same shared Swapcard key is handed to each teammate; how they enter it differs by surface:

**Desktop / Claude Code** — local connector config wraps the remote server with `mcp-remote` and passes the key as a header:
```jsonc
"swapcard": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://mcp.fhsagents.site/swapcard",
           "--header", "Authorization: Bearer ${SWAPCARD_KEY}"]
}
```
No OAuth involved — the server reads the header and uses it as the Swapcard credential.

**claude.ai web** — the connector UI can't accept a pasted token/header, only OAuth. So we ship a minimal **OAuth-shaped wrapper** that turns "enter your key" into a compliant flow:
- `/.well-known/oauth-protected-resource` + `/.well-known/oauth-authorization-server` — discovery metadata.
- `/register` — Dynamic Client Registration (Claude registers itself).
- `/authorize` — our page; asks the user to **paste the Swapcard key**, validates it with a cheap probe query (`{ communities { nodes { id } } }`), then returns an auth code (PKCE).
- `/token` — exchanges the code for a signed access token that carries the key **encrypted with a server secret** (stateless; no DB).
- MCP requests present that token → server decrypts → calls Swapcard.

Implementation note: lean on the MCP TypeScript SDK's built-in auth helpers / a vetted OAuth library rather than hand-rolling crypto. Allowlist Claude's callback `https://claude.ai/api/mcp/auth_callback` (and `https://claude.com/...`).

## 7. Build phases (each independently testable)

- **Phase 0 — Scaffold:** repo, TS config, MCP server skeleton, GraphQL client, auth, `list_communities`. Test locally with **MCP Inspector** against the live key.
- **Phase 1 — Reads:** all 7 read tools + `graphql_query` + `introspect_schema`. Validate against "Bench" / "Your Demo Community".
- **Phase 2 — Writes:** the 10 `manage_*` tools + `send_push_notification` + `graphql_mutation`, with delete gating. Test create/update on a throwaway event.
- **Phase 3 — Analytics:** `get_analytics` with bounded streaming.
- **Phase 4 — Web auth wrapper:** the OAuth-shaped "paste your key" flow (§6) so claude.ai web can connect.
- **Phase 5 — Deploy:** Dockerize, Caddy subdomain + TLS, connect both a Desktop client and a web connector end-to-end.
- **Phase 6 (later) — Leads API:** add exhibitor-token tools.

## 8. Status

### Resolved
- Stack **TypeScript/Node**, MCP Streamable HTTP, Docker on KVM8 behind Caddy.
- Auth = **shared Swapcard key as the credential**; stateless server forwards it. Desktop via `mcp-remote` header; web via paste-key OAuth wrapper. Both surfaces built now.
- Tools: **21** (7 reads + 10 `manage_*` + `get_analytics` + 3 infra), consolidated. Leads API parked.
- Deletes: **enabled, require `confirm:true`**.
- Git: initialized locally on `main`.

### Endpoint
- `https://mcp.fhsagents.site/swapcard` — path-based on the shared `mcp.fhsagents.site` host (room for other MCP servers under different paths).

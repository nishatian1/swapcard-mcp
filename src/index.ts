import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl, createOAuthMetadata } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { config } from "./config.js";
import { buildServer } from "./server.js";
import { swapcardGraphQL } from "./swapcard/client.js";
import { configureHttp, startWarmup } from "./swapcard/http.js";
import { swapcardOAuthProvider } from "./oauth/provider.js";
import { createAuthCode } from "./oauth/store.js";
import { renderKeyPage } from "./oauth/page.js";
import { isOurToken, readToken } from "./oauth/tokens.js";

const RESOURCE_URL = config.publicBaseUrl; // e.g. https://mcp.example.com/swapcard
// Use a PATH-BASED issuer (…/swapcard) rather than the host root, so our OAuth discovery
// lives under our own path. This matters when another MCP server shares the same host and
// owns the root /.well-known/oauth-authorization-server (e.g. mcp.bhatti.cloud also hosts a
// GTM server). With a path issuer, clients discover us at the RFC 8414 path-aware location
// /.well-known/oauth-authorization-server/<path>, which we serve below.
const ISSUER_URL = new URL(RESOURCE_URL); // e.g. https://mcp.example.com/swapcard
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(RESOURCE_URL));
const oauthMetadata = createOAuthMetadata({
  provider: swapcardOAuthProvider,
  issuerUrl: ISSUER_URL,
  scopesSupported: [],
});
// RFC 8414 path-aware location for the AS metadata, e.g. /.well-known/oauth-authorization-server/swapcard
const asMetadataPath = `/.well-known/oauth-authorization-server${ISSUER_URL.pathname === "/" ? "" : ISSUER_URL.pathname}`;

configureHttp(); // long-lived keep-alive to Swapcard (avoids cold-start latency)

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // behind Caddy; needed for correct client IP + rate-limit middleware

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "swapcard-mcp", version: "0.1.0" });
});

// Path-aware AS metadata. The SDK only serves AS metadata at the host root
// (/.well-known/oauth-authorization-server). When we share a host with another MCP server
// that owns that root path, clients must find ours at the path-aware location instead, so we
// serve it explicitly here with permissive CORS for browser-based clients.
app.get(asMetadataPath, (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(oauthMetadata);
});
app.options(asMetadataPath, (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.sendStatus(204);
});

// --- OAuth (claude.ai web "paste your key" flow) ---
// Serves /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource,
// /authorize, /token, /register, /revoke. Each handler parses its own body.
app.use(
  mcpAuthRouter({
    provider: swapcardOAuthProvider,
    issuerUrl: ISSUER_URL,
    resourceServerUrl: new URL(RESOURCE_URL),
    resourceName: "Swapcard MCP",
    scopesSupported: [],
  }),
);

// The authorize page posts here (NOT under /authorize/* — that prefix is owned by the SDK
// auth router, whose body parser would consume this stream first). Validate the pasted key,
// mint a one-time code, redirect back.
app.post("/oauth/key", express.urlencoded({ extended: false }), async (req, res) => {
  const { client_id, redirect_uri, code_challenge, state, scope, resource, apiKey } = req.body as Record<string, string>;
  const reRender = (error: string) =>
    res.status(400).send(
      renderKeyPage({
        clientId: client_id ?? "",
        redirectUri: redirect_uri ?? "",
        codeChallenge: code_challenge ?? "",
        state: state ?? "",
        scope: scope ?? "",
        resource: resource ?? "",
        error,
      }),
    );

  if (!apiKey || !redirect_uri || !code_challenge || !client_id) {
    reRender("Missing required fields. Please start the connection again from Claude.");
    return;
  }
  try {
    await swapcardGraphQL(apiKey, "{ communities { nodes { id } } }");
  } catch {
    reRender("That Swapcard API key was rejected. Check it and try again.");
    return;
  }
  const code = createAuthCode({
    swapcardKey: apiKey,
    codeChallenge: code_challenge,
    redirectUri: redirect_uri,
    clientId: client_id,
  });
  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(302, url.toString());
});

/** Resolve the Swapcard key from the request: our OAuth token (web) or a raw key (Desktop/Code). */
function resolveKey(req: express.Request): { key?: string; needAuth?: boolean } {
  const raw = req.headers["authorization"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) {
    return config.fallbackApiKey ? { key: config.fallbackApiKey } : { needAuth: true };
  }
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = (m ? m[1] : header).trim();
  if (!token) return { needAuth: true };
  if (isOurToken(token)) {
    const payload = readToken(token);
    return payload ? { key: payload.k } : { needAuth: true }; // expired/invalid → re-auth
  }
  return { key: token }; // raw Swapcard key
}

function requireAuth(res: express.Response): void {
  res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`);
  res.status(401).json({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32001, message: "Authentication required. Provide a Swapcard API key or complete the OAuth flow." },
  });
}

// --- MCP endpoint ---
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post(config.mcpPath, express.json({ limit: "1mb" }), async (req, res) => {
  try {
    // Auth first: any unauthenticated request returns 401 + WWW-Authenticate so web clients
    // discover the OAuth flow. (Desktop/Code send a raw key; web sends our OAuth token.)
    const { key, needAuth } = resolveKey(req);
    if (needAuth || !key) {
      requireAuth(res);
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: "Bad Request: no active session. Send an initialize request first." },
        });
        return;
      }

      const server = buildServer(key);
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport!;
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) delete transports[transport!.sessionId];
      };
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP POST error:", e);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal server error" } });
    }
  }
});

const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transport.handleRequest(req, res);
};

app.get(config.mcpPath, handleSessionRequest);
app.delete(config.mcpPath, handleSessionRequest);

app.listen(config.port, () => {
  startWarmup(); // heartbeat keeps the Swapcard connection hot
  console.log(`swapcard-mcp listening on :${config.port}  (MCP at ${config.mcpPath}, issuer ${ISSUER_URL})`);
});

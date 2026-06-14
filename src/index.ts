import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { getOAuthProtectedResourceMetadataUrl, createOAuthMetadata } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { config } from "./config.js";
import { buildServer } from "./server.js";
import { swapcardGraphQL } from "./swapcard/client.js";
import { configureHttp, startWarmup } from "./swapcard/http.js";
import { swapcardOAuthProvider } from "./oauth/provider.js";
import { createAuthCode } from "./oauth/store.js";
import { renderKeyPage } from "./oauth/page.js";
import { isOurToken, readToken } from "./oauth/tokens.js";

const RESOURCE_URL = config.publicBaseUrl.replace(/\/$/, ""); // e.g. https://mcp.example.com/swapcard
// Use a PATH-BASED issuer (…/swapcard) and mount EVERY OAuth endpoint under that same path, so
// the whole server is self-contained under one path and never collides at the host root with
// another MCP server on the same domain (mcp.bhatti.cloud also hosts a GTM server that owns the
// root /.well-known/oauth-authorization-server). Clients discover us at the RFC 8414 path-aware
// location /.well-known/oauth-authorization-server/<path>.
const ISSUER_URL = new URL(RESOURCE_URL); // e.g. https://mcp.example.com/swapcard
const basePath = ISSUER_URL.pathname.replace(/\/$/, ""); // e.g. "/swapcard" ("" if served at the host root)
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(RESOURCE_URL));

// AS metadata, with the three endpoint URLs relocated under our base path. The SDK hardcodes
// them at the host root, so we build the metadata and then override those URLs.
const oauthMetadata = createOAuthMetadata({ provider: swapcardOAuthProvider, issuerUrl: ISSUER_URL, scopesSupported: [] });
oauthMetadata.authorization_endpoint = `${RESOURCE_URL}/authorize`;
oauthMetadata.token_endpoint = `${RESOURCE_URL}/token`;
oauthMetadata.registration_endpoint = `${RESOURCE_URL}/register`;

const protectedResourceMetadata = {
  resource: RESOURCE_URL,
  authorization_servers: [oauthMetadata.issuer],
  scopes_supported: [] as string[],
  resource_name: "Swapcard MCP",
};

// Discovery doc locations (all at the host root per the RFCs; path-suffixed for our base path).
const asMetadataPath = `/.well-known/oauth-authorization-server${basePath}`;
const prmPath = `/.well-known/oauth-protected-resource${basePath}`;
const keyFormPath = `${basePath}/oauth/key`; // where the paste-key page submits

configureHttp(); // long-lived keep-alive to Swapcard (avoids cold-start latency)

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // behind Caddy; needed for correct client IP + rate-limit middleware

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "swapcard-mcp", version: "0.1.0" });
});

// --- OAuth (claude.ai / ChatGPT web "paste your key" flow) ---
// Everything is mounted under our base path so it never collides at the host root with another
// MCP server sharing this domain. We mount the SDK's auth handlers ourselves (the bundled
// mcpAuthRouter hardcodes them at the root) and serve the discovery docs explicitly. Each
// handler carries its own CORS, rate limiting, and body parsing.
//
// AS metadata is served at the RFC 8414 path-aware location (where spec clients look for a path
// issuer) and also at the host root for standalone deployments; protected-resource metadata per
// RFC 9728.
app.use(asMetadataPath, metadataHandler(oauthMetadata));
app.use("/.well-known/oauth-authorization-server", metadataHandler(oauthMetadata));
app.use(prmPath, metadataHandler(protectedResourceMetadata));

// Auth endpoints, all under the base path: …/authorize, …/token, …/register.
app.use(`${basePath}/authorize`, authorizationHandler({ provider: swapcardOAuthProvider }));
app.use(`${basePath}/token`, tokenHandler({ provider: swapcardOAuthProvider }));
app.use(`${basePath}/register`, clientRegistrationHandler({ clientsStore: swapcardOAuthProvider.clientsStore }));

// The authorize page posts the pasted key here (…/oauth/key). Validate it against Swapcard,
// mint a one-time code, redirect back to the client.
app.post(keyFormPath, express.urlencoded({ extended: false }), async (req, res) => {
  const { client_id, redirect_uri, code_challenge, state, scope, resource, apiKey } = req.body as Record<string, string>;
  const reRender = (error: string) =>
    res.status(400).send(
      renderKeyPage({
        formAction: keyFormPath,
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

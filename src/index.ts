import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { buildServer } from "./server.js";
import { extractApiKey } from "./auth.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

/** Active sessions: Mcp-Session-Id -> transport. Each holds a server bound to one teammate's key. */
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "swapcard-mcp", version: "0.1.0" });
});

// MCP endpoint (client -> server messages)
app.post(config.mcpPath, async (req, res) => {
  try {
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

      const apiKey = extractApiKey(req);
      if (!apiKey) {
        res.status(401).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Missing Swapcard API key. Provide it via the Authorization header." },
        });
        return;
      }

      const server = buildServer(apiKey);
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
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal server error" },
      });
    }
  }
});

// SSE stream (GET) and session teardown (DELETE)
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
  console.log(`swapcard-mcp listening on :${config.port}  (MCP at ${config.mcpPath})`);
});

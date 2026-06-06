import "dotenv/config";

function intEnv(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const port = intEnv("PORT", 8090);

export const config = {
  port,
  /** Path the MCP endpoint is served at. In prod, Caddy maps mcp.fhsagents.site/swapcard here. */
  mcpPath: process.env.MCP_PATH ?? "/mcp",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
  /** Secret for signing/encrypting web session tokens (Phase 4). */
  tokenEncryptionSecret: process.env.TOKEN_ENCRYPTION_SECRET ?? "",
  /** Optional dev fallback. Real key comes from each request's Authorization header. */
  fallbackApiKey: process.env.SWAPCARD_API_KEY ?? "",
  /** Optional key used only for the upstream warm-up heartbeat (keeps the Swapcard connection hot). */
  warmupApiKey: process.env.WARMUP_API_KEY ?? "",
} as const;

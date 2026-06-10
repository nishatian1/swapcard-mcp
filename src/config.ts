import "dotenv/config";

function intEnv(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const port = intEnv("PORT", 8090);

const tokenEncryptionSecret = process.env.TOKEN_ENCRYPTION_SECRET ?? "";
if (!tokenEncryptionSecret && process.env.NODE_ENV === "production") {
  // OAuth tokens encrypt users' Swapcard keys with this secret — refusing to boot beats
  // silently minting tokens anyone could decrypt with the known dev fallback.
  throw new Error("TOKEN_ENCRYPTION_SECRET must be set in production (generate: openssl rand -hex 32)");
}

export const config = {
  port,
  /** Path the MCP endpoint is served at. In prod, the reverse proxy maps e.g. mcp.example.com/swapcard here. */
  mcpPath: process.env.MCP_PATH ?? "/mcp",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
  /** Secret for signing/encrypting web session tokens. Required in production. */
  tokenEncryptionSecret,
  /** Optional dev fallback. Real key comes from each request's Authorization header. */
  fallbackApiKey: process.env.SWAPCARD_API_KEY ?? "",
  /** Optional key used only for the upstream warm-up heartbeat (keeps the Swapcard connection hot). */
  warmupApiKey: process.env.WARMUP_API_KEY ?? "",
} as const;

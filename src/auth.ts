import type { IncomingMessage } from "node:http";
import { config } from "./config.js";

/**
 * Extract the Swapcard API key from a request's Authorization header.
 * Accepts either `Bearer <key>` or a raw `<key>`. Falls back to the dev env key if present.
 */
export function extractApiKey(req: IncomingMessage): string | undefined {
  const raw = req.headers["authorization"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (header) {
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());
    const key = (m ? m[1] : header).trim();
    if (key) return key;
  }
  return config.fallbackApiKey || undefined;
}

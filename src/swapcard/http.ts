import { Agent, setGlobalDispatcher } from "undici";
import { config } from "../config.js";
import { SWAPCARD_ENDPOINTS } from "./endpoints.js";

/**
 * Configure the global HTTP dispatcher with long-lived keep-alive so the TLS connection
 * to Swapcard is reused across requests. Without this, undici's default ~4s idle timeout
 * closes the socket and the next call pays a full DNS+TCP+TLS cold start (~1.5s observed).
 */
export function configureHttp(): void {
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 60_000, // keep idle sockets 60s
      keepAliveMaxTimeout: 10 * 60_000,
      connections: 128,
    }),
  );
}

let warmupStarted = false;

/**
 * Heartbeat that pings Swapcard periodically so the pooled connection never idles out.
 * Uses WARMUP_API_KEY when set (a real 200), otherwise an unauthenticated ping that still
 * refreshes the socket. Cost is ~1 point per ping — negligible against the 60k/min budget.
 */
export function startWarmup(intervalMs = 50_000): void {
  if (warmupStarted) return;
  warmupStarted = true;

  const ping = async () => {
    try {
      await fetch(SWAPCARD_ENDPOINTS.eventAdmin, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "swapcard-mcp/warmup",
          ...(config.warmupApiKey ? { Authorization: config.warmupApiKey } : {}),
        },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
    } catch {
      /* ignore — best effort */
    }
  };

  void ping(); // warm immediately on boot
  const timer = setInterval(() => void ping(), intervalMs);
  timer.unref?.();
}

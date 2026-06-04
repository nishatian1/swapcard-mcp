import { randomBytes } from "node:crypto";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * In-memory stores. Single-container deployment, so memory is fine; on restart, clients
 * re-register (Claude handles this) and short-lived auth codes are simply gone.
 */
const clients = new Map<string, OAuthClientInformationFull>();

export const clientsStore: OAuthRegisteredClientsStore = {
  getClient(clientId) {
    return clients.get(clientId);
  },
  registerClient(client) {
    const client_id = "client_" + randomBytes(16).toString("hex");
    const full = {
      ...client,
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    } as OAuthClientInformationFull;
    clients.set(client_id, full);
    return full;
  },
};

export interface AuthCode {
  swapcardKey: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCode>();

export function createAuthCode(data: Omit<AuthCode, "expiresAt">): string {
  const code = randomBytes(24).toString("base64url");
  authCodes.set(code, { ...data, expiresAt: Date.now() + 5 * 60 * 1000 });
  return code;
}

/** Read without consuming (used for PKCE challenge lookup, which precedes the exchange). */
export function peekAuthCode(code: string): AuthCode | null {
  const c = authCodes.get(code);
  if (!c || c.expiresAt < Date.now()) return null;
  return c;
}

/** Read and consume (one-time use, during token exchange). */
export function takeAuthCode(code: string): AuthCode | null {
  const c = authCodes.get(code);
  if (!c) return null;
  authCodes.delete(code);
  if (c.expiresAt < Date.now()) return null;
  return c;
}

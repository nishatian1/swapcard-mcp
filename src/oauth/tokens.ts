import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

/**
 * Stateless access/refresh tokens: an AES-256-GCM-encrypted JSON payload carrying the
 * teammate's Swapcard key, prefixed with "sck_". No database — the token IS the storage.
 */
const PREFIX = "sck_";

function keyMaterial(): Buffer {
  return createHash("sha256")
    .update(config.tokenEncryptionSecret || "dev-insecure-secret-change-me")
    .digest();
}

interface TokenPayload {
  k: string; // swapcard api key
  typ: "a" | "r"; // access | refresh
  exp: number; // unix seconds
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export function isOurToken(token: string): boolean {
  return token.startsWith(PREFIX);
}

export function issueToken(swapcardKey: string, typ: "a" | "r", ttlSeconds: number): string {
  const payload: TokenPayload = { k: swapcardKey, typ, exp: nowSeconds() + ttlSeconds };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64url");
}

/** Decrypt and validate one of our tokens. Returns null if it isn't ours / tampered / expired. */
export function readToken(token: string): TokenPayload | null {
  if (!isOurToken(token)) return null;
  try {
    const raw = Buffer.from(token.slice(PREFIX.length), "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const payload = JSON.parse(pt) as TokenPayload;
    if (typeof payload.k !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < nowSeconds()) return null;
    return payload;
  } catch {
    return null;
  }
}

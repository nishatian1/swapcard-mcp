import type { Response } from "express";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { clientsStore, peekAuthCode, takeAuthCode } from "./store.js";
import { issueToken, readToken } from "./tokens.js";
import { renderKeyPage } from "./page.js";

const ACCESS_TTL = 30 * 24 * 3600; // 30 days
const REFRESH_TTL = 180 * 24 * 3600; // 180 days

function tokensFor(swapcardKey: string): OAuthTokens {
  return {
    access_token: issueToken(swapcardKey, "a", ACCESS_TTL),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: issueToken(swapcardKey, "r", REFRESH_TTL),
    scope: "",
  };
}

/**
 * OAuth provider whose authorize step is a "paste your Swapcard key" page. The issued
 * access/refresh tokens statelessly encrypt that key (see tokens.ts), so the MCP request
 * handler can recover it without any server-side session storage.
 */
export const swapcardOAuthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  async authorize(client: OAuthClientInformationFull, params, res: Response): Promise<void> {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      renderKeyPage({
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state ?? "",
        scope: (params.scopes ?? []).join(" "),
        resource: params.resource?.href ?? "",
      }),
    );
  },

  async challengeForAuthorizationCode(_client, authorizationCode): Promise<string> {
    const c = peekAuthCode(authorizationCode);
    if (!c) throw new Error("Invalid or expired authorization code");
    return c.codeChallenge;
  },

  async exchangeAuthorizationCode(_client, authorizationCode, _codeVerifier, redirectUri): Promise<OAuthTokens> {
    const c = takeAuthCode(authorizationCode);
    if (!c) throw new Error("Invalid or expired authorization code");
    if (redirectUri !== undefined && redirectUri !== c.redirectUri) {
      throw new Error("redirect_uri does not match the authorization request");
    }
    return tokensFor(c.swapcardKey);
  },

  async exchangeRefreshToken(_client, refreshToken): Promise<OAuthTokens> {
    const p = readToken(refreshToken);
    if (!p) throw new Error("Invalid or expired refresh token");
    return tokensFor(p.k);
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const p = readToken(token);
    if (!p) throw new Error("Invalid or expired access token");
    return { token, clientId: "swapcard", scopes: [], expiresAt: p.exp, extra: { swapcardKey: p.k } };
  },
};

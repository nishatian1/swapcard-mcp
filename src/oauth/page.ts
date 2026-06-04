function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface KeyPageParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope: string;
  resource: string;
  error?: string;
}

/** The "paste your Swapcard API key" page shown during the OAuth authorize step (claude.ai web). */
export function renderKeyPage(p: KeyPageParams): string {
  const hidden = (name: string, value: string) =>
    `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
  const errorBlock = p.error
    ? `<div class="error">${esc(p.error)}</div>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Swapcard</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0;
         display: grid; place-items: center; min-height: 100vh; background: #0f1115; color: #e7e9ee; }
  .card { width: min(440px, 92vw); background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 14px;
          padding: 28px 26px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p { color: #aab0bd; font-size: 14px; line-height: 1.5; margin: 0 0 18px; }
  label { display: block; font-size: 13px; margin: 0 0 6px; color: #c9cedb; }
  input[type=password], input[type=text] { width: 100%; box-sizing: border-box; padding: 11px 12px;
          border-radius: 9px; border: 1px solid #343a47; background: #11141a; color: #e7e9ee; font-size: 14px; }
  button { margin-top: 18px; width: 100%; padding: 11px; border: 0; border-radius: 9px; cursor: pointer;
           background: #5b8cff; color: #fff; font-size: 15px; font-weight: 600; }
  button:hover { background: #4a7bf0; }
  .error { background: #3a1d22; border: 1px solid #7a2b34; color: #ffb3bd; padding: 10px 12px;
           border-radius: 9px; font-size: 13px; margin: 0 0 16px; }
  .hint { margin-top: 14px; font-size: 12px; color: #7e8595; }
  a { color: #8db0ff; }
</style>
</head>
<body>
  <div class="card">
    <h1>Connect to Swapcard</h1>
    <p>Paste your Swapcard API key to connect this Claude integration. Your key is sent over
       HTTPS and used only to talk to Swapcard on your behalf.</p>
    ${errorBlock}
    <form method="POST" action="/oauth/key">
      ${hidden("client_id", p.clientId)}
      ${hidden("redirect_uri", p.redirectUri)}
      ${hidden("code_challenge", p.codeChallenge)}
      ${hidden("state", p.state)}
      ${hidden("scope", p.scope)}
      ${hidden("resource", p.resource)}
      <label for="apiKey">Swapcard API key</label>
      <input id="apiKey" name="apiKey" type="password" autocomplete="off" spellcheck="false"
             placeholder="Paste your key" required autofocus>
      <button type="submit">Connect</button>
    </form>
    <div class="hint">Get a key from <a href="https://studio.swapcard.com/api-keys" target="_blank" rel="noopener">studio.swapcard.com/api-keys</a>.</div>
  </div>
</body>
</html>`;
}

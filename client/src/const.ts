import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";
import { OWNER_LOGIN_PATH } from "@shared/ownerLogin";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
export const startLogin = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  /**
   * Fora do Manus não há portal de OAuth a que ir.
   *
   * O site deixou de viver em `.manus.space`, e nessa altura o OAuth deles não
   * reconhece o endereço de retorno. Sem esta saída, carregar em "entrar"
   * mandava o browser para `undefined/app-auth` — um ecrã de erro em vez de um
   * formulário, e nenhuma pista do que fazer a seguir.
   *
   * Quando as duas variáveis do Manus existem, nada muda: continua o login de
   * sempre para quem ainda está lá alojado.
   */
  if (!oauthPortalUrl || !appId) {
    window.location.href = OWNER_LOGIN_PATH;
    return;
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const nonce = crypto.randomUUID();
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  window.location.href = url.toString();
};

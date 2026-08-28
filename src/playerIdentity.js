/**
 * Web player identity.
 *
 * Cross-device: username + password (edge auth) → same player_id in localStorage.
 * Same device: gift2u_player_id stays in localStorage until logout / clear data.
 * Recovery: 12-word restore still works.
 *
 * DB column `telegram_id` is the player key (legacy name).
 */

export const DB_PLAYER_ID = 'telegram_id';

export function withPlayerId(query, id) {
  return query.eq(DB_PLAYER_ID, String(id));
}

const PLAYER_ID_KEY = 'gift2u_player_id';
const USERNAME_KEY = 'gift2u_username';
const REF_SESSION_KEY = 'gift2u_ref';
const SESSION_FLAG = 'gift2u_logged_in';
const SESSION_TOKEN_KEY = 'gift2u_session_token';
const SESSION_EXPIRES_KEY = 'gift2u_session_expires';

/** Return stored id or null — does NOT create a new account. */
export function getPlayerId() {
  return localStorage.getItem(PLAYER_ID_KEY) || null;
}

/** @deprecated use getPlayerId + explicit signup; kept for callers that expect create */
export function getOrCreatePlayerId() {
  let id = getPlayerId();
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function setPlayerId(id) {
  if (!id) return;
  localStorage.setItem(PLAYER_ID_KEY, String(id));
  localStorage.setItem(SESSION_FLAG, '1');
}

export function clearSession() {
  localStorage.removeItem(PLAYER_ID_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(SESSION_FLAG);
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_EXPIRES_KEY);
}

/**
 * Hard-security session JWT.
 * IMPORTANT: Do NOT delete an "expired" token from localStorage here.
 * Players close/reopen the game — we silent-refresh expired tokens within
 * a grace window via auth-refresh. Wiping the token forced a password login.
 */
export function getSessionToken() {
  try {
    const tok = localStorage.getItem(SESSION_TOKEN_KEY);
    return tok || null;
  } catch {
    return null;
  }
}

/** True if token is missing or past stored expires_at (needs silent refresh). */
export function isSessionTokenStale(skewMs = 60 * 60 * 1000) {
  try {
    const tok = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!tok) return true;
    const exp = localStorage.getItem(SESSION_EXPIRES_KEY);
    if (!exp) return false; // have token, unknown exp — treat as ok
    const t = Date.parse(exp);
    if (!Number.isFinite(t)) return false;
    // Stale if expired or expiring within skew (default 1 hour)
    return t < Date.now() + skewMs;
  } catch {
    return true;
  }
}

export function setSessionToken(token, expiresAt) {
  try {
    if (!token) {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      localStorage.removeItem(SESSION_EXPIRES_KEY);
      return;
    }
    localStorage.setItem(SESSION_TOKEN_KEY, String(token));
    if (expiresAt) localStorage.setItem(SESSION_EXPIRES_KEY, String(expiresAt));
  } catch {
    /* ignore */
  }
}

/** Authorization header map for Edge Function calls */
export function authHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  const tok = getSessionToken();
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}


export function isLoggedIn() {
  return !!(getPlayerId() && localStorage.getItem(SESSION_FLAG));
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY) || '';
}

export function setUsername(name) {
  const clean = (name || '').trim().slice(0, 32);
  if (clean) localStorage.setItem(USERNAME_KEY, clean);
  return clean || 'Player';
}

export function getPlayerProfile() {
  const id = getPlayerId();
  const username = getUsername() || 'Player';
  return {
    id: id || '',
    username,
    first_name: username,
  };
}

/** Apply login/signup result to this browser. */
export function applyAuthSession({ playerId, username, sessionToken, expiresAt } = {}) {
  const prevId = getPlayerId();
  const switched =
    !!(playerId && prevId && String(prevId) !== String(playerId));

  setPlayerId(playerId);
  if (username) setUsername(username);

  // CRITICAL: never keep another account's JWT (Network showed TwrLtr while UI was a different user).
  if (sessionToken) {
    setSessionToken(sessionToken, expiresAt);
  } else if (switched || sessionToken === null) {
    setSessionToken(null);
  }
  return getPlayerProfile();
}


export function captureReferralFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('startapp') || null;
    if (ref) {
      sessionStorage.setItem(REF_SESSION_KEY, String(ref));
      params.delete('ref');
      params.delete('startapp');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', next);
    }
  } catch {
    /* ignore */
  }
}

export function peekReferralId() {
  try {
    return sessionStorage.getItem(REF_SESSION_KEY);
  } catch {
    return null;
  }
}

export function consumeReferralId() {
  const ref = sessionStorage.getItem(REF_SESSION_KEY);
  if (ref) sessionStorage.removeItem(REF_SESSION_KEY);
  return ref;
}

export function getInviteLink(playerId) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/play?ref=${encodeURIComponent(playerId || getPlayerId() || '')}`;
}

export function vaultSaltFor(playerId) {
  return `${playerId}_GIFT_memecoin_secure_salt_2026`;
}

export function isBrowser() {
  return typeof window !== 'undefined';
}

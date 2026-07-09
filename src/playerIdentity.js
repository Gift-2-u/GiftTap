/**
 * Web player identity (replaces Telegram WebApp user).
 *
 * IMPORTANT — Supabase still has a column named `telegram_id` from the Mini App era.
 * We did NOT rename it (would break existing rows + RPCs). It now stores:
 *   - web UUID for new browser accounts, OR
 *   - legacy numeric Telegram id after "Restore with 12 words"
 * Use DB_PLAYER_ID / withPlayerId() in app code so it is clear this is the player key.
 */

/** Legacy Supabase column name for the player primary key (do not rename without a DB migration). */
export const DB_PLAYER_ID = 'telegram_id';

/** Apply .eq on players by player key. Example: withPlayerId(supabase.from('players').select('*'), id).maybeSingle() */
export function withPlayerId(query, id) {
  return query.eq(DB_PLAYER_ID, String(id));
}

const PLAYER_ID_KEY = 'gift2u_player_id';
const USERNAME_KEY = 'gift2u_username';
const REF_SESSION_KEY = 'gift2u_ref';

export function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function setPlayerId(id) {
  if (!id) return;
  localStorage.setItem(PLAYER_ID_KEY, String(id));
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY) || 'Player';
}

export function setUsername(name) {
  const clean = (name || 'Player').trim().slice(0, 32) || 'Player';
  localStorage.setItem(USERNAME_KEY, clean);
  return clean;
}

/** Stable profile object used everywhere tgUser used to be. */
export function getPlayerProfile() {
  const id = getOrCreatePlayerId();
  const username = getUsername();
  return {
    id,
    username,
    first_name: username,
  };
}

/** Capture ?ref= on first load; consume once when creating a new account. */
export function captureReferralFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('startapp') || null;
    if (ref) {
      sessionStorage.setItem(REF_SESSION_KEY, String(ref));
      // Clean ref from URL without reload
      params.delete('ref');
      params.delete('startapp');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', next);
    }
  } catch {
    /* ignore */
  }
}

export function consumeReferralId() {
  const ref = sessionStorage.getItem(REF_SESSION_KEY);
  if (ref) sessionStorage.removeItem(REF_SESSION_KEY);
  return ref;
}

export function getInviteLink(playerId) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Root URL is the game (http://localhost:5173/?ref=...)
  return `${origin}/?ref=${encodeURIComponent(playerId || getOrCreatePlayerId())}`;
}

export function vaultSaltFor(playerId) {
  return `${playerId}_GIFT_memecoin_secure_salt_2026`;
}

export function isBrowser() {
  return typeof window !== 'undefined';
}

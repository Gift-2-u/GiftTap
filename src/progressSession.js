/**
 * Progress API session — issued by auth-login / auth-register.
 * Required for secure save-progress (server-validated taps).
 */
const TOKEN_KEY = 'gift2u_progress_token';
const EXPIRES_KEY = 'gift2u_progress_token_expires';

export function setProgressSession(token, expiresIso) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, String(token));
    else localStorage.removeItem(TOKEN_KEY);
    if (expiresIso) localStorage.setItem(EXPIRES_KEY, String(expiresIso));
    else localStorage.removeItem(EXPIRES_KEY);
  } catch {
    /* ignore */
  }
}

export function clearProgressSession() {
  setProgressSession(null, null);
}

export function getProgressToken() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    const exp = localStorage.getItem(EXPIRES_KEY);
    if (!t) return null;
    if (exp && new Date(exp).getTime() < Date.now()) {
      clearProgressSession();
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export async function saveProgressSecure(playerId, progress) {
  const token = getProgressToken();
  if (!token) {
    throw new Error('No progress session — please log in again');
  }
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    'https://ncwlbwzxfpcnxkyrmdck.supabase.co';
  const anon =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
    '';

  const res = await fetch(`${base}/functions/v1/save-progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify({
      player_id: String(playerId),
      progress_token: token,
      progress,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `save-progress failed (${res.status})`);
  }
  return json;
}

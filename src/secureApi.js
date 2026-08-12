/**
 * Hard-security API helpers — Edge Functions with session JWT.
 */
import { getSessionToken, authHeaders, getPlayerId } from './playerIdentity';

function baseUrl() {
  return (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
}

function anonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || '';
}

/**
 * Call a Supabase Edge Function with Bearer session JWT (and apikey).
 */
export async function callSecureFunction(name, body = {}) {
  const base = baseUrl();
  const anon = anonKey();
  if (!base || !anon) throw new Error('Supabase URL/key missing');

  const headers = authHeaders({
    apikey: anon,
  });
  if (!headers.Authorization) {
    headers.Authorization = `Bearer ${anon}`;
  }

  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `${name} failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function fetchPlayerState() {
  if (!getSessionToken()) {
    return { success: false, error: 'no_session', player: null, secure_economy: false };
  }
  try {
    return await callSecureFunction('player-state', {});
  } catch (e) {
    return {
      success: false,
      error: e?.message || String(e),
      player: null,
      secure_economy: false,
    };
  }
}

export function hasSecureSession() {
  return !!getSessionToken() && !!getPlayerId();
}

/** Secure shard shop buy (requires JWT). */
export async function secureShopBuy(itemId) {
  return callSecureFunction('shop-buy', { item_id: itemId });
}

/** Secure mystery gift open (requires JWT). */
export async function secureMysteryOpen(tier) {
  return callSecureFunction('mystery-open', { tier });
}

/** Secure weekly badge claim (requires JWT). */
export async function secureBadgeClaim(weekId) {
  const body = weekId ? { week_id: weekId } : {};
  return callSecureFunction('badge-claim-weekly', body);
}

/** Server-authoritative mining credit (requires JWT). */
export async function secureCommitTaps({ batchId, taps }) {
  return callSecureFunction('commit-taps', {
    batch_id: batchId,
    taps,
  });
}


export async function secureClaimWeeklyQuest(questId, rewardAmount = 100) {
  return callSecureFunction('claim-weekly-quest', {
    quest_id: questId,
    reward_amount: rewardAmount,
  });
}

export async function secureClaimWeeklyPrize() {
  return callSecureFunction('claim-weekly-prize', {});
}

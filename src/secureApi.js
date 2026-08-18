/**
 * Hard-security API helpers — Edge Functions with session JWT.
 */
import { getSessionToken, setSessionToken, isSessionTokenStale, getPlayerId, isLoggedIn } from './playerIdentity';

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

  // Supabase gateway needs Authorization = anon JWT.
  // Game session JWT goes in x-gift-session so commit-taps can credit balances.
  const sessionTok = getSessionToken();
  const headers = {
    'Content-Type': 'application/json',
    apikey: anon,
    Authorization: `Bearer ${anon}`,
  };
  if (sessionTok) {
    headers['x-gift-session'] = sessionTok;
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

/**
 * Silent session keep-alive for close/reopen.
 * - If JWT present (even near/just expired), call auth-refresh → new 90-day token.
 * - No password. No logout. Safe to call on every app open / tab focus.
 * Returns true when hasSecureSession() is usable for commit-taps.
 */
export async function ensureSecureSession() {
  if (!getPlayerId()) return false;
  const tok = getSessionToken();
  if (!tok) {
    // Logged into old client without JWT — cannot silent-mint without password
    return false;
  }
  // Fresh enough → nothing to do
  if (!isSessionTokenStale(60 * 60 * 1000)) {
    return true;
  }
  try {
    const data = await callSecureFunction('auth-refresh', {});
    if (data?.session_token) {
      setSessionToken(data.session_token, data.expires_at);
      return true;
    }
  } catch (e) {
    // Token may still be valid for commit-taps even if refresh failed
    console.warn('auth-refresh', e?.message || e);
    // If not stale past hard expiry, still allow mining with existing token
    if (!isSessionTokenStale(0)) return true;
    return !!getSessionToken() && !isSessionTokenStale(0);
  }
  return hasSecureSession();
}


/**
 * Create in-game Solana wallet — JWT required, server set-once only.
 * Returns { success, publicKey, mnemonic|null, already_bound }.
 * If already_bound, mnemonic is null (cannot re-export seed from server).
 */
export async function secureCreateUserWallet(opts = {}) {
  const body = {};
  if (opts && (opts.force_new || opts.forceNew)) body.force_new = true;
  return callSecureFunction('create-user-wallet', body);
}

/** Mint brand-new in-game wallet (replaces address, keeps stats). Mnemonic once. */
export async function secureRotateInGameWallet() {
  return secureCreateUserWallet({ force_new: true });
}

/**
 * Owner-only vault access (encrypted_vault is NOT readable via anon PostgREST).
 * get → { encrypted_vault|null, has_vault }
 * set_if_empty → store once
 * status → { has_vault, has_password } without secrets
 */
export async function secureWalletVault(action = 'get', payload = {}) {
  return callSecureFunction('wallet-vault', { action, ...payload });
}

export async function secureGetVault() {
  return secureWalletVault('get');
}

export async function secureSetVaultIfEmpty(encryptedVault) {
  return secureWalletVault('set_if_empty', { encrypted_vault: encryptedVault });
}

export async function secureVaultStatus() {
  return secureWalletVault('status');
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


export async function secureBackpackActivate(itemId) {
  return callSecureFunction('backpack-activate', { item_id: itemId });
}

export async function secureWallClimb({ method, txSignature }) {
  return callSecureFunction('wall-climb', {
    method,
    tx_signature: txSignature || null,
  });
}


export async function secureReferralCredit(kind) {
  return callSecureFunction('referral-credit', { kind });
}

export async function secureTaskClaim(taskId) {
  return callSecureFunction('task-claim', { task_id: taskId });
}

export async function securePremiumGrant(itemId, txSignature) {
  return callSecureFunction('premium-grant', {
    item_id: itemId,
    tx_signature: txSignature,
  });
}

/** In-game badge marketplace (list / buy / cancel / browse). */
export async function secureBadgeMarket(action, payload = {}) {
  return callSecureFunction('badge-market', { action, ...payload });
}

export async function secureBadgeMarketBrowse(filters = {}) {
  return secureBadgeMarket('browse', filters);
}

export async function secureBadgeMarketList({ tier, qty, currency, unit_price }) {
  return secureBadgeMarket('list', { tier, qty, currency, unit_price });
}

export async function secureBadgeMarketCancel(listingId) {
  return secureBadgeMarket('cancel', { listing_id: listingId });
}

export async function secureBadgeMarketBuy(listingId, txSignature = null) {
  const body = { listing_id: listingId };
  if (txSignature) body.tx_signature = txSignature;
  return secureBadgeMarket('buy', body);
}

export async function secureBadgeMarketMyListings() {
  return secureBadgeMarket('my_listings', {});
}

/** In-game NFT marketplace (owned GiftLocksmith P2P). */
export async function secureNftMarket(action, payload = {}) {
  return callSecureFunction('nft-market', { action, ...payload });
}


/**
 * Live weekly board (service_role reconcile for ALL players this week).
 * Energy units; heals weekly lagging daily/batches for everyone on each call.
 */
export async function fetchWeeklyBoard(limit = 200) {
  return callSecureFunction('weekly-board', { limit });
}

/** Force reconcile all weekly scores (same logic as weekly-board). */
export async function reconcileWeeklyScores(limit = 500) {
  return callSecureFunction('reconcile-weekly', { limit });
}

/**
 * Equip / unequip a Shard Badge onto a Fate NFT (inventory.fate_equip).
 * @param {{ assetId: string, equip?: boolean }} opts — equip false = unequip
 */
export async function secureFateEquip({ assetId, equip = true }) {
  return callSecureFunction('fate-equip', {
    asset_id: assetId,
    equip: equip !== false,
  });
}

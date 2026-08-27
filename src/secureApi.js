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

  let res;
  try {
    res = await fetch(`${base}/functions/v1/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    });
  } catch (e) {
    const msg = e?.message || String(e);
    // Browser TypeError "Failed to fetch" = network / missing Edge Function / CORS
    throw new Error(
      /failed to fetch|networkerror|load failed/i.test(msg)
        ? `${name} unreachable (network or function not deployed). Try again or redeploy ${name}.`
        : msg,
    );
  }
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

/** Prevent parallel auth-refresh storms from tap + visibility + interval. */
let refreshInFlight = null;

/**
 * Silent session keep-alive for close/reopen / phone tabs left open for days.
 * - If JWT present (even expired within server grace), auth-refresh → new 90-day token.
 * - No password. No logout. Safe on every app open / tab focus / periodic tick.
 * Returns true when hasSecureSession() is usable for commit-taps.
 */
export async function ensureSecureSession() {
  if (!getPlayerId()) return false;
  const tok = getSessionToken();
  if (!tok) {
    // Logged into old client without JWT — cannot silent-mint without password
    return false;
  }
  // Fresh enough (>1h until expiry) → nothing to do
  if (!isSessionTokenStale(60 * 60 * 1000)) {
    return true;
  }
  if (refreshInFlight) {
    try {
      return await refreshInFlight;
    } catch {
      return hasSecureSession() && !isSessionTokenStale(0);
    }
  }
  refreshInFlight = (async () => {
    try {
      const data = await callSecureFunction('auth-refresh', {});
      if (data?.session_token) {
        setSessionToken(data.session_token, data.expires_at);
        return true;
      }
    } catch (e) {
      console.warn('auth-refresh', e?.message || e);
      // Still usable if not past hard expiry
      if (!isSessionTokenStale(0)) return true;
      return false;
    }
    return hasSecureSession() && !isSessionTokenStale(0);
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
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
 * get/status → { has_vault, has_password } — NEVER returns ciphertext (JWT alone cannot drain)
 * unlock     → password required; returns encrypted_vault only after password_hash verify
 * set_if_empty → store once after signup
 */
export async function secureWalletVault(action = 'status', payload = {}) {
  return callSecureFunction('wallet-vault', { action, ...payload });
}

/** Status only — no ciphertext. Prefer secureVaultStatus / secureUnlockVault. */
export async function secureGetVault() {
  return secureWalletVault('status');
}

/**
 * Password-gated unlock — only way to receive encrypted_vault.
 * Call after login (or when signing SOL) with the account password.
 */
export async function secureUnlockVault(password) {
  if (!password || String(password).length < 6) {
    throw new Error('Password required to unlock wallet');
  }
  return secureWalletVault('unlock', { password: String(password) });
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

/**
 * Claim queued Mystery Bonus $G2U → game wallet SPL (captcha required).
 * Opens at token launch when MYSTERY_PAYOUTS_LIVE + vault are ready.
 */
export async function secureMysteryClaimG2u(captchaToken) {
  return callSecureFunction('mystery-claim-g2u', {
    captcha_token: captchaToken || '',
  });
}

/** Secure weekly badge claim (requires JWT). */
export async function secureBadgeClaim(weekId) {
  const body = weekId ? { week_id: weekId } : {};
  return callSecureFunction('badge-claim-weekly', body);
}

/** Auto-grant badges from official weekly snapshot (idempotent). */
export async function secureGrantWeeklyBadges(weekId) {
  return callSecureFunction('grant-weekly-badges', {
    ...(weekId ? { week_id: weekId } : {}),
  });
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

/** Sync / clear GiftLocksmith focus (own = attributes; wall fee waiver L1–5). */
export async function secureLocksmithActivate({
  level = 1,
  assetId = null,
  clear = false,
} = {}) {
  return callSecureFunction('locksmith-activate', {
    level,
    asset_id: assetId,
    clear: !!clear,
  });
}

/** Pay SOL then bump elf NFT level (Backpack → NFT). */
export async function secureElfLevelUp({
  assetId,
  kind,
  rarity,
  txSignature,
}) {
  return callSecureFunction('elf-level-up', {
    asset_id: assetId,
    kind,
    rarity,
    tx_signature: txSignature,
  });
}

/** Pay SOL then bump Star Badge level. */
export async function secureStarLevelUp({ assetId, txSignature }) {
  return callSecureFunction('star-level-up', {
    asset_id: assetId,
    tx_signature: txSignature,
  });
}

/** Refresh on-chain metadata Level trait (ME / wallets). */
export async function secureNftSetLevel({ assetId, level, kind, rarity }) {
  return callSecureFunction('nft-set-level', {
    asset_id: assetId,
    level,
    kind,
    rarity,
  });
}

export async function secureReferralCredit(kind) {
  return callSecureFunction('referral-credit', { kind });
}

export async function secureTaskClaim(taskId) {
  return callSecureFunction('task-claim', { task_id: taskId });
}

/** Rewarded ad → +100 daily tap capacity (server computes cap; client cannot set it). */
export async function secureAdReward() {
  return callSecureFunction('shop-buy', { item_id: 'ad_watch' });
}

export async function securePremiumGrant(itemId, txSignature, opts = {}) {
  const currency = String(opts.currency || (txSignature ? 'sol' : 'g2u')).toLowerCase();
  const body = {
    item_id: itemId,
    currency,
  };
  if (currency === 'sol') {
    body.tx_signature = txSignature;
  }
  return callSecureFunction('premium-grant', body);
}

/** Reload Echo/Fate/Rush/Shadow durability with $G2U (post-launch). */
export async function secureNftDurabilityTopUp({
  kind,
  percent = 1,
  asset_id,
  assetId,
} = {}) {
  const aid = asset_id || assetId;
  return callSecureFunction('nft-durability-topup', {
    kind,
    percent,
    ...(aid ? { asset_id: aid } : {}),
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

/**
 * Airdrop qualified board (L5+): name, level, bonus %.
 * % is absolute from each player's stored NFT snapshot (+ level/taps/etc).
 * Pass viewerNfts (array) while logged in to refresh YOUR snapshot, then all rows
 * use snapshots — so TwrLtr/lats % match on every device.
 */
export async function fetchAirdropBoard({
  limit = 100,
  viewerId = null,
  viewerHasNft = false,
  viewerNfts = null,
  syncNfts = false,
} = {}) {
  const body = { limit };
  if (viewerId) body.viewer_id = String(viewerId);
  if (viewerHasNft) body.viewer_has_nft = true;
  if (Array.isArray(viewerNfts)) {
    body.viewer_nfts = viewerNfts.slice(0, 40);
  }
  if (syncNfts) body.sync_nfts = true;
  return callSecureFunction('airdrop-board', body);
}

/** Force reconcile all weekly scores (same logic as weekly-board). */
export async function reconcileWeeklyScores(limit = 500) {
  return callSecureFunction('reconcile-weekly', { limit });
}

/**
 * Equip / unequip a Shard Badge onto a Fate NFT (inventory.fate_equip).
 * @param {{ assetId: string, equip?: boolean }} opts — equip false = unequip
 */
export async function secureFateEquip({
  assetId,
  equip = true,
  starAssetId,
}) {
  return callSecureFunction('fate-equip', {
    asset_id: assetId,
    equip: !!equip,
    ...(starAssetId ? { star_asset_id: starAssetId } : {}),
  });
}

/**
 * Activate / clear Echo (Power) for tap multiplier.
 * @param {{ rarity: string, level?: number, assetId?: string, clear?: boolean }} opts
 */
export async function secureEchoActivate({ rarity, level = 1, assetId = null, clear = false } = {}) {
  return callSecureFunction('echo-activate', {
    rarity,
    level,
    asset_id: assetId,
    clear: !!clear,
  });
}

/**
 * Activate / clear Fate (Luck) for jackpot rolls.
 * @param {{ rarity: string, level?: number, assetId?: string, clear?: boolean }} opts
 */
export async function secureFateActivate({ rarity, level = 1, assetId = null, clear = false } = {}) {
  return callSecureFunction('fate-activate', {
    rarity,
    level,
    asset_id: assetId,
    clear: !!clear,
  });
}

/**
 * Activate / clear Rush (Energy) for max daily taps.
 * @param {{ rarity: string, level?: number, assetId?: string, clear?: boolean }} opts
 */
export async function secureRushActivate({ rarity, level = 1, assetId = null, clear = false } = {}) {
  return callSecureFunction('rush-activate', {
    rarity,
    level,
    asset_id: assetId,
    clear: !!clear,
  });
}

/**
 * Activate / clear Shadow (Night) for once-per-UTC-day claim yield.
 * @param {{ rarity: string, level?: number, assetId?: string, clear?: boolean }} opts
 */
export async function secureShadowActivate({ rarity, level = 1, assetId = null, clear = false } = {}) {
  return callSecureFunction('shadow-activate', {
    rarity,
    level,
    asset_id: assetId,
    clear: !!clear,
  });
}

/** Claim Shadow daily shards for today (UTC). Requires owned Shadow in wallet. */
export async function secureShadowClaim() {
  return callSecureFunction('shadow-claim', {});
}

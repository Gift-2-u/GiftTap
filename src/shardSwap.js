/**
 * GFTshards → GFT credit swap rules.
 *
 * Free path: Level 10+ OR one-time shard burn license.
 * Locksmith: instant unlock + better fees/caps (NFT ~Wave 1 mint price).
 *
 * Fee model: convert full shards → GFT at rate, then take fee in GFT
 * (user receives net GFT; fee is retained by platform / not credited).
 *
 * Rate is provisional until $GFT launch — set via VITE_SHARDS_PER_GFT or default.
 */

/** Provisional until token launch (override with VITE_SHARDS_PER_GFT). */
const DEFAULT_SHARDS_PER_GFT = 1000;

function resolveShardsPerGft() {
  const fromEnv = Number(
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SHARDS_PER_GFT,
  );
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_SHARDS_PER_GFT;
}

export const SHARD_SWAP_CONFIG = {
  /**
   * Base conversion: shards needed for 1 GFT (before fee).
   * Placeholder until official launch rate is set.
   */
  get shardsPerGft() {
    return resolveShardsPerGft();
  },

  /** Rate is not final until $GFT launch */
  rateProvisional: true,

  free: {
    feeBps: 1000, // 10% of GFT out
    minShards: 5000,
    /** Higher caps — shards are cheap in UX terms */
    dailyCapShards: 150_000,
  },
  locksmith: {
    feeBps: 400, // 4% of GFT out
    minShards: 500,
    /** Paid ~0.25 SOL; allow meaningful daily volume */
    dailyCapShards: 1_000_000,
  },

  /**
   * Free unlock = Level 10+ AND one-time GFTshard license burn.
   * (Both required — not either/or.) GiftLocksmith skips this entirely.
   */
  freeUnlockMinLevel: 10,
  freeUnlockBurnShards: 25_000,
};

function todayUtc() {
  return new Date().toISOString().split('T')[0];
}

/**
 * @param {object} p
 * @param {number} p.currentLevel
 * @param {number} p.maxUnlockedLevel
 * @param {object} p.inventory
 * @param {boolean} p.hasLocksmithNft
 */
export function getSwapAccess({
  currentLevel = 0,
  maxUnlockedLevel = 4,
  inventory = {},
  hasLocksmithNft = false,
}) {
  const inv = inventory || {};
  const levelOk = Number(currentLevel) >= SHARD_SWAP_CONFIG.freeUnlockMinLevel;
  const licensePaid = !!(inv.swap_unlocked || inv.swap_unlock_burned);
  const freeUnlocked = levelOk && licensePaid;

  if (hasLocksmithNft) {
    return {
      allowed: true,
      tier: 'locksmith',
      label: 'GiftLocksmith',
      reason: null,
      ...SHARD_SWAP_CONFIG.locksmith,
    };
  }

  if (freeUnlocked) {
    return {
      allowed: true,
      tier: 'free',
      label: 'Free',
      reason: null,
      ...SHARD_SWAP_CONFIG.free,
    };
  }

  const missing = [];
  if (!levelOk) {
    missing.push(`reach Level ${SHARD_SWAP_CONFIG.freeUnlockMinLevel}`);
  }
  if (!licensePaid) {
    missing.push(
      `pay the free license (${SHARD_SWAP_CONFIG.freeUnlockBurnShards.toLocaleString()} GFTshards once)`,
    );
  }

  return {
    allowed: false,
    tier: 'locked',
    label: 'Locked',
    levelOk,
    licensePaid,
    reason:
      `Free Shard Swap needs Level ${SHARD_SWAP_CONFIG.freeUnlockMinLevel}+ AND ` +
      `${SHARD_SWAP_CONFIG.freeUnlockBurnShards.toLocaleString()} GFTshards (license). ` +
      `Still needed: ${missing.join(' + ')}. ` +
      `GiftLocksmith NFT unlocks instantly with lower fees and a higher daily cap.`,
    feeBps: SHARD_SWAP_CONFIG.free.feeBps,
    minShards: SHARD_SWAP_CONFIG.free.minShards,
    dailyCapShards: SHARD_SWAP_CONFIG.free.dailyCapShards,
  };
}

export function getDailySwapUsed(inventory = {}) {
  const inv = inventory || {};
  if (inv.swap_daily_date !== todayUtc()) return 0;
  return Number(inv.swap_daily_used) || 0;
}

/**
 * Quote: swap all input shards → GFT, then take fee in GFT.
 *
 * gftGross = shards / rate
 * feeGft   = gftGross * feeBps / 10000
 * gftOut   = gftGross - feeGft  (user credit)
 *
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   gftGross?: number,
 *   gftOut?: number,
 *   feeGft?: number,
 *   feeShardsEquiv?: number,
 *   feeBps?: number,
 *   rate?: number,
 * }}
 */
export function quoteShardSwap(amountShards, access, inventory = {}) {
  const amt = Number(amountShards);
  const rate = resolveShardsPerGft();

  if (!access?.allowed) {
    return { ok: false, error: access?.reason || 'Swap locked' };
  }
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: 'Enter an amount' };
  }
  if (amt < access.minShards) {
    return {
      ok: false,
      error: `Minimum ${access.minShards.toLocaleString()} GFTshards (${access.label})`,
    };
  }

  const used = getDailySwapUsed(inventory);
  const remaining = access.dailyCapShards - used;
  if (remaining <= 0) {
    return {
      ok: false,
      error: `Daily swap cap reached (${access.dailyCapShards.toLocaleString()} shards). Resets UTC midnight.`,
    };
  }
  if (amt > remaining) {
    return {
      ok: false,
      error: `Only ${remaining.toLocaleString()} shards left on today's cap`,
    };
  }

  // Full conversion first, fee in GFT
  const gftGross = amt / rate;
  const feeGft = Math.round(gftGross * (access.feeBps / 10000) * 1e6) / 1e6;
  const gftOut = Math.round((gftGross - feeGft) * 1e6) / 1e6;
  const feeShardsEquiv = Math.round(feeGft * rate);

  if (gftOut <= 0) {
    return { ok: false, error: 'Amount too small after fee' };
  }

  return {
    ok: true,
    gftGross: Math.round(gftGross * 1e6) / 1e6,
    gftOut,
    feeGft,
    feeShardsEquiv,
    feeBps: access.feeBps,
    rate,
  };
}

export function inventoryAfterSwap(inventory = {}, shardsSwapped, feeGft = 0) {
  const inv = { ...(inventory || {}) };
  const day = todayUtc();
  if (inv.swap_daily_date !== day) {
    inv.swap_daily_date = day;
    inv.swap_daily_used = 0;
  }
  inv.swap_daily_used = (Number(inv.swap_daily_used) || 0) + Number(shardsSwapped);
  inv.swap_unlocked = true;
  // Accumulate platform fees (GFT) for ops / later treasury settlement
  inv.platform_gft_fees =
    Math.round(((Number(inv.platform_gft_fees) || 0) + Number(feeGft)) * 1e6) / 1e6;
  return inv;
}

export function inventoryAfterUnlockBurn(inventory = {}) {
  return {
    ...(inventory || {}),
    swap_unlocked: true,
    swap_unlock_burned: true,
  };
}

/**
 * G2Ushards → G2U credit swap rules.
 *
 * Free path: Swap Access Card in inventory.
 *  - First unlock: Level 5+ AND burn shards (in-game purchase only).
 *  - After unlock / transfer: access stays granted (no level requirement).
 *  - durability 0–100% (drains by swap volume)
 *  - card level 1–10 (higher = more shards per % drain)
 *  - level-up with G2U; planned mint at Lv5+ for marketplace resale
 *  - daily shard cap
 *
 * GiftLocksmith: permanent, no durability, better fees/caps.
 */

const DEFAULT_SHARDS_PER_G2U = 1000;

function resolveShardsPerGft() {
  const fromEnv = Number(
    typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_SHARDS_PER_G2U || import.meta.env?.VITE_SHARDS_PER_GFT),
  );
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_SHARDS_PER_G2U;
}

export const SHARD_SWAP_CONFIG = {
  get shardsPerGft() {
    return resolveShardsPerGft();
  },

  rateProvisional: true,

  free: {
    feeBps: 1000, // 10%
    minShards: 5000,
    dailyCapShards: 50_000,
  },
  locksmith: {
    feeBps: 400, // 4%
    minShards: 500,
    dailyCapShards: 1_000_000,
  },

  freeUnlockMinLevel: 5,
  freeUnlockBurnShards: 25_000,
  /** Planned free Access Card series size (edition "n of TOTAL") */
  freeAccessCardEditionTotal: 20_000,
  /** Planned minimum card level before on-chain mint is allowed */
  freeAccessCardMintMinLevel: 5,

  /** Durability % (0–100) */
  durabilityMaxPercent: 100,
  /**
   * At badge level 1: this many shards swapped = 100% drain.
   * At level L: volume budget = this * L (higher level lasts longer).
   */
  durabilityFullVolumeShards: 200_000,

  /** 1 G2U → +this many durability % points */
  durabilityPercentPerGft: 2,
  durabilityTopUpMinGft: 1,

  /** Badge power level (not player character level) */
  badgeMaxLevel: 10,
  /** G2U to go from level L → L+1 = L * badgeLevelUpGftPerStep */
  badgeLevelUpGftPerStep: 10,
};

function todayUtc() {
  return new Date().toISOString().split('T')[0];
}

function round6(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

export function hasSwapLicense(inventory = {}) {
  const inv = inventory || {};
  return !!(inv.swap_unlocked || inv.swap_unlock_burned);
}

/** Badge power level 0 = none, 1–10 if owned */
export function getSwapBadgeLevel(inventory = {}) {
  const inv = inventory || {};
  if (!hasSwapLicense(inv)) return 0;
  const l = Number(inv.swap_badge_level);
  if (!Number.isFinite(l) || l < 1) return 1; // legacy license = level 1
  return Math.min(SHARD_SWAP_CONFIG.badgeMaxLevel, Math.floor(l));
}

/** Full volume (shards) covered by 100% durability at this badge level */
export function durabilityFullVolumeForLevel(badgeLevel) {
  const lvl = Math.max(1, Number(badgeLevel) || 1);
  return SHARD_SWAP_CONFIG.durabilityFullVolumeShards * lvl;
}

/** G2U cost to upgrade from current badge level → next */
export function badgeLevelUpCostGft(currentBadgeLevel) {
  const lvl = Math.max(1, Number(currentBadgeLevel) || 1);
  if (lvl >= SHARD_SWAP_CONFIG.badgeMaxLevel) return null;
  return lvl * SHARD_SWAP_CONFIG.badgeLevelUpGftPerStep;
}

export function getSwapDurability(inventory = {}) {
  const inv = inventory || {};
  if (!hasSwapLicense(inv)) return 0;
  if (inv.swap_durability === undefined || inv.swap_durability === null) {
    return SHARD_SWAP_CONFIG.durabilityMaxPercent;
  }
  const d = Number(inv.swap_durability);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, Math.min(SHARD_SWAP_CONFIG.durabilityMaxPercent, d));
}

export function durabilityRemainingShards(inventory = {}) {
  const pct = getSwapDurability(inventory);
  const full = durabilityFullVolumeForLevel(getSwapBadgeLevel(inventory));
  return Math.floor((pct / SHARD_SWAP_CONFIG.durabilityMaxPercent) * full);
}

/** Durability % drained by swapping this many shards (uses badge level). */
export function durabilityDrainPercent(shardsSwapped, inventory = {}) {
  const full = durabilityFullVolumeForLevel(getSwapBadgeLevel(inventory));
  if (!full || !Number.isFinite(shardsSwapped) || shardsSwapped <= 0) return 0;
  return round6((Number(shardsSwapped) / full) * SHARD_SWAP_CONFIG.durabilityMaxPercent);
}

export function getSwapAccess({
  currentLevel = 0,
  maxUnlockedLevel = 4,
  inventory = {},
  hasLocksmithNft = false,
}) {
  const inv = inventory || {};
  const levelOk = Number(currentLevel) >= SHARD_SWAP_CONFIG.freeUnlockMinLevel;
  const licensePaid = hasSwapLicense(inv);
  const durability = getSwapDurability(inv);
  const badgeLevel = getSwapBadgeLevel(inv);

  if (hasLocksmithNft) {
    return {
      allowed: true,
      tier: 'locksmith',
      label: 'GiftLocksmith',
      reason: null,
      durability: null,
      durabilityRemainingShards: null,
      badgeLevel: null,
      ...SHARD_SWAP_CONFIG.locksmith,
    };
  }

  // Once the Access Card is owned, access is permanent (no Level 5 check).
  // Level 5 is only required to *buy* the first unlock in-game.
  if (licensePaid && durability > 0) {
    return {
      allowed: true,
      tier: 'free',
      label: `Access Card · Lv${badgeLevel}`,
      reason: null,
      durability,
      durabilityRemainingShards: durabilityRemainingShards(inv),
      badgeLevel,
      ...SHARD_SWAP_CONFIG.free,
    };
  }

  if (licensePaid && durability <= 0) {
    return {
      allowed: false,
      tier: 'empty',
      label: `Access Card · Lv${badgeLevel} (0% durability)`,
      levelOk,
      licensePaid: true,
      durability: 0,
      durabilityRemainingShards: 0,
      badgeLevel,
      reason:
        'Access Card durability is 0%. Level up for a longer charge, wait for mint/top-up tools, or use GiftLocksmith for permanent access.',
      feeBps: SHARD_SWAP_CONFIG.free.feeBps,
      minShards: SHARD_SWAP_CONFIG.free.minShards,
      dailyCapShards: SHARD_SWAP_CONFIG.free.dailyCapShards,
    };
  }

  const missing = [];
  if (!levelOk) {
    missing.push(`reach Level ${SHARD_SWAP_CONFIG.freeUnlockMinLevel}`);
  }
  if (!licensePaid) {
    missing.push(
      `get Access Card (${SHARD_SWAP_CONFIG.freeUnlockBurnShards.toLocaleString()} G2Ushards)`,
    );
  }

  return {
    allowed: false,
    tier: 'locked',
    label: 'Access Card locked',
    levelOk,
    licensePaid,
    durability: 0,
    durabilityRemainingShards: 0,
    badgeLevel: 0,
    reason:
      `First unlock needs Level ${SHARD_SWAP_CONFIG.freeUnlockMinLevel}+ AND ` +
      `${SHARD_SWAP_CONFIG.freeUnlockBurnShards.toLocaleString()} G2Ushards. ` +
      `Still needed: ${missing.join(' + ')}. ` +
      `After unlock, access stays granted (even below L5 — e.g. if bought from another player later).`,
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
      error: `Minimum ${access.minShards.toLocaleString()} G2Ushards (${access.label})`,
    };
  }

  const used = getDailySwapUsed(inventory);
  const remainingDaily = access.dailyCapShards - used;
  if (remainingDaily <= 0) {
    return {
      ok: false,
      error: `Daily swap cap reached (${access.dailyCapShards.toLocaleString()} shards). Resets UTC midnight.`,
    };
  }
  if (amt > remainingDaily) {
    return {
      ok: false,
      error: `Only ${remainingDaily.toLocaleString()} shards left on today's cap`,
    };
  }

  if (access.tier === 'free') {
    const remVol = durabilityRemainingShards(inventory);
    if (remVol <= 0) {
      return { ok: false, error: 'Swap Badge at 0% — top up with G2U' };
    }
    if (amt > remVol) {
      return {
        ok: false,
        error: `Badge charge only covers ${remVol.toLocaleString()} more shards (${getSwapDurability(inventory).toFixed(1)}% · Lv${getSwapBadgeLevel(inventory)})`,
      };
    }
  }

  const gftGross = amt / rate;
  const feeGft = round6(gftGross * (access.feeBps / 10000));
  const gftOut = round6(gftGross - feeGft);
  const feeShardsEquiv = Math.round(feeGft * rate);
  const drainPct =
    access.tier === 'free' ? durabilityDrainPercent(amt, inventory) : 0;

  if (gftOut <= 0) {
    return { ok: false, error: 'Amount too small after fee' };
  }

  return {
    ok: true,
    gftGross: round6(gftGross),
    gftOut,
    feeGft,
    feeShardsEquiv,
    feeBps: access.feeBps,
    rate,
    drainPct,
    durabilityAfter:
      access.tier === 'free'
        ? Math.max(0, round6(getSwapDurability(inventory) - drainPct))
        : null,
  };
}

export function inventoryAfterSwap(
  inventory = {},
  shardsSwapped,
  feeGft = 0,
  { isFreeTier = false } = {},
) {
  const inv = { ...(inventory || {}) };
  const day = todayUtc();
  if (inv.swap_daily_date !== day) {
    inv.swap_daily_date = day;
    inv.swap_daily_used = 0;
  }
  inv.swap_daily_used = (Number(inv.swap_daily_used) || 0) + Number(shardsSwapped);
  inv.swap_unlocked = true;
  if (!inv.swap_badge_level) inv.swap_badge_level = 1;
  inv.platform_gft_fees = round6((Number(inv.platform_gft_fees) || 0) + Number(feeGft));

  if (isFreeTier) {
    const before = getSwapDurability(inv);
    const drain = durabilityDrainPercent(shardsSwapped, inv);
    inv.swap_durability = Math.max(0, round6(before - drain));
  }

  return inv;
}

export function inventoryAfterUnlockBurn(inventory = {}) {
  return {
    ...(inventory || {}),
    swap_unlocked: true,
    swap_unlock_burned: true,
    swap_durability: SHARD_SWAP_CONFIG.durabilityMaxPercent,
    swap_badge_level: 1,
  };
}

export function inventoryAfterDurabilityTopUp(inventory = {}, gftAmount) {
  const g2u = Number(gftAmount);
  if (!Number.isFinite(g2u) || g2u < SHARD_SWAP_CONFIG.durabilityTopUpMinGft) {
    return {
      error: `Min top-up is ${SHARD_SWAP_CONFIG.durabilityTopUpMinGft} G2U`,
    };
  }
  if (!hasSwapLicense(inventory)) {
    return { error: 'Get the free Swap Badge first (Level 5+ + shards).' };
  }
  const before = getSwapDurability(inventory);
  if (before >= SHARD_SWAP_CONFIG.durabilityMaxPercent) {
    return { error: 'Badge already at 100% charge.' };
  }
  const added = round6(g2u * SHARD_SWAP_CONFIG.durabilityPercentPerGft);
  const after = Math.min(
    SHARD_SWAP_CONFIG.durabilityMaxPercent,
    round6(before + added),
  );
  const actualAdded = round6(after - before);
  const gftSpent =
    SHARD_SWAP_CONFIG.durabilityPercentPerGft > 0
      ? round6(actualAdded / SHARD_SWAP_CONFIG.durabilityPercentPerGft)
      : g2u;

  return {
    inventory: {
      ...(inventory || {}),
      swap_unlocked: true,
      swap_badge_level: getSwapBadgeLevel(inventory) || 1,
      swap_durability: after,
    },
    durabilityAdded: actualAdded,
    gftSpent,
    newDurability: after,
  };
}

/**
 * Spend G2U to raise Swap Badge level (more volume per durability %).
 */
export function inventoryAfterBadgeLevelUp(inventory = {}) {
  if (!hasSwapLicense(inventory)) {
    return { error: 'Get the free Swap Badge first.' };
  }
  const level = getSwapBadgeLevel(inventory);
  const cost = badgeLevelUpCostGft(level);
  if (cost == null) {
    return { error: `Swap Badge already max level (${SHARD_SWAP_CONFIG.badgeMaxLevel}).` };
  }
  return {
    inventory: {
      ...(inventory || {}),
      swap_unlocked: true,
      swap_badge_level: level + 1,
      swap_durability:
        invDurabilityOrFull(inventory),
    },
    gftCost: cost,
    newLevel: level + 1,
    previousLevel: level,
    fullVolumeAfter: durabilityFullVolumeForLevel(level + 1),
  };
}

function invDurabilityOrFull(inventory) {
  if (inventory?.swap_durability === undefined || inventory?.swap_durability === null) {
    return SHARD_SWAP_CONFIG.durabilityMaxPercent;
  }
  return getSwapDurability(inventory);
}

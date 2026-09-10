/**
 * Personal milestone airdrop — level XP bands + lifetime tap bonuses.
 * Level: 250 $G2U per 1,000 shards of the level goal (e.g. 10k → 2.5k).
 * Lifetime bonuses (extra): 50k / 100k / … — stacked into same vault claim.
 * No wall. No daily_shards. No backfill from before feature seed.
 */

export const MILESTONE_G2U_PER_1000_SHARDS = 250;

/** Extra $G2U at lifetime tap thresholds (on top of per-level rewards). */
export const LIFETIME_G2U_MILESTONES = [
  { taps: 50000, g2u: 2500, label: '50K lifetime' },
  { taps: 100000, g2u: 2500, label: '100K lifetime' },
  { taps: 150000, g2u: 5000, label: '150K lifetime' },
  { taps: 200000, g2u: 10000, label: '200K lifetime' },
  { taps: 300000, g2u: 15000, label: '300K lifetime' },
  { taps: 400000, g2u: 20000, label: '400K lifetime' },
  { taps: 500000, g2u: 25000, label: '500K lifetime' },
  { taps: 600000, g2u: 30000, label: '600K lifetime' },
  { taps: 700000, g2u: 35000, label: '700K lifetime' },
  { taps: 800000, g2u: 40000, label: '800K lifetime' },
  { taps: 900000, g2u: 50000, label: '900K lifetime' },
  { taps: 1000000, g2u: 65000, label: '1M lifetime' },
  { taps: 1250000, g2u: 80000, label: '1.25M lifetime' },
  { taps: 1500000, g2u: 95000, label: '1.5M lifetime' },
  { taps: 1750000, g2u: 110000, label: '1.75M lifetime' },
  { taps: 2000000, g2u: 125000, label: '2M lifetime' },
];

/** XP needed to go from `level` → level+1 (mirrors calculateLevel bands). */
export function xpForLevel(level) {
  const L = Math.max(0, Math.floor(Number(level) || 0));
  if (L < 5) return 10000;
  if (L < 10) return 15000;
  if (L < 20) return 50000;
  if (L < 30) return 150000;
  if (L < 50) return 350000;
  if (L < 75) return 1000000;
  if (L < 100) return 3000000;
  return 0;
}

/** $G2U for completing one level (reaching level+1). */
export function g2uForLevel(level) {
  const xp = xpForLevel(level);
  if (xp <= 0) return 0;
  return Math.floor(xp / 1000) * MILESTONE_G2U_PER_1000_SHARDS;
}

/** Level from lifetime taps only (ignore wall). Same math as GiftTap.calculateLevel. */
export function milestoneLevelFromTaps(taps) {
  const t = Math.max(0, Number(taps) || 0);
  if (t < 50000) return Math.floor(t / 10000);
  if (t < 125000) return 5 + Math.floor((t - 50000) / 15000);
  if (t < 625000) return 10 + Math.floor((t - 125000) / 50000);
  if (t < 2125000) return 20 + Math.floor((t - 625000) / 150000);
  if (t < 9125000) return 30 + Math.floor((t - 2125000) / 350000);
  if (t < 34125000) return 50 + Math.floor((t - 9125000) / 1000000);
  if (t < 109125000) return 75 + Math.floor((t - 34125000) / 3000000);
  return 100;
}

/** Lifetime taps required to *reach* a given level. */
export function tapsToReachLevel(level) {
  const L = Math.max(0, Math.floor(Number(level) || 0));
  if (L <= 0) return 0;
  if (L <= 5) return L * 10000;
  if (L <= 10) return 50000 + (L - 5) * 15000;
  if (L <= 20) return 125000 + (L - 10) * 50000;
  if (L <= 30) return 625000 + (L - 20) * 150000;
  if (L <= 50) return 2125000 + (L - 30) * 350000;
  if (L <= 75) return 9125000 + (L - 50) * 1000000;
  if (L <= 100) return 34125000 + (L - 75) * 3000000;
  return 109125000;
}

/**
 * Highest level already "cleared" for milestone claims.
 * If never seeded, use current level from taps (no L0 backfill for existing players).
 */
export function getClaimedMilestoneLevel(inventory, lifetimeTaps = 0) {
  if (
    inventory == null ||
    inventory.personal_milestone_claimed_level == null ||
    inventory.personal_milestone_claimed_level === ''
  ) {
    return milestoneLevelFromTaps(lifetimeTaps);
  }
  return Math.max(
    0,
    Math.floor(Number(inventory.personal_milestone_claimed_level) || 0),
  );
}

/** True when inventory still needs a one-time seed write. */
export function needsMilestoneSeed(inventory) {
  return (
    inventory == null ||
    inventory.personal_milestone_claimed_level == null ||
    inventory.personal_milestone_claimed_level === ''
  );
}

/**
 * Next claim: reward for completing claimedLevel → claimedLevel+1.
 * Claim stays off until lifetime taps reach that next level.
 */
export function nextMilestoneClaim(lifetimeTaps, inventory) {
  const claimed = getClaimedMilestoneLevel(inventory, lifetimeTaps);
  if (claimed >= 100) {
    return {
      claimedLevel: claimed,
      nextLevel: 100,
      xp: 0,
      amount: 0,
      tapsNeeded: tapsToReachLevel(100),
      reached: true,
      canClaim: false,
      needsSeed: needsMilestoneSeed(inventory),
    };
  }
  const nextLevel = claimed + 1;
  const tapsNeeded = tapsToReachLevel(nextLevel);
  const reached = Math.max(0, Number(lifetimeTaps) || 0) >= tapsNeeded;
  const xp = xpForLevel(claimed);
  const amount = g2uForLevel(claimed);
  return {
    claimedLevel: claimed,
    nextLevel,
    xp,
    amount,
    tapsNeeded,
    reached,
    canClaim: reached && amount > 0,
    needsSeed: needsMilestoneSeed(inventory),
  };
}

/** G2U progress for the next level milestone. */
export function milestoneG2uProgress(lifetimeTaps, inventory) {
  const info = nextMilestoneClaim(lifetimeTaps, inventory);
  const taps = Math.max(0, Number(lifetimeTaps) || 0);
  const start = tapsToReachLevel(info.claimedLevel);
  const into = Math.max(0, Math.min(info.xp || 0, taps - start));
  const accrued =
    Math.floor(into / 1000) * MILESTONE_G2U_PER_1000_SHARDS;
  return {
    ...info,
    into,
    accrued: Math.min(info.amount, Math.max(0, accrued)),
  };
}

export function getClaimedLifetimeMilestones(inventory, lifetimeTaps = 0) {
  const raw = inventory?.personal_lifetime_milestones_claimed;
  if (raw == null) {
    // Seed: all thresholds already reached count as claimed (no backfill pay)
    const taps = Math.max(0, Number(lifetimeTaps) || 0);
    return LIFETIME_G2U_MILESTONES.filter((m) => taps >= m.taps).map((m) => m.taps);
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => Math.floor(Number(n) || 0)).filter((n) => n > 0);
}

export function needsLifetimeMilestoneSeed(inventory) {
  return (
    inventory == null || inventory.personal_lifetime_milestones_claimed == null
  );
}

/** Rows for Milestone popup — level next + all lifetime bonuses. */
export function listAllMilestones(lifetimeTaps, inventory) {
  const taps = Math.max(0, Number(lifetimeTaps) || 0);
  const level = milestoneG2uProgress(taps, inventory);
  const claimedLife = new Set(getClaimedLifetimeMilestones(inventory, taps));

  const levelRow = {
    id: `level_${level.nextLevel}`,
    kind: 'level',
    label: `Level ${level.nextLevel}`,
    detail: `${level.xp.toLocaleString()} shards · ${level.amount.toLocaleString()} $G2U`,
    need: level.tapsNeeded,
    g2u: level.amount,
    progress: Math.min(1, taps / (level.tapsNeeded || 1)),
    status: level.canClaim
      ? 'ready'
      : level.amount <= 0
        ? 'done'
        : 'progress',
  };

  const lifeRows = LIFETIME_G2U_MILESTONES.map((m) => {
    const claimed = claimedLife.has(m.taps);
    const reached = taps >= m.taps;
    return {
      id: `life_${m.taps}`,
      kind: 'lifetime',
      label: m.label,
      detail: `${m.taps.toLocaleString()} lifetime · ${m.g2u.toLocaleString()} $G2U`,
      need: m.taps,
      g2u: m.g2u,
      progress: Math.min(1, taps / m.taps),
      status: claimed ? 'claimed' : reached ? 'ready' : 'progress',
    };
  });

  return { levelRow, lifeRows, taps };
}

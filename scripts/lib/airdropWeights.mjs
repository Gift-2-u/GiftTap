/**
 * Snapshot math for scripts ONLY (L5 + weekly + monthly helpers).
 * No imports from src/ — never pull weeklyQuestLogic / GiftTap.
 *
 * L5: keep in sync with airdropScore / airdrop board %.
 * Weekly: top 100 D/G/S/B pots; rank 101+ bronze badge only (0 G2U).
 */

export const L5_MAX_UNLOCKED = 9;
export const L10_MAX_UNLOCKED = 19;

export const AIRDROP_BONUSES = {
  level10: 10,
  level15: 15,
  taps100k: 10,
  taps250k: 15,
  streak14: 5,
  streak30: 10,
  iap: 5,
  nftLocksmith: 25,
  nftCommon: 5,
  nftRare: 10,
  nftEpic: 20,
  nftLegendary: 30,
  friends1k: 5,
  friendsL5: 10,
};

function estimateLevelFromTaps(taps) {
  const t = Number(taps) || 0;
  if (t < 50000) return Math.floor(t / 10000);
  if (t < 125000) return 5 + Math.floor((t - 50000) / 15000);
  if (t < 375000) return 10 + Math.floor((t - 125000) / 25000);
  if (t < 875000) return 20 + Math.floor((t - 375000) / 50000);
  if (t < 2875000) return 30 + Math.floor((t - 875000) / 100000);
  return 50;
}

function nftBonusFromSnap(inv) {
  const snap = inv?.airdrop_nft;
  if (!snap || typeof snap !== 'object') return 0;
  const b = Number(snap.bonus);
  if (Number.isFinite(b) && b > 0) return Math.floor(b);
  const nfts = Array.isArray(snap.nfts) ? snap.nfts : [];
  let locksmith = false;
  let extra = 0;
  for (const n of nfts) {
    const kind = String(n?.kind || n?.name || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    const rarity = String(n?.rarity || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    if (kind.includes('locksmith')) {
      locksmith = true;
      continue;
    }
    if (['fate', 'echo', 'rush', 'shadow', 'elf'].some((k) => kind.includes(k))) {
      if (rarity.startsWith('legend')) extra += AIRDROP_BONUSES.nftLegendary;
      else if (rarity.startsWith('epic')) extra += AIRDROP_BONUSES.nftEpic;
      else if (rarity.startsWith('rare')) extra += AIRDROP_BONUSES.nftRare;
      else extra += AIRDROP_BONUSES.nftCommon;
    }
  }
  return (locksmith ? AIRDROP_BONUSES.nftLocksmith : 0) + extra;
}

/** Total bonus weight for L5 pool split (0 if not qualified). */
export function l5Weight(row, friends1k = 0, friendsL5 = 0) {
  const maxU = Number(row.max_unlocked_level) || 0;
  if (maxU < L5_MAX_UNLOCKED) return 0;
  const lifetimeTaps = Number(row.lifetime_taps) || 0;
  const streak = Number(row.current_streak) || 0;
  const hasIap =
    !!row.has_made_purchase ||
    (Array.isArray(row.completed_tasks) &&
      row.completed_tasks.includes('first_purchase'));

  let level = estimateLevelFromTaps(lifetimeTaps);
  level = Math.min(level, maxU || level);

  let levelBonus = 0;
  if (maxU >= L10_MAX_UNLOCKED && level >= 15) levelBonus = AIRDROP_BONUSES.level15;
  else if (maxU >= L10_MAX_UNLOCKED && level >= 10) levelBonus = AIRDROP_BONUSES.level10;

  let tapsBonus = 0;
  if (lifetimeTaps >= 250000) tapsBonus = AIRDROP_BONUSES.taps250k;
  else if (lifetimeTaps >= 100000) tapsBonus = AIRDROP_BONUSES.taps100k;

  let streakBonus = 0;
  if (streak >= 30) streakBonus = AIRDROP_BONUSES.streak30;
  else if (streak >= 14) streakBonus = AIRDROP_BONUSES.streak14;

  const iapBonus = hasIap ? AIRDROP_BONUSES.iap : 0;
  const nftBonus = nftBonusFromSnap(row.inventory);
  const f1 = friends1k >= 3 ? AIRDROP_BONUSES.friends1k : 0;
  const f5 = friendsL5 >= 3 ? AIRDROP_BONUSES.friendsL5 : 0;

  // Board bonus % only (same as airdrop-board). L5 with 0 extras → 0%.
  return levelBonus + tapsBonus + streakBonus + iapBonus + nftBonus + f1 + f5;
}

/**
 * L5 airdrop payout: baseG2u × (1 + bonusPct/100).
 * Example: base 500_000, bonus 30 → 650_000.
 */
export function l5AmountFromBonus(baseG2u, bonusPct) {
  const base = Math.max(0, Number(baseG2u) || 0);
  const pct = Math.max(0, Number(bonusPct) || 0);
  return Math.round(base * (1 + pct / 100) * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// Weekly $G2U (same rules as game board + SQL weekly_badge_tier_for_rank)
// ---------------------------------------------------------------------------

export const WEEKLY_G2U_TOP_N = 100;
export const WEEKLY_PERCENT_FROM_WEEK = '2026-W35';
/** End-of-week badge floor = 15% × 1000 × 7 */
export const WEEKLY_BADGE_FLOOR_END = 1050;
export const WEEKLY_DAILY_REFERENCE = 1000;
export const WEEKLY_FLOOR_PCT = 0.15;

/** ISO weekday UTC: Monday=1 … Sunday=7 */
export function utcIsoWeekDayNumber(d = new Date()) {
  return d.getUTCDay() || 7;
}

/** Live main-board floor (same as Gift Tap Ranks → Weekly). */
export function weeklyBoardFloorLive(dayOfWeek = utcIsoWeekDayNumber()) {
  const day = Math.max(1, Math.min(7, Math.floor(Number(dayOfWeek) || 1)));
  return Math.floor(WEEKLY_DAILY_REFERENCE * WEEKLY_FLOOR_PCT * day);
}

export function weekUsesPercentBadges(weekId) {
  const w = String(weekId || '');
  if (!/^\d{4}-W\d{2}$/.test(w)) return false;
  return w >= WEEKLY_PERCENT_FROM_WEEK;
}

export function weeklyPaidTierCounts(paidN) {
  const n = Math.max(0, Math.floor(Number(paidN) || 0));
  if (n < 1) return { diamond: 0, gold: 0, silver: 0, bronze: 0 };

  let diamond = Math.max(n >= 1 ? 1 : 0, Math.round(n * 0.1));
  let gold = Math.max(n >= 2 ? 1 : 0, Math.round(n * 0.15));
  let silver = Math.max(n >= 3 ? 1 : 0, Math.round(n * 0.25));

  let over = diamond + gold + silver - n;
  if (over > 0) {
    const cut = (v) => {
      const take = Math.min(v, over);
      over -= take;
      return v - take;
    };
    silver = cut(silver);
    gold = cut(gold);
    diamond = cut(diamond);
  }

  return {
    diamond,
    gold,
    silver,
    bronze: Math.max(0, n - diamond - gold - silver),
  };
}

export function weeklyBadgeTierForRank(rank, totalEligible, weekId) {
  const r = Math.floor(Number(rank) || 0);
  const n = Math.max(0, Math.floor(Number(totalEligible) || 0));
  if (r < 1) return null;

  if (!weekUsesPercentBadges(weekId)) {
    if (n >= 1 && r > n) return null;
    if (r === 1) return 'diamond';
    if (r === 2) return 'gold';
    if (r === 3) return 'silver';
    if (r >= 4 && r <= 10) return 'bronze';
    return null;
  }

  if (n < 1 || r > n) return null;
  if (r > WEEKLY_G2U_TOP_N) return 'bronze';

  const paidN = Math.min(WEEKLY_G2U_TOP_N, n);
  const { diamond, gold, silver } = weeklyPaidTierCounts(paidN);
  if (r <= diamond) return 'diamond';
  if (r <= diamond + gold) return 'gold';
  if (r <= diamond + gold + silver) return 'silver';
  return 'bronze';
}

function round6(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

/**
 * Top 100 only get G2U: pool/4 per tier, equal split within tier.
 * Rank 101+ eligible → no row (Bronze badge via week SQL snapshot only).
 */
export function weeklyG2uAllocationsFromEligible(sortedEligible, poolAmt, weekId) {
  const list = Array.isArray(sortedEligible) ? sortedEligible : [];
  const n = list.length;
  const pool = Math.max(0, Number(poolAmt) || 0);
  if (n < 1 || pool <= 0) return [];

  const pot = round6(pool / 4);
  const byTier = { diamond: [], gold: [], silver: [], bronze: [] };

  for (let i = 0; i < n; i++) {
    const rank = i + 1;
    if (rank > WEEKLY_G2U_TOP_N) break;
    const tier = weeklyBadgeTierForRank(rank, n, weekId);
    if (!tier || !byTier[tier]) {
      throw new Error(
        `weeklyG2uAllocations: bad tier=${tier} rank=${rank} n=${n} week=${weekId}`,
      );
    }
    byTier[tier].push({ ...list[i], rank, tier });
  }

  const out = [];
  for (const tier of ['diamond', 'gold', 'silver', 'bronze']) {
    const group = byTier[tier];
    if (!group.length) continue;
    const each = round6(pot / group.length);
    const dust = round6(pot - round6(each * group.length));
    group.forEach((r, idx) => {
      const amount = idx === 0 ? round6(each + dust) : each;
      if (!(amount > 0)) {
        throw new Error(`weeklyG2uAllocations: bad amount ${tier} rank ${r.rank}`);
      }
      const id = String(r.telegram_id || '').trim();
      if (!id) throw new Error('weeklyG2uAllocations: missing telegram_id');
      out.push({
        telegram_id: id,
        username: r.username ?? null,
        source: 'weekly',
        period_id: String(weekId),
        amount,
        weight: Number(r.weight) || 0,
        meta: {
          formula: 'pool/4 equal split per tier among top 100',
          pool,
          pot,
          tier,
          rank: r.rank,
          tier_count: group.length,
          each_before_dust: each,
          top_n: WEEKLY_G2U_TOP_N,
          eligible: n,
          snapshot_at: new Date().toISOString(),
        },
      });
    });
  }

  const seen = new Set();
  for (const a of out) {
    if (seen.has(a.telegram_id)) {
      throw new Error(`weeklyG2uAllocations: duplicate ${a.telegram_id}`);
    }
    seen.add(a.telegram_id);
  }
  return out;
}

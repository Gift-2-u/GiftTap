/**
 * Weekly leaderboard badges + mystery gift (backpack).
 *
 * - 1 badge per player per UTC week from weekly ranks (battle-tap later can grant more).
 * - Backpack stores counts: badge_bronze / badge_silver / badge_gold / badge_diamond
 * - Mystery gift burn costs (any single tier):
 *     3 Diamond · 4 Gold · 5 Silver · 10 Bronze
 * - CLAIM RULE: badge week award is once-only; box open burns badges (once per open).
 */

import { getUtcWeekId } from './weeklyQuestLogic';
import { claimKey } from './claimOnce';

/** Public PNG art for weekly season prizes (Shop → Pack → Badges). */
export const BADGE_IMAGE_BASE = '/shop/weekly-badges';

export const BADGE_TIERS = {
  bronze: {
    id: 'bronze',
    itemId: 'badge_bronze',
    name: 'Bronze Badge',
    emoji: '🥉',
    color: '#cd7f32',
    image: `${BADGE_IMAGE_BASE}/badge_bronze.png`,
  },
  silver: {
    id: 'silver',
    itemId: 'badge_silver',
    name: 'Silver Badge',
    emoji: '🥈',
    color: '#c0c0c0',
    image: `${BADGE_IMAGE_BASE}/badge_silver.png`,
  },
  gold: {
    id: 'gold',
    itemId: 'badge_gold',
    name: 'Gold Badge',
    emoji: '🥇',
    color: '#ffd700',
    image: `${BADGE_IMAGE_BASE}/badge_gold.png`,
  },
  diamond: {
    id: 'diamond',
    itemId: 'badge_diamond',
    name: 'Diamond Badge',
    emoji: '💎',
    color: '#67e8f9',
    image: `${BADGE_IMAGE_BASE}/badge_diamond.png`,
  },
};

/** Resolve badge PNG for a tier id (bronze/silver/gold/diamond). */
export function badgeImageForTier(tier) {
  if (!tier) return null;
  const meta =
    BADGE_TIERS[tier] ||
    Object.values(BADGE_TIERS).find((t) => t.itemId === tier || t.id === tier);
  return meta?.image || null;
}

/** Burn cost to open mystery gift (one tier only per open) */
export const MYSTERY_BOX_COSTS = {
  diamond: 3,
  gold: 4,
  silver: 5,
  bronze: 10,
};

export const BADGE_ITEM_IDS = Object.values(BADGE_TIERS).map((t) => t.itemId);

/**
 * Weekly main-board / badge floor (same spirit as season 15% rule).
 *
 * Reference pace: 1000 score/day.
 * Live board floor = 15% × 1000 × ISO weekday (Mon=1 … Sun=7)
 *   → day 1 = 150 … day 7 = 1050
 * Badge floor at week end (finished week) = 15% × 1000 × 7 = 1050
 * Only players at/above the badge floor can win Diamond/Gold/Silver/Bronze.
 */
export const WEEKLY_DAILY_REFERENCE = 1000;
export const WEEKLY_FLOOR_PCT = 0.15;
export const WEEKLY_DAYS = 7;

/** Full-week badge eligibility floor (end of UTC week). */
export function getWeeklyBadgeFloor() {
  return Math.floor(WEEKLY_DAILY_REFERENCE * WEEKLY_FLOOR_PCT * WEEKLY_DAYS);
}

/**
 * ISO weekday in UTC: Monday = 1 … Sunday = 7.
 */
export function getUtcIsoWeekDayNumber(date = new Date()) {
  return date.getUTCDay() || 7;
}

/**
 * Live Weekly main-board floor (grows through the week).
 * @param {number} [dayOfWeek] 1–7 (Mon–Sun UTC); default today UTC
 */
export function getWeeklyBoardFloor(dayOfWeek = getUtcIsoWeekDayNumber()) {
  const day = Math.max(1, Math.min(WEEKLY_DAYS, Math.floor(Number(dayOfWeek) || 1)));
  return Math.floor(WEEKLY_DAILY_REFERENCE * WEEKLY_FLOOR_PCT * day);
}

export function isWeeklyFloorEligible(score, floor) {
  const f = Math.max(0, Number(floor) || 0);
  return Math.max(0, Number(score) || 0) >= f;
}

/**
 * First UTC ISO week that uses %-based badge cuts (this week W34 stays legacy).
 * Of eligible N — top 10% Diamond, next 15% Gold, next 25% Silver, rest Bronze
 * (W34 and earlier used fixed #1–#10 ranks in code.)
 */
export const WEEKLY_PERCENT_BADGES_FROM_WEEK = '2026-W35';

export const WEEKLY_BADGE_CUTS = {
  diamondPct: 0.1,
  goldPct: 0.15,
  silverPct: 0.25,
};

/** ISO week strings compare lexicographically for YYYY-Www */
export function weekUsesPercentBadges(weekId) {
  const w = String(weekId || '');
  if (!/^\d{4}-W\d{2}$/.test(w)) return false;
  return w >= WEEKLY_PERCENT_BADGES_FROM_WEEK;
}

/**
 * How many of each tier for N eligible players (new %-based rules).
 */
export function weeklyBadgeTierCounts(totalEligible) {
  const n = Math.max(0, Math.floor(Number(totalEligible) || 0));
  if (n < 1) return { diamond: 0, gold: 0, silver: 0, bronze: 0, total: 0 };
  const diamond = Math.floor(n * WEEKLY_BADGE_CUTS.diamondPct);
  const gold = Math.floor(n * WEEKLY_BADGE_CUTS.goldPct);
  const silver = Math.floor(n * WEEKLY_BADGE_CUTS.silverPct);
  let bronze = n - diamond - gold - silver;
  if (bronze < 0) bronze = 0;
  return { diamond, gold, silver, bronze, total: n };
}

/**
 * Rank → badge tier for the Weekly leaderboard (resets every UTC week).
 * Rank is among floor-eligible players only.
 *
 * @param {number} rank 1-based among eligible
 * @param {number} [totalEligible] eligible count (required for %-based weeks)
 * @param {string} [weekId] ISO week; default assumes current/%-era when total given
 */
export function badgeTierForWeeklyRank(rank, totalEligible, weekId) {
  const r = Math.floor(Number(rank) || 0);
  if (r < 1) return null;

  // Without weekId, stay legacy unless caller opts into % by passing weekId >= W35
  const usePct = weekUsesPercentBadges(weekId);

  // Legacy top-10 fixed (through 2026-W34)
  if (!usePct) {
    if (r === 1) return 'diamond';
    if (r === 2) return 'gold';
    if (r === 3) return 'silver';
    if (r >= 4 && r <= 10) return 'bronze';
    return null;
  }

  const n = Math.max(0, Math.floor(Number(totalEligible) || 0));
  if (n < 1 || r > n) return null;
  const { diamond, gold, silver } = weeklyBadgeTierCounts(n);
  if (r <= diamond) return 'diamond';
  if (r <= diamond + gold) return 'gold';
  if (r <= diamond + gold + silver) return 'silver';
  return 'bronze';
}

/**
 * Filter to main-board (score ≥ floor), sort desc, cap list.
 * Does not change scores — only who is on the main board.
 */
export function filterWeeklyMainBoard(rows, floor, limit = 50) {
  const f = Math.max(0, Number(floor) || 0);
  return (rows || [])
    .filter((r) => isWeeklyFloorEligible(r.weekly_score ?? r.score ?? 0, f))
    .sort(
      (a, b) =>
        (Number(b.weekly_score ?? b.score) || 0) -
        (Number(a.weekly_score ?? a.score) || 0),
    )
    .slice(0, limit);
}

/** inventory.weekly_lb: { weekId, score } — this UTC week's mining score */
export function getWeeklyLbState(inv, weekId = getUtcWeekId()) {
  const raw = inv?.weekly_lb;
  if (!raw || typeof raw !== 'object' || raw.weekId !== weekId) {
    return { weekId, score: 0 };
  }
  return {
    weekId,
    score: Math.max(0, Number(raw.score) || 0),
  };
}

export function addWeeklyLbScore(inv, amount, weekId = getUtcWeekId()) {
  const base = inv && typeof inv === 'object' ? { ...inv } : {};
  const cur = getWeeklyLbState(base, weekId);
  const add = Math.max(0, Number(amount) || 0);
  base.weekly_lb = {
    weekId,
    score: Math.round((cur.score + add) * 1000) / 1000,
  };
  return base;
}

/**
 * Parse a players row into a weekly leaderboard entry (current week only).
 */
export function weeklyScoreFromPlayerRow(row, weekId = getUtcWeekId()) {
  if (!row) return 0;
  // Prefer top-level columns if present (future schema)
  if (row.weekly_week_id === weekId && row.weekly_shards != null) {
    return Math.max(0, Number(row.weekly_shards) || 0);
  }
  return getWeeklyLbState(row.inventory, weekId).score;
}

/**
 * Sort all weekly scores (no floor). Pass floor to return main-board only.
 * @param {object} [opts]
 * @param {number} [opts.floor] if set, only score ≥ floor (main board)
 * @param {number} [opts.limit]
 */
export function sortWeeklyLeaderboard(rows, weekId = getUtcWeekId(), limitOrOpts = 50) {
  const opts =
    typeof limitOrOpts === 'object' && limitOrOpts != null
      ? limitOrOpts
      : { limit: limitOrOpts };
  const limit = opts.limit != null ? opts.limit : 50;
  const floor = opts.floor;
  let list = (rows || [])
    .map((r) => ({
      ...r,
      weekly_score: weeklyScoreFromPlayerRow(r, weekId),
    }))
    .filter((r) => r.weekly_score > 0)
    .sort((a, b) => b.weekly_score - a.weekly_score);
  if (floor != null && Number(floor) > 0) {
    list = filterWeeklyMainBoard(list, floor, limit);
  } else {
    list = list.slice(0, limit);
  }
  return list;
}

/**
 * Rank on weekly board. If `floor` is set, rank is among eligible only;
 * under-floor players get onMain: false and no badge tier.
 */
export function rankOnWeeklyBoard(
  sortedRows,
  playerId,
  dbPlayerIdCol = 'telegram_id',
  floor = null,
  weekId = null,
) {
  if (!playerId) return null;
  const pid = String(playerId);
  const all = sortedRows || [];
  const f = floor != null ? Math.max(0, Number(floor) || 0) : null;
  const main =
    f != null && f > 0
      ? all.filter((r) => isWeeklyFloorEligible(r.weekly_score ?? r.score ?? 0, f))
      : all;

  const inMain = main.findIndex(
    (r) => String(r[dbPlayerIdCol] || r.telegram_id || r.id || '') === pid,
  );
  if (inMain >= 0) {
    return {
      rank: inMain + 1,
      score: main[inMain].weekly_score ?? main[inMain].score ?? 0,
      total: main.length,
      tier: badgeTierForWeeklyRank(inMain + 1, main.length, weekId),
      onMain: true,
      floor: f,
      need: 0,
    };
  }

  // Not on main board — find score from full list or null
  const any = all.find(
    (r) => String(r[dbPlayerIdCol] || r.telegram_id || r.id || '') === pid,
  );
  if (!any && f == null) return null;
  const score = any ? Number(any.weekly_score ?? any.score) || 0 : 0;
  return {
    rank: null,
    score,
    total: main.length,
    tier: null,
    onMain: false,
    floor: f,
    need: f != null ? Math.max(0, f - score) : 0,
  };
}

export function getBadgeCounts(inv) {
  const out = {};
  for (const t of Object.values(BADGE_TIERS)) {
    out[t.id] = Math.max(0, Math.floor(Number(inv?.[t.itemId]) || 0));
  }
  return out;
}

export function totalBadges(inv) {
  return Object.values(getBadgeCounts(inv)).reduce((a, b) => a + b, 0);
}

/** inventory.weekly_badge_award: { weekId, tier, claimedAt } — one per finished week */
export function getWeeklyBadgeAward(inv, weekId) {
  const raw = inv?.weekly_badge_award;
  if (!raw || typeof raw !== 'object') return null;
  // Support single last award OR map of weekId -> award
  if (raw.weekId === weekId && raw.tier) return raw;
  if (raw[weekId] && raw[weekId].tier) return raw[weekId];
  // Also scan awards list
  if (Array.isArray(raw.history)) {
    const hit = raw.history.find((h) => h && h.weekId === weekId && h.tier);
    if (hit) return hit;
  }
  return null;
}

export function hasClaimedWeeklyBadge(inv, weekId) {
  if (!weekId) return false;
  const a = getWeeklyBadgeAward(inv, weekId);
  return !!(a && a.tier);
}

/** Also check claim_log for durability */
export function hasClaimedWeeklyBadgeDurable(inv, weekId = getUtcWeekId()) {
  if (hasClaimedWeeklyBadge(inv, weekId)) return true;
  const key = claimKey({ scope: 'weekly_badge', id: 'award', periodKey: weekId });
  const log = inv?.claim_log;
  return Array.isArray(log) && log.includes(key);
}

/**
 * Apply weekly rank badge once for a *finished* weekId.
 * Returns { inv, tier, already } or { inv, tier: null }.
 */
export function applyWeeklyBadgeAward(inv, tier, weekId) {
  const base = inv && typeof inv === 'object' ? { ...inv } : {};
  if (!weekId) {
    return { inv: base, tier: null, already: false };
  }
  if (hasClaimedWeeklyBadgeDurable(base, weekId)) {
    return { inv: base, tier: getWeeklyBadgeAward(base, weekId)?.tier || null, already: true };
  }
  if (!tier || !BADGE_TIERS[tier]) {
    return { inv: base, tier: null, already: false };
  }
  const meta = BADGE_TIERS[tier];
  base[meta.itemId] = (Number(base[meta.itemId]) || 0) + 1;
  const entry = {
    weekId,
    tier,
    claimedAt: new Date().toISOString(),
  };
  // Keep last award + history so multiple weeks don't overwrite
  const prev = base.weekly_badge_award && typeof base.weekly_badge_award === 'object'
    ? base.weekly_badge_award
    : {};
  const history = Array.isArray(prev.history) ? [...prev.history] : [];
  if (prev.weekId && prev.tier) {
    history.push({ weekId: prev.weekId, tier: prev.tier, claimedAt: prev.claimedAt });
  }
  history.push(entry);
  base.weekly_badge_award = {
    ...entry,
    history: history.slice(-26),
  };
  const key = claimKey({ scope: 'weekly_badge', id: 'award', periodKey: weekId });
  const log = new Set(Array.isArray(base.claim_log) ? base.claim_log : []);
  log.add(key);
  base.claim_log = [...log].sort();
  return { inv: base, tier, already: false };
}

/** Can player burn this tier for mystery gift? */
export function canOpenMysteryWith(inv, tier) {
  const need = MYSTERY_BOX_COSTS[tier];
  if (!need) return false;
  const have = getBadgeCounts(inv)[tier] || 0;
  return have >= need;
}

/**
 * Mystery Gift drop rates by badge tier burned (each column sums to 100%).
 *
 * Weekly badges: Diamond top 10% · Gold next 15% · Silver next 25% · Bronze rest eligible.
 *
 * Prize                    Bronze(rest) Silver25% Gold15% Diamond10%
 * Exclusive NFT                 1%         2%       5%      12%
 * Bonus G2U Tokens             10%        20%      35%      50%
 * Premium Boost                14%        23%      30%      28%
 * Free Boost                   35%        30%      20%      10%
 * G2Ushards (Bulk)             40%        25%      10%       0%
 */
const MYSTERY_PRIZE_META = {
  exclusive_nft: {
    id: 'exclusive_nft',
    label: 'Exclusive NFT',
    type: 'nft_voucher',
  },
  bonus_g2u: {
    id: 'bonus_g2u',
    label: 'Bonus G2U Tokens',
    type: 'shards',
  },
  premium_boost: {
    id: 'premium_boost',
    label: 'Premium Boost',
    type: 'item',
    itemId: 'frenzy',
  },
  free_boost: {
    id: 'free_boost',
    label: 'Free Boost',
    type: 'item',
    itemId: 'refill',
  },
  shards_bulk: {
    id: 'shards_bulk',
    label: 'G2Ushards (Bulk)',
    type: 'shards',
  },
};

const MYSTERY_SHARD_AMOUNTS = {
  bronze: { bonus_g2u: 2500, shards_bulk: 800 },
  silver: { bonus_g2u: 8000, shards_bulk: 2000 },
  gold: { bonus_g2u: 20000, shards_bulk: 5000 },
  diamond: { bonus_g2u: 50000, shards_bulk: 0 },
};

export const MYSTERY_ODDS_BY_TIER = {
  bronze: {
    exclusive_nft: 1,
    bonus_g2u: 10,
    premium_boost: 14,
    free_boost: 35,
    shards_bulk: 40,
  },
  silver: {
    exclusive_nft: 2,
    bonus_g2u: 20,
    premium_boost: 23,
    free_boost: 30,
    shards_bulk: 25,
  },
  gold: {
    exclusive_nft: 5,
    bonus_g2u: 35,
    premium_boost: 30,
    free_boost: 20,
    shards_bulk: 10,
  },
  diamond: {
    exclusive_nft: 12,
    bonus_g2u: 50,
    premium_boost: 28,
    free_boost: 10,
    shards_bulk: 0,
  },
};

export function mysteryRewardTableForTier(tier) {
  const tKey = BADGE_TIERS[tier] ? tier : 'bronze';
  const odds = MYSTERY_ODDS_BY_TIER[tKey] || MYSTERY_ODDS_BY_TIER.bronze;
  const amounts = MYSTERY_SHARD_AMOUNTS[tKey] || MYSTERY_SHARD_AMOUNTS.bronze;
  const rows = [];
  for (const [prizeId, weight] of Object.entries(odds)) {
    if (!weight || weight <= 0) continue;
    const meta = MYSTERY_PRIZE_META[prizeId];
    if (!meta) continue;
    const row = {
      id: `${prizeId}_${tKey}`,
      prizeId,
      label: meta.label,
      weight,
      type: meta.type,
      itemId: meta.itemId,
    };
    if (meta.type === 'shards') {
      const amt = Number(amounts[prizeId]) || 0;
      row.amount = amt;
      row.label =
        prizeId === 'bonus_g2u'
          ? `Bonus G2U Tokens (+${amt.toLocaleString()} G2Ushards)`
          : `G2Ushards (Bulk) (+${amt.toLocaleString()})`;
    }
    if (meta.type === 'item' && meta.itemId) {
      row.label =
        prizeId === 'premium_boost'
          ? 'Premium Boost (+1 Frenzy)'
          : 'Free Boost (+1 Instant Refill)';
    }
    if (meta.type === 'nft_voucher') {
      row.label = 'Exclusive NFT voucher';
    }
    rows.push(row);
  }
  return rows;
}

/** @deprecated prefer mysteryRewardTableForTier */
export const MYSTERY_REWARD_TABLE = mysteryRewardTableForTier('bronze');

export function rollMysteryReward(rng = Math.random, tier = 'bronze') {
  const table = mysteryRewardTableForTier(tier);
  const total = table.reduce((s, r) => s + r.weight, 0) || 1;
  let x = rng() * total;
  for (const r of table) {
    x -= r.weight;
    if (x <= 0) return { ...r };
  }
  return { ...table[0] };
}

export function openMysteryGift(inv, tier, balance = 0, rng = Math.random) {
  const base = inv && typeof inv === 'object' ? { ...inv } : {};
  const need = MYSTERY_BOX_COSTS[tier];
  if (!need || !BADGE_TIERS[tier]) {
    return { inv: base, balanceDelta: 0, reward: null, error: 'Invalid badge tier' };
  }
  const itemId = BADGE_TIERS[tier].itemId;
  const have = Math.max(0, Math.floor(Number(base[itemId]) || 0));
  if (have < need) {
    return {
      inv: base,
      balanceDelta: 0,
      reward: null,
      error: `Need ${need} ${BADGE_TIERS[tier].name}(s) (you have ${have})`,
    };
  }
  base[itemId] = have - need;
  if (base[itemId] <= 0) delete base[itemId];

  const reward = rollMysteryReward(rng, tier);
  let balanceDelta = 0;

  if (reward.type === 'shards') {
    balanceDelta = Number(reward.amount) || 0;
  } else if (reward.type === 'item' && reward.itemId) {
    base[reward.itemId] = (Number(base[reward.itemId]) || 0) + 1;
  } else if (reward.type === 'nft_voucher') {
    base.exclusive_nft_voucher =
      (Number(base.exclusive_nft_voucher) || 0) + 1;
  } else if (reward.type === 'task_limit') {
    // Applied by caller via applyTaskLimitBoostToInventory for stack correctness
  }

  // Log opens (not once-only — each burn is a new open)
  const opens = Array.isArray(base.mystery_opens) ? [...base.mystery_opens] : [];
  opens.push({
    at: new Date().toISOString(),
    burn: tier,
    cost: need,
    rewardId: reward.id,
  });
  // keep last 30
  base.mystery_opens = opens.slice(-30);

  return { inv: base, balanceDelta, reward, error: null };
}

/** Odds copy for UI — pass badge tier burned */
export function mysteryOddsLines(tier = 'bronze') {
  const table = mysteryRewardTableForTier(tier);
  const total = table.reduce((s, r) => s + r.weight, 0) || 1;
  return table.map((r) => ({
    label: r.label,
    pct: Math.round((r.weight / total) * 1000) / 10,
    prizeId: r.prizeId,
  }));
}

/** Compact rate table for Game Guide / Pack UI */
export function mysteryOddsTableForGuide() {
  const prizes = [
    'exclusive_nft',
    'bonus_g2u',
    'premium_boost',
    'free_boost',
    'shards_bulk',
  ];
  const labels = {
    exclusive_nft: 'Exclusive NFT',
    bonus_g2u: 'Bonus G2U Tokens',
    premium_boost: 'Premium Boost',
    free_boost: 'Free Boost',
    shards_bulk: 'G2Ushards (Bulk)',
  };
  const cols = [
    { tier: 'bronze', title: 'Bronze (rest eligible)' },
    { tier: 'silver', title: 'Silver (next 25%)' },
    { tier: 'gold', title: 'Gold (next 15%)' },
    { tier: 'diamond', title: 'Diamond (top 10%)' },
  ];
  return {
    columns: cols,
    rows: prizes.map((pid) => ({
      prize: labels[pid],
      rates: cols.map((c) => Number(MYSTERY_ODDS_BY_TIER[c.tier][pid]) || 0),
    })),
  };
}

export function badgeCatalogForBackpack() {
  return Object.values(BADGE_TIERS).map((t) => ({
    id: t.itemId,
    tier: t.id,
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    image: t.image,
    category: 'badge',
    desc: 'Weekly prize · burn for Mystery Gift · sell on Badge market',
  }));
}

/**
 * @deprecated NFT sockets use Star Badge — see getEquippedShardBadgeOnFate in shardBadge.js
 * Kept for compatibility; returns null for weekly tiers.
 */
export function getEquippedBadgeOnFate(inv, fateAssetId) {
  if (!fateAssetId || !inv || typeof inv !== 'object') return null;
  const map = inv.fate_equip;
  if (!map || typeof map !== 'object') return null;
  const row = map[fateAssetId];
  if (!row || typeof row !== 'object') return null;
  const itemId = String(row.itemId || row.item_id || '').toLowerCase();
  const tier = String(row.tier || '').toLowerCase().replace(/^badge_/, '');
  if (itemId === 'shard_badge' || tier === 'shard' || tier === 'shard_badge') {
    return {
      tier: 'shard',
      itemId: 'shard_badge',
      image: '/shop/socket-star2.jpg',
      name: 'Star Badge',
    };
  }
  return null;
}

/** Active Fate asset id for jackpot (optional focus). */
export function getActiveFateId(inv) {
  const id = inv?.fate_active;
  return id ? String(id) : null;
}

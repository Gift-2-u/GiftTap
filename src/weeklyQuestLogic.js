/**
 * Weekly quest board — UTC week, each quest claim = +100 max daily limit (UTC day).
 */

export const WEEKLY_ENERGY_REWARD = 100; // +daily limit (not the 500 pool)

/** Base daily max for drain-daily weekly quests (ignores battery / task / premium boosts) */
export const WEEKLY_BASE_DAILY_LIMIT = 1000;

/** End-of-week prize: claim after enough weekly quests claimed */
export const WEEKLY_PRIZE = {
  id: 'wq_week_prize',
  title: 'Weekly prize — Free Instant Refill',
  description:
    'Claim 7 of 10 weekly quests this UTC week, then claim this free boost (goes to Pack / Backpack).',
  icon: '🎁',
  /** How many of the energy quests must be claimed first (10 quests total) */
  needClaims: 7,
  /** Shop item id added to inventory */
  rewardItemId: 'refill',
  rewardLabel: 'Instant Refill',
};

/** ISO week id in UTC, e.g. 2026-W33 */
export function getUtcWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

export function utcDayStr(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Monday 00:00 UTC of current ISO week → next Monday (for UI) */
export function getUtcWeekRangeLabel(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dayNum - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (x) =>
    x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(monday)} – ${fmt(sunday)} UTC · ${getUtcWeekId(date)}`;
}

export function emptyWeeklyState(weekId) {
  return {
    weekId,
    claimed: [],
    daysTap500: [],
    daysActive: [],
    daysFull: [],
    boostBuys: 0,
  };
}

export function ensureWeeklyState(raw, weekId = getUtcWeekId()) {
  if (!raw || typeof raw !== 'object') {
    return emptyWeeklyState(weekId);
  }
  // Different week → fresh board. Missing weekId → keep arrays (partial writes / migration).
  if (raw.weekId && raw.weekId !== weekId) {
    return emptyWeeklyState(weekId);
  }
  return {
    weekId,
    claimed: Array.isArray(raw.claimed) ? [...raw.claimed] : [],
    daysTap500: Array.isArray(raw.daysTap500) ? [...raw.daysTap500] : [],
    daysActive: Array.isArray(raw.daysActive) ? [...raw.daysActive] : [],
    daysFull: Array.isArray(raw.daysFull) ? [...raw.daysFull] : [],
    boostBuys: Math.max(0, Number(raw.boostBuys) || 0),
  };
}

/**
 * True when daily taps meet the target limit (default = base 1000).
 * Weekly drain-daily uses BASE 1000 only — boosts do not raise the target.
 */
export function isDailyLimitDrained(dayTaps, maxLimit = WEEKLY_BASE_DAILY_LIMIT) {
  const taps = Math.max(0, Number(dayTaps) || 0);
  const limit = Math.max(0, Number(maxLimit) || WEEKLY_BASE_DAILY_LIMIT);
  if (limit <= 0) return false;
  if (taps + 1e-6 >= limit) return true;
  if (taps / limit >= 0.999) return true;
  // Stuck under cap (e.g. efficiency cost 2 with 1 left): remaining < 1
  if (limit - taps < 1) return true;
  return false;
}

/**
 * After taps / day progress — update sets for today.
 * @param {object} state
 * @param {{ day: string, dayTaps: number, maxLimit: number }} p
 */
export function applyWeeklyDailyProgress(state, weekId, p) {
  const s = ensureWeeklyState(state, weekId);
  const day = p.day || utcDayStr();
  const dayTaps = Math.max(0, Number(p.dayTaps) || 0);
  const maxLimit = Math.max(0, Number(p.maxLimit) || 0);

  const daysActive = new Set(s.daysActive);
  const daysTap500 = new Set(s.daysTap500);
  const daysFull = new Set(s.daysFull);

  if (dayTaps > 0) daysActive.add(day);
  if (dayTaps >= 500) daysTap500.add(day);
  // Full daily for weekly board = BASE 1000 only (not boosted dynamic max)
  if (isDailyLimitDrained(dayTaps, WEEKLY_BASE_DAILY_LIMIT)) {
    daysFull.add(day);
  }

  return {
    ...s,
    weekId,
    daysActive: [...daysActive].sort(),
    daysTap500: [...daysTap500].sort(),
    daysFull: [...daysFull].sort(),
  };
}

export function applyWeeklyBoostBuy(state, weekId, count = 1) {
  const s = ensureWeeklyState(state, weekId);
  return {
    ...s,
    boostBuys: (Number(s.boostBuys) || 0) + Math.max(1, Number(count) || 1),
  };
}

export const WEEKLY_QUEST_LIST = [
  {
    id: 'wq_tap500_1',
    title: 'Tap 500 in a day',
    description: 'Reach 500 daily taps on any UTC day this week',
    icon: '👆',
    kind: 'daysTap500',
    need: 1,
  },
  {
    id: 'wq_tap500_3',
    title: 'Tap 500 on 3 different days',
    description: '3 separate UTC days with 500+ taps each',
    icon: '👆',
    kind: 'daysTap500',
    need: 3,
  },
  {
    id: 'wq_tap500_5',
    title: 'Tap 500 on 5 different days',
    description: '5 separate UTC days with 500+ taps each',
    icon: '👆',
    kind: 'daysTap500',
    need: 5,
  },
  {
    id: 'wq_full_1',
    title: 'Drain daily limit once',
    description: 'Use the base 1,000 daily limit on 1 UTC day (boosts do not raise this target)',
    icon: '🔋',
    kind: 'daysFull',
    need: 1,
  },
  {
    id: 'wq_full_3',
    title: 'Drain daily limit 3 days',
    description: 'Hit base 1,000 daily on 3 different UTC days (boosts ignored)',
    icon: '🔋',
    kind: 'daysFull',
    need: 3,
  },
  {
    id: 'wq_full_5',
    title: 'Drain daily limit 5 days',
    description: 'Hit base 1,000 daily on 5 different UTC days (boosts ignored)',
    icon: '🔋',
    kind: 'daysFull',
    need: 5,
  },
  {
    id: 'wq_boost_1',
    title: 'Buy 1 boost',
    description: 'Any shop boost this week (shards or SOL)',
    icon: '🛍️',
    kind: 'boostBuys',
    need: 1,
  },
  {
    id: 'wq_boost_3',
    title: 'Buy 3 boosts',
    description: '3 shop boost purchases this week',
    icon: '🛍️',
    kind: 'boostBuys',
    need: 3,
  },
  {
    id: 'wq_boost_5',
    title: 'Buy 5 boosts',
    description: '5 shop boost purchases this week',
    icon: '🛍️',
    kind: 'boostBuys',
    need: 5,
  },
  {
    id: 'wq_friend_1k',
    title: '1 real friend (1,000 taps)',
    description: 'A referral reaches 1,000 lifetime taps (this week board)',
    icon: '🤝',
    kind: 'friend1k',
    need: 1,
  },
];

export function questProgress(quest, state, extras = {}) {
  const s = ensureWeeklyState(state);
  if (quest.kind === 'daysTap500') {
    const n = s.daysTap500.length;
    return { current: n, need: quest.need, ready: n >= quest.need };
  }
  if (quest.kind === 'daysActive') {
    const n = s.daysActive.length;
    return { current: n, need: quest.need, ready: n >= quest.need };
  }
  if (quest.kind === 'daysFull') {
    const n = s.daysFull.length;
    return { current: n, need: quest.need, ready: n >= quest.need };
  }
  if (quest.kind === 'boostBuys') {
    const n = Number(s.boostBuys) || 0;
    return { current: n, need: quest.need, ready: n >= quest.need };
  }
  if (quest.kind === 'friend1k') {
    const n = Math.min(1, Math.max(0, Number(extras.friends1k) || 0));
    return { current: n, need: 1, ready: n >= 1 };
  }
  return { current: 0, need: quest.need, ready: false };
}

export function isQuestClaimed(state, questId) {
  const s = ensureWeeklyState(state);
  return s.claimed.includes(questId);
}

export function markQuestClaimed(state, weekId, questId) {
  const s = ensureWeeklyState(state, weekId);
  if (s.claimed.includes(questId)) return s;
  return { ...s, claimed: [...s.claimed, questId] };
}

/** Durable claim key: survives races that wipe inventory.weekly_quests */
export function weeklyClaimKey(weekId, questId) {
  return `${weekId}:${questId}`;
}

/** Quest ids claimed this week from ledger + weekly_quests.claimed */
export function claimedIdsFromInventory(inv, weekId = getUtcWeekId()) {
  const ids = new Set();
  const wq = ensureWeeklyState(inv?.weekly_quests, weekId);
  for (const id of wq.claimed || []) {
    if (id) ids.add(id);
  }
  const keys = inv?.weekly_claim_keys;
  if (Array.isArray(keys)) {
    const prefix = `${weekId}:`;
    for (const k of keys) {
      if (typeof k === 'string' && k.startsWith(prefix)) {
        ids.add(k.slice(prefix.length));
      }
    }
  }
  return ids;
}

export function inventoryHasWeeklyClaim(inv, weekId, questId) {
  if (!questId) return false;
  return claimedIdsFromInventory(inv, weekId).has(questId);
}

/** Union of durable claim key arrays (never drop a claim). */
export function mergeWeeklyClaimKeys(a, b) {
  const out = new Set();
  for (const src of [a, b]) {
    if (!Array.isArray(src)) continue;
    for (const k of src) {
      if (typeof k === 'string' && k.includes(':')) out.add(k);
    }
  }
  return [...out].sort();
}

/**
 * Mark a weekly quest claimed on inventory — dual-write:
 * 1) weekly_quests.claimed
 * 2) weekly_claim_keys ledger (anti multi-claim wipe)
 */
export function applyWeeklyClaimToInventory(inv, weekId, questId) {
  const base = inv && typeof inv === 'object' ? { ...inv } : {};
  base.weekly_quests = markQuestClaimed(base.weekly_quests, weekId, questId);
  const key = weeklyClaimKey(weekId, questId);
  base.weekly_claim_keys = mergeWeeklyClaimKeys(base.weekly_claim_keys, [key]);
  return base;
}

/** Merge two inventory objects without dropping weekly claims / progress. */
export function mergeInventoryWeekly(a, b, weekId = getUtcWeekId()) {
  const A = a && typeof a === 'object' ? a : {};
  const B = b && typeof b === 'object' ? b : {};
  return {
    ...A,
    ...B,
    weekly_quests: mergeWeeklyStates(A.weekly_quests, B.weekly_quests, weekId),
    weekly_claim_keys: mergeWeeklyClaimKeys(A.weekly_claim_keys, B.weekly_claim_keys),
  };
}

/** Sync weekly_quests.claimed from durable ledger (repair after wipe). */
export function hydrateWeeklyClaimsFromLedger(inv, weekId = getUtcWeekId()) {
  if (!inv || typeof inv !== 'object') return inv;
  const ids = claimedIdsFromInventory(inv, weekId);
  let wq = ensureWeeklyState(inv.weekly_quests, weekId);
  for (const id of ids) {
    wq = markQuestClaimed(wq, weekId, id);
  }
  return {
    ...inv,
    weekly_quests: wq,
    weekly_claim_keys: mergeWeeklyClaimKeys(
      inv.weekly_claim_keys,
      [...ids].map((id) => weeklyClaimKey(weekId, id)),
    ),
  };
}

/** Merge two weekly states for same week — never drop claimed ids (anti double-claim wipe). */
export function mergeWeeklyStates(a, b, weekId = getUtcWeekId()) {
  const A = ensureWeeklyState(a, weekId);
  const B = ensureWeeklyState(b, weekId);
  // Prefer matching week; if one is empty-new week and other has data, keep data week
  const useA = A.weekId === weekId;
  const useB = B.weekId === weekId;
  if (!useA && !useB) return emptyWeeklyState(weekId);
  if (!useA) return B;
  if (!useB) return A;
  return {
    weekId,
    claimed: [...new Set([...(A.claimed || []), ...(B.claimed || [])])],
    daysTap500: [...new Set([...(A.daysTap500 || []), ...(B.daysTap500 || [])])].sort(),
    daysActive: [...new Set([...(A.daysActive || []), ...(B.daysActive || [])])].sort(),
    daysFull: [...new Set([...(A.daysFull || []), ...(B.daysFull || [])])].sort(),
    boostBuys: Math.max(Number(A.boostBuys) || 0, Number(B.boostBuys) || 0),
  };
}

/** Claims that count toward the weekly prize (energy quests only, not the prize itself) */
export function countWeeklyQuestsClaimed(state) {
  const s = ensureWeeklyState(state);
  return s.claimed.filter((id) => id && id !== WEEKLY_PRIZE.id).length;
}

export function weeklyPrizeProgress(state) {
  const current = countWeeklyQuestsClaimed(state);
  const need = WEEKLY_PRIZE.needClaims;
  const claimed = isQuestClaimed(state, WEEKLY_PRIZE.id);
  return {
    current,
    need,
    ready: !claimed && current >= need,
    claimed,
  };
}

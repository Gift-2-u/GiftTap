/**
 * Weekly quest board — UTC week, each quest claim = +100 max daily limit (UTC day).
 */

export const WEEKLY_ENERGY_REWARD = 100; // +daily limit (not the 500 pool)

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
  if (!raw || typeof raw !== 'object' || raw.weekId !== weekId) {
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
  // Full daily: allow tiny float error; also treat >= 99.9% of max as drained
  if (
    maxLimit > 0 &&
    (dayTaps + 1e-6 >= maxLimit || dayTaps / maxLimit >= 0.999)
  ) {
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
    description: 'Fill / use your full daily limit on 1 UTC day',
    icon: '🔋',
    kind: 'daysFull',
    need: 1,
  },
  {
    id: 'wq_full_3',
    title: 'Drain daily limit 3 days',
    description: 'Full daily limit on 3 different UTC days',
    icon: '🔋',
    kind: 'daysFull',
    need: 3,
  },
  {
    id: 'wq_full_5',
    title: 'Drain daily limit 5 days',
    description: 'Full daily limit on 5 different UTC days',
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

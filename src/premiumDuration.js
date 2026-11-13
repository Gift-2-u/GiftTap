/**
 * Client mirror of supabase/functions/_shared/premiumDuration.ts
 */

export const PREMIUM_DURATION_DAYS = [1, 3, 7];

export const PREMIUM_DURATION_CHOICE_IDS = new Set([
  'grinder',
  'whale',
  'x2_boost',
  'x3_boost',
  'expanded_energy',
]);

export const PREMIUM_DURATION_G2U = {
  // Doubled vs prior rebalance (+1000 Max Daily = 1000 $G2U)
  grinder: { 1: 1_000, 3: 2_500, 7: 6_000 },
  whale: { 1: 3_000, 3: 8_000, 7: 18_000 },
  x2_boost: { 1: 2_000, 3: 5_000, 7: 10_000 },
  x3_boost: { 1: 3_000, 3: 8_000, 7: 18_000 },
  expanded_energy: { 1: 200, 3: 500, 7: 1000 },
};

export const PREMIUM_PROJECT_FEE_SOL = 0.0005;

export function isDurationChoiceItem(itemId) {
  return PREMIUM_DURATION_CHOICE_IDS.has(String(itemId || '').toLowerCase());
}

export function parsePremiumDurationDays(raw, fallback = 7) {
  const d = Math.floor(Number(raw) || 0);
  if (d === 1 || d === 3 || d === 7) return d;
  return fallback;
}

export function roundSol(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

export function premiumPriceG2uForDays(itemId, days) {
  const id = String(itemId || '').toLowerCase();
  const row = PREMIUM_DURATION_G2U[id];
  if (!row) return 0;
  const d = parsePremiumDurationDays(days, 7);
  return Math.max(1, Math.round(row[d]));
}

export function premiumPriceSolForDays(itemId, days, g2uPerSol = 5_000_000) {
  const g2u = premiumPriceG2uForDays(itemId, days);
  const rate = Math.max(1, Number(g2uPerSol) || 5_000_000);
  return roundSol(g2u / rate);
}

export function utcDayOffsetForDuration(days) {
  return Math.max(0, parsePremiumDurationDays(days, 7) - 1);
}

export function durationLabel(days) {
  const d = parsePremiumDurationDays(days, 7);
  return d === 1 ? '1 Day' : `${d} Days`;
}

/** Three priced options for the picker modal. */
export function premiumDurationOptions(itemId, { g2uMode = true, g2uPerSol = 5_000_000 } = {}) {
  const id = String(itemId || '').toLowerCase();
  return PREMIUM_DURATION_DAYS.map((days) => {
    const priceG2u = premiumPriceG2uForDays(id, days);
    const priceSol = premiumPriceSolForDays(id, days, g2uPerSol);
    return {
      days,
      label: durationLabel(days),
      priceSol,
      priceG2u,
      price: g2uMode ? priceG2u : priceSol,
      currency: g2uMode ? 'G2U' : 'SOL',
    };
  });
}

const QUEUE_KEY = 'premium_duration_queue';

/** Queue duration charge for backpack activate (Mystery Gift / shop). */
export function pushPremiumDuration(inv, itemId, days) {
  if (!inv || typeof inv !== 'object') return;
  const id = String(itemId || '').toLowerCase();
  if (!PREMIUM_DURATION_CHOICE_IDS.has(id)) return;
  const d = parsePremiumDurationDays(days, 7);
  const root =
    inv[QUEUE_KEY] && typeof inv[QUEUE_KEY] === 'object' && !Array.isArray(inv[QUEUE_KEY])
      ? { ...inv[QUEUE_KEY] }
      : {};
  const prev = Array.isArray(root[id]) ? [...root[id]] : [];
  prev.push(d);
  root[id] = prev;
  inv[QUEUE_KEY] = root;
}

/** Peek next queued duration without popping (Backpack UI). */
export function peekPremiumDuration(inv, itemId, fallback = 7) {
  const id = String(itemId || '').toLowerCase();
  const root = inv?.[QUEUE_KEY];
  if (root && typeof root === 'object' && Array.isArray(root[id]) && root[id].length) {
    return parsePremiumDurationDays(root[id][0], fallback);
  }
  return parsePremiumDurationDays(fallback, 7);
}

/** All queued durations for one item, e.g. [3, 7]. */
export function listPremiumDurations(inv, itemId) {
  const id = String(itemId || '').toLowerCase();
  const root = inv?.[QUEUE_KEY];
  if (!root || typeof root !== 'object' || !Array.isArray(root[id])) return [];
  return root[id].map((d) => parsePremiumDurationDays(d, 7));
}

/** Remember which pack length is currently running (Backpack label). */
export function stampPremiumBoostActive(inv, itemId, days, expiresIso) {
  if (!inv || typeof inv !== 'object') return;
  const id = String(itemId || '').toLowerCase();
  if (!PREMIUM_DURATION_CHOICE_IDS.has(id)) return;
  const prev =
    inv.premium_boost_active && typeof inv.premium_boost_active === 'object'
      ? { ...inv.premium_boost_active }
      : {};
  prev[id] = {
    days: parsePremiumDurationDays(days, 7),
    expires: String(expiresIso || ''),
  };
  inv.premium_boost_active = prev;
}

export function readPremiumBoostActive(inv, itemId) {
  const id = String(itemId || '').toLowerCase();
  const row = inv?.premium_boost_active?.[id];
  if (!row || typeof row !== 'object') return null;
  const expires = String(row.expires || '');
  if (!expires) return null;
  if (Date.now() >= new Date(expires).getTime()) return null;
  return {
    days: parsePremiumDurationDays(row.days, 7),
    expires,
  };
}

/** Human remaining time from an ISO expiry. */
export function formatTimeLeft(expiresIso) {
  const ms = new Date(String(expiresIso || '')).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.ceil(ms / 3600000);
  if (hours < 48) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h left` : `${days}d left`;
}

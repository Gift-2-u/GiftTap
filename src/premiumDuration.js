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
  grinder: { 1: 7_000, 3: 20_000, 7: 45_000 },
  whale: { 1: 21_000, 3: 60_000, 7: 135_000 },
  x2_boost: { 1: 14_000, 3: 40_000, 7: 90_000 },
  x3_boost: { 1: 25_000, 3: 70_000, 7: 150_000 },
  expanded_energy: { 1: 1_500, 3: 4_000, 7: 8_000 },
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

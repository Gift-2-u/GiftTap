/**
 * Timed premium boosts: same shop button → choose 1 / 3 / 7 UTC days.
 * G2U list prices are fixed (player-facing). SOL path = G2U / g2uPerSol.
 */

export const PREMIUM_DURATION_DAYS = [1, 3, 7] as const;
export type PremiumDurationDays = (typeof PREMIUM_DURATION_DAYS)[number];

export const PREMIUM_DURATION_CHOICE_IDS = new Set([
  "grinder",
  "whale",
  "x2_boost",
  "x3_boost",
  "expanded_energy",
]);

/** Fixed $G2U by item × duration */
export const PREMIUM_DURATION_G2U: Record<
  string,
  Record<PremiumDurationDays, number>
> = {
  grinder: { 1: 7_000, 3: 20_000, 7: 45_000 },
  whale: { 1: 21_000, 3: 60_000, 7: 135_000 },
  x2_boost: { 1: 14_000, 3: 40_000, 7: 90_000 },
  x3_boost: { 1: 25_000, 3: 70_000, 7: 150_000 },
  expanded_energy: { 1: 1_500, 3: 4_000, 7: 8_000 },
};

/** Flat project fee on every premium buy (SOL → treasury) */
export const PREMIUM_PROJECT_FEE_SOL = 0.0005;

export function isPremiumDurationDays(n: unknown): n is PremiumDurationDays {
  const d = Math.floor(Number(n) || 0);
  return d === 1 || d === 3 || d === 7;
}

export function parsePremiumDurationDays(
  raw: unknown,
  fallback: PremiumDurationDays = 7,
): PremiumDurationDays {
  const d = Math.floor(Number(raw) || 0);
  if (d === 1 || d === 3 || d === 7) return d;
  return fallback;
}

export function roundSol(n: number): number {
  return Math.round(Number(n) * 1e6) / 1e6;
}

export function premiumPriceG2uForDays(
  itemId: string,
  days: PremiumDurationDays,
): number {
  const row = PREMIUM_DURATION_G2U[itemId];
  if (!row) throw new Error(`No duration G2U price for ${itemId}`);
  return Math.max(1, Math.round(row[days]));
}

export function premiumPriceSolForDays(
  itemId: string,
  days: PremiumDurationDays,
  g2uPerSol: number,
): number {
  const g2u = premiumPriceG2uForDays(itemId, days);
  const rate = Math.max(1, Number(g2uPerSol) || 5_000_000);
  return roundSol(g2u / rate);
}

/** endOfUtcDay offset: 1→0 (tonight), 3→2, 7→6 */
export function utcDayOffsetForDuration(days: PremiumDurationDays): number {
  return Math.max(0, days - 1);
}

const QUEUE_KEY = "premium_duration_queue";

export function pushPremiumDuration(
  inv: Record<string, unknown>,
  itemId: string,
  days: PremiumDurationDays,
): void {
  const root =
    inv[QUEUE_KEY] && typeof inv[QUEUE_KEY] === "object" && !Array.isArray(inv[QUEUE_KEY])
      ? { ...(inv[QUEUE_KEY] as Record<string, unknown>) }
      : {};
  const prev = Array.isArray(root[itemId]) ? [...(root[itemId] as unknown[])] : [];
  prev.push(days);
  root[itemId] = prev;
  inv[QUEUE_KEY] = root;
}

/** Pop next duration for activate; legacy charges (no queue) default to 7. */
export function popPremiumDuration(
  inv: Record<string, unknown>,
  itemId: string,
): PremiumDurationDays {
  const root =
    inv[QUEUE_KEY] && typeof inv[QUEUE_KEY] === "object" && !Array.isArray(inv[QUEUE_KEY])
      ? { ...(inv[QUEUE_KEY] as Record<string, unknown>) }
      : {};
  const prev = Array.isArray(root[itemId]) ? [...(root[itemId] as unknown[])] : [];
  let days: PremiumDurationDays = 7;
  if (prev.length > 0) {
    days = parsePremiumDurationDays(prev.shift(), 7);
  }
  if (prev.length > 0) root[itemId] = prev;
  else delete root[itemId];
  if (Object.keys(root).length > 0) inv[QUEUE_KEY] = root;
  else delete inv[QUEUE_KEY];
  return days;
}

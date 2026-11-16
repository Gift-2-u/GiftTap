/** Main-page battery / daily boost pricing (HUD bars). Mirror of src/hudBoost.js */

export const HUD_REFILL_UNIT = 500;
export const HUD_REFILL_G2U_PER_UNIT = 200;
export const HUD_EXPAND_UNIT = 500;
export const HUD_EXPAND_G2U_PER_UNIT = 100;
export const HUD_ENERGY_CAP_DEFAULT = 500;
export const HUD_EXPAND_UNITS_MIN = 1;
export const HUD_EXPAND_UNITS_MAX = 10;
export const HUD_REFILL_UNITS_MIN = 1;
export const HUD_REFILL_UNITS_MAX = 10;

export const HUD_DAILY_AMOUNTS = [1000, 2000, 3000, 4000, 5000] as const;
export const HUD_DAILY_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const HUD_DAILY_G2U_PER_1K_PER_DAY = 500;

export type HudBoostKind = "refill" | "expand" | "daily";

export function hudRefillPriceG2u(units: number): number {
  const u = Math.max(
    HUD_REFILL_UNITS_MIN,
    Math.min(HUD_REFILL_UNITS_MAX, Math.floor(Number(units) || 0)),
  );
  return u * HUD_REFILL_G2U_PER_UNIT;
}

export function hudRefillAmount(units: number): number {
  const u = Math.max(
    HUD_REFILL_UNITS_MIN,
    Math.min(HUD_REFILL_UNITS_MAX, Math.floor(Number(units) || 0)),
  );
  return u * HUD_REFILL_UNIT;
}

export function hudExpandPriceG2u(units: number): number {
  const u = Math.max(
    HUD_EXPAND_UNITS_MIN,
    Math.min(HUD_EXPAND_UNITS_MAX, Math.floor(Number(units) || 0)),
  );
  return u * HUD_EXPAND_G2U_PER_UNIT;
}

export function hudExpandExtra(units: number): number {
  const u = Math.max(
    HUD_EXPAND_UNITS_MIN,
    Math.min(HUD_EXPAND_UNITS_MAX, Math.floor(Number(units) || 0)),
  );
  return u * HUD_EXPAND_UNIT;
}

export function hudExpandCap(units: number): number {
  return HUD_ENERGY_CAP_DEFAULT + hudExpandExtra(units);
}

export function hudDailyPriceG2u(amount: number, days: number): number {
  const amt = Math.floor(Number(amount) || 0);
  const d = Math.floor(Number(days) || 0);
  if (!(HUD_DAILY_AMOUNTS as readonly number[]).includes(amt)) return 0;
  if (!(HUD_DAILY_DAYS as readonly number[]).includes(d)) return 0;
  const thousands = amt / 1000;
  return Math.round(thousands * HUD_DAILY_G2U_PER_1K_PER_DAY * d);
}

export function resolveHudBoostQuote(body: {
  kind?: unknown;
  units?: unknown;
  amount?: unknown;
  days?: unknown;
}): {
  kind: HudBoostKind;
  units: number | null;
  amount: number;
  days: number | null;
  priceG2u: number;
  energyCap: number | null;
} {
  const kind = String(body.kind || "").toLowerCase() as HudBoostKind;
  if (kind === "refill") {
    const units = Math.max(
      HUD_REFILL_UNITS_MIN,
      Math.min(HUD_REFILL_UNITS_MAX, Math.floor(Number(body.units) || 0)),
    );
    return {
      kind,
      units,
      amount: hudRefillAmount(units),
      days: null,
      priceG2u: hudRefillPriceG2u(units),
      energyCap: null,
    };
  }
  if (kind === "expand") {
    const units = Math.max(
      HUD_EXPAND_UNITS_MIN,
      Math.min(HUD_EXPAND_UNITS_MAX, Math.floor(Number(body.units) || 0)),
    );
    return {
      kind,
      units,
      amount: hudExpandExtra(units),
      days: 1,
      priceG2u: hudExpandPriceG2u(units),
      energyCap: hudExpandCap(units),
    };
  }
  if (kind === "daily") {
    const amount = Math.floor(Number(body.amount) || 0);
    const days = Math.floor(Number(body.days) || 0);
    const priceG2u = hudDailyPriceG2u(amount, days);
    if (priceG2u <= 0) throw new Error("Invalid daily boost selection");
    return {
      kind,
      units: null,
      amount,
      days,
      priceG2u,
      energyCap: null,
    };
  }
  throw new Error("Unknown hud boost kind");
}

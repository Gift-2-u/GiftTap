/** Main-page battery / daily boost pricing (HUD bars). */

export const HUD_REFILL_UNIT = 500;
export const HUD_REFILL_G2U_PER_UNIT = 200;
export const HUD_EXPAND_UNIT = 500;
export const HUD_EXPAND_G2U_PER_UNIT = 100;
export const HUD_ENERGY_CAP_DEFAULT = 500;
export const HUD_EXPAND_UNITS_MIN = 1;
export const HUD_EXPAND_UNITS_MAX = 10;
export const HUD_REFILL_UNITS_MIN = 1;
export const HUD_REFILL_UNITS_MAX = 10;

export const HUD_DAILY_AMOUNTS = [1000, 2000, 3000, 4000, 5000];
export const HUD_DAILY_DAYS = [1, 2, 3, 4, 5, 6, 7];
/** 500 $G2U per +1k max daily per day */
export const HUD_DAILY_G2U_PER_1K_PER_DAY = 500;

export function hudRefillPriceG2u(units) {
  const u = Math.max(
    HUD_REFILL_UNITS_MIN,
    Math.min(HUD_REFILL_UNITS_MAX, Math.floor(Number(units) || 0)),
  );
  return u * HUD_REFILL_G2U_PER_UNIT;
}

export function hudRefillAmount(units) {
  const u = Math.max(
    HUD_REFILL_UNITS_MIN,
    Math.min(HUD_REFILL_UNITS_MAX, Math.floor(Number(units) || 0)),
  );
  return u * HUD_REFILL_UNIT;
}

export function hudExpandPriceG2u(units) {
  const u = Math.max(
    HUD_EXPAND_UNITS_MIN,
    Math.min(HUD_EXPAND_UNITS_MAX, Math.floor(Number(units) || 0)),
  );
  return u * HUD_EXPAND_G2U_PER_UNIT;
}

export function hudExpandExtra(units) {
  const u = Math.max(
    HUD_EXPAND_UNITS_MIN,
    Math.min(HUD_EXPAND_UNITS_MAX, Math.floor(Number(units) || 0)),
  );
  return u * HUD_EXPAND_UNIT;
}

export function hudExpandCap(units) {
  return HUD_ENERGY_CAP_DEFAULT + hudExpandExtra(units);
}

export function hudDailyPriceG2u(amount, days) {
  const amt = Math.floor(Number(amount) || 0);
  const d = Math.floor(Number(days) || 0);
  if (!HUD_DAILY_AMOUNTS.includes(amt)) return 0;
  if (!HUD_DAILY_DAYS.includes(d)) return 0;
  const thousands = amt / 1000;
  return Math.round(thousands * HUD_DAILY_G2U_PER_1K_PER_DAY * d);
}

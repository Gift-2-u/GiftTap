/**
 * Shared economy helpers for hard-security Edge Functions.
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gift-session, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function logEconomy(
  sb: SupabaseClient,
  row: {
    player_id: string;
    kind: string;
    delta?: number | null;
    balance_after?: number | null;
    ref?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  try {
    await sb.from("economy_events").insert({
      player_id: row.player_id,
      kind: row.kind,
      delta: row.delta ?? null,
      balance_after: row.balance_after ?? null,
      ref: row.ref ?? null,
      meta: row.meta ?? {},
    });
  } catch (e) {
    console.warn("economy_events log failed", e);
  }
}

/** ISO week id UTC e.g. 2026-W33 */
export function utcIsoWeekId(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function previousUtcIsoWeekId(d = new Date()): string {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() - 7);
  return utcIsoWeekId(x);
}

export const BADGE_ITEM: Record<string, string> = {
  bronze: "badge_bronze",
  silver: "badge_silver",
  gold: "badge_gold",
  diamond: "badge_diamond",
  /** Fate socket asset — tradeable, not a weekly prize */
  shard: "shard_badge",
};

/** First week with %-based badges (W34 and earlier = legacy top-10). */
export const WEEKLY_PERCENT_BADGES_FROM_WEEK = "2026-W35";

export function weekUsesPercentBadges(weekId: string | null | undefined): boolean {
  const w = String(weekId || "");
  return /^\d{4}-W\d{2}$/.test(w) && w >= WEEKLY_PERCENT_BADGES_FROM_WEEK;
}

/**
 * Legacy: #1 D · #2 G · #3 S · #4–10 B
 * From 2026-W35: top 10% D, next 15% G, next 25% S, rest eligible Bronze
 */
export function tierFromRank(
  rank: number,
  totalEligible = 0,
  weekId: string | null = null,
): string | null {
  const r = Math.floor(Number(rank) || 0);
  if (r < 1) return null;

  if (!weekUsesPercentBadges(weekId)) {
    if (r === 1) return "diamond";
    if (r === 2) return "gold";
    if (r === 3) return "silver";
    if (r >= 4 && r <= 10) return "bronze";
    return null;
  }

  const n = Math.max(0, Math.floor(Number(totalEligible) || 0));
  if (n < 1 || r > n) return null;
  const diamond = Math.floor(n * 0.1);
  const gold = Math.floor(n * 0.15);
  const silver = Math.floor(n * 0.25);
  if (r <= diamond) return "diamond";
  if (r <= diamond + gold) return "gold";
  if (r <= diamond + gold + silver) return "silver";
  return "bronze";
}

export const MYSTERY_COSTS: Record<string, number> = {
  diamond: 3,
  gold: 4,
  silver: 5,
  bronze: 10,
};

/** Drop rates by burn tier (sum 100) */
export const MYSTERY_ODDS: Record<string, Record<string, number>> = {
  bronze: { exclusive_nft: 1, bonus_g2u: 10, premium_boost: 14, free_boost: 35, shards_bulk: 40 },
  silver: { exclusive_nft: 2, bonus_g2u: 20, premium_boost: 23, free_boost: 30, shards_bulk: 25 },
  gold: { exclusive_nft: 5, bonus_g2u: 35, premium_boost: 30, free_boost: 20, shards_bulk: 10 },
  diamond: { exclusive_nft: 12, bonus_g2u: 50, premium_boost: 28, free_boost: 10, shards_bulk: 0 },
};

export const MYSTERY_SHARD_AMOUNTS: Record<string, Record<string, number>> = {
  bronze: { bonus_g2u: 2500, shards_bulk: 800 },
  silver: { bonus_g2u: 8000, shards_bulk: 2000 },
  gold: { bonus_g2u: 20000, shards_bulk: 5000 },
  diamond: { bonus_g2u: 50000, shards_bulk: 0 },
};

export function rollMystery(tier: string): {
  prizeId: string;
  label: string;
  type: string;
  itemId?: string;
  amount?: number;
} {
  const odds = MYSTERY_ODDS[tier] || MYSTERY_ODDS.bronze;
  const amounts = MYSTERY_SHARD_AMOUNTS[tier] || MYSTERY_SHARD_AMOUNTS.bronze;
  const entries = Object.entries(odds).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = Math.random() * total;
  let prizeId = entries[0][0];
  for (const [id, w] of entries) {
    x -= w;
    if (x <= 0) {
      prizeId = id;
      break;
    }
  }
  if (prizeId === "exclusive_nft") {
    return { prizeId, label: "Exclusive NFT voucher", type: "nft_voucher" };
  }
  if (prizeId === "premium_boost") {
    return { prizeId, label: "Premium Boost (+1 Frenzy)", type: "item", itemId: "frenzy" };
  }
  if (prizeId === "free_boost") {
    return { prizeId, label: "Free Boost (+1 Instant Refill)", type: "item", itemId: "refill" };
  }
  if (prizeId === "bonus_g2u") {
    const amount = amounts.bonus_g2u || 0;
    return {
      prizeId,
      label: `Bonus G2U Tokens (+${amount.toLocaleString()} G2Ushards)`,
      type: "shards",
      amount,
    };
  }
  const amount = amounts.shards_bulk || 0;
  return {
    prizeId: "shards_bulk",
    label: `G2Ushards (Bulk) (+${amount.toLocaleString()})`,
    type: "shards",
    amount,
  };
}

/** Shard shop catalog (server source of truth for costs) */
export const SHARD_SHOP: Record<string, { name: string; cost: number }> = {
  frenzy: { name: "Frenzy Mode", cost: 700 },
  battery: { name: "Expanded Battery", cost: 750 },
  // heavy retired from catalog — replace later
  refill: { name: "Instant Refill", cost: 300 },
};

export function invObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

/** Echo (Power) tap multipliers — level 1..5 per rarity */
export const ECHO_MULTI: Record<string, number[]> = {
  common: [1.1, 1.2, 1.3, 1.4, 1.5],
  rare: [1.6, 1.7, 1.8, 1.9, 2.0],
  epic: [2.1, 2.2, 2.3, 2.4, 2.5],
  legendary: [2.6, 2.7, 2.8, 2.9, 3.0],
};

export function echoMultiplier(rarityKey: string, level = 1): number {
  const ladder = ECHO_MULTI[String(rarityKey || "").toLowerCase()] || ECHO_MULTI.common;
  const idx = Math.min(5, Math.max(1, Math.floor(Number(level) || 1))) - 1;
  return ladder[idx] || 1;
}

/** Read inventory.echo_active → multiplier (1 if none). */
export function echoMultiplierFromInv(inv: Record<string, unknown>): number {
  const raw = inv?.echo_active;
  if (!raw || typeof raw !== "object") return 1;
  const row = raw as Record<string, unknown>;
  const rarity = String(row.rarity || row.rarityKey || "").toLowerCase();
  if (!ECHO_MULTI[rarity]) return 1;
  return echoMultiplier(rarity, Number(row.level) || 1);
}

/** Fate (Luck) jackpot ladders — level N unlocks rungs 1..N. Chance is percent. */
export const FATE_JACKPOT: Record<string, Array<{ chance: number; multi: number }>> = {
  common: [
    { chance: 2, multi: 4 },
    { chance: 2, multi: 6 },
    { chance: 2, multi: 8 },
    { chance: 1.5, multi: 12 },
    { chance: 1.5, multi: 15 },
  ],
  rare: [
    { chance: 2, multi: 8 },
    { chance: 2, multi: 12 },
    { chance: 2, multi: 16 },
    { chance: 1.5, multi: 22 },
    { chance: 1.5, multi: 30 },
  ],
  epic: [
    { chance: 2.5, multi: 12 },
    { chance: 2, multi: 18 },
    { chance: 2, multi: 25 },
    { chance: 1.5, multi: 35 },
    { chance: 0.3, multi: 60 },
  ],
  legendary: [
    { chance: 3, multi: 15 },
    { chance: 2.5, multi: 25 },
    { chance: 2, multi: 35 },
    { chance: 0.5, multi: 60 },
    { chance: 0.15, multi: 100 },
  ],
};

/**
 * Roll one Fate jackpot for a tap.
 * Checks highest unlocked rung first → first hit wins. Max 1 jackpot per tap.
 */
export function rollFateJackpot(
  inv: Record<string, unknown>,
  rng: () => number = Math.random,
): { multi: number; rung: number; rarity: string } | null {
  const raw = inv?.fate_power;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const rarity = String(row.rarity || row.rarityKey || "").toLowerCase();
  const ladder = FATE_JACKPOT[rarity];
  if (!ladder) return null;
  const level = Math.min(5, Math.max(1, Math.floor(Number(row.level) || 1)));
  for (let i = level - 1; i >= 0; i--) {
    const rung = ladder[i];
    if (!rung) continue;
    if (rng() * 100 < rung.chance) {
      return { multi: rung.multi, rung: i + 1, rarity };
    }
  }
  return null;
}

/** Rush (Energy) max daily taps — level 1..5 per rarity. Base without Rush = 1000. */
export const RUSH_DAILY_LIMIT: Record<string, number[]> = {
  common: [1100, 1200, 1300, 1400, 1500],
  rare: [1600, 1700, 1800, 1900, 2000],
  epic: [2100, 2200, 2300, 2400, 2500],
  legendary: [2600, 2700, 2800, 2900, 3000],
};

export function rushDailyLimit(rarityKey: string, level = 1): number {
  const ladder = RUSH_DAILY_LIMIT[String(rarityKey || "").toLowerCase()];
  if (!ladder) return 1000;
  const idx = Math.min(5, Math.max(1, Math.floor(Number(level) || 1))) - 1;
  return ladder[idx] || 1000;
}

/** Rush active → daily base cap; 0 if none (caller uses 1000 / max_daily_limit). */
export function rushDailyLimitFromInv(inv: Record<string, unknown>): number {
  const raw = inv?.rush_active;
  if (!raw || typeof raw !== "object") return 0;
  const row = raw as Record<string, unknown>;
  const rarity = String(row.rarity || row.rarityKey || "").toLowerCase();
  if (!RUSH_DAILY_LIMIT[rarity]) return 0;
  return rushDailyLimit(rarity, Number(row.level) || 1);
}

/** Shadow (Night) AFK hours — level 1..5. 24h = full base daily cap. */
export const SHADOW_HOURS: Record<string, number[]> = {
  common: [2, 3, 4, 5, 6],
  rare: [8, 9, 10, 11, 12],
  epic: [14, 15, 16, 17, 18],
  legendary: [20, 21, 22, 23, 24],
};

export function shadowHours(rarityKey: string, level = 1): number {
  const ladder = SHADOW_HOURS[String(rarityKey || "").toLowerCase()];
  if (!ladder) return 0;
  const idx = Math.min(5, Math.max(1, Math.floor(Number(level) || 1))) - 1;
  return ladder[idx] || 0;
}

export function shadowYield(hours: number, baseDailyCap: number): number {
  const h = Math.max(0, Number(hours) || 0);
  const cap = Math.max(0, Math.floor(Number(baseDailyCap) || 0));
  return Math.floor((h / 24) * cap);
}

/** Base daily cap for Shadow yield: Rush active or 1000 (no battery/task boosts). */
export function shadowBaseDailyCap(inv: Record<string, unknown>, maxDailyLimitCol?: number): number {
  const rush = rushDailyLimitFromInv(inv);
  if (rush > 0) return rush;
  const col = Number(maxDailyLimitCol);
  if (Number.isFinite(col) && col > 0) return Math.floor(col);
  return 1000;
}

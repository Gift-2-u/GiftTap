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
  diamond: 2,
  gold: 3,
  silver: 4,
  bronze: 5,
};

/**
 * Drop rates by burn tier (sum 100).
 * Exclusive NFT kept scarce — Diamond ~2% (~1 in 50 opens), not 12%.
 */
export const MYSTERY_ODDS: Record<string, Record<string, number>> = {
  bronze: {
    exclusive_nft: 0.2,
    bonus_g2u: 10,
    premium_boost: 14,
    free_boost: 35,
    shards_bulk: 40.8,
  },
  silver: {
    exclusive_nft: 0.5,
    bonus_g2u: 20,
    premium_boost: 23,
    free_boost: 30,
    shards_bulk: 26.5,
  },
  gold: {
    exclusive_nft: 1,
    bonus_g2u: 35,
    premium_boost: 30,
    free_boost: 20,
    shards_bulk: 14,
  },
  diamond: {
    exclusive_nft: 2,
    bonus_g2u: 55,
    premium_boost: 28,
    free_boost: 15,
    shards_bulk: 0,
  },
};

/** Bonus G2U (SPL, queued/vault) + G2Ushards bulk → shard_balance only */
export const MYSTERY_SHARD_AMOUNTS: Record<string, Record<string, number>> = {
  bronze: { bonus_g2u: 5000, shards_bulk: 5000 },
  silver: { bonus_g2u: 15000, shards_bulk: 10000 },
  gold: { bonus_g2u: 25000, shards_bulk: 15000 },
  diamond: { bonus_g2u: 50000, shards_bulk: 0 },
};

/** Free Boost sub-roll (~33.3% each) — Frenzy is Free, not Premium */
export const MYSTERY_FREE_ITEMS: Array<{ itemId: string; label: string; weight: number }> = [
  { itemId: "frenzy", label: "Frenzy Mode", weight: 1 },
  { itemId: "battery", label: "Expanded Battery", weight: 1 },
  { itemId: "refill", label: "Instant Refill", weight: 1 },
];

/** Premium Boost sub-roll (weights = %). Includes Expanded Energy. */
export const MYSTERY_PREMIUM_ITEMS: Array<{ itemId: string; label: string; weight: number }> = [
  { itemId: "bot", label: "Weekend Bot", weight: 20 },
  { itemId: "grinder", label: "+2K Daily Energy", weight: 20 },
  { itemId: "expanded_energy", label: "Expanded Energy", weight: 20 },
  { itemId: "x2_boost", label: "Double Power", weight: 15 },
  { itemId: "whale", label: "+5K Daily Energy", weight: 13 },
  { itemId: "x3_boost", label: "Triple Power", weight: 12 },
];

/** Exclusive NFT sub-roll (Common elves 20% each; Locksmith + Star 10% each) */
export const MYSTERY_NFT_ROLL: Array<{
  kind: string;
  rarity: string;
  label: string;
  weight: number;
}> = [
  { kind: "fate", rarity: "common", label: "Fate Common", weight: 20 },
  { kind: "echo", rarity: "common", label: "Echo Common", weight: 20 },
  { kind: "rush", rarity: "common", label: "Rush Common", weight: 20 },
  { kind: "shadow", rarity: "common", label: "Shadow Common", weight: 20 },
  { kind: "locksmith", rarity: "rare", label: "GiftLocksmith", weight: 10 },
  { kind: "star", rarity: "shard", label: "Star Badge", weight: 10 },
];

function weightedPick<T extends { weight: number }>(
  rows: T[],
  rng: () => number = Math.random,
): T {
  const total = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0) || 1;
  let x = rng() * total;
  for (const r of rows) {
    x -= Number(r.weight) || 0;
    if (x <= 0) return r;
  }
  return rows[0];
}

export type MysteryReward = {
  prizeId: string;
  label: string;
  type: string;
  dest: string;
  itemId?: string;
  amount?: number;
  nftKind?: string;
  nftRarity?: string;
  pending?: boolean;
};

/**
 * Top roll by badge burn tier, then sub-roll for free / premium / NFT.
 * shards_bulk → immediate G2Ushards.
 * bonus_g2u / exclusive_nft → paid from Mystery vault (10% allocation);
 *   queued until MYSTERY_PAYOUTS_LIVE + vault secrets (see mysteryVault.ts).
 */
export function rollMystery(
  tier: string,
  rng: () => number = Math.random,
): MysteryReward {
  const odds = MYSTERY_ODDS[tier] || MYSTERY_ODDS.bronze;
  const amounts = MYSTERY_SHARD_AMOUNTS[tier] || MYSTERY_SHARD_AMOUNTS.bronze;
  const entries = Object.entries(odds).filter(([, w]) => w > 0);
  const top = weightedPick(
    entries.map(([prizeId, weight]) => ({ prizeId, weight })),
    rng,
  );
  const prizeId = top.prizeId;

  if (prizeId === "free_boost") {
    const pick = weightedPick(MYSTERY_FREE_ITEMS, rng);
    return {
      prizeId: "free_boost",
      label: `Free Boost: ${pick.label} → Backpack`,
      type: "item",
      itemId: pick.itemId,
      dest: "backpack",
    };
  }
  if (prizeId === "premium_boost") {
    const pick = weightedPick(MYSTERY_PREMIUM_ITEMS, rng);
    return {
      prizeId: "premium_boost",
      label: `Premium Boost: ${pick.label} → Backpack`,
      type: "item",
      itemId: pick.itemId,
      dest: "backpack",
    };
  }
  if (prizeId === "exclusive_nft") {
    const pick = weightedPick(MYSTERY_NFT_ROLL, rng);
    return {
      prizeId: "exclusive_nft",
      label: `Exclusive NFT: ${pick.label} (Mystery vault pays mint → your game wallet)`,
      type: "nft_pending",
      nftKind: pick.kind,
      nftRarity: pick.rarity,
      dest: "wallet_nft",
      pending: true,
    };
  }
  if (prizeId === "bonus_g2u") {
    const amount = amounts.bonus_g2u || 0;
    return {
      prizeId: "bonus_g2u",
      label: `Bonus G2U (+${amount.toLocaleString()} from Mystery vault → your game wallet)`,
      type: "g2u_pending",
      amount,
      dest: "wallet",
      pending: true,
    };
  }
  // shards_bulk — immediate mining shards
  const amount = amounts.shards_bulk || 0;
  return {
    prizeId: "shards_bulk",
    label: `G2Ushards (Bulk) (+${amount.toLocaleString()}) → Balance`,
    type: "shards",
    amount,
    dest: "balance",
  };
}

/** Shard shop catalog (server source of truth for costs) */
export const SHARD_SHOP: Record<string, { name: string; cost: number }> = {
  frenzy: { name: "Frenzy Mode", cost: 700 },
  battery: { name: "Expanded Battery", cost: 750 },
  // heavy retired from catalog — replace later
  refill: { name: "Instant Refill", cost: 300 },
  /** Weekly badges for Mystery (in-game shards only; stop-buy in shop-buy) */
  badge_bronze: { name: "Bronze Badge", cost: 10000 },
  badge_silver: { name: "Silver Badge", cost: 30000 },
};

/** Shared stop-buy for badge_bronze / badge_silver shop purchases */
export const BADGE_SHOP_DAY_CAP = 1;
export const BADGE_SHOP_WEEK_CAP = 3;
export const BADGE_SHOP_ITEM_IDS = new Set(["badge_bronze", "badge_silver"]);

export function invObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

/**
 * Effective daily tap CAP for today (what max_daily_limit column should store).
 * Base = Rush cap or 1000 — never use stored max_daily_limit as base (avoids double-count).
 * Adds: Expanded Battery +1000, limit_boost, task_limit_boost, ad_energy_boost.
 */
export function taskLimitBoostFromInv(
  inv: Record<string, unknown>,
  now: Date = new Date(),
): number {
  const b = inv?.task_limit_boost as { amount?: number; expires?: string } | undefined;
  if (!b?.expires) return 0;
  if (new Date(String(b.expires)).getTime() <= now.getTime()) return 0;
  return Math.max(0, Number(b.amount) || 0);
}

export function effectiveDailyLimit(
  row: {
    max_daily_limit?: unknown;
    energy_boost_expires?: unknown;
    limit_boost_amount?: unknown;
    limit_boost_expires?: unknown;
    ad_energy_boost?: unknown;
    ad_energy_expires?: unknown;
    inventory?: unknown;
  },
  now: Date = new Date(),
): number {
  const inv = invObj(row.inventory);
  const rushCap = rushDailyLimitFromInv(inv);
  let n = rushCap > 0 ? rushCap : 1000;
  if (
    row.energy_boost_expires &&
    now < new Date(String(row.energy_boost_expires))
  ) {
    n += 1000;
  }
  if (
    row.limit_boost_expires &&
    now < new Date(String(row.limit_boost_expires))
  ) {
    n += Number(row.limit_boost_amount) || 0;
  }
  n += taskLimitBoostFromInv(inv, now);
  if (
    row.ad_energy_expires &&
    now < new Date(String(row.ad_energy_expires))
  ) {
    n += Math.max(0, Number(row.ad_energy_boost) || 0);
  }
  return Math.max(1000, Math.floor(n));
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

/** Read inventory.echo_active → multiplier (1 if none or durability 0). */
export function echoMultiplierFromInv(inv: Record<string, unknown>): number {
  const raw = inv?.echo_active;
  if (!raw || typeof raw !== "object") return 1;
  const row = raw as Record<string, unknown>;
  // Lazy import avoid circular — inline durability check
  const dur =
    row.durability === undefined || row.durability === null
      ? 100
      : Math.max(0, Number(row.durability) || 0);
  if (dur <= 0) return 1;
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
  const dur =
    row.durability === undefined || row.durability === null
      ? 100
      : Math.max(0, Number(row.durability) || 0);
  if (dur <= 0) return null;
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

/** Rush active → daily base cap; 0 if none or durability 0. */
export function rushDailyLimitFromInv(inv: Record<string, unknown>): number {
  const raw = inv?.rush_active;
  if (!raw || typeof raw !== "object") return 0;
  const row = raw as Record<string, unknown>;
  const dur =
    row.durability === undefined || row.durability === null
      ? 100
      : Math.max(0, Number(row.durability) || 0);
  if (dur <= 0) return 0;
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

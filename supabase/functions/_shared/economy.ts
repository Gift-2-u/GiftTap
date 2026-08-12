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
};

export function tierFromRank(rank: number): string | null {
  const r = Math.floor(Number(rank) || 0);
  if (r === 1) return "diamond";
  if (r === 2) return "gold";
  if (r === 3) return "silver";
  if (r >= 4 && r <= 10) return "bronze";
  return null;
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
  heavy: { name: "Heavy Hands", cost: 750 },
  refill: { name: "Instant Refill", cost: 300 },
};

export function invObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

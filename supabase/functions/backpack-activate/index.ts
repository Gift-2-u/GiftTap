/**
 * Activate a backpack item (server-side). Deducts inventory charge and starts timers.
 * JWT required. Prevents free crate shards / buffs via DevTools.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  invObj,
  effectiveDailyLimit,
} from "../_shared/economy.ts";

const ENERGY_CAP_DEFAULT = 500;

const ACTIVATABLE = new Set([
  "frenzy",
  "battery",
  "heavy",
  "refill",
  "refill_extra",
  "bot",
  "grinder",
  "whale",
  "crate",
  "x2_boost",
  "x3_boost",
  "expanded_energy",
  "frenzy_60",
  "daily_plus_1000",
]);

function energyCapFromInv(inv: Record<string, unknown>, nowMs = Date.now()): number {
  const b = inv?.energy_cap_boost as { cap?: number; expires?: string } | undefined;
  if (!b?.expires) return ENERGY_CAP_DEFAULT;
  if (new Date(String(b.expires)).getTime() <= nowMs) return ENERGY_CAP_DEFAULT;
  const cap = Math.floor(Number(b.cap) || 0);
  return cap >= 1000 ? 1000 : ENERGY_CAP_DEFAULT;
}

function endOfUtcDay(offsetDays = 0, from = new Date()): string {
  const d = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + offsetDays,
      23,
      59,
      59,
      999,
    ),
  );
  return d.toISOString();
}

function utcToday(from = new Date()): string {
  return from.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const itemId = String(body.item_id || body.itemId || "").toLowerCase();
    if (!ACTIVATABLE.has(itemId)) {
      throw new Error("Unknown or non-activatable item");
    }

    const sb = adminClient();
    const { data: row, error: selErr } = await sb
      .from("players")
      .select(
        "inventory, shard_balance, last_energy, daily_usage, frenzy_expires, efficiency_expires, energy_boost_expires, limit_boost_amount, limit_boost_expires, ad_energy_boost, ad_energy_expires, premium_multiplier, premium_multiplier_expires, bot_expires, max_daily_limit",
      )
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const have = Math.max(0, Math.floor(Number(inv[itemId]) || 0));
    if (have <= 0) throw new Error(`No ${itemId} in backpack`);

    // daily_usage: column and/or inventory.daily_usage
    let dailyUsage: Record<string, string> = {};
    if (row.daily_usage && typeof row.daily_usage === "object") {
      dailyUsage = { ...(row.daily_usage as Record<string, string>) };
    }
    if (inv.daily_usage && typeof inv.daily_usage === "object") {
      dailyUsage = {
        ...dailyUsage,
        ...(inv.daily_usage as Record<string, string>),
      };
    }
    const today = utcToday();
    const TOKEN_LAUNCH_AT = Date.parse("2026-09-01T00:00:00Z");
    const afterLaunch = Date.now() >= TOKEN_LAUNCH_AT;
    // Free Battery Refill: 1× / UTC day after launch. Extra Battery Refill: no day lock.
    const refillOncePerDay = itemId === "refill" && afterLaunch;
    const isExtraRefill = itemId === "refill_extra";
    if (
      dailyUsage[itemId] === today &&
      itemId !== "crate" &&
      !isExtraRefill &&
      (itemId !== "refill" || refillOncePerDay)
    ) {
      if (refillOncePerDay) {
        throw new Error(
          "Battery Refill already used today (UTC). Use Extra Battery Refill from Premium, or wait until midnight UTC.",
        );
      }
      throw new Error(`Already used ${itemId} today (UTC). Wait until midnight.`);
    }

    // Deduct charge — set 0 then delete so clients never re-merge a ghost qty
    if (have <= 1) {
      inv[itemId] = 0;
      delete inv[itemId];
    } else {
      inv[itemId] = have - 1;
    }

    if (
      itemId !== "crate" &&
      !isExtraRefill &&
      (itemId !== "refill" || refillOncePerDay)
    ) {
      dailyUsage[itemId] = today;
    }
    inv.daily_usage = dailyUsage;

    const now = Date.now();
    const updates: Record<string, unknown> = {
      inventory: inv,
      last_updated: new Date(now).toISOString(),
    };

    let shard_balance = Number(row.shard_balance) || 0;
    let last_energy = Number(row.last_energy);
    const ENERGY_CAP = energyCapFromInv(inv, now);
    if (!Number.isFinite(last_energy)) last_energy = ENERGY_CAP;

    if (itemId === "frenzy") {
      // Shards ×2 for 30s only — do NOT touch last_energy / energy_at
      updates.frenzy_expires = new Date(now + 30 * 1000).toISOString();
    } else if (itemId === "frenzy_60") {
      // Premium 60s Frenzy (same ×2, longer window)
      updates.frenzy_expires = new Date(now + 60 * 1000).toISOString();
    } else if (itemId === "battery") {
      // Expanded daily tap cap +500 (effectiveDailyLimit) — not the 500 energy pool
      updates.energy_boost_expires = endOfUtcDay(0);
      updates.max_daily_limit = effectiveDailyLimit(
        {
          ...row,
          energy_boost_expires: updates.energy_boost_expires,
          inventory: inv,
        },
        new Date(),
      );
    } else if (itemId === "daily_plus_1000") {
      // Premium +1000 max daily taps until UTC midnight (NOT battery pool)
      inv.premium_daily_boost = {
        amount: 1000,
        expires: endOfUtcDay(0),
      };
      updates.inventory = inv;
      updates.max_daily_limit = effectiveDailyLimit(
        {
          ...row,
          inventory: inv,
        },
        new Date(),
      );
    } else if (itemId === "heavy") {
      // Heavy Hands retired from shop — block new activates (replace later).
      throw new Error("Heavy Hands is unavailable right now.");
    } else if (itemId === "refill" || itemId === "refill_extra") {
      last_energy = ENERGY_CAP;
      updates.last_energy = ENERGY_CAP;
      updates.energy_at = new Date(now).toISOString();
    } else if (itemId === "bot") {
      updates.bot_expires = endOfUtcDay(2);
    } else if (itemId === "grinder") {
      updates.limit_boost_amount = 2000;
      updates.limit_boost_expires = endOfUtcDay(6);
    } else if (itemId === "whale") {
      updates.limit_boost_amount = 5000;
      updates.limit_boost_expires = endOfUtcDay(6);
    } else if (itemId === "crate") {
      shard_balance = Math.round((shard_balance + 50000) * 1000) / 1000;
      updates.shard_balance = shard_balance;
    } else if (itemId === "x2_boost") {
      updates.premium_multiplier = 2;
      updates.premium_multiplier_expires = endOfUtcDay(6);
    } else if (itemId === "x3_boost") {
      updates.premium_multiplier = 3;
      updates.premium_multiplier_expires = endOfUtcDay(6);
    } else if (itemId === "expanded_energy") {
      // Battery bar 500 → 1000 for 7 UTC days (same window as grinder/x2)
      inv.energy_cap_boost = {
        cap: 1000,
        expires: endOfUtcDay(6),
      };
      updates.inventory = inv;
      // Raise bar toward new cap if already near old full (500)
      if (Number.isFinite(last_energy) && last_energy >= ENERGY_CAP_DEFAULT - 0.001) {
        updates.last_energy = 1000;
        updates.energy_at = new Date(now).toISOString();
      }
    }

    // Try with daily_usage column; if column missing, retry inventory-only
    let upErr = (await sb.from("players").update({ ...updates, daily_usage: dailyUsage }).eq("telegram_id", playerId)).error;
    if (upErr && /daily_usage|column/i.test(String(upErr.message || ""))) {
      upErr = (await sb.from("players").update(updates).eq("telegram_id", playerId)).error;
    }
    if (upErr) throw upErr;

    // Re-read ground truth so client cannot keep a ghost qty
    const { data: verified } = await sb
      .from("players")
      .select("inventory, shard_balance, last_energy, daily_usage")
      .eq("telegram_id", playerId)
      .maybeSingle();

    const outInv = invObj(verified?.inventory ?? inv);
    // Ensure consumed item is gone if still present due to race / stale write
    const still = Math.max(0, Math.floor(Number(outInv[itemId]) || 0));
    const expect = have <= 1 ? 0 : have - 1;
    if (still > expect) {
      if (expect <= 0) {
        outInv[itemId] = 0;
        delete outInv[itemId];
      } else {
        outInv[itemId] = expect;
      }
      await sb
        .from("players")
        .update({
          inventory: outInv,
          last_updated: new Date().toISOString(),
        })
        .eq("telegram_id", playerId);
    } else if (still <= 0) {
      outInv[itemId] = 0;
      delete outInv[itemId];
    }
    // Merge daily_usage into inventory for clients that only read inventory
    let outDaily = dailyUsage;
    if (verified?.daily_usage && typeof verified.daily_usage === "object") {
      outDaily = { ...outDaily, ...(verified.daily_usage as Record<string, string>) };
    }
    if (outInv.daily_usage && typeof outInv.daily_usage === "object") {
      outDaily = { ...outDaily, ...(outInv.daily_usage as Record<string, string>) };
    }
    if (itemId !== "refill" && itemId !== "refill_extra" && itemId !== "crate") {
      outDaily[itemId] = today;
    }
    if (itemId === "refill" && refillOncePerDay) {
      outDaily.refill = today;
    }
    outInv.daily_usage = outDaily;
    // Never return a ghost charge for the item just activated
    if (expect <= 0) {
      outInv[itemId] = 0;
      delete outInv[itemId];
    } else {
      outInv[itemId] = Math.min(
        Math.max(0, Math.floor(Number(outInv[itemId]) || 0)),
        expect,
      );
    }

    await logEconomy(sb, {
      player_id: playerId,
      kind: "backpack_activate",
      delta: itemId === "crate" ? 50000 : 0,
      balance_after: Number(verified?.shard_balance) || shard_balance,
      ref: itemId,
      meta: { dailyUsage: outDaily[itemId] || null },
    });

    // Battery Refill / Extra change the 500 energy pool
    const isAnyRefill = itemId === "refill" || itemId === "refill_extra";
    const outEnergy = isAnyRefill
      ? ENERGY_CAP
      : Number.isFinite(Number(verified?.last_energy))
        ? Number(verified?.last_energy)
        : last_energy;

    return jsonResponse({
      success: true,
      item_id: itemId,
      inventory: outInv,
      shard_balance: Number(verified?.shard_balance) || shard_balance,
      last_energy: isAnyRefill ? outEnergy : undefined,
      energy_at:
        isAnyRefill && updates.energy_at != null
          ? String(updates.energy_at)
          : undefined,
      updates: { ...updates, inventory: outInv },
      daily_usage: outDaily,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
      message,
    )
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});

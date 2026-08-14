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
} from "../_shared/economy.ts";

const ENERGY_CAP = 500;

const ACTIVATABLE = new Set([
  "frenzy",
  "battery",
  "heavy",
  "refill",
  "bot",
  "grinder",
  "whale",
  "crate",
  "x2_boost",
  "x3_boost",
]);

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
        "inventory, shard_balance, last_energy, daily_usage, frenzy_expires, efficiency_expires, energy_boost_expires, limit_boost_amount, limit_boost_expires, premium_multiplier, premium_multiplier_expires, bot_expires",
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
    if (dailyUsage[itemId] === today && itemId !== "refill" && itemId !== "crate") {
      throw new Error(`Already used ${itemId} today (UTC). Wait until midnight.`);
    }

    // Deduct charge — force remove key when 0
    if (have <= 1) {
      delete inv[itemId];
    } else {
      inv[itemId] = have - 1;
    }

    if (itemId !== "refill" && itemId !== "crate") {
      dailyUsage[itemId] = today;
    }
    inv.daily_usage = dailyUsage;

    const now = Date.now();
    const updates: Record<string, unknown> = {
      inventory: inv,
      last_updated: new Date().toISOString(),
    };

    let shard_balance = Number(row.shard_balance) || 0;
    let last_energy = Number(row.last_energy);
    if (!Number.isFinite(last_energy)) last_energy = ENERGY_CAP;

    if (itemId === "frenzy") {
      updates.frenzy_expires = new Date(now + 60 * 1000).toISOString();
    } else if (itemId === "battery") {
      updates.energy_boost_expires = endOfUtcDay(0);
    } else if (itemId === "heavy") {
      updates.efficiency_expires = endOfUtcDay(0);
    } else if (itemId === "refill") {
      last_energy = ENERGY_CAP;
      updates.last_energy = ENERGY_CAP;
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
    // Ensure consumed item is gone if still present due to race
    const still = Math.max(0, Math.floor(Number(outInv[itemId]) || 0));
    if (still >= have) {
      if (have <= 1) delete outInv[itemId];
      else outInv[itemId] = have - 1;
      await sb.from("players").update({ inventory: outInv, last_updated: new Date().toISOString() }).eq("telegram_id", playerId);
    }
    // Merge daily_usage into inventory for clients that only read inventory
    let outDaily = dailyUsage;
    if (verified?.daily_usage && typeof verified.daily_usage === "object") {
      outDaily = { ...outDaily, ...(verified.daily_usage as Record<string, string>) };
    }
    if (outInv.daily_usage && typeof outInv.daily_usage === "object") {
      outDaily = { ...outDaily, ...(outInv.daily_usage as Record<string, string>) };
    }
    if (itemId !== "refill" && itemId !== "crate") {
      outDaily[itemId] = today;
    }
    outInv.daily_usage = outDaily;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "backpack_activate",
      delta: itemId === "crate" ? 50000 : 0,
      balance_after: Number(verified?.shard_balance) || shard_balance,
      ref: itemId,
      meta: { dailyUsage: outDaily[itemId] || null },
    });

    return jsonResponse({
      success: true,
      item_id: itemId,
      inventory: outInv,
      shard_balance: Number(verified?.shard_balance) || shard_balance,
      last_energy: Number(verified?.last_energy) || last_energy,
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

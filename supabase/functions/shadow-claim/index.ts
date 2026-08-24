/**
 * shadow-claim — once per UTC day claim yield while Shadow is active.
 * yield = floor((hours/24) * baseDailyCap)
 * baseDailyCap = Rush cap or 1000 (no Expanded Battery / task boosts)
 * Credits shard_balance, season, daily_taps, weekly score.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
  logEconomy,
  utcIsoWeekId,
  shadowHours,
  shadowYield,
  shadowBaseDailyCap,
} from "../_shared/economy.ts";
import { applyWeeklyEnergyCredit } from "../_shared/weeklyScore.ts";

function utcTodayStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const sb = adminClient();

    const { data: row, error } = await sb
      .from("players")
      .select(
        "inventory, shard_balance, season_shards, lifetime_taps, daily_taps, weekly_shards, weekly_week_id, last_tap_date, max_daily_limit, username",
      )
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const active = inv.shadow_active;
    if (!active || typeof active !== "object") {
      throw new Error("No Shadow equipped — mint or Equip Shadow first");
    }
    const a = active as Record<string, unknown>;
    const dur =
      a.durability === undefined || a.durability === null
        ? 100
        : Math.max(0, Number(a.durability) || 0);
    if (dur <= 0) {
      throw new Error(
        "Shadow durability is 0% — reload with $G2U in Wallet / Backpack NFT",
      );
    }
    const rarity = String(a.rarity || "").toLowerCase();
    const level = Math.floor(Number(a.level) || 1);
    const hours = Number(a.hours) || shadowHours(rarity, level);
    if (hours <= 0) throw new Error("Invalid Shadow hours");

    const today = utcTodayStr();
    const claimsMap =
      inv.shadow_claims && typeof inv.shadow_claims === "object"
        ? { ...(inv.shadow_claims as Record<string, unknown>) }
        : {};
    if (claimsMap[today]) {
      throw new Error("Shadow already claimed today (UTC)");
    }

    const baseCap = shadowBaseDailyCap(inv, Number(row.max_daily_limit) || 1000);
    const yieldAmt = shadowYield(hours, baseCap);
    if (yieldAmt <= 0) throw new Error("Shadow yield is 0");

    // Daily reset if new day
    let dailyTaps = Number(row.daily_taps) || 0;
    const prevLtd = String(row.last_tap_date || "").slice(0, 10);
    if (prevLtd && prevLtd !== today) dailyTaps = 0;

    const nextBal =
      Math.round(((Number(row.shard_balance) || 0) + yieldAmt) * 1000) / 1000;
    const nextSeason =
      Math.round(((Number(row.season_shards) || 0) + yieldAmt) * 1000) / 1000;
    const nextLife =
      Math.round(((Number(row.lifetime_taps) || 0) + yieldAmt) * 1000) / 1000;
    const nextDaily = dailyTaps + yieldAmt;

    const weeklyCredit = applyWeeklyEnergyCredit({
      prevWeekId: row.weekly_week_id,
      prevWeekly: Number(row.weekly_shards) || 0,
      energySpent: yieldAmt,
      nextDaily,
    });
    inv.weekly_lb = { weekId: weeklyCredit.weekId, score: weeklyCredit.weeklyShards };
    claimsMap[today] = {
      yield: yieldAmt,
      hours,
      base_cap: baseCap,
      rarity,
      level,
      claimed_at: new Date().toISOString(),
    };
    inv.shadow_claims = claimsMap;

    const updates = {
      shard_balance: nextBal,
      season_shards: nextSeason,
      lifetime_taps: nextLife,
      daily_taps: nextDaily,
      weekly_shards: weeklyCredit.weeklyShards,
      weekly_week_id: weeklyCredit.weekId,
      last_tap_date: today,
      inventory: inv,
      last_updated: new Date().toISOString(),
    };

    const { error: upErr } = await sb
      .from("players")
      .update(updates)
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    try {
      await sb.rpc("upsert_weekly_score_ledger", {
        p_week_id: weeklyCredit.weekId,
        p_telegram_id: playerId,
        p_username: String(row.username || ""),
        p_score: weeklyCredit.weeklyShards,
      });
    } catch (e) {
      console.warn("weekly ledger", e);
    }

    await logEconomy(sb, {
      player_id: playerId,
      kind: "shadow_claim",
      delta: yieldAmt,
      balance_after: nextBal,
      ref: today,
      meta: { hours, baseCap, rarity, level, yield: yieldAmt },
    });

    return jsonResponse({
      success: true,
      yield: yieldAmt,
      hours,
      base_cap: baseCap,
      inventory: inv,
      player: updates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
      message,
    )
      ? 401
      : /already claimed/i.test(message)
        ? 409
        : 400;
    return jsonResponse({ error: message }, status);
  }
});

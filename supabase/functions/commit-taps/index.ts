/**
 * commit-taps — server-authoritative mining credit.
 * Client sends { batch_id, taps }; server caps by energy + daily limit + buffs.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  invObj,
  utcIsoWeekId,
} from "../_shared/economy.ts";
import { applyWeeklyEnergyCredit } from "../_shared/weeklyScore.ts";

const ENERGY_CAP = 500;
const ENERGY_SECONDS_PER_POINT = 1.5;

function energyFromAnchor(
  value: number,
  atIso: string | null | undefined,
  nowMs = Date.now(),
): number {
  const base = Number.isFinite(Number(value))
    ? Math.max(0, Math.min(ENERGY_CAP, Number(value)))
    : ENERGY_CAP;
  const at = atIso ? Date.parse(String(atIso)) : NaN;
  const t0 = Number.isFinite(at) ? at : nowMs;
  const seconds = Math.max(0, Math.floor((nowMs - t0) / 1000));
  const gained = Math.floor(seconds / ENERGY_SECONDS_PER_POINT);
  return Math.min(ENERGY_CAP, base + gained);
}

function calculateLevel(taps: number): number {
  if (taps < 50000) return Math.floor(taps / 10000);
  if (taps < 125000) return 5 + Math.floor((taps - 50000) / 15000);
  if (taps < 625000) return 10 + Math.floor((taps - 125000) / 50000);
  if (taps < 2125000) return 20 + Math.floor((taps - 625000) / 150000);
  if (taps < 9125000) return 30 + Math.floor((taps - 2125000) / 350000);
  if (taps < 34125000) return 50 + Math.floor((taps - 9125000) / 1000000);
  if (taps < 109125000) return 75 + Math.floor((taps - 34125000) / 3000000);
  return 100;
}

function getLevelMultiplier(level: number): number {
  if (level >= 100) return 2.0;
  if (level >= 75) return 1.75;
  if (level >= 50) return 1.5;
  if (level >= 30) return 1.4;
  if (level >= 20) return 1.3;
  if (level >= 10) return 1.2;
  if (level >= 5) return 1.15;
  return 1.0;
}

function utcTodayStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function utcYesterdayStr(d = new Date()): string {
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1);
  return new Date(ms).toISOString().slice(0, 10);
}

function streakAfterPlayDay(
  prevLtd: string,
  prevStreak: number,
  today: string,
): number {
  const prev = prevLtd ? String(prevLtd).slice(0, 10) : "";
  const cur = Math.max(0, Number(prevStreak) || 0);
  if (prev === today) return Math.max(0, cur);
  if (prev && prev === utcYesterdayStr()) return cur + 1;
  return 1;
}

function taskLimitBoost(inv: Record<string, unknown>, now: Date): number {
  const b = inv.task_limit_boost as { amount?: number; expires?: string } | undefined;
  if (!b?.expires) return 0;
  if (new Date(b.expires).getTime() <= now.getTime()) return 0;
  return Math.max(0, Number(b.amount) || 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const batchId = String(body.batch_id || body.batchId || "").trim();
    const requestedTaps = Math.max(0, Math.floor(Number(body.taps) || 0));

    if (!batchId || batchId.length < 8) {
      throw new Error("batch_id required");
    }
    if (requestedTaps <= 0) {
      throw new Error("taps must be > 0");
    }
    if (requestedTaps > 500) {
      throw new Error("taps batch too large (max 500)");
    }

    const sb = adminClient();

    // Idempotent replay
    const { data: prior } = await sb
      .from("tap_batches")
      .select("taps, shards, energy_spent, result")
      .eq("batch_id", batchId)
      .maybeSingle();
    if (prior) {
      const { data: player } = await sb
        .from("players")
        .select(
          "shard_balance, lifetime_taps, season_shards, weekly_shards, weekly_week_id, daily_taps, last_energy, last_tap_date, current_streak, max_unlocked_level, inventory",
        )
        .eq("telegram_id", playerId)
        .maybeSingle();
      return jsonResponse({
        success: true,
        replay: true,
        batch_id: batchId,
        taps: prior.taps,
        shards: prior.shards,
        energy_spent: prior.energy_spent,
        player,
      });
    }

    const { data: row, error: selErr } = await sb
      .from("players")
      .select(
        "telegram_id, username, shard_balance, lifetime_taps, season_shards, weekly_shards, weekly_week_id, daily_taps, last_energy, last_updated, last_tap_date, current_streak, max_unlocked_level, max_daily_limit, inventory, frenzy_expires, efficiency_expires, energy_boost_expires, limit_boost_amount, limit_boost_expires, premium_multiplier, premium_multiplier_expires",
      )
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const now = new Date();
    const today = utcTodayStr(now);
    const inv = invObj(row.inventory);

    // Energy regen from last save timestamp
    const energy = energyFromAnchor(
      Number(row.last_energy),
      row.last_updated,
      now.getTime(),
    );

    // Daily limit
    let maxLimit = Number(row.max_daily_limit) || 1000;
    if (
      row.energy_boost_expires &&
      now < new Date(String(row.energy_boost_expires))
    ) {
      maxLimit += 1000;
    }
    if (
      row.limit_boost_expires &&
      now < new Date(String(row.limit_boost_expires))
    ) {
      maxLimit += Number(row.limit_boost_amount) || 0;
    }
    maxLimit += taskLimitBoost(inv, now);

    const prevLtd = String(row.last_tap_date || "").slice(0, 10);
    const lastUpdatedDay = row.last_updated
      ? String(row.last_updated).slice(0, 10)
      : "";
    let dailyTaps = Number(row.daily_taps) || 0;
    let streak = Math.max(0, Number(row.current_streak) || 0);
    // Only reset on a confirmed previous play day.
    // Missing last_tap_date + same-day last_updated must KEEP daily_taps
    // (otherwise a full bar freezes at 0 and players get another 1000).
    if (prevLtd && prevLtd !== today) {
      dailyTaps = 0;
    } else if (!prevLtd && lastUpdatedDay && lastUpdatedDay !== today) {
      dailyTaps = 0;
    }

    // Buffs
    let payoutMultiplier = 1;
    let costMultiplier = 1;
    if (row.frenzy_expires && now < new Date(String(row.frenzy_expires))) {
      payoutMultiplier *= 2;
    }
    if (
      row.efficiency_expires &&
      now < new Date(String(row.efficiency_expires))
    ) {
      payoutMultiplier *= 2;
      costMultiplier *= 2;
    }
    if (
      row.premium_multiplier_expires &&
      now < new Date(String(row.premium_multiplier_expires))
    ) {
      payoutMultiplier *= Number(row.premium_multiplier) || 1;
    }

    const lifetime = Number(row.lifetime_taps) || 0;
    const maxU = Number(row.max_unlocked_level) || 4;
    const level = Math.min(calculateLevel(lifetime), maxU);
    const baseRate = getLevelMultiplier(level);

    const byEnergy = Math.floor(energy / costMultiplier);
    const byDaily = Math.floor(Math.max(0, maxLimit - dailyTaps) / costMultiplier);
    const validTaps = Math.min(requestedTaps, byEnergy, byDaily);

    if (validTaps <= 0) {
      // Heal missing last_tap_date when daily progress already exists today
      // so subsequent client day-roll logic does not wipe the bar.
      if (dailyTaps > 0 && prevLtd !== today) {
        await sb
          .from("players")
          .update({ last_tap_date: today, last_updated: now.toISOString() })
          .eq("telegram_id", playerId);
      }
      return jsonResponse({
        success: true,
        taps: 0,
        shards: 0,
        energy_spent: 0,
        reason: energy < costMultiplier ? "no_energy" : "daily_limit",
        player: {
          shard_balance: Number(row.shard_balance) || 0,
          lifetime_taps: lifetime,
          season_shards: Number(row.season_shards) || 0,
          weekly_shards: Number(row.weekly_shards) || 0,
          weekly_week_id: row.weekly_week_id,
          daily_taps: dailyTaps,
          last_energy: energy,
          // If they already have today's progress, always surface today so client won't day-roll wipe
          last_tap_date: dailyTaps > 0 ? today : (prevLtd || null),
          current_streak: streak,
          max_unlocked_level: maxU,
          inventory: inv,
        },
      });
    }

    // First valid tap of UTC day → streak
    if (prevLtd !== today) {
      streak = streakAfterPlayDay(prevLtd, streak, today);
    }

    const shardsEarned =
      Math.round(baseRate * payoutMultiplier * validTaps * 1000) / 1000;
    const energySpent = costMultiplier * validTaps;
    const nextEnergy = Math.max(0, Math.min(ENERGY_CAP, energy - energySpent));
    const nextDaily = dailyTaps + energySpent;
    const nextLife = Math.round((lifetime + shardsEarned) * 1000) / 1000;
    const nextSeason =
      Math.round(((Number(row.season_shards) || 0) + shardsEarned) * 1000) / 1000;
    const nextBal =
      Math.round(((Number(row.shard_balance) || 0) + shardsEarned) * 1000) / 1000;

    // Weekly = ENERGY this UTC week (same unit as daily_taps) for EVERY player.
    const weeklyCredit = applyWeeklyEnergyCredit({
      now,
      prevWeekId: row.weekly_week_id,
      prevWeekly: Number(row.weekly_shards) || 0,
      energySpent,
      nextDaily,
    });
    const weekId = weeklyCredit.weekId;
    const weeklyShards = weeklyCredit.weeklyShards;
    inv.weekly_lb = { weekId, score: weeklyShards };

    // Level-up battery refill (within unlocked tier)
    let finalEnergy = nextEnergy;
    const prevLevel = Math.min(calculateLevel(lifetime), maxU);
    const newLevel = Math.min(calculateLevel(nextLife), maxU);
    if (newLevel > prevLevel && newLevel <= maxU) {
      finalEnergy = ENERGY_CAP;
    }

    const updates = {
      shard_balance: nextBal,
      lifetime_taps: nextLife,
      season_shards: nextSeason,
      weekly_shards: weeklyShards,
      weekly_week_id: weekId,
      daily_taps: nextDaily,
      last_energy: finalEnergy,
      last_tap_date: today,
      current_streak: streak,
      inventory: inv,
      last_updated: now.toISOString(),
    };

    const { error: upErr } = await sb
      .from("players")
      .update(updates)
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    // Durable weekly board (GREATEST — never lower)
    try {
      await sb.rpc("upsert_weekly_score_ledger", {
        p_week_id: weekId,
        p_telegram_id: playerId,
        p_username: String((row as Record<string, unknown>).username || ""),
        p_score: weeklyShards,
      });
    } catch (e) {
      console.warn("upsert_weekly_score_ledger", e);
    }

    // Record batch (ignore unique conflict race)
    await sb.from("tap_batches").insert({
      batch_id: batchId,
      player_id: playerId,
      taps: validTaps,
      energy_spent: energySpent,
      shards: shardsEarned,
      result: { baseRate, payoutMultiplier, costMultiplier, level },
    });

    await logEconomy(sb, {
      player_id: playerId,
      kind: "commit_taps",
      delta: shardsEarned,
      balance_after: nextBal,
      ref: batchId,
      meta: { taps: validTaps, energySpent, level, baseRate, payoutMultiplier },
    });

    return jsonResponse({
      success: true,
      replay: false,
      batch_id: batchId,
      taps: validTaps,
      shards: shardsEarned,
      energy_spent: energySpent,
      player: {
        ...updates,
        max_unlocked_level: maxU,
      },
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

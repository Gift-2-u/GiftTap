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
  echoMultiplierFromInv,
  rollFateJackpot,
  effectiveDailyLimit,
} from "../_shared/economy.ts";
import { applyWeeklyEnergyCredit } from "../_shared/weeklyScore.ts";
import {
  drainActiveNfts,
  durabilitySnapshot,
} from "../_shared/nftDurability.ts";

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

/** Wall key → target level after climb (keep in sync with GiftTap ASCENSION_WALLS). */
const WALL_TARGET: Record<number, number> = {
  4: 5,
  9: 10,
  19: 20,
  29: 30,
  49: 50,
  74: 75,
  99: 100,
};

function floorLevelFromMaxUnlocked(maxUnlocked: number): number {
  const m = Math.max(0, Math.floor(Number(maxUnlocked) || 0));
  let floor = 0;
  for (const [wallKey, target] of Object.entries(WALL_TARGET)) {
    if (m > Number(wallKey)) floor = Math.max(floor, target);
  }
  return floor;
}

/** Tap formula + wall-climb floor, capped by unlock. */
function playLevel(taps: number, maxUnlocked: number): number {
  const maxU = Math.max(0, Math.floor(Number(maxUnlocked) || 4));
  return Math.min(
    maxU,
    Math.max(calculateLevel(Number(taps) || 0), floorLevelFromMaxUnlocked(maxU)),
  );
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

/**
 * Additive stack: 1 + Σ(mᵢ − 1).
 * L5 1.15 + Echo 1.1 → 1.25 (NOT 1.15×1.1=1.265).
 */
function stackPayoutMultis(...multis: number[]): number {
  let total = 1;
  for (const raw of multis) {
    const m = Number(raw);
    if (!Number.isFinite(m) || m <= 0) continue;
    total += m - 1;
  }
  return Math.round(Math.max(0, total) * 1000) / 1000;
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

    let { data: row, error: selErr } = await sb
      .from("players")
      .select(
        "telegram_id, username, shard_balance, lifetime_taps, season_shards, weekly_shards, weekly_week_id, daily_taps, daily_shards, last_energy, last_updated, last_tap_date, current_streak, max_unlocked_level, max_daily_limit, inventory, frenzy_expires, efficiency_expires, energy_boost_expires, limit_boost_amount, limit_boost_expires, ad_energy_boost, ad_energy_expires, premium_multiplier, premium_multiplier_expires",
      )
      .eq("telegram_id", playerId)
      .maybeSingle();
    // Until migration 20260822_daily_shards is applied, fall back without daily_shards
    if (selErr && /daily_shards/i.test(String(selErr.message || ""))) {
      ({ data: row, error: selErr } = await sb
        .from("players")
        .select(
          "telegram_id, username, shard_balance, lifetime_taps, season_shards, weekly_shards, weekly_week_id, daily_taps, last_energy, last_updated, last_tap_date, current_streak, max_unlocked_level, max_daily_limit, inventory, frenzy_expires, efficiency_expires, energy_boost_expires, limit_boost_amount, limit_boost_expires, ad_energy_boost, ad_energy_expires, premium_multiplier, premium_multiplier_expires",
        )
        .eq("telegram_id", playerId)
        .maybeSingle());
    }
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

    // Effective daily CAP (persisted to max_daily_limit). daily_taps = raw clicks.
    const maxLimit = effectiveDailyLimit(row as Record<string, unknown>, now);

    const prevLtd = String(row.last_tap_date || "").slice(0, 10);
    const lastUpdatedDay = row.last_updated
      ? String(row.last_updated).slice(0, 10)
      : "";
    let dailyTaps = Number(row.daily_taps) || 0;
    let dailyShards = Number((row as Record<string, unknown>).daily_shards) || 0;
    let streak = Math.max(0, Number(row.current_streak) || 0);
    // Only reset on a confirmed previous play day.
    // Missing last_tap_date + same-day last_updated must KEEP daily_taps
    // (otherwise a full bar freezes at 0 and players get another 1000).
    if (prevLtd && prevLtd !== today) {
      dailyTaps = 0;
      dailyShards = 0;
    } else if (!prevLtd && lastUpdatedDay && lastUpdatedDay !== today) {
      dailyTaps = 0;
      dailyShards = 0;
    }

    // Tap power = additive bonuses (L5 1.15 + Echo 1.1 = 1.25) → stored as tap_power.
    // Frenzy doubles THAT power (1.25 → 2.5), it does not add +1 onto base 1.
    // Fate jackpot replaces Frenzy on that tap: tap_power × jackpotMulti.
    // Energy cost stays 1. Daily bar = raw taps.
    const frenzyOn =
      !!(row.frenzy_expires && now < new Date(String(row.frenzy_expires)));
    const heavyHandsOn = false; // retired — ignore leftover efficiency_expires
    const costMultiplier = 1;
    void heavyHandsOn;
    const premiumMulti =
      row.premium_multiplier_expires &&
      now < new Date(String(row.premium_multiplier_expires))
        ? Number(row.premium_multiplier) || 1
        : 1;
    const echoMulti = echoMultiplierFromInv(inv);

    const lifetime = Number(row.lifetime_taps) || 0;
    const maxU = Number(row.max_unlocked_level) || 4;
    // After wall climb, pay at target level even if lifetime is still just under the XP gate
    const level = playLevel(lifetime, maxU);
    const levelMulti = getLevelMultiplier(level);
    const tapPower = stackPayoutMultis(
      levelMulti,
      premiumMulti,
      echoMulti > 1 ? echoMulti : 1,
    );
    const basePayoutMulti = frenzyOn ? tapPower * 2 : tapPower;

    const byEnergy = Math.floor(energy / costMultiplier);
    // Daily limit bar = raw taps (1 click = 1). Frenzy/Echo/premium multiply
    // shards + weekly/season boards only — they do not burn the bar faster.
    const byDaily = Math.max(0, Math.floor(maxLimit - dailyTaps));
    const validTaps = Math.min(requestedTaps, byEnergy, byDaily);

    if (validTaps <= 0) {
      const reason = energy < costMultiplier ? "no_energy" : "daily_limit";
      const storedEnergy = Number(row.last_energy);
      const storedFinite = Number.isFinite(storedEnergy) ? storedEnergy : 0;
      const healLtd = dailyTaps > 0 && prevLtd !== today;
      const nowIso = now.toISOString();
      // Persist regen'd energy WITH last_updated. Never bump last_updated alone —
      // that resets the regen clock while last_energy stays 0 and freezes mining
      // after a second battery / Instant Refill until the client refreshes.
      let persistedAnchor = false;
      if (healLtd || energy > storedFinite + 0.001) {
        const patch: Record<string, unknown> = {
          last_energy: energy,
          last_updated: nowIso,
        };
        if (healLtd) patch.last_tap_date = today;
        await sb.from("players").update(patch).eq("telegram_id", playerId);
        persistedAnchor = true;
      }
      return jsonResponse({
        success: true,
        taps: 0,
        shards: 0,
        energy_spent: 0,
        reason,
        player: {
          shard_balance: Number(row.shard_balance) || 0,
          lifetime_taps: lifetime,
          season_shards: Number(row.season_shards) || 0,
          weekly_shards: Number(row.weekly_shards) || 0,
          weekly_week_id: row.weekly_week_id,
          daily_taps: dailyTaps,
          last_energy: energy,
          // Only advance client anchor when we actually wrote the catch-up
          last_updated: persistedAnchor ? nowIso : (row.last_updated || nowIso),
          // If they already have today's progress, always surface today so client won't day-roll wipe
          last_tap_date: dailyTaps > 0 ? today : (prevLtd || null),
          current_streak: streak,
          max_unlocked_level: maxU,
          inventory: inv,
          frenzy_expires: row.frenzy_expires,
          efficiency_expires: row.efficiency_expires,
        },
      });
    }

    // First valid tap of UTC day → streak
    if (prevLtd !== today) {
      streak = streakAfterPlayDay(prevLtd, streak, today);
    }

    // Per-tap payout: Fate jackpot replaces Frenzy → tap_power × jackpot multi
    let shardsEarned = 0;
    let scoreCredit = 0;
    let jackpotHits = 0;
    let jackpotBestMulti = 0;
    let payoutMultiplier = basePayoutMulti; // summary / batch avg reference
    const jackpotLog: Array<{ multi: number; rung: number; rarity: string }> = [];
    for (let i = 0; i < validTaps; i++) {
      const hit = rollFateJackpot(inv);
      let tapMulti: number;
      if (hit) {
        // Fate replaces Frenzy: same base tap_power, times jackpot multi
        tapMulti = Math.round(tapPower * hit.multi * 1000) / 1000;
        jackpotHits += 1;
        jackpotBestMulti = Math.max(jackpotBestMulti, hit.multi);
        if (jackpotLog.length < 5) jackpotLog.push(hit);
      } else {
        tapMulti = basePayoutMulti;
      }
      shardsEarned += tapMulti;
      scoreCredit += tapMulti;
    }
    shardsEarned = Math.round(shardsEarned * 1000) / 1000;
    scoreCredit = Math.round(scoreCredit * 1000) / 1000;
    if (validTaps > 0) {
      payoutMultiplier = Math.round((scoreCredit / validTaps) * 1000) / 1000;
    }
    const energySpent = costMultiplier * validTaps;
    const nextEnergy = Math.max(0, Math.min(ENERGY_CAP, energy - energySpent));
    // daily_taps = raw clicks (HUD bar). daily_shards = weighted mining today.
    const limitCredit = validTaps;
    const nextDaily = dailyTaps + limitCredit;
    const nextDailyShards =
      Math.round((dailyShards + shardsEarned) * 1000) / 1000;
    const nextLife = Math.round((lifetime + shardsEarned) * 1000) / 1000;
    const nextSeason =
      Math.round(((Number(row.season_shards) || 0) + shardsEarned) * 1000) / 1000;
    const nextBal =
      Math.round(((Number(row.shard_balance) || 0) + shardsEarned) * 1000) / 1000;

    // Weekly board = payout-weighted (Frenzy/x2/x3/Echo/Fate). Daily bar stays raw taps.
    const weeklyCredit = applyWeeklyEnergyCredit({
      now,
      prevWeekId: row.weekly_week_id,
      prevWeekly: Number(row.weekly_shards) || 0,
      energySpent: scoreCredit,
      nextDaily,
    });
    const weekId = weeklyCredit.weekId;
    const weeklyShards = weeklyCredit.weeklyShards;
    inv.weekly_lb = { weekId, score: weeklyShards };

    // Mining NFT durability: 1% per 1,000 raw taps (Echo/Fate/Rush/Shadow)
    drainActiveNfts(inv, validTaps);

    // Level-up battery refill (within unlocked tier)
    let finalEnergy = nextEnergy;
    const prevLevel = playLevel(lifetime, maxU);
    const newLevel = playLevel(nextLife, maxU);
    if (newLevel > prevLevel && newLevel <= maxU) {
      finalEnergy = ENERGY_CAP;
    }
    // Persist base tap power (no Frenzy) so HUD / DB show 1.25 not 2.5
    const tapPowerAfter = stackPayoutMultis(
      getLevelMultiplier(newLevel),
      premiumMulti,
      echoMulti > 1 ? echoMulti : 1,
    );

    const updates: Record<string, unknown> = {
      shard_balance: nextBal,
      lifetime_taps: nextLife,
      season_shards: nextSeason,
      weekly_shards: weeklyShards,
      weekly_week_id: weekId,
      daily_taps: nextDaily,
      daily_shards: nextDailyShards,
      max_daily_limit: maxLimit,
      last_energy: finalEnergy,
      last_tap_date: today,
      current_streak: streak,
      inventory: inv,
      tap_power: tapPowerAfter,
      last_updated: now.toISOString(),
    };

    let { error: upErr } = await sb
      .from("players")
      .update(updates)
      .eq("telegram_id", playerId);
    if (upErr && /daily_shards/i.test(String(upErr.message || ""))) {
      const { daily_shards: _drop, ...rest } = updates;
      ({ error: upErr } = await sb
        .from("players")
        .update(rest)
        .eq("telegram_id", playerId));
    }
    if (upErr) throw upErr;

    // Durable boards (GREATEST — never lower). Same model for weekly/season/lifetime.
    const boardUsername = String((row as Record<string, unknown>).username || "");
    try {
      await sb.rpc("upsert_weekly_score_ledger", {
        p_week_id: weekId,
        p_telegram_id: playerId,
        p_username: boardUsername,
        p_score: weeklyShards,
      });
    } catch (e) {
      console.warn("upsert_weekly_score_ledger", e);
    }
    try {
      await sb.rpc("upsert_season_score_ledger", {
        p_telegram_id: playerId,
        p_username: boardUsername,
        p_score: nextSeason,
      });
    } catch (e) {
      console.warn("upsert_season_score_ledger", e);
    }
    try {
      await sb.rpc("upsert_lifetime_score_ledger", {
        p_telegram_id: playerId,
        p_username: boardUsername,
        p_score: nextLife,
      });
    } catch (e) {
      console.warn("upsert_lifetime_score_ledger", e);
    }

    // Record batch (ignore unique conflict race)
    await sb.from("tap_batches").insert({
      batch_id: batchId,
      player_id: playerId,
      taps: validTaps,
      energy_spent: energySpent,
      shards: shardsEarned,
      result: {
        tapPower,
        tapPowerAfter,
        payoutMultiplier,
        costMultiplier,
        frenzyOn,
        heavyHandsOn,
        level,
        scoreCredit,
        limitCredit,
        echoMulti,
        jackpotHits,
        jackpotBestMulti,
        jackpotLog,
      },
    });

    await logEconomy(sb, {
      player_id: playerId,
      kind: "commit_taps",
      delta: shardsEarned,
      balance_after: nextBal,
      ref: batchId,
      meta: {
        taps: validTaps,
        energySpent,
        scoreCredit,
        limitCredit,
        level,
        tapPower,
        payoutMultiplier,
        echoMulti,
        jackpotHits,
        jackpotBestMulti,
      },
    });

    return jsonResponse({
      success: true,
      replay: false,
      batch_id: batchId,
      taps: validTaps,
      shards: shardsEarned,
      energy_spent: energySpent,
      cost_multiplier: costMultiplier,
      frenzy_on: frenzyOn,
      heavy_hands_on: heavyHandsOn,
      tap_power: tapPowerAfter,
      jackpot_hits: jackpotHits,
      jackpot_best_multi: jackpotBestMulti,
      nft_durability: durabilitySnapshot(inv),
      player: {
        ...updates,
        max_unlocked_level: maxU,
        frenzy_expires: row.frenzy_expires,
        efficiency_expires: row.efficiency_expires,
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

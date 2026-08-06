import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function todayUtc(): string {
  return new Date().toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const playerId = String(body.player_id || body.playerId || "").trim();
    const progressToken = String(body.progress_token || body.progressToken || "").trim();
    const proposed = body.progress || body;

    if (!playerId || !progressToken) {
      throw new Error("player_id and progress_token required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: row, error } = await supabase
      .from("players")
      .select(
        "telegram_id, username, is_banned, progress_token, progress_token_expires, lifetime_taps, season_shards, shard_balance, daily_taps, last_tap_date, last_energy, max_daily_limit, max_unlocked_level, last_updated, current_streak, inventory, limit_boost_amount, limit_boost_expires",
      )
      .eq("telegram_id", playerId)
      .maybeSingle();

    if (error) throw error;
    if (!row) throw new Error("Player not found");
    if (row.is_banned) throw new Error("ACCOUNT_BANNED");
    if (!row.progress_token || row.progress_token !== progressToken) {
      throw new Error("Invalid progress session — log in again");
    }
    if (
      row.progress_token_expires &&
      new Date(row.progress_token_expires).getTime() < Date.now()
    ) {
      throw new Error("Progress session expired — log in again");
    }

    const oldLife = Number(row.lifetime_taps) || 0;
    const oldSeason = Number(row.season_shards) || 0;
    const oldShards = Number(row.shard_balance) || 0;
    const oldDaily = Number(row.daily_taps) || 0;
    const oldDate = row.last_tap_date || todayUtc();
    const dailyCap = Math.max(Number(row.max_daily_limit) || 1000, 1000);

    let newLife = Number(proposed.lifetime_taps ?? proposed.ltt ?? oldLife);
    let newSeason = Number(proposed.season_shards ?? proposed.s ?? oldSeason);
    let newShards = Number(proposed.shard_balance ?? proposed.b ?? oldShards);
    let newDaily = Number(proposed.daily_taps ?? proposed.dt ?? oldDaily);
    let newDate = String(proposed.last_tap_date ?? proposed.ltd ?? oldDate);
    let newEnergy = Number(proposed.last_energy ?? proposed.e ?? row.last_energy ?? 500);
    let newStreak = Number(proposed.current_streak ?? proposed.strk ?? row.current_streak ?? 0);
    let newMaxUnlock = Number(
      proposed.max_unlocked_level ?? proposed.mul ?? row.max_unlocked_level ?? 4,
    );

    // Never allow decreases via client proposals for life/season (except explicit admin)
    if (newLife < oldLife) newLife = oldLife;
    if (newSeason < oldSeason) newSeason = oldSeason;

    const gainLife = newLife - oldLife;
    const gainSeason = newSeason - oldSeason;

    // Calendar day reset for daily taps
    const today = todayUtc();
    if (newDate !== today && newDate < today) {
      // client claims new day
    }
    if (oldDate !== today && newDate === today) {
      // crossing into today: daily should be the new day's taps only
      if (newDaily > dailyCap + 20) {
        throw new Error("ANTI_CHEAT: daily_taps over daily cap on new day");
      }
    } else if (newDate === oldDate) {
      // same day: daily can only go up, and not past cap
      if (newDaily < oldDaily) newDaily = oldDaily;
      if (newDaily > dailyCap + 20) {
        throw new Error("ANTI_CHEAT: daily_taps over cap");
      }
      // lifetime gain today roughly tracks daily gain
      const dailyGain = newDaily - oldDaily;
      if (gainLife > dailyGain + 30) {
        // allow small desync, not 1M
        throw new Error(
          `ANTI_CHEAT: lifetime gain ${gainLife} > daily gain ${dailyGain}`,
        );
      }
    }

    // Time-based absolute max for this write (strict)
    const lastUp = row.last_updated ? new Date(row.last_updated).getTime() : Date.now() - 5000;
    let elapsedSec = (Date.now() - lastUp) / 1000;
    if (elapsedSec < 1) elapsedSec = 1;
    if (elapsedSec > 10800) elapsedSec = 10800; // 3h max bank

    // Max taps = daily_cap per day of elapsed + 40 burst (multi-touch)
    let maxGain = Math.ceil((elapsedSec / 86400) * dailyCap) + 40;
    if (maxGain > dailyCap) maxGain = dailyCap;

    if (gainLife > maxGain) {
      throw new Error(
        `ANTI_CHEAT: lifetime +${gainLife} exceeds max ${maxGain} for ${Math.floor(elapsedSec)}s`,
      );
    }
    if (gainSeason > maxGain) {
      throw new Error(
        `ANTI_CHEAT: season +${gainSeason} exceeds max ${maxGain}`,
      );
    }

    // Shards earned should not outrun lifetime much (same tap currency)
    const gainShards = newShards - oldShards;
    if (gainShards > gainLife + 3500) {
      // 3500 = max referral-style credit slack
      throw new Error("ANTI_CHEAT: shard_balance out of sync with lifetime");
    }

    // Energy sanity
    if (newEnergy < 0) newEnergy = 0;
    if (newEnergy > dailyCap + 500) newEnergy = dailyCap + 500;

    if (newLife > 2_000_000) {
      throw new Error("ANTI_CHEAT: lifetime absolute cap");
    }

    const inventory = proposed.inventory ?? row.inventory ?? {};
    const update: Record<string, unknown> = {
      lifetime_taps: newLife,
      season_shards: newSeason,
      shard_balance: newShards,
      daily_taps: newDaily,
      last_tap_date: newDate,
      last_energy: newEnergy,
      current_streak: newStreak,
      max_unlocked_level: newMaxUnlock,
      inventory,
      last_updated: new Date().toISOString(),
    };

    if (proposed.max_daily_limit != null) {
      // client cannot raise max_daily_limit freely beyond reasonable
      const md = Number(proposed.max_daily_limit);
      if (md >= 1000 && md <= 20000) update.max_daily_limit = md;
    }
    if (proposed.limit_boost_amount != null) {
      update.limit_boost_amount = proposed.limit_boost_amount;
    }
    if (proposed.limit_boost_expires != null) {
      update.limit_boost_expires = proposed.limit_boost_expires;
    }

    const { data: saved, error: upErr } = await supabase
      .from("players")
      .update(update)
      .eq("telegram_id", playerId)
      .select(
        "lifetime_taps, season_shards, shard_balance, daily_taps, last_tap_date, last_energy, current_streak, max_unlocked_level, max_daily_limit, inventory, last_updated",
      )
      .maybeSingle();

    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({ success: true, progress: saved }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

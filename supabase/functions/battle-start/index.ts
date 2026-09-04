/**
 * GiftTap Battle — start/join Falling Gifts duel.
 * Entry: ENTRY_ENERGY from battery + same amount added to daily_taps (daily room).
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
import {
  BATTLE,
  energyCapFromInv,
  energyFromAnchor,
} from "../_shared/battle.ts";

function utcDayStartIso(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function randomSeed() {
  const a = crypto.getRandomValues(new Uint32Array(2));
  return `b_${a[0].toString(16)}_${a[1].toString(16)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const sb = adminClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const today = utcDayKey(now);
    const entry = BATTLE.ENTRY_ENERGY;

    const { data: player, error: pErr } = await sb
      .from("players")
      .select(
        "telegram_id, username, is_banned, max_unlocked_level, daily_taps, last_tap_date, last_energy, energy_at, last_updated, max_daily_limit, inventory, energy_boost_expires, limit_boost_amount, limit_boost_expires, ad_energy_boost, ad_energy_expires",
      )
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!player) throw new Error("Player not found");
    if (player.is_banned) throw new Error("Account banned");

    const inv = invObj(player.inventory);
    const cap = energyCapFromInv(inv, now.getTime());
    const energyAnchor =
      (player as Record<string, unknown>).energy_at != null
        ? String((player as Record<string, unknown>).energy_at)
        : player.last_updated
          ? String(player.last_updated)
          : null;
    let energy = energyFromAnchor(Number(player.last_energy), energyAnchor, now.getTime(), cap);

    let dailyTaps = Number(player.daily_taps) || 0;
    const ltd = player.last_tap_date ? String(player.last_tap_date).slice(0, 10) : "";
    if (ltd && ltd < today) dailyTaps = 0;

    const dailyCap = effectiveDailyLimit(
      player as Record<string, unknown>,
      now,
    );
    const dailyLeft = Math.max(0, dailyCap - dailyTaps);

    if (energy < entry) {
      throw new Error(`Need ${entry} energy in your battery (have ${Math.floor(energy)})`);
    }
    if (dailyLeft < entry) {
      throw new Error(
        `Need ${entry} daily taps left (have ${dailyLeft} / ${dailyCap})`,
      );
    }

    const dayStart = utcDayStartIso(now);
    const { count: dayCount, error: cErr } = await sb
      .from("battle_matches")
      .select("id", { count: "exact", head: true })
      .or(`player_a.eq.${playerId},player_b.eq.${playerId}`)
      .gte("created_at", dayStart);
    if (cErr) throw cErr;
    if ((dayCount || 0) >= BATTLE.MAX_DAILY_MATCHES) {
      throw new Error(`Daily Battle limit (${BATTLE.MAX_DAILY_MATCHES}) reached`);
    }

    const { data: existing } = await sb
      .from("battle_matches")
      .select("*")
      .or(`player_a.eq.${playerId},player_b.eq.${playerId}`)
      .in("status", ["open", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const role = existing.player_a === playerId ? "a" : "b";
      const myScore = role === "a" ? existing.score_a : existing.score_b;
      return jsonResponse({
        success: true,
        resumed: true,
        match_id: existing.id,
        seed: existing.seed,
        role,
        status: existing.status,
        entry_energy: existing.entry_energy ?? entry,
        win_badge: existing.win_badge || BATTLE.WIN_BADGE,
        duration_ms: BATTLE.DURATION_MS,
        already_scored: myScore != null,
        opponent_id: role === "a" ? existing.player_b : existing.player_a,
        last_energy: energy,
        daily_taps: dailyTaps,
        max_daily_limit: dailyCap,
      });
    }

    const level = Math.max(0, Math.floor(Number(player.max_unlocked_level) || 0));

    async function debitEntry() {
      const nextEnergy = Math.max(0, energy - entry);
      const nextDaily = dailyTaps + entry;
      const { error: payErr } = await sb
        .from("players")
        .update({
          last_energy: nextEnergy,
          energy_at: nowIso,
          daily_taps: nextDaily,
          last_tap_date: today,
          // last_updated = activity stamp (not energy clock)
          last_updated: nowIso,
        })
        .eq("telegram_id", playerId);
      if (payErr) throw payErr;
      energy = nextEnergy;
      dailyTaps = nextDaily;
      await logEconomy(sb, {
        player_id: playerId,
        kind: "battle_entry",
        delta: 0,
        ref: "energy",
        meta: { entry_energy: entry, last_energy: nextEnergy, daily_taps: nextDaily },
      });
    }

    const { data: openMatch } = await sb
      .from("battle_matches")
      .select("*")
      .eq("status", "open")
      .is("player_b", null)
      .neq("player_a", playerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let match;
    let role: "a" | "b";

    if (openMatch) {
      await debitEntry();
      const { data: joined, error: jErr } = await sb
        .from("battle_matches")
        .update({
          player_b: playerId,
          level_b: level,
          status: "active",
        })
        .eq("id", openMatch.id)
        .eq("status", "open")
        .is("player_b", null)
        .select("*")
        .maybeSingle();
      if (jErr) throw jErr;
      if (!joined) {
        // Race — refund energy/daily
        await sb
          .from("players")
          .update({
            last_energy: Math.min(cap, energy + entry),
            energy_at: nowIso,
            daily_taps: Math.max(0, dailyTaps - entry),
            last_updated: nowIso,
          })
          .eq("telegram_id", playerId);
        throw new Error("Match taken — try again");
      }
      match = joined;
      role = "b";
    } else {
      await debitEntry();
      const seed = randomSeed();
      const { data: created, error: crErr } = await sb
        .from("battle_matches")
        .insert({
          seed,
          status: "open",
          player_a: playerId,
          level_a: level,
          entry_energy: entry,
          win_badge: BATTLE.WIN_BADGE,
        })
        .select("*")
        .single();
      if (crErr) throw crErr;
      match = created;
      role = "a";
    }

    return jsonResponse({
      success: true,
      resumed: false,
      match_id: match.id,
      seed: match.seed,
      role,
      status: match.status,
      entry_energy: entry,
      win_badge: BATTLE.WIN_BADGE,
      duration_ms: BATTLE.DURATION_MS,
      already_scored: false,
      opponent_id: role === "a" ? match.player_b : match.player_a,
      last_energy: energy,
      daily_taps: dailyTaps,
      max_daily_limit: dailyCap,
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

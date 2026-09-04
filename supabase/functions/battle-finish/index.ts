/**
 * GiftTap Battle — submit score; winner gets backpack badge (badge_bronze).
 * Draw: no badge; energy already spent (no refund — fair anti-abuse).
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
import { BATTLE, validateBattleScore } from "../_shared/battle.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const matchId = String(body.match_id || body.matchId || "").trim();
    const score = Math.floor(Number(body.score) || 0);
    const catches = Math.floor(Number(body.catches) || 0);
    if (!matchId) throw new Error("match_id required");

    const sb = adminClient();
    const { data: match, error: mErr } = await sb
      .from("battle_matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!match) throw new Error("Match not found");

    if (match.status === "done" || match.status === "cancelled") {
      return jsonResponse({
        success: true,
        already: true,
        status: match.status,
        winner_id: match.winner_id,
        score_a: match.score_a,
        score_b: match.score_b,
        win_badge: match.win_badge,
      });
    }

    const isA = match.player_a === playerId;
    const isB = match.player_b === playerId;
    if (!isA && !isB) throw new Error("Not your match");

    const already = isA ? match.score_a != null : match.score_b != null;
    if (already) {
      return jsonResponse({
        success: true,
        already: true,
        status: match.status,
        waiting_for_opponent:
          match.player_b == null || match.score_a == null || match.score_b == null,
        score_a: match.score_a,
        score_b: match.score_b,
        winner_id: match.winner_id,
        win_badge: match.win_badge,
      });
    }

    const check = validateBattleScore({
      score,
      catches,
      seed: match.seed,
      durationMs: BATTLE.DURATION_MS,
    });
    if (!check.ok) throw new Error(check.error);

    const patch: Record<string, unknown> = {};
    if (isA) {
      patch.score_a = score;
      patch.catches_a = catches;
      patch.started_a_at = new Date().toISOString();
    } else {
      patch.score_b = score;
      patch.catches_b = catches;
      patch.started_b_at = new Date().toISOString();
    }
    if (match.status === "open" && match.player_b) patch.status = "active";

    const { data: updated, error: uErr } = await sb
      .from("battle_matches")
      .update(patch)
      .eq("id", matchId)
      .select("*")
      .single();
    if (uErr) throw uErr;

    if (!updated.player_b) {
      return jsonResponse({
        success: true,
        status: updated.status,
        waiting_for_opponent: true,
        your_score: score,
        score_a: updated.score_a,
        score_b: updated.score_b,
        win_badge: updated.win_badge || BATTLE.WIN_BADGE,
        message: "Score saved. Waiting for an opponent…",
      });
    }

    if (updated.score_a == null || updated.score_b == null) {
      return jsonResponse({
        success: true,
        status: updated.status,
        waiting_for_opponent: true,
        your_score: score,
        score_a: updated.score_a,
        score_b: updated.score_b,
        win_badge: updated.win_badge || BATTLE.WIN_BADGE,
        message: "Score saved. Waiting for opponent to finish…",
      });
    }

    const sa = Number(updated.score_a) || 0;
    const sbScore = Number(updated.score_b) || 0;
    let winnerId: string | null = null;
    let draw = false;
    if (sa > sbScore) winnerId = updated.player_a;
    else if (sbScore > sa) winnerId = updated.player_b;
    else draw = true;

    const badgeId = String(updated.win_badge || BATTLE.WIN_BADGE);
    const qty = BATTLE.WIN_BADGE_QTY;
    let inventoryOut: Record<string, unknown> | null = null;

    if (!draw && winnerId) {
      const { data: wrow, error: wErr } = await sb
        .from("players")
        .select("inventory")
        .eq("telegram_id", winnerId)
        .maybeSingle();
      if (wErr) throw wErr;
      const inv = invObj(wrow?.inventory);
      inv[badgeId] = (Number(inv[badgeId]) || 0) + qty;
      const { error: invErr } = await sb
        .from("players")
        .update({ inventory: inv })
        .eq("telegram_id", winnerId);
      if (invErr) throw invErr;
      if (winnerId === playerId) inventoryOut = inv;
      await logEconomy(sb, {
        player_id: winnerId,
        kind: "battle_win_badge",
        delta: 0,
        ref: matchId,
        meta: { badge: badgeId, qty, score_a: sa, score_b: sbScore },
      });
    }

    const { data: finalMatch, error: fErr } = await sb
      .from("battle_matches")
      .update({
        status: "done",
        winner_id: winnerId,
        finished_at: new Date().toISOString(),
      })
      .eq("id", matchId)
      .select("*")
      .single();
    if (fErr) throw fErr;

    return jsonResponse({
      success: true,
      status: "done",
      draw,
      winner_id: winnerId,
      you_won: winnerId === playerId,
      score_a: sa,
      score_b: sbScore,
      win_badge: badgeId,
      badge_qty: draw ? 0 : qty,
      inventory: inventoryOut,
      message: draw
        ? "Draw — no badge (energy spent)"
        : winnerId === playerId
          ? `You won! +${qty} Bronze badge`
          : "Opponent won this duel",
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

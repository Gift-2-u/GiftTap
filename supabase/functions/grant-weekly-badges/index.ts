/**
 * grant-weekly-badges — award YOUR badge from last week's snapshot (if any).
 * Body: { week_id?: string }  default = previous ISO week
 *
 * Each week is independent: +1 badge stack per winning week.
 * Idempotency = claim_log `weekly_badge:<week>:award` (not "already own tier").
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  previousUtcIsoWeekId,
  utcIsoWeekId,
  BADGE_ITEM,
  invObj,
} from "../_shared/economy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const live = utcIsoWeekId();
    const weekId = String(body.week_id || previousUtcIsoWeekId() || "").trim();
    if (!weekId) throw new Error("week_id required");
    if (weekId === live) {
      throw new Error("Cannot grant badges for the live week");
    }

    const sb = adminClient();
    const { data: snap, error: snapErr } = await sb
      .from("weekly_leaderboard_snapshots")
      .select("telegram_id, rank, badge_tier, username, score")
      .eq("week_id", weekId)
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (snapErr) throw snapErr;

    if (!snap || !snap.badge_tier) {
      return jsonResponse({
        success: true,
        week_id: weekId,
        granted: 0,
        repaired: 0,
        skipped: 1,
        reason: "no_prize",
      });
    }

    const tier = String(snap.badge_tier || "").toLowerCase().trim();
    const rank = Number(snap.rank) || 0;
    const itemId = BADGE_ITEM[tier];
    if (!itemId) {
      return jsonResponse({
        success: true,
        week_id: weekId,
        granted: 0,
        skipped: 1,
        reason: "bad_tier",
      });
    }

    const claimKey = `weekly_badge:${weekId}:award`;

    const { data: existing } = await sb
      .from("badge_grants")
      .select("id, tier")
      .eq("player_id", playerId)
      .eq("week_id", weekId)
      .maybeSingle();

    const { data: player, error: pErr } = await sb
      .from("players")
      .select("inventory")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!player) throw new Error("Player not found");

    const inv = invObj(player.inventory);
    const log = Array.isArray(inv.claim_log)
      ? [...(inv.claim_log as string[])]
      : [];
    const alreadyLogged = log.includes(claimKey);

    if (alreadyLogged) {
      return jsonResponse({
        success: true,
        week_id: weekId,
        granted: 0,
        repaired: 0,
        skipped: 1,
        tier,
        rank,
        reason: "already_have",
        inventory: inv,
      });
    }

    if (!existing) {
      const { error: gErr } = await sb.from("badge_grants").insert({
        player_id: playerId,
        week_id: weekId,
        rank,
        tier,
      });
      if (gErr && !/duplicate|unique/i.test(String(gErr.message || ""))) {
        throw gErr;
      }
    } else if (String(existing.tier || "").toLowerCase() !== tier) {
      await sb
        .from("badge_grants")
        .update({ tier, rank })
        .eq("player_id", playerId)
        .eq("week_id", weekId);
    }

    // New week award: always +1 (prior weeks / shop stock do not block)
    const have = Math.max(0, Math.floor(Number(inv[itemId]) || 0));
    inv[itemId] = have + 1;
    inv.weekly_badge_award = {
      weekId,
      tier,
      rank,
      claimedAt: new Date().toISOString(),
      auto: true,
    };
    log.push(claimKey);
    inv.claim_log = log.sort();

    const { error: upErr } = await sb
      .from("players")
      .update({ inventory: inv })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "badge_grant",
      delta: 1,
      ref: weekId,
      meta: { tier, rank, itemId, auto: true },
    });

    return jsonResponse({
      success: true,
      week_id: weekId,
      granted: 1,
      repaired: existing ? 1 : 0,
      skipped: 0,
      tier,
      rank,
      inventory: inv,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
      .test(message)
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});

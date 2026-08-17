import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  previousUtcIsoWeekId,
  tierFromRank,
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
    const weekId = String(body.week_id || previousUtcIsoWeekId());

    const sb = adminClient();

    // Already granted?
    const { data: existing } = await sb
      .from("badge_grants")
      .select("id, tier, rank")
      .eq("player_id", playerId)
      .eq("week_id", weekId)
      .maybeSingle();

    if (existing) {
      const { data: player } = await sb
        .from("players")
        .select("inventory, shard_balance")
        .eq("telegram_id", playerId)
        .maybeSingle();
      // Re-sync backpack if grant exists but badge count missing (hard security freeze left UI empty)
      let inv = invObj(player?.inventory);
      const tier = String(existing.tier || "");
      const itemId = BADGE_ITEM[tier] || (tier ? `badge_${tier}` : "");
      let repaired = false;
      if (itemId) {
        const have = Math.max(0, Math.floor(Number(inv[itemId]) || 0));
        if (have < 1) {
          inv[itemId] = 1;
          inv.weekly_badge_award = {
            weekId,
            tier,
            rank: existing.rank,
            claimedAt: new Date().toISOString(),
            repaired: true,
          };
          const log = Array.isArray(inv.claim_log) ? [...(inv.claim_log as string[])] : [];
          const claimKey = `weekly_badge:${weekId}:award`;
          if (!log.includes(claimKey)) log.push(claimKey);
          inv.claim_log = log.sort();
          await sb
            .from("players")
            .update({ inventory: inv, last_updated: new Date().toISOString() })
            .eq("telegram_id", playerId);
          repaired = true;
        }
      }
      return jsonResponse({
        success: true,
        already: true,
        week_id: weekId,
        tier: existing.tier,
        rank: existing.rank,
        inventory: inv,
        repaired,
      });
    }

    // Official snapshot only
    const { data: snap, error: snapErr } = await sb
      .from("weekly_leaderboard_snapshots")
      .select("rank, score, badge_tier")
      .eq("week_id", weekId)
      .eq("telegram_id", playerId)
      .maybeSingle();

    if (snapErr) throw snapErr;
    if (!snap) {
      throw new Error("No prize for that week (not top 10, or week not finalized).");
    }

    const rank = Number(snap.rank) || 0;
    const tier = String(snap.badge_tier || tierFromRank(rank) || "");
    if (!tier || !BADGE_ITEM[tier]) {
      throw new Error("No badge tier for your rank.");
    }
    // Reject live week claims (snapshot only for finished weeks)
    const liveWeek = (() => {
      const d = new Date();
      const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    })();
    if (weekId === liveWeek) {
      throw new Error("Cannot claim badge for the live week — wait until it ends.");
    }

    const { data: row, error: selErr } = await sb
      .from("players")
      .select("inventory")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const itemId = BADGE_ITEM[tier];
    inv[itemId] = (Number(inv[itemId]) || 0) + 1;
    inv.weekly_badge_award = {
      weekId,
      tier,
      rank,
      claimedAt: new Date().toISOString(),
    };
    const log = Array.isArray(inv.claim_log) ? [...(inv.claim_log as string[])] : [];
    const claimKey = `weekly_badge:${weekId}:award`;
    if (!log.includes(claimKey)) log.push(claimKey);
    inv.claim_log = log.sort();

    const { error: upErr } = await sb
      .from("players")
      .update({ inventory: inv, last_updated: new Date().toISOString() })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await sb.from("badge_grants").insert({
      player_id: playerId,
      week_id: weekId,
      rank,
      tier,
    });

    await logEconomy(sb, {
      player_id: playerId,
      kind: "badge_grant",
      delta: 1,
      ref: weekId,
      meta: { tier, rank, itemId },
    });

    return jsonResponse({
      success: true,
      already: false,
      week_id: weekId,
      tier,
      rank,
      inventory: inv,
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

/**
 * badge-claim-daily — claim YOUR badge from a finished UTC day's snapshot.
 * Body: { day_id?: string }  default = previous UTC day
 * Idempotent: claim_log `daily_badge:<day>:award` + daily_badge_grants row.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  BADGE_ITEM,
  invObj,
} from "../_shared/economy.ts";

function utcDayId(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function previousUtcDayId(d = new Date()): string {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() - 1);
  return utcDayId(x);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const dayId = String(body.day_id || previousUtcDayId()).trim();
    const live = utcDayId();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayId)) {
      throw new Error("day_id must be YYYY-MM-DD");
    }
    if (dayId >= live) {
      throw new Error("Cannot claim badge for the live day — wait until UTC midnight.");
    }

    const sb = adminClient();

    // Ensure yesterday is snapped (no-op if already finalized)
    try {
      await sb.rpc("ensure_daily_leaderboard_rollover");
    } catch {
      /* ignore */
    }

    const { data: existing } = await sb
      .from("daily_badge_grants")
      .select("id, tier, rank")
      .eq("player_id", playerId)
      .eq("day_id", dayId)
      .maybeSingle();

    if (existing) {
      const { data: player } = await sb
        .from("players")
        .select("inventory, shard_balance")
        .eq("telegram_id", playerId)
        .maybeSingle();
      let inv = invObj(player?.inventory);
      const tier = String(existing.tier || "");
      const itemId = BADGE_ITEM[tier] || (tier ? `badge_${tier}` : "");
      const claimKey = `daily_badge:${dayId}:award`;
      const log = Array.isArray(inv.claim_log)
        ? [...(inv.claim_log as string[])]
        : [];
      let repaired = false;
      if (itemId && !log.includes(claimKey)) {
        const have = Math.max(0, Math.floor(Number(inv[itemId]) || 0));
        inv[itemId] = have + 1;
        inv.daily_badge_award = {
          dayId,
          tier,
          rank: existing.rank,
          claimedAt: new Date().toISOString(),
          repaired: true,
        };
        log.push(claimKey);
        inv.claim_log = log.sort();
        await sb
          .from("players")
          .update({ inventory: inv })
          .eq("telegram_id", playerId);
        repaired = true;
      }
      return jsonResponse({
        success: true,
        already: !repaired,
        day_id: dayId,
        tier: existing.tier,
        rank: existing.rank,
        inventory: inv,
        repaired,
      });
    }

    const { data: snap, error: snapErr } = await sb
      .from("daily_leaderboard_snapshots")
      .select("rank, score, badge_tier, username")
      .eq("day_id", dayId)
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (snapErr) throw snapErr;
    if (!snap) {
      throw new Error("No prize for that day (not eligible / not finalized).");
    }

    const rank = Number(snap.rank) || 0;
    const tier = String(snap.badge_tier || "").toLowerCase().trim();
    if (!tier || !BADGE_ITEM[tier]) {
      throw new Error("No badge tier for your rank.");
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
    inv.daily_badge_award = {
      dayId,
      tier,
      rank,
      claimedAt: new Date().toISOString(),
    };
    const log = Array.isArray(inv.claim_log)
      ? [...(inv.claim_log as string[])]
      : [];
    const claimKey = `daily_badge:${dayId}:award`;
    if (!log.includes(claimKey)) log.push(claimKey);
    inv.claim_log = log.sort();

    const { error: upErr } = await sb
      .from("players")
      .update({ inventory: inv })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await sb.from("daily_badge_grants").insert({
      player_id: playerId,
      day_id: dayId,
      rank,
      tier,
    });

    await logEconomy(sb, {
      player_id: playerId,
      kind: "daily_badge_grant",
      delta: 1,
      ref: dayId,
      meta: { tier, rank, itemId },
    });

    return jsonResponse({
      success: true,
      already: false,
      day_id: dayId,
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

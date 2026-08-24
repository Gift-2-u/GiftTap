/**
 * grant-weekly-badges — auto-award badges from weekly_leaderboard_snapshots.
 * Body: { week_id?: string }  default = previous ISO week
 * Idempotent: skips players who already have badge_grants + inventory count.
 * Callable by anyone authenticated (SECURITY: only grants from official snapshots).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const body = await req.json().catch(() => ({}));
    const live = utcIsoWeekId();
    const weekId = String(body.week_id || previousUtcIsoWeekId() || "").trim();
    if (!weekId) throw new Error("week_id required");
    if (weekId === live) {
      throw new Error("Cannot grant badges for the live week");
    }

    const sb = adminClient();
    const { data: snaps, error: snapErr } = await sb
      .from("weekly_leaderboard_snapshots")
      .select("telegram_id, rank, badge_tier, username, score")
      .eq("week_id", weekId)
      .not("badge_tier", "is", null);
    if (snapErr) throw snapErr;

    const rows = Array.isArray(snaps) ? snaps : [];
    let granted = 0;
    let repaired = 0;
    let skipped = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const s of rows) {
      const playerId = String(s.telegram_id || "").trim();
      const tier = String(s.badge_tier || "").toLowerCase().trim();
      const rank = Number(s.rank) || 0;
      const itemId = BADGE_ITEM[tier];
      if (!playerId || !itemId) {
        skipped += 1;
        continue;
      }

      try {
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
        if (!player) {
          skipped += 1;
          continue;
        }

        const inv = invObj(player.inventory);
        const have = Math.max(0, Math.floor(Number(inv[itemId]) || 0));
        let changed = false;

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
          changed = true;
        }

        if (have < 1) {
          inv[itemId] = 1;
          changed = true;
          if (existing) repaired += 1;
          else granted += 1;
        } else {
          skipped += 1;
        }

        inv.weekly_badge_award = {
          weekId,
          tier,
          rank,
          claimedAt: new Date().toISOString(),
          auto: true,
        };
        const log = Array.isArray(inv.claim_log)
          ? [...(inv.claim_log as string[])]
          : [];
        const claimKey = `weekly_badge:${weekId}:award`;
        if (!log.includes(claimKey)) log.push(claimKey);
        inv.claim_log = log.sort();

        if (changed || true) {
          const { error: upErr } = await sb
            .from("players")
            .update({
              inventory: inv,
              last_updated: new Date().toISOString(),
            })
            .eq("telegram_id", playerId);
          if (upErr) throw upErr;
        }

        if (changed) {
          await logEconomy(sb, {
            player_id: playerId,
            kind: "badge_grant",
            delta: 1,
            ref: weekId,
            meta: { tier, rank, itemId, auto: true },
          });
        }
      } catch (e) {
        errors.push({
          id: playerId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonResponse({
      success: true,
      week_id: weekId,
      snapshot_rows: rows.length,
      granted,
      repaired,
      skipped,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});

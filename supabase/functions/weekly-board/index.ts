/**
 * weekly-board — public live weekly leaderboard (READ-ONLY).
 * One source only: players.weekly_shards for the current UTC ISO week.
 * Does not reconcile from tap_batches / ledger / Frenzy.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  utcIsoWeekId,
} from "../_shared/economy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
    const sb = adminClient();
    const weekId = utcIsoWeekId(new Date());

    const { data, error } = await sb
      .from("players")
      .select(
        "telegram_id, username, weekly_shards, weekly_week_id, daily_taps, last_tap_date, last_updated, is_banned",
      )
      .eq("weekly_week_id", weekId)
      .gt("weekly_shards", 0)
      .order("weekly_shards", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = (data || [])
      .filter((r) => r.is_banned !== true)
      .map((r) => {
        const score = Math.max(0, Number(r.weekly_shards) || 0);
        return {
          telegram_id: String(r.telegram_id || ""),
          username: String(r.username || "Player"),
          weekly_shards: score,
          score,
          weekly_week_id: weekId,
          daily_taps: Number(r.daily_taps) || 0,
          last_tap_date:
            r.last_tap_date != null ? String(r.last_tap_date).slice(0, 10) : null,
          last_updated: r.last_updated != null ? String(r.last_updated) : null,
        };
      })
      .filter((r) => r.telegram_id && r.score > 0);

    return jsonResponse({
      success: true,
      week_id: weekId,
      checked: rows.length,
      healed: 0,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});

/**
 * daily-board — live daily leaderboard (READ-ONLY).
 * Source: players.daily_shards for today's UTC day (last_tap_date = today).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
} from "../_shared/economy.ts";

function utcDayId(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
    const sb = adminClient();
    const dayId = utcDayId();

    // Best-effort: finalize yesterday if cron missed (cheap no-op when done)
    try {
      await sb.rpc("ensure_daily_leaderboard_rollover");
    } catch {
      /* ignore */
    }

    const { data, error } = await sb
      .from("players")
      .select(
        "telegram_id, username, daily_shards, daily_taps, last_tap_date, last_updated, is_banned, lifetime_taps, max_unlocked_level",
      )
      .eq("last_tap_date", dayId)
      .gt("daily_shards", 0)
      .order("daily_shards", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = (data || [])
      .filter((r) => r.is_banned !== true)
      .map((r) => {
        const score = Math.max(0, Number(r.daily_shards) || 0);
        return {
          telegram_id: String(r.telegram_id || ""),
          username: String(r.username || "Player"),
          daily_shards: score,
          daily_score: score,
          score,
          day_id: dayId,
          daily_taps: Number(r.daily_taps) || 0,
          lifetime_taps: Number(r.lifetime_taps) || 0,
          max_unlocked_level: Number(r.max_unlocked_level) || 4,
          last_tap_date:
            r.last_tap_date != null ? String(r.last_tap_date).slice(0, 10) : null,
        };
      })
      .filter((r) => r.telegram_id && r.score > 0);

    return jsonResponse({
      success: true,
      day_id: dayId,
      floor: 200,
      checked: rows.length,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});

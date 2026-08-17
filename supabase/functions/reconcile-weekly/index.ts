/**
 * reconcile-weekly — heal weekly_shards for EVERY active miner this week.
 * Uses energy units (daily_taps + tap_batches), never per-player hardcodes.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, jsonResponse } from "../_shared/economy.ts";
import { reconcileAllWeeklyScores } from "../_shared/weeklyScore.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 500);
    const sb = adminClient();
    const result = await reconcileAllWeeklyScores(sb, { limit });
    return jsonResponse({
      success: true,
      week_id: result.weekId,
      checked: result.checked,
      healed: result.healed,
      count: result.board.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});

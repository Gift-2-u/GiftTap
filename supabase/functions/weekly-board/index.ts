/**
 * weekly-board — public live weekly leaderboard (READ-ONLY for players).
 * Does not mass-UPDATE players or last_updated. Scores from ledger + reads.
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
    const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
    const sb = adminClient();
    const result = await reconcileAllWeeklyScores(sb, { limit });
    return jsonResponse({
      success: true,
      week_id: result.weekId,
      checked: result.checked,
      healed: 0,
      rows: result.board,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});

/**
 * weekly-board — public live weekly leaderboard.
 * Reconciles ALL players for this UTC week (energy units), then returns board.
 * No player JWT required (service_role read/heal server-side only).
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
    // Optional: skip heavy write heal if caller only wants a fast read
    // Default: always reconcile so every viewer heals the whole field.
    const sb = adminClient();
    const result = await reconcileAllWeeklyScores(sb, { limit });
    return jsonResponse({
      success: true,
      week_id: result.weekId,
      checked: result.checked,
      healed: result.healed,
      rows: result.board,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});

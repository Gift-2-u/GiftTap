import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
} from "../_shared/economy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const questId = String(body.quest_id || body.questId || "").trim();
    const rewardAmount = Number(body.reward_amount ?? body.p_reward_amount ?? 100) || 100;
    if (!questId) throw new Error("quest_id required");

    const sb = adminClient();
    // Prefer existing SQL RPC (atomic claim + boost)
    const { data, error } = await sb.rpc("claim_weekly_quest", {
      p_telegram_id: playerId,
      p_quest_id: questId,
      p_reward_amount: rewardAmount,
    });
    if (error) throw error;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "weekly_quest_claim",
      delta: 0,
      ref: questId,
      meta: { result: data },
    });

    return jsonResponse({ success: true, ...(typeof data === "object" && data ? data : { data }) });
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

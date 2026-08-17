/**
 * claim-weekly-quest — HARD SECURITY
 * Server picks reward amount from catalog. Client cannot pass arbitrary p_reward_amount.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
} from "../_shared/economy.ts";

/** Canonical weekly quest rewards (shards / flags). Client cannot override. */
const WEEKLY_QUEST_REWARDS: Record<string, number> = {
  daily: 50,
  wq_taps: 100,
  wq_weekly_taps: 150,
  wq_wall: 100,
  wq_mystery: 100,
  wq_share: 50,
  wq_referral: 100,
  wq_forge1: 75,
  wq_forge2: 100,
  wq_probe: 25,
  // stacked weekly +100 style
  wq_week_prize: 0, // prize is separate edge
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const questId = String(body.quest_id || body.questId || "").trim();
    if (!questId) throw new Error("quest_id required");

    // IGNORE client reward_amount entirely
    const rewardAmount =
      WEEKLY_QUEST_REWARDS[questId] !== undefined
        ? WEEKLY_QUEST_REWARDS[questId]
        : 100;
    // Hard cap even unknown ids
    const safeReward = Math.max(0, Math.min(500, Number(rewardAmount) || 0));

    const sb = adminClient();
    const { data, error } = await sb.rpc("claim_weekly_quest", {
      p_telegram_id: playerId,
      p_quest_id: questId,
      p_reward_amount: safeReward,
    });
    if (error) throw error;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "weekly_quest_claim",
      delta: safeReward,
      ref: questId,
      meta: { result: data, server_reward: safeReward },
    });

    return jsonResponse({
      success: true,
      reward_amount: safeReward,
      ...(typeof data === "object" && data ? data : { data }),
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

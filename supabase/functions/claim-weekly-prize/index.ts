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
    const sb = adminClient();
    const { data, error } = await sb.rpc("claim_weekly_prize", {
      p_telegram_id: playerId,
    });
    if (error) throw error;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "weekly_prize_claim",
      ref: "wq_week_prize",
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

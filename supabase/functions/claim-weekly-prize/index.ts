import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  utcIsoWeekId,
  assertWeeklyClaimRateLimit,
  inventoryHasWeeklyClaim,
} from "../_shared/economy.ts";

const PRIZE_ID = "wq_week_prize";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    // Cap spam (still 1 invoke per hit; stops RPC / last_updated thrash)
    assertWeeklyClaimRateLimit(playerId, "weekly-prize", 6, 10 * 60 * 1000);

    const sb = adminClient();
    const weekId = utcIsoWeekId();

    // Already claimed this week → cheap return, no RPC, no last_updated bump
    {
      const { data: row, error: selErr } = await sb
        .from("players")
        .select("inventory")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (inventoryHasWeeklyClaim(row?.inventory, PRIZE_ID, weekId)) {
        return jsonResponse({
          success: true,
          ok: true,
          already: true,
          week_id: weekId,
          quest_id: PRIZE_ID,
          inventory: row?.inventory ?? {},
        });
      }
    }

    const { data, error } = await sb.rpc("claim_weekly_prize", {
      p_telegram_id: playerId,
    });
    if (error) throw error;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "weekly_prize_claim",
      ref: PRIZE_ID,
      meta: { result: data },
    });

    return jsonResponse({
      success: true,
      ...(typeof data === "object" && data ? data : { data }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
      message,
    )
      ? 401
      : /Too many claim attempts/i.test(message)
      ? 429
      : 400;
    return jsonResponse({ error: message }, status);
  }
});

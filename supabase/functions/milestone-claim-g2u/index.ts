/**
 * milestone-claim-g2u — accrue reached level milestones into stacked airdrop_allocations.
 * Actual $G2U payout is Wallet → Claim $G2U (airdrop-claim-g2u), same as weekly/season.
 *
 * Body: {} (optional). Returns open milestone allocation amount after accrue.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
} from "../_shared/economy.ts";
import {
  accruePersonalMilestones,
  MILESTONE_ALLOC_PERIOD,
  MILESTONE_ALLOC_SOURCE,
} from "../_shared/personalMilestone.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);

    const sb = adminClient();
    const { data: row, error } = await sb
      .from("players")
      .select("inventory, lifetime_taps, username")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const lifetimeTaps = Number(row.lifetime_taps) || 0;
    let inv = invObj(row.inventory);

    const accrued = await accruePersonalMilestones(sb, {
      playerId,
      lifetimeTaps,
      inv,
      username: row.username || null,
    });
    inv = accrued.inv;

    if (accrued.granted > 0 || inv.personal_milestone_claimed_level != null) {
      const { error: upErr } = await sb
        .from("players")
        .update({ inventory: inv })
        .eq("telegram_id", playerId);
      if (upErr) throw upErr;
    }

    const { data: openRow } = await sb
      .from("airdrop_allocations")
      .select("id, amount, claimed_at")
      .eq("telegram_id", playerId)
      .eq("source", MILESTONE_ALLOC_SOURCE)
      .eq("period_id", MILESTONE_ALLOC_PERIOD)
      .is("claimed_at", null)
      .maybeSingle();

    const pending = Math.max(0, Number(openRow?.amount) || 0);

    return jsonResponse({
      success: true,
      granted: accrued.granted,
      levels: accrued.levels,
      pending,
      allocation_id: openRow?.id || null,
      inventory: inv,
      message:
        pending > 0
          ? "Claim stacked milestone $G2U in Wallet → Claim $G2U"
          : accrued.granted > 0
            ? "Queued — open Wallet → Claim $G2U"
            : "No new milestone yet",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
      .test(message)
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});

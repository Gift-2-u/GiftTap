/**
 * List unclaimed airdrop allocations for the logged-in player.
 * Accrues reached personal milestones into airdrop_allocations first, then lists
 * pending rows only (claimed rows are omitted → Claim button stays off).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
} from "../_shared/economy.ts";
import { getAirdropVaultConfig } from "../_shared/airdropVault.ts";
import { accruePersonalMilestones } from "../_shared/personalMilestone.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const sb = adminClient();

    // Milestone achieved → stack into pending allocation (same vault path as weekly/season)
    try {
      const { data: prow } = await sb
        .from("players")
        .select("inventory, lifetime_taps, username")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (prow) {
        const accrued = await accruePersonalMilestones(sb, {
          playerId,
          lifetimeTaps: Number(prow.lifetime_taps) || 0,
          inv: invObj(prow.inventory),
          username: prow.username || null,
        });
        if (accrued.granted > 0) {
          const { error: upErr } = await sb
            .from("players")
            .update({ inventory: accrued.inv })
            .eq("telegram_id", playerId);
          if (upErr) console.warn("milestone accrue inventory", upErr.message);
        }
      }
    } catch (e) {
      console.warn(
        "milestone accrue on status",
        e instanceof Error ? e.message : e,
      );
    }

    const { data, error } = await sb
      .from("airdrop_allocations")
      .select(
        "id, source, period_id, amount, weight, created_at, claimed_at, claim_tx",
      )
      .eq("telegram_id", playerId)
      .is("claimed_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const rows = (data || []).map((r) => {
      const source = String(r.source || "") as
        | "l5"
        | "weekly"
        | "monthly"
        | "milestone";
      const vault = getAirdropVaultConfig(source);
      return {
        id: r.id,
        source,
        period_id: r.period_id,
        amount: Number(r.amount) || 0,
        label:
          source === "l5"
            ? "G2U Airdrop (L5+)"
            : source === "weekly"
              ? `Weekly · ${r.period_id}`
              : source === "milestone"
                ? "Personal milestone"
                : `Monthly · ${r.period_id}`,
        detail:
          source === "l5"
            ? "Community L5+ allocation"
            : source === "weekly"
              ? "Weekly board share"
              : source === "milestone"
                ? "Stacked level milestones (one claim)"
                : "Monthly / season board share",
        vault_ready: vault.ready,
      };
    });

    const total = rows.reduce((s, r) => s + r.amount, 0);

    return jsonResponse({
      success: true,
      rows,
      total,
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

/**
 * List unclaimed airdrop allocations for the logged-in player.
 * Read-only — does not touch players.last_updated.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import { adminClient, corsHeaders, jsonResponse } from "../_shared/economy.ts";
import { getAirdropVaultConfig } from "../_shared/airdropVault.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const sb = adminClient();

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
      const source = String(r.source || "") as "l5" | "weekly" | "monthly";
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
              : `Monthly · ${r.period_id}`,
        detail:
          source === "l5"
            ? "Community L5+ allocation"
            : source === "weekly"
              ? "Weekly board share"
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

/**
 * star-level-up — bump inventory.star_levels[asset_id].
 * Body: { asset_id, currency?: 'sol'|'g2u', tx_signature? }
 * Ladder: 0.10 / 0.15 / 0.25 / 0.40 SOL (or × G2U_PER_SOL after launch)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
  logEconomy,
  PLAYER_ECONOMY_SELECT,
  instantEconomyPatch,
  g2uShopEnabled,
  solToG2u,
} from "../_shared/economy.ts";

const STAR_LEVEL_UP_SOL = [0.1, 0.15, 0.25, 0.4];
const MAX_LEVEL = 5;

function readStarLevel(inv: Record<string, unknown>, assetId: string): number {
  const map = inv.star_levels;
  if (map && typeof map === "object") {
    const n = Math.floor(Number((map as Record<string, unknown>)[assetId]) || 0);
    if (n >= 1) return Math.min(MAX_LEVEL, n);
  }
  return 1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const assetId = String(body.asset_id || body.assetId || "").trim();
    const currency = String(body.currency || "sol").toLowerCase().trim();
    const txSignature = body.tx_signature ? String(body.tx_signature) : "";

    if (!assetId || assetId.length < 32) throw new Error("asset_id required");
    if (currency === "g2u") {
      if (!g2uShopEnabled()) {
        throw new Error("Star level-up with $G2U opens after token launch");
      }
    } else if (!txSignature) {
      throw new Error("tx_signature required after SOL payment");
    }

    const sb = adminClient();
    const selectCols =
      currency === "g2u"
        ? `${PLAYER_ECONOMY_SELECT}, gft_token_balance`
        : PLAYER_ECONOMY_SELECT;
    const { data: row, error } = await sb
      .from("players")
      .select(selectCols)
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const fromLevel = readStarLevel(inv, assetId);
    if (fromLevel >= MAX_LEVEL) throw new Error("Already max level (L5)");

    const costSol = STAR_LEVEL_UP_SOL[fromLevel - 1];
    if (!Number.isFinite(costSol)) throw new Error("No level-up cost for this step");
    const costG2u = solToG2u(costSol);

    let gftBal =
      Number((row as { gft_token_balance?: number }).gft_token_balance) || 0;
    if (currency === "g2u") {
      if (gftBal + 1e-9 < costG2u) {
        throw new Error(
          `Need ${costG2u.toLocaleString()} $G2U (have ${Math.floor(gftBal).toLocaleString()})`,
        );
      }
      gftBal = Math.round((gftBal - costG2u) * 1000) / 1000;
    }

    const toLevel = fromLevel + 1;
    const levels =
      inv.star_levels && typeof inv.star_levels === "object"
        ? { ...(inv.star_levels as Record<string, unknown>) }
        : {};
    levels[assetId] = toLevel;
    inv.star_levels = levels;

    const patch = instantEconomyPatch(row as Record<string, unknown>, inv);
    if (currency === "g2u") {
      (patch as Record<string, unknown>).gft_token_balance = gftBal;
    }
    const { data: updated, error: upErr } = await sb
      .from("players")
      .update(patch)
      .eq("telegram_id", playerId)
      .select("inventory, tap_power, max_daily_limit, gft_token_balance")
      .maybeSingle();
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "star_level_up",
      delta: currency === "g2u" ? -costG2u : 0,
      balance_after: currency === "g2u" ? gftBal : null,
      ref: assetId,
      meta: {
        from_level: fromLevel,
        to_level: toLevel,
        cost_sol: costSol,
        cost_g2u: currency === "g2u" ? costG2u : undefined,
        currency,
        tap_power: patch.tap_power,
        tx_signature: txSignature || null,
      },
    });

    return jsonResponse({
      success: true,
      asset_id: assetId,
      from_level: fromLevel,
      to_level: toLevel,
      cost_sol: costSol,
      cost_g2u: currency === "g2u" ? costG2u : undefined,
      currency,
      inventory: updated?.inventory ?? inv,
      tap_power:
        (updated as { tap_power?: number } | null)?.tap_power ?? patch.tap_power,
      gft_token_balance:
        (updated as { gft_token_balance?: number } | null)?.gft_token_balance ??
        (currency === "g2u" ? gftBal : undefined),
      max_daily_limit:
        (updated as { max_daily_limit?: number } | null)?.max_daily_limit ??
        patch.max_daily_limit,
      tx_signature: txSignature,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
        message,
      )
        ? 401
        : 400;
    return jsonResponse({ error: message }, status);
  }
});

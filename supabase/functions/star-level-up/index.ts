/**
 * star-level-up — bump inventory.star_levels[asset_id] after SOL payment.
 * Body: { asset_id, tx_signature }
 * Ladder: 0.10 / 0.15 / 0.25 / 0.40 (one Star for all rarities)
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
    const txSignature = body.tx_signature ? String(body.tx_signature) : "";

    if (!assetId || assetId.length < 32) throw new Error("asset_id required");
    if (!txSignature) throw new Error("tx_signature required after SOL payment");

    const sb = adminClient();
    const { data: row, error } = await sb
      .from("players")
      .select(PLAYER_ECONOMY_SELECT)
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const fromLevel = readStarLevel(inv, assetId);
    if (fromLevel >= MAX_LEVEL) throw new Error("Already max level (L5)");

    const costSol = STAR_LEVEL_UP_SOL[fromLevel - 1];
    if (!Number.isFinite(costSol)) throw new Error("No level-up cost for this step");

    const toLevel = fromLevel + 1;
    const levels =
      inv.star_levels && typeof inv.star_levels === "object"
        ? { ...(inv.star_levels as Record<string, unknown>) }
        : {};
    levels[assetId] = toLevel;
    inv.star_levels = levels;

    const patch = instantEconomyPatch(row as Record<string, unknown>, inv);
    const { data: updated, error: upErr } = await sb
      .from("players")
      .update(patch)
      .eq("telegram_id", playerId)
      .select("inventory, tap_power, max_daily_limit")
      .maybeSingle();
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "star_level_up",
      delta: 0,
      balance_after: null,
      ref: assetId,
      meta: {
        from_level: fromLevel,
        to_level: toLevel,
        cost_sol: costSol,
        tap_power: patch.tap_power,
        tx_signature: txSignature,
      },
    });

    return jsonResponse({
      success: true,
      asset_id: assetId,
      from_level: fromLevel,
      to_level: toLevel,
      cost_sol: costSol,
      inventory: updated?.inventory ?? inv,
      tap_power:
        (updated as { tap_power?: number } | null)?.tap_power ?? patch.tap_power,
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

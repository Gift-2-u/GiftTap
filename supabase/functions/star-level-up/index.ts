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
      if (!txSignature || txSignature.length < 32) {
        throw new Error(
          "tx_signature required — send $G2U on-chain to master first",
        );
      }
    } else if (!txSignature) {
      throw new Error("tx_signature required after SOL payment");
    }

    const sb = adminClient();

    if (txSignature) {
      const { data: prior } = await sb
        .from("economy_events")
        .select("id")
        .eq("player_id", playerId)
        .eq("kind", "star_level_up")
        .eq("ref", txSignature)
        .maybeSingle();
      if (prior) {
        const { data: p } = await sb
          .from("players")
          .select("inventory, tap_power, max_daily_limit, gft_token_balance")
          .eq("telegram_id", playerId)
          .maybeSingle();
        return jsonResponse({
          success: true,
          already: true,
          inventory: p?.inventory || {},
          tap_power: p?.tap_power,
          max_daily_limit: p?.max_daily_limit,
          gft_token_balance: p?.gft_token_balance,
        });
      }
    }

    if (txSignature) {
      const rpc =
        Deno.env.get("SOLANA_RPC_URL") ||
        Deno.env.get("VITE_SOLANA_RPC_URL") ||
        "";
      if (rpc) {
        try {
          const res = await fetch(rpc, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getTransaction",
              params: [
                txSignature,
                { encoding: "json", maxSupportedTransactionVersion: 0 },
              ],
            }),
          });
          const j = await res.json();
          const tx = j?.result;
          if (!tx) {
            console.warn("star-level-up: tx not found yet", txSignature);
          } else if (tx.meta?.err) {
            throw new Error("On-chain level-up payment failed");
          }
        } catch (e) {
          if (e instanceof Error && /failed/i.test(e.message)) throw e;
          console.warn("star-level-up verify skip", e);
        }
      }
    }

    const { data: row, error } = await sb
      .from("players")
      .select(`${PLAYER_ECONOMY_SELECT}, gft_token_balance`)
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
      .select("inventory, tap_power, max_daily_limit, gft_token_balance")
      .maybeSingle();
    if (upErr) throw upErr;

    const written = invObj(updated?.inventory);
    const confirmLvl = readStarLevel(written, assetId);
    if (confirmLvl < toLevel) {
      throw new Error(
        `Level write failed (still L${confirmLvl} in DB). Payment tx: ${txSignature}`,
      );
    }

    await logEconomy(sb, {
      player_id: playerId,
      kind: "star_level_up",
      delta: currency === "g2u" ? -costG2u : 0,
      balance_after: null,
      ref: txSignature || assetId,
      meta: {
        asset_id: assetId,
        from_level: fromLevel,
        to_level: toLevel,
        cost_sol: costSol,
        cost_g2u: currency === "g2u" ? costG2u : undefined,
        currency: currency === "g2u" ? "g2u_onchain" : currency,
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
      gft_token_balance: (updated as { gft_token_balance?: number } | null)
        ?.gft_token_balance,
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

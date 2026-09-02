/**
 * nft-durability-topup — reload Echo/Fate/Rush/Shadow durability with on-chain $G2U.
 * Body: {
 *   kind: 'echo'|'fate'|'rush'|'shadow',
 *   percent: number (>=1),
 *   asset_id?: string,
 *   tx_signature: string  // required — $G2U → master (+ 0.0005 SOL fee on client)
 * }
 * Cost: 1000 $G2U per +1% (capped at 100%). No DB gft_token_balance debit.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
  logEconomy,
} from "../_shared/economy.ts";
import {
  NFT_ACTIVE_KEY,
  NFT_DURABILITY_KINDS,
  NFT_DURABILITY_G2U_PER_PERCENT,
  activeRowForKind,
  computeDurabilityTopUp,
  durabilitySnapshot,
  getNftDurability,
  g2uNftEconomyEnabled,
  type NftDurabilityKind,
} from "../_shared/nftDurability.ts";

const MASTER = "D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (!g2uNftEconomyEnabled()) {
      throw new Error(
        "NFT durability reload opens after $G2U launch (1 Sept 2026 UTC)",
      );
    }

    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "").toLowerCase().trim() as NftDurabilityKind;
    if (!(NFT_DURABILITY_KINDS as readonly string[]).includes(kind)) {
      throw new Error("kind must be echo|fate|rush|shadow");
    }
    const percent = Math.floor(Number(body.percent) || 0);
    if (percent < 1) throw new Error("percent must be at least 1");

    const txSignature = String(body.tx_signature || body.signature || "").trim();
    if (!txSignature || txSignature.length < 32) {
      throw new Error(
        "tx_signature required — send $G2U on-chain to master wallet first",
      );
    }

    const sb = adminClient();

    const { data: prior } = await sb
      .from("economy_events")
      .select("id")
      .eq("player_id", playerId)
      .eq("kind", "nft_durability_topup")
      .eq("ref", txSignature)
      .maybeSingle();
    if (prior) {
      const { data: p } = await sb
        .from("players")
        .select("inventory, gft_token_balance")
        .eq("telegram_id", playerId)
        .maybeSingle();
      return jsonResponse({
        success: true,
        already: true,
        inventory: p?.inventory || {},
        gft_token_balance: Number(p?.gft_token_balance) || 0,
        nft_durability: durabilitySnapshot(invObj(p?.inventory)),
      });
    }

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
          console.warn("nft-durability-topup: tx not found yet", txSignature);
        } else if (tx.meta?.err) {
          throw new Error("On-chain $G2U payment failed");
        }
      } catch (e) {
        if (e instanceof Error && /failed/i.test(e.message)) throw e;
        console.warn("nft-durability-topup verify skip", e);
      }
    }

    const { data: row, error } = await sb
      .from("players")
      .select("inventory, gft_token_balance")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const active = activeRowForKind(inv, kind);
    const assetId = String(
      body.asset_id || body.assetId || active?.asset_id || active?.assetId || "",
    ).trim();

    const map =
      inv.nft_durability &&
      typeof inv.nft_durability === "object" &&
      !Array.isArray(inv.nft_durability)
        ? { ...(inv.nft_durability as Record<string, number>) }
        : {};

    let before = active ? getNftDurability(active) : 100;
    if (assetId && map[assetId] !== undefined && map[assetId] !== null) {
      before = Math.max(0, Math.min(100, Number(map[assetId]) || 0));
    }

    const { add, costG2u, after } = computeDurabilityTopUp(before, percent);
    if (add <= 0) {
      throw new Error("Durability already at 100%");
    }

    if (assetId) map[assetId] = after;
    inv.nft_durability = map;

    if (active) {
      const key = NFT_ACTIVE_KEY[kind];
      inv[key] = {
        ...active,
        durability: after,
        durability_updated_at: new Date().toISOString(),
      };
    }

    // On-chain payment only — do not debit gft_token_balance (chain sync owns it)
    const { data: updated, error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv,
        last_updated: new Date().toISOString(),
      })
      .eq("telegram_id", playerId)
      .select("inventory, gft_token_balance")
      .maybeSingle();
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "nft_durability_topup",
      delta: -costG2u,
      ref: txSignature,
      meta: {
        kind,
        asset_id: assetId || null,
        percent_added: add,
        durability_before: before,
        durability_after: after,
        cost_g2u: costG2u,
        rate: NFT_DURABILITY_G2U_PER_PERCENT,
        currency: "g2u_onchain",
        master: MASTER,
        fee_sol: 0.0005,
      },
    });

    const outInv = (updated?.inventory as Record<string, unknown>) || inv;
    return jsonResponse({
      success: true,
      kind,
      percent_added: add,
      durability_before: before,
      durability_after: after,
      cost_g2u: costG2u,
      gft_token_balance: Number(updated?.gft_token_balance ?? row.gft_token_balance) || 0,
      inventory: outInv,
      nft_durability: durabilitySnapshot(outInv),
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

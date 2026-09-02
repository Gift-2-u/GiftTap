/**
 * nft-durability-topup — reload Echo/Fate/Rush/Shadow durability with $G2U.
 * Body: { kind: 'echo'|'fate'|'rush'|'shadow', percent: number (>=1) }
 * Cost: 1000 gft_token_balance per +1% (capped at 100%).
 * Requires G2U_NFT_DURABILITY_ENABLED or G2U_PREMIUM_ENABLED=true.
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

    const sb = adminClient();
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

    const bal = Number(row.gft_token_balance) || 0;
    if (bal + 1e-9 < costG2u) {
      throw new Error(
        `Not enough $G2U (need ${costG2u.toLocaleString()}, have ${bal.toLocaleString()})`,
      );
    }
    const nextBal = Math.round((bal - costG2u) * 1e6) / 1e6;

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

    const { data: updated, error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv,
        gft_token_balance: nextBal,
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
      balance_after: nextBal,
      ref: kind,
      meta: {
        kind,
        asset_id: assetId || null,
        percent_added: add,
        durability_before: before,
        durability_after: after,
        cost_g2u: costG2u,
        rate: NFT_DURABILITY_G2U_PER_PERCENT,
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
      gft_token_balance: Number(updated?.gft_token_balance ?? nextBal),
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

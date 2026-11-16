/**
 * echo-activate — set / clear the active Echo NFT (inventory.echo_active).
 * Body: { rarity, level?, asset_id?, clear? }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
  logEconomy,
  logNftMintSale,
  ECHO_MULTI,
  echoMultiplier,
  PLAYER_ECONOMY_SELECT,
  instantEconomyPatch,
} from "../_shared/economy.ts";
import { ensureNftDurabilityOnActivate } from "../_shared/nftDurability.ts";
import {
  sealAssetRoyalties,
  assertPlayerOwnsElfAsset,
} from "../_shared/nftRoyalties.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));

    const sb = adminClient();
    const { data: row, error } = await sb
      .from("players")
      .select(`${PLAYER_ECONOMY_SELECT}, wallet_address`)
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);

    if (body.clear === true || body.unequip === true) {
      delete inv.echo_active;
    } else {
      const assetId = String(body.asset_id || body.assetId || "").trim();
      if (!assetId) throw new Error("asset_id required");
      const proof = await assertPlayerOwnsElfAsset({
        assetId,
        playerWallet: String(
          (row as { wallet_address?: string }).wallet_address || "",
        ),
        expectedKind: "echo",
      });
      const rarity = proof.rarity;
      let level = proof.onChainLevel;
      const map = inv.elf_levels;
      if (map && typeof map === "object") {
        const fromMap = Math.floor(
          Number((map as Record<string, unknown>)[assetId]) || 0,
        );
        if (fromMap >= 1) level = Math.max(level, Math.min(5, fromMap));
      }
      const prev =
        inv.echo_active && typeof inv.echo_active === "object"
          ? (inv.echo_active as Record<string, unknown>)
          : null;
      inv.echo_active = ensureNftDurabilityOnActivate(
        {
          rarity,
          level,
          asset_id: assetId,
          multi: echoMultiplier(rarity, level),
          activated_at: new Date().toISOString(),
        },
        prev,
      );
    }

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
      kind: "echo_activate",
      delta: 0,
      balance_after: null,
      ref: (inv.echo_active as Record<string, unknown> | undefined)?.asset_id
        ? String((inv.echo_active as Record<string, unknown>).asset_id)
        : null,
      meta: {
        echo_active: inv.echo_active ?? null,
        tap_power: patch.tap_power,
      },
    });

    let royalties: Record<string, unknown> | null = null;
    const sealId =
      (inv.echo_active as Record<string, unknown> | undefined)?.asset_id ||
      body.asset_id ||
      body.assetId ||
      null;
    if (sealId && body.clear !== true && body.unequip !== true) {
      royalties = await sealAssetRoyalties(String(sealId));
      if (body.mint_sale === true || body.mintSale === true) {
        await logNftMintSale(sb, {
          playerId,
          elf: "echo",
          rarity: String(body.rarity || body.rarityKey || "common"),
          priceSol: body.price_sol ?? body.priceSol ?? null,
          assetId: String(sealId),
          signature: body.signature || body.tx_signature || null,
          promo: !!(body.promo || body.voucher_promo),
          username: String(body.username || "") || null,
        });
      }
    }

    return jsonResponse({
      success: true,
      inventory: updated?.inventory ?? inv,
      echo_active:
        (updated?.inventory as Record<string, unknown>)?.echo_active ??
        inv.echo_active ??
        null,
      multi: inv.echo_active
        ? echoMultiplier(
          String((inv.echo_active as Record<string, unknown>).rarity),
          Number((inv.echo_active as Record<string, unknown>).level) || 1,
        )
        : 1,
      tap_power:
        (updated as { tap_power?: number } | null)?.tap_power ?? patch.tap_power,
      max_daily_limit:
        (updated as { max_daily_limit?: number } | null)?.max_daily_limit ??
        patch.max_daily_limit,
      royalties,
    });
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

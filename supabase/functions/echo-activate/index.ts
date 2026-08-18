/**
 * echo-activate — set / clear the active Echo NFT (inventory.echo_active).
 * 1 Echo focus per player. Does not verify on-chain ownership here (mint/equip UI does).
 *
 * Body: {
 *   rarity: 'common'|'rare'|'epic'|'legendary',
 *   level?: number (default 1),
 *   asset_id?: string,
 *   clear?: boolean
 * }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
  logEconomy,
  ECHO_MULTI,
  echoMultiplier,
} from "../_shared/economy.ts";

const RARITIES = new Set(Object.keys(ECHO_MULTI));

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
      .select("inventory")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);

    if (body.clear === true || body.unequip === true) {
      delete inv.echo_active;
    } else {
      const rarity = String(body.rarity || body.rarityKey || "")
        .toLowerCase()
        .trim();
      if (!RARITIES.has(rarity)) {
        throw new Error("rarity must be common|rare|epic|legendary");
      }
      let level = Math.floor(Number(body.level) || 1);
      if (level < 1) level = 1;
      if (level > 5) level = 5;
      const assetId = String(body.asset_id || body.assetId || "").trim() || null;
      inv.echo_active = {
        rarity,
        level,
        asset_id: assetId,
        multi: echoMultiplier(rarity, level),
        activated_at: new Date().toISOString(),
      };
    }

    const { data: updated, error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv,
        last_updated: new Date().toISOString(),
      })
      .eq("telegram_id", playerId)
      .select("inventory")
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
      meta: { echo_active: inv.echo_active ?? null },
    });

    return jsonResponse({
      success: true,
      inventory: updated?.inventory ?? inv,
      echo_active: (updated?.inventory as Record<string, unknown>)?.echo_active ??
        inv.echo_active ??
        null,
      multi: inv.echo_active
        ? echoMultiplier(
          String((inv.echo_active as Record<string, unknown>).rarity),
          Number((inv.echo_active as Record<string, unknown>).level) || 1,
        )
        : 1,
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

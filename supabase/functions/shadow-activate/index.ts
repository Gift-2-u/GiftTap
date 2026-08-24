/**
 * shadow-activate — set / clear active Shadow (inventory.shadow_active).
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
  SHADOW_HOURS,
  shadowHours,
} from "../_shared/economy.ts";
import { ensureNftDurabilityOnActivate } from "../_shared/nftDurability.ts";

const RARITIES = new Set(Object.keys(SHADOW_HOURS));

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
      delete inv.shadow_active;
    } else {
      const rarity = String(body.rarity || body.rarityKey || "").toLowerCase().trim();
      if (!RARITIES.has(rarity)) throw new Error("rarity must be common|rare|epic|legendary");
      let level = Math.floor(Number(body.level) || 1);
      if (level < 1) level = 1;
      if (level > 5) level = 5;
      const assetId = String(body.asset_id || body.assetId || "").trim() || null;
      const hours = shadowHours(rarity, level);
      const prev =
        inv.shadow_active && typeof inv.shadow_active === "object"
          ? (inv.shadow_active as Record<string, unknown>)
          : null;
      inv.shadow_active = ensureNftDurabilityOnActivate(
        {
          rarity,
          level,
          asset_id: assetId,
          hours,
          activated_at: new Date().toISOString(),
        },
        prev,
      );
    }

    const { data: updated, error: upErr } = await sb
      .from("players")
      .update({ inventory: inv, last_updated: new Date().toISOString() })
      .eq("telegram_id", playerId)
      .select("inventory")
      .maybeSingle();
    if (upErr) throw upErr;

    const active =
      (updated?.inventory as Record<string, unknown>)?.shadow_active ??
      inv.shadow_active ??
      null;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "shadow_activate",
      delta: 0,
      balance_after: null,
      ref: active && typeof active === "object"
        ? String((active as Record<string, unknown>).asset_id || "")
        : null,
      meta: { shadow_active: active },
    });

    return jsonResponse({
      success: true,
      inventory: updated?.inventory ?? inv,
      shadow_active: active,
      hours: active && typeof active === "object"
        ? Number((active as Record<string, unknown>).hours) || 0
        : 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i.test(message)
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});

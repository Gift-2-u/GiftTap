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
  PLAYER_ECONOMY_SELECT,
  instantEconomyPatch,
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
      .select(PLAYER_ECONOMY_SELECT)
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");
    const inv = invObj(row.inventory);

    if (body.clear === true || body.unequip === true) {
      delete inv.shadow_active;
    } else {
      const rarity = String(body.rarity || body.rarityKey || "").toLowerCase().trim();
      if (!RARITIES.has(rarity)) {
        throw new Error("rarity must be common|rare|epic|legendary");
      }
      let level = Math.floor(Number(body.level) || 1);
      if (level < 1) level = 1;
      if (level > 5) level = 5;
      const assetId = String(body.asset_id || body.assetId || "").trim() || null;
      if (assetId) {
        const map = inv.elf_levels;
        if (map && typeof map === "object") {
          const fromMap = Math.floor(
            Number((map as Record<string, unknown>)[assetId]) || 0,
          );
          if (fromMap >= 1) level = Math.max(level, Math.min(5, fromMap));
        }
      }
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

    const patch = instantEconomyPatch(row as Record<string, unknown>, inv);
    const { data: updated, error: upErr } = await sb
      .from("players")
      .update(patch)
      .eq("telegram_id", playerId)
      .select("inventory, tap_power, max_daily_limit")
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
      meta: { shadow_active: active, tap_power: patch.tap_power },
    });

    return jsonResponse({
      success: true,
      inventory: updated?.inventory ?? inv,
      shadow_active: active,
      hours: active && typeof active === "object"
        ? Number((active as Record<string, unknown>).hours) || 0
        : 0,
      tap_power:
        (updated as { tap_power?: number } | null)?.tap_power ?? patch.tap_power,
      max_daily_limit:
        (updated as { max_daily_limit?: number } | null)?.max_daily_limit ??
        patch.max_daily_limit,
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

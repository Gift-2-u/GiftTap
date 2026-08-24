/**
 * fate-activate — set / clear active Fate for jackpot rolls (inventory.fate_power).
 * 1 Fate focus per player.
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
  FATE_JACKPOT} from "../_shared/economy.ts";
import { ensureNftDurabilityOnActivate } from "../_shared/nftDurability.ts";

const RARITIES = new Set(Object.keys(FATE_JACKPOT));

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
      delete inv.fate_power;
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
      const prev =
        inv.fate_power && typeof inv.fate_power === "object"
          ? (inv.fate_power as Record<string, unknown>)
          : null;
      inv.fate_power = ensureNftDurabilityOnActivate(
        {
          rarity,
          level,
          asset_id: assetId,
          activated_at: new Date().toISOString()},
        prev,
      );
      // Keep string focus id in sync when provided (badge/jackpot focus)
      if (assetId) inv.fate_active = assetId;
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
      kind: "fate_activate",
      delta: 0,
      balance_after: null,
      ref: (inv.fate_power as Record<string, unknown> | undefined)?.asset_id
        ? String((inv.fate_power as Record<string, unknown>).asset_id)
        : null,
      meta: { fate_power: inv.fate_power ?? null }});

    return jsonResponse({
      success: true,
      inventory: updated?.inventory ?? inv,
      fate_power:
        (updated?.inventory as Record<string, unknown>)?.fate_power ??
        inv.fate_power ??
        null});
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

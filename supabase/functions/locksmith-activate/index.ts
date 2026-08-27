/**
 * locksmith-activate — set / clear inventory.locksmith_active (wall fee waiver).
 * Level 1–5. Does not verify on-chain here (equip UI does).
 *
 * Body: { level?: number, asset_id?: string, clear?: boolean }
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
      delete inv.locksmith_active;
    } else {
      let level = Math.floor(Number(body.level) || 1);
      if (level < 1) level = 1;
      if (level > 99) level = 99;
      const assetId = String(body.asset_id || body.assetId || "").trim() || null;
      if (assetId) {
        const map = inv.elf_levels;
        if (map && typeof map === "object") {
          const fromMap = Math.floor(
            Number((map as Record<string, unknown>)[assetId]) || 0,
          );
          if (fromMap >= 1) level = Math.max(level, fromMap);
        }
      }
      inv.locksmith_active = {
        level,
        asset_id: assetId,
        activated_at: new Date().toISOString(),
      };
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
      kind: "locksmith_activate",
      delta: 0,
      balance_after: null,
      ref: (inv.locksmith_active as Record<string, unknown> | undefined)?.asset_id
        ? String((inv.locksmith_active as Record<string, unknown>).asset_id)
        : null,
      meta: {
        locksmith_active: inv.locksmith_active ?? null,
        tap_power: patch.tap_power,
      },
    });

    return jsonResponse({
      success: true,
      inventory: updated?.inventory ?? inv,
      locksmith_active:
        (updated?.inventory as Record<string, unknown>)?.locksmith_active ??
        inv.locksmith_active ??
        null,
      tap_power:
        (updated as { tap_power?: number } | null)?.tap_power ?? patch.tap_power,
      max_daily_limit:
        (updated as { max_daily_limit?: number } | null)?.max_daily_limit ??
        patch.max_daily_limit,
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

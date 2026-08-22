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
      .select("inventory")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);

    if (body.clear === true || body.unequip === true) {
      delete inv.locksmith_active;
    } else {
      // Levels scale with walls (not capped at 5). Soft cap 99 for sanity.
      let level = Math.floor(Number(body.level) || 1);
      if (level < 1) level = 1;
      if (level > 99) level = 99;
      const assetId = String(body.asset_id || body.assetId || "").trim() || null;
      inv.locksmith_active = {
        level,
        asset_id: assetId,
        activated_at: new Date().toISOString(),
      };
    }

    // Do not bump last_updated — that field is the energy regen clock.
    const { data: updated, error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv,
      })
      .eq("telegram_id", playerId)
      .select("inventory")
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
      meta: { locksmith_active: inv.locksmith_active ?? null },
    });

    return jsonResponse({
      success: true,
      inventory: updated?.inventory ?? inv,
      locksmith_active:
        (updated?.inventory as Record<string, unknown>)?.locksmith_active ??
          inv.locksmith_active ??
          null,
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

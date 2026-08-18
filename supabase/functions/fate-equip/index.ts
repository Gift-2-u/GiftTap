/**
 * fate-equip — equip / unequip a Shard Badge onto a Fate NFT (inventory only).
 * Does not burn the badge. Free count = owned − already equipped on other Fates.
 * 1 Shard Badge per Fate asset.
 *
 * Body: { asset_id: string, equip?: boolean }
 *   equip true  = equip one free Shard Badge
 *   equip false / null / omit with unequip=true = unequip
 * Legacy: { tier: null } still unequips; { tier: 'shard' } equips.
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

const SHARD_ITEM = "shard_badge";

function isShardEquipRow(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  const itemId = String(r.itemId || r.item_id || "").toLowerCase();
  const tier = String(r.tier || "").toLowerCase();
  return itemId === SHARD_ITEM || tier === "shard" || tier === "shard_badge";
}

function countEquippedShard(equip: Record<string, unknown>): number {
  let n = 0;
  for (const row of Object.values(equip)) {
    if (isShardEquipRow(row)) n += 1;
  }
  return n;
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
    if (!assetId || assetId.length < 32) {
      throw new Error("asset_id required (Fate mint address)");
    }

    // Resolve equip vs unequip
    let wantEquip: boolean | null = null;
    if (typeof body.equip === "boolean") {
      wantEquip = body.equip;
    } else if (body.unequip === true || body.action === "unequip") {
      wantEquip = false;
    } else if (body.tier === null || body.tier === "" || body.tier === "none") {
      wantEquip = false;
    } else if (body.tier != null) {
      const t = String(body.tier).toLowerCase().replace(/^badge_/, "");
      if (t === "shard" || t === "shard_badge") wantEquip = true;
      else if (["bronze", "silver", "gold", "diamond"].includes(t)) {
        throw new Error(
          "Weekly badges do not go in the Fate socket. Equip a Shard Badge instead.",
        );
      } else {
        throw new Error("Use equip:true for Shard Badge, or equip:false to unequip");
      }
    } else if (body.item_id != null || body.itemId != null) {
      const id = String(body.item_id || body.itemId || "").toLowerCase();
      if (id === SHARD_ITEM || id === "shard") wantEquip = true;
      else if (id === "" || id === "none") wantEquip = false;
      else throw new Error("Only shard_badge can be equipped on Fate");
    } else {
      // Default: equip
      wantEquip = true;
    }

    const sb = adminClient();
    const { data: row, error } = await sb
      .from("players")
      .select("inventory")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const equip =
      inv.fate_equip && typeof inv.fate_equip === "object"
        ? { ...(inv.fate_equip as Record<string, unknown>) }
        : {};

    if (!wantEquip) {
      delete equip[assetId];
      inv.fate_equip = equip;
      if (inv.fate_active === assetId) inv.fate_active = null;
    } else {
      const owned = Math.max(0, Math.floor(Number(inv[SHARD_ITEM]) || 0));
      const alreadyHere = isShardEquipRow(equip[assetId]);
      // Free slots: owned minus other equips (keep current if re-equip same)
      let equippedElsewhere = countEquippedShard(equip);
      if (alreadyHere) equippedElsewhere -= 1;
      const free = owned - equippedElsewhere;
      if (free < 1) {
        throw new Error(
          owned < 1
            ? "No Shard Badge in backpack — buy one in Shop or Badge market"
            : "All Shard Badges are already equipped on other Fate NFTs",
        );
      }
      equip[assetId] = {
        itemId: SHARD_ITEM,
        tier: "shard",
        equipped_at: new Date().toISOString(),
      };
      inv.fate_equip = equip;
      inv.fate_active = assetId;
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
      kind: "fate_equip",
      delta: 0,
      balance_after: null,
      ref: assetId,
      meta: {
        equip: wantEquip,
        item_id: wantEquip ? SHARD_ITEM : null,
        asset_id: assetId,
      },
    });

    const outInv = (updated?.inventory as Record<string, unknown>) ?? inv;
    return jsonResponse({
      success: true,
      asset_id: assetId,
      equipped: wantEquip,
      item_id: wantEquip ? SHARD_ITEM : null,
      inventory: outInv,
      fate_equip: outInv?.fate_equip ?? inv.fate_equip,
      fate_active: outInv?.fate_active ?? inv.fate_active,
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

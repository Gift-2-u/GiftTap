/**
 * fate-equip — equip / unequip a Star Badge onto an NFT.
 * Free Stars = max(inventory.shard_badge, on-chain Star NFTs owned) − equipped.
 * 1 Star Badge per NFT asset.
 *
 * Body: { asset_id: string, equip?: boolean, star_asset_id?: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
  logEconomy} from "../_shared/economy.ts";

const SHARD_ITEM = "shard_badge";
const ELVES_COLLECTION = "FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD";

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

function isStarAsset(asset: Record<string, unknown>): boolean {
  const content = (asset.content || {}) as Record<string, unknown>;
  const meta = (content.metadata || {}) as Record<string, unknown>;
  const name = String(meta.name || "").toLowerCase().trim();
  if (name === "star badge" || name.startsWith("star badge")) return true;
  const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
  for (const a of attrs) {
    if (!a || typeof a !== "object") continue;
    const row = a as Record<string, unknown>;
    const t = String(row.trait_type || row.traitType || row.key || "").toLowerCase();
    const v = String(row.value ?? "").toLowerCase();
    if (t === "class" && (v === "star badge" || v.includes("star"))) return true;
  }
  return false;
}

async function countOwnedStarNfts(wallet: string): Promise<number> {
  const rpc =
    Deno.env.get("SOLANA_RPC_URL") ||
    Deno.env.get("VITE_SOLANA_RPC_URL") ||
    "";
  if (!rpc || !wallet || wallet.length < 32) return 0;
  let count = 0;
  let page = 1;
  for (;;) {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `star-own-${page}`,
        method: "getAssetsByOwner",
        params: {
          ownerAddress: wallet,
          page,
          limit: 1000,
          displayOptions: { showCollectionMetadata: true }}})});
    const json = await res.json().catch(() => ({}));
    const items = json?.result?.items || [];
    for (const a of items) {
      const grouping = Array.isArray(a?.grouping) ? a.grouping : [];
      const inCol = grouping.some(
        (g: { group_key?: string; group_value?: string; groupKey?: string; groupValue?: string }) =>
          String(g.group_key || g.groupKey || "") === "collection" &&
          String(g.group_value || g.groupValue || "") === ELVES_COLLECTION,
      );
      if (!inCol) continue;
      if (isStarAsset(a)) count += 1;
    }
    if (items.length < 1000) break;
    page += 1;
    if (page > 20) break;
  }
  return count;
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
    const starAssetId = body.star_asset_id
      ? String(body.star_asset_id).trim()
      : "";
    if (!assetId || assetId.length < 32) {
      throw new Error("asset_id required (NFT mint address)");
    }

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
          "Weekly badges do not go in the NFT socket. Equip a Star Badge instead.",
        );
      } else {
        throw new Error("Use equip:true for Star Badge, or equip:false to unequip");
      }
    } else if (body.item_id != null || body.itemId != null) {
      const id = String(body.item_id || body.itemId || "").toLowerCase();
      if (id === SHARD_ITEM || id === "shard") wantEquip = true;
      else if (id === "" || id === "none") wantEquip = false;
      else throw new Error("Only Star Badge can be equipped on NFT sockets");
    } else {
      wantEquip = true;
    }

    const sb = adminClient();
    const { data: row, error } = await sb
      .from("players")
      .select("inventory, wallet_address")
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
      let ownedInv = Math.max(0, Math.floor(Number(inv[SHARD_ITEM]) || 0));
      const wallet = String(row.wallet_address || "").trim();
      let ownedOnChain = 0;
      try {
        ownedOnChain = await countOwnedStarNfts(wallet);
      } catch {
        ownedOnChain = 0;
      }
      // Keep inventory count at least as high as on-chain Stars (mint path)
      if (ownedOnChain > ownedInv) {
        ownedInv = ownedOnChain;
        inv[SHARD_ITEM] = ownedInv;
      }

      const alreadyHere = isShardEquipRow(equip[assetId]);
      let equippedElsewhere = countEquippedShard(equip);
      if (alreadyHere) equippedElsewhere -= 1;
      const free = ownedInv - equippedElsewhere;
      if (free < 1) {
        throw new Error(
          ownedInv < 1
            ? "No Star Badge — mint one in Shop → NFTs, then tap the socket"
            : "All your Star Badges are already equipped on other NFTs",
        );
      }
      equip[assetId] = {
        itemId: SHARD_ITEM,
        tier: "shard",
        equipped_at: new Date().toISOString(),
        ...(starAssetId && starAssetId.length >= 32
          ? { star_asset_id: starAssetId }
          : {})};
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
        star_asset_id: wantEquip && starAssetId ? starAssetId : null}});

    const outInv = (updated?.inventory as Record<string, unknown>) ?? inv;
    return jsonResponse({
      success: true,
      asset_id: assetId,
      equipped: wantEquip,
      item_id: wantEquip ? SHARD_ITEM : null,
      inventory: outInv,
      fate_equip: outInv?.fate_equip ?? inv.fate_equip,
      fate_active: outInv?.fate_active ?? inv.fate_active});
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

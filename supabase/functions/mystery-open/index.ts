/**
 * mystery-open — burn weekly badges → weighted Mystery Gift + sub-rolls.
 *
 * Top odds by burn tier (MYSTERY_ODDS). Then:
 *   free_boost    → frenzy | battery | refill (~⅓) → inventory
 *   premium_boost → bot | grinder | whale | x2 | x3 (20%) → inventory
 *   shards_bulk   → shard_balance (G2Ushards) immediately
 *   bonus_g2u     → mystery_g2u_pending until SPL transfer live
 *   exclusive_nft → mystery_nft_pending (kind/rarity) until CM mint live
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  MYSTERY_COSTS,
  MYSTERY_ODDS,
  BADGE_ITEM,
  rollMystery,
  invObj,
} from "../_shared/economy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const tier = String(body.tier || "").toLowerCase();
    const cost = MYSTERY_COSTS[tier];
    if (!cost || !BADGE_ITEM[tier]) {
      throw new Error("Invalid badge tier (use bronze|silver|gold|diamond)");
    }
    if (!MYSTERY_ODDS[tier]) {
      throw new Error("No Mystery odds for that badge tier");
    }

    const sb = adminClient();
    const { data: row, error: selErr } = await sb
      .from("players")
      .select("inventory, shard_balance, wallet_address")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const badgeKey = BADGE_ITEM[tier];
    const have = Math.max(0, Math.floor(Number(inv[badgeKey]) || 0));
    if (have < cost) {
      throw new Error(`Need ${cost} ${tier} badge(s) (you have ${have})`);
    }

    inv[badgeKey] = have - cost;
    if ((inv[badgeKey] as number) <= 0) delete inv[badgeKey];

    const reward = rollMystery(tier);
    let shard_balance = Number(row.shard_balance) || 0;
    let balanceDelta = 0;
    const dest = reward.dest || "backpack";

    if (reward.type === "shards" && reward.amount) {
      balanceDelta = Number(reward.amount) || 0;
      shard_balance = Math.round((shard_balance + balanceDelta) * 1000) / 1000;
    } else if (reward.type === "item" && reward.itemId) {
      inv[reward.itemId] = (Number(inv[reward.itemId]) || 0) + 1;
    } else if (reward.type === "g2u_pending" && reward.amount) {
      const prev = Math.max(0, Number(inv.mystery_g2u_pending) || 0);
      inv.mystery_g2u_pending = Math.round((prev + Number(reward.amount)) * 1000) / 1000;
      const queue = Array.isArray(inv.mystery_g2u_queue)
        ? [...(inv.mystery_g2u_queue as unknown[])]
        : [];
      queue.push({
        at: new Date().toISOString(),
        amount: reward.amount,
        burn: tier,
      });
      inv.mystery_g2u_queue = queue.slice(-50);
    } else if (reward.type === "nft_pending" && reward.nftKind) {
      inv.exclusive_nft_voucher = (Number(inv.exclusive_nft_voucher) || 0) + 1;
      const q = Array.isArray(inv.mystery_nft_pending)
        ? [...(inv.mystery_nft_pending as unknown[])]
        : [];
      q.push({
        id: `mnft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: reward.nftKind,
        rarity: reward.nftRarity || "common",
        label: reward.label,
        burn: tier,
        at: new Date().toISOString(),
        status: "pending_mint",
      });
      inv.mystery_nft_pending = q.slice(-30);
    }

    const opens = Array.isArray(inv.mystery_opens)
      ? [...(inv.mystery_opens as unknown[])]
      : [];
    opens.push({
      at: new Date().toISOString(),
      burn: tier,
      cost,
      prizeId: reward.prizeId,
      label: reward.label,
      itemId: reward.itemId || null,
      nftKind: reward.nftKind || null,
      amount: reward.amount || null,
      dest,
    });
    inv.mystery_opens = opens.slice(-30);

    const { error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv,
        shard_balance,
      })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "mystery_open",
      delta: balanceDelta,
      balance_after: shard_balance,
      ref: tier,
      meta: { cost, reward, dest, wallet: row.wallet_address || null },
    });

    return jsonResponse({
      success: true,
      tier,
      cost,
      odds: MYSTERY_ODDS[tier],
      reward: { ...reward, dest },
      inventory: inv,
      shard_balance,
      balance_delta: balanceDelta,
      dest,
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

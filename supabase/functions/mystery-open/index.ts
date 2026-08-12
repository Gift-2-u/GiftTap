import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  MYSTERY_COSTS,
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

    const sb = adminClient();
    const { data: row, error: selErr } = await sb
      .from("players")
      .select("inventory, shard_balance")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const itemId = BADGE_ITEM[tier];
    const have = Math.max(0, Math.floor(Number(inv[itemId]) || 0));
    if (have < cost) {
      throw new Error(`Need ${cost} ${tier} badge(s) (you have ${have})`);
    }

    inv[itemId] = have - cost;
    if ((inv[itemId] as number) <= 0) delete inv[itemId];

    const reward = rollMystery(tier);
    let shard_balance = Number(row.shard_balance) || 0;
    let balanceDelta = 0;

    if (reward.type === "shards" && reward.amount) {
      balanceDelta = Number(reward.amount) || 0;
      shard_balance = Math.round((shard_balance + balanceDelta) * 1000) / 1000;
    } else if (reward.type === "item" && reward.itemId) {
      inv[reward.itemId] = (Number(inv[reward.itemId]) || 0) + 1;
    } else if (reward.type === "nft_voucher") {
      inv.exclusive_nft_voucher = (Number(inv.exclusive_nft_voucher) || 0) + 1;
    }

    const opens = Array.isArray(inv.mystery_opens) ? [...(inv.mystery_opens as unknown[])] : [];
    opens.push({
      at: new Date().toISOString(),
      burn: tier,
      cost,
      prizeId: reward.prizeId,
      label: reward.label,
    });
    inv.mystery_opens = opens.slice(-30);

    const { error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv,
        shard_balance,
        last_updated: new Date().toISOString(),
      })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "mystery_open",
      delta: balanceDelta,
      balance_after: shard_balance,
      ref: tier,
      meta: { cost, reward },
    });

    return jsonResponse({
      success: true,
      tier,
      cost,
      reward,
      inventory: inv,
      shard_balance,
      balance_delta: balanceDelta,
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

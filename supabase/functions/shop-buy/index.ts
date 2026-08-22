import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  SHARD_SHOP,
  invObj,
  utcIsoWeekId,
} from "../_shared/economy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const itemId = String(body.item_id || body.itemId || "").toLowerCase();
    const catalog = SHARD_SHOP[itemId];
    if (!catalog) {
      throw new Error("Unknown shard shop item (frenzy|battery|refill)");
    }
    const cost = catalog.cost;

    const sb = adminClient();
    const { data: row, error: selErr } = await sb
      .from("players")
      .select("inventory, shard_balance")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const balance = Number(row.shard_balance) || 0;
    if (balance + 1e-9 < cost) {
      throw new Error("Not enough G2Ushards");
    }

    const inv = invObj(row.inventory);
    inv[itemId] = (Number(inv[itemId]) || 0) + 1;

    // Weekly quest boost-buy counter
    const weekId = utcIsoWeekId();
    const wq =
      inv.weekly_quests && typeof inv.weekly_quests === "object"
        ? { ...(inv.weekly_quests as Record<string, unknown>) }
        : { weekId, claimed: [], daysTap500: [], daysActive: [], daysFull: [], boostBuys: 0 };
    if (String(wq.weekId || "") !== weekId) {
      inv.weekly_quests = {
        weekId,
        claimed: [],
        daysTap500: [],
        daysActive: [],
        daysFull: [],
        boostBuys: 1,
      };
    } else {
      wq.boostBuys = (Number(wq.boostBuys) || 0) + 1;
      wq.weekId = weekId;
      inv.weekly_quests = wq;
    }

    const nextBalance = Math.round((balance - cost) * 1000) / 1000;

    // Do NOT bump last_updated — it is the energy regen clock. Touching it
    // without rewriting last_energy freezes battery at 0 on the next commit-taps.
    const { error: upErr } = await sb
      .from("players")
      .update({
        shard_balance: nextBalance,
        inventory: inv,
      })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "shop_buy",
      delta: -cost,
      balance_after: nextBalance,
      ref: itemId,
      meta: { name: catalog.name, cost },
    });

    return jsonResponse({
      success: true,
      item_id: itemId,
      name: catalog.name,
      cost,
      shard_balance: nextBalance,
      inventory: inv,
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

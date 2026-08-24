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
  effectiveDailyLimit,
} from "../_shared/economy.ts";

const AD_DAILY_MAX = 10;
const AD_CAP_PER_WATCH = 100;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const itemId = String(body.item_id || body.itemId || "").toLowerCase();

    // Rewarded ad → +100 daily tap capacity (server authority; client cannot set the cap)
    if (itemId === "ad_watch" || body.action === "ad_reward") {
      const sb = adminClient();
      const { data: row, error: selErr } = await sb
        .from("players")
        .select(
          "daily_ads_watched, last_ad_date, ad_energy_boost, ad_energy_expires, energy_boost_expires, limit_boost_amount, limit_boost_expires, inventory, max_daily_limit",
        )
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!row) throw new Error("Player not found");

      const today = new Date().toISOString().slice(0, 10);
      const lastAd = row.last_ad_date ? String(row.last_ad_date).slice(0, 10) : "";
      let ads = Number(row.daily_ads_watched) || 0;
      if (lastAd !== today) ads = 0;
      if (ads >= AD_DAILY_MAX) {
        throw new Error(`Daily ad limit reached (${AD_DAILY_MAX}/${AD_DAILY_MAX})`);
      }

      const now = new Date();
      const midnightUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
      );
      const adExpOk =
        row.ad_energy_expires &&
        new Date(String(row.ad_energy_expires)).getTime() > now.getTime() &&
        lastAd === today;
      const nextAdBoost =
        (adExpOk ? Math.max(0, Number(row.ad_energy_boost) || 0) : 0) +
        AD_CAP_PER_WATCH;
      const newAds = ads + 1;

      const patchRow = {
        ...row,
        ad_energy_boost: nextAdBoost,
        ad_energy_expires: midnightUtc.toISOString(),
      };
      const effectiveCap = effectiveDailyLimit(patchRow, now);

      const { error: upErr } = await sb
        .from("players")
        .update({
          daily_ads_watched: newAds,
          last_ad_date: today,
          ad_energy_boost: nextAdBoost,
          ad_energy_expires: midnightUtc.toISOString(),
          max_daily_limit: effectiveCap,
          last_updated: now.toISOString(),
        })
        .eq("telegram_id", playerId);
      if (upErr) throw upErr;

      await logEconomy(sb, {
        player_id: playerId,
        kind: "ad_watch",
        delta: 0,
        balance_after: null,
        ref: "ad_watch",
        meta: { ads: newAds, ad_boost: nextAdBoost, max_daily_limit: effectiveCap },
      });

      return jsonResponse({
        success: true,
        item_id: "ad_watch",
        daily_ads_watched: newAds,
        last_ad_date: today,
        ad_energy_boost: nextAdBoost,
        ad_energy_expires: midnightUtc.toISOString(),
        max_daily_limit: effectiveCap,
      });
    }

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

    const { error: upErr } = await sb
      .from("players")
      .update({
        shard_balance: nextBalance,
        inventory: inv,
        last_updated: new Date().toISOString(),
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

/**
 * Grant premium shop item.
 * - currency=sol (default): client pays SOL, passes tx_signature (pre-launch)
 * - currency=g2u: debit gft_token_balance when G2U_PREMIUM_ENABLED=true
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  invObj,
  utcIsoWeekId,
  g2uPerSol,
  g2uShopEnabled,
} from "../_shared/economy.ts";

/** LP rate: 20 SOL / 100M G2U → 5_000_000 G2U per SOL */
const G2U_PER_SOL = g2uPerSol();

const PREMIUM: Record<
  string,
  { name: string; priceSol: number; priceG2u: number }
> = {
  bot: { name: "Weekend Bot", priceSol: 0.01, priceG2u: 0.01 * G2U_PER_SOL },
  grinder: {
    name: "+2K Daily Energy",
    priceSol: 0.01,
    priceG2u: 0.01 * G2U_PER_SOL},
  whale: {
    name: "+5K Daily Energy",
    priceSol: 0.03,
    priceG2u: 0.03 * G2U_PER_SOL},
  crate: {
    name: "The Vault Drop",
    priceSol: 0.05,
    priceG2u: 0.05 * G2U_PER_SOL},
  x2_boost: {
    name: "Double Power",
    priceSol: 0.02,
    priceG2u: 0.02 * G2U_PER_SOL},
  x3_boost: {
    name: "Triple Power",
    priceSol: 0.035,
    priceG2u: 0.035 * G2U_PER_SOL},
  /** Battery bar 500→1000 for 7 days — 0.01 SOL (or G2U equiv after launch) */
  expanded_energy: {
    name: "Expanded Energy",
    priceSol: 0.01,
    priceG2u: 0.01 * G2U_PER_SOL},
  /** Extra Battery Refill ($G2U) — separate stack from free Battery Refill; no day lock */
  refill_extra: {
    name: "Extra Battery Refill",
    priceSol: 0.0002,
    priceG2u: 0.0002 * G2U_PER_SOL,
  },
  shard_badge: {
    name: "Star Badge",
    priceSol: 0.02,
    priceG2u: 0.02 * G2U_PER_SOL}};

const MASTER = "D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh";

function g2uPremiumEnabled(): boolean {
  return g2uShopEnabled();
}

function bumpWeeklyBoost(inv: Record<string, unknown>) {
  const weekId = utcIsoWeekId();
  const wq =
    inv.weekly_quests && typeof inv.weekly_quests === "object"
      ? { ...(inv.weekly_quests as Record<string, unknown>) }
      : {
          weekId,
          claimed: [],
          daysTap500: [],
          daysActive: [],
          daysFull: [],
          boostBuys: 0};
  if (String(wq.weekId || "") !== weekId) {
    inv.weekly_quests = {
      weekId,
      claimed: [],
      daysTap500: [],
      daysActive: [],
      daysFull: [],
      boostBuys: 1};
  } else {
    wq.boostBuys = (Number(wq.boostBuys) || 0) + 1;
    wq.weekId = weekId;
    inv.weekly_quests = wq;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const itemId = String(body.item_id || "").toLowerCase();
    const currency = String(body.currency || "sol").toLowerCase();
    const txSignature = String(body.tx_signature || body.signature || "").trim();
    const catalog = PREMIUM[itemId];
    if (!catalog) throw new Error("Unknown premium item");

    const sb = adminClient();

    // —— $G2U path (post-launch) ——
    if (currency === "g2u") {
      if (!g2uPremiumEnabled()) {
        throw new Error("Premium $G2U shop opens after launch (G2U_PREMIUM_ENABLED)");
      }
      const priceG2u = Math.round(Number(catalog.priceG2u) || 0);
      if (priceG2u <= 0) throw new Error("Invalid G2U price");

      const { data: row, error: selErr } = await sb
        .from("players")
        .select("inventory, has_made_purchase, gft_token_balance, daily_usage")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!row) throw new Error("Player not found");

      const bal = Number(row.gft_token_balance) || 0;
      if (bal + 1e-9 < priceG2u) {
        throw new Error(
          `Not enough $G2U (need ${priceG2u.toLocaleString()}, have ${bal.toLocaleString()})`,
        );
      }
      const nextBal = Math.round((bal - priceG2u) * 1e6) / 1e6;
      const inv = invObj(row.inventory);
      inv[itemId] = (Number(inv[itemId]) || 0) + 1;

      // Extra Battery Refill is its own stack (refill_extra) — no need to clear free day lock
      let daily_usage =
        row.daily_usage && typeof row.daily_usage === "object"
          ? { ...(row.daily_usage as Record<string, string>) }
          : {};
      bumpWeeklyBoost(inv);

      const { error: upErr } = await sb
        .from("players")
        .update({
          inventory: inv,
          daily_usage,
          gft_token_balance: nextBal,
          has_made_purchase: true,
          last_updated: new Date().toISOString(),
        })
        .eq("telegram_id", playerId);
      if (upErr) throw upErr;

      await logEconomy(sb, {
        player_id: playerId,
        kind: "premium_grant",
        delta: -priceG2u,
        balance_after: nextBal,
        ref: `g2u:${itemId}:${Date.now()}`,
        meta: {
          item_id: itemId,
          currency: "g2u",
          priceG2u}});

      return jsonResponse({
        success: true,
        already: false,
        item_id: itemId,
        currency: "g2u",
        price_g2u: priceG2u,
        gft_token_balance: nextBal,
        inventory: inv});
    }

    // —— SOL path (default / pre-launch) ——
    if (!txSignature || txSignature.length < 32) {
      throw new Error("tx_signature required");
    }

    const { data: prior } = await sb
      .from("economy_events")
      .select("id")
      .eq("player_id", playerId)
      .eq("kind", "premium_grant")
      .eq("ref", txSignature)
      .maybeSingle();
    if (prior) {
      const { data: p } = await sb
        .from("players")
        .select("inventory")
        .eq("telegram_id", playerId)
        .maybeSingle();
      return jsonResponse({
        success: true,
        already: true,
        inventory: p?.inventory || {}});
    }

    const rpc =
      Deno.env.get("SOLANA_RPC_URL") ||
      Deno.env.get("VITE_SOLANA_RPC_URL") ||
      "";
    if (rpc) {
      try {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [
              txSignature,
              { encoding: "json", maxSupportedTransactionVersion: 0 },
            ]})});
        const j = await res.json();
        const tx = j?.result;
        if (!tx) {
          console.warn("premium-grant: tx not found yet", txSignature);
        } else if (tx.meta?.err) {
          throw new Error("On-chain transaction failed");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("failed")) throw e;
        console.warn("premium-grant verify skip", e);
      }
    }

    const { data: row, error: selErr } = await sb
      .from("players")
      .select("inventory, has_made_purchase")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    inv[itemId] = (Number(inv[itemId]) || 0) + 1;
    bumpWeeklyBoost(inv);

    const { error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv,
        has_made_purchase: true,
        last_updated: new Date().toISOString(),
      })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "premium_grant",
      ref: txSignature,
      meta: {
        item_id: itemId,
        currency: "sol",
        priceSol: catalog.priceSol,
        master: MASTER}});

    return jsonResponse({
      success: true,
      already: false,
      item_id: itemId,
      currency: "sol",
      inventory: inv});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
      .test(message)
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});

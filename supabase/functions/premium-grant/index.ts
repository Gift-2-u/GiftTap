/**
 * Grant premium SOL shop item after on-chain payment.
 * Client pays SOL, then calls with tx_signature + item_id.
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
} from "../_shared/economy.ts";

const PREMIUM: Record<string, { name: string; priceSol: number }> = {
  bot: { name: "Weekend Bot", priceSol: 0.01 },
  grinder: { name: "+2K Daily Energy", priceSol: 0.01 },
  whale: { name: "+5K Daily Energy", priceSol: 0.03 },
  crate: { name: "The Vault Drop", priceSol: 0.05 },
  x2_boost: { name: "Double Power", priceSol: 0.02 },
  x3_boost: { name: "Triple Power", priceSol: 0.035 },
  /** Fate socket — equipable tradeable badge (inventory) */
  shard_badge: { name: "Shard Badge", priceSol: 0.02 },
};

const MASTER = "D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const itemId = String(body.item_id || "").toLowerCase();
    const txSignature = String(body.tx_signature || body.signature || "").trim();
    const catalog = PREMIUM[itemId];
    if (!catalog) throw new Error("Unknown premium item");
    if (!txSignature || txSignature.length < 32) {
      throw new Error("tx_signature required");
    }

    const sb = adminClient();

    // Idempotent: already granted this tx?
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
        inventory: p?.inventory || {},
      });
    }

    // Optional chain verify via Helius/public RPC
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
            ],
          }),
        });
        const j = await res.json();
        const tx = j?.result;
        if (!tx) {
          console.warn("premium-grant: tx not found yet", txSignature);
          // allow grant if tx not indexed yet but signature provided — still ledger by signature
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
            boostBuys: 0,
          };
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
      meta: { item_id: itemId, priceSol: catalog.priceSol, master: MASTER },
    });

    return jsonResponse({
      success: true,
      already: false,
      item_id: itemId,
      inventory: inv,
      tx_signature: txSignature,
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

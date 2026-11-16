/**
 * Main-page HUD boosts: battery refill / expand + daily max.
 * Client pays on-chain $G2U → master (+ 0.0005 SOL fee), then this applies immediately.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  invObj,
  effectiveDailyLimit,
  g2uShopEnabled,
} from "../_shared/economy.ts";
import { PREMIUM_PROJECT_FEE_SOL } from "../_shared/premiumDuration.ts";
import {
  HUD_ENERGY_CAP_DEFAULT,
  resolveHudBoostQuote,
} from "../_shared/hudBoost.ts";

const MASTER = "D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh";

function endOfUtcDay(offsetDays = 0, from = new Date()): string {
  const d = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + offsetDays,
      23,
      59,
      59,
      999,
    ),
  );
  return d.toISOString();
}

function energyCapFromInv(
  inv: Record<string, unknown>,
  nowMs = Date.now(),
): number {
  const b = inv?.energy_cap_boost as { cap?: number; expires?: string } | undefined;
  if (!b?.expires) return HUD_ENERGY_CAP_DEFAULT;
  if (new Date(String(b.expires)).getTime() <= nowMs) return HUD_ENERGY_CAP_DEFAULT;
  const cap = Math.floor(Number(b.cap) || 0);
  if (cap >= HUD_ENERGY_CAP_DEFAULT + 500) {
    return Math.min(5500, Math.max(HUD_ENERGY_CAP_DEFAULT, cap));
  }
  return 1000; // legacy Expanded Battery rows
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (!g2uShopEnabled()) {
      throw new Error("HUD boosts open after $G2U shop launch (G2U_PREMIUM_ENABLED)");
    }
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const txSignature = String(body.tx_signature || body.signature || "").trim();
    if (!txSignature || txSignature.length < 32) {
      throw new Error("tx_signature required — pay $G2U on-chain first");
    }

    const quote = resolveHudBoostQuote(body);
    if (quote.priceG2u <= 0) throw new Error("Invalid price");

    const sb = adminClient();

    const { data: prior } = await sb
      .from("economy_events")
      .select("id")
      .eq("player_id", playerId)
      .eq("kind", "hud_boost_buy")
      .eq("ref", txSignature)
      .maybeSingle();
    if (prior) {
      const { data: p } = await sb
        .from("players")
        .select(
          "inventory, last_energy, energy_at, max_daily_limit, limit_boost_amount, limit_boost_expires",
        )
        .eq("telegram_id", playerId)
        .maybeSingle();
      return jsonResponse({
        success: true,
        already: true,
        inventory: p?.inventory || {},
        last_energy: p?.last_energy,
        energy_at: p?.energy_at,
        max_daily_limit: p?.max_daily_limit,
      });
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
            ],
          }),
        });
        const j = await res.json();
        const tx = j?.result;
        if (!tx) {
          console.warn("hud-boost-buy: tx not found yet", txSignature);
        } else if (tx.meta?.err) {
          throw new Error("On-chain $G2U payment failed");
        }
      } catch (e) {
        if (e instanceof Error && /failed/i.test(e.message)) throw e;
        console.warn("hud-boost-buy verify skip", e);
      }
    }

    const { data: row, error: selErr } = await sb
      .from("players")
      .select(
        "inventory, last_energy, energy_at, max_daily_limit, limit_boost_amount, limit_boost_expires, energy_boost_expires, ad_energy_boost, ad_energy_expires",
      )
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const now = Date.now();
    const updates: Record<string, unknown> = {
      last_updated: new Date().toISOString(),
    };

    let last_energy = Number(row.last_energy);
    let energy_at = row.energy_at || new Date(now).toISOString();

    if (quote.kind === "refill") {
      const cap = energyCapFromInv(inv, now);
      if (!Number.isFinite(last_energy)) last_energy = 0;
      last_energy = Math.min(cap, Math.max(0, last_energy) + quote.amount);
      energy_at = new Date(now).toISOString();
      updates.last_energy = last_energy;
      updates.energy_at = energy_at;
    } else if (quote.kind === "expand") {
      const cap = quote.energyCap || HUD_ENERGY_CAP_DEFAULT + quote.amount;
      const expIso = endOfUtcDay(0);
      inv.energy_cap_boost = {
        cap,
        expires: expIso,
        filled_to_cap: true,
        extra: quote.amount,
        days: 1,
        source: "hud",
      };
      last_energy = cap;
      energy_at = new Date(now).toISOString();
      updates.inventory = inv;
      updates.last_energy = last_energy;
      updates.energy_at = energy_at;
    } else if (quote.kind === "daily") {
      const days = Math.max(1, Math.floor(Number(quote.days) || 1));
      updates.limit_boost_amount = quote.amount;
      updates.limit_boost_expires = endOfUtcDay(days - 1);
      updates.inventory = inv;
      updates.max_daily_limit = effectiveDailyLimit(
        {
          ...row,
          limit_boost_amount: updates.limit_boost_amount,
          limit_boost_expires: updates.limit_boost_expires,
          inventory: inv,
        },
        new Date(),
      );
    }

    const { error: upErr } = await sb
      .from("players")
      .update(updates)
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "hud_boost_buy",
      delta: -quote.priceG2u,
      ref: txSignature,
      meta: {
        boost_kind: quote.kind,
        units: quote.units,
        amount: quote.amount,
        days: quote.days,
        priceG2u: quote.priceG2u,
        fee_sol: PREMIUM_PROJECT_FEE_SOL,
        master: MASTER,
        energy_cap: quote.energyCap,
        max_daily_limit: updates.max_daily_limit ?? null,
      },
    });

    return jsonResponse({
      success: true,
      already: false,
      kind: quote.kind,
      amount: quote.amount,
      days: quote.days,
      price_g2u: quote.priceG2u,
      inventory: inv,
      last_energy: updates.last_energy != null ? last_energy : undefined,
      energy_at: updates.energy_at != null ? energy_at : undefined,
      max_daily_limit: updates.max_daily_limit ?? undefined,
      limit_boost_amount: updates.limit_boost_amount ?? undefined,
      limit_boost_expires: updates.limit_boost_expires ?? undefined,
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

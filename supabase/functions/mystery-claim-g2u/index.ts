/**
 * mystery-claim-g2u — Claim queued Mystery Bonus $G2U to game wallet (SPL).
 *
 * Body: { captcha_token }
 * Requires: session JWT, Turnstile (when configured), MYSTERY_PAYOUTS_LIVE + vault.
 * Opens at/after 2026-09-01 UTC (also requires payouts live for real transfer).
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
import { verifyTurnstileToken } from "../_shared/turnstile.ts";
import {
  getMysteryVaultConfig,
  transferG2uToPlayer,
} from "../_shared/mysteryVault.ts";

const TOKEN_LAUNCH_AT = Date.parse("2026-09-01T00:00:00Z");

function claimWindowOpen(): { ok: boolean; reason?: string } {
  const now = Date.now();
  const cfg = getMysteryVaultConfig();
  if (now < TOKEN_LAUNCH_AT && !cfg.payoutsLiveFlag) {
    return {
      ok: false,
      reason: "Claim $G2U opens at token launch (1 Sept 2026 UTC)",
    };
  }
  if (!cfg.g2uTransferReady) {
    return {
      ok: false,
      reason:
        "Mystery $G2U payouts not live yet — vault / MYSTERY_PAYOUTS_LIVE not ready",
    };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const captchaToken = body.captcha_token || body.captchaToken || "";
    const remoteIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;

    await verifyTurnstileToken(captchaToken, remoteIp);

    const gate = claimWindowOpen();
    if (!gate.ok) throw new Error(gate.reason || "Claim not open");

    const sb = adminClient();
    const { data: row, error } = await sb
      .from("players")
      .select("wallet_address, inventory")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const wallet = String(row.wallet_address || "").trim();
    if (wallet.length < 32) {
      throw new Error("No game wallet yet — open Gift Tap once to finish setup");
    }

    const inv = invObj(row.inventory);
    if (inv.mystery_g2u_claim_lock) {
      const lockAt = new Date(String(inv.mystery_g2u_claim_lock)).getTime();
      if (Number.isFinite(lockAt) && Date.now() - lockAt < 120_000) {
        throw new Error("Claim already in progress — wait a moment");
      }
    }

    const pending = Math.max(0, Number(inv.mystery_g2u_pending) || 0);
    if (pending <= 0) {
      return jsonResponse({
        success: true,
        already: true,
        amount: 0,
        mystery_g2u_pending: 0,
        message: "Nothing to claim",
      });
    }

    // Soft lock so double-click cannot double-pay
    inv.mystery_g2u_claim_lock = new Date().toISOString();
    const { error: lockErr } = await sb
      .from("players")
      .update({
        inventory: inv,
        last_updated: new Date().toISOString(),
      })
      .eq("telegram_id", playerId);
    if (lockErr) throw lockErr;

    const paid = await transferG2uToPlayer({
      amountUi: pending,
      toWallet: wallet,
    });

    // Re-read inventory in case of concurrent writes
    const { data: row2 } = await sb
      .from("players")
      .select("inventory")
      .eq("telegram_id", playerId)
      .maybeSingle();
    const inv2 = invObj(row2?.inventory ?? inv);

    if (!paid.ok) {
      delete inv2.mystery_g2u_claim_lock;
      await sb
        .from("players")
        .update({
          inventory: inv2,
          last_updated: new Date().toISOString(),
        })
        .eq("telegram_id", playerId);
      throw new Error(paid.error || "Transfer failed");
    }

    const queue = Array.isArray(inv2.mystery_g2u_queue)
      ? [...(inv2.mystery_g2u_queue as unknown[])]
      : [];
    const marked = queue.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const e = { ...(entry as Record<string, unknown>) };
      const st = String(e.status || "");
      if (st === "sent" || st === "claimed") return e;
      return {
        ...e,
        status: "sent",
        tx: paid.signature,
        claimed_at: new Date().toISOString(),
      };
    });

    inv2.mystery_g2u_pending = 0;
    inv2.mystery_g2u_queue = marked.slice(-50);
    delete inv2.mystery_g2u_claim_lock;
    inv2.mystery_g2u_last_claim = {
      at: new Date().toISOString(),
      amount: pending,
      tx: paid.signature,
      to_wallet: wallet,
    };

    const { error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv2,
        last_updated: new Date().toISOString(),
      })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "mystery_g2u_claim",
      delta: pending,
      balance_after: null,
      ref: paid.signature || null,
      meta: {
        amount: pending,
        to_wallet: wallet,
        tx: paid.signature,
      },
    });

    return jsonResponse({
      success: true,
      already: false,
      amount: pending,
      signature: paid.signature,
      to_wallet: wallet,
      mystery_g2u_pending: 0,
      inventory: inv2,
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

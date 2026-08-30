/**
 * Claim one airdrop_allocations row → SPL $G2U from that source's vault.
 *
 * User pays Solana fees (fee payer = game wallet). Flow:
 *   1) prepare → vault partial-signs tx, returns tx_base64
 *   2) client signs + sends
 *   3) confirm { tx_signature } → verify on-chain, mark claimed
 *
 * Body: { captcha_token, allocation_id, action?: "prepare"|"confirm", tx_signature? }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
} from "../_shared/economy.ts";
import { verifyTurnstileToken } from "../_shared/turnstile.ts";
import {
  getAirdropVaultConfig,
  buildAirdropClaimPartialTx,
  verifyAirdropClaimTx,
  type AirdropSource,
} from "../_shared/airdropVault.ts";

const TOKEN_LAUNCH_AT = Date.parse("2026-09-01T00:00:00Z");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const captchaToken = body.captcha_token || body.captchaToken || "";
    const allocationId = String(body.allocation_id || body.id || "").trim();
    const txSignature = String(body.tx_signature || body.signature || "").trim();
    const actionRaw = String(body.action || "").toLowerCase();
    const action =
      actionRaw === "confirm" || txSignature.length >= 32
        ? "confirm"
        : "prepare";
    const remoteIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;

    // Captcha on prepare only (confirm is bound to locked allocation + on-chain tx)
    if (action === "prepare") {
      await verifyTurnstileToken(captchaToken, remoteIp);
    }

    if (Date.now() < TOKEN_LAUNCH_AT) {
      throw new Error("Airdrop claims open at token launch (1 Sept 2026 UTC)");
    }
    if (!allocationId) throw new Error("allocation_id required");

    const sb = adminClient();

    const { data: player, error: pErr } = await sb
      .from("players")
      .select("wallet_address")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (pErr) throw pErr;
    const wallet = String(player?.wallet_address || "").trim();
    if (wallet.length < 32) {
      throw new Error("No game wallet yet — open Gift Tap once to finish setup");
    }

    const { data: row, error: aErr } = await sb
      .from("airdrop_allocations")
      .select("*")
      .eq("id", allocationId)
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!row) throw new Error("Allocation not found");
    if (row.claimed_at) {
      return jsonResponse({
        success: true,
        already: true,
        amount: 0,
        allocation_id: allocationId,
        message: "Already claimed",
      });
    }

    const source = String(row.source || "") as AirdropSource;
    if (!["l5", "weekly", "monthly"].includes(source)) {
      throw new Error("Invalid allocation source");
    }
    const vault = getAirdropVaultConfig(source);
    if (!vault.ready) {
      throw new Error(`${vault.label} vault not ready — try again later`);
    }

    const amount = Number(row.amount) || 0;
    if (amount <= 0) throw new Error("Invalid amount");

    // ——— CONFIRM (user already paid fee on-chain) ———
    if (action === "confirm") {
      if (txSignature.length < 32) throw new Error("tx_signature required");
      if (row.claim_tx && row.claim_tx !== "pending" && row.claim_tx !== txSignature) {
        throw new Error("Allocation locked to another claim tx");
      }

      const verified = await verifyAirdropClaimTx({
        signature: txSignature,
        source,
        amountUi: amount,
        toWallet: wallet,
      });
      if (!verified.ok) {
        throw new Error(verified.error || "Claim tx verification failed");
      }

      const { error: upErr } = await sb
        .from("airdrop_allocations")
        .update({
          claimed_at: new Date().toISOString(),
          claim_tx: txSignature,
        })
        .eq("id", allocationId)
        .eq("telegram_id", playerId)
        .is("claimed_at", null);
      if (upErr) throw upErr;

      await logEconomy(sb, {
        player_id: playerId,
        kind: "airdrop_g2u_claim",
        delta: amount,
        balance_after: null,
        ref: txSignature,
        meta: {
          allocation_id: allocationId,
          source,
          period_id: row.period_id,
          amount,
          to_wallet: wallet,
          tx: txSignature,
          fee_payer: wallet,
        },
      });

      return jsonResponse({
        success: true,
        already: false,
        amount,
        source,
        period_id: row.period_id,
        allocation_id: allocationId,
        signature: txSignature,
        to_wallet: wallet,
      });
    }

    // ——— PREPARE (vault partial-sign; user will sign + pay fee) ———
    if (row.claim_tx === "pending") {
      // Allow re-prepare (stuck / expired blockhash)
    } else if (row.claim_tx && row.claim_tx.length >= 32) {
      throw new Error("Claim already submitted — wait for confirmation");
    } else {
      const { data: locked, error: lockErr } = await sb
        .from("airdrop_allocations")
        .update({ claim_tx: "pending" })
        .eq("id", allocationId)
        .eq("telegram_id", playerId)
        .is("claimed_at", null)
        .is("claim_tx", null)
        .select("id")
        .maybeSingle();
      if (lockErr) throw lockErr;
      if (!locked?.id) {
        throw new Error("Claim already in progress or already claimed");
      }
    }

    const built = await buildAirdropClaimPartialTx({
      source,
      amountUi: amount,
      toWallet: wallet,
    });

    if (!built.ok) {
      await sb
        .from("airdrop_allocations")
        .update({ claim_tx: null })
        .eq("id", allocationId)
        .eq("telegram_id", playerId)
        .eq("claim_tx", "pending");
      throw new Error(built.error || "Could not build claim transaction");
    }

    return jsonResponse({
      success: true,
      need_sign: true,
      allocation_id: allocationId,
      amount,
      source,
      to_wallet: wallet,
      tx_base64: built.tx_base64,
      mint: built.mint,
      vault: built.vault,
      min_sol_lamports: built.min_sol_lamports,
      message:
        "Sign & send this transaction — you pay the Solana network fee; $G2U comes from the airdrop vault.",
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

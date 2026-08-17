/**
 * create-user-wallet — HARD SECURITY
 *
 * BEFORE (the hole that allowed wallet swap / SOL loss):
 *   - No session JWT required
 *   - Anyone with the anon key could pass any telegram_id
 *   - Always UPDATE wallet_address → overwrote a real wallet with a fresh key
 *
 * AFTER:
 *   - Requires x-gift-session (game JWT) — player can only touch their own row
 *   - SET-ONCE: if wallet_address already set, refuse to change it
 *   - Edge service_role only writes when the column is empty
 *   - Still returns mnemonic once for the CLIENT to encrypt locally (never stored plaintext server-side)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import * as bip39 from "npm:bip39";
import { derivePath } from "npm:ed25519-hd-key";
import { Keypair } from "npm:@solana/web3.js";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gift-session, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) MUST be logged in — no anonymous wallet overwrite
    const claims = await requirePlayerFromRequest(req);
    const sessionPlayerId = String(claims.sub || "").trim();
    if (!sessionPlayerId) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({}));
    // Ignore client-supplied telegram_id if it does not match the session
    const requested = String(body.player_id || body.telegram_id || "").trim();
    if (requested && requested !== sessionPlayerId) {
      return json(
        {
          error: "FORBIDDEN: cannot create wallet for another player",
          code: "WALLET_PLAYER_MISMATCH",
        },
        403,
      );
    }

    const playerKey = sessionPlayerId;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 2) Load existing row — never overwrite a bound wallet
    const { data: row, error: selErr } = await supabase
      .from("players")
      .select("telegram_id, wallet_address, encrypted_vault, username")
      .eq("telegram_id", playerKey)
      .maybeSingle();

    if (selErr) throw selErr;
    if (!row) {
      return json(
        {
          error: "Player not found — register / login first, then create wallet",
          code: "PLAYER_NOT_FOUND",
        },
        404,
      );
    }

    const existingWallet = row.wallet_address
      ? String(row.wallet_address).trim()
      : "";

    if (existingWallet) {
      // Hard lock: do NOT mint a replacement key. Attacker gets nothing new.
      return json(
        {
          success: true,
          already_bound: true,
          publicKey: existingWallet,
          // NEVER return a new mnemonic when wallet exists
          mnemonic: null,
          message: "Wallet already bound — cannot replace",
        },
        200,
      );
    }

    // 3) Generate once
    const mnemonic = bip39.generateMnemonic();
    const seedBuffer = bip39.mnemonicToSeedSync(mnemonic);
    const seedHex = Array.from(seedBuffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const derivationPath = "m/44'/501'/0'/0'";
    const derivedSeed = derivePath(derivationPath, seedHex).key;
    const keypair = Keypair.fromSeed(derivedSeed);
    const publicKey = keypair.publicKey.toBase58();

    // 4) Bind only while empty. Re-check after write.
    //    protect_player_identity also blocks any later replace.
    if (row.wallet_address != null && String(row.wallet_address).trim() === "") {
      await supabase
        .from("players")
        .update({ wallet_address: null })
        .eq("telegram_id", playerKey);
    }

    const { error: updateError } = await supabase
      .from("players")
      .update({ wallet_address: publicKey })
      .eq("telegram_id", playerKey)
      .is("wallet_address", null);

    if (updateError) throw updateError;

    const { data: after, error: afterErr } = await supabase
      .from("players")
      .select("wallet_address")
      .eq("telegram_id", playerKey)
      .maybeSingle();
    if (afterErr) throw afterErr;

    const bound = after?.wallet_address ? String(after.wallet_address).trim() : "";
    if (!bound) {
      throw new Error("Wallet bind failed — try again");
    }
    if (bound !== publicKey) {
      // Another request bound first; do NOT leak unused mnemonic
      return json(
        {
          success: true,
          already_bound: true,
          publicKey: bound,
          mnemonic: null,
          message: "Wallet already bound (race)",
        },
        200,
      );
    }

    // 5) Return mnemonic ONCE — client encrypts into encrypted_vault if empty
    return json({
      success: true,
      already_bound: false,
      publicKey,
      mnemonic,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated|FORBIDDEN/i
      .test(message)
      ? 401
      : 400;
    return json({ error: message }, status);
  }
});

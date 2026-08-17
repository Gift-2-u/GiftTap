/**
 * create-user-wallet — HARD SECURITY
 *
 * - JWT required (own player only)
 * - Default: set-once (cannot replace a bound wallet)
 * - force_new: true → mint NEW in-game key, rebind via gift_rotate_ingame_wallet RPC
 *   (stats untouched; vault cleared; mnemonic returned ONCE)
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

function mintKeypair() {
  const mnemonic = bip39.generateMnemonic();
  const seedBuffer = bip39.mnemonicToSeedSync(mnemonic);
  const seedHex = Array.from(seedBuffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const derivationPath = "m/44'/501'/0'/0'";
  const derivedSeed = derivePath(derivationPath, seedHex).key;
  const keypair = Keypair.fromSeed(derivedSeed);
  return { mnemonic, publicKey: keypair.publicKey.toBase58() };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const sessionPlayerId = String(claims.sub || "").trim();
    if (!sessionPlayerId) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({}));
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

    const forceNew =
      body.force_new === true ||
      body.forceNew === true ||
      String(body.action || "").toLowerCase() === "rotate";

    const playerKey = sessionPlayerId;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: row, error: selErr } = await supabase
      .from("players")
      .select("telegram_id, wallet_address, username")
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

    // ----- FORCE ROTATE: brand-new in-game wallet (no Phantom) -----
    if (forceNew) {
      const { mnemonic, publicKey } = mintKeypair();

      const { data: rotated, error: rotErr } = await supabase.rpc(
        "gift_rotate_ingame_wallet",
        {
          p_telegram_id: playerKey,
          p_new_wallet: publicKey,
        },
      );
      if (rotErr) throw rotErr;

      return json({
        success: true,
        rotated: true,
        already_bound: false,
        publicKey,
        mnemonic,
        old_wallet: (rotated as { old_wallet?: string })?.old_wallet || existingWallet || null,
        message: "New in-game wallet created. Backup the 12 words NOW.",
      });
    }

    // ----- SET-ONCE (default) -----
    if (existingWallet) {
      return json(
        {
          success: true,
          already_bound: true,
          publicKey: existingWallet,
          mnemonic: null,
          message: "Wallet already bound — cannot replace (use force_new to rotate)",
        },
        200,
      );
    }

    const { mnemonic, publicKey } = mintKeypair();

    const { error: updateError } = await supabase
      .from("players")
      .update({ wallet_address: publicKey })
      .eq("telegram_id", playerKey)
      .is("wallet_address", null);

    if (updateError) {
      // PK / NOT NULL: use rotate RPC even for first bind if null update fails
      const { error: rotErr } = await supabase.rpc("gift_rotate_ingame_wallet", {
        p_telegram_id: playerKey,
        p_new_wallet: publicKey,
      });
      if (rotErr) throw updateError;
    } else {
      const { data: after } = await supabase
        .from("players")
        .select("wallet_address")
        .eq("telegram_id", playerKey)
        .maybeSingle();
      const bound = after?.wallet_address
        ? String(after.wallet_address).trim()
        : "";
      if (bound && bound !== publicKey) {
        return json({
          success: true,
          already_bound: true,
          publicKey: bound,
          mnemonic: null,
          message: "Wallet already bound (race)",
        });
      }
      if (!bound) {
        const { error: rotErr } = await supabase.rpc("gift_rotate_ingame_wallet", {
          p_telegram_id: playerKey,
          p_new_wallet: publicKey,
        });
        if (rotErr) throw new Error("Wallet bind failed — try again");
      }
    }

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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { PublicKey } from "npm:@solana/web3.js";
import { mintSessionJwt } from "../_shared/sessionJwt.ts";
import { verifyTurnstileToken } from "../_shared/turnstile.ts";
import {
  assertAuthAllowed,
  assertSignupIpCap,
  clientIpHint,
} from "../_shared/abuseGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gift-session, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** Reject probe junk like "test123" — must be a real Solana pubkey. */
function requireSolanaWallet(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) throw new Error("wallet_address is required");
  if (s.length < 32 || s.length > 44) {
    throw new Error("Invalid Solana wallet_address");
  }
  try {
    return new PublicKey(s).toBase58();
  } catch {
    throw new Error("Invalid Solana wallet_address");
  }
}

function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$100000$${b64(salt)}$${b64(bits)}`;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const cleanName = String(body.username || "").trim();
    const pass = String(body.password || "");
    const captchaToken = body.captcha_token || body.captchaToken || "";
    await verifyTurnstileToken(
      captchaToken,
      req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for"),
    );
    const wallet_address = requireSolanaWallet(body.wallet_address);
    const encrypted_vault = body.encrypted_vault
      ? String(body.encrypted_vault)
      : null;

    if (!USERNAME_RE.test(cleanName)) {
      throw new Error(
        "Username must be 3–20 characters: letters, numbers, underscore only.",
      );
    }
    if (pass.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    if (cleanName.toLowerCase() === "player") {
      throw new Error('Username "Player" is reserved. Pick a unique name.');
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Block banned IPs / usernames before creating any row
    await assertAuthAllowed(req, cleanName, supabase);
    // Hard cap: max N accounts per IP (stops 14-account farms)
    const signupIp = await assertSignupIpCap(req, supabase);

    const { data: existing } = await supabase
      .from("players")
      .select("telegram_id")
      .ilike("username", cleanName)
      .maybeSingle();

    if (existing) {
      throw new Error("That username is already taken. Choose another.");
    }

    const playerId = crypto.randomUUID();
    const password_hash = await hashPassword(pass);

    // Invite link: /play?ref=<referrer telegram_id>. Set once at signup only.
    // Cap: each referrer may credit at most MAX_REFERRALS invitees (anti multi-account farm).
    const JOINER_BONUS = 500;
    const MAX_REFERRALS = 5;
    const referredRaw = String(body.referred_by || body.ref || "").trim();
    let referred_by: string | null = null;
    let shard_balance = 0;
    if (referredRaw && referredRaw !== playerId) {
      const { data: referrer } = await supabase
        .from("players")
        .select("telegram_id")
        .eq("telegram_id", referredRaw)
        .maybeSingle();
      if (referrer?.telegram_id) {
        const refId = String(referrer.telegram_id);
        const { count, error: countErr } = await supabase
          .from("players")
          .select("telegram_id", { count: "exact", head: true })
          .eq("referred_by", refId);
        if (countErr) {
          console.warn("referral cap count", countErr.message || countErr);
        }
        const used = Number(count) || 0;
        if (used < MAX_REFERRALS) {
          referred_by = refId;
          shard_balance = JOINER_BONUS;
        }
        // else: signup OK, but no referred_by / joiner bonus (cap full)
      }
    }

    // Public row — NO password / vault columns
    const insertRow: Record<string, unknown> = {
      telegram_id: playerId,
      username: cleanName,
      has_beta_access: true,
      shard_balance,
      season_shards: 0,
      lifetime_taps: 0,
      sol_balance: 0,
      usdc_balance: 0,
      wallet_address,
      referred_by,
      signup_ip: signupIp,
      last_login_ip: signupIp,
    };

    const { error: insertError } = await supabase.from("players").insert(insertRow);
    if (insertError) {
      if (
        insertError.message?.includes("players_username") ||
        insertError.code === "23505"
      ) {
        throw new Error("That username is already taken. Choose another.");
      }
      throw new Error(
        insertError.message ||
          insertError.details ||
          insertError.hint ||
          JSON.stringify(insertError),
      );
    }

    // Secrets row — Edge only table
    const { error: secErr } = await supabase.from("player_secrets").upsert({
      telegram_id: playerId,
      password_hash,
      encrypted_vault: encrypted_vault && String(encrypted_vault).length > 20
        ? encrypted_vault
        : null,
      updated_at: new Date().toISOString(),
    });
    if (secErr) {
      // rollback player row
      await supabase.from("players").delete().eq("telegram_id", playerId);
      throw new Error(secErr.message || "Could not store account secrets");
    }

    let session_token: string | null = null;
    let expires_at: string | null = null;
    try {
      const minted = await mintSessionJwt(playerId, cleanName);
      session_token = minted.token;
      expires_at = minted.expires_at;
      const token_hash = await sha256Hex(minted.token);
      await supabase.from("player_sessions").insert({
        player_id: playerId,
        token_hash,
        expires_at: minted.expires_at,
        user_agent: req.headers.get("user-agent")?.slice(0, 200) || null,
        ip_hint: clientIpHint(req),
      });
    } catch (jwtErr) {
      console.warn("session jwt:", jwtErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        player_id: playerId,
        username: cleanName,
        wallet_address,
        has_vault: !!(encrypted_vault && String(encrypted_vault).length > 20),
        session_token,
        expires_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

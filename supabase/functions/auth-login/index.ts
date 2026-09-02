import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { mintSessionJwt } from "../_shared/sessionJwt.ts";
import { verifyTurnstileToken } from "../_shared/turnstile.ts";
import {
  assertAuthAllowed,
  assertPlayerAllowed,
  clientIpHint,
} from "../_shared/abuseGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gift-session, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = b64ToBytes(parts[2]);
  const expected = parts[3];
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return b64(bits) === expected;
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

    if (!cleanName || !pass) {
      throw new Error("Username and password are required.");
    }

    await verifyTurnstileToken(
      captchaToken,
      req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for"),
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // IP + username hard blocks (sybil farm)
    await assertAuthAllowed(req, cleanName, supabase);

    const { data: row, error } = await supabase
      .from("players")
      .select("telegram_id, username, wallet_address, has_beta_access, is_banned")
      .ilike("username", cleanName)
      .maybeSingle();

    if (error) throw error;
    if (!row) throw new Error("No account with that username.");
    if ((row as { is_banned?: boolean }).is_banned === true) {
      throw new Error("Account suspended.");
    }
    await assertPlayerAllowed(String(row.telegram_id), supabase);

    const { data: sec, error: secErr } = await supabase
      .from("player_secrets")
      .select("password_hash, encrypted_vault")
      .eq("telegram_id", String(row.telegram_id))
      .maybeSingle();

    if (secErr) throw secErr;

    // Legacy fallback: if secrets row missing, try old columns (pre-migrate)
    let password_hash = sec?.password_hash || null;
    let encrypted_vault = sec?.encrypted_vault || null;
    if (!password_hash) {
      try {
        const { data: legacy } = await supabase
          .from("players")
          .select("password_hash, encrypted_vault")
          .eq("telegram_id", String(row.telegram_id))
          .maybeSingle();
        if (legacy) {
          password_hash = (legacy as { password_hash?: string }).password_hash || null;
          encrypted_vault = (legacy as { encrypted_vault?: string }).encrypted_vault || null;
        }
      } catch {
        /* columns gone — ok */
      }
    }

    if (!password_hash) {
      throw new Error(
        "This account has no password yet. Use Restore with 12 words once, then set a password — or create a new account.",
      );
    }

    const ok = await verifyPassword(pass, password_hash);
    if (!ok) throw new Error("Wrong password.");

    // last_updated = this player logged in (NOT taps — those use last_tap_date)
    const loginAt = new Date().toISOString();
    const loginIp = clientIpHint(req);
    try {
      const loginPatch: Record<string, unknown> = { last_updated: loginAt };
      if (loginIp) {
        loginPatch.ip = loginIp;
        loginPatch.last_login_ip = loginIp;
      }
      await supabase
        .from("players")
        .update(loginPatch)
        .eq("telegram_id", String(row.telegram_id));
    } catch (luErr) {
      console.warn("login last_updated", luErr);
    }

    let session_token: string | null = null;
    let expires_at: string | null = null;
    try {
      const minted = await mintSessionJwt(row.telegram_id, row.username);
      session_token = minted.token;
      expires_at = minted.expires_at;
      const token_hash = await sha256Hex(minted.token);
      await supabase.from("player_sessions").insert({
        player_id: String(row.telegram_id),
        token_hash,
        expires_at: minted.expires_at,
        user_agent: req.headers.get("user-agent")?.slice(0, 200) || null,
        ip_hint: clientIpHint(req),
      });
    } catch (jwtErr) {
      console.warn("session jwt:", jwtErr);
    }

    const vault = encrypted_vault ? String(encrypted_vault).trim() : "";
    const has_vault = vault.length > 20 && vault !== "probe";

    return new Response(
      JSON.stringify({
        success: true,
        player_id: row.telegram_id,
        username: row.username,
        wallet_address: row.wallet_address,
        has_beta_access: row.has_beta_access !== false,
        has_vault,
        last_updated: loginAt,
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

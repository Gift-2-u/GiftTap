/**
 * wallet-vault — secrets in player_secrets only (not on players table).
 *
 * HARD WALLET SECURITY:
 *   get / status — NEVER return encrypted_vault (JWT alone must not unlock keys)
 *   unlock       — password required; verified against player_secrets.password_hash
 *   set_if_empty — bind vault once after signup
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
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

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function looksRealVault(v: unknown): boolean {
  const s = v != null ? String(v).trim() : "";
  return s.length > 20 && s !== "probe";
}

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub || "").trim();
    if (!playerId) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || body.op || "get").toLowerCase();
    const sb = admin();

    // get = status only — never hand out ciphertext for JWT alone
    if (action === "get" || action === "status") {
      const { data: player } = await sb
        .from("players")
        .select("wallet_address")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (!player) throw new Error("Player not found");

      const { data: sec, error } = await sb
        .from("player_secrets")
        .select("encrypted_vault, password_hash")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (error) throw error;

      return json({
        success: true,
        has_vault: looksRealVault(sec?.encrypted_vault),
        has_password: !!(sec?.password_hash && String(sec.password_hash).trim()),
        wallet_address: player.wallet_address || null,
        // intentional: no encrypted_vault
      });
    }

    // Password-gated unlock — only way to receive encrypted_vault
    if (action === "unlock") {
      const password = String(body.password || "");
      if (password.length < 6) throw new Error("Password required to unlock wallet");

      const { data: player } = await sb
        .from("players")
        .select("wallet_address")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (!player) throw new Error("Player not found");

      const { data: sec, error } = await sb
        .from("player_secrets")
        .select("encrypted_vault, password_hash")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (error) throw error;

      const hash = sec?.password_hash ? String(sec.password_hash) : "";
      if (!hash) throw new Error("No password on this account — set one to unlock wallet");
      const okPw = await verifyPassword(password, hash);
      if (!okPw) throw new Error("Wrong password");

      const vault = sec?.encrypted_vault;
      const ok = looksRealVault(vault);
      if (!ok) {
        return json({
          success: true,
          has_vault: false,
          unlocked: false,
          encrypted_vault: null,
          wallet_address: player.wallet_address || null,
          message: "No vault bound yet",
        });
      }

      return json({
        success: true,
        has_vault: true,
        unlocked: true,
        encrypted_vault: String(vault),
        wallet_address: player.wallet_address || null,
      });
    }

    if (action === "set_if_empty" || action === "set") {
      const incoming = body.encrypted_vault != null
        ? String(body.encrypted_vault).trim()
        : "";
      if (!looksRealVault(incoming)) throw new Error("Invalid encrypted_vault");

      const { data: sec } = await sb
        .from("player_secrets")
        .select("encrypted_vault")
        .eq("telegram_id", playerId)
        .maybeSingle();

      if (looksRealVault(sec?.encrypted_vault)) {
        return json({
          success: true,
          already_set: true,
          has_vault: true,
          message: "Vault already bound — cannot replace",
        });
      }

      const { error: upErr } = await sb.from("player_secrets").upsert(
        {
          telegram_id: playerId,
          encrypted_vault: incoming,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telegram_id" },
      );
      if (upErr) throw upErr;

      return json({ success: true, already_set: false, has_vault: true });
    }

    throw new Error("Unknown action (get|status|unlock|set_if_empty)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
      .test(message)
      ? 401
      : 400;
    return json({ error: message }, status);
  }
});

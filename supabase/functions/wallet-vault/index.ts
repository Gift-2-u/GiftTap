/**
 * wallet-vault — secrets in player_secrets only (not on players table).
 *
 * HARD WALLET SECURITY:
 *   get / status — NEVER return encrypted_vault (JWT alone must not unlock keys)
 *   unlock       — password required; verified against player_secrets.password_hash
 *   set_if_empty — bind vault once after signup
 *   set_credentials — set/change username + password (service_role; client cannot)
 *   delete_account  — password + confirm username; wipe secrets + player row
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

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

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

    // Set or change username + password (Settings → Change username / password)
    if (
      action === "set_credentials" ||
      action === "change_password" ||
      action === "claim_credentials"
    ) {
      const cleanName = String(body.username || "").trim();
      const pass = String(body.password || body.new_password || "");
      const currentPass = String(
        body.current_password || body.old_password || "",
      );

      if (!USERNAME_RE.test(cleanName)) {
        throw new Error(
          "Username must be 3–20 characters: letters, numbers, underscore only.",
        );
      }
      if (cleanName.toLowerCase() === "player") {
        throw new Error('Username "Player" is reserved.');
      }
      if (pass.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      const { data: me, error: meErr } = await sb
        .from("players")
        .select("telegram_id, username")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (meErr) throw meErr;
      if (!me) throw new Error("Player not found");

      // Username unique among other players
      const { data: taken, error: takeErr } = await sb
        .from("players")
        .select("telegram_id")
        .ilike("username", cleanName)
        .maybeSingle();
      if (takeErr) throw takeErr;
      if (taken && String(taken.telegram_id) !== playerId) {
        throw new Error("That username is already taken. Choose another.");
      }

      const { data: sec, error: secErr } = await sb
        .from("player_secrets")
        .select("password_hash, encrypted_vault")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (secErr) throw secErr;

      const existingHash = sec?.password_hash
        ? String(sec.password_hash).trim()
        : "";
      if (existingHash) {
        if (currentPass.length < 6) {
          throw new Error("Enter your current password to change it.");
        }
        const ok = await verifyPassword(currentPass, existingHash);
        if (!ok) throw new Error("Wrong current password.");
      }

      const password_hash = await hashPassword(pass);
      const { error: upSec } = await sb.from("player_secrets").upsert(
        {
          telegram_id: playerId,
          password_hash,
          encrypted_vault: sec?.encrypted_vault ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telegram_id" },
      );
      if (upSec) throw upSec;

      if (String(me.username || "") !== cleanName) {
        const { error: upName } = await sb
          .from("players")
          .update({ username: cleanName })
          .eq("telegram_id", playerId);
        if (upName) {
          if (
            upName.code === "23505" ||
            /unique|duplicate/i.test(String(upName.message || ""))
          ) {
            throw new Error("That username is already taken.");
          }
          throw upName;
        }
      }

      return json({
        success: true,
        username: cleanName,
        has_password: true,
      });
    }

    // Self-serve account deletion (GDPR / Play Data safety)
    if (action === "delete_account") {
      const password = String(body.password || "");
      const confirmName = String(body.confirm_username || body.username || "")
        .trim();
      if (password.length < 6) {
        throw new Error("Password required to delete your account.");
      }
      if (!confirmName) {
        throw new Error("Type your username to confirm deletion.");
      }

      const { data: me, error: meErr } = await sb
        .from("players")
        .select("telegram_id, username, wallet_address")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (meErr) throw meErr;
      if (!me) throw new Error("Player not found");

      if (
        String(me.username || "").toLowerCase() !== confirmName.toLowerCase()
      ) {
        throw new Error("Username does not match. Deletion cancelled.");
      }

      const { data: sec, error: secErr } = await sb
        .from("player_secrets")
        .select("password_hash")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (secErr) throw secErr;
      const hash = sec?.password_hash ? String(sec.password_hash).trim() : "";
      if (!hash) {
        throw new Error(
          "Set a password first (Settings), then you can delete this account.",
        );
      }
      const okPw = await verifyPassword(password, hash);
      if (!okPw) throw new Error("Wrong password.");

      const id = playerId;

      // Sessions
      try {
        await sb.from("player_sessions").delete().eq("player_id", id);
      } catch (e) {
        console.warn("delete sessions", e);
      }

      // Notices / abuse player_id rows
      try {
        await sb.from("player_notices").delete().eq("player_id", id);
      } catch (e) {
        console.warn("delete notices", e);
      }
      try {
        await sb
          .from("abuse_blocks")
          .delete()
          .eq("kind", "player_id")
          .eq("value", id);
      } catch (e) {
        console.warn("delete abuse player_id", e);
      }

      // Score ledgers (leave ranks)
      for (const table of [
        "weekly_score_ledger",
        "season_score_ledger",
        "lifetime_score_ledger",
      ]) {
        try {
          await sb.from(table).delete().eq("telegram_id", id);
        } catch (e) {
          console.warn("delete ledger", table, e);
        }
      }

      // Secrets first (password + vault)
      const { error: delSec } = await sb
        .from("player_secrets")
        .delete()
        .eq("telegram_id", id);
      if (delSec) throw delSec;

      // Public player row
      const { error: delPl } = await sb
        .from("players")
        .delete()
        .eq("telegram_id", id);
      if (delPl) throw delPl;

      return json({
        success: true,
        deleted: true,
        message:
          "Account deleted. On-chain SOL / $G2U / NFTs in your wallet remain on Solana.",
      });
    }

    throw new Error(
      "Unknown action (get|status|unlock|set_if_empty|set_credentials|delete_account)",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
      .test(message)
      ? 401
      : 400;
    return json({ error: message }, status);
  }
});

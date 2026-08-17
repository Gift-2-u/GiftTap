/**
 * wallet-vault — secrets in player_secrets only (not on players table).
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

    if (action === "get") {
      const { data: player } = await sb
        .from("players")
        .select("wallet_address")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (!player) throw new Error("Player not found");

      const { data: sec, error } = await sb
        .from("player_secrets")
        .select("encrypted_vault")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (error) throw error;

      const vault = sec?.encrypted_vault;
      const ok = looksRealVault(vault);
      return json({
        success: true,
        has_vault: ok,
        encrypted_vault: ok ? String(vault) : null,
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

    if (action === "status") {
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
      });
    }

    throw new Error("Unknown action (get|set_if_empty|status)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
      .test(message)
      ? 401
      : 400;
    return json({ error: message }, status);
  }
});

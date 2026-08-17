import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gift-session, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Public game fields only — never password_hash / encrypted_vault in this payload */
const PLAYER_SELECT = [
  "telegram_id",
  "username",
  "wallet_address",
  "shard_balance",
  "season_shards",
  "weekly_shards",
  "weekly_week_id",
  "lifetime_taps",
  "daily_taps",
  "last_tap_date",
  "last_energy",
  "max_unlocked_level",
  "max_daily_limit",
  "tap_power",
  "inventory",
  "current_streak",
  "sol_balance",
  "usdc_balance",
  "has_beta_access",
  "limit_boost_amount",
  "limit_boost_expires",
  "frenzy_expires",
  "efficiency_expires",
  "energy_boost_expires",
  "daily_ads_watched",
  "last_ad_date",
  "last_updated",
].join(", ");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: player, error } = await supabase
      .from("players")
      .select(PLAYER_SELECT)
      .eq("telegram_id", playerId)
      .maybeSingle();

    if (error) throw error;
    if (!player) throw new Error("Player not found");

    // Secrets only as booleans — from player_secrets (never on players table)
    let has_password = false;
    let has_vault = false;
    try {
      const { data: sec } = await supabase
        .from("player_secrets")
        .select("password_hash, encrypted_vault")
        .eq("telegram_id", playerId)
        .maybeSingle();
      has_password = !!(sec?.password_hash && String(sec.password_hash).trim());
      const v = sec?.encrypted_vault ? String(sec.encrypted_vault).trim() : "";
      has_vault = v.length > 20 && v !== "probe";
    } catch {
      /* ignore */
    }

    let secure_economy = true;
    try {
      const { data: gs } = await supabase
        .from("game_settings")
        .select("secure_economy")
        .eq("id", 1)
        .maybeSingle();
      secure_economy = gs?.secure_economy !== false;
    } catch {
      secure_economy = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        player,
        has_password,
        has_vault,
        secure_economy: true,
        session: {
          player_id: playerId,
          username: claims.username,
          exp: claims.exp,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session/i.test(message)
      ? 401
      : 400;
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});

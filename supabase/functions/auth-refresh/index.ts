/**
 * auth-refresh — silent session renewal.
 * Players close and reopen the game; they do NOT re-type passwords.
 * Accepts a still-valid JWT, or an expired JWT within the grace window,
 * and returns a fresh 90-day session_token.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  sessionTokenFromRequest,
  mintSessionJwt,
  verifySessionJwtForRefresh,
} from "../_shared/sessionJwt.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  assertIpAllowed,
  assertPlayerAllowed,
  clientIpHint,
} from "../_shared/abuseGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gift-session, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    // Prefer x-gift-session — Authorization is the Supabase anon key for the gateway.
    // Using Bearer-only broke silent renew after long phone-tab sleeps.
    const token = sessionTokenFromRequest(req);
    if (!token) {
      throw new Error("Not authenticated (missing session token)");
    }

    // Valid OR expired-but-in-grace (30d) → allow silent renew without password
    const claims = await verifySessionJwtForRefresh(token);
    const playerId = String(claims.sub);
    const username = String(claims.username || "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    await assertIpAllowed(req, supabase);
    await assertPlayerAllowed(playerId, supabase);

    const minted = await mintSessionJwt(playerId, username);

    // Best-effort session registry (non-fatal)
    try {
      const token_hash = await sha256Hex(minted.token);
      await supabase.from("player_sessions").insert({
        player_id: playerId,
        token_hash,
        expires_at: minted.expires_at,
        user_agent: req.headers.get("user-agent")?.slice(0, 200) || null,
        ip_hint: clientIpHint(req),
      });
    } catch (regErr) {
      console.warn("player_sessions insert", regErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        player_id: playerId,
        username,
        session_token: minted.token,
        expires_at: minted.expires_at,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /fully expired|Invalid session|Not authenticated|signature/i
      .test(message)
      ? 401
      : 400;
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});

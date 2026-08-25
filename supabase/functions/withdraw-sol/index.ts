/**
 * DISABLED — legacy Telegram custodial payout.
 *
 * Old flow paid real SOL from PROJECT_WALLET_SECRET based on DB sol_balance
 * with no game-session auth. Current Gift Tap / WalletHub Send signs with
 * the player's own in-game key (client-side) and must NOT use this function.
 *
 * Redeploy this Edge function for the 403 to apply in production.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gift-session, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "withdraw-sol is permanently disabled (legacy Telegram treasury payout).",
      code: "WITHDRAW_SOL_DISABLED",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

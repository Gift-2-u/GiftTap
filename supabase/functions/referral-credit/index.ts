/**
 * Credit referrer for invitee milestones (JWT = invitee).
 * Logic lives in _shared/economy.ts runReferralCredit (also used by commit-taps / wall-climb).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  runReferralCredit,
} from "../_shared/economy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const inviteeId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "").toLowerCase();
    const sb = adminClient();
    const result = await runReferralCredit(sb, inviteeId, kind);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
      .test(message)
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});

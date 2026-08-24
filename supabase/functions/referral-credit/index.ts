/**
 * Credit referrer for invitee milestones (JWT = invitee).
 * Prevents client from minting referrer shards after secure_economy lock.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy} from "../_shared/economy.ts";

const AMOUNTS: Record<string, { amount: number; flag: string; needTaps?: number }> = {
  taps1000: { amount: 500, flag: "referral_taps1000_paid", needTaps: 1000 },
  lvl1: { amount: 1000, flag: "referral_lvl1_paid", needTaps: 10000 },
  wall5: { amount: 3000, flag: "referral_wall5_paid" }};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const inviteeId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "").toLowerCase();
    const meta = AMOUNTS[kind];
    if (!meta) throw new Error("kind must be taps1000|lvl1|wall5");

    const sb = adminClient();
    const { data: invitee, error: invErr } = await sb
      .from("players")
      .select(
        `telegram_id, referred_by, lifetime_taps, max_unlocked_level, ${meta.flag}`,
      )
      .eq("telegram_id", inviteeId)
      .maybeSingle();
    if (invErr) throw invErr;
    if (!invitee) throw new Error("Player not found");
    if (!invitee.referred_by) {
      return jsonResponse({ success: true, skipped: "no_referrer" });
    }
    if (String(invitee.referred_by) === inviteeId) {
      return jsonResponse({ success: true, skipped: "self_ref" });
    }
    if (invitee[meta.flag] === true) {
      return jsonResponse({ success: true, already: true });
    }
    if (meta.needTaps && (Number(invitee.lifetime_taps) || 0) < meta.needTaps) {
      throw new Error("Milestone not reached");
    }
    if (kind === "wall5" && (Number(invitee.max_unlocked_level) || 0) < 5) {
      // wall 4→5 unlocks newCap 9; after climb max is at least 9
      // accept max_unlocked_level >= 5 as "past first wall"
      if ((Number(invitee.max_unlocked_level) || 0) < 9) {
        // still at 4 or less
        throw new Error("Wall 4→5 not cleared yet");
      }
    }

    // Claim flag atomically
    const { data: claimed, error: claimErr } = await sb
      .from("players")
      .update({
        [meta.flag]: true,
        last_updated: new Date().toISOString(),
      })
      .eq("telegram_id", inviteeId)
      .or(`${meta.flag}.is.null,${meta.flag}.eq.false`)
      .select("referred_by")
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claimed?.referred_by) {
      return jsonResponse({ success: true, already: true });
    }

    const referrerId = String(claimed.referred_by);
    const { data: ref, error: refErr } = await sb
      .from("players")
      .select("shard_balance")
      .eq("telegram_id", referrerId)
      .maybeSingle();
    if (refErr || !ref) throw new Error("Referrer not found");

    const next = Math.round(((Number(ref.shard_balance) || 0) + meta.amount) * 1000) / 1000;
    const { error: upErr } = await sb
      .from("players")
      .update({
        shard_balance: next,
        last_updated: new Date().toISOString(),
      })
      .eq("telegram_id", referrerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: referrerId,
      kind: `referral_${kind}`,
      delta: meta.amount,
      balance_after: next,
      ref: inviteeId});

    return jsonResponse({
      success: true,
      kind,
      amount: meta.amount,
      referrer_id: referrerId,
      balance_after: next});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
      message,
    )
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});

/**
 * Referral milestones (approved plan):
 * - Joiner: +500 shards on join (handled in GiftTap init — not here)
 * - Referrer: NO bonus on join
 * - Referrer: +1000 when invitee reaches Level 1
 * - Referrer: +3000 when invitee clears wall 4→5
 */
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';

export const REFERRAL = {
  JOINER_ON_JOIN: 500,
  REFERRER_LVL1: 1000,
  REFERRER_WALL5: 3000,
};

/** Level 1 = 10,000 lifetime taps (same curve as calculateLevel for early levels). */
function reachedLevel1(lifetimeTaps) {
  return Number(lifetimeTaps) >= 10000;
}

async function creditReferrer(referrerId, amount, reason) {
  if (!referrerId || referrerId === '') return false;
  const { data: referrer, error } = await supabase
    .from('players')
    .select('shard_balance')
    .eq(DB_PLAYER_ID, String(referrerId))
    .maybeSingle();

  if (error || !referrer) {
    console.warn('Referrer not found for', reason, referrerId, error?.message);
    return false;
  }

  const newBalance = (Number(referrer.shard_balance) || 0) + amount;
  const { error: upErr } = await supabase
    .from('players')
    .update({ shard_balance: newBalance })
    .eq(DB_PLAYER_ID, String(referrerId));

  if (upErr) {
    console.error('Referrer credit failed', reason, upErr);
    return false;
  }
  console.log(`✅ Referral ${reason}: +${amount} shards → ${referrerId}`);
  return true;
}

/**
 * Call after invitee progress save when lifetime taps imply level >= 1.
 * Pays referrer once (flag referral_lvl1_paid on invitee).
 */
export async function tryPayReferrerForLevel1(inviteePlayerId, lifetimeTaps) {
  if (!inviteePlayerId) return;
  if (!reachedLevel1(lifetimeTaps)) return;

  // Claim milestone atomically (only first claim wins)
  const { data: claimed, error } = await supabase
    .from('players')
    .update({ referral_lvl1_paid: true })
    .eq(DB_PLAYER_ID, String(inviteePlayerId))
    .or('referral_lvl1_paid.is.null,referral_lvl1_paid.eq.false')
    .not('referred_by', 'is', null)
    .select('referred_by')
    .maybeSingle();

  if (error) {
    // Columns missing: log once; game still works
    if (error.message?.includes('referral_lvl1_paid') || error.code === 'PGRST204') {
      console.warn(
        'Add columns: alter table players add column if not exists referral_lvl1_paid boolean default false;',
      );
    } else {
      console.warn('tryPayReferrerForLevel1:', error.message);
    }
    return;
  }
  if (!claimed?.referred_by) return;
  if (String(claimed.referred_by) === String(inviteePlayerId)) return;

  await creditReferrer(claimed.referred_by, REFERRAL.REFERRER_LVL1, 'lvl1');
}

/**
 * Call after invitee successfully ascends wall 4 → 5.
 */
export async function tryPayReferrerForWall5(inviteePlayerId) {
  if (!inviteePlayerId) return;

  const { data: claimed, error } = await supabase
    .from('players')
    .update({ referral_wall5_paid: true })
    .eq(DB_PLAYER_ID, String(inviteePlayerId))
    .or('referral_wall5_paid.is.null,referral_wall5_paid.eq.false')
    .not('referred_by', 'is', null)
    .select('referred_by')
    .maybeSingle();

  if (error) {
    if (error.message?.includes('referral_wall5_paid') || error.code === 'PGRST204') {
      console.warn(
        'Add columns: alter table players add column if not exists referral_wall5_paid boolean default false;',
      );
    } else {
      console.warn('tryPayReferrerForWall5:', error.message);
    }
    return;
  }
  if (!claimed?.referred_by) return;
  if (String(claimed.referred_by) === String(inviteePlayerId)) return;

  await creditReferrer(claimed.referred_by, REFERRAL.REFERRER_WALL5, 'wall5');
}

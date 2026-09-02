/**
 * Referral milestones:
 * - Joiner: +500 shards on join (handled in GiftTap init — not here)
 * - Referrer: NO bonus on join
 * - Referrer: +500 when invitee reaches 1,000 lifetime_taps
 * - Referrer: +1000 when invitee reaches Level 1 (~10k lifetime)
 * - Referrer: +3000 when invitee clears wall 4→5
 */
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';
import { hasSecureSession, secureReferralCredit } from './secureApi';

export const REFERRAL = {
  JOINER_ON_JOIN: 500,
  /** First day of real play — referrer bonus */
  REFERRER_TAPS_1000: 500,
  REFERRER_LVL1: 1000,
  REFERRER_WALL5: 3000,
  TAPS_1000_THRESHOLD: 1000,
  /** Max invitees that credit one referrer (anti multi-account farm). */
  MAX_REFERRALS: 5,
};

/** Level 1 = 10,000 lifetime taps (same curve as calculateLevel for early levels). */
function reachedLevel1(lifetimeTaps) {
  return Number(lifetimeTaps) >= 10000;
}

function reachedTaps1000(lifetimeTaps) {
  return Number(lifetimeTaps) >= REFERRAL.TAPS_1000_THRESHOLD;
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
 * Call after invitee progress save when lifetime_taps >= 1000.
 * Pays referrer once (flag referral_taps1000_paid on invitee).
 */
export async function tryPayReferrerForTaps1000(inviteePlayerId, lifetimeTaps) {
  if (!inviteePlayerId) return;
  if (!reachedTaps1000(lifetimeTaps)) return;
  if (hasSecureSession()) {
    try {
      await secureReferralCredit('taps1000');
      return;
    } catch (e) {
      console.warn('secure referral taps1000', e?.message || e);
    }
  }

  const { data: claimed, error } = await supabase
    .from('players')
    .update({ referral_taps1000_paid: true })
    .eq(DB_PLAYER_ID, String(inviteePlayerId))
    .or('referral_taps1000_paid.is.null,referral_taps1000_paid.eq.false')
    .not('referred_by', 'is', null)
    .select('referred_by')
    .maybeSingle();

  if (error) {
    if (
      error.message?.includes('referral_taps1000_paid') ||
      error.code === 'PGRST204'
    ) {
      console.warn(
        'Add column: alter table players add column if not exists referral_taps1000_paid boolean default false;',
      );
    } else {
      console.warn('tryPayReferrerForTaps1000:', error.message);
    }
    return;
  }
  if (!claimed?.referred_by) return;
  if (String(claimed.referred_by) === String(inviteePlayerId)) return;

  await creditReferrer(
    claimed.referred_by,
    REFERRAL.REFERRER_TAPS_1000,
    'taps1000',
  );
}

export async function tryPayReferrerForLevel1(inviteePlayerId, lifetimeTaps) {
  if (!inviteePlayerId) return;
  if (!reachedLevel1(lifetimeTaps)) return;
  if (hasSecureSession()) {
    try {
      await secureReferralCredit('lvl1');
      return;
    } catch (e) {
      console.warn('secure referral lvl1', e?.message || e);
    }
  }

  const { data: claimed, error } = await supabase
    .from('players')
    .update({ referral_lvl1_paid: true })
    .eq(DB_PLAYER_ID, String(inviteePlayerId))
    .or('referral_lvl1_paid.is.null,referral_lvl1_paid.eq.false')
    .not('referred_by', 'is', null)
    .select('referred_by')
    .maybeSingle();

  if (error) {
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

export async function tryPayReferrerForWall5(inviteePlayerId) {
  if (!inviteePlayerId) return;
  if (hasSecureSession()) {
    try {
      await secureReferralCredit('wall5');
      return;
    } catch (e) {
      console.warn('secure referral wall5', e?.message || e);
    }
  }

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

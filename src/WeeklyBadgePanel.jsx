import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';
import {
  getUtcWeekId,
  getPreviousUtcWeekId,
  isUtcWeekClosed,
} from './weeklyQuestLogic';
import {
  BADGE_TIERS,
  badgeTierForWeeklyRank,
  hasClaimedWeeklyBadgeDurable,
  applyWeeklyBadgeAward,
  getWeeklyBadgeAward,
  getBadgeCounts,
} from './weeklyBadges';
import { mergeInventoryWeekly, hydrateWeeklyClaimsFromLedger } from './weeklyQuestLogic';
import { ensureWeeklySeasonRollover } from './weeklySeasonRollover';
import { hasSecureSession, ensureSecureSession, secureBadgeClaim } from './secureApi';

/**
 * Compact: claim last week's top-10 badge only (no essay UI).
 * Full rules: Menu → Game Guide → Leaderboards.
 * Used in Shop → Pack → Badges.
 */
export default function WeeklyBadgePanel({
  playerId,
  inventory,
  onInventoryChange,
}) {
  const liveWeekId = getUtcWeekId();
  const prevWeekId = getPreviousUtcWeekId();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [prevSnap, setPrevSnap] = useState(null);
  const [snapLoading, setSnapLoading] = useState(true);

  const claimedPrev = useMemo(
    () => hasClaimedWeeklyBadgeDurable(inventory, prevWeekId),
    [inventory, prevWeekId],
  );

  useEffect(() => {
    if (!playerId) {
      setSnapLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setSnapLoading(true);
      try {
        await ensureWeeklySeasonRollover({ force: true });
        const { data, error } = await supabase
          .from('weekly_leaderboard_snapshots')
          .select('rank, score, badge_tier, username, telegram_id')
          .eq('week_id', prevWeekId)
          .eq('telegram_id', String(playerId))
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn('weekly snapshot', error.message);
          setPrevSnap(null);
        } else if (data) {
          setPrevSnap({
            rank: data.rank,
            score: data.score,
            tier: data.badge_tier || badgeTierForWeeklyRank(data.rank),
          });
        } else {
          setPrevSnap(null);
        }
      } catch {
        if (!cancelled) setPrevSnap(null);
      } finally {
        if (!cancelled) setSnapLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId, prevWeekId]);

  const invBadgeCount = useMemo(() => {
    const c = getBadgeCounts(inventory || {});
    return Object.values(c).reduce((a, b) => a + b, 0);
  }, [inventory]);

  // Claim if not claimed yet, OR claimed/ledger but backpack still has 0 badges (Edge re-sync)
  const canClaimPrev =
    prevSnap &&
    prevSnap.tier &&
    isUtcWeekClosed(prevWeekId) &&
    (!claimedPrev || invBadgeCount < 1);

  const handleClaim = async () => {
    if (!playerId || busy || !canClaimPrev) return;
    setBusy(true);
    setNotice(null);
    try {
      // Always server-side: client cannot write inventory under hard security
      await ensureSecureSession();
      if (!hasSecureSession()) {
        throw new Error('Log in again to claim weekly badges (secure session required).');
      }
      const data = await secureBadgeClaim(prevWeekId);
      const inv = data.inventory || inventory || {};
      if (typeof onInventoryChange === 'function') onInventoryChange(inv);
      const meta = BADGE_TIERS[data.tier] || BADGE_TIERS[prevSnap?.tier];
      setNotice({
        ok: true,
        msg: data.already
          ? (data.repaired
              ? `${meta?.emoji || '🏅'} ${meta?.name || data.tier} restored to backpack.`
              : `Already claimed for ${prevWeekId}.`)
          : `${meta?.emoji || '🏅'} ${meta?.name || data.tier} claimed for ${prevWeekId}`,
      });
    } catch (e) {
      console.error('weekly badge', e);
      setNotice({ ok: false, msg: e?.message || 'Could not claim badge' });
    } finally {
      setBusy(false);
    }
  };

  // Nothing to show if no claim available and already claimed / no snap
  if (snapLoading) {
    return (
      <div style={{ color: '#666', fontSize: 11, padding: '8px 0' }}>
        Checking last week…
      </div>
    );
  }

  if (claimedPrev) {
    const claimedTier =
      getWeeklyBadgeAward(inventory, prevWeekId)?.tier || prevSnap?.tier || null;
    const claimedMeta = claimedTier ? BADGE_TIERS[claimedTier] : null;
    return (
      <div
        style={{
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.35)',
          borderRadius: 12,
          padding: 10,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {claimedMeta?.image ? (
          <img
            src={claimedMeta.image}
            alt={claimedMeta.name}
            width={48}
            height={48}
            style={{
              width: 48,
              height: 48,
              objectFit: 'contain',
              borderRadius: 8,
              flexShrink: 0,
            }}
          />
        ) : null}
        <div style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold' }}>
          ✓ Last week ({prevWeekId}) badge claimed
          {claimedMeta ? (
            <div style={{ color: claimedMeta.color, fontWeight: 'normal', marginTop: 2 }}>
              {claimedMeta.name}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (!canClaimPrev) {
    return null;
  }

  const meta = BADGE_TIERS[prevSnap.tier];
  return (
    <div
      style={{
        background: 'rgba(103,232,249,0.08)',
        border: '1px solid #67e8f9',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {meta?.image ? (
          <img
            src={meta.image}
            alt={meta.name}
            width={72}
            height={72}
            style={{
              width: 72,
              height: 72,
              objectFit: 'contain',
              borderRadius: 10,
              flexShrink: 0,
              background: '#000',
              border: `1px solid ${meta.color}`,
            }}
          />
        ) : (
          <div style={{ fontSize: 36 }}>{meta?.emoji || '🏅'}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 'bold' }}>
            Last week {prevWeekId} · #{prevSnap.rank}
          </div>
          <div style={{ color: meta.color, fontSize: 15, fontWeight: 'bold', marginTop: 4 }}>
            {meta.name}
          </div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
            Weekly season prize — claim into your backpack
          </div>
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={handleClaim}
        style={{
          marginTop: 10,
          width: '100%',
          padding: '10px',
          borderRadius: 10,
          border: 'none',
          fontWeight: 'bold',
          fontSize: 13,
          cursor: busy ? 'wait' : 'pointer',
          background: 'linear-gradient(90deg, #67e8f9, #ffd700)',
          color: '#000',
        }}
      >
        {busy ? '…' : `Claim ${meta.name}`}
      </button>
      {notice ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: notice.ok ? '#4ade80' : '#f87171',
          }}
        >
          {notice.msg}
        </div>
      ) : null}
    </div>
  );
}

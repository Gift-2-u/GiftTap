import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import {
  BADGE_TIERS,
  getUtcDayId,
  getPreviousUtcDayId,
  isUtcDayClosed,
  badgeTierForDailyRank,
  hasClaimedDailyBadgeDurable,
  getDailyBadgeAward,
  getBadgeCounts,
  getDailyBadgeFloor,
} from './weeklyBadges';
import { hasSecureSession, ensureSecureSession, secureBadgeClaimDaily } from './secureApi';

/**
 * Claim yesterday's daily badge (same % cuts as weekly).
 * Full rules: Menu → Game Guide → Leaderboards.
 */
export default function DailyBadgePanel({
  playerId,
  inventory,
  onInventoryChange,
}) {
  const liveDayId = getUtcDayId();
  const prevDayId = getPreviousUtcDayId();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [prevSnap, setPrevSnap] = useState(null);
  const [snapLoading, setSnapLoading] = useState(true);

  const claimedPrev = useMemo(
    () => hasClaimedDailyBadgeDurable(inventory, prevDayId),
    [inventory, prevDayId],
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
        // Trigger finalize if cron missed (RPC is cheap when already done)
        try {
          await supabase.rpc('ensure_daily_leaderboard_rollover');
        } catch {
          /* ignore */
        }
        const { data, error } = await supabase
          .from('daily_leaderboard_snapshots')
          .select('rank, score, badge_tier, username, telegram_id')
          .eq('day_id', prevDayId)
          .eq('telegram_id', String(playerId))
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn('daily snapshot', error.message);
          setPrevSnap(null);
        } else if (data) {
          setPrevSnap({
            rank: data.rank,
            score: data.score,
            tier:
              data.badge_tier ||
              badgeTierForDailyRank(data.rank, null),
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
  }, [playerId, prevDayId]);

  const invBadgeCount = useMemo(() => {
    const c = getBadgeCounts(inventory || {});
    return Object.values(c).reduce((a, b) => a + b, 0);
  }, [inventory]);

  const canClaimPrev =
    prevSnap &&
    prevSnap.tier &&
    isUtcDayClosed(prevDayId) &&
    (!claimedPrev || invBadgeCount < 1);

  const handleClaim = async () => {
    if (!playerId || busy || !canClaimPrev) return;
    setBusy(true);
    setNotice(null);
    try {
      await ensureSecureSession();
      if (!hasSecureSession()) {
        throw new Error('Log in again to claim daily badges (secure session required).');
      }
      const data = await secureBadgeClaimDaily(prevDayId);
      const inv = data.inventory || inventory || {};
      if (typeof onInventoryChange === 'function') onInventoryChange(inv);
      const meta = BADGE_TIERS[data.tier] || BADGE_TIERS[prevSnap?.tier];
      setNotice({
        ok: true,
        msg: data.already
          ? (data.repaired
              ? `${meta?.emoji || '🏅'} ${meta?.name || data.tier} restored to backpack.`
              : `Already claimed for ${prevDayId}.`)
          : `${meta?.emoji || '🏅'} ${meta?.name || data.tier} claimed for ${prevDayId}`,
      });
    } catch (e) {
      console.error('daily badge', e);
      setNotice({ ok: false, msg: e?.message || 'Could not claim badge' });
    } finally {
      setBusy(false);
    }
  };

  if (snapLoading) {
    return (
      <div style={{ color: '#666', fontSize: 11, padding: '8px 0' }}>
        Checking yesterday…
      </div>
    );
  }

  if (claimedPrev) {
    const claimedTier =
      getDailyBadgeAward(inventory, prevDayId)?.tier || prevSnap?.tier || null;
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
          Daily badge claimed ({prevDayId})
          {claimedMeta ? ` · ${claimedMeta.name}` : ''}
        </div>
      </div>
    );
  }

  if (!canClaimPrev) {
    if (!prevSnap) {
      return (
        <div style={{ color: '#666', fontSize: 11, padding: '4px 0 10px', lineHeight: 1.4 }}>
          Daily badges: score ≥ {getDailyBadgeFloor().toLocaleString()} yesterday to qualify.
          Same cuts as weekly (5%◆ · 10%● · 15%● · rest). Live day: {liveDayId}.
        </div>
      );
    }
    return null;
  }

  const meta = BADGE_TIERS[prevSnap.tier];
  return (
    <div
      style={{
        background: 'rgba(251,239,67,0.08)',
        border: '1px solid rgba(251,239,67,0.4)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {meta?.image ? (
          <img
            src={meta.image}
            alt={meta.name}
            width={48}
            height={48}
            style={{ width: 48, height: 48, objectFit: 'contain' }}
          />
        ) : null}
        <div>
          <div style={{ color: '#fbef43', fontWeight: 'bold', fontSize: 13 }}>
            Daily badge ready · {prevDayId}
          </div>
          <div style={{ color: '#aaa', fontSize: 11 }}>
            #{prevSnap.rank} · {meta?.name || prevSnap.tier} · score{' '}
            {Number(prevSnap.score || 0).toLocaleString()}
          </div>
        </div>
      </div>
      {notice ? (
        <p
          style={{
            color: notice.ok ? '#4ade80' : '#f87171',
            fontSize: 12,
            margin: '0 0 8px',
          }}
        >
          {notice.msg}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={handleClaim}
        style={{
          width: '100%',
          background: busy ? '#555' : '#fbef43',
          color: '#000',
          border: 'none',
          borderRadius: 10,
          padding: '12px',
          fontWeight: 'bold',
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Claiming…' : 'Claim daily badge'}
      </button>
    </div>
  );
}

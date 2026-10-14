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

const box = (bg, border) => ({
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 12,
  padding: 12,
  marginBottom: 10,
});

/**
 * Claim yesterday's daily badge (same % cuts as weekly).
 * Always shows a status row above Weekly — never blank.
 * Full rules: Menu → Game Guide → Leaderboards.
 */
export default function DailyBadgePanel({
  playerId,
  inventory,
  onInventoryChange,
}) {
  const liveDayId = getUtcDayId();
  const prevDayId = getPreviousUtcDayId();
  const floor = getDailyBadgeFloor();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [prevSnap, setPrevSnap] = useState(null);
  const [snapLoading, setSnapLoading] = useState(true);
  const [snapError, setSnapError] = useState(null);
  const [boardMeta, setBoardMeta] = useState(null);

  const claimedPrev = useMemo(
    () => hasClaimedDailyBadgeDurable(inventory, prevDayId),
    [inventory, prevDayId],
  );

  useEffect(() => {
    if (!playerId) {
      setSnapLoading(false);
      setSnapError(null);
      setPrevSnap(null);
      setBoardMeta(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setSnapLoading(true);
      setSnapError(null);
      try {
        // Trigger finalize if cron missed (RPC is cheap when already done)
        try {
          await supabase.rpc('ensure_daily_leaderboard_rollover');
        } catch (e) {
          if (!cancelled) {
            setSnapError(
              e?.message ||
                'Daily board RPC missing — run migration 20261013_daily_leaderboard_badges.sql',
            );
          }
        }
        const metaRes = await supabase
          .from('daily_board_meta')
          .select('day_id, snap_rows, finalized_at, notes')
          .eq('day_id', prevDayId)
          .maybeSingle();
        if (!cancelled) {
          if (metaRes.error) {
            setBoardMeta(null);
            setSnapError(
              metaRes.error.message ||
                'daily_board_meta missing — run the daily leaderboard SQL migration',
            );
          } else {
            setBoardMeta(metaRes.data || null);
          }
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
          setSnapError(
            error.message ||
              'daily_leaderboard_snapshots missing — run the daily leaderboard SQL migration',
          );
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
      } catch (e) {
        if (!cancelled) {
          setPrevSnap(null);
          setSnapError(e?.message || 'Could not load daily badge');
        }
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
    !!prevSnap &&
    !!prevSnap.tier &&
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
      <div style={box('rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)')}>
        <div style={{ color: '#fbef43', fontWeight: 'bold', fontSize: 13 }}>
          Daily badge
        </div>
        <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
          Checking yesterday ({prevDayId})…
        </div>
      </div>
    );
  }

  if (claimedPrev) {
    const claimedTier =
      getDailyBadgeAward(inventory, prevDayId)?.tier || prevSnap?.tier || null;
    const claimedMeta = claimedTier ? BADGE_TIERS[claimedTier] : null;
    return (
      <div style={box('rgba(74,222,128,0.08)', 'rgba(74,222,128,0.35)')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          <div>
            <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 'bold' }}>
              Daily badge claimed · {prevDayId}
            </div>
            <div style={{ color: '#8f8', fontSize: 11, marginTop: 2 }}>
              {claimedMeta ? claimedMeta.name : 'In backpack'}
              {prevSnap?.rank != null ? ` · #${prevSnap.rank}` : ''}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (canClaimPrev) {
    const meta = BADGE_TIERS[prevSnap.tier];
    return (
      <div style={box('rgba(251,239,67,0.08)', 'rgba(251,239,67,0.4)')}>
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

  // Always show why there is no claim button (never blank above Weekly)
  let detail = `Score ≥ ${Number(floor).toLocaleString()} yesterday to qualify. Same cuts as weekly (5%◆ · 10%● · 15%● · rest).`;
  if (snapError) {
    detail = `Setup needed: ${snapError}`;
  } else if (!boardMeta?.finalized_at) {
    detail = `Yesterday (${prevDayId}) is not finalized yet. Cron runs 00:05 UTC, or run ensure_daily_leaderboard_rollover in SQL.`;
  } else if (!prevSnap) {
    detail = `No prize for ${prevDayId} — need daily score ≥ ${Number(floor).toLocaleString()} (mining shards, not raw taps). Board had ${boardMeta?.snap_rows ?? 0} eligible player(s).`;
  } else if (!prevSnap.tier) {
    detail = `On the board for ${prevDayId} (#${prevSnap.rank}) but no badge tier assigned — re-run snapshot.`;
  }

  return (
    <div style={box('rgba(255,255,255,0.04)', 'rgba(255,255,255,0.14)')}>
      <div style={{ color: '#fbef43', fontWeight: 'bold', fontSize: 13 }}>
        Daily badge · {prevDayId}
      </div>
      <div style={{ color: '#aaa', fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
        {detail}
      </div>
      <div style={{ color: '#666', fontSize: 10, marginTop: 6 }}>
        Live day {liveDayId} · claim opens after UTC midnight
      </div>
      {notice ? (
        <p
          style={{
            color: notice.ok ? '#4ade80' : '#f87171',
            fontSize: 12,
            margin: '8px 0 0',
          }}
        >
          {notice.msg}
        </p>
      ) : null}
    </div>
  );
}

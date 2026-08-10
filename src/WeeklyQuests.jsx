import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';
import AppNotice from './AppNotice';
import {
  WEEKLY_QUEST_LIST,
  WEEKLY_ENERGY_REWARD,
  WEEKLY_PRIZE,
  getUtcWeekId,
  getUtcWeekRangeLabel,
  ensureWeeklyState,
  questProgress,
  isQuestClaimed,
  markQuestClaimed,
  weeklyPrizeProgress,
} from './weeklyQuestLogic';

/**
 * UTC week quest board — energy claims + end-of-week free boost prize.
 */
export default function WeeklyQuests({
  player,
  weeklyState,
  onWeeklyStateChange,
  grantEnergyPool,
  friends1kCount = 0,
}) {
  const userId = player?.id ? String(player.id) : null;
  const weekId = getUtcWeekId();
  const [claimingId, setClaimingId] = useState(null);
  const [appNotice, setAppNotice] = useState({ show: false, message: '', success: true });
  const [localFriends1k, setLocalFriends1k] = useState(friends1kCount);

  const state = useMemo(
    () => ensureWeeklyState(weeklyState, weekId),
    [weeklyState, weekId],
  );

  const prizeProg = useMemo(() => weeklyPrizeProgress(state), [state]);

  useEffect(() => {
    setLocalFriends1k(friends1kCount);
  }, [friends1kCount]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('referred_by', userId)
        .gte('lifetime_taps', 1000);
      if (!cancelled && !error && count != null) setLocalFriends1k(count);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleClaim = async (quest) => {
    if (!userId || claimingId) return;
    if (isQuestClaimed(state, quest.id)) return;
    const prog = questProgress(quest, state, { friends1k: localFriends1k });
    if (!prog.ready) return;

    setClaimingId(quest.id);
    try {
      const nextState = markQuestClaimed(state, weekId, quest.id);
      // Persist claim first
      const { data: row } = await supabase
        .from('players')
        .select('inventory')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();
      const inv = { ...(row?.inventory || {}) };
      inv.weekly_quests = nextState;
      const { error } = await supabase
        .from('players')
        .update({
          inventory: inv,
          last_updated: new Date().toISOString(),
        })
        .eq(DB_PLAYER_ID, userId);
      if (error) throw error;

      if (typeof onWeeklyStateChange === 'function') {
        onWeeklyStateChange(nextState, inv);
      }
      if (typeof grantEnergyPool === 'function') {
        await grantEnergyPool(WEEKLY_ENERGY_REWARD);
      }

      setAppNotice({
        show: true,
        message: `⚡ +${WEEKLY_ENERGY_REWARD} Energy claimed! (${weeklyPrizeProgress(nextState).current}/${WEEKLY_PRIZE.needClaims} for weekly prize)`,
        success: true,
      });
    } catch (e) {
      console.error('weekly claim', e);
      setAppNotice({
        show: true,
        message: e?.message || 'Could not claim. Try again.',
        success: false,
      });
    } finally {
      setClaimingId(null);
    }
  };

  const handlePrizeClaim = async () => {
    if (!userId || claimingId) return;
    const pp = weeklyPrizeProgress(state);
    if (!pp.ready) return;

    setClaimingId(WEEKLY_PRIZE.id);
    try {
      const nextState = markQuestClaimed(state, weekId, WEEKLY_PRIZE.id);
      const { data: row } = await supabase
        .from('players')
        .select('inventory')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();
      const inv = { ...(row?.inventory || {}) };
      inv.weekly_quests = nextState;
      // Free Instant Refill → backpack
      const itemId = WEEKLY_PRIZE.rewardItemId;
      inv[itemId] = (Number(inv[itemId]) || 0) + 1;

      const { error } = await supabase
        .from('players')
        .update({
          inventory: inv,
          last_updated: new Date().toISOString(),
        })
        .eq(DB_PLAYER_ID, userId);
      if (error) throw error;

      if (typeof onWeeklyStateChange === 'function') {
        onWeeklyStateChange(nextState, inv);
      }

      setAppNotice({
        show: true,
        message: `🎁 Weekly prize claimed! +1 ${WEEKLY_PRIZE.rewardLabel} in Pack (Backpack). Activate it from the Shop.`,
        success: true,
      });
    } catch (e) {
      console.error('weekly prize', e);
      setAppNotice({
        show: true,
        message: e?.message || 'Could not claim weekly prize.',
        success: false,
      });
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <AppNotice
        show={appNotice.show}
        message={appNotice.message}
        success={appNotice.success}
        onClose={() => setAppNotice((n) => ({ ...n, show: false }))}
      />

      {/* Top: Weekly quests title + weekly prize (hype first) */}
      <div
        style={{
          background: prizeProg.claimed
            ? 'linear-gradient(145deg, rgba(74,222,128,0.1), #0f172a)'
            : 'linear-gradient(145deg, rgba(255,215,0,0.14), #0f172a 55%)',
          border: `2px solid ${prizeProg.claimed ? 'rgba(74,222,128,0.45)' : '#ffd700'}`,
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 140px' }}>
            <div style={{ color: '#8eb4ff', fontWeight: 'bold', fontSize: 15 }}>Weekly quests</div>
            <div style={{ color: '#666', fontSize: 10, marginTop: 4, lineHeight: 1.35 }}>
              {getUtcWeekRangeLabel()}
            </div>
            <div style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
              Each quest +{WEEKLY_ENERGY_REWARD} energy · 10 quests total
            </div>
          </div>

          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{WEEKLY_PRIZE.icon}</span>
              <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 13, lineHeight: 1.25 }}>
                Weekly prize
                <div style={{ color: '#4ade80', fontSize: 12, marginTop: 2 }}>
                  Free {WEEKLY_PRIZE.rewardLabel}
                </div>
              </div>
            </div>
            <div style={{ color: '#ccc', fontSize: 10, lineHeight: 1.35 }}>
              Need <strong style={{ color: '#ffd700' }}>{WEEKLY_PRIZE.needClaims} of 10</strong> quests
              claimed this week
            </div>
            <div style={{ color: '#888', fontSize: 10, fontWeight: 'bold', marginTop: 4 }}>
              {Math.min(prizeProg.current, prizeProg.need)} / {prizeProg.need}
            </div>
            <div
              style={{
                marginTop: 6,
                width: '100%',
                height: 8,
                borderRadius: 999,
                background: '#0a0a0a',
                border: '1px solid #333',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.floor((prizeProg.current / prizeProg.need) * 100))}%`,
                  background: 'linear-gradient(90deg, #ca8a04, #fbef43)',
                  borderRadius: 999,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          <div style={{ flexShrink: 0, alignSelf: 'center' }}>
            {prizeProg.claimed ? (
              <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold' }}>✓ CLAIMED</span>
            ) : prizeProg.ready ? (
              <button
                type="button"
                disabled={!!claimingId}
                onClick={handlePrizeClaim}
                style={{
                  background: '#fbef43',
                  color: '#000',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: claimingId ? 'wait' : 'pointer',
                }}
              >
                {claimingId === WEEKLY_PRIZE.id ? '…' : 'Claim prize'}
              </button>
            ) : (
              <button
                type="button"
                disabled
                style={{
                  background: '#333',
                  color: '#888',
                  border: '1px solid #444',
                  padding: '10px 12px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 'bold',
                }}
              >
                {prizeProg.current}/{prizeProg.need}
              </button>
            )}
          </div>
        </div>
        <div style={{ color: '#666', fontSize: 10, marginTop: 10, lineHeight: 1.35 }}>
          Prize goes to Pack (Backpack) — activate Instant Refill from the Shop when ready.
        </div>
      </div>

      {WEEKLY_QUEST_LIST.map((quest) => {
        const claimed = isQuestClaimed(state, quest.id);
        const prog = questProgress(quest, state, { friends1k: localFriends1k });
        const ready = !claimed && prog.ready;

        return (
          <div
            key={quest.id}
            style={{
              background: '#111',
              border: `1px solid ${claimed ? 'rgba(74,222,128,0.35)' : '#555'}`,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              opacity: claimed ? 0.65 : 1,
            }}
          >
            <div style={{ display: 'flex', gap: 12, minWidth: 0, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>{quest.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{quest.title}</div>
                <div style={{ color: '#ffd700', fontSize: 11, marginTop: 3 }}>
                  +{WEEKLY_ENERGY_REWARD} Energy
                </div>
                <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>{quest.description}</div>
                <div style={{ color: '#888', fontSize: 10, marginTop: 4, fontWeight: 'bold' }}>
                  {Math.min(prog.current, prog.need)} / {prog.need}
                </div>
              </div>
            </div>

            {claimed ? (
              <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold', flexShrink: 0 }}>
                ✓ DONE
              </span>
            ) : ready ? (
              <button
                type="button"
                disabled={!!claimingId}
                onClick={() => handleClaim(quest)}
                style={{
                  background: '#fbef43',
                  color: '#000',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: claimingId ? 'wait' : 'pointer',
                  flexShrink: 0,
                }}
              >
                {claimingId === quest.id ? '…' : 'Claim'}
              </button>
            ) : (
              <button
                type="button"
                disabled
                style={{
                  background: '#333',
                  color: '#888',
                  border: '1px solid #444',
                  padding: '8px 12px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 'bold',
                  flexShrink: 0,
                }}
              >
                {Math.min(prog.current, prog.need)}/{prog.need}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

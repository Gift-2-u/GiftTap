import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';
import AppNotice from './AppNotice';
import {
  WEEKLY_QUEST_LIST,
  WEEKLY_ENERGY_REWARD,
  getUtcWeekId,
  getUtcWeekRangeLabel,
  ensureWeeklyState,
  questProgress,
  isQuestClaimed,
  markQuestClaimed,
} from './weeklyQuestLogic';

/**
 * UTC week quest board — all claims +100 energy pool.
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
        message: `⚡ +${WEEKLY_ENERGY_REWARD} Energy claimed!`,
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

  return (
    <div style={{ marginBottom: 20 }}>
      <AppNotice
        show={appNotice.show}
        message={appNotice.message}
        success={appNotice.success}
        onClose={() => setAppNotice((n) => ({ ...n, show: false }))}
      />

      <div
        style={{
          background: 'linear-gradient(145deg, #0f172a 0%, #111 100%)',
          border: '1px solid rgba(50, 100, 255, 0.4)',
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div style={{ color: '#8eb4ff', fontWeight: 'bold', fontSize: 15 }}>Weekly quests</div>
        <div style={{ color: '#666', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
          {getUtcWeekRangeLabel()} · each claim +{WEEKLY_ENERGY_REWARD} energy (pool, max 500)
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

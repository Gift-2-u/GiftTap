import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';
import {
  hasSecureSession,
  secureClaimWeeklyQuest,
  secureClaimWeeklyPrize,
} from './secureApi';
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
  mergeWeeklyStates,
  weeklyPrizeProgress,
  applyWeeklyDailyProgress,
  utcDayStr,
  WEEKLY_BASE_DAILY_LIMIT,
  inventoryHasWeeklyClaim,
  applyWeeklyClaimToInventory,
  applyTaskLimitBoostToInventory,
  markWeeklyRewardOnInventory,
  mergeInventoryWeekly,
  hydrateWeeklyClaimsFromLedger,
  claimedIdsFromInventory,
  sanitizeWeeklyClaimedList,
} from './weeklyQuestLogic';

/**
 * Weekly quests — SIMPLE RULE:
 *   Do quest → Claim once → forever DONE that UTC week (unclaimable).
 * Server RPC claim_weekly_quest is the source of truth (row lock + ledgers).
 */
export default function WeeklyQuests({
  player,
  playerId: playerIdProp,
  weeklyState,
  onWeeklyStateChange,
  grantTaskEnergy,
  friends1kCount = 0,
  dailyTaps = 0,
  maxDailyLimit = 1000,
  inventory = null,
}) {
  const userId = playerIdProp
    ? String(playerIdProp)
    : player?.id
      ? String(player.id)
      : player?.telegram_id
        ? String(player.telegram_id)
        : null;
  const weekId = getUtcWeekId();
  const [claimingId, setClaimingId] = useState(null);
  const claimLockRef = useRef(false);
  const permanentClaimedRef = useRef(new Set());
  const [claimedTick, setClaimedTick] = useState(0);
  const [appNotice, setAppNotice] = useState({ show: false, message: '', success: true });
  const [localFriends1k, setLocalFriends1k] = useState(friends1kCount);

  const storageKey =
    userId && weekId ? `gift2u_wq_claimed_v2_${userId}_${weekId}` : null;

  const readStoredClaims = useCallback(() => {
    if (!storageKey) return [];
    try {
      const raw =
        localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
      if (!raw) return [];
      const ids = JSON.parse(raw);
      return Array.isArray(ids) ? ids.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const persistPermanent = useCallback(
    (setObj) => {
      permanentClaimedRef.current = setObj;
      if (!storageKey) return;
      try {
        const json = JSON.stringify([...setObj]);
        localStorage.setItem(storageKey, json);
        sessionStorage.setItem(storageKey, json);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const markClaimedLocal = useCallback(
    (questId) => {
      if (!questId) return;
      const next = new Set(permanentClaimedRef.current);
      next.add(questId);
      persistPermanent(next);
      setClaimedTick((t) => t + 1);
    },
    [persistPermanent],
  );

  // Restore durable claims + absorb parent/inventory ledgers
  useEffect(() => {
    if (!storageKey) return;
    const next = new Set(permanentClaimedRef.current);
    let added = false;
    for (const id of readStoredClaims()) {
      if (!next.has(id)) {
        next.add(id);
        added = true;
      }
    }
    const parent = ensureWeeklyState(weeklyState, weekId);
    for (const id of parent.claimed || []) {
      if (id && !next.has(id)) {
        next.add(id);
        added = true;
      }
    }
    if (inventory) {
      for (const id of claimedIdsFromInventory(inventory, weekId)) {
        if (id && !next.has(id)) {
          next.add(id);
          added = true;
        }
      }
    }
    if (added) {
      persistPermanent(next);
      setClaimedTick((t) => t + 1);
    }
  }, [storageKey, weekId, weeklyState, inventory, readStoredClaims, persistPermanent]);

  const state = useMemo(() => {
    let base = ensureWeeklyState(weeklyState, weekId);
    const taps = Math.max(0, Number(dailyTaps) || 0);
    if (taps > 0) {
      base = applyWeeklyDailyProgress(base, weekId, {
        day: utcDayStr(),
        dayTaps: taps,
        maxLimit: WEEKLY_BASE_DAILY_LIMIT,
      });
    }
    const extra = new Set([
      ...Array.from(permanentClaimedRef.current),
      ...readStoredClaims(),
    ]);
    if (inventory) {
      for (const id of claimedIdsFromInventory(inventory, weekId)) extra.add(id);
    }
    const mergedClaimed = sanitizeWeeklyClaimedList([
      ...(base.claimed || []),
      ...extra,
    ]);
    if (!extra.size && mergedClaimed.length === (base.claimed || []).length) {
      return { ...base, claimed: mergedClaimed };
    }
    return {
      ...base,
      claimed: mergedClaimed,
    };
  }, [weeklyState, weekId, dailyTaps, inventory, claimedTick, readStoredClaims]);

  const isDone = useCallback(
    (questId) => {
      if (!questId) return false;
      if (permanentClaimedRef.current.has(questId)) return true;
      if (readStoredClaims().includes(questId)) return true;
      if (isQuestClaimed(state, questId)) return true;
      if (inventory && inventoryHasWeeklyClaim(inventory, weekId, questId)) return true;
      return false;
    },
    [state, inventory, weekId, readStoredClaims],
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

  // Persist LIVE daily progress only — NEVER drop claimed
  const catchUpKeyRef = useRef('');
  useEffect(() => {
    const taps = Math.max(0, Number(dailyTaps) || 0);
    if (taps <= 0) return;

    const day = utcDayStr();
    const weekIdNow = getUtcWeekId();
    const saved = ensureWeeklyState(weeklyState, weekIdNow);
    let nextW = applyWeeklyDailyProgress(saved, weekIdNow, {
      day,
      dayTaps: taps,
      maxLimit: WEEKLY_BASE_DAILY_LIMIT,
    });
    const forceClaimed = [
      ...(nextW.claimed || []),
      ...Array.from(permanentClaimedRef.current),
      ...readStoredClaims(),
    ];
    nextW = {
      ...nextW,
      claimed: [...new Set(forceClaimed)],
    };

    const same =
      saved.daysTap500.join() === nextW.daysTap500.join() &&
      saved.daysFull.join() === nextW.daysFull.join() &&
      saved.daysActive.join() === nextW.daysActive.join() &&
      (saved.claimed || []).join() === (nextW.claimed || []).join();
    if (same) return;

    if (typeof onWeeklyStateChange === 'function') {
      onWeeklyStateChange(nextW);
    }

    const key = `${userId || 'x'}|${weekIdNow}|${day}|${taps}|${nextW.daysFull.join()}|${nextW.daysTap500.join()}|${(nextW.claimed || []).join()}`;
    if (catchUpKeyRef.current === key) return;
    catchUpKeyRef.current = key;
    if (!userId) return;

    (async () => {
      try {
        const { data: row, error: selErr } = await supabase
          .from('players')
          .select('inventory')
          .eq(DB_PLAYER_ID, userId)
          .maybeSingle();
        if (selErr) {
          console.warn('weekly catch-up select', selErr.message);
          return;
        }
        let inv = hydrateWeeklyClaimsFromLedger(
          { ...(row?.inventory || {}) },
          weekIdNow,
        );
        inv = mergeInventoryWeekly(inv, { weekly_quests: nextW }, weekIdNow);
        for (const id of permanentClaimedRef.current) {
          inv = applyWeeklyClaimToInventory(inv, weekIdNow, id);
        }
        inv = hydrateWeeklyClaimsFromLedger(inv, weekIdNow);

        const { error } = await supabase
          .from('players')
          .update({ inventory: inv, last_updated: new Date().toISOString() })
          .eq(DB_PLAYER_ID, userId);
        if (error) {
          console.warn('weekly catch-up save', error.message);
          return;
        }
        if (typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(inv.weekly_quests, inv);
        }
      } catch (e) {
        console.warn('weekly progress catch-up', e?.message || e);
      }
    })();
  }, [userId, dailyTaps, weeklyState, onWeeklyStateChange, readStoredClaims]);

  const handleClaim = async (quest) => {
    if (!userId || !quest?.id || claimingId || claimLockRef.current) return;
    if (isDone(quest.id)) return;

    const prog = questProgress(quest, state, { friends1k: localFriends1k });
    if (!prog.ready) return;

    claimLockRef.current = true;
    setClaimingId(quest.id);
    markClaimedLocal(quest.id);

    try {
      // Hard security: Edge wrapper (JWT) → SQL RPC with service_role
      if (hasSecureSession()) {
        const data = await secureClaimWeeklyQuest(quest.id, WEEKLY_ENERGY_REWARD);
        const inv = data.inventory || null;
        markClaimedLocal(quest.id);
        if (inv && typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(
            inv.weekly_quests || markQuestClaimed(ensureWeeklyState(state, weekId), weekId, quest.id),
            inv,
          );
        } else if (typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(
            markQuestClaimed(ensureWeeklyState(state, weekId), weekId, quest.id),
          );
        }
        setAppNotice({
          show: true,
          message: data.already
            ? 'Already claimed this week ✓'
            : `⚡ +${WEEKLY_ENERGY_REWARD} max Daily Limit. DONE — cannot claim again this week.`,
          success: true,
        });
        return;
      }

      const { data, error } = await supabase.rpc('claim_weekly_quest', {
        p_telegram_id: String(userId),
        p_quest_id: quest.id,
        p_reward_amount: WEEKLY_ENERGY_REWARD,
      });

      if (error) {
        // Fallback if RPC unavailable: still once-only via ledgers
        console.warn('claim_weekly_quest rpc', error.message);
        const { data: row, error: selErr } = await supabase
          .from('players')
          .select('inventory')
          .eq(DB_PLAYER_ID, userId)
          .maybeSingle();
        if (selErr) throw selErr;
        let inv = hydrateWeeklyClaimsFromLedger(
          { ...(row?.inventory || {}) },
          weekId,
        );
        if (inventoryHasWeeklyClaim(inv, weekId, quest.id)) {
          inv = applyWeeklyClaimToInventory(inv, weekId, quest.id);
          if (typeof onWeeklyStateChange === 'function') {
            onWeeklyStateChange(inv.weekly_quests, inv);
          }
          setAppNotice({
            show: true,
            message: 'Already claimed this week ✓',
            success: true,
          });
          return;
        }
        inv.weekly_quests = mergeWeeklyStates(
          inv.weekly_quests,
          {
            ...ensureWeeklyState(state, weekId),
            claimed: inv.weekly_quests?.claimed || [],
          },
          weekId,
        );
        inv = applyWeeklyClaimToInventory(inv, weekId, quest.id);
        inv.weekly_quests = markQuestClaimed(inv.weekly_quests, weekId, quest.id);
        inv = applyTaskLimitBoostToInventory(inv, WEEKLY_ENERGY_REWARD);
        inv = markWeeklyRewardOnInventory(inv, weekId, quest.id);
        const { error: upErr } = await supabase
          .from('players')
          .update({ inventory: inv, last_updated: new Date().toISOString() })
          .eq(DB_PLAYER_ID, userId);
        if (upErr) throw upErr;
        if (typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(inv.weekly_quests, inv);
        }
        setAppNotice({
          show: true,
          message: `⚡ +${WEEKLY_ENERGY_REWARD} max Daily Limit. Claimed — cannot claim again this week.`,
          success: true,
        });
        return;
      }

      const result = data && typeof data === 'object' ? data : {};
      const inv = result.inventory || null;
      markClaimedLocal(quest.id);

      if (inv && typeof onWeeklyStateChange === 'function') {
        const wq = markQuestClaimed(
          inv.weekly_quests || ensureWeeklyState(state, weekId),
          weekId,
          quest.id,
        );
        onWeeklyStateChange(wq, inv);
      } else if (typeof onWeeklyStateChange === 'function') {
        onWeeklyStateChange(
          markQuestClaimed(ensureWeeklyState(state, weekId), weekId, quest.id),
        );
      }

      if (result.already) {
        setAppNotice({
          show: true,
          message: 'Already claimed this week ✓',
          success: true,
        });
      } else {
        const boostAmt =
          inv?.task_limit_boost &&
          inv.task_limit_boost.expires &&
          new Date(inv.task_limit_boost.expires).getTime() > Date.now()
            ? Number(inv.task_limit_boost.amount) || 0
            : WEEKLY_ENERGY_REWARD;
        setAppNotice({
          show: true,
          message:
            `⚡ +${WEEKLY_ENERGY_REWARD} max Daily Limit (today UTC). ` +
            `Boost now +${boostAmt}. ` +
            `DONE — cannot claim again this week.`,
          success: true,
        });
      }
    } catch (e) {
      console.error('weekly claim', e);
      const msg = e?.message || String(e);
      if (/network|fetch|Failed to fetch|timeout/i.test(msg)) {
        const next = new Set(permanentClaimedRef.current);
        next.delete(quest.id);
        persistPermanent(next);
        setClaimedTick((t) => t + 1);
      }
      setAppNotice({
        show: true,
        message: e?.message || 'Could not claim. Try again.',
        success: false,
      });
    } finally {
      setClaimingId(null);
      claimLockRef.current = false;
    }
  };

  const handlePrizeClaim = async () => {
    if (!userId || claimingId || claimLockRef.current) return;
    if (isDone(WEEKLY_PRIZE.id)) return;
    const pp = weeklyPrizeProgress(state);
    if (!pp.ready) return;

    claimLockRef.current = true;
    setClaimingId(WEEKLY_PRIZE.id);
    markClaimedLocal(WEEKLY_PRIZE.id);

    try {
      if (hasSecureSession()) {
        const data = await secureClaimWeeklyPrize();
        markClaimedLocal(WEEKLY_PRIZE.id);
        if (data.inventory && typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(data.inventory.weekly_quests, data.inventory);
        }
        setAppNotice({
          show: true,
          message: data.already
            ? 'Weekly prize already claimed ✓'
            : `🎁 Weekly prize claimed! +1 ${WEEKLY_PRIZE.rewardLabel} in Pack.`,
          success: true,
        });
        return;
      }

      const { data, error } = await supabase.rpc('claim_weekly_prize', {
        p_telegram_id: String(userId),
      });
      if (error) throw error;
      const result = data && typeof data === 'object' ? data : {};
      markClaimedLocal(WEEKLY_PRIZE.id);
      if (result.inventory && typeof onWeeklyStateChange === 'function') {
        onWeeklyStateChange(result.inventory.weekly_quests, result.inventory);
      }
      setAppNotice({
        show: true,
        message: result.already
          ? 'Weekly prize already claimed ✓'
          : `🎁 Weekly prize claimed! +1 ${WEEKLY_PRIZE.rewardLabel} in Pack. Cannot claim again this week.`,
        success: true,
      });
    } catch (e) {
      console.error('weekly prize', e);
      const next = new Set(permanentClaimedRef.current);
      next.delete(WEEKLY_PRIZE.id);
      persistPermanent(next);
      setClaimedTick((t) => t + 1);
      setAppNotice({
        show: true,
        message: e?.message || 'Could not claim weekly prize.',
        success: false,
      });
    } finally {
      setClaimingId(null);
      claimLockRef.current = false;
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
            <div style={{ color: '#8eb4ff', fontWeight: 'bold', fontSize: 15 }}>
              Weekly quests
            </div>
            <div style={{ color: '#666', fontSize: 10, marginTop: 4, lineHeight: 1.35 }}>
              {getUtcWeekRangeLabel()}
            </div>
            <div style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
              Each quest +{WEEKLY_ENERGY_REWARD} max Daily Limit · claim once · then DONE
            </div>
            <div style={{ color: '#4ade80', fontSize: 11, marginTop: 6, fontWeight: 'bold' }}>
              Today (UTC): {Math.max(0, Number(dailyTaps) || 0).toLocaleString()} taps
              {Number(dailyTaps) >= 500 ? ' · 500✓' : ''}
              {Number(dailyTaps) >= WEEKLY_BASE_DAILY_LIMIT ? ' · base 1,000✓' : ''}
            </div>
          </div>

          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{WEEKLY_PRIZE.icon}</span>
              <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 13, lineHeight: 1.25 }}>
                Weekly prize
              </div>
            </div>
            <div style={{ color: '#aaa', fontSize: 10, marginBottom: 8 }}>
              Claim {WEEKLY_PRIZE.needClaims} quests → free {WEEKLY_PRIZE.rewardLabel}
            </div>
            {isDone(WEEKLY_PRIZE.id) || prizeProg.claimed ? (
              <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold' }}>
                ✓ Prize claimed this week
              </span>
            ) : prizeProg.ready ? (
              <button
                type="button"
                disabled={!!claimingId}
                onClick={handlePrizeClaim}
                style={{
                  background: 'linear-gradient(90deg, #ffd700, #fbef43)',
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
                {prizeProg.current}/{prizeProg.need} claimed this week
              </button>
            )}
          </div>
        </div>
        <div style={{ color: '#666', fontSize: 10, marginTop: 10, lineHeight: 1.35 }}>
          Prize goes to Pack (Backpack). Each quest is once-only after claim.
        </div>
      </div>

      {WEEKLY_QUEST_LIST.map((quest) => {
        const claimed = isDone(quest.id);
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
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                  {quest.title}
                </div>
                <div style={{ color: '#ffd700', fontSize: 11, marginTop: 3 }}>
                  +{WEEKLY_ENERGY_REWARD} max daily limit · claim once
                </div>
                <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
                  {quest.description}
                </div>
                <div style={{ color: '#888', fontSize: 10, marginTop: 4, fontWeight: 'bold' }}>
                  {Math.min(prog.current, prog.need)} / {prog.need}
                </div>
              </div>
            </div>

            {claimed ? (
              <span
                style={{
                  color: '#4ade80',
                  fontSize: 12,
                  fontWeight: 'bold',
                  flexShrink: 0,
                }}
              >
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

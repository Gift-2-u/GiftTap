import React, { useEffect, useMemo, useState, useRef } from 'react';
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
  mergeWeeklyStates,
  weeklyPrizeProgress,
  applyWeeklyDailyProgress,
  utcDayStr,
  isDailyLimitDrained,
  WEEKLY_BASE_DAILY_LIMIT,
  inventoryHasWeeklyClaim,
  applyWeeklyClaimToInventory,
  mergeInventoryWeekly,
  hydrateWeeklyClaimsFromLedger,
} from './weeklyQuestLogic';

/**
 * UTC week quest board — +daily limit claims + end-of-week free boost prize.
 *
 * CLAIM RULE: every quest is once-only after claim (see claimOnce.js + AGENTS.md).
 * Opt out only with an explicit product decision (period reset or onceOnly:false).
 */
export default function WeeklyQuests({
  player,
  playerId: playerIdProp,
  weeklyState,
  onWeeklyStateChange,
  grantTaskEnergy,
  friends1kCount = 0,
  /** Live daily taps + max limit so "drain daily" can catch up if already maxed */
  dailyTaps = 0,
  maxDailyLimit = 1000,
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
  /** Session + tab-remount claims — never re-grant even if a concurrent save wipes DB/UI */
  const permanentClaimedRef = useRef(new Set());
  const [appNotice, setAppNotice] = useState({ show: false, message: '', success: true });
  const [localFriends1k, setLocalFriends1k] = useState(friends1kCount);
  /** Optimistic claimed ids so the button flips to DONE even if parent state lags */
  const [optimisticClaimed, setOptimisticClaimed] = useState([]);
  /** Bump to re-render when permanentClaimedRef gains an id */
  const [claimedTick, setClaimedTick] = useState(0);

  const storageKey =
    userId && weekId ? `gift2u_wq_claimed_${userId}_${weekId}` : null;

  const persistPermanent = (setObj) => {
    permanentClaimedRef.current = setObj;
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...setObj]));
    } catch {
      /* ignore */
    }
  };

  // Restore permanent claims after tab switch remounts this component
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids) || !ids.length) return;
      const next = new Set(permanentClaimedRef.current);
      let added = false;
      for (const id of ids) {
        if (id && !next.has(id)) {
          next.add(id);
          added = true;
        }
      }
      if (added) {
        permanentClaimedRef.current = next;
        setClaimedTick((t) => t + 1);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  /**
   * Board state = saved weekly_quests + LIVE daily taps for today.
   * So 1061 taps today unlocks Claim even if inventory save lagged/failed.
   */
  const state = useMemo(() => {
    let base = ensureWeeklyState(weeklyState, weekId);
    // Repair claimed[] from durable ledger if parent inventory was passed via weeklyState only
    // (ledger lives on full inventory; permanent + optimistic still apply)
    const taps = Math.max(0, Number(dailyTaps) || 0);
    if (taps > 0) {
      base = applyWeeklyDailyProgress(base, weekId, {
        day: utcDayStr(),
        dayTaps: taps,
        maxLimit: WEEKLY_BASE_DAILY_LIMIT,
      });
    }
    const extra = [
      ...optimisticClaimed,
      ...Array.from(permanentClaimedRef.current),
    ];
    if (!extra.length) return base;
    return {
      ...base,
      claimed: [...new Set([...(base.claimed || []), ...extra])],
    };
  }, [weeklyState, weekId, dailyTaps, optimisticClaimed, claimedTick]);

  // Drop optimistic once parent has them; absorb parent claims into permanent set
  useEffect(() => {
    const parent = ensureWeeklyState(weeklyState, weekId);
    let added = false;
    const next = new Set(permanentClaimedRef.current);
    for (const id of parent.claimed || []) {
      if (id && !next.has(id)) {
        next.add(id);
        added = true;
      }
    }
    if (added) {
      persistPermanent(next);
      setClaimedTick((t) => t + 1);
    }
    setOptimisticClaimed((prev) =>
      prev.filter((id) => !parent.claimed.includes(id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistPermanent closes over storageKey
  }, [weeklyState, weekId, storageKey]);

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

  // Persist live daily progress into inventory (so claims survive refresh)
  const catchUpKeyRef = useRef('');
  useEffect(() => {
    const taps = Math.max(0, Number(dailyTaps) || 0);
    if (taps <= 0) return;

    const day = utcDayStr();
    const weekIdNow = getUtcWeekId();
    const baseLimit = WEEKLY_BASE_DAILY_LIMIT;
    const saved = ensureWeeklyState(weeklyState, weekIdNow);
    const nextW = applyWeeklyDailyProgress(saved, weekIdNow, {
      day,
      dayTaps: taps,
      maxLimit: baseLimit,
    });

    // Skip if nothing new vs saved (live UI already overlays taps)
    const same =
      saved.daysTap500.join() === nextW.daysTap500.join() &&
      saved.daysFull.join() === nextW.daysFull.join() &&
      saved.daysActive.join() === nextW.daysActive.join();
    if (same) return;

    // Instant parent update (do not wait for network)
    if (typeof onWeeklyStateChange === 'function') {
      onWeeklyStateChange(nextW);
    }

    // Debounce identical network writes
    const key = `${userId || 'x'}|${weekIdNow}|${day}|${taps}|${nextW.daysFull.join()}|${nextW.daysTap500.join()}`;
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
        }
        let inv = hydrateWeeklyClaimsFromLedger(
          { ...(row?.inventory || {}) },
          weekIdNow,
        );
        inv = mergeInventoryWeekly(inv, { weekly_quests: nextW }, weekIdNow);
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
  }, [userId, dailyTaps, weeklyState, onWeeklyStateChange]);

  /**
   * Claim any weekly energy quest ONCE this UTC week.
   * Dual-write weekly_quests.claimed + weekly_claim_keys ledger.
   * Never re-grants +100 if ledger/server already has the quest id.
   */
  const handleClaim = async (quest) => {
    if (!userId || !quest?.id || claimingId || claimLockRef.current) return;
    // Session lock — all 10 quests share this path
    if (
      permanentClaimedRef.current.has(quest.id) ||
      isQuestClaimed(state, quest.id)
    ) {
      return;
    }
    const prog = questProgress(quest, state, { friends1k: localFriends1k });
    if (!prog.ready) return;

    claimLockRef.current = true;
    setClaimingId(quest.id);
    // Instant DONE for every quest id (tap500, full, boost, friend, …)
    {
      const next = new Set(permanentClaimedRef.current);
      next.add(quest.id);
      persistPermanent(next);
    }
    setClaimedTick((t) => t + 1);
    setOptimisticClaimed((prev) =>
      prev.includes(quest.id) ? prev : [...prev, quest.id],
    );

    let claimWriteOk = false;
    try {
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

      // Already claimed on server/ledger → no second reward
      const alreadyOnServer = inventoryHasWeeklyClaim(inv, weekId, quest.id);

      // Dual-write claim (array + durable keys)
      inv = applyWeeklyClaimToInventory(inv, weekId, quest.id);
      // Keep live progress fields from local board state
      inv.weekly_quests = mergeWeeklyStates(inv.weekly_quests, state, weekId);
      inv.weekly_quests = markQuestClaimed(inv.weekly_quests, weekId, quest.id);

      const { error } = await supabase
        .from('players')
        .update({
          inventory: inv,
          last_updated: new Date().toISOString(),
        })
        .eq(DB_PLAYER_ID, userId);
      if (error) throw error;
      claimWriteOk = true;

      if (typeof onWeeklyStateChange === 'function') {
        onWeeklyStateChange(inv.weekly_quests, inv);
      }

      // Grant +100 daily limit only the first time this quest is claimed
      if (!alreadyOnServer && typeof grantTaskEnergy === 'function') {
        await grantTaskEnergy({
          amount: WEEKLY_ENERGY_REWARD,
          dayLimited: true,
          preserveWeeklyQuests: inv.weekly_quests,
          preserveClaimKeys: inv.weekly_claim_keys,
        });
        // Re-assert claim ledger after boost write (anti wipe)
        try {
          const { data: row2 } = await supabase
            .from('players')
            .select('inventory')
            .eq(DB_PLAYER_ID, userId)
            .maybeSingle();
          let inv2 = mergeInventoryWeekly(
            row2?.inventory || {},
            inv,
            weekId,
          );
          inv2 = applyWeeklyClaimToInventory(inv2, weekId, quest.id);
          inv2 = hydrateWeeklyClaimsFromLedger(inv2, weekId);
          await supabase
            .from('players')
            .update({
              inventory: inv2,
              last_updated: new Date().toISOString(),
            })
            .eq(DB_PLAYER_ID, userId);
          if (typeof onWeeklyStateChange === 'function') {
            onWeeklyStateChange(inv2.weekly_quests, inv2);
          }
        } catch (reassertErr) {
          console.warn('weekly claim reassert', reassertErr?.message || reassertErr);
        }
      }

      setAppNotice({
        show: true,
        message: alreadyOnServer
          ? 'Already claimed this week ✓'
          : `⚡ +${WEEKLY_ENERGY_REWARD} Daily limit claimed (today UTC)! (${weeklyPrizeProgress(inv.weekly_quests).current}/${WEEKLY_PRIZE.needClaims} for weekly prize)`,
        success: true,
      });
    } catch (e) {
      console.error('weekly claim', e);
      // Only unlock if claim never landed on server — prevents double +100
      if (!claimWriteOk) {
        const next = new Set(permanentClaimedRef.current);
        next.delete(quest.id);
        persistPermanent(next);
        setOptimisticClaimed((prev) => prev.filter((id) => id !== quest.id));
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

  /** Weekly prize — free Instant Refill, once per UTC week */
  const handlePrizeClaim = async () => {
    if (!userId || claimingId || claimLockRef.current) return;
    if (
      permanentClaimedRef.current.has(WEEKLY_PRIZE.id) ||
      isQuestClaimed(state, WEEKLY_PRIZE.id)
    ) {
      return;
    }
    const pp = weeklyPrizeProgress(state);
    if (!pp.ready) return;

    claimLockRef.current = true;
    setClaimingId(WEEKLY_PRIZE.id);
    {
      const next = new Set(permanentClaimedRef.current);
      next.add(WEEKLY_PRIZE.id);
      persistPermanent(next);
    }
    setClaimedTick((t) => t + 1);
    setOptimisticClaimed((prev) =>
      prev.includes(WEEKLY_PRIZE.id) ? prev : [...prev, WEEKLY_PRIZE.id],
    );

    let claimWriteOk = false;
    try {
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
      const alreadyOnServer = inventoryHasWeeklyClaim(
        inv,
        weekId,
        WEEKLY_PRIZE.id,
      );

      inv = applyWeeklyClaimToInventory(inv, weekId, WEEKLY_PRIZE.id);
      inv.weekly_quests = mergeWeeklyStates(inv.weekly_quests, state, weekId);
      inv.weekly_quests = markQuestClaimed(
        inv.weekly_quests,
        weekId,
        WEEKLY_PRIZE.id,
      );

      // Free Instant Refill → backpack (only once)
      if (!alreadyOnServer) {
        const itemId = WEEKLY_PRIZE.rewardItemId;
        inv[itemId] = (Number(inv[itemId]) || 0) + 1;
      }

      const { error } = await supabase
        .from('players')
        .update({
          inventory: inv,
          last_updated: new Date().toISOString(),
        })
        .eq(DB_PLAYER_ID, userId);
      if (error) throw error;
      claimWriteOk = true;

      if (typeof onWeeklyStateChange === 'function') {
        onWeeklyStateChange(inv.weekly_quests, inv);
      }

      setAppNotice({
        show: true,
        message: alreadyOnServer
          ? 'Weekly prize already claimed ✓'
          : `🎁 Weekly prize claimed! +1 ${WEEKLY_PRIZE.rewardLabel} in Pack (Backpack). Activate it from the Shop.`,
        success: true,
      });
    } catch (e) {
      console.error('weekly prize', e);
      if (!claimWriteOk) {
        const next = new Set(permanentClaimedRef.current);
        next.delete(WEEKLY_PRIZE.id);
        persistPermanent(next);
        setOptimisticClaimed((prev) =>
          prev.filter((id) => id !== WEEKLY_PRIZE.id),
        );
        setClaimedTick((t) => t + 1);
      }
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
              Each quest +{WEEKLY_ENERGY_REWARD} max daily limit (UTC day) · 10 quests total
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
                  +{WEEKLY_ENERGY_REWARD} Daily limit · today UTC
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

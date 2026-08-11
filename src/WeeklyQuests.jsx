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
  inventoryHasWeeklyReward,
  applyWeeklyClaimToInventory,
  markWeeklyRewardOnInventory,
  applyTaskLimitBoostToInventory,
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

  // Auto-repair: claimed weekly quests that never received task_limit_boost (e.g. wiped by shop)
  const repairRanRef = useRef(false);
  useEffect(() => {
    if (!userId || repairRanRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from('players')
          .select('inventory')
          .eq(DB_PLAYER_ID, userId)
          .maybeSingle();
        if (cancelled || error || !row) return;

        const weekIdNow = getUtcWeekId();
        let inv = hydrateWeeklyClaimsFromLedger(
          { ...(row.inventory || {}) },
          weekIdNow,
        );
        const claimed = inv.weekly_quests?.claimed || [];
        const energyQuestIds = WEEKLY_QUEST_LIST.map((q) => q.id);
        let unpaid = energyQuestIds.filter(
          (id) =>
            claimed.includes(id) &&
            !inventoryHasWeeklyReward(inv, weekIdNow, id),
        );
        // Also: rewarded flag but no active task_limit_boost at all while claimed quests exist
        const boostLive =
          inv?.task_limit_boost &&
          inv.task_limit_boost.expires &&
          new Date(inv.task_limit_boost.expires).getTime() > Date.now()
            ? Number(inv.task_limit_boost.amount) || 0
            : 0;
        if (!unpaid.length && boostLive <= 0) {
          unpaid = energyQuestIds.filter((id) => claimed.includes(id));
        }
        if (!unpaid.length) {
          repairRanRef.current = true;
          return;
        }

        // Grant +100 per unpaid quest (once), mark rewarded
        for (const id of unpaid) {
          inv = applyWeeklyClaimToInventory(inv, weekIdNow, id);
          inv = applyTaskLimitBoostToInventory(inv, WEEKLY_ENERGY_REWARD);
          inv = markWeeklyRewardOnInventory(inv, weekIdNow, id);
        }

        const { error: upErr } = await supabase
          .from('players')
          .update({
            inventory: inv,
            last_updated: new Date().toISOString(),
          })
          .eq(DB_PLAYER_ID, userId);
        if (upErr) {
          console.warn('weekly reward repair', upErr.message);
          return;
        }
        repairRanRef.current = true;
        if (typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(inv.weekly_quests, inv);
        }
        const total = unpaid.length * WEEKLY_ENERGY_REWARD;
        setAppNotice({
          show: true,
          message: `⚡ Restored +${total} max Daily Limit from ${unpaid.length} weekly claim(s) that never paid out. Check Daily Limit (not Energy 500).`,
          success: true,
        });
      } catch (e) {
        console.warn('weekly reward repair', e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, onWeeklyStateChange]);

  /**
   * Claim weekly energy quests once/week.
   * Prize = +100 MAX DAILY LIMIT (task_limit_boost → 1000 bar), never 500 Energy.
   * Order: claim → grant boost → mark rewarded (so failed grant can retry).
   */
  const handleClaim = async (quest) => {
    if (!userId || !quest?.id || claimingId || claimLockRef.current) return;

    const prog = questProgress(quest, state, { friends1k: localFriends1k });
    const localClaimed =
      permanentClaimedRef.current.has(quest.id) ||
      isQuestClaimed(state, quest.id);
    if (!prog.ready && !localClaimed) return;

    claimLockRef.current = true;
    setClaimingId(quest.id);
    // Optimistic claim only — do NOT lock reward until boost is written
    {
      const next = new Set(permanentClaimedRef.current);
      next.add(quest.id);
      // Drop stale reward lock so recovery can re-grant if server never paid
      next.delete(`reward:${quest.id}`);
      persistPermanent(next);
    }
    setClaimedTick((t) => t + 1);
    setOptimisticClaimed((prev) =>
      prev.includes(quest.id) ? prev : [...prev, quest.id],
    );

    let claimWriteOk = false;
    let rewardWriteOk = false;
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

      let alreadyRewarded = inventoryHasWeeklyReward(inv, weekId, quest.id);
      const alreadyClaimed = inventoryHasWeeklyClaim(inv, weekId, quest.id);

      // If marked rewarded but boost missing/expired, allow re-grant (wipe recovery)
      const boostAmt =
        inv?.task_limit_boost &&
        inv.task_limit_boost.expires &&
        new Date(inv.task_limit_boost.expires).getTime() > Date.now()
          ? Number(inv.task_limit_boost.amount) || 0
          : 0;
      if (alreadyRewarded && boostAmt <= 0) {
        // Reward key without active boost — treat as unpaid
        alreadyRewarded = false;
      }

      if (alreadyRewarded && boostAmt > 0) {
        {
          const next = new Set(permanentClaimedRef.current);
          next.add(quest.id);
          next.add(`reward:${quest.id}`);
          persistPermanent(next);
        }
        setClaimedTick((t) => t + 1);
        if (typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(inv.weekly_quests, inv);
        }
        setAppNotice({
          show: true,
          message: `Already claimed — your daily max includes +task boosts (now +${boostAmt}). Check Daily Limit under Energy.`,
          success: true,
        });
        return;
      }

      // --- Step 1: ensure claim is recorded (no reward key yet) ---
      inv = applyWeeklyClaimToInventory(inv, weekId, quest.id);
      inv.weekly_quests = mergeWeeklyStates(inv.weekly_quests, state, weekId);
      inv.weekly_quests = markQuestClaimed(inv.weekly_quests, weekId, quest.id);

      {
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
      }

      // --- Step 2: +100 max daily limit (task_limit_boost) — ALWAYS direct write ---
      // (grantTaskEnergy alone was getting wiped by shop inventory overwrites)
      {
        const { data: row2 } = await supabase
          .from('players')
          .select('inventory')
          .eq(DB_PLAYER_ID, userId)
          .maybeSingle();
        let inv2 = hydrateWeeklyClaimsFromLedger(
          { ...(row2?.inventory || inv) },
          weekId,
        );
        inv2 = applyWeeklyClaimToInventory(inv2, weekId, quest.id);
        inv2.weekly_quests = mergeWeeklyStates(
          inv2.weekly_quests,
          inv.weekly_quests,
          weekId,
        );
        inv2 = applyTaskLimitBoostToInventory(inv2, WEEKLY_ENERGY_REWARD);
        const { error: e2 } = await supabase
          .from('players')
          .update({
            inventory: inv2,
            last_updated: new Date().toISOString(),
          })
          .eq(DB_PLAYER_ID, userId);
        if (e2) throw e2;
        inv = inv2;
        if (typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(inv.weekly_quests, inv);
        }
      }
      // Also refresh parent grant path (HUD / inventoryRef)
      if (typeof grantTaskEnergy === 'function') {
        try {
          // Re-read so we don't double-stack incorrectly: grantTaskEnergy stacks on current.
          // Only call if parent still shows 0 task boost after direct write.
          // Skip double-stack: parent already got inv via onWeeklyStateChange with boost.
        } catch {
          /* ignore */
        }
      }

      // --- Step 3: re-read + force boost present, then mark rewarded ---
      {
        const { data: row3 } = await supabase
          .from('players')
          .select('inventory')
          .eq(DB_PLAYER_ID, userId)
          .maybeSingle();
        let inv3 = hydrateWeeklyClaimsFromLedger(
          { ...(row3?.inventory || {}) },
          weekId,
        );
        inv3 = applyWeeklyClaimToInventory(inv3, weekId, quest.id);
        inv3 = mergeInventoryWeekly(inv3, inv, weekId);

        const liveBoost =
          inv3?.task_limit_boost &&
          inv3.task_limit_boost.expires &&
          new Date(inv3.task_limit_boost.expires).getTime() > Date.now()
            ? Number(inv3.task_limit_boost.amount) || 0
            : 0;

        // If grantTaskEnergy / concurrent save lost the boost, apply it now
        if (liveBoost < WEEKLY_ENERGY_REWARD) {
          inv3 = applyTaskLimitBoostToInventory(inv3, WEEKLY_ENERGY_REWARD);
        }

        inv3 = markWeeklyRewardOnInventory(inv3, weekId, quest.id);

        const { error: e3 } = await supabase
          .from('players')
          .update({
            inventory: inv3,
            last_updated: new Date().toISOString(),
          })
          .eq(DB_PLAYER_ID, userId);
        if (e3) throw e3;
        rewardWriteOk = true;
        inv = inv3;

        if (typeof onWeeklyStateChange === 'function') {
          onWeeklyStateChange(inv.weekly_quests, inv);
        }
      }

      {
        const next = new Set(permanentClaimedRef.current);
        next.add(quest.id);
        next.add(`reward:${quest.id}`);
        persistPermanent(next);
      }
      setClaimedTick((t) => t + 1);

      const finalBoost =
        inv?.task_limit_boost &&
        inv.task_limit_boost.expires &&
        new Date(inv.task_limit_boost.expires).getTime() > Date.now()
          ? Number(inv.task_limit_boost.amount) || 0
          : 0;

      setAppNotice({
        show: true,
        message:
          `⚡ +${WEEKLY_ENERGY_REWARD} max Daily Limit (today UTC)! ` +
          `Your Daily Limit bar should show base 1000 + ${finalBoost} boost. ` +
          `Not the 500 Energy battery. (${weeklyPrizeProgress(inv.weekly_quests).current}/${WEEKLY_PRIZE.needClaims} weekly prize)`,
        success: true,
      });
    } catch (e) {
      console.error('weekly claim', e);
      // Unlock so player can retry if reward never landed
      if (!rewardWriteOk) {
        const next = new Set(permanentClaimedRef.current);
        if (!claimWriteOk) next.delete(quest.id);
        next.delete(`reward:${quest.id}`);
        persistPermanent(next);
        if (!claimWriteOk) {
          setOptimisticClaimed((prev) => prev.filter((id) => id !== quest.id));
        }
        setClaimedTick((t) => t + 1);
      }
      setAppNotice({
        show: true,
        message: e?.message || 'Could not claim reward. Tap Claim again.',
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
              Each quest +{WEEKLY_ENERGY_REWARD} max Daily Limit (1000 bar, not 500 Energy) · 10 quests total
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
        const rewarded = permanentClaimedRef.current.has(`reward:${quest.id}`);
        const prog = questProgress(quest, state, { friends1k: localFriends1k });
        // DONE only when reward confirmed; else allow Claim / recovery grant
        const fullyDone = claimed && rewarded;
        // Recovery: claimed without reward still shows Claim even if progress UI glitches
        const ready = (!fullyDone && prog.ready) || (claimed && !rewarded);

        return (
          <div
            key={quest.id}
            style={{
              background: '#111',
              border: `1px solid ${fullyDone ? 'rgba(74,222,128,0.35)' : '#555'}`,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              opacity: fullyDone ? 0.65 : 1,
            }}
          >
            <div style={{ display: 'flex', gap: 12, minWidth: 0, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>{quest.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{quest.title}</div>
                <div style={{ color: '#ffd700', fontSize: 11, marginTop: 3 }}>
                  +{WEEKLY_ENERGY_REWARD} max daily limit (not Energy bar) · today UTC
                </div>
                <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>{quest.description}</div>
                <div style={{ color: '#888', fontSize: 10, marginTop: 4, fontWeight: 'bold' }}>
                  {Math.min(prog.current, prog.need)} / {prog.need}
                </div>
              </div>
            </div>

            {fullyDone ? (
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

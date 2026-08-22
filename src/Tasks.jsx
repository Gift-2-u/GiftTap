import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { claimKey, withInventoryClaim, inventoryHasClaim } from './claimOnce';
import { DB_PLAYER_ID } from './playerIdentity';
import AppNotice from './AppNotice';
import { IDEAS_EMAIL, openIdeasEmail, copyIdeasEmail } from './contactIdeas';
import WeeklyQuests from './WeeklyQuests';
import { hasSecureSession, secureTaskClaim } from './secureApi';

/**
 * Existing tasks kept as-is (shards / social / purchase).
 * New retention tasks appended (energy rewards).
 */
const TASK_LIST = [
  // --- Original tasks (unchanged) ---
  {
    id: 'sub_tg',
    title: 'Join telegram',
    reward: 250,
    link: 'https://t.me/Gift2u_GiftTap_official',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',
    type: 'social',
  },
  {
    id: 'follow_x',
    title: 'Follow us on X',
    reward: 250,
    link: 'https://x.com/Gift2udev',
    icon: '/logo-white.png',
    type: 'social',
  },
  {
    id: 'taps_1000',
    title: 'Reach 1,000 taps',
    description: '+100 daily limit for 1 UTC day when claimed',
    icon: '👆',
    type: 'taps',
    target: 1000,
    energyReward: 100,
    dayLimited: true,
  },
  {
    id: 'taps_5000',
    title: 'Reach 5,000 taps',
    description: '+250 daily limit for 1 UTC day when claimed',
    icon: '👆',
    type: 'taps',
    target: 5000,
    energyReward: 250,
    dayLimited: true,
  },
  {
    id: 'streak_3',
    title: '3-day streak',
    description: '+200 daily limit for 1 UTC day when claimed',
    icon: '🔥',
    type: 'streak_energy',
    target: 3,
    energyReward: 200,
    dayLimited: true,
  },
  {
    id: 'streak_7',
    title: 'Tap 7 Days in a Row',
    reward: 500,
    icon: '🔥',
    type: 'streak',
    target: 7,
  },
  {
    id: 'streak_10',
    title: '10-day streak',
    description: '+500 daily limit for 1 UTC day when claimed',
    icon: '🔥',
    type: 'streak_energy',
    target: 10,
    energyReward: 500,
    dayLimited: true,
  },
  {
    id: 'streak_14',
    title: 'Tap 14 Days in a Row',
    reward: 1250,
    icon: '🔥',
    reqLevel: 1,
    type: 'streak',
    target: 14,
  },
  {
    id: 'streak_30',
    title: 'Tap 30 Days in a Row',
    reward: 3000,
    icon: '🔥',
    reqLevel: 1,
    type: 'streak',
    target: 30,
  },
  {
    id: 'first_purchase',
    title: 'Make an In-App Purchase',
    reward: 5000,
    icon: '🛍️',
    type: 'purchase',
  },

];

function utcMidnightIso() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  ).toISOString();
}

function isEnergyTask(task) {
  return task.type === 'taps' || task.type === 'streak_energy';
}

/** CLAIM RULE: lifetime tasks are once-only after claim (claimOnce.js + completed_tasks). */
const Tasks = ({
  balance,
  setBalance,
  player,
  tgUser,
  lifetimeTaps = 0,
  streak = 0,
  grantTaskEnergy,
  weeklyState,
  onWeeklyStateChange,
  inventory = null,
  activeTab,
  onTabChange,
  dailyTaps = 0,
  maxDailyLimit = 1000,
  playerId: playerIdProp,
}) => {
  const user = player || tgUser;
  const userId = playerIdProp
    ? String(playerIdProp)
    : user?.id
      ? String(user.id)
      : null;

  const [taskTab, setTaskTab] = useState(activeTab || 'week'); // 'week' | 'lifetime'

  useEffect(() => {
    if (activeTab === 'week' || activeTab === 'lifetime') {
      setTaskTab(activeTab);
    }
  }, [activeTab]);

  const switchTab = (tab) => {
    setTaskTab(tab);
    if (typeof onTabChange === 'function') onTabChange(tab);
  };
  const [completedTasks, setCompletedTasks] = useState([]);
  const [readyToClaim, setReadyToClaim] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [playerStats, setPlayerStats] = useState({ streak: 0, purchased: false });
  const [claimingId, setClaimingId] = useState(null);
  const [appNotice, setAppNotice] = useState({ show: false, message: '', success: true });

  // Live streak/taps from parent when provided; else DB stats for original streak tasks
  const liveStreak = Math.max(
    0,
    Math.floor(Number(streak) || Number(playerStats.streak) || 0),
  );
  const liveTaps = Math.max(0, Math.floor(Number(lifetimeTaps) || 0));

  useEffect(() => {
    const fetchTasks = async () => {
      if (!userId) {
        setLoadingTasks(false);
        return;
      }

      const { data, error } = await supabase
        .from('players')
        .select('completed_tasks, current_streak, has_made_purchase, lifetime_taps')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();

      if (!error && data) {
        setCompletedTasks(Array.isArray(data.completed_tasks) ? data.completed_tasks : []);
        setPlayerStats({
          streak: data.current_streak || 0,
          purchased: data.has_made_purchase || false,
          lifetimeTaps: Number(data.lifetime_taps) || 0,
        });
      }
      setLoadingTasks(false);
    };
    fetchTasks();
  }, [userId]);

  const progress = useMemo(
    () => ({
      taps: liveTaps || Math.max(0, Math.floor(Number(playerStats.lifetimeTaps) || 0)),
      streak: liveStreak,
    }),
    [liveTaps, liveStreak, playerStats.lifetimeTaps],
  );

  const handleGo = (task) => {
    if (task.type === 'social') {
      window.open(task.link, '_blank', 'noopener,noreferrer');
      setReadyToClaim((prev) => [...prev, task.id]);
    }
  };

  const taskIsReady = (task) => {
    if (task.type === 'social') return readyToClaim.includes(task.id);
    if (task.type === 'streak') return progress.streak >= task.target;
    if (task.type === 'purchase') return playerStats.purchased === true;
    if (task.type === 'taps') return progress.taps >= task.target;
    if (task.type === 'streak_energy') return progress.streak >= task.target;
    return false;
  };

  const progressLabel = (task) => {
    if (task.type === 'streak' || task.type === 'streak_energy') {
      return `${Math.min(progress.streak, task.target)} / ${task.target}`;
    }
    if (task.type === 'taps') {
      return `${Math.min(progress.taps, task.target).toLocaleString()} / ${task.target.toLocaleString()}`;
    }
    return '';
  };

  /** Original path: shard rewards — once only */
  const handleClaimShards = async (task) => {
    if (!userId || claimingId) return;
    const safeCompletedTasks = Array.isArray(completedTasks) ? completedTasks : [];
    if (safeCompletedTasks.includes(task.id)) return;

    setClaimingId(task.id);
    try {
      if (hasSecureSession()) {
        const data = await secureTaskClaim(task.id);
        if (data.shard_balance != null) setBalance(Number(data.shard_balance));
        if (Array.isArray(data.completed_tasks)) setCompletedTasks(data.completed_tasks);
        setReadyToClaim((prev) => prev.filter((id) => id !== task.id));
        setAppNotice({
          show: true,
          message: data.already
            ? 'Already claimed ✓'
            : `You earned ${task.reward.toLocaleString()} Shards!`,
          success: true,
        });
        return;
      }

      const { data: row, error: selErr } = await supabase
        .from('players')
        .select('completed_tasks, shard_balance')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();
      if (selErr) throw selErr;
      const serverDone = Array.isArray(row?.completed_tasks)
        ? row.completed_tasks
        : [];
      if (serverDone.includes(task.id)) {
        setCompletedTasks(serverDone);
        setAppNotice({
          show: true,
          message: 'Already claimed ✓',
          success: true,
        });
        return;
      }

      const newBalance = Number(balance) + Number(task.reward);
      const newCompleted = [...new Set([...serverDone, ...safeCompletedTasks, task.id])];

      setBalance(newBalance);
      setCompletedTasks(newCompleted);
      setReadyToClaim((prev) => prev.filter((id) => id !== task.id));

      const ckShard = claimKey({ scope: 'lifetime', id: task.id });
      const { data: invShardRow } = await supabase
        .from('players')
        .select('inventory')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();
      const invShard = withInventoryClaim(invShardRow?.inventory || {}, ckShard);

      const { error } = await supabase
        .from('players')
        .update({
          shard_balance: newBalance,
          completed_tasks: newCompleted,
          inventory: invShard,
          // no last_updated — energy regen clock (owned by commit-taps)
        })
        .eq(DB_PLAYER_ID, userId);
      if (error) throw error;

      setAppNotice({
        show: true,
        message: `You earned ${task.reward.toLocaleString()} Shards!`,
        success: true,
      });
    } catch (err) {
      console.error('Shard task claim failed', err);
      setAppNotice({
        show: true,
        message: err?.message || 'Could not claim task. Try again.',
        success: false,
      });
    } finally {
      setClaimingId(null);
    }
  };

  /** New path: energy rewards — once only (server completed_tasks is source of truth) */
  const handleClaimEnergy = async (task) => {
    if (!userId || claimingId) return;
    const safeCompleted = Array.isArray(completedTasks) ? completedTasks : [];
    if (safeCompleted.includes(task.id)) return;
    if (!taskIsReady(task)) return;

    setClaimingId(task.id);
    try {
      const amount = Number(task.energyReward) || 0;

      if (hasSecureSession()) {
        const data = await secureTaskClaim(task.id);
        if (Array.isArray(data.completed_tasks)) setCompletedTasks(data.completed_tasks);
        setReadyToClaim((prev) => prev.filter((id) => id !== task.id));
        if (typeof grantTaskEnergy === 'function' && data.inventory) {
          try {
            await grantTaskEnergy({ forceInventory: data.inventory });
          } catch {
            /* ignore */
          }
        }
        setAppNotice({
          show: true,
          message: data.already
            ? 'Already claimed ✓'
            : `⚡ +${amount} Daily limit claimed (for today UTC)!`,
          success: true,
        });
        return;
      }

      // Re-read server so we never double-grant if already claimed
      const { data: row, error: selErr } = await supabase
        .from('players')
        .select('completed_tasks')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();
      if (selErr) throw selErr;
      const serverDone = Array.isArray(row?.completed_tasks)
        ? row.completed_tasks
        : [];
      const ckCheck = claimKey({ scope: 'lifetime', id: task.id });
      const { data: invCheck } = await supabase
        .from('players')
        .select('inventory')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();
      if (
        serverDone.includes(task.id) ||
        inventoryHasClaim(invCheck?.inventory, ckCheck)
      ) {
        setCompletedTasks(
          serverDone.includes(task.id)
            ? serverDone
            : [...new Set([...serverDone, task.id])],
        );
        setAppNotice({
          show: true,
          message: 'Already claimed ✓',
          success: true,
        });
        return;
      }

      const newCompleted = [...new Set([...serverDone, ...safeCompleted, task.id])];

      // Durable once-only: completed_tasks + claim_log
      const ck = claimKey({ scope: 'lifetime', id: task.id });
      const { data: invRow } = await supabase
        .from('players')
        .select('inventory')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();
      let inv = withInventoryClaim(invRow?.inventory || {}, ck);

      const { error: claimErr } = await supabase
        .from('players')
        .update({
          completed_tasks: newCompleted,
          inventory: inv,
          // no last_updated — energy regen clock (owned by commit-taps)
        })
        .eq(DB_PLAYER_ID, userId);
      if (claimErr) throw claimErr;

      setCompletedTasks(newCompleted);

      if (typeof grantTaskEnergy === 'function') {
        await grantTaskEnergy({
          amount,
          taskId: task.id,
          dayLimited: !!task.dayLimited,
          expiresAt: task.dayLimited ? utcMidnightIso() : null,
        });
      }

      const dayNote = task.dayLimited ? ' (for today UTC)' : '';
      setAppNotice({
        show: true,
        message: `⚡ +${amount} Daily limit claimed${dayNote}!`,
        success: true,
      });
    } catch (err) {
      console.error('Energy task claim failed', err);
      setAppNotice({
        show: true,
        message: err?.message || 'Could not claim task. Try again.',
        success: false,
      });
    } finally {
      setClaimingId(null);
    }
  };

  const handleClaim = (task) => {
    if (isEnergyTask(task)) handleClaimEnergy(task);
    else handleClaimShards(task);
  };

  if (loadingTasks && taskTab === 'lifetime') {
    return <div style={{ color: '#888', marginTop: '20px' }}>Loading Tasks...</div>;
  }

  const safeCompletedTasks = Array.isArray(completedTasks) ? completedTasks : [];

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: '100px',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <AppNotice
        show={appNotice.show}
        message={appNotice.message}
        success={appNotice.success}
        onClose={() => setAppNotice((n) => ({ ...n, show: false }))}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => switchTab('week')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: 12,
            border: taskTab === 'week' ? '2px solid #3264ff' : '1px solid #333',
            background: taskTab === 'week' ? 'rgba(50,100,255,0.15)' : '#1c1e22',
            color: taskTab === 'week' ? '#8eb4ff' : '#888',
            fontWeight: 'bold',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          This week
        </button>
        <button
          type="button"
          onClick={() => switchTab('lifetime')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: 12,
            border: taskTab === 'lifetime' ? '2px solid #ffd700' : '1px solid #333',
            background: taskTab === 'lifetime' ? 'rgba(255,215,0,0.12)' : '#1c1e22',
            color: taskTab === 'lifetime' ? '#ffd700' : '#888',
            fontWeight: 'bold',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Lifetime
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '120px' }}>
        {taskTab === 'week' ? (
          <WeeklyQuests
            player={user || player}
            playerId={userId}
            weeklyState={weeklyState}
            onWeeklyStateChange={onWeeklyStateChange}
            inventory={inventory}
            grantTaskEnergy={grantTaskEnergy}
            dailyTaps={dailyTaps}
            maxDailyLimit={maxDailyLimit}
          />
        ) : null}

        {taskTab === 'lifetime'
          ? TASK_LIST.map((task) => {
          const isCompleted = safeCompletedTasks.includes(task.id);
          const isReady = !isCompleted && taskIsReady(task);
          const iconIsImage =
            typeof task.icon === 'string' &&
            (task.icon.includes('.') || task.icon.includes('http'));

          const rewardLine = isEnergyTask(task)
            ? `+${task.energyReward} Daily limit${task.dayLimited ? ' · 1 UTC day' : ''}`
            : `+${Number(task.reward).toLocaleString()} Shards`;

          return (
            <div
              key={task.id}
              style={{
                background: '#111',
                border: '1px solid #555',
                borderRadius: '12px',
                padding: '15px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: isCompleted ? 0.5 : 1,
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', minWidth: 0 }}>
                <div style={{ fontSize: '28px', display: 'flex', alignItems: 'center' }}>
                  {iconIsImage ? (
                    <img
                      src={task.icon}
                      alt="icon"
                      style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                    />
                  ) : (
                    task.icon
                  )}
                </div>

                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
                    {task.title}
                  </div>
                  <div style={{ color: '#ffd700', fontSize: '12px', marginTop: '4px' }}>
                    {rewardLine}
                  </div>
                  {task.description ? (
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{task.description}</div>
                  ) : null}
                </div>
              </div>

              {isCompleted ? (
                <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>
                  ✓ DONE
                </span>
              ) : isReady ? (
                <button
                  type="button"
                  disabled={!!claimingId}
                  onClick={() => handleClaim(task)}
                  style={{
                    background: '#fbef43',
                    color: '#000',
                    border: 'none',
                    padding: '8px 15px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: claimingId ? 'wait' : 'pointer',
                    flexShrink: 0,
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {claimingId === task.id ? '…' : 'Claim'}
                </button>
              ) : task.type === 'streak' ||
                task.type === 'streak_energy' ||
                task.type === 'taps' ? (
                <button
                  type="button"
                  disabled
                  style={{
                    background: '#333',
                    color: '#888',
                    border: '1px solid #444',
                    padding: '8px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {progressLabel(task)}
                </button>
              ) : task.type === 'purchase' ? (
                <button
                  type="button"
                  disabled
                  style={{
                    background: '#333',
                    color: '#888',
                    border: '1px solid #444',
                    padding: '8px 15px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  Pending
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleGo(task)}
                  style={{
                    background: '#222',
                    color: '#fff',
                    border: '1px solid #ffd700',
                    padding: '8px 15px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Go
                </button>
              )}
            </div>
          );
        })
          : null}

        {/* Player ideas — email Gift2U; possible reward if shipped */}
        {taskTab === 'lifetime' ? (
        <div
          style={{
            marginTop: 18,
            marginBottom: 24,
            background: 'linear-gradient(145deg, #1a1520 0%, #111 100%)',
            border: '1px solid rgba(255, 215, 0, 0.35)',
            borderRadius: 14,
            padding: 16,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>💡</span>
            <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 15 }}>Got an idea?</div>
          </div>
          <p style={{ color: '#ccc', fontSize: 12, lineHeight: 1.45, margin: '0 0 10px' }}>
            Send features, tasks, or balance ideas to the team. If we ship your idea in Gift2U / GiftTap,
            you may receive a reward (shards, energy boost, or other in-game perk — decided case by case).
          </p>
          <p style={{ color: '#888', fontSize: 11, lineHeight: 1.4, margin: '0 0 12px' }}>
            Include your in-game username or player ID so we can find you. No guarantee every idea is used.
          </p>
          <button
            type="button"
            onClick={async () => {
              const result = await openIdeasEmail({
                username: user?.username,
                playerId: user?.id,
              });
              // Always copy so they can paste if no mail app / WebView blocks mailto
              const copied = await copyIdeasEmail();
              setAppNotice({
                show: true,
                message: copied
                  ? `Opening your mail app…\n\n${IDEAS_EMAIL} is also copied — paste it if mail did not open.`
                  : `Open your mail app and write to:\n${IDEAS_EMAIL}\n\n(Subject: Gift2U idea / suggestion)`,
                success: true,
                title: 'Send your idea',
              });
              return result;
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              background: '#fbef43',
              color: '#000',
              fontWeight: 'bold',
              fontSize: 13,
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              marginBottom: 8,
              cursor: 'pointer',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Open mail → {IDEAS_EMAIL}
          </button>
          <button
            type="button"
            onClick={async () => {
              const copied = await copyIdeasEmail();
              setAppNotice({
                show: true,
                message: copied
                  ? `Copied ${IDEAS_EMAIL} — paste it in Gmail, Outlook, etc.`
                  : `Email: ${IDEAS_EMAIL}`,
                success: true,
              });
            }}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#ffd700',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              borderRadius: 12,
              padding: '10px',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Copy email address
          </button>
        </div>
        ) : null}
      </div>
    </div>
  );
};

export default Tasks;

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Tasks = ({ balance, setBalance, tgUser }) => {
  const [completedTasks, setCompletedTasks] = useState([]);
  const [readyToClaim, setReadyToClaim] = useState([]); // Tracks tasks that are waiting to be claimed
  const [loadingTasks, setLoadingTasks] = useState(true);
  // NEW: State to track player's real progression stats
  const [playerStats, setPlayerStats] = useState({ streak: 0, purchased: false });
  const currentLevel = balance < 25000 ? 1 : balance < 100000 ? 2 : balance < 500000 ? 3 : 4;

  const taskList = [
    { id: 'sub_tg', name: 'Join telegram', reward: 250, link: 'https://t.me/Gift2u_GiftTap_official', icon: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg', reqLevel: 1, type: 'social' },
    { id: 'follow_x', name: 'Follow us on X', reward: 250, link: 'https://x.com/gift2utoken', icon: '/logo-white.png', reqLevel: 1, type: 'social' },
    // Streak Tasks (Type: streak)
    { id: 'streak_7', title: 'Tap 7 Days in a Row', reward: 25000, icon: '🔥', reqLevel: 1, type: 'streak', target: 7 },
    { id: 'streak_14', title: 'Tap 14 Days in a Row', reward: 100000, icon: '🔥', reqLevel: 2, type: 'streak', target: 14 },
    { id: 'streak_30', title: 'Tap 30 Days in a Row', reward: 500000, icon: '🔥', reqLevel: 3, type: 'streak', target: 30 }, 
    // Purchase Task (Type: purchase)
    { id: 'first_purchase', title: 'Make an In-App Purchase', reward: 250000, icon: '🛍️', reqLevel: 1, type: 'purchase' }
  ];

  // 1. Load completed tasks from Supabase when the page opens
  useEffect(() => {
    const fetchTasks = async () => {
      if (!tgUser?.id) return;
      
      const { data, error } = await supabase
        .from('players')
        .select('completed_tasks, current_streak, has_made_purchase')
        .eq('telegram_id', String(tgUser.id))
        .single();

      if (!error && data) {
        setCompletedTasks(Array.isArray(data.completed_tasks) ? data.completed_tasks : []);
        setPlayerStats({
          streak: data.current_streak || 0,
          purchased: data.has_made_purchase || false
        });
      }
      setLoadingTasks(false);
    };
    fetchTasks();
  }, [tgUser]);

  // 2. Handle the "Go" button (Opens link, changes button to Claim)
  const handleGo = (task) => {
    if (currentLevel < task.reqLevel) {
      return alert(`LOCKED! You need to reach Level ${task.reqLevel} to do this task.`);
    }

    if (task.type === 'social') {
      if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(task.link);
      } else {
        window.open(task.link, '_blank');
      }
      setReadyToClaim(prev => [...prev, task.id]);
    }
  };
  // 3. Handle the "Claim" button (Gives shards, shuts it down forever)
  const handleClaim = async (task) => {
    const newBalance = balance + task.reward;
    const safeCompletedTasks = Array.isArray(completedTasks) ? completedTasks : [];
    const newCompleted = [...safeCompletedTasks, task.id];

    setBalance(newBalance);
    setCompletedTasks(newCompleted);
    setReadyToClaim(prev => prev.filter(id => id !== task.id));

    await supabase
      .from('players')
      .update({
        shard_balance: newBalance,
        completed_tasks: newCompleted
      })
      .eq('telegram_id', String(tgUser.id));
      
    alert(`🎉 You earned ${task.reward.toLocaleString()} Shards!`);
  };

  if (loadingTasks) return <div style={{ color: '#888', marginTop: '20px' }}>Loading Tasks...</div>;

  const safeCompletedTasks = Array.isArray(completedTasks) ? completedTasks : [];
  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box' }}>
      
      <div style={{ background: '#222', padding: '15px', borderRadius: '15px', marginBottom: '20px', border: '1px solid #ffd700', textAlign: 'center' }}>
        <h2 style={{ color: '#ffd700', margin: '0 0 5px 0' }}>Level {currentLevel}</h2>
        <div style={{ color: '#888', fontSize: '12px' }}>
          {currentLevel === 1 ? 'Reach 25,000 Shards for Level 2' : 
           currentLevel === 2 ? 'Reach 100,000 Shards for Level 3' : 
           currentLevel === 3 ? 'Reach 500,000 Shards for Level 4' : 'MAX LEVEL ACHIEVED'}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {TASK_LIST.map((task) => {
          const isCompleted = safeCompletedTasks.includes(task.id);
          const isLocked = currentLevel < task.reqLevel;
          
          // Determine if the task is ready to claim based on its type
          let isReady = false;
          if (task.type === 'social') isReady = readyToClaim.includes(task.id);
          if (task.type === 'streak') isReady = playerStats.streak >= task.target;
          if (task.type === 'purchase') isReady = playerStats.purchased === true;

          return (
            <div key={task.id} style={{ 
              background: '#111', 
              border: `1px solid ${isLocked ? '#333' : '#555'}`, 
              borderRadius: '12px', 
              padding: '15px', 
              marginBottom: '10px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              opacity: isCompleted || isLocked ? 0.5 : 1
            }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ fontSize: '24px', filter: isLocked ? 'grayscale(100%)' : 'none' }}>{isLocked ? '🔒' : task.icon}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{task.title}</div>
                  <div style={{ color: '#ffd700', fontSize: '12px', marginTop: '4px' }}>
                    {isLocked ? `Unlocks at Lv.${task.reqLevel}` : `+${task.reward.toLocaleString()}`}
                  </div>
                </div>
              </div>

              {/* DYNAMIC BUTTON LOGIC */}
              {isCompleted ? (
                <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: 'bold' }}>✓ DONE</span>
              ) : isLocked ? (
                <span style={{ color: '#888', fontSize: '12px', fontWeight: 'bold' }}>LOCKED</span>
              ) : isReady ? (
                <button onClick={() => handleClaim(task)} style={{ background: '#fbef43', color: '#000', border: 'none', padding: '8px 15px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Claim
                </button>
              ) : (
                // RENDER PROGRESS OR "GO" DEPENDING ON TYPE
                task.type === 'streak' ? (
                  <button disabled style={{ background: '#333', color: '#888', border: '1px solid #444', padding: '8px 15px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                    {Math.min(playerStats.streak, task.target)} / {task.target}
                  </button>
                ) : task.type === 'purchase' ? (
                  <button disabled style={{ background: '#333', color: '#888', border: '1px solid #444', padding: '8px 15px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                    Pending
                  </button>
                ) : (
                  <button onClick={() => handleGo(task)} style={{ background: '#222', color: '#fff', border: '1px solid #ffd700', padding: '8px 15px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Go
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Tasks;
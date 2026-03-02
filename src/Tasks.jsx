import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Tasks = ({ balance, setBalance, tgUser }) => {
  const [completedTasks, setCompletedTasks] = useState([]);
  const [readyToClaim, setReadyToClaim] = useState([]); // Tracks tasks that are waiting to be claimed
  const [loadingTasks, setLoadingTasks] = useState(true);

  const taskList = [
    { id: 'sub_tg', name: 'Join telegram', reward: 250, link: 'https://t.me/Gift2u_GiftTap_official', icon: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg' },
    { id: 'follow_x', name: 'Follow us on X', reward: 250, link: 'https://x.com/gift2utoken', icon: '/logo-white.png' },
  ];

  // 1. Load completed tasks from Supabase when the page opens
  useEffect(() => {
    const fetchTasks = async () => {
      if (!tgUser?.id) return;
      
      const { data, error } = await supabase
        .from('players')
        .select('completed_tasks')
        .eq('telegram_id', String(tgUser.id))
        .single();

      if (!error && data) {
        setCompletedTasks(data.completed_tasks || []);
      }
      setLoadingTasks(false);
    };
    fetchTasks();
  }, [tgUser]);

  // 2. Handle the "Go" button (Opens link, changes button to Claim)
  const handleGo = (task) => {
    // Open the link
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(task.link);
    } else {
      window.open(task.link, '_blank');
    }
    
    // Transform the button into "Claim"
    setReadyToClaim(prev => [...prev, task.id]);
  };

  // 3. Handle the "Claim" button (Gives shards, shuts it down forever)
  const handleClaim = async (task) => {
    const newBalance = balance + task.reward;
    const newCompleted = [...completedTasks, task.id];

    // Optimistic UI update (Instant feedback for the player)
    setBalance(newBalance);
    setCompletedTasks(newCompleted);
    
    // Remove from the "Ready to Claim" list
    setReadyToClaim(prev => prev.filter(id => id !== task.id));

    // Save the locked task to the Database so it stays shut down
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

  return (
    // This styling forces the footer to the bottom of the screen
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box' }}>
      
      <h2 style={{ color: '#ffd700', margin: '0 0 20px 0', textAlign: 'center' }}>Earn Shards</h2>
      <p style={{ color: '#888', fontSize: '12px', textAlign: 'center', marginBottom: '20px' }}>Complete tasks to earn extra GFTshards.</p>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {TASK_LIST.map((task) => {
          // Check what state the task is currently in
          const isCompleted = completedTasks.includes(task.id);
          const isReady = readyToClaim.includes(task.id);

          return (
            <div key={task.id} style={{ 
              background: '#111', 
              border: '1px solid #333', 
              borderRadius: '12px', 
              padding: '15px', 
              marginBottom: '10px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              opacity: isCompleted ? 0.5 : 1 // Dims the box when it's shut down
            }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ fontSize: '24px' }}>{task.icon}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{task.title}</div>
                  <div style={{ color: '#ffd700', fontSize: '12px', marginTop: '4px' }}>+{task.reward.toLocaleString()}</div>
                </div>
              </div>

              {/* THE 3 BUTTON STATES */}
              {isCompleted ? (
                // STATE 3: SHUT DOWN
                <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: 'bold' }}>✓ DONE</span>
              ) : isReady ? (
                // STATE 2: READY TO CLAIM
                <button 
                  onClick={() => handleClaim(task)} 
                  style={{ background: '#fbef43', color: '#000', border: 'none', padding: '8px 15px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Claim
                </button>
              ) : (
                // STATE 1: GO TO LINK
                <button 
                  onClick={() => handleGo(task)} 
                  style={{ background: '#222', color: '#fff', border: '1px solid #ffd700', padding: '8px 15px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Go
                </button>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Tasks;
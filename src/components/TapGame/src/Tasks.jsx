import React, { useState } from 'react';
import { supabase } from './supabaseClient';

const Tasks = ({ balance, setBalance, tgUser }) => {
  const [loadingTask, setLoadingTask] = useState(null);

  const taskList = [
    { id: 'sub_tg', name: 'Join telegram', reward: 250, link: 'https://t.me/Gift2u_GiftTap_official', icon: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg' },
    { id: 'follow_x', name: 'Follow us on X', reward: 250, link: 'https://x.com/gift2utoken', icon: 'https://upload.wikimedia.org/wikipedia/commons/5/53/X_logo_2023_white.svg' },
  ];

  const doTask = async (task) => {
    setLoadingTask(task.id);
    window.open(task.link, '_blank');

    // Simple 5-second "verification" delay to simulate checking
    setTimeout(async () => {
      const { error } = await supabase
        .from('players')
        .update({ shard_balance: balance + task.reward })
        .eq('telegram_id', String(tgUser.id));

      if (!error) {
        setBalance(prev => prev + task.reward);
        alert(`✅ Task Complete! +${task.reward} Shards`);
      }
      setLoadingTask(null);
    }, 5000);
  };

  return (
    <div style={styles.container}>
      <h2 style={{ color: '#ffd700', textAlign: 'center' }}>Earn Shards</h2>
      {taskList.map(task => (
        <div key={task.id} style={styles.taskCard}>
           <img 
             src={task.icon} 
             alt={task.name} 
             style={{ width: '32px', height: '32px', objectFit: 'contain' }} 
          />
          <div style={{ flex: 1, marginLeft: '15px' }}>
            <div style={{ fontWeight: 'bold' }}>{task.name}</div>
            <div style={{ color: '#ffd700', fontSize: '14px' }}>+{task.reward} GFTshards</div>
          </div>
          <button 
            disabled={loadingTask === task.id}
            onClick={() => doTask(task)}
            style={loadingTask === task.id ? styles.btnDisabled : styles.btn}
          >
            {loadingTask === task.id ? 'Checking...' : 'Go'}
          </button>
        </div>
      ))}
    </div>
  );
};

const styles = {
  container: { padding: '20px', width: '100%', boxSizing: 'border-box' },
  taskCard: { display: 'flex', alignItems: 'center', background: '#262626', padding: '15px', borderRadius: '15px', marginBottom: '10px', border: '1px solid #333' },
  btn: { background: '#ffd700', color: '#000', border: 'none', padding: '8px 20px', borderRadius: '10px', fontWeight: 'bold' },
  btnDisabled: { background: '#444', color: '#888', border: 'none', padding: '8px 20px', borderRadius: '10px' }
};

export default Tasks;
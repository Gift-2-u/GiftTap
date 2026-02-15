import React from 'react';
import { supabase } from './supabaseClient';

const Upgrades = ({ balance, setBalance, stats, setStats, tgUser }) => {
  const upgradeList = [
    { id: 'tap_power', name: 'Multitap', cost: 500, bonus: 1, icon: '⚡', desc: '+1 Shard per tap' },
    { id: 'max_daily_limit', name: 'Limit Buster', cost: 1000, bonus: 1000, icon: '🚀', desc: '+1000 Daily Limit' },
    { id: 'energy_level', name: 'Helper Elf', cost: 2000, bonus: 500, icon: '🧝', desc: '+500 Max Energy' },
  ];

  const buyUpgrade = async (upgrade) => {
    if (balance >= upgrade.cost) {
      const newBalance = balance - upgrade.cost;
      const currentValue = stats[upgrade.id] || (upgrade.id === 'tap_power' ? 1 : (upgrade.id === 'max_daily_limit' ? 1000 : 500));
      
      // 1. Update the database using telegram_id
      const { error } = await supabase
        .from('players')
        .update({
          [upgrade.id]: currentValue + upgrade.bonus,
          shard_balance: newBalance,
          last_updated: new Date().toISOString()
        })
        .eq('telegram_id', String(tgUser.id));

      if (!error) {
        // 2. Update local state instantly
        setBalance(newBalance);
        setStats(prev => ({
          ...prev,
          [upgrade.id]: currentValue + upgrade.bonus
        }));
        alert(`Success! ${upgrade.name} activated!`);
      } else {
        alert("Transaction failed. Check connection.");
      }
    } else {
      alert("Not enough GFTshards!");
    }
  };

  return (
    <div style={styles.menu}>
      <div style={styles.handle}></div>
      <h2 style={{ textAlign: 'center', color: '#ffd700', margin: '10px 0' }}>Gift Shop</h2>
      {upgradeList.map((item) => (
        <div key={item.id} style={styles.card} onClick={() => buyUpgrade(item)}>
          <span style={{ fontSize: '30px' }}>{item.icon}</span>
          <div style={{ flex: 1, marginLeft: '15px' }}>
            <div style={{ fontWeight: 'bold', color: '#fff' }}>{item.name}</div>
            <div style={{ fontSize: '12px', color: '#ffd700' }}>{item.desc}</div>
          </div>
          <div style={styles.priceTag}>{item.cost.toLocaleString()} 💰</div>
        </div>
      ))}
    </div>
  );
};

const styles = {
  menu: { flex: 1,  width: '100%',  padding: '20px',  background: '#1a1a1a' },
  handle: { width: '40px', height: '5px', background: '#333', borderRadius: '10px', margin: '0 auto 15px' },
  card: { display: 'flex', width: '100%', alignItems: 'center', padding: '15px', background: '#262626', marginBottom: '12px', borderRadius: '16px', border: '1px solid #333', cursor: 'pointer', transition: 'transform 0.1s' },
  priceTag: { background: '#ffd700', color: '#000', padding: '5px 10px', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px' }
};

export default Upgrades;
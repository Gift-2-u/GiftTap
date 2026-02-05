import React from 'react';

const Upgrades = ({ balance, setBalance, ppt, setPpt }) => {
  const upgradeList = [
    { id: 'tape', name: 'Stronger Tape', cost: 10, bonus: 1, icon: '🩹' },
    { id: 'scissors', name: 'Golden Scissors', cost: 100, bonus: 5, icon: '✂️' },
    { id: 'elf', name: 'Helper Elf', cost: 500, bonus: 20, icon: '🧝' },
  ];

  const buyUpgrade = (upgrade) => {
    if (balance >= upgrade.cost) {
      setBalance(balance - upgrade.cost);
      setPpt(ppt + upgrade.bonus);
      alert(`Level Up! Taps now worth +${upgrade.bonus}`);
    } else {
      alert("Not enough $GIFT!");
    }
  };

  return (
    <div style={styles.menu}>
      <h2 style={{ textAlign: 'center' }}>Shop</h2>
      {upgradeList.map((item) => (
        <div key={item.id} style={styles.card} onClick={() => buyUpgrade(item)}>
          <span style={{ fontSize: '24px' }}>{item.icon}</span>
          <div style={{ flex: 1, marginLeft: '15px' }}>
            <div style={{ fontWeight: 'bold' }}>{item.name}</div>
            <div style={{ fontSize: '12px', color: '#aaa' }}>Cost: {item.cost} $GIFT</div>
          </div>
          <div style={{ color: '#ffd700' }}>+{item.bonus} PPT</div>
        </div>
      ))}
    </div>
  );
};

const styles = {
  menu: { padding: '20px', background: '#222', borderRadius: '20px 20px 0 0', position: 'absolute', bottom: 0, width: '100%', boxSizing: 'border-box' },
  card: { display: 'flex', alignItems: 'center', padding: '15px', background: '#333', marginBottom: '10px', borderRadius: '12px', cursor: 'pointer' }
};

export default Upgrades;
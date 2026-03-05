import { useState } from 'react';
import { supabase } from './supabaseClient';

const Marketplace = ({ balance, setBalance, tapPower = 1, setTapPower, maxEnergy = 500, setMaxEnergy, tgUser, playerWallet }) => {
  const [activeTab, setActiveTab] = useState('market'); 
  const [marketFilter, setMarketFilter] = useState('All'); // 'All', 'Bots', 'Gloves', 'Misc'

  // --- REGULAR SHARD UPGRADES MATH ---
  const multitapCost = tapPower * 1000;
  const energyLevel = ((maxEnergy - 500) / 500) + 1; 
  const energyCost = energyLevel * 2000;

  // --- P2P MARKET DATA (THE ELF ECOSYSTEM) ---
  const listings = [
    { id: 1, name: "Nightfall Scout", type: "Bots", rarity: "Epic", boost: "+500/hr", price: 0.15, currency: "SOL", image: "🧝‍♂️" },
    { id: 2, name: "Magma Smith", type: "Power", rarity: "Rare", boost: "+5/Tap", price: 25000, currency: "GFT", image: "🗡️" },
    { id: 3, name: "Crystal Channeler", type: "Energy", rarity: "Uncommon", boost: "+2000 Energy", price: 0.05, currency: "SOL", image: "🔮" },
    { id: 4, name: "Void Walker", type: "Bots", rarity: "Legendary", boost: "+2500/hr", price: 1.2, currency: "SOL", image: "🥷" },
    { id: 5, name: "Oracle of Chance", type: "Luck", rarity: "Legendary", boost: "10% Crit", price: 150000, currency: "GFT", image: "🎲" }
  ];

  // (And update your filter buttons array further down in the code to match):
  // {['All', 'Bots', 'Power', 'Energy', 'Luck'].map(filter => ...

  const filteredListings = listings.filter(item => marketFilter === 'All' || item.type === marketFilter);

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '15px', paddingBottom: '120px', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#ffd700', fontSize: '24px', margin: '0 0 5px 0' }}>Gift2u Market</h2>
        <div style={{ color: '#888', fontSize: '14px', fontWeight: 'bold' }}>💎 {balance.toLocaleString()} Shards</div>
      </div>

      {/* Main Navigation Tabs */}
      <div style={{ display: 'flex', background: '#111', borderRadius: '12px', padding: '5px', marginBottom: '15px', fontSize: '12px' }}>
        <button onClick={() => setActiveTab('upgrades')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'upgrades' ? '#4ade80' : 'transparent', color: activeTab === 'upgrades' ? '#000' : '#888', fontWeight: 'bold' }}>Upgrades</button>
        <button onClick={() => setActiveTab('market')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'market' ? '#fbef43' : 'transparent', color: activeTab === 'market' ? '#000' : '#888', fontWeight: 'bold' }}>P2P Market</button>
        <button onClick={() => setActiveTab('inventory')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'inventory' ? '#9945FF' : 'transparent', color: activeTab === 'inventory' ? '#fff' : '#888', fontWeight: 'bold' }}>Backpack</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        
        {/* --- TAB 1: UPGRADES (Hidden for brevity, keep your old code here) --- */}
        {activeTab === 'upgrades' && (
           <div style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>Shard Upgrades Here</div>
        )}

        {/* --- TAB 2: P2P MARKETPLACE (NEW GRID LAYOUT) --- */}
        {activeTab === 'market' && (
          <>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
              {['All', 'Bots', 'Gloves', 'Misc'].map(filter => (
                <button 
                  key={filter}
                  onClick={() => setMarketFilter(filter)}
                  style={{ 
                    padding: '6px 16px', borderRadius: '20px', border: '1px solid #333', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap',
                    background: marketFilter === filter ? '#fff' : '#111', 
                    color: marketFilter === filter ? '#000' : '#888' 
                  }}>
                  {filter}
                </button>
              ))}
            </div>

            {/* 2-Column Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {filteredListings.map((item) => (
                <div key={item.id} style={{ background: '#111', border: item.rarity === 'Legendary' ? '1px solid #ffd700' : item.rarity === 'Epic' ? '1px solid #9945FF' : '1px solid #333', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  
                  {/* NFT Image/Icon */}
                  <div style={{ fontSize: '40px', background: '#222', width: '100%', borderRadius: '8px', padding: '15px 0', marginBottom: '10px' }}>
                    {item.image}
                  </div>
                  
                  {/* Stats */}
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                  <div style={{ color: item.rarity === 'Legendary' ? '#ffd700' : '#4ade80', fontSize: '11px', marginTop: '2px', fontWeight: 'bold' }}>
                    {item.boost}
                  </div>

                  {/* Price & Buy Button */}
                  <div style={{ width: '100%', marginTop: '10px', borderTop: '1px solid #222', paddingTop: '10px' }}>
                    <div style={{ color: item.currency === 'SOL' ? '#14F195' : '#ffd700', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>
                      {item.price} {item.currency}
                    </div>
                    <button style={{ width: '100%', background: item.currency === 'SOL' ? '#9945FF' : '#ffd700', color: item.currency === 'SOL' ? '#fff' : '#000', border: 'none', padding: '6px 0', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px' }}>
                      Buy
                    </button>
                  </div>

                </div>
              ))}
            </div>
          </>
        )}

        {/* --- TAB 3: BACKPACK --- */}
        {activeTab === 'inventory' && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎒</div>
            <h3 style={{ color: '#fff', margin: '0 0 10px 0' }}>Your Gear</h3>
          </div>
        )}

      </div>
    </div>
  );
};

export default Marketplace;
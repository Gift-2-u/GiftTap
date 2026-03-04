import { useState } from 'react';

const Marketplace = ({ playerWallet }) => {
  const [activeTab, setActiveTab] = useState('buy'); // 'buy' or 'sell'

  // Dummy data representing NFTs currently listed by other players
  const listings = [
    { id: 1, name: "Neon Auto-Drone", type: "Passive Bot", rarity: "Epic", boost: "+500 Shards/hr", price: 0.15, currency: "SOL", seller: "Fx92...kLp", image: "🤖" },
    { id: 2, name: "Golden Power Gloves", type: "Tap Power", rarity: "Rare", boost: "+5 Shards/Tap", price: 25000, currency: "GFT", seller: "Vault...3xx", image: "🧤" },
    { id: 3, name: "Overcharged Core", type: "Max Energy", rarity: "Uncommon", boost: "+2000 Energy", price: 0.05, currency: "SOL", seller: "Zk19...mQa", image: "🔋" },
    { id: 4, name: "Diamond Thread", type: "Crit Chance", rarity: "Legendary", boost: "10% Crit Rate", price: 150000, currency: "GFT", seller: "Gift...King", image: "🎀" }
  ];

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '20px', paddingBottom: '120px', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#ffd700', fontSize: '28px', margin: '0 0 5px 0' }}>Marketplace</h2>
        <div style={{ color: '#888', fontSize: '14px' }}>Trade Gear. Earn Crypto.</div>
      </div>

      {/* Buy / Sell Toggles */}
      <div style={{ display: 'flex', background: '#111', borderRadius: '12px', padding: '5px', marginBottom: '20px' }}>
        <button 
          onClick={() => setActiveTab('buy')}
          style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'buy' ? '#fbef43' : 'transparent', color: activeTab === 'buy' ? '#000' : '#888', fontWeight: 'bold', cursor: 'pointer' }}>
          Buy Gear
        </button>
        <button 
          onClick={() => setActiveTab('sell')}
          style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'sell' ? '#333' : 'transparent', color: activeTab === 'sell' ? '#fff' : '#888', fontWeight: 'bold', cursor: 'pointer' }}>
          My Inventory
        </button>
      </div>

      {/* Marketplace Listings */}
      {activeTab === 'buy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
          {listings.map((item) => (
            <div key={item.id} style={{ background: '#111', border: item.rarity === 'Legendary' ? '1px solid #ffd700' : item.rarity === 'Epic' ? '1px solid #9945FF' : '1px solid #333', borderRadius: '15px', padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ fontSize: '38px', background: '#222', padding: '10px', borderRadius: '12px' }}>
                  {item.image}
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '16px' }}>{item.name}</div>
                  <div style={{ color: item.rarity === 'Legendary' ? '#ffd700' : '#4ade80', fontSize: '12px', marginTop: '2px', fontWeight: 'bold' }}>
                    {item.boost}
                  </div>
                  <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>
                    Seller: {item.seller}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ color: item.currency === 'SOL' ? '#14F195' : '#ffd700', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {item.price} {item.currency}
                </div>
                <button style={{ background: item.currency === 'SOL' ? '#9945FF' : '#ffd700', color: item.currency === 'SOL' ? '#fff' : '#000', border: 'none', padding: '8px 20px', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                  Buy
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Sell Tab (Inventory Placeholder) */}
      {activeTab === 'sell' && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎒</div>
          <h3 style={{ color: '#fff', margin: '0 0 10px 0' }}>Your Backpack</h3>
          <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
            {playerWallet ? "Scanning your connected wallet for Gift Gear..." : "Connect your Solana wallet to view and sell your items!"}
          </p>
        </div>
      )}

    </div>
  );
};

export default Marketplace;
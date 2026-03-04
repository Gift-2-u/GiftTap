import { useState } from 'react';
import { supabase } from './supabaseClient';

const Store = ({ balance, setBalance, tapPower, setTapPower, tgUser, playerWallet }) => {
  const [activeTab, setActiveTab] = useState('boosts'); // 'boosts' or 'web3'

  // --- REGULAR BOOSTS (Paid in Shards) ---
  const multitapCost = tapPower * 1000;
  
  const handleUpgradeMultitap = async () => {
    if (balance < multitapCost) return alert("Not enough Shards!");
    const newBalance = balance - multitapCost;
    const newTapPower = tapPower + 1;

    setBalance(newBalance);
    setTapPower(newTapPower);

    if (tgUser?.id) {
      await supabase.from('players').update({ 
        shard_balance: newBalance, tap_power: newTapPower 
      }).eq('telegram_id', String(tgUser.id));
    }
  };

  // --- WEB3 ITEMS (Paid in SOL / GFT) ---
  const handleBuyWithCrypto = async (currency, amount, itemName) => {
    if (!playerWallet) {
      return alert("Please connect your Solana wallet first!");
    }
    
    // This is where we will add the @solana/web3.js transaction code later!
    console.log(`Prompting wallet to pay ${amount} ${currency} for ${itemName}...`);
    alert(`Web3 Payment Prompt: Buy ${itemName} for ${amount} ${currency}`);
  };

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '20px', paddingBottom: '120px', boxSizing: 'border-box' }}>
      
      {/* Store Header & Balances */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#ffd700', fontSize: '28px', margin: '0 0 10px 0' }}>Store</h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', color: '#888', fontSize: '14px' }}>
          <div>💎 {balance.toLocaleString()} Shards</div>
          {playerWallet && <div>🟣 Connected</div>}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', background: '#111', borderRadius: '12px', padding: '5px', marginBottom: '20px' }}>
        <button 
          onClick={() => setActiveTab('boosts')}
          style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'boosts' ? '#333' : 'transparent', color: activeTab === 'boosts' ? '#fff' : '#888', fontWeight: 'bold', cursor: 'pointer' }}>
          In-Game Boosts
        </button>
        <button 
          onClick={() => setActiveTab('web3')}
          style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'web3' ? '#fbef43' : 'transparent', color: activeTab === 'web3' ? '#000' : '#888', fontWeight: 'bold', cursor: 'pointer' }}>
          Web3 & NFTs
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
        
        {/* --- SHARDS TAB --- */}
        {activeTab === 'boosts' && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '15px', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ fontSize: '32px' }}>👆</div>
              <div>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '16px' }}>Multitap</div>
                <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Level {tapPower} • +1 Shard/Tap</div>
                <div style={{ color: '#ffd700', fontSize: '14px', fontWeight: 'bold', marginTop: '6px' }}>💎 {multitapCost.toLocaleString()}</div>
              </div>
            </div>
            <button 
              onClick={handleUpgradeMultitap}
              style={{ background: balance >= multitapCost ? '#fbef43' : '#333', color: balance >= multitapCost ? '#000' : '#888', border: 'none', padding: '10px 20px', borderRadius: '25px', fontWeight: 'bold', cursor: balance >= multitapCost ? 'pointer' : 'not-allowed' }}>
              Upgrade
            </button>
          </div>
        )}

        {/* --- WEB3 / NFT TAB --- */}
        {activeTab === 'web3' && (
          <>
            {/* Pay with SOL Example */}
            <div style={{ background: 'linear-gradient(45deg, #1a1a2e, #16213e)', border: '1px solid #9945FF', borderRadius: '15px', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ fontSize: '32px' }}>⚡</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '16px' }}>Auto-Tap Bot</div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Taps for you while offline</div>
                  <div style={{ color: '#14F195', fontSize: '14px', fontWeight: 'bold', marginTop: '6px' }}>◎ 0.05 SOL</div>
                </div>
              </div>
              <button 
                onClick={() => handleBuyWithCrypto('SOL', 0.05, 'Auto-Tap Bot')}
                style={{ background: '#9945FF', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '25px', fontWeight: 'bold', cursor: 'pointer' }}>
                Buy
              </button>
            </div>

            {/* Pay with GFT Example */}
            <div style={{ background: 'linear-gradient(45deg, #3a2e00, #1a1500)', border: '1px solid #ffd700', borderRadius: '15px', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ fontSize: '32px' }}>🎁</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '16px' }}>Gift Multiplier</div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Permanent 2x Shard Yield</div>
                  <div style={{ color: '#ffd700', fontSize: '14px', fontWeight: 'bold', marginTop: '6px' }}>10,000 GFT</div>
                </div>
              </div>
              <button 
                onClick={() => handleBuyWithCrypto('GFT', 10000, 'Gift Multiplier')}
                style={{ background: '#ffd700', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '25px', fontWeight: 'bold', cursor: 'pointer' }}>
                Buy
              </button>
            </div>

            {/* NFT Utility Example (Read-Only) */}
            <div style={{ background: '#111', border: '1px dashed #4ade80', borderRadius: '15px', padding: '20px', marginTop: '10px' }}>
              <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>🖼️ NFT Holder Bonus</div>
              <div style={{ color: '#888', fontSize: '12px', marginBottom: '15px' }}>
                Hold a <strong>Gift Founder NFT</strong> in your connected wallet to automatically receive +5 Tap Power and +2000 Max Energy.
              </div>
              <button 
                onClick={() => alert('Will scan wallet for NFT Collection Address...')}
                style={{ width: '100%', background: 'transparent', color: '#4ade80', border: '1px solid #4ade80', padding: '10px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                Scan Wallet for NFT
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default Store;
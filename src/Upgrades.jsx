import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const Marketplace = ({ balance, setBalance, stats, setStats, tgUser, playerWallet }) => {
  const [activeTab, setActiveTab] = useState('market'); 
  const [marketFilter, setMarketFilter] = useState('All'); 

  // Custom Pop-up State
  const [txStatus, setTxStatus] = useState({ show: false, loading: false, message: '', success: false });

  // 1. Pull stats securely
  const tapPower = stats?.tap_power || 1;
  const maxDailyLimit = stats?.max_daily_limit || 1000;

  // 2. REGULAR SHARD UPGRADES MATH
  const multitapCost = tapPower * 1000;
  const limitLevel = ((maxDailyLimit - 1000) / 500) + 1; 
  const limitCost = limitLevel * 2000;

  // 3. SHARD BUY FUNCTION
  const handleShardBuy = async (type, cost, bonus) => {
    if (balance < cost) return alert("Not enough Shards!");

    const updates = type === 'power' 
      ? { tap_power: tapPower + bonus, shard_balance: balance - cost }
      : { max_daily_limit: maxDailyLimit + bonus, shard_balance: balance - cost };

    try {
      const { error } = await supabase.from('players').update(updates).eq('telegram_id', String(tgUser.id));
      if (error) throw error;

      setBalance(prev => prev - cost);
      if (type === 'power') setStats({ tap_power: tapPower + bonus, max_daily_limit: maxDailyLimit });
      else setStats({ tap_power: tapPower, max_daily_limit: maxDailyLimit + bonus });
    } catch (err) {
      console.error("Upgrade Error:", err.message);
    }
  };

  // 4. PREMIUM SOL UPGRADES (Placeholder for future NFTs)
  const premiumListings = [
    { id: 1, name: "Permanent 2x Boost", type: "Power", rarity: "Legendary", boost: "Double Shards", price: 0.05, currency: "SOL", image: "🔥" },
    { id: 2, name: "Instant Energy Refill", type: "Energy", rarity: "Uncommon", boost: "Fill to 500", price: 0.005, currency: "SOL", image: "⚡" },
    { id: 3, name: "Daily Limit Breaker", type: "Misc", rarity: "Epic", boost: "+5000 Limit", price: 0.02, currency: "SOL", image: "🚀" }
  ];

  const filteredListings = premiumListings.filter(item => marketFilter === 'All' || item.type === marketFilter);

 // 5. SOLANA TRANSACTION LOGIC
  const handlePremiumBuy = async (item) => {
    // Open the pop-up immediately in a loading state
    setTxStatus({ show: true, loading: true, message: `Initiating purchase for ${item.name}...`, success: false });

    try {
      // 1. Get Secret Key
      const storedSecret = localStorage.getItem(`wallet_secret_${tgUser.id}`);
      if (!storedSecret) {
        throw new Error("Secret key not found. Please unlock your wallet in settings.");
      }

      // 2. Setup Connection
      const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226", 'confirmed');
      const playerKeypair = Keypair.fromSecretKey(bs58.decode(storedSecret));

      // 3. Set Destination Wallets & Costs
      const masterWallet = new PublicKey("D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh"); // <--- Add your Master Wallet here
      const treasuryWallet = new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"); // Your Fee Treasury

      const itemPriceLamports = Math.floor(item.price * 1e9);
      const projectFeeLamports = Math.floor(0.0005 * 1e9); // The 0.0005 SOL Treasury Fee
      const totalRequired = itemPriceLamports + projectFeeLamports + 100000; // Total + buffer for network fee

      // 4. Check Balance
      const currentBalance = await connection.getBalance(playerKeypair.publicKey);
      if (currentBalance < totalRequired) {
        throw new Error(`Insufficient SOL. You need at least ${(totalRequired / 1e9).toFixed(4)} SOL to cover the item and network fees.`);
      }

      setTxStatus({ show: true, loading: true, message: `🔗 Confirming payment of ${item.price} SOL on Solana...`, success: false });

      // 5. Build Split Transaction
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
        // Instruction 1: Send the main purchase price to your Master Wallet
        SystemProgram.transfer({
          fromPubkey: playerKeypair.publicKey,
          toPubkey: masterWallet,
          lamports: itemPriceLamports,
        }),
        // Instruction 2: Send the game fee directly to your Treasury
        SystemProgram.transfer({
          fromPubkey: playerKeypair.publicKey,
          toPubkey: treasuryWallet,
          lamports: projectFeeLamports,
        })
      );

      // 6. Send and Confirm
      const signature = await sendAndConfirmTransaction(connection, transaction, [playerKeypair]);

      // 7. Apply the Item's Effect & Update Database
      let dbUpdates = {};
      
      if (item.name === "Instant Energy Refill") {
        dbUpdates = { last_energy: 500 };
        // Instantly update the screen if the prop is available
        if (typeof setEnergy === 'function') setEnergy(500); 
      } 
      else if (item.name === "Permanent 2x Boost") {
        dbUpdates = { tap_power: tapPower * 2 };
        setStats({ ...stats, tap_power: tapPower * 2 });
      } 
      else if (item.name === "Daily Limit Breaker") {
        dbUpdates = { max_daily_limit: maxDailyLimit + 5000 };
        setStats({ ...stats, max_daily_limit: maxDailyLimit + 5000 });
      }

      // Push the new stats to your Supabase database
      const { error: updateError } = await supabase
        .from('players')
        .update(dbUpdates)
        .eq('telegram_id', String(tgUser.id));

      if (updateError) throw updateError;

      // Show final success message
      setTxStatus({ 
        show: true, 
        loading: false, 
        message: `✅ Success! ${item.name} activated. (Sig: ${signature.slice(0, 8)}...)`, 
        success: true 
      });

      // Auto-close the pop-up after 3 seconds
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 3000);

      // (Optional: Future code goes here to update the database to actually grant the item to their Backpack)

    } catch (err) {
      console.error("Purchase Error:", err);
      setTxStatus({ show: true, loading: false, message: `❌ Error: ${err.message}`, success: false });
    }
  };

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '15px', paddingBottom: '120px', boxSizing: 'border-box' }}>
      
      {/* --- CUSTOM POP-UP MODAL --- */}
      {txStatus.show && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1c1e22', padding: '25px', borderRadius: '15px', border: txStatus.success ? '2px solid #4ade80' : '2px solid #ffd700', textAlign: 'center', width: '80%', maxWidth: '320px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
            
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '15px' }}>
              {txStatus.loading ? '⚙️ Processing...' : txStatus.success ? '🎉 Complete!' : '⚠️ Notice'}
            </h3>
            
            <p style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.4', marginBottom: '25px', wordBreak: 'break-word' }}>
              {txStatus.message}
            </p>
            
            {/* Only show the close button if it's done loading */}
            {!txStatus.loading && (
              <button 
                onClick={() => setTxStatus({ ...txStatus, show: false })} 
                style={{ width: '100%', background: '#333', color: '#fff', border: '1px solid #555', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#ffd700', fontSize: '24px', margin: '0 0 5px 0' }}>Gift Shop</h2>
        <div style={{ color: '#888', fontSize: '14px', fontWeight: 'bold' }}>💎 {balance.toLocaleString()} GFTshards</div>
      </div>

      {/* Main Navigation Tabs */}
      <div style={{ display: 'flex', background: '#111', borderRadius: '12px', padding: '5px', marginBottom: '15px', fontSize: '12px' }}>
        <button onClick={() => setActiveTab('upgrades')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'upgrades' ? '#4ade80' : 'transparent', color: activeTab === 'upgrades' ? '#000' : '#888', fontWeight: 'bold' }}>Upgrades</button>
        <button onClick={() => setActiveTab('market')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'market' ? '#fbef43' : 'transparent', color: activeTab === 'market' ? '#000' : '#888', fontWeight: 'bold' }}>Premium</button>
        <button onClick={() => setActiveTab('inventory')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'inventory' ? '#9945FF' : 'transparent', color: activeTab === 'inventory' ? '#fff' : '#888', fontWeight: 'bold' }}>Backpack</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        
        {/* --- TAB 1: REGULAR SHARD UPGRADES --- */}
        {activeTab === 'upgrades' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ background: '#1c1e22', borderRadius: '15px', padding: '15px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', color: '#ffd700', fontSize: '16px' }}>Multitap</h3>
                <p style={{ margin: 0, color: '#888', fontSize: '12px' }}>Increase shards per tap</p>
                <span style={{ color: '#528db0', fontSize: '12px', fontWeight: 'bold' }}>Level {tapPower} (+1/tap)</span>
              </div>
              <button 
                style={{ background: balance >= multitapCost ? '#ffd700' : '#333', color: balance >= multitapCost ? '#000' : '#666', border: 'none', padding: '10px 15px', borderRadius: '10px', fontWeight: 'bold', cursor: balance >= multitapCost ? 'pointer' : 'not-allowed' }}
                onClick={() => handleShardBuy('power', multitapCost, 1)}
                disabled={balance < multitapCost}
              >
                {multitapCost.toLocaleString()} 💎
              </button>
            </div>

            <div style={{ background: '#1c1e22', borderRadius: '15px', padding: '15px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', color: '#ffd700', fontSize: '16px' }}>Daily Limit</h3>
                <p style={{ margin: 0, color: '#888', fontSize: '12px' }}>More taps per day</p>
                <span style={{ color: '#528db0', fontSize: '12px', fontWeight: 'bold' }}>Level {limitLevel} (+500 limit)</span>
              </div>
              <button 
                style={{ background: balance >= limitCost ? '#ffd700' : '#333', color: balance >= limitCost ? '#000' : '#666', border: 'none', padding: '10px 15px', borderRadius: '10px', fontWeight: 'bold', cursor: balance >= limitCost ? 'pointer' : 'not-allowed' }}
                onClick={() => handleShardBuy('limit', limitCost, 500)}
                disabled={balance < limitCost}
              >
                {limitCost.toLocaleString()} 💎
              </button>
            </div>
          </div>
        )}

        {/* --- TAB 2: PREMIUM SOL UPGRADES --- */}
        {activeTab === 'market' && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
              {['All', 'Power', 'Energy', 'Misc'].map(filter => (
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {filteredListings.map((item) => (
                <div key={item.id} style={{ background: '#111', border: item.rarity === 'Legendary' ? '1px solid #ffd700' : item.rarity === 'Epic' ? '1px solid #9945FF' : '1px solid #333', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  
                  <div style={{ fontSize: '40px', background: '#222', width: '100%', borderRadius: '8px', padding: '15px 0', marginBottom: '10px' }}>
                    {item.image}
                  </div>
                  
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                  <div style={{ color: item.rarity === 'Legendary' ? '#ffd700' : '#4ade80', fontSize: '11px', marginTop: '2px', fontWeight: 'bold' }}>
                    {item.boost}
                  </div>

                  <div style={{ width: '100%', marginTop: '10px', borderTop: '1px solid #222', paddingTop: '10px' }}>
                    <div style={{ color: '#14F195', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>
                      {item.price} {item.currency}
                    </div>
                    <button 
                      onClick={() => handlePremiumBuy(item)}
                      style={{ width: '100%', background: '#9945FF', color: '#fff', border: 'none', padding: '6px 0', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                    >
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
            <p style={{ fontSize: '12px' }}>Your purchased NFTs and premium boosts will appear here.</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default Marketplace;
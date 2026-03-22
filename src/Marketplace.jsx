import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

const Marketplace = ({ balance, setBalance, stats, setStats, setEnergy, tgUser, playerWallet }) => {
  const [activeTab, setActiveTab] = useState('market'); 
  const [marketFilter, setMarketFilter] = useState('All'); 
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToBuy, setItemToBuy] = useState(null);

  // Custom Pop-up State
  const [txStatus, setTxStatus] = useState({ show: false, loading: false, message: '', success: false });

  // Initialize local inventory from stats so the UI updates instantly
  const [localInventory, setLocalInventory] = useState(stats?.inventory || {});

  // Update local inventory if stats change from the parent
  useEffect(() => {
    if (stats?.inventory) setLocalInventory(stats.inventory);
  }, [stats?.inventory]);

  // --- ITEM DEFINITIONS ---
  const shardListings = [
    { id: 'frenzy', name: "90-Second Frenzy", desc: "2x Payout per energy", duration: "90 Seconds", cost: 600, icon: "🔥" },
    { id: 'battery', name: "Expanded Battery", desc: "+1,000 Max Energy", duration: "24 Hours", cost: 750, icon: "🔋" },
    { id: 'heavy', name: "Heavy Hands", desc: "2x Efficiency (Drains 2x, Pays 2x)", duration: "24 Hours", cost: 750, icon: "🥊" },
    { id: 'refill', name: "Instant Refill", desc: "Fills energy to max", duration: "Instant", cost: 300, icon: "⚡" }
  ];

  const premiumListings = [
    { id: 'bot', name: "Weekend Bot", type: "Misc", rarity: "Epic", boost: "Auto-tap max limits", duration: "3 Days", price: 0.01, currency: "SOL", image: "🤖" },
    { id: 'grinder', name: "Grinder's Contract", type: "Power", rarity: "Rare", boost: "2,000 Daily Limit", duration: "7 Days", price: 0.01, currency: "SOL", image: "📜" },
    { id: 'whale', name: "Whale's Contract", type: "Power", rarity: "Legendary", boost: "5,000 Daily Limit", duration: "7 Days", price: 0.03, currency: "SOL", image: "🐳" },
    { id: 'crate', name: "The Vault Drop", type: "Misc", rarity: "Legendary", boost: "+50,000 Shards", duration: "Instant", price: 0.05, currency: "SOL", image: "💎" },
    { id: 'x2_boost', name: "Double Power", type: "Power", rarity: "Epic", boost: "2x Shards", duration: "7 Days", price: 0.0125, currency: "SOL", image: "🔥" },
    { id: 'x3_boost', name: "Triple Power", type: "Power", rarity: "Legendary", boost: "3x Shards", duration: "7 Days", price: 0.025, currency: "SOL", image: "🚀" }
  ];

  const allItems = [...shardListings, ...premiumListings];
  const filteredListings = premiumListings.filter(item => marketFilter === 'All' || item.type === marketFilter);

  // --- 1. BUYING WITH SHARDS (Goes to Backpack) ---
  const handleShardBuy = async (item) => {
    if (balance < item.cost) {
      setTxStatus({ show: true, loading: false, message: "❌ Not enough Shards!", success: false });
      return;
    }

    setTxStatus({ show: true, loading: true, message: `Purchasing ${item.name}...`, success: false });

    // Copy current inventory and add 1
    const newInventory = { ...localInventory };
    newInventory[item.id] = (newInventory[item.id] || 0) + 1;

    try {
      const { error } = await supabase.from('players')
        .update({ shard_balance: balance - item.cost, inventory: newInventory })
        .eq('telegram_id', String(tgUser.id));
        
      if (error) throw error;

      setBalance(prev => prev - item.cost);
      setLocalInventory(newInventory);
      if (setStats) setStats({ ...stats, inventory: newInventory }); // Keep parent in sync

      setTxStatus({ show: true, loading: false, message: `✅ ${item.name} added to Backpack!`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 2000);

    } catch (err) {
      console.error("Purchase Error:", err.message);
      setTxStatus({ show: true, loading: false, message: "❌ Failed to process purchase.", success: false });
    }
  };

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

      // 2. Setup Connection & Keypair
      const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226", 'confirmed');
      
      let playerKeypair;
      if (storedSecret.includes(" ")) {
        // --- NEW FORMAT: Translate 12-word mnemonic to Keypair ---
        const seed = bip39.mnemonicToSeedSync(storedSecret);
        const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
        playerKeypair = Keypair.fromSeed(derivedSeed);
      } else {
        // --- LEGACY FORMAT: Base58 string ---
        playerKeypair = Keypair.fromSecretKey(bs58.decode(storedSecret));
      }

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

      // Database Update: Add to JSON Inventory
      const newInventory = { ...localInventory };
      newInventory[item.id] = (newInventory[item.id] || 0) + 1;

      const { error: updateError } = await supabase.from('players')
        .update({ inventory: newInventory })
        .eq('telegram_id', String(tgUser.id));
        
      if (updateError) throw updateError;

      setLocalInventory(newInventory);
      if (setStats) setStats({ ...stats, inventory: newInventory });

      setTxStatus({ show: true, loading: false, message: `✅ Success! ${item.name} added to Backpack.`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 3000);

    } catch (err) {
      console.error("Purchase Error:", err);
      setTxStatus({ show: true, loading: false, message: `❌ Error: ${err.message}`, success: false });
    }
  };

  // --- 3. USING ITEMS FROM THE BACKPACK (Starts the Clock) ---
  const handleUseItem = async (item) => {
    if (!localInventory[item.id] || localInventory[item.id] <= 0) return;

    setTxStatus({ show: true, loading: true, message: `Activating ${item.name}...`, success: false });

    // 1. Deduct from inventory
    const newInventory = { ...localInventory };
    newInventory[item.id] -= 1;
    if (newInventory[item.id] === 0) delete newInventory[item.id]; // Clean up empty items

    // 2. Set Expiration Timers
    const now = Date.now();
    let dbUpdates = { inventory: newInventory };

    // Shard Items
    // Calculate exact local midnight for tonight
    const midnightTonight = new Date();
    midnightTonight.setHours(23, 59, 59, 999);

    // Shard Items
    if (item.id === 'frenzy') dbUpdates.frenzy_expires = new Date(now + 90 * 1000).toISOString();
    
    // Battery and Heavy Hands now expire at exactly 11:59 PM tonight
    if (item.id === 'battery') dbUpdates.energy_boost_expires = midnightTonight.toISOString();
    if (item.id === 'heavy') dbUpdates.efficiency_expires = midnightTonight.toISOString();
    if (item.id === 'refill') {
      dbUpdates.last_energy = 1000;
      if (setEnergy) setEnergy(1000);
    }
    
    // Premium SOL Items
    // Premium SOL Items
    if (item.id === 'bot') {
      const botExpire = new Date();
      botExpire.setHours(23, 59, 59, 999);
      botExpire.setDate(botExpire.getDate() + 2); // Today (1) + 2 days = 3 calendar days
      dbUpdates.bot_expires = botExpire.toISOString();
    }

    // 7-Day items snap to exactly 11:59 PM on the 7th day
    const sevenDayExpire = new Date();
    sevenDayExpire.setHours(23, 59, 59, 999);
    sevenDayExpire.setDate(sevenDayExpire.getDate() + 6); // Today (1) + 6 days = 7 calendar days

    if (item.id === 'grinder') {
      dbUpdates.limit_boost_amount = 2000;
      dbUpdates.limit_boost_expires = sevenDayExpire.toISOString();
    }
    if (item.id === 'whale') {
      dbUpdates.limit_boost_amount = 5000;
      dbUpdates.limit_boost_expires = sevenDayExpire.toISOString();
    }
    if (item.id === 'crate') {
      dbUpdates.shard_balance = balance + 50000;
      setBalance(prev => prev + 50000); // Instant, no timer needed
    }
    if (item.id === 'x2_boost') {
      dbUpdates.premium_multiplier = 2;
      dbUpdates.premium_multiplier_expires = sevenDayExpire.toISOString();
    }
    if (item.id === 'x3_boost') {
      dbUpdates.premium_multiplier = 3;
      dbUpdates.premium_multiplier_expires = sevenDayExpire.toISOString();
    }

    try {
      const { error } = await supabase.from('players').update(dbUpdates).eq('telegram_id', String(tgUser.id));
      if (error) throw error;

      setLocalInventory(newInventory);
      if (setStats) setStats({ ...stats, inventory: newInventory });

      setTxStatus({ show: true, loading: false, message: `⚡ ${item.name} is now ACTIVE!`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 2000);

    } catch (err) {
      console.error("Activation Error:", err.message);
      setTxStatus({ show: true, loading: false, message: "❌ Failed to activate item.", success: false });
    }
  };

  // --- CALCULATE TOTAL BACKPACK ITEMS ---
  const backpackItemCount = Object.values(localInventory || {}).reduce((total, qty) => total + Number(qty), 0);

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
            {!txStatus.loading && (
              <button onClick={() => setTxStatus({ ...txStatus, show: false })} style={{ width: '100%', background: '#333', color: '#fff', border: '1px solid #555', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
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
        <button onClick={() => setActiveTab('upgrades')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'upgrades' ? '#4ade80' : 'transparent', color: activeTab === 'upgrades' ? '#000' : '#888', fontWeight: 'bold' }}>Shards</button>
        <button onClick={() => setActiveTab('market')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'market' ? '#fbef43' : 'transparent', color: activeTab === 'market' ? '#000' : '#888', fontWeight: 'bold' }}>Premium (SOL)</button>
        <button onClick={() => setActiveTab('inventory')} style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', background: activeTab === 'inventory' ? '#9945FF' : 'transparent', color: activeTab === 'inventory' ? '#fff' : '#888', fontWeight: 'bold' }}>
          Backpack {backpackItemCount > 0 && <span style={{ color: activeTab === 'inventory' ? '#fff' : '#4ade80', marginLeft: '4px' }}>({backpackItemCount})</span>}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        
        {/* --- TAB 1: SHARD SHOP --- */}
        {activeTab === 'upgrades' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {shardListings.map(item => (
              <div key={item.id} style={{ background: '#1c1e22', borderRadius: '15px', padding: '15px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '18px' }}>{item.icon}</span>
                    <h3 style={{ margin: 0, color: '#ffd700', fontSize: '16px' }}>{item.name}</h3>
                  </div>
                  <p style={{ margin: '0 0 4px 0', color: '#ccc', fontSize: '12px' }}>{item.desc}</p>
                  <span style={{ color: '#528db0', fontSize: '11px', fontWeight: 'bold' }}>⏱️ {item.duration}</span>
                </div>
                <button 
                  style={{ background: balance >= item.cost ? '#ffd700' : '#333', color: balance >= item.cost ? '#000' : '#666', border: 'none', padding: '10px 15px', borderRadius: '10px', fontWeight: 'bold', cursor: balance >= item.cost ? 'pointer' : 'not-allowed', marginLeft: '10px' }}
                  onClick={() => {
                    setItemToBuy(item); // Load the item into state
                    setShowConfirmModal(true); // Open the pop-up
                  }}
                >
                  {item.price ? 'Buy' : item.cost}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* --- TAB 2: PREMIUM SOL SHOP --- */}
        {activeTab === 'market' && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
              {['All', 'Power', 'Misc'].map(filter => (
                <button 
                  key={filter}
                  onClick={() => setMarketFilter(filter)}
                  style={{ 
                    padding: '6px 16px', borderRadius: '20px', border: '1px solid #333', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap',
                    background: marketFilter === filter ? '#fff' : '#111', color: marketFilter === filter ? '#000' : '#888' 
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
                    {item.boost} <br/> <span style={{color: '#888', fontSize: '9px'}}>⏱️ {item.duration}</span>
                  </div>

                  <div style={{ width: '100%', marginTop: '10px', borderTop: '1px solid #222', paddingTop: '10px' }}>
                    <div style={{ color: '#14F195', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>
                      {item.price} {item.currency}
                    </div>
                    <button 
                      onClick={() => {
                        setItemToBuy(item); // Load the item into state
                        setShowConfirmModal(true); // Open the pop-up
                      }}
                      style={{ width: '100%', background: '#9945FF', color: '#fff', border: 'none', padding: '6px 0', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                    >
                      {item.price ? 'Buy' : item.cost}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* --- TAB 3: THE BACKPACK --- */}
        {activeTab === 'inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.keys(localInventory).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎒</div>
                <h3 style={{ color: '#fff', margin: '0 0 10px 0' }}>Backpack is Empty</h3>
                <p style={{ fontSize: '12px' }}>Visit the shop to purchase boosts and gear.</p>
              </div>
            ) : (
              allItems.filter(item => localInventory[item.id] > 0).map(item => (
                <div key={item.id} style={{ background: '#1c1e22', borderRadius: '15px', padding: '15px', border: '1px solid #9945FF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      <span style={{ fontSize: '18px' }}>{item.icon || item.image}</span>
                      <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>{item.name}</h3>
                    </div>
                    <span style={{ color: '#888', fontSize: '11px', fontWeight: 'bold' }}>Owned: {localInventory[item.id]}</span>
                  </div>
                  <button 
                    style={{ background: '#9945FF', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', marginLeft: '10px' }}
                    onClick={() => handleUseItem(item)}
                  >
                    USE
                  </button>
                </div>
              ))
            )}
          </div>
        )}

      </div>

      {/* --- ADD THIS AT THE BOTTOM OF MARKETPLACE.JSX --- */}
      {showConfirmModal && itemToBuy && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1c1e22', padding: '25px', borderRadius: '15px', border: '2px solid #ffd700', textAlign: 'center', width: '80%', maxWidth: '320px' }}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Confirm Purchase?</h3>
            <p style={{ color: '#ccc', fontSize: '14px' }}>Do you want to buy <strong>{itemToBuy.name}</strong>?</p>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button 
                onClick={() => setShowConfirmModal(false)} 
                style={{ flex: 1, padding: '12px', background: '#333', color: '#fff', borderRadius: '10px', border: 'none', fontWeight: 'bold' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setShowConfirmModal(false);
                  if (itemToBuy.price) {
                    handlePremiumBuy(itemToBuy); // Triggers SOL transaction
                  } else {
                    handleShardBuy(itemToBuy); // Triggers Shard purchase
                  }
                }} 
                style={{ flex: 1, padding: '12px', background: '#4ade80', color: '#000', borderRadius: '10px', border: 'none', fontWeight: 'bold' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Marketplace;
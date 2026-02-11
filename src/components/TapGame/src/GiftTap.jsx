import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer;
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Connection, PublicKey, clusterApiUrl, Transaction, SystemProgram } from '@solana/web3.js';
import { supabase } from './supabaseClient';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

const GiftTapGame = () => {
  // 1. GAME STATE
  const [balance, setBalance] = useState(0);
  const [energy, setEnergy] = useState(1000);
  const [taps, setTaps] = useState([]);
  const [playerWallet, setPlayerWallet] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 2. GET TELEGRAM USER DATA
  const tgUser = useMemo(() => {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || { id: "test_local_user" };
  }, []);

  // 3. LOAD DATA OR CREATE WALLET
  const syncPlayer = useCallback(async () => {
    setIsLoading(true);
    try {
      // First, try to find existing player in Supabase
      const { data: player, error } = await supabase
        .from('players')
        .select('*')
        .eq('telegram_id', tgUser.id) // Assuming you added a telegram_id column
        .single();

      if (player) {
        setPlayerWallet(player.wallet_address);
        setBalance(Number(player.shard_balance)); // Ensure it's a number
        
        // Energy Recovery Calculation
        const lastDate = new Date(player.last_updated).getTime();
        const now = new Date().getTime();
        const secondsPassed = Math.floor((now - lastDate) / 1000);
        const recovered = Math.floor(secondsPassed / 1.5);
        
        setEnergy(Math.min(player.last_energy + recovered, 1000));
        setIsDataLoaded(true); // LOCK OPEN: We have the real data now
      } else {
        // CALL YOUR NEW EDGE FUNCTION TO CREATE WALLET
        const { data, error: functionError } = await supabase.functions.invoke('create-user-wallet', {
          body: { telegram_id: tgUser.id }
        });

        setPlayerWallet(data.publicKey);
        setBalance(0);
        setEnergy(1000);
        setIsDataLoaded(true); // NEW PLAYER: Start at 0/1000
      }
    } catch (err) {
      console.error("Sync Error:", err.message);
    } finally {
      setIsLoading(false);
    }
  }, [tgUser]);

  useEffect(() => {
    syncPlayer();
  }, [syncPlayer]);

  // --- ENERGY TICKER ---
  useEffect(() => {
    const ticker = setInterval(() => {
      setEnergy((prev) => (prev < 1000 ? prev + 1 : 1000));
    }, 1500);
    return () => clearInterval(ticker);
  }, []);

  // --- SAVE PROGRESS ---
  const saveProgress = useCallback(async () => {
    if (!isDataLoaded || !playerWallet) return;

    const channel = supabase
      .channel('realtime_players')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `wallet_address=eq.${playerWallet}`, 
        },
        (payload) => {
          // This updates your laptop when you tap on your phone
          setBalance(Number(payload.new.shard_balance));
          setEnergy(payload.new.last_energy);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [playerWallet]);

  // 2. Throttled Instant Save Function
  const saveToDatabase = async (b, e) => {
    // Clear any existing timer to restart the "wait"
    clearTimeout(window.saveTimeout);

    window.saveTimeout = setTimeout(async () => {
      console.log("🚀 Attempting to save...", { b, e });

      const { data, error } = await supabase
        .from('players')
        .upsert({
          wallet_address: playerWallet,
          telegram_id: tgUser.id,
          shard_balance: b,
          last_energy: e,
          last_updated: new Date().toISOString()
        }, { onConflict: 'wallet_address' }); // THIS IS CRITICAL

      if (error) {
        console.error("❌ Save failed:", error.message);
        // If it fails, try a simple update as fallback
        await supabase.from('players').update({ shard_balance: b }).eq('wallet_address', playerWallet);
      } else {
        console.log("✅ Saved successfully!");
      }
    }, 1000); // Wait 1 second after last tap
  };

  useEffect(() => {
    const interval = setInterval(saveProgress, 15000);
    return () => clearInterval(interval);
  }, [saveProgress]);

  // --- GAMEPLAY ---
  const handleTap = (e) => {
    if (energy <= 0 || !isDataLoaded) return;
    
    const nextBalance = balance + 1;
    const nextEnergy = energy - 1;

    setBalance(nextBalance);
    setEnergy(nextEnergy);
    
    // Trigger the instant (throttled) save
    saveToDatabase(nextBalance, nextEnergy);
    
    const id = Date.now();
    setTaps(t => [...t, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setTaps(t => t.filter(tap => tap.id !== id)), 1000);
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [balances, setBalances] = useState({ sol: 0, gft: 0, usdc: 0 });

  // Use your existing connection logic
  const connection = useMemo(() => new Connection(clusterApiUrl('mainnet-beta')), []);

  const fetchBalances = useCallback(async () => {
    if (!playerWallet) return;
    try {
      const pubKey = new PublicKey(playerWallet);
      
      // 1. Fetch SOL
      const solBalance = await connection.getBalance(pubKey);
      
      // 2. Fetch GFT & USDC (Using their Mint Addresses)
      // Replace with your actual GFT Mint: 3UL9MdHnmtAh6KBdDwLtyxFWVEgGQHLiwN2cg3FPWEis
      const gftMint = new PublicKey("");
      const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

      // Helper to get token balance safely
      const getTokenBal = async (mint) => {
        try {
          const ata = getAssociatedTokenAddressSync(mint, pubKey);
          const bal = await connection.getTokenAccountBalance(ata);
          return bal.value.uiAmount || 0;
        } catch { return 0; }
      };

      setBalances({
        sol: solBalance / 1e9,
        gft: await getTokenBal(gftMint),
        usdc: await getTokenBal(usdcMint)
      });
    } catch (err) {
      console.error("Balance fetch failed", err);
    }
  }, [playerWallet, connection]);

  if (isLoading) return <div style={styles.container}>Loading Gift...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.walletWrapper}>
        <button 
          onClick={() => { setIsModalOpen(true); fetchBalances(); }} 
          style={styles.walletBtn}
        >
          {playerWallet?.slice(0, 4)}...{playerWallet?.slice(-4)}
        </button>
      </div>

      <div style={styles.header}>
        <h1 style={styles.balance}>{balance} GFTshards</h1>
        <p style={styles.energy}>⚡ {energy} / 1000</p>
      </div>

      <div onClick={handleTap} style={styles.giftZone}>
        <img 
          src="/Gift2u_logo.png" 
          alt="Gift" 
          style={{ ...styles.giftImage, filter: energy <= 0 ? 'grayscale(1)' : 'none' }} 
        />
        {taps.map(t => (
          <span key={t.id} style={{ ...styles.floatingText, left: t.x, top: t.y }}>+1</span>
        ))}
      </div>

      <div style={styles.nav}>
        <button style={styles.btn}>Tasks</button>
        <button style={styles.btn}>Friends</button>
        <button style={styles.btn}>Boost</button>
      </div>

      {isModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3>Wallet Dashboard</h3>
            <div style={styles.balanceRow}><span>SOL:</span> <span>{balances.sol.toFixed(4)}</span></div>
            <div style={styles.balanceRow}><span>GFT:</span> <span>{balances.gft.toLocaleString()}</span></div>
            <div style={styles.balanceRow}><span>GFT Shards:</span> <span>{balance.toLocaleString()}</span></div>
            <div style={styles.balanceRow}><span>USDC:</span> <span>${balances.usdc.toFixed(2)}</span></div>
            
            <div style={styles.actionRow}>
              <button style={styles.actionBtn}>Withdraw</button>
              <button style={styles.actionBtn}>Swap</button>
            </div>
            
            <button onClick={() => setIsModalOpen(false)} style={styles.closeBtn}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ... keep your styles the same ...

const styles = {
  container: { position: 'fixed', top: 0, left: 0, height: '100%', width: '100%', background: '#1a1a1a', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', touchAction: 'manipulation' },
  walletWrapper: { padding: '20px', width: '100%', display: 'flex', justifyContent: 'flex-end' },
  loginBtn: { background: '#ffd700', color: 'black', border: 'none', padding: '10px 20px', borderRadius: '20px', fontWeight: 'bold' },
  walletText: { color: '#ffd700', fontWeight: 'bold' },
  header: { marginTop: '10px', textAlign: 'center' },
  balance: { fontSize: '2.5rem', color: '#ffd700', margin: 0 },
  energy: { color: '#ffd700', fontWeight: 'bold' },
  giftZone: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', position: 'relative' },
  giftImage: { width: '220px', userSelect: 'none' },
  floatingText: { position: 'fixed', color: '#ffd700', fontSize: '2rem', fontWeight: 'bold', pointerEvents: 'none', animation: 'floatUp 1s forwards', zIndex: 999 },
  nav: { height: '80px', width: '100%', display: 'flex', justifyContent: 'space-around', background: '#333', borderTop: '2px solid #ffd700' },
  btn: { background: 'none', border: 'none', color: 'white', fontWeight: 'bold' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { background: '#222', padding: '25px', borderRadius: '15px', width: '85%', maxWidth: '400px', border: '2px solid #ffd700', textAlign: 'center' },
  balanceRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #333' },
  actionRow: { display: 'flex', gap: '10px', marginTop: '20px' },
  actionBtn: { flex: 1, padding: '12px', borderRadius: '10px', background: '#ffd700', color: '#000', fontWeight: 'bold', border: 'none' },
  closeBtn: { marginTop: '20px', background: 'none', color: '#888', border: 'none', cursor: 'pointer' },
  walletBtn: { background: 'rgba(255, 215, 0, 0.1)', color: '#ffd700', border: '1px solid #ffd700', padding: '8px 15px', borderRadius: '20px', fontWeight: 'bold' }
};

export default GiftTapGame;
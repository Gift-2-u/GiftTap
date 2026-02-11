import { useState, useEffect, useCallback, useMemo } from 'react';
import { clusterApiUrl } from '@solana/web3.js';
import { supabase } from './supabaseClient';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';

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
  const saveToDatabase = useCallback((newB, newE) => {
    clearTimeout(window.saveTimer);
    window.saveTimer = setTimeout(async () => {
      await supabase.from('players').upsert({
        wallet_address: playerWallet,
        telegram_id: tgUser.id,
        shard_balance: newB,
        last_energy: newE,
        last_updated: new Date().toISOString()
      }, { onConflict: 'wallet_address' });
    }, 500); // Saves 0.5s after you STOP tapping
  }, [balance, energy, playerWallet, tgUser, isDataLoaded]);

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

  if (isLoading) return <div style={styles.container}>Loading Gift...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.walletWrapper}>
        <p style={styles.walletText}>{playerWallet?.slice(0, 6)}...</p>
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
  btn: { background: 'none', border: 'none', color: 'white', fontWeight: 'bold' }
};

export default GiftTapGame;
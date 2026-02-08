import { useState, useEffect, useCallback, useMemo } from 'react';
import { clusterApiUrl } from '@solana/web3.js';
import { supabase } from './supabaseClient';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';

// ROOT WRAPPER
const RootGame = () => {
  const solanaConnectors = useMemo(() => toSolanaWalletConnectors({
    shouldAutoConnect: true,
  }), []);

  return (
    <PrivyProvider
      appId="cmle2m75i01dfl20c1n5qfafa" // CHANGE THIS to your actual ID from dashboard.privy.io
      config={{
        loginMethods: ['telegram', 'google', 'wallet'],
        appearance: { 
          theme: 'dark',
          accentColor: '#ffd700',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        solanaClusters: [{ name: 'mainnet-beta' }],
      }}
      externalWallets={{ solana: solanaConnectors }}
    >
      <GiftTapGame />
    </PrivyProvider>
  );
};

const GiftTapGame = () => {
  const { login, authenticated, user, ready } = usePrivy();
  const { wallets } = useWallets(); // Privy's way to access wallets
  
  const [balance, setBalance] = useState(0);
  const [energy, setEnergy] = useState(1000);
  const [taps, setTaps] = useState([]);

  // Find the active wallet address
  const activeWallet = useMemo(() => {
    return wallets.find((w) => w.walletClientType === 'privy' && w.chainType === 'solana') 
           || wallets.find(w => w.chainType === 'solana');
  }, [wallets]);

  // --- TELEGRAM SDK INITIALIZATION ---
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand(); // Opens the game to full height automatically
    }
  }, []);

  // --- REAL-TIME ENERGY TICKER ---
  useEffect(() => {
    const ticker = setInterval(() => {
      setEnergy((prev) => (prev < 1000 ? prev + 1 : 1000));
    }, 1500);
    return () => clearInterval(ticker);
  }, []);

  // --- DATA SYNC WITH SUPABASE ---
  const loadUserData = useCallback(async () => {
    if (!activeWallet) return;
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('wallet_address', activeWallet.address)
      .single();

    if (data) {
      setBalance(data.shard_balance);
      const seconds = Math.floor((new Date() - new Date(data.last_updated)) / 1000);
      setEnergy(Math.min(data.last_energy + Math.floor(seconds / 1.5), 1000));
    }
  }, [activeWallet]);

  useEffect(() => {
    if (authenticated && activeWallet) loadUserData();
  }, [authenticated, activeWallet, loadUserData]);

  const saveProgress = useCallback(async () => {
    if (!activeWallet) return;
    await supabase.from('players').upsert({
      wallet_address: activeWallet.address,
      shard_balance: balance,
      last_energy: energy,
      last_updated: new Date().toISOString()
    });
  }, [balance, energy, activeWallet]);

  // Auto-save logic
  useEffect(() => {
    const handleSave = () => { if (document.visibilityState === 'hidden') saveProgress(); };
    window.addEventListener('visibilitychange', handleSave);
    const interval = setInterval(saveProgress, 15000);
    return () => {
      window.removeEventListener('visibilitychange', handleSave);
      clearInterval(interval);
    };
  }, [saveProgress]);

  // --- GAMEPLAY ---
  const handleTap = (e) => {
    if (!authenticated) { login(); return; }
    if (energy <= 0) return;
    
    setBalance(b => b + 1);
    setEnergy(e => e - 1);
    
    const id = Date.now();
    setTaps(t => [...t, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setTaps(t => t.filter(tap => tap.id !== id)), 1000);
  };

  if (!ready) return <div style={styles.container}>Loading...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.walletWrapper}>
        {!authenticated ? (
          <button style={styles.loginBtn} onClick={login}>Connect Wallet</button>
        ) : (
          <p style={styles.walletText}>{activeWallet?.address.slice(0, 6)}...</p>
        )}
      </div>

      <div style={styles.header}>
        <h1 style={styles.balance}>{balance} GFTshards</h1>
        <p style={styles.energy}>⚡ {energy} / 1000</p>
      </div>

      <div onClick={handleTap} style={styles.giftZone}>
        <img src="/Gift2u_logo.png" alt="Gift" style={{ ...styles.giftImage, filter: energy <= 0 ? 'grayscale(1)' : 'none' }} />
        {taps.map(t => <span key={t.id} style={{ ...styles.floatingText, left: t.x, top: t.y }}>+1</span>)}
      </div>

      <div style={styles.nav}>
        <button style={styles.btn}>Tasks</button>
        <button style={styles.btn}>Friends</button>
        <button style={styles.btn}>Boost</button>
      </div>
    </div>
  );
};

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

export default RootGame;
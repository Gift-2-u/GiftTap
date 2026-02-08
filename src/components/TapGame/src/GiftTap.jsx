import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet, ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletMultiButton, WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { supabase } from './supabaseClient';
import '@solana/wallet-adapter-react-ui/styles.css';

// ROOT WRAPPER
const RootGame = () => {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(() => [], []); // Auto-detects ALL wallets

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <GiftTapGame />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

const GiftTapGame = () => {
  const [balance, setBalance] = useState(0);
  const [energy, setEnergy] = useState(1000);
  const [taps, setTaps] = useState([]);
  const { publicKey, connected, connect, select, wallets } = useWallet();

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

  // --- DATA SYNC ---
  const loadUserData = useCallback(async () => {
    if (!publicKey) return;
    const { data } = await supabase.from('players').select('*').eq('wallet_address', publicKey.toBase58()).single();
    if (data) {
      setBalance(data.shard_balance);
      const seconds = Math.floor((new Date() - new Date(data.last_updated)) / 1000);
      setEnergy(Math.min(data.last_energy + Math.floor(seconds / 1.5), 1000));
    }
  }, [publicKey]);

  useEffect(() => { if (connected && publicKey) loadUserData(); }, [connected, publicKey, loadUserData]);

  const saveProgress = useCallback(async () => {
    if (!publicKey) return;
    await supabase.from('players').upsert({
      wallet_address: publicKey.toBase58(),
      shard_balance: balance,
      last_energy: energy,
      last_updated: new Date().toISOString()
    });
  }, [balance, energy, publicKey]);

  // Save on Visibility Change (Closing TG)
  useEffect(() => {
    const handleSave = () => { if (document.visibilityState === 'hidden') saveProgress(); };
    window.addEventListener('visibilitychange', handleSave);
    const interval = setInterval(saveProgress, 15000);
    return () => { window.removeEventListener('visibilitychange', handleSave); clearInterval(interval); };
  }, [saveProgress]);

  // --- CUSTOM CONNECTION BRIDGE (The "Anti-Friction" fix) ---
  const handleUniversalConnect = async () => {
    if (window.Telegram?.WebApp && /iPhone|Android/i.test(navigator.userAgent)) {
      const dappUrl = window.location.host;
      // We use the Universal Link protocol for Phantom/Solflare
      const link = `https://phantom.app/ul/browse/https://${dappUrl}`;
      window.Telegram.WebApp.openLink(link);
    }
  };

  // --- GAMEPLAY ---
  const handleTap = (e) => {
    if (energy <= 0) return;
    setBalance(b => b + 1);
    setEnergy(e => e - 1);
    const id = Date.now();
    setTaps(t => [...t, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setTaps(t => t.filter(tap => tap.id !== id)), 1000);
  };

  return (
    <div style={styles.container}>
      <div style={styles.walletWrapper}>
        {/* If in TG, show our special button, else show standard */}
        <div onClick={handleUniversalConnect}>
           <WalletMultiButton />
        </div>
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
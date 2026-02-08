import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet, ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletMultiButton, WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { supabase } from './supabaseClient'; // You'll create this file
import { clusterApiUrl } from '@solana/web3.js';
import { SolanaMobileWalletAdapter, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler } from '@solana-mobile/wallet-adapter-mobile';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter,SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

import '@solana/wallet-adapter-react-ui/styles.css';

const RootGame = () => {
  // Use 'mainnet-beta' for real money or 'devnet' for testing
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);
  const wallets = useMemo(
  () => [
    new SolanaMobileWalletAdapter({
      addressSelector: createDefaultAddressSelector(),
      appIdentity: {
        name: 'GiftTap',
        uri: 'https://gift-tap.vercel.app', // MUST match your Vercel URL
        icon: '/Gift2u_logo.png', // Relative to your URI
      },
      authorizationResultCache: createDefaultAuthorizationResultCache(),
      cluster: 'mainnet-beta', // or 'devnet'
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    }),
    // Fallback for standard mobile browsers
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ],
  []
); 

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
  const { publicKey, connected } = useWallet();

  // 1. LOAD DATA: When wallet connects, get shards from Supabase
  useEffect(() => {
    if (connected && publicKey) {
      loadUserData();
    }
  }, [connected, publicKey]);

  const loadUserData = async () => {
    if (!publicKey) return;

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('wallet_address', publicKey.toBase58())
      .single();

    if (data) {
      // 1. For returning players: Load and Calculate
      setBalance(data.shard_balance);
      const restoredEnergy = calculateOfflineToEnergy(data.last_energy, data.last_updated);
      setEnergy(restoredEnergy);
    } else if (error && error.code === 'PGRST116') { 
      // 2. For new players: Create and Initialize locally
      setBalance(0);
      setEnergy(1000);

      await supabase.from('players').insert([
        { 
          wallet_address: publicKey.toBase58(), 
          shard_balance: 0, 
          last_energy: 1000,
          last_updated: new Date().toISOString() 
        }
      ]);
    } else {
      console.error("Supabase error:", error);
    }
  };

  // 2. SAVE DATA: Every 10 seconds or when they tap a lot, update the DB
  const saveProgress = useCallback(async () => {
    if (!publicKey) return;
    await supabase
      .from('players')
      .update({ shard_balance: balance, last_energy: energy, last_updated: new Date() })
      .eq('wallet_address', publicKey.toBase58());
  }, [balance, energy, publicKey]);

  useEffect(() => {
    // Auto-save every 20 seconds
    const interval = setInterval(saveProgress, 20000);

    // CRITICAL: Save when the user closes the tab or app
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProgress();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveProgress]);

  // ... rest of your handleTap logic ...

  const handleTap = (e) => {
    if (energy <= 0) return;

    const { clientX, clientY } = e;
    setBalance(balance + 1);
    setEnergy(energy - 1);
    
    // Add a unique ID for each floating text for React's key prop
    const id = Date.now();
    setTaps([...taps, { id, x: clientX, y: clientY }]);

    // Remove the animation element after 1 second
    setTimeout(() => {
      setTaps((prev) => prev.filter(t => t.id !== id));
    }, 1000);
  };

  const calculateOfflineToEnergy = (lastEnergy, lastUpdated) => {
    const now = new Date();
    const lastUpdate = new Date(lastUpdated);
    
    // Calculate seconds passed since the last save
    const secondsPassed = Math.floor((now - lastUpdate) / 1000);
    
    // You earn 1 energy every 1.5 seconds (based on your current logic)
    const energyGained = Math.floor(secondsPassed / 1.5);
    
    // Return the new energy, capped at 1000
    return Math.min(lastEnergy + energyGained, 1000);
  };

  return (
    <div style={styles.container}>
      {/* 1. Added Wallet Button at the top */}
      <div style={styles.walletWrapper}>
        <WalletMultiButton />
      </div>

      <div style={styles.header}>
        <h1 style={styles.balance}> {balance} GFTshards</h1>
        <p style={styles.energy}>⚡ {energy} / 1000</p>
      </div>

      <div onClick={handleTap} style={styles.giftZone}>
        <img 
          src="/Gift2u_logo.png" 
          alt="Gift" 
          style={{ ...styles.giftImage, transform: energy <= 0 ? 'grayscale(1)' : 'none' }}
        />
        
        {/* Floating +1 Animations */}
        {taps.map(tap => (
          <span key={tap.id} style={{ ...styles.floatingText, left: tap.x, top: tap.y }}>
            +1
          </span>
        ))}
      </div>

      <div style={styles.nav}>
        <button style={styles.btn}>Tasks</button>
        <button style={styles.btn}>Friends</button>
        <button style={styles.btn}>Boost</button>
      </div>

      <div className="game-container">
          <p>Wallet: {publicKey ? publicKey.toBase58().slice(0, 6) : "Not Connected"}...</p>
          {/* Your Gift Icon and Tapping Logic */}
      </div>

    </div>
  );
};

const styles = {
  container: { position: 'fixed', top: 0, left: 0, height: '100%', width: '100%', background: '#1a1a1a', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', touchAction: 'manipulation' },
  walletWrapper: {padding: '20px', width: '100%', display: 'flex', justifyContent: 'flex-end' }, // Puts the button on the top right
  header: { marginTop: '40px', textAlign: 'center' },
  balance: { fontSize: '3rem', margin: '0' },
  energy: { color: '#ffd700', fontWeight: 'bold' },
  giftZone: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', position: 'relative' },
  giftImage: { width: '200px', cursor: 'pointer', transition: 'transform 0.1s active', userSelect: 'none' },
  floatingText: { position: 'absolute', color: '#ffd700', fontSize: '2rem', fontWeight: 'bold', pointerEvents: 'none', animation: 'floatUp 1s forwards', zIndex: 999 },
  nav: { height: '80px', width: '100%', display: 'flex', justifyContent: 'space-around', background: '#333' },
  btn: { background: 'none', border: 'none', color: 'white', fontWeight: 'bold' }
};

// Note: You'll need this CSS in your global stylesheet for the animation
/*
@keyframes floatUp {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-100px); }
}
*/

export default RootGame;
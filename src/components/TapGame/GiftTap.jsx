import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const GiftTapGame = () => {
  const [balance, setBalance] = useState(0);
  const [energy, setEnergy] = useState(1000);
  const [taps, setTaps] = useState([]); // For floating animations
  const { publicKey, connected } = useWallet();

  if (!connected) {
      return (
          <div className="login-screen">
              <h1>Welcome to Gift Tap</h1>
              <p>Please connect your Solana wallet to play</p>
              <WalletMultiButton />
          </div>
      );
  }

  // Energy regeneration logic
  useEffect(() => {
    const timer = setInterval(() => {
      setEnergy((prev) => Math.min(prev + 1, 1000));
    }, 1500); // Regenerate 1 energy every 1.5 seconds
    return () => clearInterval(timer);
  }, []);

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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.balance}>🎁 {balance} $GIFT</h1>
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
          <p>Wallet: {publicKey.toBase58().slice(0, 6)}...</p>
          {/* Your Gift Icon and Tapping Logic */}
      </div>

    </div>
  );
};

const styles = {
  container: { height: '100vh', background: '#1a1a1a', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', fontFamily: 'sans-serif' },
  header: { marginTop: '40px', textAlign: 'center' },
  balance: { fontSize: '3rem', margin: '0' },
  energy: { color: '#ffd700', fontWeight: 'bold' },
  giftZone: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', position: 'relative' },
  giftImage: { width: '200px', cursor: 'pointer', transition: 'transform 0.1s active', userSelect: 'none' },
  floatingText: { position: 'fixed', color: '#ffd700', fontSize: '1.5rem', fontWeight: 'bold', pointerEvents: 'none', animation: 'floatUp 1s forwards' },
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

export default GiftTapGame;
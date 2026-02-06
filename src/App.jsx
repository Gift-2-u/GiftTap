import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import GiftTap from './components/TapGame/GiftTap'; // Import the new game

function App() {
  const [view, setView] = useState('staking'); // 'staking' or 'game'

  useEffect(() => {
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand(); // This makes the app take up the whole screen
    tg.headerColor = '#1a1a1a'; // Matches your game background
  }

  return (
    <div style={{ touchAction: 'manipulation' }}> 
      {/* 'manipulation' prevents the phone from zooming in when players tap fast! */}
      <h1>Gift Tap!</h1>
    </div>
  );
}, []);

  return (
    <div className="App">
      {/* Simple Navigation for testing */}
      <nav style={{ position: 'fixed', bottom: 0, width: '100%', display: 'flex', zIndex: 100 }}>
        <button onClick={() => setView('staking')} style={navBtnStyle}>Staking</button>
        <button onClick={() => setView('game')} style={navBtnStyle}>Tap Game</button>
      </nav>

      {view === 'staking' ? (
        <div className="staking-container">
          {/* PASTE YOUR EXISTING STAKING UI CODE HERE */}
          <h1>Your $GIFT Staking</h1>
          {/* ... all your current staking logic ... */}
        </div>
      ) : (
        <GiftTap /> // This renders the new game folder
      )}
    </div>
  );
}

const navBtnStyle = { flex: 1, padding: '15px', background: '#333', color: 'white', border: 'none' };

export default App

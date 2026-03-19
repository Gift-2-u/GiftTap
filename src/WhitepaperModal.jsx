import React from 'react';

const WhitepaperModal = ({ isWhitepaperOpen, setIsWhitepaperOpen }) => {
  
  // If it's closed, render nothing
  if (!isWhitepaperOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '20px', paddingBottom: '20px' }}>
      
      <div style={{ background: '#1c1e22', width: '90%', maxWidth: '500px', maxHeight: '90vh', borderRadius: '20px', display: 'flex', flexDirection: 'column', border: '1px solid #333', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        
        {/* Sticky Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #333', background: '#111', flexShrink: 0 }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>📄 Official Whitepaper & Rules</h2>
          <button 
            onClick={() => setIsWhitepaperOpen(false)} 
            style={{ background: '#333', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div style={{ padding: '20px', overflowY: 'auto', color: '#ccc', fontSize: '15px', lineHeight: '1.7' }}>
          
          <p style={{ fontStyle: 'italic', color: '#888', marginTop: 0 }}>Version 1.0 — Welcome to the Gift2u Ecosystem.</p>

          <h3 style={{ color: '#ffd700', borderBottom: '1px solid #444', paddingBottom: '5px' }}>1. The Core Loop</h3>
          <p><strong>Gift Tap</strong> is the official tap-to-earn gateway into the Gift2u ecosystem on the Solana blockchain. Your objective is simple: Tap the gift, weaken the wrapping, and extract <strong>Shards</strong>.</p>
          <p>Shards are the off-chain in-game currency. Accumulating Shards is your primary method of climbing the global leaderboard and securing your future allocation of the on-chain token.</p>
          
          <h3 style={{ color: '#ffd700', borderBottom: '1px solid #444', paddingBottom: '5px' }}>2. Energy Mechanics</h3>
          <p>Every tap consumes <strong>Energy</strong>. You cannot tap infinitely. Once your energy pool is depleted, you must wait for it to recharge. As you progress, you will unlock upgrades that permanently increase your Maximum Energy Cap and your Energy Recharge Rate, allowing you to mine Shards faster.</p>

          <h3 style={{ color: '#ffd700', borderBottom: '1px solid #444', paddingBottom: '5px' }}>3. The NFT Classes (The Elves)</h3>
          <p>To maximize your Shard output and prepare for Web3 integration, players must utilize the four distinct classes of Elves. Upgrading these classes is the key to mastering the game economy:</p>
          <ul style={{ paddingLeft: '20px', color: '#fff', background: '#111', padding: '15px 15px 15px 35px', borderRadius: '10px' }}>
            <li style={{ marginBottom: '10px' }}><strong>Data Architect:</strong> The masters of code. Upgrading this class increases your <em>Passive Shard Generation</em>, allowing you to earn even while the app is closed.</li>
            <li style={{ marginBottom: '10px' }}><strong>Solar Power Forger:</strong> Harnessers of pure energy. Upgrading this class expands your <em>Energy Cap</em> and accelerates your recharge speeds.</li>
            <li style={{ marginBottom: '10px' }}><strong>Urban Power Basher:</strong> The brute force specialists. Upgrading this class acts as a <em>Tap Multiplier</em>, permanently increasing the number of Shards you earn per single tap.</li>
            <li><strong>Cryptic Fate Giver:</strong> Masters of the blockchain. This rare class governs your <em>Luck</em>, unlocking critical tap multipliers and enhancing your final $GFT conversion rates.</li>
          </ul>

          <h3 style={{ color: '#ffd700', borderBottom: '1px solid #444', paddingBottom: '5px' }}>4. The $GFT Token & Wallets</h3>
          <p>Gift Tap operates on a "Play-to-Airdrop" model. In the future, your off-chain Shard balance and your NFT Class levels will dictate your airdrop allocation of the official <strong>$GFT Token</strong> on the Solana network.</p>
          <p><em>Security Note:</em> Upon joining, the game automatically generated a military-grade, encrypted "Invisible Wallet" tied directly to your Telegram ID. Your Solana keys are safe, and you can view your backup phrase in the Settings Menu at any time.</p>

          <h3 style={{ color: '#ffd700', borderBottom: '1px solid #444', paddingBottom: '5px' }}>5. Fair Play & Anti-Cheat</h3>
          <p>We are building a long-term game with real users. The ecosystem is protected by strict anti-sybil algorithms.</p>
          <ul style={{ paddingLeft: '20px', color: '#ff6b6b' }}>
            <li>The use of auto-clickers or scripts is strictly prohibited.</li>
            <li>Creating fake accounts to manipulate the Referral System (2,000 Shards per invite) will result in a permanent ban.</li>
            <li>Flagged accounts will have their encrypted vaults permanently locked, forfeiting all $GFT airdrop eligibility.</li>
          </ul>
          
          <p style={{ textAlign: 'center', marginTop: '30px', fontWeight: 'bold', color: '#fff' }}>Tap. Earn. Gift.</p>

        </div>
      </div>
    </div>
  );
};

export default WhitepaperModal;
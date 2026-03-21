import React, { useState } from 'react';

const WhitepaperModal = ({ isWhitepaperOpen, setIsWhitepaperOpen }) => {
  // This state tracks which section is currently expanded
  const [activeSection, setActiveSection] = useState(null);

  if (!isWhitepaperOpen) return null;

  // The Playbook Data (Clean and easy to edit!)
  const PLAYBOOK = [
    {
      id: 1,
      title: "1. GFTshards",
      content: "Shards are the core off-chain currency of Gift Tap. Your primary objective is simple: tap the gift to extract Shards.\n\nAll new players begin at Level 0, earning exactly 1 Shard per tap. Accumulating Shards is your main method of climbing the global leaderboard and securing your future allocation of the on-chain $GFT token.\n\nCritical Taps: Earning massive bonus Shards in a single tap is possible, but this mechanic is exclusively unlocked through the Luck stat provided by specific NFT classes."
    },
    {
      id: 2,
      title: "2. Energy",
      content: "You cannot tap infinitely. Every tap costs exactly 1 Energy from your active pool.\n\nAt Level 0, your maximum Energy Bar holds 500 Energy, which regenerates automatically at a rate of 1 Energy every 2 seconds. To ensure a balanced and fair economy, every player is limited to a maximum of 1,000 Total Energy per day.\n\nAs you progress, you can unlock upgrades that increase your Energy Bar capacity and accelerate your Recharge Rate."
    },
    {
      id: 3,
      title: "3. Levels & Progression",
      content: "Your account automatically levels up as you accumulate total lifetime taps. Reaching higher level tiers unlocks permanent, powerful multipliers to your base Tap Power.\n\nThe Progression Tiers:\n• Levels 0 to 4: 1.00x Multiplier (10,000 taps per level)\n• Levels 5 to 9: 1.15x Multiplier (15,000 taps per level)\n• Levels 10 to 19: 1.30x Multiplier (25,000 taps per level)\n• Levels 20 to 29: 1.50x Multiplier (50,000 taps per level)\n• Levels 30 to 49: 1.75x Multiplier (100,000 taps per level)\n• Level 50: 2.00x Multiplier\n\nTier Ascension Fees:\nTo prevent botting and balance the game's economy, players will hit Level Caps. You must pay a one-time Ascension Fee to break through a cap and enter the next tier. This fee requires off-chain Shards or SOL:\n\n• Unlock Level 5 : 15,000 Shards + 0.025 SOL\n• Unlock Level 10 : 25,000 Shards + 0.05 SOL\n• Unlock Level 20 : 50,000 Shards + 0.10 SOL\n• Unlock Level 30 : 100,000 Shards + 0.20 SOL\n• Unlock Level 50 : 400,000 Shards + 0.75 SOL\n\nConsistently hitting these tap milestones and leveling up is the ultimate key to maximizing your Shard production and dominating the late-game economy."
    },
    {
      id: 4,
      title: "4. NFT Classes & Synergy",
      content: "To master the economy and maximize your extraction, players can purchase exclusive NFT Classes directly with SOL. \n\nSynergy: You are not limited to equipping just one. All NFTs you own work together simultaneously, permanently stacking their bonuses to accelerate your production.\n\nThe Classes:\n• Data Bot: Mines Shards passively for you while the app is closed.\n• Solar Tap Forger: Increases your tap efficiency, granting more Shards per single unit of Energy.\n• Energy Fusion Operator: Expands your maximum daily Energy limit, allowing you to tap longer.\n• Luck's Oracle: Grants a percentage chance to trigger a 'Critical Tap', randomly multiplying the Shards extracted in a single strike."
    },
    {
      id: 5,
      title: "5. In-App Purchases",
      content: "Players can optionally purchase premium boosts, instant energy refills, or exclusive cosmetics directly through the app. These purchases support the ecosystem and provide quality-of-life upgrades, but the core game remains entirely free-to-earn."
    },
    {
      id: 6,
      title: "6. GFT Token & Wallet",
      content: "Gift Tap does not rely on a randomized airdrop. Instead, the GFTshards you extract and accumulate in-game will be directly swappable for official on-chain $GFT tokens following the official token launch.\n\nYour Web3 Wallet:\nUpon joining, a secure Solana wallet was automatically generated for your account. This in-app wallet is built to manage your GFTshards, $GFT, SOL, and USDC seamlessly.\n\nSecurity Reminder: You have full, non-custodial ownership of this wallet. While you were prompted to save your 12-word Secret Phrase during onboarding, you can view and back it up at any time via the main Menu. Never share your Secret Phrase with anyone."
    },
    {
      id: 7,
      title: "7. Code of Conduct",
      content: "The use of auto-clickers, scripts, or fake referral accounts (Sybil attacks) is strictly prohibited. Flagged accounts will have their encrypted vaults permanently locked, forfeiting all GFTshard-to-GFT swap eligibility. Play fair and earn together."
    }
  ];

  const toggleSection = (id) => {
    // If clicking the same section, close it. Otherwise, open the new one.
    setActiveSection(activeSection === id ? null : id);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '20px', paddingBottom: '20px' }}>
      
      <div style={{ background: '#1c1e22', width: '90%', maxWidth: '500px', maxHeight: '90vh', borderRadius: '20px', display: 'flex', flexDirection: 'column', border: '1px solid #333', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        
        {/* Sticky Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #333', background: '#111', flexShrink: 0 }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>📖 The Playbook</h2>
          <button 
            onClick={() => setIsWhitepaperOpen(false)} 
            style={{ background: '#333', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Accordion Area */}
        <div style={{ padding: '20px', overflowY: 'auto' }}>
          <p style={{ fontStyle: 'italic', color: '#888', marginTop: 0, marginBottom: '20px' }}>Tap a section to expand.</p>

          {PLAYBOOK.map((section) => (
            <div key={section.id} style={{ marginBottom: '10px' }}>
              
              {/* Accordion Button */}
              <button 
                onClick={() => toggleSection(section.id)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: activeSection === section.id ? '#2a2d35' : '#111', padding: '15px', borderRadius: '12px', border: activeSection === section.id ? '1px solid #ffd700' : '1px solid #222', cursor: 'pointer', transition: 'all 0.2s ease' }}
              >
                <span style={{ color: activeSection === section.id ? '#ffd700' : '#fff', fontWeight: 'bold', fontSize: '16px' }}>
                  {section.title}
                </span>
                <span style={{ color: '#888', transform: activeSection === section.id ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                  {'▶'}
                </span>
              </button>

              {/* Accordion Content (Reveals if active) */}
              {activeSection === section.id && (
                <div style={{ padding: '15px', color: '#ccc', fontSize: '14px', lineHeight: '1.6', background: '#1a1c20', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', marginTop: '-5px', border: '1px solid #222', borderTop: 'none', whiteSpace: 'pre-line' }}>
                  {section.content}
                </div>
              )}

            </div>
          ))}

        </div>
      </div>
    </div>
  );
};

export default WhitepaperModal;
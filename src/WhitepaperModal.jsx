import React, { useState } from 'react';

const WhitepaperModal = ({ isWhitepaperOpen, setIsWhitepaperOpen, onClose }) => {
  // This state tracks which section is currently expanded
  const [activeSection, setActiveSection] = useState(null);

  if (!isWhitepaperOpen) return null;

  // The Playbook Data (Clean and easy to edit!)
  const PLAYBOOK = [
    {
      id: 1,
      title: "1. GFTshards",
      content: "GFTshards are the core in-game currency of Gift Tap. Tap the gift to extract Shards.\n\nAll new players begin at Level 0 with 1 Shard per tap (before multipliers). Shards climb the leaderboard, pay shop items and ascension walls, and can be converted through Shard Swap into GFT credit (and later on-chain $GFT when linked).\n\nGFTshards are not money and not a promise of profit. See Terms of Use."
    },
    {
      id: 2,
      title: "2. Energy",
      content: "Every tap costs 1 Energy from your pool.\n\n• Free daily Energy: 1,000 base (plus ads for more).\n• Energy pool / recharge holds 500 Energy, which regenerates automatically at a rate of 1 Energy every 3 seconds.\n• Shop (Shards tab): Expanded Battery, Instant Refill, Frenzy, Heavy Hands — temporary boosts, not NFTs.\n• Buying Energy with shards spends your bank; season taps can look high while shard balance stays lower."
    },
    {
      id: 3,
      title: "3. Levels & Ascension Walls",
      content: "Level rises with lifetime taps. Higher tiers raise permanent tap multipliers:\n\n• Levels 0–4: 1.00x (10,000 taps per level)\n• Levels 5–9: 1.15x (15,000 taps per level)\n• Levels 10–19: 1.30x (25,000 taps per level)\n• Levels 20–29: 1.50x (50,000 taps per level)\n• Levels 30–49: 1.75x (100,000 taps per level)\n• Level 50: 2.00x\n\nAscension walls (pay Shards and/or SOL to unlock the next tier):\n• Wall L4 → L5: 15,000 Shards or 0.025 SOL\n• Wall L9 → L10: 30,000 Shards or 0.05 SOL\n• Wall L19 → L20: 75,000 Shards or 0.10 SOL\n• Wall L29 → L30: 150,000 Shards or 0.20 SOL\n• Wall L49 → L50: 500,000 Shards or 0.75 SOL\n\nIf you hit a wall without enough shards: you can keep tapping to fill only the missing wall fee. Those recovery taps do NOT count for level-up or season shards — they only pay the wall. SOL skips the wait."
    },
    {
      id: 4,
      title: "4. Gift2u Elves NFTs (GiftLocksmith)",
      content: "NFTs are sold in the shop under the separate NFTs tab — not mixed with temporary SOL boosts.\n\nCollection: Gift2u Elves (Metaplex Core on Solana mainnet).\n\nGiftLocksmith (Gen 1 · Rare · Wave 1 of 3, max 5,000 planned):\n• Mint price Wave 1: 0.25 SOL (later waves may cost more).\n• Max 5 mints per wallet on Wave 1.\n• Permanent on-chain NFT in your game wallet.\n\nWhat GiftLocksmith unlocks:\n• Shard Swap (GFTshards → GFT) immediately — no Level 10 wait.\n• Better swap terms: 4% fee in GFT (free path is 10%).\n• Higher daily swap cap than free players.\n• Planned vault / better APY access on Gift2u (when vault launches).\n\nFree players unlock Shard Swap only with Level 10+ AND a one-time GFTshard license burn — with higher fees and lower caps. The NFT is an advantage, not the only way to play or ever swap.\n\nFuture Elf classes (e.g. production / luck / energy) may stack later. GiftLocksmith is the first utility class: swap access and better cash-out terms.\n\nNFTs are digital assets. Prices can go to zero. No ROI or profit is promised."
    },
    {
      id: 5,
      title: "5. Shop: Shards, Boosts & NFTs",
      content: "Gift Shop has four areas:\n\n• Shards — temporary boosts paid with GFTshards (Frenzy, Battery, Refill, Heavy Hands).\n• Boosts — temporary SOL boosts (bots, contracts, power multipliers). These are NOT NFTs.\n• NFTs — on-chain mints (GiftLocksmith Wave 1). Permanent utility.\n• Pack (Backpack) — activate temporary items you own. On-chain NFTs live in your wallet, not the backpack.\n\nThe core game stays free-to-play. Purchases are optional."
    },
    {
      id: 6,
      title: "6. Shard Swap (GFTshards → GFT)",
      content: "Open Wallet → Shard to convert GFTshards into GFT credit on your account.\n\nHow conversion works:\n• All input shards convert at the current rate (provisional until official $GFT launch — rate may change).\n• Platform fee is taken in GFT (not by cutting shards first): free path 10%, GiftLocksmith 4%.\n• You receive net GFT credit. Fee GFT is retained by the platform.\n\nUnlock paths:\n• Free: Level 10+ AND pay a one-time GFTshard license (both required — see in-app cost).\n• GiftLocksmith NFT: instant unlock + better fee + higher daily cap (skips Level 10 + license).\n\nDaily caps and minimum swap sizes apply (see in-app swap screen). Caps reset at UTC midnight.\n\nGFT credit is account balance until an on-chain $GFT mint and withdrawal path are fully linked. Not an investment; no promise of market value."
    },
    {
      id: 7,
      title: "7. Wallet, $GFT & Disclaimers",
      content: "A Solana wallet is created for you in Gift Tap. You own the keys. Save your 12-word phrase in Menu — we cannot restore lost keys.\n\nPurchases (boosts, NFTs, ascension SOL) use your game wallet on mainnet. Network fees apply.\n\nIMPORTANT — NOT AN INVESTMENT:\n• GFTshards and $GFT are not investment products. No promise of profit, yield, or price.\n• Crypto is volatile. Gift2u is not responsible for price changes of $GFT, SOL, NFTs, or any asset.\n• This is not financial advice. See Terms of Use in the Menu.\n\nComing from Telegram? Use Restore with your 12-word phrase."
    },
    {
      id: 8,
      title: "8. Referrals (Invite Friends)",
      content: "Grow the Gift Tap community with invite links from the Friends tab.\n\nJoiner bonus:\n• New players who join with your link receive +500 GFTshards when they start.\n\nReferrer bonuses (you earn these — not paid on mere join):\n• +1,000 GFTshards when your friend reaches Level 1 (10,000 lifetime taps).\n• +3,000 GFTshards when your friend clears the first Ascension Wall (Level 4 → Level 5), by paying the wall fee in Shards or SOL.\n\nEach milestone is paid once per invited friend. Farming fake accounts is banned under the Code of Conduct."
    },
    {
      id: 9,
      title: "9. Code of Conduct",
      content: "No auto-clickers, scripts, multi-account farming, or abuse of swap/referral systems.\n\nFlagged accounts may be locked and lose GFTshard-to-GFT swap eligibility and other rewards. Play fair."
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
            onClick={() => {
              // Close playbook and return to menu (parent may reopen menu via onClose)
              if (typeof onClose === 'function') onClose();
              else setIsWhitepaperOpen(false);
            }} 
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
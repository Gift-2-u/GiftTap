import React, { useState } from 'react';

const WhitepaperModal = ({ isWhitepaperOpen, setIsWhitepaperOpen, onClose }) => {
  // This state tracks which section is currently expanded
  const [activeSection, setActiveSection] = useState(null);

  if (!isWhitepaperOpen) return null;

  // Game Guide sections (Clean and easy to edit!)
  const PLAYBOOK = [
    {
      id: 1,
      title: "1. G2Ushards",
      content: "G2Ushards are the core in-game currency of Gift Tap. Tap the gift to extract Shards.\n\nAll new players begin at Level 0 with 1 Shard per tap (before multipliers). Shards climb the leaderboard, pay shop items and ascension walls.\n\nG2Ushards are not money and not a promise of profit. See Terms of Use."
    },
    {
      id: 2,
      title: "2. Energy",
      content: "Every tap costs 1 Energy from your pool.\n\n• Free daily Energy: 1,000 base (plus ads for more).\n• Energy pool / recharge holds 500 Energy, which regenerates automatically at a rate of 1 Energy every 1.5 seconds.\n• Shop (Shards tab): Expanded Battery, Instant Refill, Frenzy, Heavy Hands — temporary boosts, not NFTs.\n• Buying Energy with shards spends your bank; season taps can look high while shard balance stays lower."
    },
    {
      id: 3,
      title: "3. Levels & Ascension Walls",
      content: "Level rises with lifetime taps. Higher tiers raise permanent tap multipliers:\n\n• L0–4: 1.00x (10,000 taps/level)\n• L5–9: 1.15x (15,000 taps/level)\n• L10–19: 1.20x (50,000 taps/level)\n• L20–29: 1.30x (150,000 taps/level)\n• L30–49: 1.40x (350,000 taps/level)\n• L50–74: 1.50x (1,000,000 taps/level)\n• L75–99: 1.75x (3,000,000 taps/level)\n• L100: 2.00x\n\nAscension walls (optional — keep mining forever without climbing):\n• L4→5: 15,000 shards OR 0.025 SOL\n• L9→10: 30,000 shards OR 0.05 SOL\n• L19→20: 50,000 shards AND 0.05 SOL\n• L29→30: 100,000 shards AND 0.10 SOL\n• L49→50: 300,000 shards AND 0.35 SOL\n• L74→75: 800,000 shards AND 0.75 SOL\n• L99→100: 2,500,000 shards AND 1.50 SOL\n\nEarly walls: pay shards or SOL. Mid/late walls require both. Climbing unlocks higher multipliers and the next tier."
    },
    {
      id: 4,
      title: "4. Gift2u Elves NFTs (LIVE)",
      content:
        "Mint in Shop → NFTs (Wave 1 live on Solana). Collection: Gift2u Elves.\n" +
        "One of each class per wallet (where applicable). Optional — you can play without minting.\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "LOCKSMITH · Walls / Walk2u\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: free ascension wall climbs + Walk2u shoes.\n" +
        "Wave 1: 0.10 SOL · Rare ·\n" +
        "You get:\n" +
        "• L1: free climb → Level 5 + Common Walk2u Shoe\n" +
        "• L2 / L3: free → Level 10 / 20 + Common Shoe\n" +
        "• Higher levels unlock later walls as they open\n" +
        "• Opens the path to Walk2u\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "FATE · Luck\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: jackpot chance on tap G2Ushards.\n" +
        "Wave 1 prices: Common 0.05 · Rare 0.30 · Epic 1.00 · Legendary 2.50 SOL.\n" +
        "You get:\n" +
        "• Fate in wallet — each tap can hit one jackpot (replaces Frenzy on that tap; Echo still stacks)\n" +
        "• Level N unlocks luck rungs 1→N (higher rung checked first)\n" +
        "• 1 Star Badge socket\n\n" +
        "Luck board (chance % → multi on that tap):\n" +
        "Common\n" +
        "• L1  2% → 4×   · L2  2% → 6×   · L3  2% → 8×\n" +
        "• L4  1.5% → 12× · L5  1.5% → 15×\n" +
        "Rare\n" +
        "• L1  2% → 8×   · L2  2% → 12×  · L3  2% → 16×\n" +
        "• L4  1.5% → 22× · L5  1.5% → 30×\n" +
        "Epic\n" +
        "• L1  2.5% → 12× · L2  2% → 18×  · L3  2% → 25×\n" +
        "• L4  1.5% → 35× · L5  0.3% → 60×\n" +
        "Legendary\n" +
        "• L1  3% → 15×  · L2  2.5% → 25× · L3  2% → 35×\n" +
        "• L4  0.5% → 60× · L5  0.15% → 100×\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "ECHO · Power\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: always-on tap multiplier.\n" +
        "Wave 1 prices: Common 0.05 · Rare 0.30 · Epic 1.00 · Legendary 2.50 SOL.\n" +
        "You get (tap multi by rarity × level 1→5):\n" +
        "• Common      1.10× → 1.50×\n" +
        "• Rare        1.60× → 2.00×\n" +
        "• Epic        2.10× → 2.50×\n" +
        "• Legendary   2.60× → 3.00×\n" +
        "• 1 Star Badge socket\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "RUSH · Energy (daily cap)\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: raises max daily taps (replaces base 1,000).\n" +
        "Wave 1 prices: Common 0.05 · Rare 0.30 · Epic 1.00 · Legendary 2.50 SOL.\n" +
        "You get (max daily taps by rarity × level 1→5):\n" +
        "• Common      1,100 → 1,500\n" +
        "• Rare        1,600 → 2,000\n" +
        "• Epic        2,100 → 2,500\n" +
        "• Legendary   2,600 → 3,000\n" +
        "• Expanded Battery & task boosts still add on top\n" +
        "• 1 Star Badge socket\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "SHADOW · Night (daily claim)\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: claim shards once per UTC day without tapping.\n" +
        "Wave 1 prices: Common 0.05 · Rare 0.30 · Epic 1.00 · Legendary 2.50 SOL.\n" +
        "You get (claim hours ÷ 24 of base daily cap — Rush or 1,000; boosts not included):\n" +
        "• Common      2h → 6h\n" +
        "• Rare        8h → 12h\n" +
        "• Epic       14h → 18h\n" +
        "• Legendary  20h → 24h (full base daily at L5)\n" +
        "• 1 Star Badge socket\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "LEVEL UP (Backpack → NFT)\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Pay SOL in Backpack → NFT to raise elf level (max L5).\n" +
        "Mint + full L1→5 stays under the next rarity Wave 1 mint.\n\n" +
        "Fate · Echo · Rush · Shadow (L1→2 / L2→3 / L3→4 / L4→5 · total):\n" +
        "• Common      0.02 / 0.04 / 0.06 / 0.08  · total 0.20\n" +
        "• Rare        0.05 / 0.10 / 0.20 / 0.25  · total 0.60\n" +
        "• Epic        0.15 / 0.25 / 0.35 / 0.50  · total 1.25\n" +
        "• Legendary   0.50 / 0.80 / 1.20 / 2.00  · total 4.50\n\n" +
        "GiftLocksmith (mint 0.10 = L1; separate ladder):\n" +
        "• L1→2 0.20 · L2→3 0.35 · L3→4 0.60 · L4→5 1.50  · total 2.65\n\n" +
        "Star Badge (one Star · all rarities; mint 0.10):\n" +
        "• L1→2 0.10 · L2→3 0.15 · L3→4 0.25 · L4→5 0.40  · total 0.90\n\n" +
        "Airdrop tip: Locksmith +25% weight; each other elf adds by rarity (Common +5% · Rare +10% · Epic +20% · Legendary +30%). Clear Level 5 to appear on Ranks → Airdrop.\n\n" +
        "NFTs are optional gameplay items. No return is promised.",
    },
    {
      id: 5,
      title: "5. Shop: Shards, Boosts & NFTs",
      content: "Gift Shop has four areas:\n\n• Free (Shards) — temporary boosts paid with G2Ushards (Frenzy, Battery, Refill, Heavy Hands). Frenzy = 2× shards per tap, normal energy cost.\n• Premium (Boosts) — temporary SOL boosts (bots, contracts, power multipliers). These are NOT NFTs.\n• NFTs — on-chain Wave 1 mints LIVE: Locksmith · Fate · Echo · Rush · Shadow. Permanent utility.\n• Backpack — activate temporary items; Elves live in your game wallet. Level up Elves in Backpack → NFT.\n\nThe core game stays free-to-play. Purchases are optional."
    },
    {
      id: 6,
      title: "6. Wallet Swap ($G2U)",
      content: "Open Wallet → Swap to trade SOL and other tokens for $G2U with Jupiter in your game wallet.\n\nYou sign every swap. Network fees apply. Rates move with the market.\n\nNot an investment; no promise of market value."
    },
    {
      id: 7,
      title: "7. Wallet & Disclaimers",
      content: "A Solana wallet is created for you in Gift Tap. You own the keys. Save your 12-word phrase in Menu — we cannot restore lost keys.\n\nPurchases (boosts, NFTs, ascension SOL) use your game wallet on mainnet. Network fees apply.\n\nIMPORTANT — NOT AN INVESTMENT:\n• G2Ushards and $G2U are not investment products. No promise of profit, yield, or price.\n• Crypto is volatile. Gift2u is not responsible for price changes of $G2U, SOL, NFTs, or any asset.\n• This is not financial advice. See Terms of Use in the Menu.\n\nComing from Telegram? Use Restore with your 12-word phrase."
    },
    {
      id: 8,
      title: "8. Referrals (Invite Friends)",
      content: "Grow the Gift Tap community with invite links from the Friends tab.\n\nJoiner bonus:\n• New players who join with your link receive +500 G2Ushards when they start.\n\nReferrer bonuses (you earn these — not paid on mere join):\n• +1,000 G2Ushards when your friend reaches Level 1 (10,000 lifetime taps).\n• +3,000 G2Ushards when your friend clears the first Ascension Wall (Level 4 → Level 5), by paying the wall fee in Shards or SOL.\n\nEach milestone is paid once per invited friend. Mining fake accounts is banned under the Code of Conduct."
    },
    {
      id: 9,
      title: "9. Leaderboards (Ranks)",
      content:
        "Open Ranks from the bottom nav (or Menu → Ranks). Three boards:\n\n" +
        "WEEKLY\n" +
        "• Ordered by your mining score this UTC week (resets every Monday 00:00 UTC).\n" +
        "• Eligible players (≥1,050 weekly score) each win a badge when the week freezes (claim in Shop → BackPack → Badges):\n" +
        "  top 10% Diamond · next 15% Gold · next 25% Silver · rest Bronze.\n" +
        "• Winners freeze automatically at week end; the new week starts on its own.\n" +
        "• Burn badges in Pack for Mystery Gift (costs & full odds: § 9b Mystery Gift).\n\n" +
        "SEASON (monthly)\n" +
        "• Ordered by season mining score for the current season period shown in-app.\n" +
        "• At month end a snapshot can select winners / giveaways as announced.\n" +
        "• Main board uses a rising activity floor (~15% of 1,000 taps/day × day of season). Under the floor you still see your rank on the last line.\n" +
        "• Some promotions count only main-board players.\n\n" +
        "ALL-TIME\n" +
        "• Ordered by lifetime taps. Always on — long-term prestige, no monthly reset.\n\n" +
        "AIRDROP (Ranks → Airdrop)\n" +
        "• Shows players who cleared Level 5 (name · level · bonus %).\n" +
        "• Bonus % from levels, lifetime taps, streak, IAP, Elves NFTs, and referrals.\n" +
        "• Community allocation weight — not financial advice and not a promise of $.\n\n" +
        "Fair play: multi-accounts and bots can be disqualified. See Code of Conduct.",
    },
    {
      id: 91,
      title: "9b. Mystery Gift (badge burn)",
      content:
        "Open Shop → Pack → Badges. Burn weekly rank badges to open Mystery Gift (one tier per open).\n\n" +
        "Burn cost (single tier):\n" +
        "• 3 Diamond · 4 Gold · 5 Silver · 10 Bronze\n\n" +
        "Weekly badges (Ranks → Weekly, after week freezes):\n" +
        "• Diamond = top 10% · Gold = next 15% · Silver = next 25% · Bronze = rest eligible\n\n" +
        "DROP RATES by badge tier burned (each column = 100%):\n\n" +
        "Prize                  Bronze (rest)  Silver 25%  Gold 15%  Diamond 10%\n" +
        "Exclusive NFT              1%            2%         5%         12%\n" +
        "Bonus G2U Tokens          10%           20%        35%         50%\n" +
        "Premium Boost             14%           23%        30%         28%\n" +
        "Free Boost                35%           30%        20%         10%\n" +
        "G2Ushards (Bulk)          40%           25%        10%          0%\n\n" +
        "Better badges = better odds (more Exclusive NFT & Bonus G2U, less bulk shards).\n" +
        "Exclusive NFT: rare voucher toward a special drop (on-chain mint when that path is live).\n" +
        "Bonus G2U Tokens: paid as G2Ushards credit for now (amount scales with badge tier).\n" +
        "Premium Boost = Frenzy · Free Boost = Instant Refill (Pack).\n\n" +
        "Independent roll per open. Not financial advice; prizes can change for balance/fair play.",
    },
    {
      id: 10,
      title: "10. Code of Conduct",
      content: "No auto-clickers, scripts, multi-account mining, or abuse of swap/referral systems.\n\nFlagged accounts may be locked and lose G2Ushard-to-G2U swap eligibility and other rewards. Play fair."
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
          <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>📖 Game Guide</h2>
          <button 
            onClick={() => {
              // Close game guide and return to menu (parent may reopen menu via onClose)
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
          <p style={{ fontStyle: 'italic', color: '#888', marginTop: 0, marginBottom: '20px' }}>How Gift Tap works — tap a section to expand.</p>

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
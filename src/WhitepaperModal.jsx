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
      content: "G2Ushards are the core in-game currency of Gift Tap. Tap the gift to extract Shards.\n\nAll new players begin at Level 0 with 1 Shard per tap (before multipliers). Shards climb the leaderboard, pay shop items and ascension walls, and can be converted through Shard Swap into G2U credit (and later on-chain $G2U when linked).\n\nG2Ushards are not money and not a promise of profit. See Terms of Use."
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
        "Mint in Shop → NFTs (Wave 1 live on Solana mainnet). Collection: Gift2u Elves.\n" +
        "Equip from Pack → NFT. One of each class per wallet (where applicable). Optional — you can play without minting.\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "LOCKSMITH · Swap / Vault\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: unlock Shard Swap (G2Ushards → G2U).\n" +
        "Wave 1: 0.25 SOL · Rare · max 5 / wallet.\n" +
        "You get:\n" +
        "• Shard Swap unlocked immediately (skip Level 5 + Swap Badge)\n" +
        "• 4% swap fee in G2U (free path is 10%)\n" +
        "• Higher daily swap cap\n" +
        "• Vault access when vault launches\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "FATE · Luck\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: jackpot chance on tap G2Ushards.\n" +
        "Wave 1 prices: Common 0.05 · Rare 0.20 · Epic 0.80 · Legendary 1.75 SOL.\n" +
        "You get:\n" +
        "• Equip 1 Fate — chance each tap for a jackpot multi on that tap’s shards\n" +
        "• Higher rarity = stronger luck profile\n" +
        "• 1 Shard Badge socket\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "ECHO · Power\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: always-on tap multiplier.\n" +
        "Wave 1 prices: same ladder as Fate (0.05 → 1.75 SOL by rarity).\n" +
        "You get (tap multi by rarity × level 1→5):\n" +
        "• Common      1.10× → 1.50×\n" +
        "• Rare        1.60× → 2.00×\n" +
        "• Epic        2.10× → 2.50×\n" +
        "• Legendary   2.60× → 3.00×\n" +
        "• 1 Shard Badge socket\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "RUSH · Energy (daily cap)\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: raises max daily taps (replaces base 1,000).\n" +
        "Wave 1 prices: same ladder as Fate.\n" +
        "You get (max daily taps by rarity × level 1→5):\n" +
        "• Common      1,100 → 1,500\n" +
        "• Rare        1,600 → 2,000\n" +
        "• Epic        2,100 → 2,500\n" +
        "• Legendary   2,600 → 3,000\n" +
        "• Expanded Battery & task boosts still add on top\n" +
        "• 1 Shard Badge socket\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "SHADOW · Night (daily claim)\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: claim shards once per UTC day without tapping.\n" +
        "Wave 1 prices: same ladder as Fate.\n" +
        "You get (claim hours ÷ 24 of base daily cap — Rush or 1,000; boosts not included):\n" +
        "• Common      2h → 6h\n" +
        "• Rare        8h → 12h\n" +
        "• Epic       14h → 18h\n" +
        "• Legendary  20h → 24h (full base daily at L5)\n" +
        "• 1 Shard Badge socket\n\n" +
        "Airdrop tip: Locksmith +25% weight; each other elf adds by rarity (Common +5% · Rare +10% · Epic +20% · Legendary +30%). Clear Level 5 to appear on Ranks → Airdrop.\n\n" +
        "NFTs are optional gameplay items. No return is promised.",
    },
    {
      id: 5,
      title: "5. Shop: Shards, Boosts & NFTs",
      content: "Gift Shop has four areas:\n\n• Free (Shards) — temporary boosts paid with G2Ushards (Frenzy, Battery, Refill, Heavy Hands). Frenzy = 2× shards per tap, normal energy cost.\n• Premium (Boosts) — temporary SOL boosts (bots, contracts, power multipliers). These are NOT NFTs.\n• NFTs — on-chain Wave 1 mints LIVE: Locksmith · Fate · Echo · Rush · Shadow. Permanent utility.\n• Pack (Backpack) — activate temporary items; equip Elves from Pack → NFT. On-chain NFTs live in your game wallet.\n\nThe core game stays free-to-play. Purchases are optional."
    },
    {
      id: 6,
      title: "6. Shard Swap (G2Ushards → G2U)",
      content: "Open Wallet → Shard to convert G2Ushards into G2U credit on your account.\n\nHow conversion works:\n• All input shards convert at the current rate (provisional until official $G2U launch — rate may change).\n• Platform fee is taken in G2U (not by cutting shards first): free path 10%, GiftLocksmith 4%.\n• You receive net G2U credit. Fee G2U is retained by the platform.\n\nUnlock paths:\n• Free: Level 5+ AND Swap Badge / Swap Badge (both required — see in-app cost).\n• GiftLocksmith NFT: instant unlock + better fee + higher daily cap (skips Level 5 + badge).\n\nDaily caps and minimum swap sizes apply (see in-app swap screen). Caps reset at UTC midnight.\n\nG2U credit is account balance until an on-chain $G2U mint and withdrawal path are fully linked. Not an investment; no promise of market value."
    },
    {
      id: 7,
      title: "7. Wallet, $G2U & Disclaimers",
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
        "• Top 10 when the week freezes get one badge (claim in Shop → BackPack → Badges after the week ends):\n" +
        "  #1 Diamond · #2 Gold · #3 Silver · #4–10 Bronze.\n" +
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
        "• Diamond = #1 · Gold = #2 · Silver = #3 · Bronze = #4–10\n\n" +
        "DROP RATES by badge tier burned (each column = 100%):\n\n" +
        "Prize                  Bronze #4–10   Silver #3   Gold #2   Diamond #1\n" +
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
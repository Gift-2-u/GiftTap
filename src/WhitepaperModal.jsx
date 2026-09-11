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
      content: "Every tap costs 1 Energy from your pool.\n\n• Free daily Energy: 1,000 base (plus ads for more).\n• Energy Battery / recharge holds 500 Energy, which regenerates automatically at a rate of 1 Energy every 1.5 seconds.\n• Shop: You can recharge your battery or Max Daily with free or Premium boost."
    },
    {
      id: 3,
      title: "3. Levels & Ascension Walls",
      content:
        "Level rises with lifetime taps. Higher tiers raise permanent tap multipliers:\n\n" +
        "• L0–4: 1.00x (10,000 taps/level)\n" +
        "• L5–9: 1.15x (15,000 taps/level)\n" +
        "• L10–19: 1.20x (50,000 taps/level)\n" +
        "• L20–29: 1.30x (150,000 taps/level)\n" +
        "• L30–49: 1.40x (350,000 taps/level)\n" +
        "• L50–74: 1.50x (1,000,000 taps/level)\n" +
        "• L75–99: 1.75x (3,000,000 taps/level)\n" +
        "• L100: 2.00x\n\n" +
        "Ascension walls (optional — keep mining forever without climbing).\n" +
        "Every wall needs BOTH G2Ushards AND fixed $G2U:\n\n" +
        "• L4→5: 15,000 shards + 10,000 $G2U\n" +
        "• L9→10: 30,000 shards + 25,000 $G2U\n" +
        "• L19→20: 50,000 shards + 75,000 $G2U\n" +
        "• L29→30: 100,000 shards + 300,000 $G2U\n" +
        "• L49→50: 300,000 shards + 1,000,000 $G2U\n" +
        "• L74→75: 800,000 shards + 2,500,000 $G2U\n" +
        "• L99→100: 2,500,000 shards + 5,000,000 $G2U\n\n" +
        "GiftLocksmith can climb free by Locksmith level (see §4). Paying the wall fee = higher mult only (no Walk2u shoe). Climbing unlocks higher multipliers and the next tier.",
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
        "Role: free ascension wall climbs + Walk2u shoes (on select walls).\n" +
        "Wave 1: 0.10 SOL · Rare · mint = L1.\n" +
        "Free climbs by Locksmith level:\n" +
        "• L1 → walls 5 / 10 / 20\n" +
        "• L2 → wall 30 · L3 → 50 · L4 → 75 · L5 → 100\n" +
        "Common Walk2u Shoe: only on Locksmith free climbs of walls 5 / 30 / 50\n" +
        "(not when you pay the shard+$G2U fee). Opens the path to Walk2u.\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "FATE · Luck\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Role: jackpot chance on tap G2Ushards.\n" +
        "Wave 1 prices: Common 0.05 · Rare 0.30 · Epic 0.75 · Legendary 1.50 SOL.\n" +
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
        "Wave 1 prices: Common 0.05 · Rare 0.30 · Epic 0.75 · Legendary 1.50 SOL.\n" +
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
        "Wave 1 prices: Common 0.05 · Rare 0.30 · Epic 0.75 · Legendary 1.50 SOL.\n" +
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
        "Wave 1 prices: Common 0.05 · Rare 0.30 · Epic 0.75 · Legendary 1.50 SOL.\n" +
        "You get (claim hours ÷ 24 of base daily cap — Rush or 1,000; boosts not included):\n" +
        "• Common      2h → 6h\n" +
        "• Rare        8h → 12h\n" +
        "• Epic       14h → 18h\n" +
        "• Legendary  20h → 24h (full base daily at L5)\n" +
        "• 1 Star Badge socket\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "LEVEL UP (Backpack → NFT)\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Raise elf level in Backpack → NFT (max L5) with $G2U.\n\n" +
        "Fate · Echo · Rush · Shadow — same $G2U for every rarity:\n" +
        "• L1→2 75,000 · L2→3 150,000 · L3→4 225,000 · L4→5 300,000 $G2U\n" +
        "  (total 750,000 $G2U L1→5)\n\n" +
        "GiftLocksmith (mint 0.10 = L1) — fixed $G2U ladder:\n" +
        "• L1→2 250,000 · L2→3 750,000 · L3→4 1,500,000 · L4→5 2,500,000 $G2U\n\n" +
        "Star Badge (one Star · all rarities; mint 0.10):\n" +
        "• L1→2 0.10 · L2→3 0.15 · L3→4 0.25 · L4→5 0.40  · total 0.90 SOL\n\n" +
        "Durability (Echo · Fate · Rush · Shadow): 1% per 2,000 mining shards; reload 50 $G2U per 1%. At 0% the perk is off.\n\n" +
        "Airdrop tip: Locksmith +25% weight; each other elf adds by rarity (Common +5% · Rare +10% · Epic +20% · Legendary +30%). Clear Level 5 to appear on Ranks → Airdrop.\n\n" +
        "NFTs are optional gameplay items. No return is promised.",
    },
    {
      id: 5,
      title: "5. Shop: Shards, Boosts & NFTs",
      content: "Gift Shop has four areas:\n\n• Free (Shards) — 30-Second Frenzy (2× shards), Expanded Battery (+500 max daily taps until UTC midnight), Instant Refill (fills energy pool). Frenzy & Battery: once per UTC day. After token launch: Instant Refill also once per UTC day on the free path; extra refills via Premium ($G2U) using the same Instant Refill activate.\n• Premium (Boosts) — SOL / $G2U temporary boosts (bots, contracts, power multipliers). These are NOT NFTs.\n• NFTs — on-chain Wave 1 mints LIVE: Locksmith · Fate · Echo · Rush · Shadow. Permanent utility.\n• Backpack — activate temporary items; Elves live in your game wallet. Level up Elves in Backpack → NFT.\n\nThe core game stays free-to-play. Purchases are optional."
    },
    {
      id: 6,
      title: "6. Wallet Swap ($G2U)",
      content: "Open Wallet → Swap to trade SOL and other tokens for $G2U with Jupiter in your game wallet.\n\nYou sign every swap. Network fees apply. Rates move with the market.\n\nNot an investment; no promise of market value."
    },
    {
      id: 7,
      title: "7. Wallet & Disclaimers",
      content: "A Solana wallet is created for you in Gift Tap. You own the keys. Save your 12-word phrase in Menu — we cannot restore lost keys.\n\nPurchases (boosts, NFTs, wall climbs with shards+$G2U) use your game wallet on mainnet. Network fees apply.\n\nIMPORTANT — NOT AN INVESTMENT:\n• G2Ushards and $G2U are not investment products. No promise of profit, yield, or price.\n• Crypto is volatile. Gift2u is not responsible for price changes of $G2U, SOL, NFTs, or any asset.\n• This is not financial advice. See Terms of Use in the Menu.\n\nComing from Telegram? Use Restore with your 12-word phrase."
    },
    {
      id: 8,
      title: "8. Referrals (Invite Friends)",
      content: "Grow the Gift Tap community with invite links from the Friends tab.\n\nJoiner bonus:\n• New players who join with your link receive +500 G2Ushards when they start.\n\nReferrer bonuses (you earn these — not paid on mere join):\n• +1,000 G2Ushards when your friend reaches Level 1 (10,000 lifetime taps).\n• +3,000 G2Ushards when your friend clears the first Ascension Wall (Level 4 → Level 5) — paid climb (shards+$G2U) or Locksmith free climb.\n\nEach milestone is paid once per invited friend. Mining fake accounts is banned under the Code of Conduct."
    },
    {
      id: 9,
      title: "9. Leaderboards (Ranks)",
      content:
        "Open Ranks from the bottom nav (or Menu → Ranks). Three boards:\n\n" +
        "WEEKLY\n" +
        "• Ordered by your mining score this UTC week (resets every Monday 00:00 UTC).\n" +
        "• Eligible players (≥1,400 weekly score) each win a badge when the week freezes (claim in Shop → BackPack → Badges):\n" +
        "  from W36: top 5% Diamond · next 10% Gold · next 15% Silver · rest Bronze.\n" +
        "• Winners freeze automatically at week end; the new week starts on its own.\n" +
        "• Burn badges in Pack for Mystery Gift (costs & full odds: § 11 Mystery Gift).\n\n" +
        "SEASON (monthly)\n" +
        "• Ordered by season mining score for the current season period shown in-app.\n" +
        "• Ranks / prestige only for now (no season badges).\n" +
        "• Main board uses a rising activity floor (~20% of 1,000 taps/day × day of season). Under the floor you still see your rank on the last line.\n\n" +
        "ALL-TIME\n" +
        "• Ordered by lifetime taps. Always on — long-term prestige, no monthly reset.\n\n" +
        "AIRDROP (Ranks → Airdrop)\n" +
        "• Shows players who cleared Level 5 (name · level · bonus %).\n" +
        "• Bonus % from levels, lifetime taps, streak, IAP, Elves NFTs, and referrals.\n" +
        "• Community weight board — not a weekly/season $G2U pool.\n" +
        "• How to claim personal milestone / L5 $G2U: see § 10 Airdrop & Claim $G2U.\n\n" +
        "Fair play: multi-accounts and bots can be disqualified. See Code of Conduct.",
    },
    {
      id: 10,
      title: "10. Airdrop & Claim $G2U",
      content:
        "You need a little SOL in your game wallet to claim (you pay the Solana network fee).\n\n" +
        "Claim $G2U in your game wallet — Wallet → Claim $G2U (unlock wallet first).\n\n" +
        "PERSONAL MILESTONES (main $G2U path)\n" +
        "• Same goal, same reward for everyone — stacked into one Claim $G2U row.\n" +
        "• Level rewards: 250 $G2U per 1,000 taps of that level’s XP goal\n" +
        "  (e.g. L0–4: 10,000 taps → 2,500 $G2U per level cleared).\n" +
        "• Extra lifetime bonuses (on top of level rewards), e.g.:\n" +
        "  50K / 100K → 2,500 each · 150K → 5,000 · 200K → 10,000 · … ·\n" +
        "  1M → 65,000 · 1.25M → 80,000 · 1.5M → 95,000 · 1.75M → 110,000 · 2M → 125,000.\n" +
        "• Open the home Milestones list to see every tier and your progress.\n" +
        "• No weekly board pool and no season board pool for $G2U.\n\n" +
        "L5 airdrop (Ranks → Airdrop)\n" +
        "• Separate allocation when you clear Level 5.\n" +
        "• Bonus % from progress / Elves can raise your weight on that board.\n\n" +
        "Weekly board still awards badges (not a $G2U pool). Season board is ranks only.\n" +
        "Not financial advice; amounts and rules can change for fair play.",
    },
    {
      id: 11,
      title: "11. Mystery Gift (badge burn)",
      content:
        "Open Shop → Pack → Badges. Burn weekly rank badges to open Mystery Gift (one tier per open).\n\n" +
        "Burn cost (single tier):\n" +
        "• 2 Diamond · 3 Gold · 4 Silver · 5 Bronze\n\n" +
        "Weekly badges (Ranks → Weekly, after week freezes):\n" +
        "• Diamond = top 10% · Gold = next 15% · Silver = next 25% · Bronze = rest eligible\n\n" +
        "DROP RATES by badge tier burned (each column = 100%):\n\n" +
        "Prize                  Bronze         Silver      Gold       Diamond\n" +
        "Premium Boost           20%            25%        45%         75%\n" +
        "Free Boost              35%            35%        35%         20%\n" +
        "G2Ushards (Bulk)        45%            40%        20%          5%\n\n" +
        "No $G2U token and no NFT from Mystery Gift.\n" +
        "Free Boost splits: Frenzy / Expanded Battery / Instant Refill (~⅓ each).\n" +
        "Premium Boost splits (sum 100%):\n" +
        "• Weekend Bot 2.5%\n" +
        "• +2K: 1d 6% · 3d 4% · 7d 2.5%\n" +
        "• +5K: 1d 4% · 3d 2% · 7d 0.5%\n" +
        "• x2: 1d 5.5% · 3d 3% · 7d 1%\n" +
        "• x3: 1d 4% · 3d 1.5% · 7d 0.5%\n" +
        "• Expanded Energy: 1d 15% · 3d 9% · 7d 6%\n" +
        "• Frenzy 9% · +1000 Max Daily 9% · Instant Refill 15%\n" +
        "Timed premiums queue the rolled 1/3/7 days for activate.\n" +
        "G2Ushards → shard_balance: Diamond 30,000 · Gold 20,000 · Silver 10,000 · Bronze 5,000\n\n" +
        "G2Ushards bulk credits mining balance immediately.\n\n" +
        "Independent roll per open. Not financial advice; prizes can change for balance/fair play.",
    },
    {
      id: 12,
      title: "12. NFT durability & premium $G2U",
      content:
        "Echo, Fate, Rush, and Shadow start at 100% durability when equipped.\n\n" +
        "Drain: 1% per 2,000 mining shards. At 0% the perk is fully off (no weak floor).\n\n" +
        "Reload: 50 $G2U per 1% in Wallet / Backpack → NFT (same card everywhere).\n\n" +
        "Premium boosts (bot, grinder, whale, x2, x3, crate) are bought with $G2U.\n" +
        "Shard shop items (frenzy, battery, refill) stay on G2Ushards.",
    },
    {
      id: 13,
      title: "13. Code of Conduct",
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
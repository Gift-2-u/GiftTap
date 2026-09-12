/**
 * Short in-game help copy for HelpTip (?) circles.
 * Keep plain and non-investment language.
 */

export const HELP_TIPS = {
  how_to_play: {
    title: 'How to play',
    body:
      'Tap the gift to mine G2Ushards. Each tap costs Energy and counts toward your Daily Limit.\n\n' +
      'Level rises with lifetime taps and can raise your mining power. Walls (Climb / Level up) are optional — you can stay on a level and keep mining forever.\n\n' +
      'Shop boosts and Gift2u Elves NFTs (Locksmith · Fate · Echo · Rush · Shadow) are optional. Mint in Shop → NFTs. Full boards: Menu → Game Guide → Gift2u Elves.',
  },
  /** Level + G2Ushards (one ? on home) */
  level_shards: {
    title: 'Level & G2Ushards',
    body:
      'Level comes from lifetime taps and can raise permanent mining power (more shards per tap).\n\n' +
      'G2Ushards are what you mine by tapping. Spend them in the Shop and on climb fees (walls also need $G2U).\n\n' +
      'Optional Climb walls unlock higher levels and multipliers — you can stay and keep mining without climbing.\n\n' +
      'G2Ushards are not money and not a promise of profit. Full details: Menu → Game Guide.',
  },
  /** Energy + Daily Limit (one ? on home) */
  energy_daily: {
    title: 'Energy & Daily Limit',
    body:
      'Energy (⚡ 500 pool): each tap costs Energy (usually 1). Recharges ~1 every 1.5s. Frenzy boosts shards 2× — it does not drain battery 2× (Heavy Hands does).\n\n' +
      'Daily Limit: max taps for the UTC day (separate bar). When full, wait for UTC reset or use a boost.\n\n' +
      'Full details: Menu → Game Guide.',
  },
  level: {
    title: 'Level & taps',
    body:
      'Your level comes from lifetime taps (total mining history). Levels go up to 100.\n\n' +
      'Permanent mining mult: 1.00x (L0–4) → 1.15x → 1.20x → 1.30x → 1.40x → 1.50x → 1.75x → 2.00x (L100).\n\n' +
      'The bar shows progress to the next level — unless you are at an optional Climb wall.\n\n' +
      'Full table: Menu → Game Guide.',
  },
  climb: {
    title: 'Climb / Level up',
    body:
      'Optional walls at levels 4, 9, 19, 29, 49, 74, and 99.\n\n' +
      '• Stay & mine: keep earning G2Ushards forever at your current level.\n' +
      '• Every wall: pay G2Ushards AND fixed $G2U (both required).\n' +
      '• Costs (shards + $G2U): 15k+10k · 30k+25k · 50k+75k · 100k+300k · 300k+1M · 800k+2.5M · 2.5M+5M.\n' +
      '• GiftLocksmith can climb for free (by Locksmith level). Paying the fee = mult only (no shoe).\n' +
      '• Climb unlocks higher levels and a better permanent multiplier.\n\n' +
      'Full table: Menu → Game Guide. Climb is never required to keep mining.',
  },
  shards: {
    title: 'G2Ushards',
    body:
      'G2Ushards are the in-game mining currency you earn by tapping the gift.\n\n' +
      'Use them in the Shop, for climb fees (with $G2U), and for tasks.\n\n' +
      'They are not money and not a promise of profit. See Terms of Use.',
  },
  energy: {
    title: 'Energy',
    body:
      'Every tap spends Energy (usually 1).\n\n' +
      'Your Energy pool recharges over time (about 1 every 1.5 seconds, up to the pool max).\n\n' +
      'Premium ($G2U) boosts can refill or expand Energy. Free Energy ads raise daily capacity.',
  },
  daily_limit: {
    title: 'Daily Limit',
    body:
      'This is how many taps you can do today before the limit resets (UTC day).\n\n' +
      'Base limit can be raised with Free Energy ads, Premium ($G2U) boosts, or other bonuses.\n\n' +
      'When you hit the max, wait for reset, watch an ad, or use a Premium / backpack boost if you have one.',
  },
  free_energy: {
    title: 'Free Energy',
    body:
      'Watch a short ad to add temporary Energy capacity for the day.\n\n' +
      'There is a daily cap on how many Free Energy ads you can use. Keep the app open until the ad timer finishes.',
  },
  swap: {
    title: 'Shard Swap',
    body:
      'Convert G2Ushards to G2U credit in Wallet then Shard.\n\n' +
      'Free path: Level 5+ AND Swap Badge (durability drains by volume; top up and level up with G2U).\n\n' +
      'Rates and caps can change. Not financial advice.',
  },
  swap_badge: {
    title: 'Swap Badge (free)',
    body:
      'Unlock a Swap Badge at Level 5+ for 25,000 G2Ushards (Wallet then Shard).\n\n' +
      'Charge 0-100 percent: drains by swap volume. Higher badge level means more shards per 1 percent so the charge lasts longer. Level up with G2U. Top up charge with G2U (1 G2U gives +2 percent). Daily cap 50,000 shards.\n\n' +
      'Not an investment product.',
  },
  locksmith: {
    title: 'GiftLocksmith NFT',
    body:
      'Optional on-chain NFT in Shop → NFTs (Wave 1 live · mint 0.10 SOL = L1).\n\n' +
      'Free wall climbs by Locksmith level:\n' +
      '• L1 → walls 5 / 10 / 20\n' +
      '• L2 → wall 30 · L3 → 50 · L4 → 75 · L5 → 100\n\n' +
      'Common Walk2u Shoe only on Locksmith free climbs of walls 5 / 30 / 50 (not on paid climbs).\n\n' +
      'Level up Locksmith in Backpack → NFT with fixed $G2U: L1→2 250k · L2→3 750k · L3→4 1.5M · L4→5 2.5M.\n\n' +
      'Full boards: Menu → Game Guide → Gift2u Elves. You can play without it.',
  },
  elves_nfts: {
    title: 'Gift2u Elves',
    body:
      'Wave 1 LIVE in Shop → NFTs.\n\n' +
      'Mint W1: Common 0.05 · Rare 0.30 · Epic 0.75 · Legendary 1.50 SOL ' +
      '(Locksmith 0.10).\n\n' +
      '• Locksmith — free walls by level · shoe on walls 5 / 30 / 50\n' +
      '• Fate — luck jackpots on taps\n' +
      '• Echo — always-on tap multi (up to 3.00×)\n' +
      '• Rush — higher max daily taps (up to 3,000)\n' +
      '• Shadow — daily claim without tapping\n\n' +
      'Level up in Backpack → NFT ($G2U):\n' +
      '• Fate/Echo/Rush/Shadow (all rarities): L2 75k · L3 150k · L4 225k · L5 300k\n' +
      '• Locksmith: L2 250k · L3 750k · L4 1.5M · L5 2.5M\n' +
      'Durability (Echo/Fate/Rush/Shadow): 1% / 2,000 mining shards · reload 50 $G2U per 1%.\n\n' +
      'Full boards + prices: Menu → Game Guide → Gift2u Elves NFTs.',
  },
  mystery_gift: {
    title: 'Mystery Gift',
    body:
      'Burn weekly badges in Shop → Pack → Badges.\n\n' +
      'Cost: 2 Diamond / 3 Gold / 4 Silver / 5 Bronze per open.\n\n' +
      'Prizes: Premium Boost, Free Boost, or G2Ushards (no $G2U, no NFT).\n' +
      'Higher-tier badges → better Premium odds (Diamond: 75% Premium / 20% Free / 5% shards).\n' +
      'Premium sub-roll includes 1/3/7-day timed boosts, Frenzy, +1000 Max Daily, Refill.\n' +
      'G2Ushards bulk: D 30k · G 20k · S 10k · B 5k → mining balance.\n\n' +
      'Full drop table: Menu → Game Guide → Mystery Gift.',
  },
  nft_durability: {
    title: 'NFT durability',
    body:
      'Echo, Fate, Rush, and Shadow start at 100% durability when owned in wallet/backpack. Attributes apply automatically (highest of each kind) — no equip step.\n\n' +
      'Drains 1% per 2,000 mining shards. At 0% the perk is fully off.\n\n' +
      'Reload with $G2U in Wallet / Backpack → NFT (50 G2U per 1%).\n\n' +
      'Premium boosts are bought with $G2U. Free Energy capacity comes from ads on the tap screen.',
  },
  weekly_badges: {
    title: 'Weekly badges',
    body:
      'Ranks → Weekly uses the same 20% activity idea as Season.\n\n' +
      'Main board floor = 20% × 1,000 × day of the UTC week (day 1 Mon = 200 … day 7 = 1,400).\n\n' +
      'At week end, players with ≥ 1,400 weekly score are badge-eligible.\n\n' +
      'Every eligible player wins a badge. Small board (≤4): #1 Diamond · #2 Gold · #3 Silver · #4 Bronze. From 2026-W36: top 5% Diamond, next 10% Gold, next 15% Silver, rest Bronze (W35 used 10% / 15% / 25%).\n\n' +
      'Claim finished-week badges in Shop → Pack → Badges. Burn badges there for Mystery Gift.\n\n' +
      'In-game Badge market: sell badges from your backpack for SOL now (G2U token after launch — not G2Ushards). Listing escrows the badge. 5% fee to treasury (seller receives 95%). No external marketplaces.\n\n' +
      'Owned GiftLocksmith NFTs: Shop → NFTs or Pack → NFT → NFT market. List for SOL, buyer pays 95% to you + 5% treasury, then you tap Send NFT to transfer on-chain.\n\n' +
      'Full rules: Menu → Game Guide → Leaderboards.',
  },
  airdrop_claim: {
    title: 'Airdrop & Claim $G2U',
    body:
      'You need a little SOL in your game wallet to claim (you pay the Solana network fee).\n\n' +
      'Claim $G2U in your game wallet (Wallet → Claim $G2U). Unlock the wallet first.\n\n' +
      'PERSONAL MILESTONES: main $G2U path — level clears (250 $G2U per 1,000 taps of that level’s goal) plus lifetime bonuses (50K…2M). Stacked into one claim. Same for everyone.\n\n' +
      'No weekly $G2U pool and no season $G2U pool. Weekly still gives badges; Season is ranks only.\n\n' +
      'L5 airdrop (Ranks → Airdrop): separate allocation when you clear Level 5; bonus % from progress / Elves can raise weight.\n\n' +
      'Not financial advice. Full guide: Menu → Game Guide → Airdrop & Claim $G2U.',
  },
};

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
      'G2Ushards are what you mine by tapping. Spend them in the Shop and on climb fees.\n\n' +
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
      '• Early walls (4, 9): pay shards OR SOL.\n' +
      '• Mid/late walls (19+): pay shards AND SOL.\n' +
      '• Climb unlocks higher levels and a better permanent multiplier.\n\n' +
      'Full costs and mult table: Menu → Game Guide. Climb is never required to keep mining.',
  },
  shards: {
    title: 'G2Ushards',
    body:
      'G2Ushards are the in-game mining currency you earn by tapping the gift.\n\n' +
      'Use them in the Shop, for climb fees, and for tasks.\n\n' +
      'They are not money and not a promise of profit. See Terms of Use.',
  },
  energy: {
    title: 'Energy',
    body:
      'Every tap spends Energy (usually 1).\n\n' +
      'Your Energy pool recharges over time (about 1 every 1.5 seconds, up to the pool max).\n\n' +
      'Shop items can refill or expand Energy. Free Energy ads can raise daily capacity.',
  },
  daily_limit: {
    title: 'Daily Limit',
    body:
      'This is how many taps you can do today before the limit resets (UTC day).\n\n' +
      'Base limit can be raised with ads, shop boosts, or other bonuses.\n\n' +
      'When you hit the max, wait for reset or use a boost if you have one.',
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
      'Optional on-chain NFT in Shop → NFTs (Wave 1 live).\n\n' +
      'Unlocks free ascension wall climbs and Walk2u Common Shoes on walls 5 / 10 / 20 (L1–L3). Higher Locksmith levels unlock later walls.\n\n' +
      'See all Elves (Fate · Echo · Rush · Shadow): Menu → Game Guide → Gift2u Elves.\n\n' +
      'You can still play and mine without it.',
  },
  elves_nfts: {
    title: 'Gift2u Elves',
    body:
      'Wave 1 LIVE in Shop → NFTs.\n\n' +
      'Mint W1: Common 0.05 · Rare 0.30 · Epic 1.00 · Legendary 2.50 SOL ' +
      '(Locksmith 0.10).\n\n' +
      '• Locksmith — free walls · Walk2u shoe\n' +
      '• Fate — luck jackpots on taps\n' +
      '• Echo — always-on tap multi (up to 3.00×)\n' +
      '• Rush — higher max daily taps (up to 3,000)\n' +
      '• Shadow — daily claim without tapping\n\n' +
      'Level up in Backpack → NFT (SOL). Full boards + level-up prices: ' +
      'Menu → Game Guide → Gift2u Elves NFTs.',
  },
  mystery_gift: {
    title: 'Mystery Gift',
    body:
      'Burn weekly badges in Shop → Pack → Badges.\n\n' +
      'Cost: 2 Diamond / 3 Gold / 4 Silver / 5 Bronze per open.\n\n' +
      'Higher-tier badges have better odds (Diamond open: ~2% Exclusive NFT, 55% Bonus G2U).\n' +
      'Bonus G2U: D 50k · G 25k · S 15k · B 5k. G2Ushards (balance): G 15k · S 10k · B 5k.\n' +
      'Bonus G2U and NFT mints are paid from the Mystery vault (10% allocation).\n\n' +
      'Full drop table: Menu → Game Guide → Mystery Gift.',
  },
  nft_durability: {
    title: 'NFT durability',
    body:
      'Echo, Fate, Rush, and Shadow start at 100% durability when owned in wallet/backpack. Attributes apply automatically (highest of each kind) — no equip step.\n\n' +
      'Drains 1% per 1,000 taps. At 0% the perk is fully off.\n\n' +
      'Reload with $G2U in Wallet / Backpack → NFT (1,000 G2U per 1%).\n\n' +
      'After launch, premium boosts are also bought with $G2U.',
  },
  weekly_badges: {
    title: 'Weekly badges',
    body:
      'Ranks → Weekly uses the same 15% activity idea as Season.\n\n' +
      'Main board floor = 15% × 1,000 × day of the UTC week (day 1 Mon = 150 … day 7 = 1,050).\n\n' +
      'At week end, players with ≥ 1,050 weekly score are badge-eligible.\n\n' +
      'Every eligible player wins a badge. Small board (≤4): #1 Diamond · #2 Gold · #3 Silver · #4 Bronze. Larger boards: top 10% Diamond, next 15% Gold, next 25% Silver, rest Bronze.\n\n' +
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
      'WEEKLY airdrop: the weekly $G2U pool is split into 4 equal pots. Top 100 share by tier (equal split inside each pot). Outside top 100: weekly badges / eligibility — not that G2U pot.\n\n' +
      'SEASON (monthly) airdrop: pool (e.g. 1.5M $G2U) is shared by season board weight — your $G2U ≈ pool × (your season shards ÷ sum of all season shards). More season shards → larger share.\n\n' +
      'L5 airdrop (Ranks → Airdrop): separate allocation when you clear Level 5; bonus % from progress / Elves can raise weight.\n\n' +
      'Claims open at token launch. Not financial advice; pools and rules can change for fair play.\n\n' +
      'Full guide: Menu → Game Guide → Airdrop & Claim $G2U.',
  },
};

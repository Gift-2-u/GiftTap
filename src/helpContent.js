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
      'Shop boosts and the GiftLocksmith NFT are optional power-ups. Full details: Menu → Game Guide.',
  },
  /** Level + G2Ushards (one ? on home) */
  level_shards: {
    title: 'Level & G2Ushards',
    body:
      'Level comes from lifetime taps and can raise permanent mining power (more shards per tap).\n\n' +
      'G2Ushards are what you mine by tapping. Spend them in the Shop, on climb fees, and on Swap Badge / swaps.\n\n' +
      'Optional Climb walls unlock higher levels and multipliers — you can stay and keep mining without climbing.\n\n' +
      'G2Ushards are not money and not a promise of profit. Full details: Menu → Game Guide.',
  },
  /** Energy + Daily Limit (one ? on home) */
  energy_daily: {
    title: 'Energy & Daily Limit',
    body:
      'Energy: each tap costs Energy (usually 1). Your pool recharges over time (about 1 every 1.5 seconds, up to the pool max). Shop items and Free Energy ads can help.\n\n' +
      'Daily Limit: max taps for the UTC day. The bar under Energy shows progress. When full, wait for reset or use a boost.\n\n' +
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
      'Use them in the Shop, for climb fees, tasks, and (when unlocked) Shard Swap into G2U credit.\n\n' +
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
      'Free path: Level 5+ AND Swap Badge (durability drains by volume; top up and level up with G2U).\n' +
      'GiftLocksmith NFT: unlock immediately with a lower fee and higher daily cap.\n\n' +
      'Rates and caps can change. Not financial advice.',
  },
  swap_badge: {
    title: 'Swap Badge (free)',
    body:
      'Free players unlock a Swap Badge at Level 5+ for 25,000 G2Ushards (Wallet then Shard).\n\n' +
      'Charge 0-100 percent: drains by swap volume. Higher badge level means more shards per 1 percent so the charge lasts longer. Level up with G2U. Top up charge with G2U (1 G2U gives +2 percent). Daily cap 50,000 shards.\n\n' +
      'GiftLocksmith is the permanent on-chain NFT. On-chain mint and marketplace for free badges is planned later.\n\n' +
      'Not an investment product.',
  },
  locksmith: {
    title: 'GiftLocksmith NFT',
    body:
      'Optional on-chain NFT in Shop then NFTs.\n\n' +
      'Unlocks Shard Swap right away (no L5 + Swap Badge grind), better swap fees, higher caps, and vault access on the main site.\n\n' +
      'You can still play and mine without it.',
  },
  mystery_gift: {
    title: 'Mystery Gift',
    body:
      'Burn weekly badges in Shop → Pack → Badges.\n\n' +
      'Cost: 3 Diamond / 4 Gold / 5 Silver / 10 Bronze per open.\n\n' +
      'Higher-tier badges have better odds (Diamond open: 12% Exclusive NFT, 50% Bonus G2U Tokens).\n\n' +
      'Full drop table: Menu → Game Guide → Mystery Gift.',
  },
  weekly_badges: {
    title: 'Weekly badges',
    body:
      'Ranks → Weekly is a normal leaderboard (UTC week score). Top 10 at week end get one badge: Diamond #1, Gold #2, Silver #3, Bronze #4–10.\n\n' +
      'Claim finished-week badges in Shop → Pack → Badges. Burn badges there for Mystery Gift.\n\n' +
      'Full rules: Menu → Game Guide → Leaderboards.',
  },
};

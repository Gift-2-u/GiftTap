/**
 * Short in-game help copy for HelpTip (?) circles.
 * Keep plain and non-investment language.
 */

export const HELP_TIPS = {
  how_to_play: {
    title: 'How to play',
    body:
      'Tap the gift to mine GFTshards. Each tap costs Energy and counts toward your Daily Limit.\n\n' +
      'Level rises with lifetime taps and can raise your mining power. Walls (Climb / Level up) are optional — you can stay on a level and keep mining forever.\n\n' +
      'Shop boosts and the GiftLocksmith NFT are optional power-ups. Full details: Menu → Game Guide.',
  },
  level: {
    title: 'Level & taps',
    body:
      'Your level comes from lifetime taps (total mining history).\n\n' +
      'Higher levels can unlock a stronger permanent tap multiplier (more shards per tap).\n\n' +
      'The bar shows progress to the next level — unless you are at a Climb wall, where Level up is optional.',
  },
  climb: {
    title: 'Climb / Level up',
    body:
      'At some levels (4, 9, 19, 29, 49) you hit an optional wall.\n\n' +
      '• Stay & mine: keep earning GFTshards at your current level forever.\n' +
      '• Climb: pay a shard fee (or SOL) to unlock higher levels and a better multiplier.\n\n' +
      'Climb is never required to keep playing or mining.',
  },
  shards: {
    title: 'GFTshards',
    body:
      'GFTshards are the in-game mining currency you earn by tapping the gift.\n\n' +
      'Use them in the Shop, for climb fees, tasks, and (when unlocked) Shard Swap into GFT credit.\n\n' +
      'They are not money and not a promise of profit. See Terms of Use.',
  },
  energy: {
    title: 'Energy',
    body:
      'Every tap spends Energy (usually 1).\n\n' +
      'Your Energy pool recharges over time (about 1 every 3 seconds, up to the pool max).\n\n' +
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
      'Convert GFTshards → GFT credit in Wallet → Shard.\n\n' +
      'Free path: Level 10+ AND a one-time shard license (higher fee).\n' +
      'GiftLocksmith NFT: unlock immediately with a lower fee and higher daily cap.\n\n' +
      'Rates and caps can change. Not financial advice.',
  },
  locksmith: {
    title: 'GiftLocksmith NFT',
    body:
      'Optional on-chain NFT in Shop → NFTs.\n\n' +
      'Unlocks Shard Swap right away (no L10 + license grind), better swap fees, higher caps, and vault access on the main site.\n\n' +
      'You can still play and mine without it.',
  },
};

/**
 * Gift2U public roadmap — edit this file with your real plans.
 * Used by:
 *   - /roadmap (website)
 *   - Menu → Roadmap (in-game modal)
 *
 * Tips:
 *   - status: 'done' | 'now' | 'next' | 'later'
 *   - Keep items short; link to whitepaper for deep detail
 */

export const ROADMAP_META = {
  title: 'Gift2U Roadmap',
  subtitle:
    'Where we’re going — tap game, shards, NFTs, vault & more.',
  lastUpdated: '',
  disclaimer:
    'Roadmap is a plan, not a promise. Features, prices, and timing can change. Not financial advice.',
};

/** @type {{ id: string, title: string, status: 'done'|'now'|'next'|'later', items: string[] }[]} */
export const ROADMAP_PHASES = [
  {
    id: 'live',
    title: 'Phase 1 & 2 (done)',
    status: 'Q1-Q2',
    items: [
      'Gift2u & GiftTap core loop (tap, energy, levels, walls)',
      'Gift Shop: free (shards), premium (SOL),NFT, backpack',
      'GiftLocksmith NFT mint (Wave 1) + Swap Access Card',
      // Add more “already shipped” bullets here
    ],
  },
  {
    id: 'now',
    title: 'Phase 3',
    status: 'Q3',
    items: [
      'August Season: Testing the database, level mechanics & NFT prizes',
      'Gift2u Elves NFT creation: metadata + mint contract deployment',
      'Game wallet + Seeker APK (ads + wallet connect)',
      // Replace these TODOs
    ],
  },
  {
    id: 'next',
    title: 'Phase 4',
    status: 'Q4',
    items: [
      'NFTs / marketplace listings',
      'vault / APY details for Locksmith holders & staking for G2U holders',
      '$G2U token launch',
      // Replace these TODOs
    ],
  },
  {
    id: 'later',
    title: 'Phase 5',
    status: 'later',
    items: [
      'New Game Mode: Expanding the core game loop with interactive gameplay modes currently in development. ',
      'Cross-Platform Ecosystem Integration: Deploying hybrid mechanics that bridge dual gameplay functions.',
      'Automated Deflationary Engine: Smart contracts utilizing ecosystem revenue for scheduled buybacks and burns to permanently reduce supply.',
      // Replace these TODOs
    ],
  },
];

export const STATUS_LABEL = {
  done: 'Done',
  now: 'Now',
  next: 'Next',
  later: 'Later',
};

export const STATUS_COLOR = {
  done: '#4ade80',
  Q3: '#fbef43',
  Q4: '#a78bfa',
  later: '#888',
};

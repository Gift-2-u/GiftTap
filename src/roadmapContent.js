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
  lastUpdated: '2026-08-19',
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
      'Gift Shop: free (shards), premium (SOL), NFT, backpack',
      'GiftLocksmith NFT mint (Wave 1) + Swap Access Card',
    ],
  },
  {
    id: 'now',
    title: 'Phase 3 (Now)',
    status: 'Q3',
    items: [
      'August Season: Testing the database, level mechanics & NFT prizes',
      'Gift2u Elves Wave 1 LIVE to mint in Shop → NFTs (Locksmith · Fate · Echo · Rush · Shadow)',
      'In-game NFT market (SOL) + collection art for Gift2u Elves',
      'Airdrop board in Ranks (L5 qualify · name / lvl / %)',
      'Game wallet + Seeker APK (ads + wallet connect)',
    ]
  },
  {
    id: 'next',
    title: 'Phase 4',
    status: 'Q4',
    items: [
      'Vault for Locksmith holders & $G2U staking (gameplay features)',
      '$G2U public trading / liquidity (mint already created)',
      'Magic Eden collection page when waves are fully minted',
    ],
  },
  {
    id: 'later',
    title: 'Phase 5',
    status: 'later',
    items: [
      'New game modes expanding the core loop',
      'Cross-platform ecosystem integrations',
      'In-game economy tools (buybacks / burns as game design)',
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

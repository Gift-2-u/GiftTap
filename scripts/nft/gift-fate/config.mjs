/**
 * Fate mint config — locked prices & supplies.
 * Legendary W1–W3: 1.75 / 3.00 / 4.50 SOL
 */
export const FATE_TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';

/**
 * Gift2u Elves Core collection (same as GiftLocksmith Gen 1).
 * Every Fate mint (including test/first) joins this collection.
 */
export const GIFT2U_ELVES_COLLECTION =
  'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';

/** 5% secondary royalties (500 bps) on every asset — including first mint */
export const ROYALTY_BPS = 500;

export const WAVE_SHARE = { 1: 0.3, 2: 0.4, 3: 0.3 };

export const FATE_RARITIES = {
  common: {
    key: 'common',
    label: 'Common',
    border: '#C0C0C0',
    supply: 17500,
    prices: { 1: 0.05, 2: 0.1, 3: 0.15 },
    levelUpSol: [0.03, 0.05, 0.08, 0.12],
    levelUpTotal: 0.28,
  },
  rare: {
    key: 'rare',
    label: 'Rare',
    border: '#3B82F6',
    supply: 5250,
    prices: { 1: 0.2, 2: 0.35, 3: 0.5 },
    levelUpSol: [0.1, 0.15, 0.25, 0.4],
    levelUpTotal: 0.9,
  },
  epic: {
    key: 'epic',
    label: 'Epic',
    border: '#A855F7',
    supply: 1750,
    prices: { 1: 0.8, 2: 1.25, 3: 1.75 },
    levelUpSol: [0.25, 0.4, 0.65, 1.0],
    levelUpTotal: 2.3,
  },
  legendary: {
    key: 'legendary',
    label: 'Legendary',
    border: '#EAB308',
    supply: 500,
    prices: { 1: 1.75, 2: 3.0, 3: 4.5 },
    levelUpSol: [0.6, 0.8, 1.3, 2.0],
    levelUpTotal: 4.7,
  },
};

export function waveItems(rarityKey, wave) {
  const r = FATE_RARITIES[rarityKey];
  if (!r) throw new Error(`Unknown rarity: ${rarityKey}`);
  const w = Number(wave);
  if (![1, 2, 3].includes(w)) throw new Error('Wave must be 1, 2, or 3');
  const share = WAVE_SHARE[w];
  return Math.round(r.supply * share);
}

export function wavePrice(rarityKey, wave) {
  const r = FATE_RARITIES[rarityKey];
  if (!r) throw new Error(`Unknown rarity: ${rarityKey}`);
  const p = r.prices[Number(wave)];
  if (p == null) throw new Error(`No price for ${rarityKey} wave ${wave}`);
  return p;
}

/** Fee buffer for mint attempts (rent + botTax + slack) — same idea as Locksmith */
export const FEE_BUFFER_SOL = 0.02;

export function minSolForMint(rarityKey, wave) {
  return wavePrice(rarityKey, wave) + FEE_BUFFER_SOL;
}

/**
 * Echo mint config — draft prices & supplies (Fate parity until approved).
 */
export const ECHO_TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';

export const GIFT2U_ELVES_COLLECTION =
  'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';

export const ROYALTY_BPS = 500;

export const WAVE_SHARE = { 1: 0.3, 2: 0.4, 3: 0.3 };

/** Echo tap multiplier: [level1..level5] per rarity */
export const ECHO_MULTI = {
  common: [1.1, 1.2, 1.3, 1.4, 1.5],
  rare: [1.6, 1.7, 1.8, 1.9, 2.0],
  epic: [2.1, 2.2, 2.3, 2.4, 2.5],
  legendary: [2.6, 2.7, 2.8, 2.9, 3.0],
};

export function echoMultiplier(rarityKey, level = 1) {
  const ladder = ECHO_MULTI[rarityKey] || ECHO_MULTI.common;
  const idx = Math.min(5, Math.max(1, Math.floor(Number(level) || 1))) - 1;
  return ladder[idx];
}

export const ECHO_RARITIES = {
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
  const r = ECHO_RARITIES[rarityKey];
  if (!r) throw new Error(`Unknown rarity: ${rarityKey}`);
  const w = Number(wave);
  if (![1, 2, 3].includes(w)) throw new Error('Wave must be 1, 2, or 3');
  return Math.round(r.supply * WAVE_SHARE[w]);
}

export function wavePrice(rarityKey, wave) {
  const r = ECHO_RARITIES[rarityKey];
  if (!r) throw new Error(`Unknown rarity: ${rarityKey}`);
  const p = r.prices[Number(wave)];
  if (p == null) throw new Error(`No price for ${rarityKey} wave ${wave}`);
  return p;
}

export const FEE_BUFFER_SOL = 0.02;

export function minSolForMint(rarityKey, wave) {
  return wavePrice(rarityKey, wave) + FEE_BUFFER_SOL;
}

export const ECHO_DESCRIPTION =
  "Echo is the Power elf of the Gift2u Elves. Equip one Echo per wallet. Echo multiplies every tap’s G2Ushards by its rarity and level (up to 3.00× on Legendary L5).";

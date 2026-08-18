/**
 * Rush mint config — daily limit ladder + Fate/Echo parity prices (draft).
 */
export const RUSH_TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';
export const GIFT2U_ELVES_COLLECTION =
  'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';
export const ROYALTY_BPS = 500;
export const WAVE_SHARE = { 1: 0.3, 2: 0.4, 3: 0.3 };
export const FEE_BUFFER_SOL = 0.02;

/** Max daily taps by rarity × level (1..5). Base without Rush = 1000. */
export const RUSH_DAILY_LIMIT = {
  common: [1100, 1200, 1300, 1400, 1500],
  rare: [1600, 1700, 1800, 1900, 2000],
  epic: [2100, 2200, 2300, 2400, 2500],
  legendary: [2600, 2700, 2800, 2900, 3000],
};

export function rushDailyLimit(rarityKey, level = 1) {
  const ladder = RUSH_DAILY_LIMIT[String(rarityKey || '').toLowerCase()];
  if (!ladder) return 1000;
  const idx = Math.min(5, Math.max(1, Math.floor(Number(level) || 1))) - 1;
  return ladder[idx] || 1000;
}

export const RUSH_RARITIES = {
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
  const r = RUSH_RARITIES[rarityKey];
  if (!r) throw new Error(`Unknown rarity: ${rarityKey}`);
  const w = Number(wave);
  if (![1, 2, 3].includes(w)) throw new Error('Wave must be 1, 2, or 3');
  return Math.round(r.supply * WAVE_SHARE[w]);
}

export function wavePrice(rarityKey, wave) {
  const r = RUSH_RARITIES[rarityKey];
  if (!r) throw new Error(`Unknown rarity: ${rarityKey}`);
  const p = r.prices[Number(wave)];
  if (p == null) throw new Error(`No price for ${rarityKey} wave ${wave}`);
  return p;
}

export const RUSH_DESCRIPTION =
  "Rush is the Energy elf of the Gift2u Elves. Equip one Rush per wallet. Rush raises your max daily taps by rarity and level (up to 3,000 on Legendary L5).";
